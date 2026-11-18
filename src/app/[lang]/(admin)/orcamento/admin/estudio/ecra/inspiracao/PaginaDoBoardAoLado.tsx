"use client";

import PaginaEditorial from "../../../PaginaEditorial";
import { type ProposalDoc } from "@/lib/proposal-doc";
import { useEstudio } from "../../contexto";

/**
 * ── A PÁGINA, COMO VAI SAIR ───────────────
 * Onde o painel da direita não cabe, a
 * miniatura vive aqui, no cartão. Onde
 * cabe, NÃO se monta — o painel mostra a
 * mesma página, grande, e desenhá-la duas
 * vezes (sete vezes, numa proposta de sete
 * temas) foi o que já custou ao estúdio
 * deixar de responder.
 */
export function PaginaDoBoardAoLado({ bi }: { bi: number }) {
  const {
    barra: { painelLateralCabe },
    documento: { doc },
    fotos: { aspetosDasFotos },
    paginasDaProposta: { fontesDasMiniaturas, planoDoPdf },
  } = useEstudio();
  return (
    <>
      {!painelLateralCabe &&
        (() => {
          const i = planoDoPdf.findIndex((e) => e.tipo === "tema" && e.bi === bi && e.parte === 0);
          if (i < 0) return null;
          return (
            <figure className="m-0 mt-2 max-w-[15rem]">
              <PaginaEditorial
                pagina={planoDoPdf[i]}
                doc={doc as ProposalDoc}
                aspetos={aspetosDasFotos}
                capa={fontesDasMiniaturas.capa}
                fotosDoTema={fontesDasMiniaturas.fotosDoTema}
                outras={fontesDasMiniaturas.outrasDa(i)}
              />
              <figcaption className="mt-1 text-[10px] text-foreground/40">
                A página, como vai sair
              </figcaption>
            </figure>
          );
        })()}
    </>
  );
}
