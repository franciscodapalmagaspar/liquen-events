"use client";

import Link from "next/link";
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { localizeHref } from "@/lib/i18n/config";
import { shortRef } from "@/lib/orcamento/pedidos/textos-do-pedido";
import { quemPedeEOCasal } from "@/lib/orcamento/quem-pede";
import { type Quote } from "@/lib/orcamento/types";
import { aquecerImpressao } from "../../imprimir-a-pedido";
import { Button } from "../../ui";
import { ESTADO, PRESSAO } from "../../ui/movimento";
import { statusBadge } from "../pastilha-do-estado";
import { MenuDoPedido } from "./MenuDoPedido";
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
  const { selected, locale } = usePedidoAberto();
  const quem = quemPedeEOCasal(selected);
  // O código da impressão chega antes de ela abrir o «⋯» (ver `imprimir-a-pedido.ts`).
  useEffect(aquecerImpressao, []);
  return (
    <div className="sticky top-0 z-10 border-b border-[var(--bo-hairline)] bg-[var(--bo-surface)] px-3.5 pt-3.5 sm:px-7 sm:pt-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id="detail-drawer-title"
            ref={detailTitleRef}
            tabIndex={-1}
            title={quem.titulo}
            /* line-clamp (not truncate): a global `h1,h2,h3 {
             text-wrap: balance }` is unlayered and overrides
             Tailwind's layered `truncate`, so a long name would
             wrap to many lines and shove the content down.
             Clamp to 2 lines with an ellipsis instead. */
            className="line-clamp-2 break-words font-display text-xl leading-tight text-[var(--bo-text)] focus:outline-none sm:text-2xl"
          >
            {quem.titulo}
          </h2>
          {/* Quem escreveu, quando não é um dos noivos (14/10:
              «Maria Silva» em grande num pedido da Luana e do
              Afonso). Ver `quem-pede.ts`. */}
          {quem.feitoPor && (
            <p className="mt-0.5 text-xs text-[var(--bo-text-muted)]">
              Pedido feito por {quem.feitoPor}
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
          <MenuDoPedido setAApagar={setAApagar} duplicateQuote={duplicateQuote} />
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
