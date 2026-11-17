import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LISTA DOS PEDIDOS, MUDADA SEMPRE DA MESMA MANEIRA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Havia vinte e duas cópias de `setQuotes((prev) => prev.map((q) => (q.id ===
 * … ? { ...q, X } : q)))` espalhadas pelo `AdminClient.tsx` e pelos filhos do
 * painel — cada filho a saber a forma da colecção do pai (júri das fases 7 e
 * 8, ponto 1). As quatro operações que essas cópias faziam vivem aqui, puras;
 * o `useMudancasDosPedidos` liga-as ao estado, e os filhos só dizem O QUE
 * mudou («mudar este pedido assim»), nunca COMO a lista se reescreve.
 *
 * Todas devolvem uma lista NOVA e deixam a de entrada como estava — o React só
 * redesenha o que vê mudar de identidade.
 */

/** Junta `mudanca` ao pedido `id`; os outros ficam os mesmos objectos. */
export function mudarNaLista(
  lista: readonly Quote[],
  id: string,
  mudanca: Partial<Quote>,
): Quote[] {
  return lista.map((q) => (q.id === id ? { ...q, ...mudanca } : q));
}

/** Põe `pedido` no lugar do que tem o mesmo id. */
export function substituirNaLista(lista: readonly Quote[], pedido: Quote): Quote[] {
  return lista.map((q) => (q.id === pedido.id ? pedido : q));
}

/** Põe cada pedido de `porId` no lugar do que tem o mesmo id. */
export function substituirVariosNaLista(
  lista: readonly Quote[],
  porId: ReadonlyMap<string, Quote>,
): Quote[] {
  return lista.map((q) => porId.get(q.id) ?? q);
}

/** Tira da lista os pedidos de `ids`. */
export function tirarDaLista(lista: readonly Quote[], ids: ReadonlySet<string>): Quote[] {
  return lista.filter((q) => !ids.has(q.id));
}

/** O pedido aberto depois de uma mudança na lista: só muda se for ele. */
export function abertoDepoisDe(
  aberto: Quote | null,
  porId: ReadonlyMap<string, Quote>,
): Quote | null {
  return aberto && porId.has(aberto.id) ? porId.get(aberto.id)! : aberto;
}

/**
 * As mudanças aos pedidos, pelo NOME do que aconteceu (ligadas ao estado pelo
 * `useMudancasDosPedidos`, em `admin/_pedidos/`).
 *
 * A lista (`quotes`) e o pedido aberto (`selected`) são duas cópias do mesmo
 * pedido, e cada mudança tem de chegar às duas. Os filhos do painel recebiam os
 * dois `setState` e repetiam, cada um à sua maneira, o par de linhas que as
 * mantém iguais (júri das fases 7 e 8, ponto 1). Passam a receber isto:
 *
 *   · `mudar(id, mudanca)`        — junta campos ao pedido `id`;
 *   · `substituir(pedido)`        — o servidor devolveu o pedido inteiro;
 *   · `substituirVarios(porId)`   — uma acção em bloco devolveu vários;
 *   · `tirar(ids)`                — apagados: saem da lista, e o painel fecha.
 *
 * O pedido aberto só muda quando É o pedido mudado. Alguns filhos mudavam
 * «o que estiver aberto» sem olhar ao id; numa resposta que chegasse depois de
 * se abrir outro pedido, isso colava os campos de um no outro.
 */
export interface MudancasDosPedidos {
  mudar: (id: string, mudanca: Partial<Quote>) => void;
  substituir: (pedido: Quote) => void;
  substituirVarios: (porId: ReadonlyMap<string, Quote>) => void;
  tirar: (ids: ReadonlySet<string>) => void;
}
