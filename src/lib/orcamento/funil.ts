import type { Quote } from "./types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ONDE SE PERDEM OS CLIENTES — O FUNIL DO NEGÓCIO (13/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido do Francisco (13/11): «quantos pedidos chegam, quantos viram proposta
 * e quantos fecham (…) e onde se perdem clientes». As Estatísticas já tinham a
 * conversão final (aceites ÷ decididos) e a conversão por origem; faltava o
 * passo do MEIO — a proposta —, que é o que separa «não lhe respondemos a
 * tempo / não era para nós» de «viu o preço e não quis».
 *
 *   chegaram      → todos os pedidos do período (sem os arquivados)
 *   comProposta   → os que receberam proposta: estado «cotado» ou «aceite»,
 *                   ou um envio registado na actividade (um «rejeitado» que
 *                   viu proposta conta aqui — perdeu-se DEPOIS dela)
 *   aceites       → estado «aceite»
 *
 * E os perdidos, separados pelo passo onde se perderam. Função pura.
 */
export interface Funil {
  chegaram: number;
  comProposta: number;
  aceites: number;
  /** Rejeitados sem nunca terem recebido proposta. */
  perdidosAntesDaProposta: number;
  /** Rejeitados depois de receberem proposta. */
  perdidosDepoisDaProposta: number;
  /** Ainda sem proposta e ainda em aberto (novos, em revisão, a preparar). */
  semPropostaEmAberto: number;
  /** Com proposta e ainda sem decisão. */
  aEsperarDecisao: number;
}

export function recebeuProposta(q: Pick<Quote, "status" | "activityLog">): boolean {
  if (q.status === "cotado" || q.status === "aceite") return true;
  return (q.activityLog ?? []).some((a) => a.kind === "proposal_sent");
}

export function funilDoNegocio(
  quotes: readonly Pick<Quote, "status" | "activityLog" | "archived">[],
): Funil {
  const f: Funil = {
    chegaram: 0,
    comProposta: 0,
    aceites: 0,
    perdidosAntesDaProposta: 0,
    perdidosDepoisDaProposta: 0,
    semPropostaEmAberto: 0,
    aEsperarDecisao: 0,
  };
  for (const q of quotes) {
    if (q.archived) continue;
    f.chegaram++;
    const proposta = recebeuProposta(q);
    if (proposta) f.comProposta++;
    if (q.status === "aceite") f.aceites++;
    else if (q.status === "rejeitado") {
      if (proposta) f.perdidosDepoisDaProposta++;
      else f.perdidosAntesDaProposta++;
    } else if (proposta) f.aEsperarDecisao++;
    else f.semPropostaEmAberto++;
  }
  return f;
}

/** Percentagem inteira de `parte` em `todo` (0 quando não há todo). */
export function pct(parte: number, todo: number): number {
  return todo > 0 ? Math.round((parte / todo) * 100) : 0;
}
