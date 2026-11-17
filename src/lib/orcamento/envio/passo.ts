import type { RelatorioDoPdf } from "@/lib/proposal-preview-cache";
import type { Falha, Recusa, RespostaDoEnvio } from "./contrato";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE CADA ETAPA DEVOLVE, E O QUE O PEDIDO DEVOLVE — uma forma só
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O pedido acaba num {@link Desfecho}: uma recusa (uma DECISÃO sobre a
 * proposta), uma falha (a base ou outro serviço não deixou), o PDF da
 * pré-visualização, ou a resposta do envio. A rota traduz cada um em HTTP.
 *
 * Cada etapa que o orquestrador chama devolve um {@link Passo}: SEGUE (com o
 * que produziu, ou nada), ou PÁRA o pedido já com o desfecho final. É por
 * isso que `atender-o-estudio.ts` se lê como uma lista: cada linha é «faz isto;
 * se parou, é essa a resposta».
 *
 * Só tipos e quatro construtores — pode ser lido por quem quiser.
 */
export type Desfecho =
  | { tipo: "recusa"; recusa: Recusa }
  | { tipo: "falha"; falha: Falha }
  | { tipo: "pdf"; pdf: RelatorioDoPdf["pdf"]; cabecalhos: Record<string, string> }
  | { tipo: "envio"; resposta: RespostaDoEnvio };

/** Uma etapa que pára o pedido — serve qualquer `Passo<T>`, porque não chega a produzir `T`. */
export type Paragem = { ok: false; desfecho: Desfecho };

/** O resultado de uma etapa: segue com `valor`, ou pára com o `desfecho`. */
export type Passo<T = undefined> = { ok: true; valor: T } | Paragem;

/** Segue, sem nada a acrescentar (as travas e as perguntas que não travam). */
export const SEGUE: Passo = { ok: true, valor: undefined };

/** Segue, com o que a etapa produziu. */
export function segue<T>(valor: T): Passo<T> {
  return { ok: true, valor };
}

/** Pára: a proposta não pode seguir assim (400, 409, 413, 422). */
export function paraComRecusa(recusa: Recusa): Paragem {
  return { ok: false, desfecho: { tipo: "recusa", recusa } };
}

/** Pára: a base não deixou (503). */
export function paraComFalha(falha: Falha): Paragem {
  return { ok: false, desfecho: { tipo: "falha", falha } };
}

/** Pára: o pedido já tem resposta (uma repetição — o envio já tinha seguido). */
export function paraComResposta(resposta: RespostaDoEnvio): Paragem {
  return { ok: false, desfecho: { tipo: "envio", resposta } };
}
