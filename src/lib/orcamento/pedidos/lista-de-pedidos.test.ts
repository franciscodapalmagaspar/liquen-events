import { describe, expect, it } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import {
  comPedidoAlterado,
  comPedidoSubstituido,
  comPedidosSubstituidos,
  semPedidos,
} from "./lista-de-pedidos";

const a = { id: "LQ-1", name: "Ana", tags: ["x"] } as Quote;
const b = { id: "LQ-2", name: "Rui" } as Quote;

describe("comPedidoAlterado", () => {
  it("altera só o pedido pedido, e só os campos do remendo", () => {
    const lista = [a, b];
    const nova = comPedidoAlterado(lista, "LQ-1", { tags: ["y"] });
    expect(nova[0]).toEqual({ id: "LQ-1", name: "Ana", tags: ["y"] });
    expect(nova[1]).toBe(b);
    // Não muda o que recebeu.
    expect(lista[0]).toBe(a);
    expect(a.tags).toEqual(["x"]);
  });

  it("um id que não está na lista deixa-a igual (sem acrescentar)", () => {
    const nova = comPedidoAlterado([a, b], "LQ-9", { name: "?" });
    expect(nova).toEqual([a, b]);
    expect(nova[0]).toBe(a);
  });

  it("lista vazia fica vazia", () => {
    expect(comPedidoAlterado([], "LQ-1", { name: "x" })).toEqual([]);
  });
});

describe("comPedidoSubstituido", () => {
  it("troca o pedido inteiro pelo que veio do servidor", () => {
    const vindo = { id: "LQ-2", name: "Rui M." } as Quote;
    const nova = comPedidoSubstituido([a, b], vindo);
    expect(nova[1]).toBe(vindo);
    expect(nova[0]).toBe(a);
  });

  it("um pedido que já não está na lista não volta a entrar", () => {
    const vindo = { id: "LQ-9", name: "Novo" } as Quote;
    expect(comPedidoSubstituido([a, b], vindo)).toEqual([a, b]);
  });
});

describe("comPedidosSubstituidos (as acções em lote)", () => {
  it("troca os que o servidor devolveu e deixa os outros OS MESMOS objectos", () => {
    const novoB = { id: "LQ-2", name: "Rui M.", status: "cotado" } as Quote;
    const nova = comPedidosSubstituidos([a, b], new Map([[novoB.id, novoB]]));
    expect(nova[0]).toBe(a);
    expect(nova[1]).toBe(novoB);
  });

  it("um lote vazio devolve a lista como estava", () => {
    const lista = [a, b];
    expect(comPedidosSubstituidos(lista, new Map())).toBe(lista);
  });
});

describe("semPedidos", () => {
  it("tira os apagados e só esses", () => {
    expect(semPedidos([a, b], new Set([a.id]))).toEqual([b]);
  });

  it("sem nada para tirar, devolve a lista como estava", () => {
    const lista = [a, b];
    expect(semPedidos(lista, new Set())).toBe(lista);
  });
});
