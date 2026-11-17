// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import { useMudancasDosPedidos } from "./useMudancasDosPedidos";

const q = (id: string, extra: Partial<Quote> = {}) => ({ id, name: id, ...extra }) as Quote;

function montar(lista: Quote[], aberto: Quote | null) {
  return renderHook(() => {
    const [quotes, setQuotes] = useState(lista);
    const [selected, setSelected] = useState<Quote | null>(aberto);
    const pedidos = useMudancasDosPedidos(setQuotes, setSelected);
    return { quotes, selected, pedidos, setSelected };
  });
}

describe("useMudancasDosPedidos", () => {
  it("mudar chega à lista e ao pedido aberto, quando é ele", () => {
    const { result } = montar([q("a"), q("b")], q("b"));
    act(() => result.current.pedidos.mudar("b", { tags: ["vip"] }));
    expect(result.current.quotes[1].tags).toEqual(["vip"]);
    expect(result.current.selected?.tags).toEqual(["vip"]);
  });

  it("uma resposta que chega depois de se abrir outro pedido não lhe cola os campos", () => {
    // O defeito que isto prende: o filho mudava «o que estiver aberto» sem
    // olhar ao id; abrir B enquanto A gravava punha as etiquetas de A em B.
    const { result } = montar([q("a"), q("b")], q("a"));
    act(() => result.current.setSelected(q("b")));
    act(() => result.current.pedidos.mudar("a", { tags: ["de-a"] }));
    expect(result.current.selected?.id).toBe("b");
    expect(result.current.selected?.tags).toBeUndefined();
    expect(result.current.quotes[0].tags).toEqual(["de-a"]);
  });

  it("substituir não reabre o pedido se entretanto se abriu outro", () => {
    const { result } = montar([q("a"), q("b")], q("b"));
    act(() => result.current.pedidos.substituir(q("a", { archived: true } as Partial<Quote>)));
    expect(result.current.selected?.id).toBe("b");
    expect((result.current.quotes[0] as Quote & { archived?: boolean }).archived).toBe(true);
  });

  it("tirar fecha o painel só se o aberto for um dos tirados", () => {
    const { result } = montar([q("a"), q("b"), q("c")], q("b"));
    act(() => result.current.pedidos.tirar(new Set(["a"])));
    expect(result.current.selected?.id).toBe("b");
    act(() => result.current.pedidos.tirar(new Set(["b"])));
    expect(result.current.selected).toBeNull();
    expect(result.current.quotes.map((x) => x.id)).toEqual(["c"]);
  });

  it("as mudanças são as mesmas entre desenhos (não desfazem o memo dos filhos)", () => {
    const { result, rerender } = montar([q("a")], null);
    const antes = result.current.pedidos;
    rerender();
    expect(result.current.pedidos).toBe(antes);
  });
});
