"use client";
import { useMemo, useRef } from "react";
import { useToast } from "../../../Toast";
import { type LargadaDeFoto } from "../../../MoodBoardFotos";
import { marcaDepoisDeMexer } from "@/lib/proposal-moodboard";
import { ordemPorCor } from "@/lib/cor-dominante";
import { paginasDoTema } from "@/lib/pdf-editorial/plano";
import { disposicaoDoTema } from "@/lib/pdf-editorial/mosaico";
import { semAsFotosNasPaginas } from "@/lib/orcamento/estudio/temas-e-fotos";
import { type EventosDasFotos } from "../../fotos/FotosDoBoard";
import type { DestinoDaFoto } from "../../tipos";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";
import { useAccoesReversiveis } from "../../documento/useAccoesReversiveis";
import { useTotalDaProposta } from "../orcamento/useTotalDaProposta";
import { useMapasDasFotos } from "../../fotos/useMapasDasFotos";
import { useSeleccaoDeFotos } from "./useSeleccaoDeFotos";
import type { Dispatch, SetStateAction } from "react";

export interface EntradaFotosDosBoards {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  fotos: ReturnType<typeof useMapasDasFotos>;
  reversiveis: ReturnType<typeof useAccoesReversiveis>;
  seleccao: ReturnType<typeof useSeleccaoDeFotos>;
  setLupa: Dispatch<SetStateAction<{ bi: number; ii: number } | null>>;
  setPicker: Dispatch<SetStateAction<DestinoDaFoto | null>>;
  tentarBuscarFotos: () => Promise<void>;
  toast: ReturnType<typeof useToast>["toast"];
  total: ReturnType<typeof useTotalDaProposta>;
}

