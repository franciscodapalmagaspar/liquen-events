"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import {
  abertoDepoisDe,
  mudarNaLista,
  substituirNaLista,
  substituirVariosNaLista,
  tirarDaLista,
} from "@/lib/orcamento/pedidos/lista-de-pedidos";
import type { MudancasDosPedidos } from "@/lib/orcamento/pedidos/lista-de-pedidos";
import type { Quote } from "@/lib/orcamento/types";

/**
 * Liga as mudanças com nome (`MudancasDosPedidos`, em
 * `lib/orcamento/pedidos/lista-de-pedidos.ts`) ao estado do `AdminClient`: a
 * lista (`quotes`) e o pedido aberto (`selected`).
 */
export function useMudancasDosPedidos(
  setQuotes: Dispatch<SetStateAction<Quote[]>>,
  setSelected: Dispatch<SetStateAction<Quote | null>>,
): MudancasDosPedidos {
  return useMemo(
    () => ({
      mudar(id, mudanca) {
        setQuotes((prev) => mudarNaLista(prev, id, mudanca));
        setSelected((prev) => (prev && prev.id === id ? { ...prev, ...mudanca } : prev));
      },
      substituir(pedido) {
        setQuotes((prev) => substituirNaLista(prev, pedido));
        setSelected((prev) => (prev?.id === pedido.id ? pedido : prev));
      },
      substituirVarios(porId) {
        setQuotes((prev) => substituirVariosNaLista(prev, porId));
        setSelected((prev) => abertoDepoisDe(prev, porId));
      },
      tirar(ids) {
        setQuotes((prev) => tirarDaLista(prev, ids));
        setSelected((prev) => (prev && ids.has(prev.id) ? null : prev));
      },
    }),
    [setQuotes, setSelected],
  );
}
