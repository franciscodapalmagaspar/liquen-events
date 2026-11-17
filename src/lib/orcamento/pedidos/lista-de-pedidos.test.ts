import { describe, expect, it } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import {
  abertoDepoisDe,
  mudarNaLista,
  substituirNaLista,
  substituirVariosNaLista,
  tirarDaLista,
} from "./lista-de-pedidos";

const q = (id: string, extra: Partial<Quote> = {}) => ({ id, name: id, ...extra }) as Quote;
const A = q("a");
const B = q("b");
const C = q("c");

describe("a lista dos pedidos", () => {
  it("mudar junta a mudança só ao pedido certo, e os outros ficam os mesmos objectos", () => {
    const lista = [A, B, C];
    const nova = mudarNaLista(lista, "b", { tags: ["vip"] });
    expect(nova[1]).toEqual({ ...B, tags: ["vip"] });
    expect(nova[0]).toBe(A);
    expect(nova[2]).toBe(C);
    expect(lista[1]).toBe(B); // não mexe na de entrada
  });

  it("mudar um id que não está devolve os mesmos pedidos", () => {
    const nova = mudarNaLista([A, B], "z", { name: "x" });
    expect(nova).toEqual([A, B]);
    expect(nova[0]).toBe(A);
  });

  it("substituir põe o pedido novo no lugar, pela ordem que tinha", () => {
    const B2 = q("b", { name: "Beta" });
    expect(substituirNaLista([A, B, C], B2)).toEqual([A, B2, C]);
  });

  it("substituir vários, e os que não vêm ficam", () => {
    const A2 = q("a", { name: "Alfa" });
    const C2 = q("c", { name: "Gama" });
    const nova = substituirVariosNaLista(
      [A, B, C],
      new Map([
        ["a", A2],
        ["c", C2],
      ]),
    );
    expect(nova).toEqual([A2, B, C2]);
    expect(nova[1]).toBe(B);
  });

  it("tirar tira só os de ids, e uma lista vazia não falha", () => {
    expect(tirarDaLista([A, B, C], new Set(["a", "c"]))).toEqual([B]);
    expect(tirarDaLista([], new Set(["a"]))).toEqual([]);
  });

  it("o aberto só muda se for um dos mudados; sem nada aberto fica nada", () => {
    const B2 = q("b", { name: "Beta" });
    expect(abertoDepoisDe(B, new Map([["b", B2]]))).toBe(B2);
    expect(abertoDepoisDe(A, new Map([["b", B2]]))).toBe(A);
    expect(abertoDepoisDe(null, new Map([["b", B2]]))).toBeNull();
  });
});
