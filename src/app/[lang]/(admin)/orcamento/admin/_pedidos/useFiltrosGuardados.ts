"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { QuoteStatus } from "@/lib/orcamento/types";
import type { OrdemDosPedidos } from "@/lib/orcamento/pedidos/filtros-dos-pedidos";
import {
  CHAVE_DA_ORDEM,
  CHAVE_DO_FILTRO,
  filtroGuardado,
  ordemGuardada,
} from "@/lib/orcamento/pedidos/preferencias-da-lista";

interface FiltroEOrdem {
  filterStatus: QuoteStatus | "all";
  setFilterStatus: Dispatch<SetStateAction<QuoteStatus | "all">>;
  sort: OrdemDosPedidos;
  setSort: Dispatch<SetStateAction<OrdemDosPedidos>>;
}

/**
 * O filtro de estado e a ordem da lista lembram-se por aparelho. O que se lê
 * passa por `filtroGuardado`/`ordemGuardada` (a fronteira do `localStorage`).
 */
export function useFiltrosGuardados({
  filterStatus,
  setFilterStatus,
  sort,
  setSort,
}: FiltroEOrdem): void {
  // Restore the Pedidos status filter + sort the team last used (per device).
  useEffect(() => {
    try {
      const f = filtroGuardado(localStorage.getItem(CHAVE_DO_FILTRO));
      if (f) setFilterStatus(f);
      const so = ordemGuardada(localStorage.getItem(CHAVE_DA_ORDEM));
      if (so) setSort(so);
    } catch {
      /* ignore */
    }
    // Os `set*` vêm do `useFiltrosDosPedidos` e são os do `useState` — estáveis:
    // o efeito continua a correr uma vez, à montagem.
  }, [setFilterStatus, setSort]);
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_DO_FILTRO, filterStatus);
      localStorage.setItem(CHAVE_DA_ORDEM, sort);
    } catch {
      /* ignore */
    }
  }, [filterStatus, sort]);
}
