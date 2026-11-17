"use client";
import { useMemo } from "react";
import { isPendingImage } from "@/lib/proposal-doc";
import { emPalavras } from "@/lib/tempo-activo";
import { fontesDasFolhas } from "../../PaginaEditorial";
import { usePlanoDoPdf } from "../../useFotosDoPdf";
import { planoDaProposta } from "@/lib/pdf-editorial/plano";
import { avisoDeTituloParecido, titulosParecidos } from "@/lib/proposal-titulos-parecidos";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "@/lib/orcamento/types";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useMapasDasFotos } from "../fotos/useMapasDasFotos";
import { useTraducoes } from "../traducoes/useTraducoes";
import { useTempoNaProposta } from "../passos/useTempoNaProposta";

export interface EntradaPaginasDaProposta {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  fotos: ReturnType<typeof useMapasDasFotos>;
  quote: Quote;
  tempoNaProposta: ReturnType<typeof useTempoNaProposta>;
  traducoes: ReturnType<typeof useTraducoes>;
}

export function usePaginasDaProposta({
  documento,
  fotos,
  quote,
  tempoNaProposta,
  traducoes,
}: EntradaPaginasDaProposta) {
  const { doc } = documento;
  const { assetOriginais, assetUrls } = fotos;
  const { tempoMostrado } = tempoNaProposta;
  const { idiomaDoPdf } = traducoes;
  /**
   * ════════════════════════════════════════════════════════════════════════
   * QUANTO PESA ESTA PROPOSTA, SEMPRE À VISTA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «Contagem de fotos por board e total da proposta, sempre
   * visível. Número estimado de páginas do PDF.»
   *
   * As páginas de inspiração são exactamente uma por board COM fotos — um board
   * vazio não imprime nada (o gerador salta-o, para nunca mostrar uma folha em
   * branco a um cliente).
   *
   * O total do PDF sai do PLANO do desenho novo (`pdf-editorial/plano.ts`):
   * a mesma sequência que o gerador desenha, presa a ele por um teste. Só o
   * texto que transborda (o orçamento e as condições) é estimado, e é por isso
   * que se diz «cerca de».
   */
  const fotosPorBoard = doc.moodBoards.map((b) => b.images.length);
  const totalDeFotos = fotosPorBoard.reduce((a, b) => a + b, 0);
  const planoDoPdf = useMemo(() => planoDaProposta(doc as ProposalDoc), [doc]);
  /**
   * Que fotografia o PDF põe em cada página — perguntado ao PDF
   * (`usePlanoDoPdf`) —, e de que fotografias o PDF tira a paleta.
   */
  const respostaDoPdf = usePlanoDoPdf(quote.id, doc as ProposalDoc, idiomaDoPdf);
  const fotosDoPdf = respostaDoPdf?.fotos ?? null;
  /** De onde vêm as fotografias das miniaturas do PDF novo (`PaginaEditorial`). */
  const fontesDasMiniaturas = useMemo(
    () => fontesDasFolhas(doc as ProposalDoc, planoDoPdf, assetUrls, assetOriginais, fotosDoPdf),
    [doc, planoDoPdf, assetUrls, assetOriginais, fotosDoPdf],
  );
  /** As fotografias desta proposta, para escolher (capa e temas, sem repetir). */
  const fotosDaProposta = useMemo(() => {
    const vistas = new Set<string>();
    const lista: { ref: string; url?: string; original?: string }[] = [];
    for (const r of [
      ...(doc.coverImages ?? []),
      ...doc.moodBoards.flatMap((b) => b.images),
      ...Object.values(doc.fotosDasPaginas ?? {}).flatMap((e) => e.fotos),
    ]) {
      if (!r || vistas.has(r) || isPendingImage(r)) continue;
      vistas.add(r);
      lista.push({
        ref: r,
        url: assetUrls[r] ?? (r.startsWith("data:") ? r : undefined),
        original: assetOriginais[r],
      });
    }
    return lista;
  }, [doc.coverImages, doc.moodBoards, doc.fotosDasPaginas, assetUrls, assetOriginais]);
  const paginasDeInspiracao = planoDoPdf.filter((p) => p.tipo === "tema").length;
  const tempoDaProposta = tempoMostrado > 0 ? ` · ${emPalavras(tempoMostrado)} de trabalho` : "";
  const contagemDosBoards =
    `${paginasDeInspiracao} ${paginasDeInspiracao === 1 ? "página" : "páginas"} · ` +
    `${totalDeFotos} ${totalDeFotos === 1 ? "foto" : "fotos"} · ` +
    // O número sai da MESMA lista que a vista de conjunto desenha. Eram duas
    // contas sobre o mesmo documento — «7 páginas» na vista e «cerca de 14» na
    // frase — e discordavam porque contavam coisas diferentes.
    `PDF com cerca de ${planoDoPdf.length} ${planoDoPdf.length === 1 ? "página" : "páginas"}${tempoDaProposta}`;

  /**
   * ── OS TÍTULOS QUE SE LÊEM COMO O MESMO NOME ────────────────────────────
   *
   * Um por board, e `undefined` na esmagadora maioria. Calculado uma vez para
   * a lista toda e não board a board: a pergunta é sobre PARES, e fazê-la
   * dentro do cartão dava um varrimento de todos os títulos por cada cartão
   * desenhado — oito páginas, sessenta e quatro comparações, a cada tecla
   * escrita num título.
   */
  const avisosDeTitulo = useMemo(() => {
    const por: Record<number, string> = {};
    for (const grupo of titulosParecidos(doc as ProposalDoc)) {
      for (const bi of grupo.bis) {
        const aviso = avisoDeTituloParecido(doc as ProposalDoc, bi);
        if (aviso) por[bi] = aviso;
      }
    }
    return por;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.moodBoards, doc.serviceGroups, doc.ordemExplicita]);

  return {
    avisosDeTitulo,
    contagemDosBoards,
    fontesDasMiniaturas,
    fotosDaProposta,
    fotosDoPdf,
    planoDoPdf,
    respostaDoPdf,
    totalDeFotos,
  };
}
