// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LIST_PAGE_SIZE } from "@/lib/orcamento/pedidos/regras-da-lista";
import type { Quote } from "@/lib/orcamento/types";
import { useFiltrosDosPedidos, type FiltrosDaLista } from "./useFiltrosDosPedidos";
import { usePaginaDaLista } from "./usePaginaDaLista";

afterEach(cleanup);

const pedidos = Array.from(
  { length: 160 },
  (_, i) => ({ id: `q${i}`, name: `Pedido ${i}`, status: "pendente" }) as unknown as Quote,
);

/** A lista inteira como ela a usa: os filtros reais, e a página por cima. */
function montar() {
  return renderHook(() => {
    const filtros = useFiltrosDosPedidos(pedidos, "Ana");
    return { filtros, pagina: usePaginaDaLista({ filtros }) };
  });
}

/** Cada filtro da lista, e um valor diferente do de partida. */
const MUDAR: Record<string, (f: FiltrosDaLista) => void> = {
  procura: (f) => f.setSearch("pedido 1"),
  estado: (f) => f.setFilterStatus("cotado"),
  etiqueta: (f) => f.setTagFilter("vip"),
  categoria: (f) => f.setFilterCategory("empresas"),
  espera: (f) => f.setFilterEspera("7"),
  mes: (f) => f.setFilterMes("2027-05"),
  regiao: (f) => f.setFilterRegiao("lisboa"),
  planner: (f) => f.setFilterPlanner("Rita"),
  arquivados: (f) => f.setShowArchived(true),
  soOsMeus: (f) => f.setMineOnly(true),
  ordem: (f) => f.setSort("recent"),
};

describe("a página da lista volta ao princípio quando QUALQUER filtro muda", () => {
  for (const [nome, mudar] of Object.entries(MUDAR)) {
    it(`${nome}: «Mostrar mais» desfeito, e nenhum lote novo pendurado`, () => {
      const { result } = montar();
      act(() => {
        result.current.pagina.setVisibleCount(LIST_PAGE_SIZE * 2);
        result.current.pagina.setInicioDoLote(LIST_PAGE_SIZE);
      });
      expect(result.current.pagina.visibleCount).toBe(LIST_PAGE_SIZE * 2);

      act(() => mudar(result.current.filtros));
      expect(result.current.pagina.visibleCount).toBe(LIST_PAGE_SIZE);
      const algum = result.current.filtros.filtered[LIST_PAGE_SIZE];
      if (algum) expect(result.current.pagina.ehDoLoteNovo(algum)).toBe(false);
    });
  }

  it("a lista dos filtros prende-se ao `criterios`: um filtro novo sem entrada aqui fica vermelho", () => {
    const { result } = montar();
    expect(Object.keys(result.current.filtros.criterios).sort()).toEqual(Object.keys(MUDAR).sort());
  });
});
