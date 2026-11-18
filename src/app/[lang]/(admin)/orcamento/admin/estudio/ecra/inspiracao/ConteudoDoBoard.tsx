"use client";

import { DescricaoQueCresce } from "../../formulario/DescricaoQueCresce";
import { INPUT_SM } from "../../classes";
import { FotosDoBoard } from "../../fotos/FotosDoBoard";
import { UploadArea } from "../../fotos/UploadArea";
import type { Disposicao } from "@/lib/pdf-editorial/mosaico";
import type { MoodBoard } from "@/lib/proposal-doc";
import { AccoesDasFotosDoBoard } from "./AccoesDasFotosDoBoard";
import { AvisosDoBoard } from "./AvisosDoBoard";
import { DisposicaoDoBoard } from "./DisposicaoDoBoard";
import { useEstudio } from "../../contexto";
import { PaginaDoBoardAoLado } from "./PaginaDoBoardAoLado";
import { ResumoDoBoardDobrado } from "./ResumoDoBoardDobrado";

/**
 * ── O QUE SE VÊ COM O BOARD FECHADO ───────────
 * Título e subtítulo já estão no cabeçalho; falta
 * o que diz se está pronto: quantas fotos, e quais.
 * Sem a tira, «Decoração Cerimónia · 6 fotos» podia
 * ser qualquer página.
 */
export function ConteudoDoBoard({
  b,
  bi,
  disposicaoDesteTema,
  dobrado,
  fechado,
  fotosDoTema,
  paginasDesteTema,
  principalDoTema,
  vezDesteTema,
}: {
  b: MoodBoard;
  bi: number;
  disposicaoDesteTema: Disposicao | null;
  dobrado: boolean;
  fechado: boolean;
  fotosDoTema: number;
  paginasDesteTema: number;
  principalDoTema: number;
  vezDesteTema: number;
}) {
  const {
    carregamento: { uploading },
    carregar: { handleUpload },
    fotos: { assetMedias, assetOriginais, assetUrls, estadoDosUrls },
    fotosDosBoards: { addBoardImages, eventosDasFotos, seleccionadasDoBoard },
    moodBoards: { updateBoard },
    repeticoes: { historiaDaFoto, origemDaFoto },
    traducoes: { caixaDeIngles },
  } = useEstudio();
  return (
    <>
      {dobrado ? (
        <ResumoDoBoardDobrado b={b} />
      ) : (
        <>
          {/* Cresce com o texto — ver `DescricaoQueCresce`.
                                        Uma altura fixa de duas linhas escondia
                                        154 px dos 224 desta descrição, medidos a
                                        390 px. */}
          <DescricaoQueCresce
            className={`${INPUT_SM} mb-2 w-full resize-none leading-relaxed`}
            valor={b.annotation ?? ""}
            onChange={(e) => updateBoard(bi, { annotation: e.target.value })}
            data-campo={`boardNota:${bi}`}
            placeholder="Descrição (opcional) — ex.: runner floral com hortênsias verdes, cravo verde, lisianthus branco…"
            aria-label="Descrição do mood board"
          />
          {caixaDeIngles({ tipo: "boardNota", bi }, "Descrição do mood board", {
            className: `${INPUT_SM} mb-2 w-full resize-none leading-relaxed`,
            as: "textarea",
            // A inglesa cresce com a portuguesa: são
            // «a mesma caixa em duas línguas», e uma
            // delas a esconder 206 px deixava de o
            // ser. A `CaixaInglesa` já sabia fazê-lo.
            cresce: true,
          })}
          <AvisosDoBoard
            b={b}
            bi={bi}
            fotosDoTema={fotosDoTema}
            paginasDesteTema={paginasDesteTema}
          />
          {/* ── O ECRÃ GRANDE DAVA MINIATURAS MAIS
                                        PEQUENAS DO QUE O TELEMÓVEL ──────────
                                        `sm:grid-cols-4` dispara aos 640 de
                                        JANELA e nunca mais volta atrás. Aos
                                        1024 a coluna de conteúdo cai de 975
                                        para 504 px, o índice das páginas leva
                                        176 desses, e a grelha ficava com ~300
                                        px para desenhar QUATRO colunas:
                                        miniaturas de 68 px. A 375, com os
                                        mesmos ~300 px, desenhava três — 92 px.
                                        O portátil mostrava as fotografias mais
                                        pequenas do que o telemóvel.

                                        A pergunta é a largura do CARTÃO, que é
                                        onde a grelha vive: `@container` no
                                        cartão, e a quarta coluna só a partir de
                                        24 rem. Medido depois: ~92 px aos 1024,
                                        ~101 aos 375 e ~126 entre 640 e 1023 —
                                        nunca mais uma miniatura mais pequena
                                        num ecrã maior. */}
          {/* Memorizado (10/11): escrever o título ou a
                                        descrição desta página — ou de outra — já
                                        não redesenha as fotografias todas. Ver
                                        `FotosDoBoard`. */}
          <FotosDoBoard
            bi={bi}
            images={b.images}
            titulo={b.title}
            principal={principalDoTema}
            fechado={fechado}
            seleccionadasDoBoard={seleccionadasDoBoard(bi)}
            assetUrls={assetUrls}
            assetMedias={assetMedias}
            assetOriginais={assetOriginais}
            estadoDosUrls={estadoDosUrls}
            historiaDe={historiaDaFoto}
            origemDe={origemDaFoto}
            eventos={eventosDasFotos}
          />
          {/* ── A CAIXA DE ACRESCENTAR, FORA DA GRELHA ────────
                                        Estava DENTRO da grelha, como se fosse
                                        mais uma fotografia — uma célula quadrada
                                        tracejada entre fotos que têm a forma da
                                        caixa que vão ocupar na página. Num board
                                        de cinco fotos numa grelha de quatro
                                        colunas, ela caía a meio da segunda fila,
                                        e lia-se como um buraco: uma foto que
                                        faltava, não um botão.

                                        Fora da grelha e a toda a largura, é o
                                        que é — a acção que vem A SEGUIR às
                                        fotografias. E nunca mais pode aparecer
                                        no meio delas, porque já não é uma
                                        célula.

                                        Num board fechado não existe: o gesto de
                                        largar uma foto é exactamente o engano
                                        contra o qual o fecho existe. */}
          {!fechado && (
            <div className="mt-2">
              <UploadArea
                label="+ Imagens"
                progresso={uploading[`board-${bi}`]}
                multiple
                faixa
                onFiles={(files) =>
                  handleUpload(
                    `board-${bi}`,
                    files,
                    (paths) => addBoardImages(bi, paths),
                    (marcadores) => addBoardImages(bi, marcadores),
                  )
                }
              />
            </div>
          )}
          <DisposicaoDoBoard
            b={b}
            bi={bi}
            disposicaoDesteTema={disposicaoDesteTema}
            fechado={fechado}
            fotosDoTema={fotosDoTema}
            vezDesteTema={vezDesteTema}
          />
          <PaginaDoBoardAoLado bi={bi} />
          <AccoesDasFotosDoBoard b={b} bi={bi} fechado={fechado} />
        </>
      )}
    </>
  );
}
