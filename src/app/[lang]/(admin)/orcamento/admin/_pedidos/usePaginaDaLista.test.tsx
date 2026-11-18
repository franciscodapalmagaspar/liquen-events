// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LIST_PAGE_SIZE } from "@/lib/orcamento/pedidos/regras-da-lista";
import type { Quote } from "@/lib/orcamento/types";
import type { FiltrosDaLista } from "./useFiltrosDosPedidos";
import { usePaginaDaLista } from "./usePaginaDaLista";

afterEach(cleanup);

const pedidos = Array.from({ length: 160 }, (_, i) => ({ id: `q${i}` }) as unknown as Quote);

const base = {
  filterStatus: "all",
  tagFilter: null,
  filterCategory: "all",
  showArchived: false,
  mineOnly: false,
  filterEspera: "all",
  filterMes: "all",
  filterRegiao: "all",
  filterPlanner: "all",
  search: "",
  sort: "recent",
  filtered: pedidos,
};

function montar() {
  return renderHook(({ filtros }) => usePaginaDaLista({ filtros }), {
    initialProps: { filtros: base as unknown as FiltrosDaLista },
  });
}

describe("a página da lista volta ao princípio quando um filtro muda", () => {
  for (const [filtro, valor] of [
    ["search", "rita"],
    ["filterStatus", "pendente"],
    ["filterEspera", "parados"],
    ["filterMes", "2027-05"],
    ["filterRegiao", "lisboa"],
    ["filterPlanner", "Ana"],
  ] as const) {
    it(`${filtro}: «Mostrar mais» desfeito, e nenhum lote novo pendurado`, () => {
      const { result, rerender } = montar();
      act(() => {
        result.current.setVisibleCount(LIST_PAGE_SIZE * 2);
        result.current.setInicioDoLote(LIST_PAGE_SIZE);
      });
      expect(result.current.visibleCount).toBe(LIST_PAGE_SIZE * 2);
      expect(result.current.ehDoLoteNovo(pedidos[LIST_PAGE_SIZE])).toBe(true);

      rerender({ filtros: { ...base, [filtro]: valor } as unknown as FiltrosDaLista });
      expect(result.current.visibleCount).toBe(LIST_PAGE_SIZE);
      expect(result.current.ehDoLoteNovo(pedidos[LIST_PAGE_SIZE])).toBe(false);
    });
  }
});
