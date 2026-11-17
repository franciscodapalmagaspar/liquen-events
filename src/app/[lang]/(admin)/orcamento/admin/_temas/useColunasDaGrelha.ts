"use client";

import { useEffect, useRef, useState } from "react";

/**
 * As colunas da grelha de fotos de uma pasta, medidas — e a foto com o foco.
 * Saiu do `ThemeFolder` (`Temas.tsx`) tal e qual (júri das fases 7 e 8, ponto
 * 3), chamado no mesmo sítio: a ordem dos efeitos não muda.
 */
export function useColunasDaGrelha(loading: boolean, semFotos: boolean) {
  /* ════════════════════════════════════════════════════════════════════════
     A GRELHA PELO TECLADO — fase 11 (`docs/APPLE-TEMAS.md`, Parte 7)
     ════════════════════════════════════════════════════════════════════════

     O desenho do Calendário (`diaPelaTecla`): a grelha é UM sítio no fio do
     Tab, e lá dentro as setas andam. Sessenta fotos eram sessenta paragens do
     Tab — mais sessenta «⋯» — antes de se chegar ao que vem depois.

     As colunas MEDEM-SE: o `GRELHA_DE_FOTOS` é `auto-fill`, e o número muda
     com a largura da caixa (2 no telemóvel, 4 a 6 no computador). O browser
     já fez a conta — o `grid-template-columns` calculado traz uma largura por
     coluna —, e é essa conta que se lê. Sem `ResizeObserver` (jsdom) fica o 2
     da base, que é o que a classe diz antes de qualquer `@container`. */
  const grelha = useRef<HTMLDivElement | null>(null);
  const [colunas, setColunas] = useState(2);
  const [fotoComFoco, setFotoComFoco] = useState(0);
  useEffect(() => {
    const el = grelha.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      // `none` é o que o jsdom (e uma caixa sem `display: grid`) responde: não
      // é uma coluna, é a ausência de grelha — fica o que estava.
      const v = getComputedStyle(el).gridTemplateColumns;
      if (!v || v === "none") return;
      const n = v.split(" ").filter(Boolean).length;
      if (n > 0) setColunas(n);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
    // A grelha só existe depois de carregar e com fotos: é quando ela aparece
    // (e não a cada foto) que há uma caixa nova a medir.
  }, [loading, semFotos]);
  return { grelha, colunas, fotoComFoco, setFotoComFoco };
}
