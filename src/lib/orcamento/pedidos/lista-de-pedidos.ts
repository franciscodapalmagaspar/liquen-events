import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MUDAR PEDIDOS DENTRO DA LISTA — as operações, puras
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A mesma linha estava escrita vinte e duas vezes pelo `AdminClient.tsx` e pelo
 * painel do pedido: `prev.map((q) => (q.id === id ? { ...q, X } : q))`. Cada
 * cópia sabia a forma da colecção do pai — e um campo novo do pedido era mais
 * um sítio onde escrever a mesma coisa. Passam a funções, com testes — e as
 * acções em lote (mudar o estado, arquivar, apagar vários) usam as mesmas.
 *
 * Nenhuma muda a lista que recebe: devolvem uma lista nova — ou a MESMA,
 * quando não há nada a mudar —, e os pedidos que não mudaram são OS MESMOS
 * objectos (o React compara-os por identidade).
 */

/** A lista com o pedido `id` alterado por `patch`. Sem esse pedido, igual. */
export function comPedidoAlterado(lista: Quote[], id: string, patch: Partial<Quote>): Quote[] {
  return lista.map((q) => (q.id === id ? { ...q, ...patch } : q));
}

/** A lista com o pedido de `novo.id` trocado por `novo` (o que o servidor
 *  devolveu). Sem esse pedido, igual — nunca o acrescenta. */
export function comPedidoSubstituido(lista: Quote[], novo: Quote): Quote[] {
  return lista.map((q) => (q.id === novo.id ? novo : q));
}

/** A lista com cada pedido que está em `porId` trocado pela versão de lá (o
 *  que o servidor devolveu num lote). Os outros ficam os mesmos. */
export function comPedidosSubstituidos(lista: Quote[], porId: ReadonlyMap<string, Quote>): Quote[] {
  if (porId.size === 0) return lista;
  return lista.map((q) => porId.get(q.id) ?? q);
}

/** A lista sem os pedidos de `ids`. */
export function semPedidos(lista: Quote[], ids: ReadonlySet<string>): Quote[] {
  if (ids.size === 0) return lista;
  return lista.filter((q) => !ids.has(q.id));
}
