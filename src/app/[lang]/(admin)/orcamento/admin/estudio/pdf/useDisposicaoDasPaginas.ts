"use client";
import { isPendingImage } from "@/lib/proposal-doc";
import { useAnular } from "../../ui/anular";
import { NOME_DA_DISPOSICAO, type Disposicao } from "@/lib/pdf-editorial/mosaico";
import { trocarNoLugar } from "@/lib/pdf-editorial/lugares-escolhidos";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useCapa } from "../passos/evento/useCapa";
import { useMoodBoards } from "../passos/inspiracao/useMoodBoards";
import { usePaginasDaProposta } from "./usePaginasDaProposta";
import { useFotosDaPagina } from "./useFotosDaPagina";

export interface EntradaDisposicaoDasPaginas {
  anular: ReturnType<typeof useAnular>;
  capa: ReturnType<typeof useCapa>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  fotosDaPagina: ReturnType<typeof useFotosDaPagina>;
  moodBoards: ReturnType<typeof useMoodBoards>;
  paginasDaProposta: ReturnType<typeof usePaginasDaProposta>;
}

export function useDisposicaoDasPaginas({
  anular,
  capa,
  documento,
  fotosDaPagina,
  moodBoards,
  paginasDaProposta,
}: EntradaDisposicaoDasPaginas) {
  const { idxDaCapa, setCoverAt } = capa;
  const { doc, setDoc } = documento;
  const { gravarFotosDaPagina, lugaresDaPagina, setLugarDaFoto } = fotosDaPagina;
  const { updateBoard } = moodBoards;
  const { fotosDoPdf } = paginasDaProposta;
  /**
   * A disposição das fotografias de um tema (ou a automática, com `null`), com
   * «Anular». Ela pediu-a de volta a 15/10 — ver `EscolherDisposicao`.
   */
  function mudarDisposicao(bi: number, d: Disposicao | null) {
    const antes = doc.moodBoards[bi]?.disposicao;
    updateBoard(bi, { disposicao: d ?? undefined });
    anular(d ? `Disposição: ${NOME_DA_DISPOSICAO[d]}.` : "Disposição automática.", () =>
      updateBoard(bi, { disposicao: antes }),
    );
  }
  /** A mesma disposição em todos os temas que não estão fechados, com «Anular». */
  function disposicaoEmTodos(d: Disposicao) {
    const antes = doc.moodBoards.map((b) => b.disposicao);
    setDoc((x) => ({
      ...x,
      moodBoards: x.moodBoards.map((b) => (b.bloqueado ? b : { ...b, disposicao: d })),
    }));
    anular(`«${NOME_DA_DISPOSICAO[d]}» em todos os temas.`, () =>
      setDoc((x) => ({
        ...x,
        moodBoards: x.moodBoards.map((b, i) => ({ ...b, disposicao: antes[i] })),
      })),
    );
  }
  /** Põe `ref` no lugar `lugar` da página — os outros lugares ficam como estão. */
  function porFotoNaPagina(chave: string, nome: string, max: number, lugar: number, ref: string) {
    if (chave === "capa") {
      setCoverAt(idxDaCapa, ref);
      return;
    }
    // Cada lugar fica no SEU sítio (na paleta, o 6.º é o painel grande): na
    // paleta os outros lugares continuam automáticos; nas outras páginas fica
    // o que lá estava, como sempre foi. Ver `lugares-escolhidos.ts`.
    const novo = trocarNoLugar(
      doc.fotosDasPaginas?.[chave],
      lugaresDaPagina(chave),
      lugar,
      ref,
      max,
      chave.startsWith("ambiente"),
    );
    gravarFotosDaPagina(chave, novo.fotos, `Fotografia de «${nome}» trocada.`, novo.focos ?? []);
  }
  /** Uma ou duas no separador. */
  function quantasNaPagina(chave: string, nome: string, n: 1 | 2) {
    const agora = lugaresDaPagina(chave).filter((f): f is string => !!f);
    let fotos = agora.slice(0, n);
    if (n === 2 && fotos.length < 2) {
      // A segunda: a que o PDF lá tinha, ou a primeira de outra que haja.
      const outra = [
        ...(fotosDoPdf?.[chave] ?? []).map((f) => f.ref),
        ...doc.moodBoards.flatMap((b) => b.images),
      ].find((r): r is string => !!r && !fotos.includes(r) && !isPendingImage(r));
      if (outra) fotos = [...fotos, outra];
    }
    gravarFotosDaPagina(
      chave,
      fotos,
      n === 1 ? `«${nome}» com uma fotografia.` : `«${nome}» com duas fotografias.`,
    );
    setLugarDaFoto(0);
  }

  return { disposicaoEmTodos, mudarDisposicao, porFotoNaPagina, quantasNaPagina };
}
