"use client";

import type { ReactNode } from "react";
import { ROTULO_DO_ESTADO } from "@/lib/orcamento/estado-do-pedido";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { EscolhaDoEstado } from "../EscolhaDoEstado";

/**
 * OS ESTADOS DE UM PEDIDO, COMO SE DESENHAM — a pastilha, o selector e a cor de
 * cada um. Os RÓTULOS não vivem aqui: são os de `ROTULO_DO_ESTADO`
 * (`lib/orcamento/estado-do-pedido.ts`), que é onde se escreve a linha do
 * histórico. Eram duas cópias da mesma lista de palavras, uma aqui e outra lá,
 * presas uma à outra só por um comentário («espelham `STATUS_OPTIONS`»); agora
 * é uma. (Saiu do `AdminClient.tsx` na fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`.)
 */
export const STATUS_OPTIONS: { id: QuoteStatus; label: string; color: string }[] = [
  {
    id: "pendente",
    label: ROTULO_DO_ESTADO.pendente,
    color: "bg-[var(--bo-tinta-10)] text-foreground/50",
  },
  { id: "em_revisao", label: ROTULO_DO_ESTADO.em_revisao, color: "bg-moss/15 text-moss" },
  { id: "a_preparar", label: ROTULO_DO_ESTADO.a_preparar, color: "bg-moss/20 text-moss" },
  { id: "cotado", label: ROTULO_DO_ESTADO.cotado, color: "bg-moss/25 text-moss" },
  { id: "aceite", label: ROTULO_DO_ESTADO.aceite, color: "bg-moss/35 text-moss" },
  {
    id: "rejeitado",
    label: ROTULO_DO_ESTADO.rejeitado,
    color: "bg-[var(--bo-tinta-10)] text-foreground/30",
  },
];

// Status pill. Module-level so the memoised QuoteCard can render it too —
// it's pure (status + the module-level STATUS_OPTIONS).
export function statusBadge(status: QuoteStatus): ReactNode {
  const s = STATUS_OPTIONS.find((o) => o.id === status);
  return (
    <span
      className={`text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 rounded-sm ${s?.color ?? "bg-[var(--bo-tinta-10)] text-foreground/30"}`}
    >
      {s?.label ?? status}
    </span>
  );
}

/**
 * ── O ESTADO MUDA-SE ONDE SE LÊ ─────────────────────────────────────────────
 *
 * Palavras dela, a 14/10, com a captura da coluna «Estado» da lista: «eu
 * quero a mudança de estado para ser feita ao carregar em cima do estado em
 * que está». A pastilha passa a ser o próprio selector: carrega-se, escolhe-se
 * o estado, e muda ali — com a linha no histórico e o «Anular», como no
 * quadro.
 *
 * Primeiro foi um `<select>` nativo com o aspecto da pastilha. No mesmo dia
 * ela mandou a lista que ele abria (azul e cinzenta, a do sistema): «coloca
 * isto ao estilo da apple transparente». Passou ao `EscolhaDoEstado` — o menu
 * de vidro da casa, também no dedo, desenhado no `<body>` para a última linha
 * da tabela não o cortar. A razão inteira está no cabeçalho dele.
 */
export function PastilhaDoEstado({
  q,
  onMudar,
}: {
  q: Quote;
  onMudar: (q: Quote, status: QuoteStatus) => void;
}) {
  return (
    <EscolhaDoEstado
      forma="pastilha"
      estados={STATUS_OPTIONS}
      valor={q.status}
      aoMudar={(status) => onMudar(q, status)}
      aria-label={`Estado do pedido de ${q.name}`}
    />
  );
}
