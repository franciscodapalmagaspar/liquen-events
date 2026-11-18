"use client";

import MoodBoardIndice from "../../../MoodBoardIndice";
import { rolarAteVer } from "@/lib/motion/rolar";
import { ArrastoDosMoodBoards, CartaoDeBoard, ListaDeBoards } from "../../../MoodBoardFotos";
import { FantasmaDaFoto } from "../../fotos/FantasmaDaFoto";
import { fotoPrincipalDe } from "@/lib/proposal-moodboard";
import { disposicaoDoTema } from "@/lib/pdf-editorial/mosaico";
import { paginasDoTema } from "@/lib/pdf-editorial/plano";
import { CabecalhoDoBoard } from "./CabecalhoDoBoard";
import { ConteudoDoBoard } from "./ConteudoDoBoard";
import { ComecarOsMoodBoards } from "./ComecarOsMoodBoards";
import { AccoesDosMoodBoards } from "./AccoesDosMoodBoards";
import { useEstudio } from "../../contexto";

/**
 * ── O ÍNDICE ─────────────────────────────────────────────
 * Onde a caixa dá, é uma coluna fixa ao lado; onde não dá, uma
 * tira que se percorre por cima da lista — a 390 px, uma coluna
 * lateral roubava metade da grelha das fotos.
 *
 * ── PORQUE É QUE «ONDE A CAIXA DÁ» NÃO É `lg:` ────────────
 * Isto era `lg:grid` — 1024 de JANELA — e era o último sítio do
 * ficheiro onde dois cortes se SOMAVAM em vez de se
 * compensarem: aos 1024 a coluna de conteúdo cai de 975 para
 * 504 px (aparecem a barra lateral do back office e o índice do
 * estúdio) e era exactamente aí que esta coluna de 176 px se
 * abria. O cartão do board ficava com 276 px e as miniaturas
 * com 86; sem ela ficaria com 472 e 112.
 *
 * ── E A INVERSÃO QUE ISTO OBRIGA A ESCREVER ───────────────
 * A coluna de conteúdo é MAIOR abaixo de 1024 (975 px) do que
 * acima (504 aos 1024, 560 aos 1440). Portanto a resposta certa
 * desliga esta coluna lateral em TODAS as larguras de desktop e
 * liga-a entre 640 e 1023. Parece ao contrário e não é: a caixa
 * a 1024 é mesmo mais estreita do que a 640, e um índice em
 * coluna custa-lhe 196 px — 39% do sítio onde ela escreve. Em
 * tira custa ~56 px de altura, uma vez.
 *
 * ── DE ONDE VÊM AS 40 REM ─────────────────────────────────
 * A coluna custa 176 px mais os 20 do intervalo: 196. O que
 * sobra tem de continuar a servir a grelha de fotografias na
 * forma de quatro colunas, que pede 24 rem de cartão (384) mais
 * os 32 do `p-4` — 416. São 612 px, e 40 rem (640) é o degrau
 * acima. Medido: liga a 975 e desliga a 351, 504, 560 e 592.
 *
 * O `MoodBoardIndice` lê o MESMO limiar, e é obrigatório que
 * leia: a forma dele (tira horizontal ou coluna `sticky`) e a
 * grelha que lhe dá a largura são duas metades da mesma
 * decisão, e metades da mesma decisão em sinais diferentes é o
 * defeito que o `useMedida.ts:16-21` conta por extenso. Aqui
 * seria uma tira de `overflow-x-auto` espremida em 176 px de um
 * lado, e um índice vertical à largura toda do outro.
 *
 * Sem mood boards o índice não desenha nada, e a grelha dava a
 * coluna de 11 rem ao conteúdo — o começo nascia espremido
 * nela. A grelha só existe quando há o que indexar.
 */
