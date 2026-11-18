"use client";

import { DescricaoQueCresce } from "../../formulario/DescricaoQueCresce";
import { AVISO_DO_BOARD, INPUT_SM } from "../../classes";
import { fotosQueDestoam } from "@/lib/cor-dominante";
import { FotosDoBoard } from "../../fotos/FotosDoBoard";
import { UploadArea } from "../../fotos/UploadArea";
import EscolherDisposicao from "../../../EscolherDisposicao";
import { capituloDoTema, composicaoEmPalavras, ordemDoDesenho } from "@/lib/pdf-editorial/plano";
import { ASPETO_POR_OMISSAO } from "@/lib/proposal-geometria";
import { eCasamento } from "@/lib/proposal-evento";

import { MoodBoard } from "@/lib/proposal-doc";
import { AccoesDasFotosDoBoard } from "./AccoesDasFotosDoBoard";
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
  disposicaoDesteTema:
    | "destaque"
    | "texto-e-imagem"
    | "uma-fila"
    | "duas-filas"
    | "tres-filas"
    | "soltas"
    | "grelha"
    | null;
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
    disposicao: { disposicaoEmTodos, mudarDisposicao },
    documento: { doc },
    fotos: { aspetosDasFotos, assetCores, assetMedias, assetOriginais, assetUrls, estadoDosUrls },
    fotosDosBoards: { addBoardImages, eventosDasFotos, seleccionadasDoBoard },
    moodBoards: { updateBoard },
    paginasDaProposta: { avisosDeTitulo },
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
          {/* ── DUAS PÁGINAS COM O MESMO NOME ───────
                                        «"Complementos Dos Noivos" e
                                        "Complementos Noivos". Uma é bouquet,
                                        outra lapelas — mas na proposta aparecem
                                        dois títulos praticamente idênticos
                                        seguidos.»

                                        Não é vermelho e não trava nada: «Mesa
                                        1» e «Mesa 2» é uma decisão, não um
                                        descuido, e um aviso que trava uma
                                        escolha legítima ensina-se a ignorar. Diz
                                        o que viu, cita o outro título, e deixa-a
                                        decidir. */}
          {avisosDeTitulo[bi] && (
            <p className={`${AVISO_DO_BOARD} text-[var(--bo-aviso)]`}>{avisosDeTitulo[bi]}</p>
          )}
          {/* ── DUAS PÁGINAS, E NÃO FOTOS DE FORA ───────
                                        No PDF antigo uma página imprimia dez e
                                        as outras ficavam de fora. No novo
                                        nenhuma fica: acima de doze o tema passa
                                        a duas páginas, e a segunda diz «Mais
                                        ideias…». Não é um erro — diz-se em voz
                                        baixa, para ela decidir se a quer. */}
          {paginasDesteTema > 1 && (
            <p className={`${AVISO_DO_BOARD} text-[var(--bo-text-muted)]`}>
              {fotosDoTema} fotos: no PDF este tema ocupa {paginasDesteTema} páginas (a segunda diz
              «Mais ideias…»).
            </p>
          )}
          {/* ── A FOTO QUE DESTOA DA PALETA ────────────
                                        Não é um erro, e por isso não é vermelho:
                                        uma fotografia de cor diferente pode ser
                                        exactamente o que se quer. É uma coisa que
                                        se vê melhor dita do que olhando para uma
                                        grelha de miniaturas pequenas — e que só
                                        aparece quando salta à vista mesmo (ver
                                        `LIMIAR_DE_AVISO` em `cor-dominante.ts`).

                                        Cala-se sozinho quando não há cores que
                                        cheguem: as fotos carregadas antes de a
                                        cor existir não entram na conta. */}
          {(() => {
            const fora = fotosQueDestoam(b.images.map((p) => assetCores[p]));
            if (fora.length === 0) return null;
            const quais = fora
              .slice(0, 3)
              .sort((x, y) => x - y)
              .map((i) => `${i + 1}.ª`);
            return (
              <p className="mb-2 text-xs leading-relaxed text-[var(--bo-text-muted)]">
                <span aria-hidden="true">◐ </span>
                {fora.length === 1
                  ? `A ${quais[0]} fotografia destoa da paleta desta página.`
                  : `A ${quais.slice(0, -1).join(", a ")} e a ${quais[quais.length - 1]} fotografias destoam da paleta desta página.`}{" "}
                Pode ser de propósito — se não for, troca-a ou arruma a página por cor.
              </p>
            );
          })()}
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
          {/* ── A DISPOSIÇÃO DAS FOTOS ─────────────────
                                        Saiu no #173 e voltou a 15/10, a pedido
                                        dela, com as composições do PDF novo
                                        (`EscolherDisposicao`). O «Manter a forma»
                                        do PDF antigo não volta: cada célula do
                                        desenho novo já tem quase a forma da sua
                                        foto. */}
          <EscolherDisposicao
            valor={disposicaoDesteTema}
            aspectos={ordemDoDesenho(b).map(
              (k) => aspetosDasFotos[b.images[k] ?? ""] ?? ASPETO_POR_OMISSAO,
            )}
            vezPar={vezDesteTema % 2 === 0}
            desligado={fechado}
            onEscolher={(d) => mudarDisposicao(bi, d)}
            onAplicarATodos={
              doc.moodBoards.length > 1 && disposicaoDesteTema
                ? () => disposicaoEmTodos(disposicaoDesteTema)
                : undefined
            }
          />
          <p className="mt-2 text-xs leading-relaxed text-[var(--bo-text-muted)]">
            Capítulo:{" "}
            <strong className="font-medium text-[var(--bo-tinta-72)]">
              {capituloDoTema(b, eCasamento(doc.eventType), doc.moodBoards)}
            </strong>
            <span className="text-foreground/35"> · </span>
            {composicaoEmPalavras(fotosDoTema, disposicaoDesteTema)}
          </p>
          <PaginaDoBoardAoLado bi={bi} />
          <AccoesDasFotosDoBoard b={b} bi={bi} fechado={fechado} />
        </>
      )}
    </>
  );
}
