import type { Quote, QuoteStatus } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PEDIDO QUE ANDA PARA A FRENTE SEM DATA DE EVENTO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * F-15 da auditoria: «Maria João Fernandes e Marlon Valadares não têm data de
 * evento ("—") e mesmo assim contam como pedidos ativos com proposta enviada.
 * Não há sinal a dizer que falta o dado mais importante para reservar a data.»
 *
 * A data não é mais um campo. É o campo de que dependem: a disponibilidade
 * («esse dia já está ocupado»), o calendário, a contagem decrescente que a
 * lista mostra, a produção que nasce ao ganhar, e o aviso de data ocupada. Um
 * pedido sem data atravessa tudo isso em silêncio — e o silêncio, aqui, lê-se
 * como «está tratado».
 *
 * ── PORQUE É QUE O AVISO NÃO É PARA TODOS OS PEDIDOS SEM DATA ─────────────
 *
 * Um pedido acabado de chegar sem data é NORMAL — em Évora há dezenas de
 * casamentos por marcar, e o próprio `AdminClient` já tem escrito que «datas
 * por marcar há às dezenas». Avisar aí punha uma etiqueta vermelha em quase
 * todos os pedidos novos, e uma etiqueta que está em todo o lado deixa de se
 * ver. Seria trocar um problema por um pior.
 *
 * O que a auditoria aponta é outra coisa: a data continuar em falta DEPOIS de
 * a proposta ter seguido. Aí já houve conversa, já houve um valor, já se
 * prometeu um serviço — e não há dia nenhum reservado.
 *
 * ── E PORQUE É QUE O «ACEITE» TAMBÉM CONTA ───────────────────────────────
 *
 * É o pior caso dos três, não o mais inofensivo: o negócio está ganho, a
 * produção nasce ao ganhar, e não há data para a pendurar. Sem isto, o aviso
 * DESAPARECIA exactamente no momento em que passa a custar dinheiro.
 *
 * O `rejeitado` fica de fora porque acabou; o `pendente`, o `em_revisao` e o
 * `a_preparar` porque ainda é cedo — a proposta ainda não seguiu.
 */

/** Os estados em que um pedido sem data já é um problema, e não uma fase. */
export const ESTADOS_QUE_EXIGEM_DATA: readonly QuoteStatus[] = ["cotado", "aceite"];

/**
 * `true` quando o pedido já seguiu (ou foi ganho) e continua sem data de
 * evento.
 *
 * O `trim()` não é zelo: o campo é escrito à mão num `<input type="date">` e
 * gravado como texto, e uma cadeia de espaços é indistinguível de uma data para
 * quem só pergunta se o campo existe — mas não marca dia nenhum.
 */
export function faltaADataDoEvento(q: Pick<Quote, "date" | "status">): boolean {
  if ((q.date ?? "").trim() !== "") return false;
  return ESTADOS_QUE_EXIGEM_DATA.includes(q.status);
}

/**
 * O que se escreve ao lado do pedido. Uma frase, e não um símbolo: a regra da
 * casa é que um estado nunca é dito só pela cor, e «—» não é dizer nada.
 */
export const AVISO_SEM_DATA = "Sem data do evento";

/** O porquê, para quem passa o rato ou ouve a página. */
export const PORQUE_FALTA_A_DATA =
  "A proposta já seguiu e não há data marcada — sem ela não há dia reservado, " +
  "não entra no calendário e o aviso de data ocupada não a pode proteger.";
