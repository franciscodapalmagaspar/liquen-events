import { useState, useMemo, useEffect, useCallback } from "react";
import type { Quote } from "@/lib/orcamento/types";
import { LIST_PAGE_SIZE } from "@/lib/orcamento/pedidos/regras-da-lista";
import { type FiltrosDaLista } from "./useFiltrosDosPedidos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PÁGINA DA LISTA — quantos pedidos se mostram, e o lote que acabou de entrar
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A lista mostra os pedidos aos lotes («Mostrar mais»), volta ao princípio
 * quando QUALQUER filtro muda, e sabe quais são os do lote que acabou de entrar
 * (para esses, e só esses, entrarem como um bloco).
 *
 * Saiu do corpo do `AdminClient.tsx` (fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`)
 * tal e qual, e é chamado NO MESMO SÍTIO onde o código estava: a ordem dos
 * hooks e dos efeitos do componente não muda. Os nomes ficam os de lá.
 */
export interface EntradasPaginaDaLista {
  filtros: FiltrosDaLista;
}

export function usePaginaDaLista({ filtros }: EntradasPaginaDaLista) {
  const { criterios, filtered } = filtros;
  // Paginação incremental da lista: com centenas de pedidos, renderizar tudo
  // degrada a página. Só o RENDER é paginado — exportar CSV, "selecionar
  // todos" e contagens continuam a operar sobre a lista filtrada completa.
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
  /**
   * ONDE COMEÇA O LOTE QUE O «MOSTRAR MAIS» ACABOU DE TRAZER.
   *
   * `null` quando não há lote novo nenhum — a primeira página, e tudo o que
   * venha de uma mudança de filtro. É a diferença entre «isto acabou de
   * chegar» e «isto sempre esteve aqui», e sem ela a entrada do lote animava
   * a lista inteira a cada desenho.
   *
   * Um ÍNDICE e não um `Set` de ids: quem manda é a posição na lista filtrada
   * nesse instante, e o `Set` deriva daqui. Guardar os ids era guardar duas
   * verdades sobre a mesma coisa.
   */
  const [inicioDoLote, setInicioDoLote] = useState<number | null>(null);
  useEffect(() => {
    setVisibleCount(LIST_PAGE_SIZE);
    // Uma lista que voltou ao princípio não tem lote novo nenhum: sem isto, a
    // marca antiga ficava pendurada e as primeiras linhas de uma procura nova
    // entravam como se tivessem acabado de ser acrescentadas.
    setInicioDoLote(null);
    // Qualquer filtro: o `criterios` muda quando muda algum (ver
    // `useFiltrosDosPedidos`). Enumerados à mão, os quatro do BO 4 ficaram de
    // fora, e escolher um mês depois de «Mostrar mais» deixava a página a meio.
  }, [criterios]);
  const visibleQuotes = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  /**
   * Os ids do lote novo — e nada quando não há lote novo.
   *
   * Um `Set` e não um `indexOf` por linha: com centenas de pedidos, procurar
   * cada linha na lista filtrada era uma varredura por linha desenhada.
   */
  const idsDoLoteNovo = useMemo(
    () =>
      inicioDoLote === null
        ? null
        : new Set(filtered.slice(inicioDoLote, visibleCount).map((q) => q.id)),
    [filtered, inicioDoLote, visibleCount],
  );
  const ehDoLoteNovo = useCallback(
    (q: Quote) => idsDoLoteNovo?.has(q.id) ?? false,
    [idsDoLoteNovo],
  );
  return { visibleQuotes, visibleCount, setVisibleCount, setInicioDoLote, ehDoLoteNovo };
}