export function MoodBoardsEIndice() {
  const {
    arrumacao: { moverBoardParaPosicao },
    confirmacoes: { perguntaDeRemocao },
    dobras: { dobrados, escreverDobras },
    documento: { doc },
    escolha: { aArrastar, setAArrastar },
    fotos: { assetUrls },
    fotosDosBoards: { aoLargarFoto },
    moodBoards: { updateBoard },
    ordenacao: { ordemDosBoards },
    paginasDaProposta: { planoDoPdf },
    painel: { setBoardActivo },
    traducoes: { caixaDeIngles },
  } = useEstudio();
  return (
    <div
      className={
        doc.moodBoards.length > 0
          ? "@min-[40rem]:grid @min-[40rem]:grid-cols-[11rem_minmax(0,1fr)] @min-[40rem]:gap-5"
          : undefined
      }
    >
      <MoodBoardIndice
        boards={doc.moodBoards}
        ordem={ordemDosBoards}
        bloqueados={doc.moodBoards.map((b) => !!b.bloqueado)}
        // A MESMA acção dos cartões e da vista de conjunto: três
        // sítios onde se reordena, uma só maneira de reordenar.
        onMover={(de, para) => moverBoardParaPosicao(de, para)}
        onSaltar={(bi) => {
          // Abrir a dobra ANTES de saltar: saltar para um board
          // fechado deixava-a a olhar para uma linha de miniaturas
          // sem perceber porque é que o board «não abriu».
          const id = doc.moodBoards[bi]?.id;
          if (id && dobrados[id]) escreverDobras({ ...dobrados, [id]: false });
          rolarAteVer(document.getElementById(`mood-board-${bi}`), {
            block: "start",
          });
        }}
      />
      <div className="min-w-0">
        <ArrastoDosMoodBoards
          ordemDosBoards={ordemDosBoards}
          aArrastar={aArrastar}
          onArrastoComeca={setAArrastar}
          fantasma={<FantasmaDaFoto id={aArrastar} doc={doc} urls={assetUrls} />}
          onLargarBoard={(de, para) => moverBoardParaPosicao(de, para)}
          onLargarFoto={aoLargarFoto}
        >
          <ListaDeBoards ordem={ordemDosBoards} className="flex flex-col gap-3">
            {/* Pela ordem que as páginas vão sair — ver `ordemDosBoards`. */}
            {ordemDosBoards.map((bi, pos) => {
              const b = doc.moodBoards[bi];
              /**
               * A ORDEM POR QUE A PÁGINA DESENHA — a mesma função do
               * gerador (`ordemDoDesenho`): a fotografia do cartão à
               * frente, sempre.
               */
              const principalDoTema = fotoPrincipalDe(b);
              /**
               * O que o PDF faz com este tema: a disposição que ela
               * escolheu, ou a automática pelo número de fotografias
               * (`pdf-editorial/mosaico.ts`); o capítulo sai do
               * título (`grupos.ts`).
               */
              const fotosDoTema = b.images.length;
              const disposicaoDesteTema = disposicaoDoTema(b);
              const paginasDesteTema = paginasDoTema(fotosDoTema, disposicaoDesteTema);
              /** A vez do tema no PDF — decide de que lado fica o texto. */
              const vezDesteTema =
                planoDoPdf.reduce((v, e) => (e.tipo === "tema" && e.bi === bi ? e.vez : v), 0) || 1;
              /** Esta página está fechada a alterações? */
              const fechado = !!b.bloqueado;
              /** E dobrada, que é só uma questão de espaço no ecrã? */
              const dobrado = !!(b.id && dobrados[b.id]);
              return (
                <CartaoDeBoard
                  key={bi}
                  bi={bi}
                  // Qual é a página que ela está a editar — para o
                  // painel da direita mostrar ESSA. No foco e não no
                  // rato: o rato atravessa cartões a caminho de
                  // outro sítio, e o painel piscava.
                  onFocusCapture={() => setBoardActivo(bi)}
                  // O `id` é o alvo do índice lateral. Pelo ÍNDICE REAL:
                  // a ordem desenhada pode mudar debaixo do salto.
                  ancora={`mood-board-${bi}`}
                  // `@container`: a grelha das fotografias aqui
                  // dentro pergunta pela largura DESTE cartão, e não
                  // pela da janela — ver o comentário na grelha.
                  className={`@container rounded-2xl border p-4 ${
                    fechado
                      ? "border-sage-600/35 bg-sage-600/[0.04]"
                      : "border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)]"
                  }`}
                >
                  {(pega) => (
                    <>
                      <CabecalhoDoBoard
                        b={b}
                        bi={bi}
                        dobrado={dobrado}
                        fechado={fechado}
                        pega={pega}
                        pos={pos}
                      />
                      {/* O subtítulo numa segunda linha, alinhado com o título:
                                    quatro caixas na mesma linha liam-se como um formulário,
                                    e não como o cabeçalho de uma página. */}
                      <div className="mb-2 flex flex-wrap items-center gap-2 @min-[32rem]:pl-16">
                        {/* O SEGUNDO andar do cabeçalho da página.
                            A proposta feita à mão tem «Complementos dos Noivos»
                            e, por baixo, «Ramo de Noiva (a definir com a
                            Noiva)»: o primeiro diz o capítulo, o segundo diz o
                            que aquelas fotos são e o que ainda está por
                            decidir. Sem campo, ou se perdia a segunda frase ou
                            se enfiava tudo num título com parênteses. */}
                        <input
                          className="bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]"
                          value={b.subtitulo ?? ""}
                          onChange={(e) => updateBoard(bi, { subtitulo: e.target.value })}
                          data-campo={`boardSubtitulo:${bi}`}
                          placeholder="Subtítulo (opcional) — ex.: Ramo de Noiva (a definir com a Noiva)"
                          aria-label="Subtítulo do mood board"
                          readOnly={fechado}
                        />
                        {caixaDeIngles({ tipo: "boardSubtitulo", bi }, "Subtítulo do mood board", {
                          className:
                            "bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]",
                          readOnly: fechado,
                        })}
                      </div>
                      {/* A pergunta fica DENTRO do cartão, logo por
                                    baixo da barra que a levantou — e antes da
                                    tira de miniaturas, para se ver ao mesmo
                                    tempo a frase e as fotografias que ela
                                    conta. Ver `aRemover`. */}
                      {perguntaDeRemocao(`board:${bi}`, "Remover a página")}
                      <ConteudoDoBoard
                        b={b}
                        bi={bi}
                        disposicaoDesteTema={disposicaoDesteTema}
                        dobrado={dobrado}
                        fechado={fechado}
                        fotosDoTema={fotosDoTema}
                        paginasDesteTema={paginasDesteTema}
                        principalDoTema={principalDoTema}
                        vezDesteTema={vezDesteTema}
                      />
                    </>
                  )}
                </CartaoDeBoard>
              );
            })}
          </ListaDeBoards>
        </ArrastoDosMoodBoards>
        {/* ── O COMEÇO, QUANDO AINDA NÃO HÁ NADA ─────────────────────
                      Pedido dela de 9/11: «mesmo a parte da inspiração está uma
                      confusão». Sem mood boards, o passo abria com um
                      «+ Adicionar mood board» do tamanho de uma ligação, e a
                      primeira coisa grande era «À escolha do casal», que só
                      faz sentido depois. Agora a primeira coisa é dizer o que
                      é isto e um botão a sério para começar. */}
        {doc.moodBoards.length === 0 && <ComecarOsMoodBoards />}
        <AccoesDosMoodBoards />
      </div>
    </div>
  );
}
