import type { Quote, QuoteMessage } from "./types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA MENSAGEM QUE NÃO SAIU NÃO É UMA RESPOSTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O mensageiro grava SEMPRE o que ela escreveu, mesmo quando o email não sai
 * (um pedido sem email, o correio em baixo): é o registo de que ela tentou.
 * Mas contar essa linha como «já respondemos» tirava o pedido dos lembretes de
 * pedidos por responder para sempre, com o cliente sem ter recebido nada
 * (achado n.º 8 da auditoria 6).
 *
 * As mensagens anteriores ao campo `emailed` não o têm: contam como saídas,
 * que era o que quase sempre acontecia, para nenhum pedido antigo voltar de
 * repente aos lembretes.
 */
export function mensagemSaiu(m: Pick<QuoteMessage, "emailed">): boolean {
  return m.emailed !== false;
}

/** Já se respondeu a este pedido por email — com uma mensagem que saiu. */
export function jaRespondemos(q: Pick<Quote, "messages">): boolean {
  return (q.messages ?? []).some(mensagemSaiu);
}
