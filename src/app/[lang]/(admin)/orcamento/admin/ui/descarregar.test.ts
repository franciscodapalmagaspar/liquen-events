// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { FalhaDaDescarga, descarregar, nomeDoFicheiro } from "./descarregar";

/**
 * A descarga da casa: lê o corpo aos pedaços quando a rota diz o tamanho, e
 * cai no `blob()` de sempre quando não diz. Uma resposta que não é 2xx
 * rejeita com a frase da rota.
 */

function respostaAosPedacos(pedacos: number[], cabecalhos: Record<string, string>): Response {
  const corpo = new ReadableStream<Uint8Array>({
    start(c) {
      for (const n of pedacos) c.enqueue(new Uint8Array(n));
      c.close();
    },
  });
  return new Response(corpo, { status: 200, headers: cabecalhos });
}

afterEach(() => vi.unstubAllGlobals());

describe("nomeDoFicheiro", () => {
  it("prefere o `filename*` (UTF-8), com acentos", () => {
    expect(
      nomeDoFicheiro(
        `attachment; filename="contrato.pdf"; filename*=UTF-8''Concei%C3%A7%C3%A3o.pdf`,
      ),
    ).toBe("Conceição.pdf");
  });
  it("lê o `filename` simples, com ou sem aspas", () => {
    expect(nomeDoFicheiro('attachment; filename="horario.pdf"')).toBe("horario.pdf");
    expect(nomeDoFicheiro("attachment; filename=horario.pdf")).toBe("horario.pdf");
  });
  it("sem cabeçalho, nada", () => {
    expect(nomeDoFicheiro(null)).toBeNull();
    expect(nomeDoFicheiro("inline")).toBeNull();
  });
});

describe("descarregar", () => {
  it("com `Content-Length`, conta os bytes à medida que chegam e devolve o ficheiro inteiro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaAosPedacos([400, 400, 200], {
          "Content-Length": "1000",
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="mapa.pdf"',
        }),
      ),
    );
    const avancos: Array<[number, number]> = [];
    const { blob, nome } = await descarregar("/api/x", {
      aoAvancar: ({ feito, total }) => avancos.push([feito, total]),
    });
    expect(blob.size).toBe(1000);
    expect(blob.type).toBe("application/pdf");
    expect(nome).toBe("mapa.pdf");
    expect(avancos[0]).toEqual([0, 1000]);
    expect(avancos.at(-1)).toEqual([1000, 1000]);
    // Sempre a subir.
    for (let i = 1; i < avancos.length; i++)
      expect(avancos[i][0]).toBeGreaterThanOrEqual(avancos[i - 1][0]);
  });

  it("sem tamanho, cai no `blob()` e não inventa avanço", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(300), { status: 200 })),
    );
    const aoAvancar = vi.fn();
    const { blob, nome } = await descarregar("/api/x", { aoAvancar });
    expect(blob.size).toBe(300);
    expect(nome).toBeNull();
    expect(aoAvancar).not.toHaveBeenCalled();
  });

  it("uma recusa da rota rejeita com a frase dela", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Esta timeline ainda não tem horas." }, { status: 422 }),
      ),
    );
    const erro = await descarregar("/api/x").catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FalhaDaDescarga);
    expect((erro as FalhaDaDescarga).message).toBe("Esta timeline ainda não tem horas.");
    expect((erro as FalhaDaDescarga).daRota).toBe(true);
    expect((erro as FalhaDaDescarga).estado).toBe(422);
  });

  it("uma recusa sem frase rejeita com a genérica, e diz que não é da rota", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x", { status: 500 })),
    );
    const erro = (await descarregar("/api/x").catch((e: unknown) => e)) as FalhaDaDescarga;
    expect(erro.daRota).toBe(false);
    expect(erro.message).toMatch(/Não foi possível descarregar/);
  });
});
