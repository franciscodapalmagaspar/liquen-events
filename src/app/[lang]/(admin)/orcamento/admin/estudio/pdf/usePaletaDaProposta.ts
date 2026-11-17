"use client";
import { fotosQueDaoCor } from "@/lib/pdf-editorial/grupos";
import { useAnular } from "../../ui/anular";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useMapasDasFotos } from "../fotos/useMapasDasFotos";
import { usePaginasDaProposta } from "./usePaginasDaProposta";
import { useFotosDaPagina } from "./useFotosDaPagina";

export interface EntradaPaletaDaProposta {
  anular: ReturnType<typeof useAnular>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  fotos: ReturnType<typeof useMapasDasFotos>;
  fotosDaPagina: ReturnType<typeof useFotosDaPagina>;
  paginasDaProposta: ReturnType<typeof usePaginasDaProposta>;
}

export function usePaletaDaProposta({
  anular,
  documento,
  fotos,
  fotosDaPagina,
  paginasDaProposta,
}: EntradaPaletaDaProposta) {
  const { doc, patch } = documento;
  const { assetMedias, assetOriginais, assetUrls } = fotos;
  const { lugaresDaPagina } = fotosDaPagina;
  const { fotosDoPdf, respostaDoPdf } = paginasDaProposta;
  /**
   * As cores da paleta escolhidas por ELA (`paletaDela`), com «Anular» —
   * «a minha mãe quer ser ela a escolher as cores» (13/11). `null` volta às
   * automáticas (a sugestão das flores das fotografias).
   */
  function mudarPaleta(cores: string[] | null, frase: string) {
    const antes = doc.paletaDela;
    patch({ paletaDela: cores && cores.length ? cores : undefined });
    anular(frase, () => patch({ paletaDela: antes }));
  }
  /**
   * As fotografias de onde saem as cores — as MESMAS que o PDF lê. Quem as diz
   * é o próprio PDF (`daPaleta`, da rota `fotos-do-pdf`, pela ordem dele); e a
   * SUGESTÃO de cores vem também do servidor, calculada sobre os bytes do PDF
   * (`paleta-do-pdf`) — o navegador só as lê para o conta-gotas (13/11: a
   * sugestão do estúdio dava outras cores, por outra ordem, do que o PDF).
   * Enquanto o PDF não responde, a mesma regra feita aqui (`fotosQueDaoCor`)
   * mostra as fotografias ao conta-gotas. Lê-se a fotografia inteira (a versão
   * média) e não a miniatura, que é um recorte quadrado com outras cores.
   */
  const fotosDaPaleta = (() => {
    const urlDe = (r: string) =>
      assetMedias[r] ??
      assetOriginais[r] ??
      assetUrls[r] ??
      (r.startsWith("data:") ? r : undefined);
    if (respostaDoPdf?.daPaleta)
      return respostaDoPdf.daPaleta.map((r) => ({ ref: r, url: urlDe(r) }));
    // Pela ordem do PDF: o painel (o 6.º lugar) primeiro, depois a fila.
    // Os seis lugares, mesmo numa proposta que gravou só cinco (antes de o
    // 6.º ser o painel): o que falta é o que o PDF lá põe.
    const auto = (fotosDoPdf?.ambiente ?? []).map((f) => f.ref);
    const dela = lugaresDaPagina("ambiente");
    const l = Array.from(
      { length: Math.max(dela.length, auto.length, 6) },
      (_, k) => dela[k] ?? auto[k] ?? null,
    );
    const pelaOrdemDoPdf = [l[5], ...l.slice(0, 5)].filter((r): r is string => !!r);
    // A versão média («inside», sem recorte). O original pesava vários MB por
    // fotografia, seis de cada vez.
    return fotosQueDaoCor(pelaOrdemDoPdf, doc.moodBoards).map((r) => ({ ref: r, url: urlDe(r) }));
  })();
  /** As referências pelas quais se pede a sugestão ao servidor: só as do PDF. */
  const refsDaPaleta = respostaDoPdf?.daPaleta ?? null;

  return { fotosDaPaleta, mudarPaleta, refsDaPaleta };
}
