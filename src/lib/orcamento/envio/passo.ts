import type { RelatorioDoPdf } from "@/lib/proposal-preview-cache";
import type { CorpoDaRecusa, Falha, Recusa, RespostaDoEnvio } from "./contrato";

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
 * que produziu, ou nada), ou PÁRA o pedido já com o desfecho final. Parar não
 * quer dizer falhar — uma repetição pára com um 200 —, e por isso o campo
 * chama-se `segue`, não `ok`. `atender-o-estudio.ts` lê-se como uma lista:
 * cada linha é «faz isto; se não segue, é essa a resposta».
 *
 * Só tipos e construtores — pode ser lido por quem quiser.
 */
export type Desfecho =
  | { tipo: "recusa"; recusa: Recusa }
  | { tipo: "falha"; falha: Falha }
  | { tipo: "pdf"; pdf: RelatorioDoPdf["pdf"]; cabecalhos: Record<string, string> }
  | { tipo: "envio"; resposta: RespostaDoEnvio };

/** Uma etapa que pára o pedido — serve qualquer `Passo<T>`, porque não chega a produzir `T`. */
export type Paragem = { segue: false; desfecho: Desfecho };

/** O resultado de uma etapa: segue com `valor`, ou pára com o `desfecho`. */
export type Passo<T = undefined> = { segue: true; valor: T } | Paragem;

/** Segue, sem nada a acrescentar (as travas e as perguntas que não travam). */
export const SEGUE: Passo = { segue: true, valor: undefined };

/** Segue, com o que a etapa produziu. */
export function segue<T>(valor: T): Passo<T> {
  return { segue: true, valor };
}

/** O desfecho de uma recusa: a proposta não pode seguir assim (400, 409, 413, 422). */
export function recusa(status: Recusa["status"], corpo: CorpoDaRecusa): Desfecho {
  return { tipo: "recusa", recusa: { status, corpo } };
}

/** Pára com uma recusa — a de {@link recusa}, dentro de um passo. */
export function paraComRecusa(status: Recusa["status"], corpo: CorpoDaRecusa): Paragem {
  return { segue: false, desfecho: recusa(status, corpo) };
}

/** O desfecho de uma falha: a base não deixou (503). */
export function falha(f: Falha): Desfecho {
  return { tipo: "falha", falha: f };
}

/** Pára com uma falha — a de {@link falha}, dentro de um passo. */
export function paraComFalha(f: Falha): Paragem {
  return { segue: false, desfecho: falha(f) };
}

/** O desfecho de um envio respondido (200). */
export function respondido(resposta: RespostaDoEnvio): Desfecho {
  return { tipo: "envio", resposta };
}

/** Pára com a resposta já pronta — uma repetição: o envio já tinha seguido. */
export function paraComResposta(resposta: RespostaDoEnvio): Paragem {
  return { segue: false, desfecho: respondido(resposta) };
}
