import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from "react";
import type { LeituraFalhada } from "@/lib/porque-nao-leu";
import type { AvaliacaoDaFoto } from "@/lib/qualidade-da-foto";
import type { ThemeImage } from "@/lib/theme-types";

/**
 * As três famílias de props do seletor de fotos — a coluna das fotos
 * (`FotosDoTema`) e a grelha (`GrelhaDoSeletor`) recebiam-nas soltas, 34 e 24
 * de cada vez, e qualquer mudança no `ThemePicker` mudava o contrato das duas
 * (júri das fases 7 e 8, ponto 2). Agrupadas pelo que são:
 *   · as FOTOS do tema que se está a ver, e o seu carregamento;
 *   · a SELECÇÃO — o que está escolhido, e o que se pode fazer com isso;
 *   · a NAVEGAÇÃO da grelha — o foco, a pré-visualização, o teclado.
 */

/** As fotografias do tema aberto no seletor, e o carregamento delas. */
export interface FotosDoSeletor {
  themeId: string | null;
  images: ThemeImage[];
  truncated: boolean;
  unreadable: boolean;
  falhaFotos: LeituraFalhada | null;
  loadingImages: boolean;
  loadingMore: boolean;
  failedPaths: string[];
  remaining: number | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

/** O que está escolhido no seletor, e o que se pode fazer com isso. */
export interface SeleccaoDoSeletor {
  selected: string[];
  selectedSet: Set<string>;
  pendingSet: Set<string>;
  usedSet: Set<string>;
  atLimit: boolean;
  toggleAt: (index: number, extend: boolean) => void;
  selectAllVisible: () => void;
  decidirNaCuradoria: (path: string, incluir: boolean) => void;
  qualidadeDe: (im: ThemeImage) => AvaliacaoDaFoto | null;
  /** Desfaz a selecção inteira («Limpar seleção»). */
  limpar: () => void;
}

/** O foco, a pré-visualização e o teclado da grelha. */
export interface NavegacaoDaGrelha {
  focusIndex: number;
  setFocusIndex: Dispatch<SetStateAction<number>>;
  setPreviewIndex: Dispatch<SetStateAction<number | null>>;
  gridRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  onGridKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}
