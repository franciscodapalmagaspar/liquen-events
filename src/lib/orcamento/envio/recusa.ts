import type { CorpoDaRecusa, Recusa } from "./contrato";

export type { CorpoDaRecusa, Recusa };

/**
 * O que uma etapa do envio devolve quando o envio PÁRA ali: o código HTTP e
 * o corpo, com o tipo do contrato (`contrato.ts`).
 *
 * As etapas não conhecem o `NextResponse` (são testáveis sem o Next); quem
 * transforma uma recusa em resposta é a rota, numa linha só
 * (`app/api/orcamento/[id]/proposta-doc/route.ts`).
 */
export function recusa(status: Recusa["status"], corpo: CorpoDaRecusa): Recusa {
  return { status, corpo };
}
