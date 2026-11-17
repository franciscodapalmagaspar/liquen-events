"use client";

import Link from "next/link";
import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { localizeHref } from "@/lib/i18n/config";
import { shortRef } from "@/lib/orcamento/pedidos/textos-do-pedido";
import { quemPedeEOCasal } from "@/lib/orcamento/quem-pede";
import { type Quote } from "@/lib/orcamento/types";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { MoreMenu } from "../../MoreMenu";
import { downloadEventIcs, printEventDossier, printRunSheet } from "../../export";
import { Button } from "../../ui";
import { ESTADO, PRESSAO } from "../../ui/movimento";
import { statusBadge } from "../estado-do-pedido";
import { usePedidoAberto } from "./pedido-aberto";

/**
 * O CABEÇALHO DO PAINEL DO PEDIDO — o nome, o estado e a referência, e as
 * acções do pedido (abrir o dossier, imprimir, duplicar, arquivar, apagar,
 * fechar). Fica colado ao topo enquanto o painel rola. (Saiu do
 * `AdminClient.tsx` na fase 7 da estrutura do código, tal e qual.)
 */
export interface CabecalhoDoPainelProps {
  setAApagar: Dispatch<SetStateAction<Quote | null>>;
  detailTitleRef: RefObject<HTMLHeadingElement | null>;
  closeDetail: () => void;
  duplicateQuote: (q: Quote) => Promise<void>;
}

export function CabecalhoDoPainel({
  setAApagar,
  detailTitleRef,
  closeDetail,
  duplicateQuote,
}: CabecalhoDoPainelProps) {
  const { selected, locale, toast, mostrarPedido } = usePedidoAberto();
  return (
    <div className="sticky top-0 z-10 border-b border-[var(--bo-hairline)] bg-[var(--bo-surface)] px-3.5 pt-3.5 sm:px-7 sm:pt-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id="detail-drawer-title"
            ref={detailTitleRef}
            tabIndex={-1}
            title={quemPedeEOCasal(selected).titulo}
            /* line-clamp (not truncate): a global `h1,h2,h3 {
             text-wrap: balance }` is unlayered and overrides
             Tailwind's layered `truncate`, so a long name would
             wrap to many lines and shove the content down.
             Clamp to 2 lines with an ellipsis instead. */
            className="line-clamp-2 break-words font-display text-xl leading-tight text-[var(--bo-text)] focus:outline-none sm:text-2xl"
          >
            {quemPedeEOCasal(selected).titulo}
          </h2>
          {/* Quem escreveu, quando não é um dos noivos (14/10:
              «Maria Silva» em grande num pedido da Luana e do
              Afonso). Ver `quem-pede.ts`. */}
          {quemPedeEOCasal(selected).feitoPor && (
            <p className="mt-0.5 text-xs text-[var(--bo-text-muted)]">
              Pedido feito por {quemPedeEOCasal(selected).feitoPor}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            {statusBadge(selected.status)}
            <span
              className="font-mono text-[10px] tracking-tight text-foreground/40"
              title={selected.id}
            >
              Ref. {shortRef(selected.id)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Full-screen cockpit for this event — the one place that
            unifies proposta/contrato/pagamentos/produção. Primary. */}
          <Link
            href={localizeHref(`/orcamento/admin/evento/${selected.id}`, locale)}
            className={`alvo-toque h-9 gap-2 rounded-xl bg-sage-600/10 px-3.5 text-xs font-medium tracking-[0.02em] text-sage-600 ${ESTADO} ${PRESSAO} hover:bg-sage-600/[0.16] inline-flex items-center`}
            title="Abrir o Dossier do evento (vista completa: ciclo de vida, financeiro, produção)"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="9" rx="1" />
              <rect x="14" y="3" width="7" height="5" rx="1" />
              <rect x="14" y="12" width="7" height="9" rx="1" />
              <rect x="3" y="16" width="7" height="5" rx="1" />
            </svg>
            <span className="hidden sm:inline">Dossier</span>
          </Link>
          {/* Every secondary / destructive / print action tucked into
            one calm overflow menu so the header stays uncluttered. */}
          <MoreMenu
            items={[
              {
                label: "Duplicar pedido",
                hint: "Clonar para um cliente recorrente",
                onClick: () => duplicateQuote(selected),
                icon: (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
                  </svg>
                ),
              },
              {
                label: selected.archived ? "Restaurar pedido" : "Arquivar pedido",
                hint: selected.archived
                  ? "Voltar a mostrar na lista principal"
                  : "Ocultar da lista principal (reversível)",
                onClick: async () => {
                  const next = !selected.archived;
                  const confirm_ =
                    !next ||
                    window.confirm(
                      `Arquivar "${selected.name}"? Ficará oculto da lista principal.`,
                    );
                  if (!confirm_) return;
                  /**
                   * ── UM `if (res.ok)` SEM `else` NEM `catch` ──
                   *
                   * Era esta a forma anterior, e o resultado é o
                   * pior possível num gesto que faz um pedido
                   * DESAPARECER da lista: com a rede em baixo não
                   * acontecia nada nenhum — nem o pedido saía da
                   * lista, nem havia aviso. Ficava-se a olhar para
                   * um menu que não respondeu, sem saber se foi o
                   * dedo que falhou ou o servidor.
                   */
                  const oQue = `${next ? "arquivar" : "restaurar"} «${selected.name}»`;
                  let res: Response;
                  try {
                    res = await fetch(`/api/orcamento/${selected.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ archived: next }),
                    });
                  } catch {
                    toast(porqueRebentou(oQue).mensagem, "error");
                    return;
                  }
                  const corpo = await res.json().catch(() => null);
                  if (!res.ok) {
                    toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
                    return;
                  }
                  const updated = corpo as Quote;
                  mostrarPedido(updated);
                  toast(next ? "Pedido arquivado" : "Pedido restaurado", "success");
                },
                icon: (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 8v13H3V8M23 3H1v5h22V3zM10 12h4" />
                  </svg>
                ),
              },
              {
                label: "Timeline",
                hint: "Imprimir a folha de operações",
                onClick: () => printRunSheet(selected),
                icon: (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <rect x="6" y="14" width="12" height="7" rx="1" />
                  </svg>
                ),
              },
              {
                label: "Dossier PDF",
                hint: "Imprimir o dossier completo do evento",
                onClick: () => printEventDossier(selected),
                icon: (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <path
                      d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M14 2v6h6M9 13h6M9 17h6M9 9h1" strokeLinecap="round" />
                  </svg>
                ),
              },
              ...(selected.date
                ? [
                    {
                      label: "Adicionar ao calendário",
                      hint: "Descarregar .ics (Google/Apple/Outlook)",
                      onClick: () => downloadEventIcs(selected),
                      icon: (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                          <path d="M12 13v5M9.5 15.5 12 18l2.5-2.5" />
                        </svg>
                      ),
                    },
                  ]
                : []),
              {
                label: "Apagar pedido",
                hint: "Fica 30 dias na Reciclagem",
                // A pergunta nomeia o pedido e enumera o que
                // vai atrás dele. Ver `PerguntaDestrutiva`.
                onClick: () => setAApagar(selected),
                icon: (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
                  </svg>
                ),
              },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={closeDetail}
            aria-label="Fechar"
            className="px-2 pointer-coarse:min-w-11"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
}
