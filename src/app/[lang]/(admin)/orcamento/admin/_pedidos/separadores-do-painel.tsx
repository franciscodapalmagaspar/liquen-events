import type { ReactNode } from "react";
import type { PropostaParaAFase } from "@/lib/orcamento/dossier";
import {
  proximaAccaoDoPedido,
  type DestinoDaAccao,
  type ProximaAccao,
  type SeparadorDoPedido,
} from "@/lib/orcamento/pedidos/proxima-accao";
import type { Quote } from "@/lib/orcamento/types";
import { deriveRequestLifecycle } from "../LifecycleStepper";

/**
 * Os separadores de ferramentas do painel do pedido (Produção, Financeiro,
 * Fazer proposta) e a próxima acção que os escolhe. A REGRA da próxima acção
 * é pura e vive em `lib/orcamento/pedidos/proxima-accao.ts`; aqui fica o que
 * é interface (os ícones) e a ponte que lhe dá o ciclo de vida do pedido.
 * (Saiu do `AdminClient.tsx` na fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`.)
 */

// The single "next action" surfaced on the pedido detail — derived from where
// the request sits in its lifecycle, so a newcomer always sees the one sensible
// thing to do next. It routes to the relevant tool tab, or to the always-visible
// management form ("gestao") when the next step is a form edit (e.g. reopening).
export type DetailTab = SeparadorDoPedido;
export type DetailTarget = DestinoDaAccao;

// The pedido's tool tabs, each with an icon and a plain-language hint so it's
// obvious what you do there. The tablist renders one card per tab (icon +
// label + the hint as a one-line description inside the card).
export const DETAIL_TABS: { id: DetailTab; label: string; hint: string; icon: ReactNode }[] = [
  {
    id: "producao",
    label: "Produção",
    hint: "Prepare o evento: tarefas, checklist, plano e convidados.",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      >
        <path d="M3 8l9-5 9 5v8l-9 5-9-5V8z" strokeLinejoin="round" />
        <path d="M3 8l9 5 9-5M12 13v8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "financeiro",
    label: "Financeiro",
    hint: "Preço, custos, margem e pagamentos.",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      >
        <circle cx="12" cy="12" r="9" />
        <path
          d="M15 9.5C14.5 8.5 13.3 8 12 8c-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2c-1.3 0-2.5-.5-3-1.5M12 6.5v11"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: "comunicacao",
    label: "Fazer proposta",
    hint: "Desenhar e enviar a proposta, e falar com o cliente.",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      >
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];
export function detailNextAction(
  quote: Quote,
  proposta: PropostaParaAFase | null | undefined,
): ProximaAccao {
  return proximaAccaoDoPedido(deriveRequestLifecycle(quote, proposta));
}
