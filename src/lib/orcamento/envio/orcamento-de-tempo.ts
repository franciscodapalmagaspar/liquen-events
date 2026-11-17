/**
 * ── O ORÇAMENTO DE TEMPO DO ENVIO (A10-004, A10-005) ───────────────────────
 *
 * As três peças da mesma regra, num sítio só: o tecto da função, a folga do
 * email e a folga da segunda passagem do PDF. A rota declara o `maxDuration`
 * como número escrito à mão (o Next lê-o do ficheiro, não o calcula), e
 * `orcamento-de-tempo.test.ts` prende-o a {@link TECTO_DO_ENVIO_S}.
 *
 * Tudo isto cabe nos 60 s da função — o desenho do PDF (até duas vezes, com
 * fotografias que podem demorar 8 s cada), e depois o email, com tempos de
 * 8/8/20 s no SMTP. Ninguém contava o tempo que já tinha passado: um PDF lento
 * empurrava o SMTP para lá dos 60 s, a plataforma matava a função a meio do
 * envio, e ela via um erro sem saber se o email tinha saído.
 *
 * Duas regras, contadas a partir da chegada do pedido:
 *  · a SEGUNDA tentativa do PDF só corre se ainda houver tempo para ela e para
 *    o email depois dela (`desenhar-o-pdf.ts`);
 *  · o email só começa com {@link FOLGA_DO_EMAIL_MS} pela frente. Sem ela, não
 *    se começa: a proposta fica gravada como «gerada, por enviar» e a frase
 *    diz-lhe para carregar outra vez — um reenvio que já não paga o desenho
 *    (`mandar-o-email.ts`).
 */

/** O `maxDuration` da rota: 60 s, o tecto do plano. */
export const TECTO_DO_ENVIO_S = 60;
/** O que o email precisa pela frente para começar. */
export const FOLGA_DO_EMAIL_MS = 25_000;
/** O que uma segunda passagem do PDF costuma levar, com folga. */
export const FOLGA_DA_SEGUNDA_PASSAGEM_MS = 15_000;

/** Quantos ms sobram do orçamento de um pedido que chegou em `chegou`. */
export function relogioDoEnvio(chegou: number): () => number {
  return () => TECTO_DO_ENVIO_S * 1000 - (Date.now() - chegou);
}
