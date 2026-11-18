"use client";
import type { EntradaAberturaDoEstudio } from "./entrada-da-abertura";
import { useAbrirORascunhoDoServidor } from "./useAbrirORascunhoDoServidor";
import { useAbrirORascunhoLocal } from "./useAbrirORascunhoLocal";

export type { EntradaAberturaDoEstudio };

/**
 * A abertura do estúdio, em dois tempos e por esta ordem (é a ordem dos
 * efeitos): primeiro o rascunho deste computador, que é instantâneo e funciona
 * sem rede; depois o do servidor, que vale se for mais recente.
 */
export function useAberturaDoEstudio(entrada: EntradaAberturaDoEstudio) {
  useAbrirORascunhoLocal(entrada);
  useAbrirORascunhoDoServidor(entrada);
}
