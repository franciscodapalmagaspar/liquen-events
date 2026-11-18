"use client";

import { createContext, use } from "react";
import type { Estudio } from "./useEstudioDaProposta";

/**
 * O estúdio de uma proposta, para as peças do ecrã.
 *
 * O `useEstudioDaProposta` junta os ganchos de cada domínio (documento,
 * gravação, fotos, orçamento, PDF, envio) e o `ProposalStudio` põe o
 * resultado aqui. Cada peça lê só as fatias de que precisa — em vez de as
 * receber por propriedades, de mão em mão, por quatro ou cinco níveis.
 *
 * O valor muda a cada desenho do estúdio, como mudavam as variáveis quando o
 * ecrã estava todo num componente: as peças desenham-se quando ele se desenha,
 * nem mais nem menos vezes do que antes.
 */
export const ContextoDoEstudio = createContext<Estudio | null>(null);

export function useEstudio(): Estudio {
  const estudio = use(ContextoDoEstudio);
  if (!estudio) throw new Error("useEstudio() só funciona dentro do ProposalStudio.");
  return estudio;
}
