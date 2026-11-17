/**
 * Para os TESTES das etapas do envio: o que um `Passo` parado respondeu. Fora
 * do `passo.ts` de propósito — o código do envio nunca lê um passo assim, lê o
 * `ok` e devolve o `desfecho` tal e qual.
 */
import type { Passo } from "./passo";

/** A recusa com que o passo parou — ou `null` (seguiu, ou parou de outra forma). */
export function recusaDe(p: Passo<unknown>) {
  return !p.ok && p.desfecho.tipo === "recusa" ? p.desfecho.recusa : null;
}

/** A resposta com que o passo parou (uma repetição) — ou `null`. */
export function respostaDe(p: Passo<unknown>) {
  return !p.ok && p.desfecho.tipo === "envio" ? p.desfecho.resposta : null;
}
