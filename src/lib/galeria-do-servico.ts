/**
 * A REGRA DA GRELHA QUE VAI TROCANDO (1/11), sem React para se poder provar.
 *
 * Ela, na página de um serviço: «temos que alternar as fotos aqui» — e, posta a
 * escolha, «irem trocando sozinhas». A grelha tem seis posições e recebe até 18
 * fotografias (`pickServiceGalleryPool`). De `INTERVALO_MS` em `INTERVALO_MS`,
 * UMA posição troca a fotografia por uma das que estão de fora, com um fundido.
 *
 * Três cuidados, cada um com a sua razão:
 *   · uma de cada vez, e nunca a mesma posição duas vezes seguidas — trocar
 *     várias ao mesmo tempo, ou a mesma a piscar, lê-se como avaria e não como
 *     uma grelha viva;
 *   · a que entra é a que está de fora há mais tempo (uma fila) — com 18 e seis
 *     à vista, cada fotografia volta a aparecer só depois de as outras doze
 *     terem passado;
 *   · a que sai vai para o fim da fila.
 */

/** De quanto em quanto tempo troca uma posição. */
export const INTERVALO_MS = 4500;

export interface Troca {
  /** A posição da grelha (0–5) que troca. */
  posicao: number;
  /** A fotografia que entra. */
  entra: string;
  /** A fila depois da troca: sem a que entrou, com a que saiu no fim. */
  fila: string[];
}

/**
 * A próxima troca, ou `null` quando não há nada para trocar (a fila está
 * vazia — um serviço com seis fotografias só).
 *
 * `aleatorio` devolve um número em [0, 1): nos testes é fixo.
 */
export function proximaTroca(
  visiveis: readonly string[],
  fila: readonly string[],
  ultimaPosicao: number | null,
  aleatorio: () => number = Math.random,
): Troca | null {
  if (fila.length === 0 || visiveis.length === 0) return null;
  const candidatas = visiveis.map((_, i) => i).filter((i) => i !== ultimaPosicao);
  const lista = candidatas.length > 0 ? candidatas : [0];
  const posicao = lista[Math.min(lista.length - 1, Math.floor(aleatorio() * lista.length))];
  const [entra, ...resto] = fila;
  return { posicao, entra, fila: [...resto, visiveis[posicao]] };
}
