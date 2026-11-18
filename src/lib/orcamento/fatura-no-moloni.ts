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
 * A marca NÃO caduca para o apagar (revisão de 18/11, R3). Uma marca sem
 * documento fica de três maneiras: o Moloni recusou e a limpeza falhou; o
 * rascunho foi criado e o registo falhou (a rota avisa «Não o cries outra
 * vez»); ou o servidor morreu a meio. Só na primeira se sabe que não há
 * documento — e é aí que a rota a tira, com uma segunda tentativa. Nas outras
 * não há como distinguir sem perguntar ao Moloni (a API dele não tem, aqui,
 * uma procura por referência), e tirá-la — por um prazo ou numa recusa
 * 422/503 — podia deixar um documento fiscal sem origem. O preço: o pedido
 * fica preso até a próxima tentativa no cartão da fatura (passados os 2
 * minutos) a substituir, com o documento ou sem a marca.
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
