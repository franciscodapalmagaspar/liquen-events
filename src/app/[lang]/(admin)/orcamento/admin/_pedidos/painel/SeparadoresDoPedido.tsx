"use client";

import { contractedAmounts } from "@/lib/orcamento/dossier";
import { type SeparadorDoPedido } from "@/lib/orcamento/pedidos/proxima-accao";
import { ESTADO, PRESSAO } from "../../ui/movimento";
import { eur } from "../../util";
import { DETAIL_TABS } from "../separadores-do-painel";
import { usePedidoAberto } from "./pedido-aberto";

/** Os três separadores do pedido como cartões, com o contador de cada um e as
 *  setas do teclado (o padrão «tablist» do WAI-ARIA). (Saíram das ferramentas
 *  do pedido na fase 7 da estrutura do código, tal e qual.) */
export interface SeparadoresDoPedidoProps {
  detailTab: SeparadorDoPedido;
}

export function SeparadoresDoPedido({ detailTab }: SeparadoresDoPedidoProps) {
  const { selected, abrirDetailTab } = usePedidoAberto();
  return (
    <>
      {/* Section tabs as cards — Arrow keys move between tabs
        (WAI-ARIA tablist pattern). Each card carries the tab's
        plain-language hint plus its live counter as a pill. */}
      <div
        role="tablist"
        aria-label="Secções do pedido"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {DETAIL_TABS.map((tab, i, arr) => {
          const active = detailTab === tab.id;
          // Contador por cartão: "N por fazer" (checklist) na
          // Produção e "falta €X" no Financeiro — visão imediata
          // sem abrir cada separador.
          let badge: string | null = null;
          if (tab.id === "producao") {
            const todo = (selected.checklist ?? []).filter((c) => !c.done).length;
            badge = todo > 0 ? `${todo} por fazer` : null;
          } else if (tab.id === "financeiro") {
            const gross = contractedAmounts(selected).gross;
            const paid = (selected.payments ?? []).reduce((s, p) => s + (p.paid ? p.amount : 0), 0);
            const out = Math.max(0, gross - paid);
            badge = out > 0 ? `falta ${eur(out)}` : null;
          }
          return (
            <button
              key={tab.id}
              id={`detail-tab-${tab.id}`}
              role="tab"
              aria-selected={active}
              aria-controls={`detail-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => abrirDetailTab(tab.id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const dir = e.key === "ArrowRight" ? 1 : -1;
                const nextIdx = (i + dir + arr.length) % arr.length;
                abrirDetailTab(arr[nextIdx].id);
                const tabs =
                  e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  );
                tabs?.[nextIdx]?.focus();
              }}
              className={`flex min-w-0 flex-col items-start gap-3 rounded-2xl border p-4 text-left motion-safe:transition-[background-color,border-color,color,box-shadow,opacity,scale,translate] motion-safe:duration-[120ms] ${PRESSAO} focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-600/55 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                active
                  ? "border-sage-600/45 bg-sage-600/[0.05] "
                  : "border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] hover:-translate-y-0.5 hover:border-[var(--bo-hairline-strong)] hover:bg-[var(--bo-tinta-6)] "
              }`}
            >
              <span
                aria-hidden
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${ESTADO} ${
                  active
                    ? "bg-sage-600/[0.12] text-sage-600"
                    : "bg-[var(--bo-tinta-6)] text-[var(--bo-text-muted)]"
                }`}
              >
                {tab.icon}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span
                  className={`text-xs font-semibold uppercase tracking-[0.08em] ${
                    active ? "text-[var(--bo-text)]" : "text-[var(--bo-tinta-72)]"
                  }`}
                >
                  {tab.label}
                </span>
                <span className="text-[11px] leading-relaxed text-foreground/50">{tab.hint}</span>
              </span>
              {badge && (
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold leading-none tracking-[0.04em] tabular-nums ${
                    active
                      ? "bg-sage-600/15 text-sage-600"
                      : "bg-[var(--bo-tinta-6)] text-[var(--bo-text-muted)]"
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
