/**
 * O que uma etapa do envio devolve quando o envio PÁRA ali: o código HTTP e
 * o corpo JSON, tal e qual a rota os responde.
 *
 * As etapas não conhecem o `NextResponse` (são testáveis sem o Next); quem
 * transforma uma recusa em resposta é a rota, numa linha só
 * (`app/api/orcamento/[id]/proposta-doc/route.ts`).
 */
export interface Recusa {
  status: number;
  corpo: Record<string, unknown>;
}

export function recusa(status: number, corpo: Record<string, unknown>): Recusa {
  return { status, corpo };
}
