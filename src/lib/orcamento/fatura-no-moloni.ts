import type { Quote, RascunhoNoMoloni } from "./types";

/**
 * Uma fase (sinal ou saldo) TEM fatura no Moloni quando lá está o documento
 * (`documentId`) ou foi passada à mão (`manual`). A marca de «a ser criado»
 * (`aCriarDesde`, sem documento) não conta: é um trinco que caduca ao fim de
 * 2 minutos, não um documento fiscal. Uma regra só, para a rota do Moloni e
 * para o apagar de um pedido (`o-que-prende-o-pedido.ts`). Puro.
 */
export function faturaJaEstaNoMoloni(
  e?: Pick<RascunhoNoMoloni, "documentId" | "manual"> | null,
): boolean {
  return !!(e?.documentId || e?.manual);
}

/** Quantas fases do pedido têm fatura no Moloni (0 a 2). Puro. */
export function faturasNoMoloni(pedido: Pick<Quote, "faturasMoloni"> | null): number {
  return Object.values(pedido?.faturasMoloni ?? {}).filter(faturaJaEstaNoMoloni).length;
}
