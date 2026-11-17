import { afterEach, describe, expect, it, vi } from "vitest";
import { JUNTAR_ATE_MS, leiturasEmVoo, lerPartilhado } from "./leitura-partilhada";

function respostaDepois(corpo: unknown, status = 200) {
  let soltar!: () => void;
  const pronta = new Promise<void>((r) => (soltar = r));
  const fetchFalso = vi.fn(async () => {
    await pronta;
    return new Response(JSON.stringify(corpo), { status });
  });
  return { fetchFalso, soltar };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("lerPartilhado", () => {
  it("dois GET iguais em voo saem para a rede uma vez, e cada um lê o seu corpo", async () => {
    const { fetchFalso, soltar } = respostaDepois({ ok: 1 });
    vi.stubGlobal("fetch", fetchFalso);
    const a = lerPartilhado("/api/x", { cache: "no-store" });
    const b = lerPartilhado("/api/x", { cache: "no-store" });
    expect(leiturasEmVoo()).toBe(1);
    soltar();
    const [ra, rb] = await Promise.all([a, b]);
    expect(await ra.json()).toEqual({ ok: 1 });
    expect(await rb.json()).toEqual({ ok: 1 });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(leiturasEmVoo()).toBe(0);
  });

  it("depois de a resposta chegar, o pedido seguinte vai outra vez ao servidor (não há cache)", async () => {
    const fetchFalso = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchFalso);
    await (await lerPartilhado("/api/y")).json();
    await (await lerPartilhado("/api/y")).json();
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("opções de cache diferentes não se juntam", async () => {
    const fetchFalso = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchFalso);
    await Promise.all([lerPartilhado("/api/z"), lerPartilhado("/api/z", { cache: "no-store" })]);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("escritas e pedidos com sinal nunca se juntam", async () => {
    const fetchFalso = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchFalso);
    await Promise.all([
      lerPartilhado("/api/w", { method: "PUT", body: "1" }),
      lerPartilhado("/api/w", { method: "PUT", body: "1" }),
      lerPartilhado("/api/w", { signal: new AbortController().signal }),
      lerPartilhado("/api/w", { signal: new AbortController().signal }),
    ]);
    expect(fetchFalso).toHaveBeenCalledTimes(4);
    expect(leiturasEmVoo()).toBe(0);
  });

  it("um erro de rede chega a todos os que esperavam, e a entrada sai do mapa", async () => {
    const fetchFalso = vi.fn(async () => {
      throw new TypeError("rede");
    });
    vi.stubGlobal("fetch", fetchFalso);
    const r = await Promise.allSettled([lerPartilhado("/api/e"), lerPartilhado("/api/e")]);
    expect(r.map((x) => x.status)).toEqual(["rejected", "rejected"]);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(leiturasEmVoo()).toBe(0);
  });

  it("um 500 também é partilhado tal e qual (o chamador decide o que fazer)", async () => {
    const { fetchFalso, soltar } = respostaDepois({ error: "x" }, 500);
    vi.stubGlobal("fetch", fetchFalso);
    const a = lerPartilhado("/api/q");
    const b = lerPartilhado("/api/q");
    soltar();
    const [ra, rb] = await Promise.all([a, b]);
    expect([ra.status, rb.status]).toEqual([500, 500]);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("um duplo de resposta sem `clone` passa tal e qual", async () => {
    const duplo = { ok: true, status: 200, json: async () => ({ a: 1 }) } as unknown as Response;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => duplo),
    );
    const r = await lerPartilhado("/api/duplo");
    expect(r).toBe(duplo);
  });

  it("com um chamador só, recebe a resposta original — não se copia nada", async () => {
    const original = new Response("{}");
    const clonar = vi.spyOn(original, "clone");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => original),
    );
    expect(await lerPartilhado("/api/um")).toBe(original);
    expect(clonar).not.toHaveBeenCalled();
  });

  it("não se junta a um pedido preso há mais de JUNTAR_ATE_MS (pode ser anterior a uma escrita)", async () => {
    const { fetchFalso, soltar } = respostaDepois({ v: 1 });
    vi.stubGlobal("fetch", fetchFalso);
    let agora = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => agora);
    const velho = lerPartilhado("/api/preso");
    agora += JUNTAR_ATE_MS + 1;
    const novo = lerPartilhado("/api/preso");
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    soltar();
    await Promise.all([velho, novo]);
  });

  it("dentro da janela, junta-se", async () => {
    const { fetchFalso, soltar } = respostaDepois({ v: 1 });
    vi.stubGlobal("fetch", fetchFalso);
    let agora = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => agora);
    const a = lerPartilhado("/api/junto");
    agora += JUNTAR_ATE_MS - 1;
    const b = lerPartilhado("/api/junto");
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    soltar();
    await Promise.all([a, b]);
  });

  it("opções além do `cache` (cabeçalhos, credenciais) nunca se juntam", async () => {
    const fetchFalso = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchFalso);
    await Promise.all([
      lerPartilhado("/api/h", { headers: { Accept: "text/plain" } }),
      lerPartilhado("/api/h", { headers: { Accept: "application/json" } }),
      lerPartilhado("/api/h", { credentials: "omit" }),
    ]);
    expect(fetchFalso).toHaveBeenCalledTimes(3);
  });

  it('um `method: "GET"` explícito, ou uma opção a `undefined`, junta-se na mesma', async () => {
    const { fetchFalso, soltar } = respostaDepois({});
    vi.stubGlobal("fetch", fetchFalso);
    const a = lerPartilhado("/api/g", { method: "get", cache: "no-store" });
    const b = lerPartilhado("/api/g", { cache: "no-store", signal: undefined });
    soltar();
    await Promise.all([a, b]);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });
});
