import type { Quote } from "./types";
import { ROTULO_DO_ESTADO } from "./estado-do-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANDO É QUE AS COISAS ACONTECERAM A UM PEDIDO — E NÃO QUANDO FOI GRAVADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As Estatísticas contavam «Dias até fechar» e «Tempo de resposta» a partir do
 * `lastUpdated`, que muda a CADA gravação: uma nota escrita três meses depois
 * do Ganho punha esse casamento a «demorar» três meses a fechar, e um pedido
 * sem mensagens contava como respondido no dia em que alguém lhe mudou a data.
 *
 * Aqui lê-se o momento verdadeiro, do que o pedido já guarda: a linha do
 * histórico que o pôs em «Ganho», e o primeiro contacto (mensagem, chamada ou
 * proposta enviada). Sem esse registo, devolve `undefined` — e quem conta não
 * conta esse pedido, em vez de inventar uma data.
 */

/** «… → Ganho», com ou sem o motivo da transição automática a seguir. */
const PARA_GANHO = new RegExp(`→\\s*${ROTULO_DO_ESTADO.aceite}(\\s|·|\\(|$)`);

/** O momento em que o pedido passou a «Ganho» pela ÚLTIMA vez. */
export function quandoFoiGanho(q: Pick<Quote, "activityLog">): string | undefined {
  let ultimo: string | undefined;
  for (const e of q.activityLog ?? []) {
    if (e.kind !== "status_change" || !PARA_GANHO.test(e.summary ?? "")) continue;
    if (Number.isNaN(Date.parse(e.at))) continue;
    if (!ultimo || e.at > ultimo) ultimo = e.at;
  }
  return ultimo;
}

const CONTACTOS = new Set(["message_sent", "call_logged", "proposal_sent"]);

/**
 * O primeiro contacto da equipa com o cliente: a primeira mensagem, chamada ou
 * proposta enviada registada no pedido, ou o envio da primeira proposta.
 */
export function quandoRespondemos(
  q: Pick<Quote, "messages" | "activityLog">,
  propostasEnviadasEm: readonly (string | undefined)[] = [],
): string | undefined {
  const candidatos: string[] = [];
  const primeiraMensagem = q.messages?.[0]?.at;
  if (primeiraMensagem) candidatos.push(primeiraMensagem);
  for (const e of q.activityLog ?? []) if (CONTACTOS.has(e.kind)) candidatos.push(e.at);
  for (const s of propostasEnviadasEm) if (s) candidatos.push(s);
  const validos = candidatos.filter((c) => !Number.isNaN(Date.parse(c)));
  if (validos.length === 0) return undefined;
  return validos.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a));
}
