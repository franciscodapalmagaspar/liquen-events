/**
 * O tempo da armadilha de tempo, num sítio só — o servidor (`selo.ts`) e o
 * formulário (`useSeloDoFormulario`) leem daqui. Sem `server-only`: o
 * formulário precisa dos números, e aqui não há segredo nenhum.
 */

/** Abaixo disto, entre abrir e enviar, ninguém preenche um formulário. */
export const MINIMO_MS = 3_000;

/**
 * Quanto o formulário espera, desde que o selo chegou, antes de enviar. Os
 * 3 s e meio segundo de folga: o selo é assinado no servidor ANTES de chegar
 * ao browser (a conta do servidor já é maior do que esta), e a folga cobre
 * um desacerto pequeno entre os relógios de duas instâncias.
 */
export const ESPERA_ANTES_DE_ENVIAR_MS = MINIMO_MS + 500;

/** Quantos ms faltam esperar, dado o instante em que o selo chegou. */
export function quantoFaltaEsperar(recebidoEm: number, agora: number): number {
  return Math.max(0, ESPERA_ANTES_DE_ENVIAR_MS - (agora - recebidoEm));
}
