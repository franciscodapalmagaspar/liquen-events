"use client";
import { useState } from "react";
import { useAnular } from "../../ui/anular";
import { type Foco } from "../../ArrastarParaEnquadrar";
import { enquadrarNoLugar } from "@/lib/pdf-editorial/lugares-escolhidos";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useCapa } from "../passos/evento/useCapa";
import { usePaginasDaProposta } from "./usePaginasDaProposta";

export interface EntradaFotosDaPagina {
  anular: ReturnType<typeof useAnular>;
  capa: ReturnType<typeof useCapa>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  paginasDaProposta: ReturnType<typeof usePaginasDaProposta>;
}

export function useFotosDaPagina({
  anular,
  capa,
  documento,
  paginasDaProposta,
}: EntradaFotosDaPagina) {
  const { caminhoDaCapa } = capa;
  const { doc, patch } = documento;
  const { fotosDoPdf } = paginasDaProposta;
  const [paginaDaFoto, setPaginaDaFoto] = useState<{
    chave: string;
    nome: string;
    max: number;
    /** A forma da caixa de cada lugar (`formasDosLugares`), para o enquadrar. */
    formas?: readonly number[];
  } | null>(null);
  const [lugarDaFoto, setLugarDaFoto] = useState(0);
  /**
   * O que está AGORA em cada lugar de uma página: a escolha dela, ou a do PDF.
   * Um lugar que ela deixou vazio (`""`, a paleta) mostra o que o PDF lá põe.
   */
  const lugaresDaPagina = (chave: string): (string | null)[] => {
    if (chave === "capa") return [caminhoDaCapa ?? fotosDoPdf?.capa?.[0]?.ref ?? null];
    const auto = (fotosDoPdf?.[chave] ?? []).map((f) => f.ref);
    const dela = doc.fotosDasPaginas?.[chave]?.fotos;
    if (!dela) return auto;
    return dela.map((r, k) => (r && r.trim() ? r : (auto[k] ?? null)));
  };
  /** O enquadramento que se VÊ em cada lugar: o dela, ou o que o PDF escolheu. */
  const focosDaPagina = (chave: string): (Foco | null)[] => {
    if (chave === "capa") return [doc.focoDaCapa ?? fotosDoPdf?.capa?.[0]?.foco ?? null];
    const dela = doc.fotosDasPaginas?.[chave];
    return (fotosDoPdf?.[chave] ?? []).map((f, k) =>
      dela?.fotos[k]?.trim() ? (dela.focos?.[k] ?? f.foco ?? null) : (f.foco ?? null),
    );
  };
  /**
   * Grava a escolha de uma página (ou apaga-a, com `null`), com «Anular». Os
   * focos vão com as fotos, lugar a lugar; sem `focos`, ficam os que havia.
   */
  function gravarFotosDaPagina(
    chave: string,
    fotos: string[] | null,
    frase: string,
    focos?: (Foco | null)[],
  ) {
    const antes = doc.fotosDasPaginas;
    const seguintes = { ...(antes ?? {}) };
    if (fotos && fotos.some((f) => f && f.trim())) {
      const f = (focos ?? antes?.[chave]?.focos ?? []).slice(0, fotos.length);
      seguintes[chave] = { fotos, ...(f.some(Boolean) ? { focos: f } : {}) };
    } else delete seguintes[chave];
    patch({ fotosDasPaginas: seguintes });
    anular(frase, () => patch({ fotosDasPaginas: antes }));
  }
  /**
   * O enquadramento de um lugar (ou o automático, com `null`), com «Anular».
   * Pedido dela de 23/10: «ajustar a posição da foto» em qualquer página.
   * Enquadrar uma foto que o sistema escolheu fixa-a nesse lugar — senão o
   * enquadramento ficava preso a uma foto que o PDF podia trocar.
   */
  function enquadrarNaPagina(chave: string, nome: string, lugar: number, foco: Foco | null) {
    if (chave === "capa") {
      // A capa tem o seu campo de sempre (o mesmo do «Enquadrar» da capa).
      const antes = doc.focoDaCapa;
      patch({ focoDaCapa: foco ?? undefined });
      anular(
        foco ? "Enquadramento da capa mudado." : "A capa volta ao enquadramento automático.",
        () => patch({ focoDaCapa: antes }),
      );
      return;
    }
    const novo = enquadrarNoLugar(
      doc.fotosDasPaginas?.[chave],
      lugaresDaPagina(chave),
      lugar,
      foco,
    );
    if (!novo) return;
    gravarFotosDaPagina(
      chave,
      novo.fotos,
      foco ? `Enquadramento de «${nome}» mudado.` : `«${nome}» volta ao enquadramento automático.`,
      novo.focos ?? [],
    );
  }

  return {
    enquadrarNaPagina,
    focosDaPagina,
    gravarFotosDaPagina,
    lugarDaFoto,
    lugaresDaPagina,
    paginaDaFoto,
    setLugarDaFoto,
    setPaginaDaFoto,
  };
}
