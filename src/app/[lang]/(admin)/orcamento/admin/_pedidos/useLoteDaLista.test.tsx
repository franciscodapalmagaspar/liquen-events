// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { LIST_PAGE_SIZE } from "@/lib/orcamento/pedidos/lotes-da-lista";
import type { Quote } from "@/lib/orcamento/types";
import { useLoteDaLista } from "./useLoteDaLista";

const muitos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `q${i}` }) as Quote);

describe("useLoteDaLista", () => {
  it("desenha uma página; «Mostrar mais» acrescenta e marca só o lote novo", () => {
    const lista = muitos(LIST_PAGE_SIZE * 2 + 5);
    const { result } = renderHook(() => useLoteDaLista(lista, ["", "all"]));
    expect(result.current.visibleQuotes).toHaveLength(LIST_PAGE_SIZE);
    expect(result.current.ehDoLoteNovo(lista[0])).toBe(false);
    act(() => {
      result.current.setInicioDoLote(LIST_PAGE_SIZE);
      result.current.setVisibleCount((n) => n + LIST_PAGE_SIZE);
    });
    expect(result.current.visibleQuotes).toHaveLength(LIST_PAGE_SIZE * 2);
    expect(result.current.ehDoLoteNovo(lista[LIST_PAGE_SIZE - 1])).toBe(false);
    expect(result.current.ehDoLoteNovo(lista[LIST_PAGE_SIZE])).toBe(true);
  });

  it("mudar a procura ou um filtro volta ao princípio, sem lote novo pendurado", () => {
    const lista = muitos(LIST_PAGE_SIZE * 2);
    const { result, rerender } = renderHook(({ volta }) => useLoteDaLista(lista, volta), {
      initialProps: { volta: ["", "all"] as (string | null)[] },
    });
    act(() => {
      result.current.setInicioDoLote(LIST_PAGE_SIZE);
      result.current.setVisibleCount(LIST_PAGE_SIZE * 2);
    });
    rerender({ volta: ["ana", "all"] });
    expect(result.current.visibleQuotes).toHaveLength(LIST_PAGE_SIZE);
    expect(result.current.ehDoLoteNovo(lista[LIST_PAGE_SIZE - 1])).toBe(false);
  });

  it("um novo desenho com os MESMOS filtros não volta ao princípio", () => {
    const lista = muitos(LIST_PAGE_SIZE * 2);
    const { result, rerender } = renderHook(({ volta }) => useLoteDaLista(lista, volta), {
      initialProps: { volta: ["", "all", false] as (string | boolean)[] },
    });
    act(() => result.current.setVisibleCount(LIST_PAGE_SIZE * 2));
    rerender({ volta: ["", "all", false] });
    expect(result.current.visibleQuotes).toHaveLength(LIST_PAGE_SIZE * 2);
  });
});
