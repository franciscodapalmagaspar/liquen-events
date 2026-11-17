import type { CorpoDaRecusa, Falha, Recusa, RespostaDoEnvio } from "./contrato";
import type { BytesDoPdf } from "./envio-da-proposta";

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
  | { tipo: "pdf"; pdf: BytesDoPdf; cabecalhos: Record<string, string> }
  | { tipo: "envio"; resposta: RespostaDoEnvio };

/** Uma etapa que pára o pedido — serve qualquer `Passo<T>`, porque não chega a produzir `T`. */
export type Paragem = { segue: false; desfecho: Desfecho };

/** O resultado de uma etapa: segue com `valor`, ou pára com o `desfecho`. */
export type Passo<T = undefined> = { segue: true; valor: T } | Paragem;

/** Segue, sem nada a acrescentar (as travas e as perguntas que não travam).
 *  Partilhado por todos os pedidos — por isso congelado. */
export const SEGUE: Passo = Object.freeze({ segue: true, valor: undefined });

/** Segue, com o que a etapa produziu. */
export function segue<T>(valor: T): Passo<T> {
  return { segue: true, valor };
}

/**
 * Os quatro desfechos, um construtor cada, com o nome do seu `tipo`
 * (`desfecho.envio(…)` dá `{ tipo: "envio", … }`).
 */
export const desfecho = Object.freeze({
  recusa: (status: Recusa["status"], corpo: CorpoDaRecusa): Desfecho => ({
    tipo: "recusa",
    recusa: { status, corpo },
  }),
  falha: (falha: Falha): Desfecho => ({ tipo: "falha", falha }),
  pdf: (pdf: BytesDoPdf, cabecalhos: Record<string, string>): Desfecho => ({
    tipo: "pdf",
    pdf,
    cabecalhos,
  }),
  envio: (resposta: RespostaDoEnvio): Desfecho => ({ tipo: "envio", resposta }),
});

/** Pára com uma recusa: a proposta não pode seguir assim (400, 409, 413, 422). */
export function paraComRecusa(status: Recusa["status"], corpo: CorpoDaRecusa): Paragem {
  return { segue: false, desfecho: desfecho.recusa(status, corpo) };
}

/** Pára: a base não deixou (503). */
export function paraComFalha(falha: Falha): Paragem {
  return { segue: false, desfecho: desfecho.falha(falha) };
}

/** Pára com a resposta já pronta — uma repetição: o envio já tinha seguido. */
export function paraComResposta(resposta: RespostaDoEnvio): Paragem {
  return { segue: false, desfecho: desfecho.envio(resposta) };
}
