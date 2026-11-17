"use client";

import { useCallback, useEffect, useState } from "react";
import { comNovaAmostra, type AmostraDeGeracao } from "@/lib/custo-do-pdf";

/**
 * As medições das gerações de PDF, partilhadas por TODAS as propostas.
 *
 * Sem o id do pedido de propósito: o que se aprende numa proposta serve para a
 * seguinte — é a mesma máquina, a mesma ligação e o mesmo servidor. Preso à
 * proposta, a primeira geração de cada uma seria sempre uma adivinha.
 *
 * A chave mudou com o desenho novo do PDF (`pdf-editorial`): as medições do
 * antigo — ~1 s e ~190 KB por foto — ensinavam a recta errada ao novo, que
 * custa quase tudo à cabeça. As antigas ficam esquecidas no navegador.
 */
const AMOSTRAS_KEY = "liquen-proposal-studio:geracoes-editorial";

/**
 * ── O QUE AS GERAÇÕES ANTERIORES ENSINARAM ──────────────────────────────
 *
 * Cada PDF gerado deixa uma amostra `{fotos, ms, bytes}`, e é dela que sai a
 * estimativa que aparece antes do botão. Vive fora do rascunho e SEM o id do
 * pedido: o que se aprende com uma proposta serve para a seguinte — é a
 * mesma máquina, a mesma ligação e o mesmo servidor.
 *
 * Saiu do `ProposalStudio` tal e qual (fase 3 de `docs/ESTRUTURA-DO-CODIGO.md`).
 */
export function useAmostrasDeGeracao(): {
  amostras: AmostraDeGeracao[];
  apontarGeracao: (fotos: number, ms: number, bytes: number) => void;
} {
  const [amostras, setAmostras] = useState<AmostraDeGeracao[]>([]);
  useEffect(() => {
    try {
      const cru = localStorage.getItem(AMOSTRAS_KEY);
      const lidas = cru ? JSON.parse(cru) : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(lidas)) setAmostras(lidas.filter((x) => x && typeof x.ms === "number"));
    } catch {
      /* sem amostras — a estimativa usa o modelo de arranque */
    }
  }, []);

  /** Aponta uma geração e guarda-a para a próxima estimativa. */
  const apontarGeracao = useCallback((fotos: number, ms: number, bytes: number) => {
    setAmostras((antes) => {
      const proximas = comNovaAmostra(antes, { fotos, ms, bytes });
      try {
        localStorage.setItem(AMOSTRAS_KEY, JSON.stringify(proximas));
      } catch {
        /* sem espaço: a estimativa desta sessão continua a valer */
      }
      return proximas;
    });
  }, []);

  return { amostras, apontarGeracao };
}
