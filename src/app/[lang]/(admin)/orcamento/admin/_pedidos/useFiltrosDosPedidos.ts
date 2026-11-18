"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  filtrarEOrdenarPedidos,
  filtrosDoPainelActivos,
  haFiltroAActuar as haFiltroAActuarNaLista,
  oQueEstaAFiltrar as descreverFiltros,
  type FiltroDeEspera,
  type FiltrosDosPedidos,
  type OrdemDosPedidos,
} from "@/lib/orcamento/pedidos/filtros-dos-pedidos";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS FILTROS DA LISTA DE PEDIDOS — o estado, e a lista que sai dele
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Doze `useState` e as contas que se fazem com eles viviam soltos no corpo do
 * `AdminClient.tsx`; passam a um hook de domínio (fase 7 de
 * `docs/ESTRUTURA-DO-CODIGO.md`). As REGRAS (o que filtra, por que ordem, como
 * se diz o que está a esconder pedidos) são puras e vivem em
 * `lib/orcamento/pedidos/filtros-dos-pedidos.ts`; aqui fica o estado.
 *
 * O que NÃO veio para aqui, de propósito: os efeitos que lembram o filtro e a
 * ordem neste aparelho, e o que volta a página da lista ao princípio. Ficam no
 * componente, na posição de sempre — a ordem dos efeitos é comportamento, e
 * este passo só muda o estado de casa.
 *
 * Os nomes ficam os de lá (`filterStatus`, `mineOnly`…): mudar o nome no mesmo
 * passo em que se muda a casa é o diff que não se revê.
 */
export function useFiltrosDosPedidos(quotes: Quote[], userName: string) {
  const [filterStatus, setFilterStatus] = useState<QuoteStatus | "all">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  /**
   * Os quatro filtros rápidos pedidos. Todos "all" por omissão: um filtro
   * ligado sem se dar por isso é a maneira de jurar que um pedido desapareceu.
   *
   * `filterEspera` é o único que não é uma lista de valores — é um corte ("há
   * três dias ou mais"), porque a pergunta que serve não é "quais esperam há
   * exactamente quatro dias" mas "o que é que já esperou de mais".
   */
  const [filterEspera, setFilterEspera] = useState<FiltroDeEspera>("all");
  const [filterMes, setFilterMes] = useState<string>("all");
  const [filterRegiao, setFilterRegiao] = useState<string>("all");
  const [filterPlanner, setFilterPlanner] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");
  /**
   * O painel dos filtros está aberto? SÓ IMPORTA NO TELEMÓVEL.
   *
   * Medido a 390×844: os controlos comiam 52% do ecrã antes de aparecer um
   * pedido. A partir de `lg` o painel é sempre visível por CSS e este estado
   * não pinta nada — não há dois layouts, há um que recolhe.
   *
   * Começa fechado de propósito: a lista é o que se veio ver.
   */
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  /**
   * A ordem por omissão é a ESPERA, não a data de entrada.
   *
   * "Mais recentes" põe à cabeça o que acabou de chegar — que é o que menos
   * urge. O que se perde é o pedido de há nove dias, que com essa ordem está no
   * fundo do ecrã, com a mesma etiqueta "Novo" de um que entrou esta manhã.
   */
  const [sort, setSort] = useState<OrdemDosPedidos>("espera");

  /**
   * QUANTOS FILTROS ESTÃO A ESCONDER PEDIDOS NESTE MOMENTO — o número do botão
   * «Filtros», que é o que torna honesto recolher os controlos: um filtro
   * escondido E calado faz uma lista filtrada parecer uma lista vazia.
   */
  const filtrosActivos = filtrosDoPainelActivos({
    soOsMeus: mineOnly,
    categoria: filterCategory,
    espera: filterEspera,
    mes: filterMes,
    regiao: filterRegiao,
    planner: filterPlanner,
  });
  /** Está ALGUMA coisa a esconder pedidos? (filtros + procura + estado + etiqueta) */
  const haFiltroAActuar = haFiltroAActuarNaLista(
    { procura: search, estado: filterStatus, etiqueta: tagFilter, arquivados: showArchived },
    filtrosActivos,
  );

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A SAÍDA TEM DE ESTAR ONDE SE DÁ POR ELA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A lista filtrada e vazia já sabia dizer que estava filtrada — o que não
   * fazia era dar a saída. Um vazio que manda ir a outro sítio é meio vazio — e
   * este é o mais caro de todos, porque a conclusão errada («não entrou nada»)
   * fecha o telemóvel e deixa um pedido sem resposta.
   */
  function limparFiltros() {
    setSearch("");
    setFilterStatus("all");
    setTagFilter(null);
    setFilterCategory("all");
    setFilterEspera("all");
    setFilterMes("all");
    setFilterRegiao("all");
    setFilterPlanner("all");
    setMineOnly(false);
    // A lista dos arquivados também esconde pedidos (revisão · 1): «ver
    // todos» é a lista normal.
    setShowArchived(false);
  }

  /** O que está a esconder os pedidos, por extenso. */
  function oQueEstaAFiltrar(): string {
    return descreverFiltros(
      { procura: search, estado: filterStatus, etiqueta: tagFilter, arquivados: showArchived },
      filtrosActivos,
    );
  }

  // A procura responde a cada tecla, e o filtro e a ordenação de todos os
  // pedidos correm sobre o valor ADIADO, com menos prioridade: uma tecla nunca
  // espera pela lista inteira (com centenas de pedidos, notava-se).
  const deferredSearch = useDeferredValue(search);

  /**
   * OS FILTROS, NUM OBJECTO SÓ — a lista deles escreve-se aqui e mais em
   * nenhum lado. Quem precisa de saber «mudou algum filtro?» (a página da lista,
   * que volta ao princípio) compara este objecto, em vez de os enumerar outra
   * vez: foi assim, a enumerar à mão, que os quatro do BO 4 ficaram de fora.
   * A procura vai tal e qual se escreve; a lista filtra-se sobre a adiada.
   */
  const criterios = useMemo<FiltrosDosPedidos>(
    () => ({
      estado: filterStatus,
      etiqueta: tagFilter,
      categoria: filterCategory,
      espera: filterEspera,
      mes: filterMes,
      regiao: filterRegiao,
      planner: filterPlanner,
      arquivados: showArchived,
      soOsMeus: mineOnly,
      procura: search,
      ordem: sort,
    }),
    [
      filterStatus,
      tagFilter,
      filterCategory,
      filterEspera,
      filterMes,
      filterRegiao,
      filterPlanner,
      showArchived,
      mineOnly,
      search,
      sort,
    ],
  );

  const filtered = useMemo(
    () => filtrarEOrdenarPedidos(quotes, { ...criterios, procura: deferredSearch }, userName),
    [quotes, criterios, deferredSearch, userName],
  );

  return {
    filterStatus,
    setFilterStatus,
    tagFilter,
    setTagFilter,
    filterCategory,
    setFilterCategory,
    filterEspera,
    setFilterEspera,
    filterMes,
    setFilterMes,
    filterRegiao,
    setFilterRegiao,
    filterPlanner,
    setFilterPlanner,
    showArchived,
    setShowArchived,
    mineOnly,
    setMineOnly,
    search,
    setSearch,
    filtrosAbertos,
    setFiltrosAbertos,
    sort,
    setSort,
    filtrosActivos,
    haFiltroAActuar,
    limparFiltros,
    oQueEstaAFiltrar,
    criterios,
    filtered,
  };
}

/** O que o `useFiltrosDosPedidos` devolve — os filtros da lista, inteiros. */
export type FiltrosDaLista = ReturnType<typeof useFiltrosDosPedidos>;
