"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LIST_PAGE_SIZE } from "@/lib/orcamento/pedidos/lotes-da-lista";
import type { Quote } from "@/lib/orcamento/types";
import type { LoteDaLista } from "./ListaDosPedidos";

/**
 * A PAGINAÇÃO DA LISTA DE PEDIDOS, E O LOTE QUE O «MOSTRAR MAIS» ACRESCENTA.
 *
 * Saiu do `AdminClient.tsx` (júri das fases 7 e 8, ponto 3) tal e qual: o
 * mesmo estado, o mesmo efeito e os mesmos cálculos, chamado no mesmo sítio do
 * componente — a ordem dos efeitos não muda.
 *
 * `volta` é o que faz a lista voltar ao princípio (a procura, os filtros, a
 * ordem). Era a lista de dependências do efeito; como é uma lista de valores
 * simples (texto, booleanos, `null`), junta-se numa chave, e o efeito corre
 * exactamente quando um deles muda.
 */
export function useLoteDaLista(
  filtered: Quote[],
  volta: ReadonlyArray<string | number | boolean | null | undefined>,
): LoteDaLista {
  const chave = JSON.stringify(volta);
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
  }, [chave]);
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
