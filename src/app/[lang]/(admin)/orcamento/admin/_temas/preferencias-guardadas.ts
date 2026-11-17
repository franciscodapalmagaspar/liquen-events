import {
  lerDensidadeGuardada,
  lerOrdemGuardada,
  type Densidade,
  type Ordem,
} from "@/lib/temas/ordem";

/**
 * A ordem e a densidade que ela escolheu, lembradas neste aparelho.
 *
 * É a casca da regra que vive em `lib/temas/ordem.ts`: aqui só se lê e escreve
 * no `localStorage`; o que conta como uma ordem ou uma densidade válida decide-o
 * a regra. (Júri de arquitetura das fases 7 e 8.)
 */

export const ORDEM_KEY = "liquen-temas-ordem";

export const DENSIDADE_KEY = "liquen-temas-densidade";

export function lerOrdem(): Ordem | null {
  try {
    return lerOrdemGuardada(window.localStorage.getItem(ORDEM_KEY));
  } catch {
    return null;
  }
}

export function guardarOrdem(o: Ordem): void {
  try {
    window.localStorage.setItem(ORDEM_KEY, o);
  } catch {
    // Ver `guardarDensidade`.
  }
}

/** Lê a preferência guardada. Nunca lança — um `localStorage` indisponível
 *  (janela privada, política do browser) vale como "não há preferência". */
export function lerDensidade(): Densidade | null {
  try {
    return lerDensidadeGuardada(window.localStorage.getItem(DENSIDADE_KEY));
  } catch {
    return null;
  }
}

export function guardarDensidade(d: Densidade): void {
  try {
    window.localStorage.setItem(DENSIDADE_KEY, d);
  } catch {
    // Perder a preferência é um incómodo; deitar o ecrã abaixo por causa dela
    // não tem desculpa nenhuma.
  }
}
