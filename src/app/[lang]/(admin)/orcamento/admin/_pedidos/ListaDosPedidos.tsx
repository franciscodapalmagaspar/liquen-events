"use client";

import { type Dispatch, type SetStateAction } from "react";
import { type Quote, type QuoteStatus } from "@/lib/orcamento/types";
import { LIST_PAGE_SIZE, ENTRADA_DO_LOTE } from "./pele-da-lista";
import { type FiltrosDaLista } from "./useFiltrosDosPedidos";
import EmptyState from "../EmptyState";
import { TabelaOuCartoes } from "../ui";
import { ESTADO, PRESSAO } from "../ui/movimento";
import { COLUNAS_DE_PEDIDOS } from "./colunas-dos-pedidos";
import { QuoteCard } from "./QuoteCard";

/**
 * A LISTA DE PEDIDOS — cartões no telemóvel, tabela no computador (a mesma
 * lista, pelo `TabelaOuCartoes`), o vazio que diz o que a está a esconder, e o
 * «Mostrar mais». (Saiu do `AdminClient.tsx` na fase 7 de
 * `docs/ESTRUTURA-DO-CODIGO.md`, tal e qual.)
 */
export interface ListaDosPedidosProps {
  filtros: FiltrosDaLista;
  userName: string;
  selected: Quote | null;
  setNewQuoteOpen: Dispatch<SetStateAction<boolean>>;
  selectedIds: Set<string>;
  marcarDesfecho: (actualizado: Quote) => void;
  mudarEstadoNaLinha: (q: Quote, status: QuoteStatus) => Promise<void>;
  toggleSelect: (id: string) => void;
  abrirDaLista: (q: Quote) => Promise<void>;
  visibleCount: number;
  setVisibleCount: Dispatch<SetStateAction<number>>;
  setInicioDoLote: Dispatch<SetStateAction<number | null>>;
  visibleQuotes: Quote[];
  ehDoLoteNovo: (q: Quote) => boolean;
  todayStr: string;
}

export function ListaDosPedidos({
  filtros,
  userName,
  selected,
  setNewQuoteOpen,
  selectedIds,
  marcarDesfecho,
  mudarEstadoNaLinha,
  toggleSelect,
  abrirDaLista,
  visibleCount,
  setVisibleCount,
  setInicioDoLote,
  visibleQuotes,
  ehDoLoteNovo,
  todayStr,
}: ListaDosPedidosProps) {
  const { haFiltroAActuar, limparFiltros, oQueEstaAFiltrar, filtered } = filtros;
  return (
    <>
      <div
        /* O `--bo-entrada-y` positivo é para o LOTE NOVO, e só para
           ele: a `@keyframes bo-entrada` lê esta variável, e um lote
           que é acrescentado no fim da lista sobe para o lugar em vez
           de descer. Ver a nota do `ENTRADA_DO_LOTE`. */
        style={{ "--cena": 2, "--bo-entrada-y": "4px" } as React.CSSProperties}
        className={`bo-cena flex min-w-0 flex-col gap-3 ${ENTRADA_DO_LOTE}`}
      >
        {filtered.length === 0 && (
          <div className="bo-card">
            <EmptyState
              icon={
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                >
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <path d="M9 12h6M9 16h4" strokeLinecap="round" />
                </svg>
              }
              /* ── «VAZIA» E «FILTRADA» NÃO SÃO A MESMA COISA ───────
                 A condição olhava só para a procura e para o estado, e
                 ignorava os seis filtros do painel — que são
                 precisamente os que passaram a estar RECOLHIDOS no
                 telemóvel. O resultado era o pior ecrã possível: uma
                 lista filtrada a dizer «Sem pedidos ainda», com os
                 filtros fora de vista. Ela conclui que não entrou nada,
                 fecha o telemóvel, e o pedido fica sem resposta.
                 `filtrosActivos` é a mesma conta que o botão mostra —
                 uma fonte, dois sítios. */
              title={haFiltroAActuar ? "Nenhum pedido corresponde" : "Sem pedidos ainda"}
              hint={
                haFiltroAActuar
                  ? `Estão a esconder pedidos: ${oQueEstaAFiltrar()}.`
                  : "Os pedidos de orçamento do site aparecem aqui. Podes também criar um manualmente."
              }
              /* A saída AQUI, e não «vai procurar os filtros». */
              action={
                haFiltroAActuar
                  ? { label: "Limpar tudo e ver todos", onClick: limparFiltros }
                  : { label: "+ Novo pedido", onClick: () => setNewQuoteOpen(true) }
              }
            />
          </div>
        )}
        {visibleQuotes.length > 0 && (
          <TabelaOuCartoes
            itens={visibleQuotes}
            chaveDe={(q) => q.id}
            legenda="Pedidos"
            // O cartão do telemóvel é o QuoteCard, que já foi desenhado
            // e auditado ao toque — traz a sua própria moldura e o seu
            // próprio botão, e não pode ser embrulhado noutro.
            semMoldura
            cartao={(q) => (
              <QuoteCard
                q={q}
                doLoteNovo={ehDoLoteNovo(q)}
                isCurrent={selected?.id === q.id}
                isSelected={selectedIds.has(q.id)}
                todayStr={todayStr}
                userName={userName}
                onOpen={abrirDaLista}
                onToggle={toggleSelect}
                onDesfecho={marcarDesfecho}
              />
            )}
            aoAbrir={abrirDaLista}
            colunas={COLUNAS_DE_PEDIDOS({
              selectedIds,
              toggleSelect,
              todayStr,
              atual: selected?.id,
              userName,
              onDesfecho: marcarDesfecho,
              onMudarEstado: mudarEstadoNaLinha,
              ehDoLoteNovo,
            })}
          />
        )}
        {filtered.length > visibleCount && (
          <button
            type="button"
            onClick={() => {
              // A marca ANTES do crescimento, e com o valor de agora:
              // é a fronteira entre o que já estava no ecrã e o que
              // este toque acrescenta.
              setInicioDoLote(visibleCount);
              setVisibleCount((c) => c + LIST_PAGE_SIZE);
            }}
            className={`w-full py-3.5 text-[11px] tracking-[0.2em] uppercase text-foreground/45 hover:text-[var(--bo-tinta-72)] bg-[var(--bo-surface)] border border-[var(--bo-hairline)] rounded-xl hover:border-foreground/20 ${ESTADO} ${PRESSAO}`}
          >
            Mostrar mais ({filtered.length - visibleCount} restante
            {filtered.length - visibleCount !== 1 ? "s" : ""})
          </button>
        )}
      </div>
    </>
  );
}
