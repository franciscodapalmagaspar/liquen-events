"use client";

import { useCallback, useRef, useState, type RefObject } from "react";

/**
 * A lupa de uma pasta: que foto está em grande, de que célula partiu (para a
 * animação de abrir), e o foco devolvido a quem a abriu ao fechar.
 * Saiu do `ThemeFolder` (`Temas.tsx`) tal e qual (júri das fases 7 e 8,
 * ponto 3). Sem efeitos: mudar-lhe o sítio não mexe na ordem de nada.
 */
export function useLupaDaPasta(celulas: RefObject<Map<number, HTMLElement>>) {
  const [zoomAt, setZoomAt] = useState<number | null>(null);
  const zoomOpener = useRef<HTMLElement | null>(null);
  const [origemDaLupa, setOrigemDaLupa] = useState<DOMRect | null>(null);
  const openZoom = useCallback(
    (i: number) => {
      zoomOpener.current = document.activeElement as HTMLElement | null;
      const celula = celulas.current.get(i);
      setOrigemDaLupa(celula?.getBoundingClientRect() ?? null);
      setZoomAt(i);
    },
    [celulas],
  );
  const closeZoom = useCallback(() => {
    setZoomAt(null);
    // O foco volta de onde veio; sem isto ficava no <body> e o teclado perdia-se.
    zoomOpener.current?.focus?.();
  }, []);
  return { zoomAt, setZoomAt, origemDaLupa, openZoom, closeZoom };
}
