/**
 * As duas regras da lista de pedidos que não são desenho: quantos se mostram
 * de cada vez e quantos se arquivam sem perguntar. Mudam com a política, e
 * não com o aspecto — por isso não vivem ao lado das classes da lista
 * (`_pedidos/pele-da-lista.ts`).
 */

/** Quantos pedidos a lista renderiza de cada vez («Mostrar mais» carrega o resto). */
export const LIST_PAGE_SIZE = 50;

/** Até quantos pedidos se arquivam de uma vez sem perguntar (revisão · 3). */
export const ARQUIVAR_SEM_PERGUNTAR = 10;

/** Quantas escritas de um lote do back office podem estar no ar ao mesmo tempo. */
export const ESCRITAS_EM_SIMULTANEO = 4;
