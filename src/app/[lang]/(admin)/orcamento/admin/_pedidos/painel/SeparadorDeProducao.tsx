"use client";

import {
  EventChecklist,
  EventMaterial,
  EventTasks,
  EventTimeline,
  GuestList,
  ProductionPlan,
} from "../../lazy";
import { SETA_DA_GAVETA, type Gaveta } from "../../ui/gaveta";
import { ESTADO, PRESSAO } from "../../ui/movimento";
import { usePedidoAberto } from "./pedido-aberto";

/** O separador «Produção» do pedido: tarefas, checklist, material, plano de
 *  decoração, guião do dia e convidados. (Saiu das ferramentas do pedido na fase
 *  7 da estrutura do código, tal e qual.) */
export interface SeparadorDeProducaoProps {
  gavetaDoPlano: Gaveta;
}

export function SeparadorDeProducao({ gavetaDoPlano }: SeparadorDeProducaoProps) {
  const { selected, userName, alterarOAberto } = usePedidoAberto();
  return (
    <>
      {/* Preparação — the daily driver (tarefas + checklist),
          always open and first. */}
      <p className="bo-eyebrow text-foreground/45">Preparação</p>

      {/* Tasks linked to this event */}
      <EventTasks key={`tasks-${selected.id}`} quote={selected} userName={userName} />

      {/* Production checklist */}
      <EventChecklist
        key={`cl-${selected.id}`}
        quote={selected}
        onChange={(checklist) => {
          alterarOAberto({ checklist });
        }}
      />

      {/* Material que vai na carrinha */}
      <EventMaterial key={`mat-${selected.id}`} quote={selected} />

      {/* Plano &amp; dia do evento — occasional tools, collapsed so
      the tab opens short. Native <details> keeps every child
      mounted (hidden via CSS), so fetch/PATCH lifecycles are
      untouched.

      O `alvo-toque` do interruptor não é cosmético:
      MEDIDO a 375 px, este `<summary>` tinha 334×16
      e é a única porta para o plano de decoração, o
      cronograma e a lista de convidados. Um
      `<summary>` não é `<button>` nem tem `role`,
      por isso nenhuma auditoria de alvos o via —
      agora vê (ver `e2e/ergonomia-tactil.mjs`). Só
      cresce sob `(pointer: coarse)`; no portátil
      fica como estava. */}
      <details
        className="group border-t border-[var(--bo-hairline-strong)] pt-4"
        onToggle={gavetaDoPlano.aoAlternar}
      >
        <summary
          onClick={gavetaDoPlano.aoTocarNoResumo}
          className={`alvo-toque !justify-start flex list-none items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--bo-text-muted)] marker:content-none [&::-webkit-details-marker]:hidden hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
        >
          <svg
            className={`shrink-0 text-foreground/40 group-open:rotate-90 ${SETA_DA_GAVETA}`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Plano de decoração, cronograma e convidados
        </summary>
        <div className={`flex flex-col gap-4 pt-4 sm:gap-6 sm:pt-6 ${gavetaDoPlano.corpo}`}>
          {/* Decor production plan (sourcing → strike) */}
          <ProductionPlan
            key={`prod-${selected.id}`}
            quote={selected}
            onChange={(productionPlan) => {
              alterarOAberto({ productionPlan });
            }}
          />

          {/* Day-of run sheet */}
          <EventTimeline
            key={`tl-${selected.id}`}
            quote={selected}
            onChange={(timeline) => {
              alterarOAberto({ timeline });
            }}
          />

          {/* Guest list / RSVP */}
          <GuestList
            key={`guests-${selected.id}`}
            quote={selected}
            onChange={(guestList) => {
              alterarOAberto({ guestList });
            }}
          />
        </div>
      </details>
    </>
  );
}
