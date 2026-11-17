/**
 * Os números da lista de pedidos: quantos se desenham de cada vez e quantos se
 * arquivam sem perguntar. Mudam com a política, não com o desenho — por isso
 * não vivem com as classes da lista (`_pedidos/pele-da-lista.ts`).
 */

/** Quantos pedidos a lista desenha de cada vez («Mostrar mais» carrega o resto). */
export const LIST_PAGE_SIZE = 50;

/** Até quantos pedidos se arquivam de uma vez sem perguntar (revisão · 3). */
export const ARQUIVAR_SEM_PERGUNTAR = 10;
