import type { ActivityEntry, Quote, QuoteStatus } from "@/lib/orcamento/types";
import { asPropostasMudaram } from "./percentagem-do-sinal";
import { ROTULO_DO_ESTADO } from "@/lib/orcamento/estado-do-pedido";
import { randomId } from "./util";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O «ANULAR» DE UMA MUDANÇA DE ESTADO DO PEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O gesto ao contrário, gravado como qualquer outro: o estado volta ao que
 * era, e fica a linha no histórico a dizer que foi anulado e por quem. Serve
 * o Kanban, a gaveta, o «Marcar como» em massa e o «Ganhou? / Perdeu?».
 *
 * Quando o que se anula é um «Ganho», manda `desfazerGanho` — o servidor leva
 * de volta a proposta aceite e o contrato pendente que esse Ganho criou (ver
 * `desfazerCadeiaDoGanho`). Mover de Ganho para outro sítio SEM ser um
 * «Anular» não leva nada: um casamento que caiu não é um engano.
 *
 * Atira com uma frase legível quando o servidor recusa, para o `useAnular`
 * a mostrar.
 */
export async function reporEstadoDoPedido({
  quoteId,
  de,
  para,
  actor,
  extra,
  semReler,
}: {
  quoteId: string;
  /** Outros campos a repor no mesmo gesto (ex.: o valor que o «Ganho» escreveu). */
  extra?: Record<string, unknown>;
  /** O estado ANTES do gesto — para onde se volta. */
  de: QuoteStatus;
  /** O estado que o gesto pôs — de onde se sai. */
  para: QuoteStatus;
  actor?: string;
  /**
   * Quem anula também a PROPOSTA a seguir (Propostas, Acompanhamento) relê a
   * lista leve ele próprio, depois disso — senão eram duas leituras, e a
   * primeira com a proposta ainda por repor.
   */
  semReler?: boolean;
}): Promise<Quote | null> {
  const entrada: ActivityEntry = {
    id: randomId(),
    at: new Date().toISOString(),
    kind: "status_change",
    actor,
    summary: `${ROTULO_DO_ESTADO[para] ?? para} → ${ROTULO_DO_ESTADO[de] ?? de} · anulado`,
  };
  const res = await fetch(`/api/orcamento/${encodeURIComponent(quoteId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...extra,
      status: de,
      activityLogAppend: [entrada],
      ...(para === "aceite" && de !== "aceite" ? { desfazerGanho: true } : {}),
    }),
  });
  const corpo = (await res.json().catch(() => null)) as (Quote & { error?: string }) | null;
  if (!res.ok) throw new Error(corpo?.error || `Não foi possível anular (${res.status}).`);
  // Repor um «Ganho» ou um «Perdido» repõe também a proposta no servidor: a
  // lista leve (fase do pedido, Pagamentos) relê-se, DEPOIS do PATCH.
  if (!semReler) asPropostasMudaram();
  return corpo;
}
