"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import { propostaDaFaseDoPedido, type PropostaLeve } from "../../percentagem-do-sinal";
import {
  separadorQuandoAPropostaChega,
  type SeparadorPorDecidir,
} from "../../separador-por-decidir";
import { detailNextAction, type DetailTab } from "../separadores-do-painel";

/**
 * Os separadores do painel do pedido: o aberto, os que já montaram, e o que
 * ainda espera pela lista leve de propostas para se decidir. Saiu do
 * `AdminClient` tal e qual (fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`).
 */
export function useSeparadoresDoPainel(
  selected: Quote | null,
  propostasLeves: PropostaLeve[] | undefined,
) {
  // Which tools section of the detail panel is showing. Everything is visible
  // at once now — the management form always renders; only the heavier tool
  // groups (Produção / Financeiro / Comunicação) are tabbed for organisation.
  const [detailTab, setDetailTab] = useState<DetailTab>("comunicacao");
  /**
   * ════════════════════════════════════════════════════════════════════════
   * QUE SEPARADORES JÁ FORAM ABERTOS NESTE PEDIDO
   * ════════════════════════════════════════════════════════════════════════
   *
   * Abrir um pedido montava os três separadores AO MESMO TEMPO: os doze
   * `dynamic()` lá dentro (Produção tem seis, Financeiro dois, Comunicação
   * quatro, entre `ProposalStudio` e `ProposalBuilder`) eram todos
   * descarregados e arrancados de uma vez, mesmo para quem só queria ver um
   * telefone. Cada separador só monta a sua ferramenta a PRIMEIRA vez que é
   * aberto: o resto do tempo os dois que ninguém tocou nem chegam a existir
   * no DOM.
   *
   * Uma vez aberto, um separador NUNCA desmonta ao trocar de separador (só
   * fica escondido por `hidden`, como já estava) — é a mesma garantia de
   * sempre, escrita ao lado de cada painel: trocar de separador não pode
   * perder uma mensagem por enviar ou uma proposta a meio de editar. Cada um
   * dos doze componentes foi visto antes desta mudança: guardam campos de
   * formulário por gravar (um título de tarefa a meio, um nome de convidado),
   * e nenhum é seguro para desmontar sozinho ao trocar de separador. Montar
   * só à primeira abertura, e nunca mais desmontar, resolve os dois lados:
   * poupa o que a maioria dos pedidos nunca chega a tocar, sem arriscar o que
   * a mudança para `hidden` já protegia.
   */
  const [detailTabsVisitados, setDetailTabsVisitados] = useState<Set<DetailTab>>(
    () => new Set([detailTab]),
  );
  /** Abre um separador do detalhe DO PEDIDO JÁ ABERTO: primeira vez que se vê
   *  é primeira vez que monta. Usar sempre em vez de `setDetailTab` directo
   *  para uma troca de separador. Para ABRIR um pedido (novo `selected`), usa
   *  antes `abrirPrimeiroDetailTab` — essa RECOMEÇA a lista de visitados, esta
   *  ACRESCENTA-lhe. */
  const abrirDetailTab = useCallback((tab: DetailTab) => {
    setDetailTab(tab);
    setDetailTabsVisitados((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, []);
  /** O pedido MUDOU: os separadores visitados do pedido anterior não dizem
   *  nada sobre este. Recomeça a lista só com o separador de abertura. */
  const abrirPrimeiroDetailTab = useCallback((tab: DetailTab) => {
    setDetailTab(tab);
    setDetailTabsVisitados(new Set([tab]));
  }, []);

  // Ver `separador-por-decidir.ts`: o separador escolhido antes de a lista
  // leve de propostas chegar volta a escolher-se quando ela chega.
  const separadorPorDecidirRef = useRef<SeparadorPorDecidir<DetailTab> | null>(null);
  useEffect(() => {
    const porDecidir = separadorPorDecidirRef.current;
    if (!porDecidir || !selected || propostasLeves === undefined) return;
    separadorPorDecidirRef.current = null;
    const alvo = detailNextAction(
      selected,
      propostaDaFaseDoPedido(propostasLeves, selected.id),
    ).tab;
    const novo = separadorQuandoAPropostaChega(
      porDecidir,
      { quoteId: selected.id, tab: detailTab, em: Date.now() },
      alvo === "gestao" ? "comunicacao" : alvo,
    );
    // `abrirDetailTab` ACRESCENTA: o separador de antes não desmonta.
    if (novo) abrirDetailTab(novo);
  }, [propostasLeves, selected, detailTab, abrirDetailTab]);
  return {
    detailTab,
    detailTabsVisitados,
    abrirDetailTab,
    abrirPrimeiroDetailTab,
    separadorPorDecidirRef,
  };
}
