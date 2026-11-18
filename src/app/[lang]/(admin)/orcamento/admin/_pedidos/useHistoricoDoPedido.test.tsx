// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NotasAutomaticas } from "@/lib/orcamento/pedidos/notas-automaticas";
import type { Quote } from "@/lib/orcamento/types";
import type { EdicaoDoPedido } from "./useEdicaoDoPedido";
import { useHistoricoDoPedido } from "./useHistoricoDoPedido";

afterEach(cleanup);

const pedido = (id: string, adminNotes = ""): Quote =>
  ({ id, name: id, adminNotes }) as unknown as Quote;

function montar(aberto: Quote | null) {
  const preencherCom = vi.fn();
  const setEditPrice = vi.fn();
  const substituirPedido = vi.fn();
  const escritoNoServidor = {
    current: aberto ? { id: aberto.id, adminNotes: "", lostReason: "" } : null,
  } as { current: NotasAutomaticas | null };
  const { result } = renderHook(() =>
    useHistoricoDoPedido({
      setQuotes: vi.fn(),
      setSelected: vi.fn(),
      substituirPedido,
      toast: vi.fn(),
      selectedRef: { current: aberto },
      escritoNoServidor,
      edicao: { preencherCom, setEditPrice, setEditStatus: vi.fn() } as unknown as EdicaoDoPedido,
    }),
  );
  return {
    reposto: result.current.refletirPedidoReposto,
    precoDoEstudio: result.current.refletirPrecoDoEstudio,
    setEditPrice,
    preencherCom,
    substituirPedido,
    escritoNoServidor,
  };
}

describe("o «Anular» que repõe um pedido", () => {
  it("com esse pedido aberto, repõe os campos e a linha de base", () => {
    const { reposto, preencherCom, substituirPedido, escritoNoServidor } = montar(pedido("A"));
    const A = pedido("A", "nota antiga");
    reposto(A);
    expect(substituirPedido).toHaveBeenCalledWith(A);
    expect(preencherCom).toHaveBeenCalledWith(A);
    expect(escritoNoServidor.current).toEqual({
      id: "A",
      adminNotes: "nota antiga",
      lostReason: "",
    });
  });

  it("com OUTRO pedido aberto, só muda a lista (revisão de 17/11)", () => {
    // Sem isto, os campos do B ficavam com o nome, o contacto e a data do A, e
    // o «Guardar» seguinte gravava-os por cima do B.
    const { reposto, preencherCom, substituirPedido, escritoNoServidor } = montar(pedido("B"));
    const A = pedido("A", "nota antiga");
    reposto(A);
    expect(substituirPedido).toHaveBeenCalledWith(A);
    expect(preencherCom).not.toHaveBeenCalled();
    expect(escritoNoServidor.current?.id).toBe("B");
  });
});

describe("o preço que o estúdio gravou", () => {
  const comPreco = (id: string) => ({ ...pedido(id), quotedPrice: 1234 }) as unknown as Quote;

  it("com esse pedido aberto, a lista troca-o e o campo do preço segue-o", () => {
    const { precoDoEstudio, substituirPedido, setEditPrice } = montar(pedido("A"));
    precoDoEstudio(comPreco("A"));
    expect(substituirPedido).toHaveBeenCalled();
    expect(setEditPrice).toHaveBeenCalledWith("1234");
  });

  it("com OUTRO pedido aberto, o campo do preço dele não se toca", () => {
    // Sem a guarda, o preço do B ia para o campo do A, e o «Guardar tudo»
    // mandava-o para o A.
    const { precoDoEstudio, substituirPedido, setEditPrice } = montar(pedido("A"));
    precoDoEstudio(comPreco("B"));
    expect(substituirPedido).toHaveBeenCalled();
    expect(setEditPrice).not.toHaveBeenCalled();
  });
});
