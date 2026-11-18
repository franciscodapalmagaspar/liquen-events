import { describe, it, expect } from "vitest";
import { lerAsPaginas, TAMANHO_DA_PAGINA, type PedirPagina } from "./paginas";

/** Um servidor com `n` linhas e um `max-rows`; regista cada pedido. */
function servidor(n: number, maxRows = TAMANHO_DA_PAGINA) {
  const pedidos: [number, number][] = [];
  const todas = Array.from({ length: n }, (_, i) => i);
  const pedir: PedirPagina = async (desde, ate) => {
    pedidos.push([desde, ate]);
    return { data: todas.slice(desde, Math.min(ate + 1, desde + maxRows)), error: null };
  };
  return { pedir, pedidos };
}
const numero = (x: unknown) => (typeof x === "number" ? x : null);

describe("ler às páginas, até à página vazia", () => {
  it("lê tudo e acaba numa página vazia", async () => {
    const { pedir, pedidos } = servidor(1500);
    const r = await lerAsPaginas(pedir, numero, 5000);
    expect(r.estado).toBe("completa");
    expect(r.estado === "completa" && r.linhas).toHaveLength(1500);
    expect(pedidos).toEqual([
      [0, 999],
      [1000, 1999],
      [1500, 2499],
    ]);
  });

  it("um `max-rows` mais baixo do que a página não é o fim", async () => {
    const { pedir } = servidor(1200, 500);
    const r = await lerAsPaginas(pedir, numero, 5000);
    expect(r.estado === "completa" && r.linhas).toHaveLength(1200);
  });

  it("acima do limite: transbordou, com as primeiras `limite`, e sem pedir mais do que limite + 1", async () => {
    const { pedir, pedidos } = servidor(50);
    const r = await lerAsPaginas(pedir, numero, 10);
    expect(r).toEqual({ estado: "transbordou", linhas: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
    expect(pedidos).toEqual([[0, 10]]);
  });

  it("exatamente no limite ainda é completa", async () => {
    const { pedir } = servidor(10);
    expect((await lerAsPaginas(pedir, numero, 10)).estado).toBe("completa");
  });

  it("um servidor que ignora o `range` e repete a página não gira para sempre", async () => {
    const r = await lerAsPaginas(async () => ({ data: [1, 2, 3], error: null }), numero, 100);
    expect(r.estado).toBe("transbordou");
  });

  it("um erro, uma resposta sem lista, uma linha fora da forma ou um pedido que lança: falhou", async () => {
    const erro = { message: "em baixo" };
    expect(await lerAsPaginas(async () => ({ data: null, error: erro }), numero, 10)).toEqual({
      estado: "falhou",
      erro,
    });
    expect((await lerAsPaginas(async () => ({ data: {}, error: null }), numero, 10)).estado).toBe(
      "falhou",
    );
    expect(
      (await lerAsPaginas(async () => ({ data: [1, "x"], error: null }), numero, 10)).estado,
    ).toBe("falhou");
    const lanca: PedirPagina = async () => {
      throw new Error("rede");
    };
    expect((await lerAsPaginas(lanca, numero, 10)).estado).toBe("falhou");
  });
});
