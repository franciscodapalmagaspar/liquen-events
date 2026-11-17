"use client";
import { useToast } from "../../../Toast";
import { temasComPagina } from "@/lib/pdf-editorial/plano";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { move } from "@/lib/orcamento/estudio/listas";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";
import { useOrdemDoOrcamento } from "../orcamento/useOrdemDoOrcamento";

export interface EntradaArrumacaoDosBoards {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  ordem: ReturnType<typeof useOrdemDoOrcamento>;
  toast: ReturnType<typeof useToast>["toast"];
}

export function useArrumacaoDosBoards({ documento, ordem, toast }: EntradaArrumacaoDosBoards) {
  const { doc, setDoc } = documento;
  const { arrumadoEExplicito } = ordem;
  /**
   * Move o board que está NA POSIÇÃO `pos` do ecrã.
   *
   * Recebe a posição visível e não o índice do array porque, enquanto a ordem
   * vier sugerida pelos Serviços, os dois números são diferentes — e mover
   * «o terceiro que vejo» tem de mover o terceiro que se vê.
   *
   * Arrumar à mão é uma decisão: materializa a ordem mostrada e acende
   * `ordemExplicita`. Sem isso, ela punha o board no sítio e a sugestão
   * devolvia-o ao lugar de onde saiu.
   */
  function moveBoard(pos: number, dir: -1 | 1) {
    setDoc((d) => {
      const arrumado = arrumadoEExplicito(d);
      return { ...arrumado, moodBoards: move(arrumado.moodBoards, pos, dir) };
    });
  }

  /** Um mood board largado noutra POSIÇÃO do ecrã — ver `moveBoard`. */
  function moverBoardParaPosicao(de: number, para: number) {
    setDoc((d) => {
      const arrumado = arrumadoEExplicito(d);
      const boards = [...arrumado.moodBoards];
      const [board] = boards.splice(de, 1);
      if (board === undefined) return d;
      boards.splice(para, 0, board);
      return { ...arrumado, moodBoards: boards };
    });
  }

  /**
   * Duplicar um board inteiro — fotos, textos, disposição.
   *
   * As fotos são CAMINHOS, e o mesmo caminho pode estar em dois boards sem
   * custo nenhum: não há bytes a copiar e o gerador resolve cada um por si. É
   * o que torna «esta página outra vez, com duas fotos trocadas» num gesto.
   *
   * O id NÃO é copiado (`id: undefined`): dois boards com a mesma identidade
   * partilhariam a dobra e a chave de React. É preenchido a partir da posição
   * na gravação seguinte.
   */
  function duplicarBoard(bi: number) {
    setDoc((d) => {
      const original = d.moodBoards[bi];
      if (!original) return d;
      const copia = {
        ...original,
        id: undefined,
        title: original.title?.trim() ? `${original.title} (cópia)` : "",
        images: [...original.images],
      };
      const boards = [...d.moodBoards];
      boards.splice(bi + 1, 0, copia);
      return { ...d, moodBoards: boards };
    });
    // QUAL DELES, E ONDE FICOU A CÓPIA. «Mood board duplicado.» não dizia
    // nenhuma das duas coisas, e numa secção de oito páginas são as duas que
    // interessam: o botão é um ícone de 28 px repetido em cada cartão, e a
    // cópia sai pela ordem dos capítulos como tudo o resto — num cartão alto
    // (uma grelha de seis fotos mais os campos), ela nasce abaixo da dobra.
    const original = doc.moodBoards[bi];
    if (!original) return;
    const nome = (original.title ?? "").trim() || `Inspiração ${bi + 1}`;
    const copiado = { ...original, title: nome ? `${nome} (cópia)` : "" };
    const depois = {
      ...doc,
      moodBoards: [...doc.moodBoards.slice(0, bi + 1), copiado, ...doc.moodBoards.slice(bi + 1)],
    } as ProposalDoc;
    const saem = temasComPagina(depois);
    const pos = saem.indexOf(bi + 1);
    toast(
      pos >= 0
        ? `«${nome}» duplicado — a cópia é a ${pos + 1}.ª das ${saem.length} páginas de inspiração do PDF.`
        : `«${nome}» duplicado — a cópia ficou logo a seguir. Sem fotografias nem texto, não sai no PDF.`,
      "info",
    );
  }

  /** Fechar (ou reabrir) um board a alterações — ver `MoodBoard.bloqueado`. */
  function alternarBloqueio(bi: number) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) =>
        i === bi ? { ...b, bloqueado: b.bloqueado ? undefined : true } : b,
      ),
    }));
  }

  return { alternarBloqueio, duplicarBoard, moveBoard, moverBoardParaPosicao };
}
