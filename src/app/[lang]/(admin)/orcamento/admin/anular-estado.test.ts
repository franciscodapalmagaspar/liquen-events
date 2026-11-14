import { afterEach, describe, expect, it, vi } from "vitest";
import { reporEstadoDoPedido } from "./anular-estado";

const relidas = vi.hoisted(() => ({ n: 0 }));
vi.mock("./percentagem-do-sinal", () => ({
  asPropostasMudaram: () => {
    relidas.n++;
  },
}));

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("reporEstadoDoPedido", () => {
  it("só pede para desfazer a cadeia quando o que se anula é um Ganho", async () => {
    const f = vi.fn(async () => reply(200, { id: "Q" }));
    vi.stubGlobal("fetch", f);
    await reporEstadoDoPedido({ quoteId: "Q", de: "cotado", para: "aceite" });
    await reporEstadoDoPedido({ quoteId: "Q", de: "aceite", para: "rejeitado" });
    const corpos = f.mock.calls.map((c) =>
      JSON.parse(String((c as unknown[])[1] && ((c as unknown[])[1] as RequestInit).body)),
    );
    expect(corpos[0].desfazerGanho).toBe(true);
    expect(corpos[1].desfazerGanho).toBeUndefined();
    expect(corpos[1].status).toBe("aceite");
  });

  it("leva os campos extra no mesmo gesto", async () => {
    const f = vi.fn(async () => reply(200, { id: "Q" }));
    vi.stubGlobal("fetch", f);
    await reporEstadoDoPedido({
      quoteId: "Q",
      de: "cotado",
      para: "aceite",
      extra: { quotedPrice: 0 },
    });
    const corpo = JSON.parse(String(((f.mock.calls[0] as unknown[])[1] as RequestInit).body));
    expect(corpo.quotedPrice).toBe(0);
    expect(corpo.status).toBe("cotado");
  });

  it("atira com a frase do servidor quando ele recusa", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(409, { error: "Conflito." })),
    );
    await expect(
      reporEstadoDoPedido({ quoteId: "Q", de: "cotado", para: "aceite" }),
    ).rejects.toThrow("Conflito.");
  });
});

/** 2.ª revisão de 14/11: anular relê a lista leve de propostas, uma vez, depois do PATCH. */
describe("reporEstadoDoPedido — a lista leve de propostas", () => {
  it("relê-a depois de o PATCH acabar bem", async () => {
    relidas.n = 0;
    let antesDoFim = -1;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        antesDoFim = relidas.n;
        return reply(200, { id: "Q" });
      }),
    );
    await reporEstadoDoPedido({ quoteId: "Q", de: "cotado", para: "aceite" });
    expect(antesDoFim).toBe(0);
    expect(relidas.n).toBe(1);
  });

  it("não a relê quando o servidor recusa, nem com `semReler`", async () => {
    relidas.n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(409, { error: "x" })),
    );
    await expect(
      reporEstadoDoPedido({ quoteId: "Q", de: "cotado", para: "aceite" }),
    ).rejects.toThrow();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200, { id: "Q" })),
    );
    await reporEstadoDoPedido({ quoteId: "Q", de: "cotado", para: "aceite", semReler: true });
    expect(relidas.n).toBe(0);
  });
});
