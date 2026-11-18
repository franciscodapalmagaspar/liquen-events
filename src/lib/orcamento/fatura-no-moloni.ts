import type { Quote, RascunhoNoMoloni } from "./types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FATURA NO MOLONI — DUAS PERGUNTAS DIFERENTES, NUM SÍTIO SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A rota do Moloni e o apagar de um pedido olham para a mesma fase (sinal ou
 * saldo), mas perguntam coisas diferentes, e cada uma erra para o seu lado:
 *
 *  · a ROTA quer saber se a fatura JÁ LÁ ESTÁ de certeza
 *    ({@link faturaJaEstaNoMoloni}), para não criar outra. Uma marca de «a ser
 *    criado» (`aCriarDesde`) caduca ao fim de 2 minutos: um pedido que morreu a
 *    meio não pode bloquear a fase para sempre;
 *  · o APAGAR quer saber se PODE haver um documento fiscal
 *    ({@link faseQuePodeTerFaturaNoMoloni}), porque apagar o pedido tira à
 *    fatura a origem de vez. Aqui a marca conta, nova ou velha: a rota põe-na
 *    ANTES de falar com o Moloni e só a troca pelo `documentId` DEPOIS de o
 *    rascunho existir lá — se essa última escrita falha (ou o pedido sai entre
 *    as duas), a marca é o único rasto de um rascunho que existe. Na dúvida,
 *    num registo fiscal, apaga-se de menos (júri de 18/11, 12.ª volta).
 *
 * O preço do lado seguro: uma marca que ficou de um pedido em que o Moloni
 * recusou E a limpeza da marca também falhou prende o pedido até a próxima
 * tentativa no cartão da fatura a substituir (passados os 2 minutos).
 */

/** A fase TEM fatura no Moloni: lá está o documento, ou foi passada à mão. Puro. */
export function faturaJaEstaNoMoloni(
  e?: Pick<RascunhoNoMoloni, "documentId" | "manual"> | null,
): boolean {
  return !!(e?.documentId || e?.manual);
}

/**
 * A fase PODE ter um documento no Moloni: o que {@link faturaJaEstaNoMoloni}
 * diz, mais a marca de «a ser criado» (de qualquer idade) e os rascunhos
 * anteriores da fase («Criar outro rascunho»), que também lá existem. Puro.
 */
export function faseQuePodeTerFaturaNoMoloni(
  e?: Pick<RascunhoNoMoloni, "documentId" | "manual" | "aCriarDesde" | "anteriores"> | null,
): boolean {
  return faturaJaEstaNoMoloni(e) || !!e?.aCriarDesde || (e?.anteriores?.length ?? 0) > 0;
}

/** Quantas fases do pedido podem ter fatura no Moloni (0 a 2) — a do apagar. Puro. */
export function fasesQuePodemTerFaturaNoMoloni(
  pedido: Pick<Quote, "faturasMoloni"> | null,
): number {
  return Object.values(pedido?.faturasMoloni ?? {}).filter(faseQuePodeTerFaturaNoMoloni).length;
}
