"use client";
import { useEffect, useState } from "react";
import { normaliseCoverImages, isPendingImage } from "@/lib/proposal-doc";
import { useTamanhoDoOriginal } from "../../../tamanhoDoOriginal";
import type { Quote } from "@/lib/orcamento/types";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";
import { useMapasDasFotos } from "../../fotos/useMapasDasFotos";

export interface EntradaCapa {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  fotos: ReturnType<typeof useMapasDasFotos>;
  quote: Quote;
}

export function useCapa({ documento, fotos, quote }: EntradaCapa) {
  const { doc, setDoc } = documento;
  const { assetOriginais } = fotos;
  /** O lugar da fotografia da capa: a primeira que houver (ver a secção). */
  const idxDaCapa = Math.max(0, (doc.coverImages ?? []).findIndex(Boolean));
  const caminhoDaCapa = doc.coverImages?.[idxDaCapa] || undefined;
  /** Os pixéis do original da capa — para o aviso «é pequena». */
  const tamanhoDaCapa = useTamanhoDoOriginal(
    caminhoDaCapa ? assetOriginais[caminhoDaCapa] : undefined,
  );
  /**
   * O recorte que o PDF faria SOZINHO da fotografia da capa — perguntado ao
   * servidor, que faz a mesma conta que o desenho (`focoAutomaticoDaCapa`).
   *
   * Palavras dela: «não ficou com o carro». A caixa mostrava o meio da
   * fotografia e o PDF recortava pela «atenção» do sharp. Com isto mostra o
   * mesmo — e é daqui que ela arrasta, se não gostar.
   */
  const [focoAutoDaCapa, setFocoAutoDaCapa] = useState<{
    caminho: string;
    foco: { x: number; y: number };
  } | null>(null);
  useEffect(() => {
    if (!caminhoDaCapa || isPendingImage(caminhoDaCapa)) return;
    let vivo = true;
    fetch(
      `/api/orcamento/${encodeURIComponent(quote.id)}/foco-da-capa?caminho=${encodeURIComponent(caminhoDaCapa)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { foco?: { x: number; y: number } } | null) => {
        if (vivo && j?.foco) setFocoAutoDaCapa({ caminho: caminhoDaCapa, foco: j.foco });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [caminhoDaCapa, quote.id]);

  // ── A fotografia da capa ──
  // Escreve-se NA POSIÇÃO e não se compacta a lista: as propostas antigas têm
  // duas, e a segunda fica guardada como estava (o PDF novo usa uma só).
  function setCoverAt(idx: number, path: string) {
    setDoc((d) => {
      const cover = normaliseCoverImages(d.coverImages);
      cover[idx] = path;
      // «Usar esta na mesma» é sobre a fotografia que lá estava. Uma nova volta
      // à regra até ela a ver e decidir — ver `capaMesmoAssim`.
      return { ...d, coverImages: cover, capaMesmoAssim: undefined, focoDaCapa: undefined };
    });
  }
  function removeCoverAt(idx: number) {
    setCoverAt(idx, "");
  }

  return { caminhoDaCapa, focoAutoDaCapa, idxDaCapa, removeCoverAt, setCoverAt, tamanhoDaCapa };
}
