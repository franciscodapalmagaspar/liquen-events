import { type Dispatch, type SetStateAction } from "react";
import { comPedidoAlterado, comPedidoSubstituido } from "@/lib/orcamento/pedidos/lista-de-pedidos";
import { type Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS ACÇÕES SOBRE A LISTA DE PEDIDOS — o que os filhos recebem em vez do estado
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os filhos do `AdminClient` (as vistas, o painel) recebiam o `setQuotes` e o
 * `setSelected` e escreviam à mão a forma da lista. Recebem agora ACÇÕES com
 * nome, cada uma com a regra que tinha:
 *
 *   · `substituirPedido(q)` — o servidor devolveu o pedido inteiro: troca-o na
 *     lista, e no painel SÓ se ainda for esse o aberto;
 *   · `alterarPedido(id, remendo)` — muda campos de um pedido, na lista e, se
 *     for o aberto, no painel;
 *   · `mostrarPedido(q)` — troca-o na lista E abre-o.
 *
 * As listas novas saem das funções puras de `lib/orcamento/pedidos/lista-de-pedidos.ts`.
 * Não é um hook: as acções nascem a cada desenho, como nasciam as setas que
 * substituem — e nenhum filho as compara por identidade.
 */
export interface AccoesDosPedidos {
  substituirPedido: (q: Quote) => void;
  alterarPedido: (id: string, remendo: Partial<Quote>) => void;
  mostrarPedido: (q: Quote) => void;
}

export function accoesDosPedidos(
  setQuotes: Dispatch<SetStateAction<Quote[]>>,
  setSelected: Dispatch<SetStateAction<Quote | null>>,
): AccoesDosPedidos {
  return {
    substituirPedido: (q) => {
      setQuotes((prev) => comPedidoSubstituido(prev, q));
      setSelected((prev) => (prev?.id === q.id ? q : prev));
    },
    alterarPedido: (id, remendo) => {
      setQuotes((prev) => comPedidoAlterado(prev, id, remendo));
      setSelected((prev) => (prev?.id === id ? { ...prev, ...remendo } : prev));
    },
    mostrarPedido: (q) => {
      setQuotes((prev) => comPedidoSubstituido(prev, q));
      setSelected(q);
    },
  };
}
