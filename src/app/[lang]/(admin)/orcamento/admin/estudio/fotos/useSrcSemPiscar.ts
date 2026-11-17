"use client";

import { useEffect, useState } from "react";

/**
 * A foto de uma célula, com a URL a trocar SEM a célula piscar.
 *
 * Quando uma foto provisória assenta, o caminho muda e com ele a URL assinada —
 * mesmos pixéis, morada nova. Pôr a nova no `src` de imediato deixava a célula
 * branca durante o download: a foto desaparecia para voltar igual, que é o
 * salto que este ecrã não pode ter. Por isso a nova só entra depois de estar
 * descarregada; até lá continua a ver-se a que já estava.
 *
 * Só quando JÁ há foto desenhada: a primeira nunca espera por nada.
 */
export function useSrcSemPiscar(url?: string): string | undefined {
  /** A última URL que já esteve mesmo desenhada nesta célula. */
  const [pronta, setPronta] = useState<string | undefined>(url);
  useEffect(() => {
    if (!url || url === pronta) return;
    let alive = true;
    const pre = new window.Image();
    // Falhar também troca: a célula tem o seu próprio estado de erro, e ficar
    // presa à foto antiga seria mostrar uma coisa que já não está no documento.
    const swap = () => {
      if (alive) setPronta(url);
    };
    pre.onload = swap;
    pre.onerror = swap;
    pre.decoding = "async";
    pre.src = url;
    return () => {
      alive = false;
    };
    // `pronta` é o que já está no ecrã: entrar nas dependências reexecutaria
    // isto no momento exato em que a troca acabou de acontecer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  // Sem nada desenhado, a URL nova entra já — a primeira foto nunca espera.
  return pronta && url ? pronta : url;
}
