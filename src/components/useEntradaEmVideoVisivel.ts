"use client";

import { useEffect, useState } from "react";

/**
 * O VÍDEO DA ENTRADA ESTÁ NO ECRÃ?
 *
 * A barra de cookies é Liquid Glass no computador, e o vidro é um
 * `backdrop-filter` num elemento `fixed`. Por cima do vídeo da entrada, esse
 * filtro volta a ser calculado em CADA fotograma do vídeo, mesmo com a página
 * parada — foi o que a fez dizer «o site no PC está a travar imenso» a 29/10 e
 * a 9/11. Por isso, enquanto o vídeo se vê, a barra é só tinta; o vidro monta-se
 * quando ele sai do ecrã (ou numa página que não o tem).
 *
 * Observa o `[data-entrada]` do `EntradaEmVideo.tsx`. A barra vive no layout e
 * atravessa navegações, por isso volta a procurá-lo a cada `chave` (o caminho).
 * Arranca a `true` — sem vidro — até saber: errar para o lado barato.
 */
export function useEntradaEmVideoVisivel(chave: string): boolean {
  const [visivel, setVisivel] = useState(true);

  useEffect(() => {
    const entrada = document.querySelector("[data-entrada]");
    if (!entrada) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisivel(false);
      return;
    }
    // Sem `IntersectionObserver` não se sabe — fica sem vidro, que é o barato.
    if (typeof IntersectionObserver === "undefined") {
      setVisivel(true);
      return;
    }
    const io = new IntersectionObserver((entradas) => {
      setVisivel(entradas.some((e) => e.isIntersecting));
    });
    io.observe(entrada);
    return () => io.disconnect();
  }, [chave]);

  return visivel;
}
