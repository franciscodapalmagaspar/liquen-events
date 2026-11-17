"use client";
import { useEffect, useRef, useState } from "react";
import { seguirASeleccao } from "../../../seleccao-de-fotos";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";

export interface EntradaSeleccaoDeFotos {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
}

export function useSeleccaoDeFotos({ documento }: EntradaSeleccaoDeFotos) {
  const { doc } = documento;
  /** A vista com as páginas lado a lado está aberta? */
  /** As fotos escolhidas para serem movidas em conjunto — chaves `bi:ii`. */
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  /** A fotografia (o caminho) de cada escolha — ver o efeito «A ESCOLHA SEGUE
   *  A FOTOGRAFIA», mais abaixo. */
  const caminhoDaSeleccao = useRef<Map<string, string>>(new Map());

  /** Escolher (ou desescolher) uma foto para o conjunto que se move de uma vez. */
  function alternarSeleccao(bi: number, ii: number) {
    const path = doc.moodBoards[bi]?.images[ii];
    if (typeof path === "string") caminhoDaSeleccao.current.set(`${bi}:${ii}`, path);
    setSeleccionadas((antes) => {
      const proxima = new Set(antes);
      const chave = `${bi}:${ii}`;
      if (proxima.has(chave)) proxima.delete(chave);
      else proxima.add(chave);
      return proxima;
    });
  }

  /**
   * ── A ESCOLHA SEGUE A FOTOGRAFIA (auditoria de 13/11, estúdio n.º 8) ─────
   *
   * As escolhas guardam POSIÇÕES (`página:foto`). Arrastar, reordenar, apagar
   * ou mover mudava as posições, e as escolhas ficavam a apontar para outras
   * fotografias: «Mover para…» levava as erradas. Cada escolha lembra-se do
   * caminho da fotografia; quando as posições mudam, a escolha vai atrás dela,
   * e sai se ela já lá não está.
   */
  useEffect(() => {
    if (seleccionadas.size === 0) return;
    const r = seguirASeleccao(seleccionadas, caminhoDaSeleccao.current, doc.moodBoards);
    caminhoDaSeleccao.current = r.caminhos;
    if (r.mudou) setSeleccionadas(r.novas);
  }, [doc.moodBoards, seleccionadas]);

  return { alternarSeleccao, seleccionadas, setSeleccionadas };
}
