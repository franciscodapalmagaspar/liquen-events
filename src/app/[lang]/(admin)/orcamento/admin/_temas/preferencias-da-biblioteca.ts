import { ORDENS, type Densidade, type Ordem } from "@/lib/temas/ordem";

/**
 * A escolha dela na Biblioteca de Temas, lembrada neste aparelho (ordem e
 * densidade), e o que só a interface precisa de saber (as colunas, o nome do
 * menu). As regras puras estão em `lib/temas/ordem.ts`.
 */

/** O que o «⋯» da barra de topo governa, para o rótulo acessível — «Acções de
 *  Biblioteca de Temas». Sem isto ele chamava-se «Acções» como os dos cartões,
 *  e numa grelha de 28 haveria 29 botões com o mesmo nome. */
export const MENU_DA_BIBLIOTECA = "Biblioteca de Temas";

export const ORDEM_KEY = "liquen-temas-ordem";

export function lerOrdem(): Ordem | null {
  try {
    const v = window.localStorage.getItem(ORDEM_KEY);
    return ORDENS.some((o) => o.valor === v) ? (v as Ordem) : null;
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

export const DENSIDADE_KEY = "liquen-temas-densidade";

/** Lê a preferência guardada. Nunca lança — um `localStorage` indisponível
 *  (janela privada, política do browser) vale como "não há preferência". */
export function lerDensidade(): Densidade | null {
  try {
    const v = window.localStorage.getItem(DENSIDADE_KEY);
    return v === "confortavel" || v === "compacto" ? v : null;
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

/**
 * As colunas de cada densidade.
 *
 * DUAS no telemóvel nas duas: uma coluna com cartões enormes obrigava a
 * percorrer a biblioteca inteira de baixo para cima.
 *
 * "Compacto" chega a seis colunas porque é exactamente o número de temas de
 * hoje — o pedido era vê-los todos de uma vez, sem scroll.
 */
/**
 * ── AS COLUNAS, E PORQUE É QUE A FOLGA NÃO É QUADRADA ─────────────────────
 *
 * Pedido dela, na Fase 3: «mais folga entre os cartões».
 *
 * A folga VERTICAL é maior do que a horizontal, e não por gosto: desde que um
 * cartão pode ter uma linha pendurada por baixo dele — «Lê-se como "italia" ·
 * Juntar» —, uma folga igual nos dois sentidos punha essa linha à mesma
 * distância do cartão a que pertence e do cartão de baixo. Lia-se como sendo
 * do outro.
 *
 * Horizontalmente muda pouco: a 390 px são duas colunas, e cada píxel de folga
 * sai da fotografia. É o lado onde a folga custa e o lado onde não fazia falta.
 */
export const COLUNAS: Record<Densidade, string> = {
  confortavel: "grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4",
  compacto: "grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4 lg:grid-cols-6",
};
