import type { Quote, QuoteStatus } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM CASAMENTO JÁ GANHO NÃO ESTÁ «À ESPERA» DE NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A coluna «À espera» da tabela dos pedidos contava os dias desde a submissão
 * para TODOS os pedidos: debaixo desse cabeçalho, um trabalho ganho em Maio
 * aparecia com «104d» — e um perdido também.
 *
 * «Há quanto tempo este pedido entrou» e «há quanto tempo isto está parado à
 * espera de alguém» são perguntas diferentes, e a coluna existe para a segunda.
 * Um pedido em aberto está à espera de alguém; um `aceite` e um `rejeitado` não
 * estão à espera de ninguém, e mostram «—».
 *
 * `null` e não zero, pela razão escrita em `diasDeEspera`
 * (`lib/orcamento/espera.ts`): zero é um número, e um número debaixo desta
 * coluna é uma afirmação sobre quanto tempo alguém está à espera.
 *
 * (Saiu de dentro do `COLUNAS_DE_PEDIDOS`, no `AdminClient.tsx`, na fase 7 de
 * `docs/ESTRUTURA-DO-CODIGO.md`.)
 */
export function diasAEsperar(q: Quote, agora: number = Date.now()): number | null {
  if (q.status === "aceite" || q.status === "rejeitado") return null;
  return Math.floor((agora - new Date(q.submittedAt).getTime()) / 86400000);
}

/** Quantos dias sem mexer fazem um pedido em aberto contar como parado. */
export const DIAS_ATE_FICAR_PARADO = 14;

/**
 * Um pedido em aberto (ainda à espera de nós ou do casal) que já leva
 * `DIAS_ATE_FICAR_PARADO` dias. A tabela conta os dias desde a entrada; o cartão
 * do telemóvel desde a última actividade — a pergunta é a mesma, e vive aqui.
 */
export function pedidoParado(status: QuoteStatus, dias: number): boolean {
  return (
    (status === "pendente" ||
      status === "em_revisao" ||
      status === "a_preparar" ||
      status === "cotado") &&
    dias >= DIAS_ATE_FICAR_PARADO
  );
}
