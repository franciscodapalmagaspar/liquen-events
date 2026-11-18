"use client";
import { useEffect, useRef, useState } from "react";
import { seguirASeleccao } from "../../../seleccao-de-fotos";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";

export interface EntradaSeleccaoDeFotos {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
}

/** As fotos escolhidas nos mood boards para serem movidas em conjunto. */
export function useSeleccaoDeFotos({ documento }: EntradaSeleccaoDeFotos) {
  const { doc } = documento;
  /** As fotos escolhidas — chaves `bi:ii`. */
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  /** A fotografia (o caminho) de cada escolha — ver `useSeleccaoSegueAFotografia`. */
  const caminhoDaSeleccaoRef = useRef<Map<string, string>>(new Map());

  /** Escolher (ou desescolher) uma foto para o conjunto que se move de uma vez. */
  function alternarSeleccao(bi: number, ii: number) {
    const path = doc.moodBoards[bi]?.images[ii];
    if (typeof path === "string") caminhoDaSeleccaoRef.current.set(`${bi}:${ii}`, path);
    setSeleccionadas((antes) => {
      const proxima = new Set(antes);
      const chave = `${bi}:${ii}`;
      if (proxima.has(chave)) proxima.delete(chave);
      else proxima.add(chave);
      return proxima;
    });
  }

  return { alternarSeleccao, caminhoDaSeleccaoRef, seleccionadas, setSeleccionadas };
}

export interface EntradaSeleccaoSegueAFotografia {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  seleccao: ReturnType<typeof useSeleccaoDeFotos>;
}

/**
 * ── A ESCOLHA SEGUE A FOTOGRAFIA (auditoria de 13/11, estúdio n.º 8) ─────
 *
 * As escolhas guardam POSIÇÕES (`página:foto`). Arrastar, reordenar, apagar
 * ou mover mudava as posições, e as escolhas ficavam a apontar para outras
 * fotografias: «Mover para…» levava as erradas. Cada escolha lembra-se do
 * caminho da fotografia; quando as posições mudam, a escolha vai atrás dela,
 * e sai se ela já lá não está.
 *
 * É um gancho à parte da seleção porque o efeito corre num sítio próprio da
 * ordem dos efeitos do estúdio (depois das dobras dos boards), e a seleção
 * tem de nascer muito antes, para os ganchos que a usam.
 */
export function useSeleccaoSegueAFotografia({
  documento,
  seleccao,
}: EntradaSeleccaoSegueAFotografia) {
  const { doc } = documento;
  const { caminhoDaSeleccaoRef, seleccionadas, setSeleccionadas } = seleccao;
  useEffect(() => {
    if (seleccionadas.size === 0) return;
    const r = seguirASeleccao(seleccionadas, caminhoDaSeleccaoRef.current, doc.moodBoards);
    caminhoDaSeleccaoRef.current = r.caminhos;
    if (r.mudou) setSeleccionadas(r.novas);
  }, [doc.moodBoards, seleccionadas, caminhoDaSeleccaoRef, setSeleccionadas]);
}
