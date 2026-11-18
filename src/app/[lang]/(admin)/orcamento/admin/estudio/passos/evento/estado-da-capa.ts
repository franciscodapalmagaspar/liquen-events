import {
  perdaNaFolha,
  problemaDaCapa,
  type ProblemaDaCapa,
} from "@/lib/pdf-editorial/regra-da-capa";

type Foco = { x: number; y: number };

/**
 * O que a secção da capa sabe da fotografia que lá está: se serve para a
 * folha, se ela disse «usa esta na mesma», se a que se vê vai mesmo para o
 * PDF, quanto se perde no recorte, e o enquadramento que se mostra.
 *
 * A regra do que serve é a do servidor (`regra-da-capa.ts`); isto só junta as
 * respostas para o ecrã.
 */
export type EstadoDaCapa = {
  problema: ProblemaDaCapa | null;
  /** Ela disse «usa esta na mesma»: vai, recortada como aqui. */
  mesmoAssim: boolean;
  /** A fotografia que se vê aqui NÃO é a que vai para o PDF. */
  naoVai: boolean;
  /** A parte da fotografia que o recorte da folha deita fora (0–1). */
  perda: number;
  /**
   * O enquadramento que se VÊ é o que sai: o escolhido à mão, ou o que o PDF
   * escolheria sozinho (perguntado ao servidor), ou o centro enquanto a
   * resposta não chega.
   */
  focoVisto: Foco;
};

export function estadoDaCapa({
  path,
  aspeto,
  tamanho,
  capaMesmoAssim,
  focoDaCapa,
  focoAuto,
}: {
  path: string;
  aspeto: number | undefined;
  tamanho: { w: number; h: number } | null;
  capaMesmoAssim: boolean | undefined;
  focoDaCapa: Foco | undefined;
  focoAuto: { caminho: string; foco: Foco } | null;
}): EstadoDaCapa {
  const problema = tamanho
    ? problemaDaCapa(tamanho.w, tamanho.h)
    : aspeto && aspeto < 1
      ? "ao-alto"
      : null;
  const mesmoAssim = !!problema && !!capaMesmoAssim;
  const naoVai = !!problema && !mesmoAssim;
  const perda = aspeto && (!problema || mesmoAssim) ? perdaNaFolha(aspeto) : 0;
  const focoVisto = focoDaCapa ??
    (focoAuto?.caminho === path ? focoAuto.foco : undefined) ?? { x: 0.5, y: 0.5 };
  return { problema, mesmoAssim, naoVai, perda, focoVisto };
}