export function useFotosDosBoards({
  documento,
  fotos,
  reversiveis,
  seleccao,
  setLupa,
  setPicker,
  tentarBuscarFotos,
  toast,
  total,
}: EntradaFotosDosBoards) {
  const { doc, setDoc } = documento;
  const { assetCores, marcarUrlMorto, registarAspeto } = fotos;
  const { setLimpo } = reversiveis;
  const { alternarSeleccao, seleccionadas, setSeleccionadas } = seleccao;
  const { totalInput } = total;
  function addBoardImages(bi: number, paths: string[]) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) =>
        i === bi ? { ...b, images: [...b.images, ...paths] } : b,
      ),
    }));
    // Quem passa das doze fotografias fica a saber nesse instante que o tema
    // vai ocupar duas páginas no PDF — não é um erro (nenhuma fica de fora),
    // mas é uma página a mais, e decide-se melhor a escolher do que no PDF.
    const antes = doc.moodBoards[bi]?.images.length ?? 0;
    const total = antes + paths.length;
    const disposicao = disposicaoDoTema(doc.moodBoards[bi]);
    if (paginasDoTema(total, disposicao) > paginasDoTema(antes, disposicao) && antes > 0) {
      toast(
        `Este tema fica com ${total} fotos e passa a ocupar ${paginasDoTema(total, disposicao)} páginas no PDF.`,
        "info",
      );
    }
  }
  /**
   * Remover uma foto — PELA POSIÇÃO, e com dez segundos para voltar atrás.
   *
   * Era por caminho (`filter((p) => p !== path)`), e a mesma fotografia pode
   * estar duas vezes no mesmo board: remover uma removia as duas. Com a grelha
   * a poder ser reordenada e a receber fotos de outros boards, a posição passou
   * a ser a única coisa que identifica uma célula.
   *
   * A anulação é a mesma dos dez segundos do «Limpar» (`setLimpo`): guarda o
   * documento inteiro antes de mexer. Sem diálogo a perguntar — é a regra desta
   * casa, e uma pergunta antes de tirar uma foto de uma grelha de quarenta
   * seria respondida sem ser lida.
   */
  function removeBoardImageAt(bi: number, ii: number) {
    setSeleccionadas(new Set());
    setLimpo({ doc, total: totalInput, segundos: 10, motivo: "Fotografia removida." });
    setDoc((d) => {
      const tirada = d.moodBoards[bi]?.images[ii];
      return semAsFotosNasPaginas(
        {
          ...d,
          moodBoards: d.moodBoards.map((b, i) =>
            i === bi
              ? {
                  ...b,
                  images: b.images.filter((_, j) => j !== ii),
                  // A marca da principal acompanha: sem isto, tirar a foto de cima
                  // fazia «a principal» passar a ser a que calhou àquele índice.
                  principal: marcaDepoisDeMexer(b, (antigo) =>
                    antigo === ii ? null : antigo > ii ? antigo - 1 : antigo,
                  ),
                }
              : b,
          ),
        },
        tirada ? [tirada] : [],
      );
    });
  }

  /**
   * Trocar UMA fotografia no lugar.
   *
   * Palavras dela: «Substituir uma foto sem a apagar primeiro: abre a
   * biblioteca e troca no lugar.» Sem isto, trocar era remover (perdendo a
   * posição), escolher outra — que ia para o fim — e arrastá-la de volta.
   *
   * A marca da principal não se toca: o lugar continua a ser o mesmo, e quem
   * troca a foto que manda na página quer que a nova mande na mesma.
   */
  function substituirFotoDoBoard(bi: number, ii: number, path: string) {
    // A que sai deixa também as páginas onde ela a tinha posto (o lugar volta
    // ao automático) — salvo se ainda estiver noutro tema.
    setDoc((d) => {
      const antiga = d.moodBoards[bi]?.images[ii];
      return semAsFotosNasPaginas(
        {
          ...d,
          moodBoards: d.moodBoards.map((b, i) =>
            i === bi ? { ...b, images: b.images.map((p, j) => (j === ii ? path : p)) } : b,
          ),
        },
        antiga && antiga !== path ? [antiga] : [],
      );
    });
    setPicker(null);
  }

  /** Reordenar dentro do mesmo board. */
  /**
   * ════════════════════════════════════════════════════════════════════════
   * ARRUMAR UM BOARD POR COR
   * ════════════════════════════════════════════════════════════════════════
   *
   * A ordem das fotos É a composição da página (ver `proposal-moodboard.ts`),
   * e uma página lê-se melhor quando as cores fazem uma transição em vez de
   * saltarem. Isto arruma-as por parecença — ver `ordemPorCor`, que encadeia
   * cada foto com a mais próxima da anterior.
   *
   * Não é destrutivo nem definitivo: entra no histórico como qualquer outra
   * alteração, e o Cmd+Z desfaz. Por isso não há caixa de confirmação.
   *
   * As fotos sem cor conhecida (as carregadas antes de a cor existir) ficam no
   * fim, pela ordem em que estavam — nunca se lhes inventa uma cor.
   */
  function arrumarPorCor(bi: number) {
    const board = doc.moodBoards[bi];
    if (!board) return;
    const ordem = ordemPorCor(board.images.map((p) => assetCores[p]));
    if (ordem.every((idx, i) => idx === i)) {
      toast("Esta página já está arrumada por cor.", "info");
      return;
    }
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) => {
        if (i !== bi) return b;
        return {
          ...b,
          images: ordem.map((idx) => b.images[idx]),
          // A foto que manda na página continua a ser a MESMA fotografia, no
          // sítio novo. Sem isto, arrumar por cor promovia a destaque outra
          // foto qualquer — a que calhasse cair na posição marcada.
          principal: marcaDepoisDeMexer(b, (antigo) => {
            const novo = ordem.indexOf(antigo);
            return novo < 0 ? antigo : novo;
          }),
        };
      }),
    }));
    toast("Fotografias arrumadas por cor. Cmd+Z desfaz.", "success");
  }

  function reordenarFotos(bi: number, de: number, para: number) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) => {
        if (i !== bi) return b;
        const imagens = [...b.images];
        const [foto] = imagens.splice(de, 1);
        if (foto === undefined) return b;
        imagens.splice(para, 0, foto);
        return {
          ...b,
          images: imagens,
          principal: marcaDepoisDeMexer(b, (antigo) => {
            if (antigo === de) return para;
            // As que ficam entre o sítio de onde saiu e aquele para onde foi
            // deslizam uma posição — para que lado depende da direcção.
            if (de < antigo && antigo <= para) return antigo - 1;
            if (para <= antigo && antigo < de) return antigo + 1;
            return antigo;
          }),
        };
      }),
    }));
  }

  /**
   * Mover uma foto de um board para outro.
   *
   * `paraIndice = -1` quer dizer «no fim» — é o que chega de uma largada na
   * grelha em vez de sobre uma foto, que é o único caminho possível quando o
   * board de destino está vazio.
   */
  function moverFotoDeBoard(
    deBoard: number,
    deIndice: number,
    paraBoard: number,
    paraIndice: number,
  ) {
    setDoc((d) => {
      const origem = d.moodBoards[deBoard];
      const foto = origem?.images[deIndice];
      if (foto === undefined) return d;
      return {
        ...d,
        moodBoards: d.moodBoards.map((b, i) => {
          if (i === deBoard) {
            return {
              ...b,
              images: b.images.filter((_, j) => j !== deIndice),
              principal: marcaDepoisDeMexer(b, (antigo) =>
                antigo === deIndice ? null : antigo > deIndice ? antigo - 1 : antigo,
              ),
            };
          }
          if (i === paraBoard) {
            const imagens = [...b.images];
            const onde = paraIndice < 0 ? imagens.length : Math.min(paraIndice, imagens.length);
            imagens.splice(onde, 0, foto);
            return {
              ...b,
              images: imagens,
              principal: marcaDepoisDeMexer(b, (antigo) => (antigo >= onde ? antigo + 1 : antigo)),
            };
          }
          return b;
        }),
      };
    });
  }

  /** Mover VÁRIAS de uma vez — a selecção múltipla, sem passar pela biblioteca. */
  function moverSeleccaoParaBoard(paraBoard: number) {
    const escolhidas = [...seleccionadas]
      .map((k) => {
        const [b, i] = k.split(":").map(Number);
        return { bi: b, ii: i };
      })
      .filter((s) => s.bi !== paraBoard);
    if (escolhidas.length === 0) {
      setSeleccionadas(new Set());
      return;
    }
    setLimpo({ doc, total: totalInput, segundos: 10, motivo: "Fotografias movidas." });
    setDoc((d) => {
      // Os caminhos são lidos ANTES de mexer em nada: mover uma foto muda os
      // índices das outras, e uma lista de índices lida a meio do caminho
      // apanharia as fotos erradas.
      const caminhos = escolhidas
        .map(({ bi, ii }) => ({ bi, ii, path: d.moodBoards[bi]?.images[ii] }))
        .filter((c): c is { bi: number; ii: number; path: string } => typeof c.path === "string");
      const aTirar = new Map<number, Set<number>>();
      for (const c of caminhos) {
        if (!aTirar.has(c.bi)) aTirar.set(c.bi, new Set());
        aTirar.get(c.bi)!.add(c.ii);
      }
      return {
        ...d,
        moodBoards: d.moodBoards.map((b, i) => {
          const tirar = aTirar.get(i);
          const semAsQueSaem = tirar
            ? {
                ...b,
                images: b.images.filter((_, j) => !tirar.has(j)),
                principal: marcaDepoisDeMexer(b, (antigo) =>
                  tirar.has(antigo) ? null : antigo - [...tirar].filter((j) => j < antigo).length,
                ),
              }
            : b;
          if (i !== paraBoard) return semAsQueSaem;
          return {
            ...semAsQueSaem,
            images: [...semAsQueSaem.images, ...caminhos.map((c) => c.path)],
          };
        }),
      };
    });
    setSeleccionadas(new Set());
    toast(
      escolhidas.length === 1
        ? "Fotografia movida. Podes anular durante 10 segundos."
        : `${escolhidas.length} fotografias movidas. Podes anular durante 10 segundos.`,
      "info",
    );
  }

  /**
   * Uma foto foi largada — dentro do board ou noutro.
   *
   * Um só sítio a decidir, e é aqui e não dentro do contexto de arrasto: o
   * `MoodBoardFotos.tsx` sabe de gestos e de identificadores, não sabe o que é
   * um documento de proposta.
   */
  function aoLargarFoto(largada: LargadaDeFoto) {
    if (largada.tipo === "reordenar") {
      reordenarFotos(largada.bi, largada.de, largada.para);
      return;
    }
    moverFotoDeBoard(largada.deBoard, largada.deIndice, largada.paraBoard, largada.paraIndice);
  }

  /** A foto que manda na página — ver `proposal-moodboard.ts`. */
  function marcarPrincipal(bi: number, ii: number) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) =>
        // Voltar a carregar na que já é principal DESMARCA: sem isso, marcar
        // seria uma porta de sentido único e a única saída era marcar a
        // primeira à mão.
        i === bi ? { ...b, principal: b.principal === ii ? undefined : ii } : b,
      ),
    }));
  }

  /** As fotografias escolhidas DESTA página, como texto («0,3») — um valor que
   *  só muda quando a escolha desta página muda, para o `memo` da grelha. */
  function seleccionadasDoBoard(bi: number): string {
    const out: number[] = [];
    for (const k of seleccionadas) {
      const [b, i] = k.split(":");
      if (Number(b) === bi) out.push(Number(i));
    }
    return out.sort((x, y) => x - y).join(",");
  }

  /*
    ── AS ACÇÕES DAS FOTOGRAFIAS, NUM OBJECTO QUE NUNCA MUDA (10/11) ──────
    A grelha de cada página é memorizada (`FotosDoBoard`), e um `memo` só serve
    se as props não mudarem a cada desenho. As acções são funções deste
    componente, refeitas a cada desenho; por isso a grelha recebe UM objecto
    estável cujos métodos chamam sempre a versão mais recente (a ref é
    actualizada em cada desenho). Nenhuma acção fica com dados velhos.
  */
  const accoesAtuais = useRef<EventosDasFotos | null>(null);
  // eslint-disable-next-line react-hooks/refs -- a ref acompanha cada desenho de propósito (ver acima)
  accoesAtuais.current = {
    reordenar: (bi, de, para) => reordenarFotos(bi, de, para),
    ampliar: (bi, ii) => setLupa({ bi, ii }),
    substituir: (bi, ii) => setPicker({ kind: "board", bi, substituir: ii }),
    principal: (bi, ii) => marcarPrincipal(bi, ii),
    seleccionar: (bi, ii) => alternarSeleccao(bi, ii),
    remover: (bi, ii) => removeBoardImageAt(bi, ii),
    tentarDeNovo: () => void tentarBuscarFotos(),
    morreu: (url) => marcarUrlMorto(url),
    medida: (caminho, aspeto) => registarAspeto(caminho, aspeto),
  };
  const eventosDasFotos = useMemo<EventosDasFotos>(
    () => ({
      reordenar: (...a) => accoesAtuais.current!.reordenar(...a),
      ampliar: (...a) => accoesAtuais.current!.ampliar(...a),
      substituir: (...a) => accoesAtuais.current!.substituir(...a),
      principal: (...a) => accoesAtuais.current!.principal(...a),
      seleccionar: (...a) => accoesAtuais.current!.seleccionar(...a),
      remover: (...a) => accoesAtuais.current!.remover(...a),
      tentarDeNovo: () => accoesAtuais.current!.tentarDeNovo(),
      morreu: (...a) => accoesAtuais.current!.morreu(...a),
      medida: (...a) => accoesAtuais.current!.medida(...a),
    }),
    [],
  );

  return {
    addBoardImages,
    aoLargarFoto,
    arrumarPorCor,
    eventosDasFotos,
    moverSeleccaoParaBoard,
    seleccionadasDoBoard,
    substituirFotoDoBoard,
  };
}
