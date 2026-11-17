import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MUDAR UM PEDIDO DENTRO DA LISTA — as duas operações, puras
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A mesma linha estava escrita vinte e duas vezes pelo `AdminClient.tsx` e pelo
 * painel do pedido: `prev.map((q) => (q.id === id ? { ...q, X } : q))`. Cada
 * cópia sabia a forma da colecção do pai — e um campo novo do pedido era mais
 * um sítio onde escrever a mesma coisa. Passam a duas funções, com testes.
 *
 * Nenhuma das duas muda a lista que recebe: devolvem uma lista nova, e os
 * pedidos que não mudaram são OS MESMOS objectos (o React compara-os por
 * identidade).
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
