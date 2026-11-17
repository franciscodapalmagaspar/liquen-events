import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { type LeituraFalhada } from "@/lib/porque-nao-leu";
import { type AvaliacaoDaFoto } from "@/lib/qualidade-da-foto";
import { type ThemeImage } from "@/lib/theme-types";
import { type FotoDaPagina } from "../../PaginaEmConstrucao";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE A GRELHA DO SELETOR RECEBE — por intenção, e não 34 props soltas
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `FotosDoTema` recebia 34 props e passava 24 à `GrelhaDoSeletor`: qualquer
 * mudança no `ThemePicker` mudava o contrato das duas. Passam a cinco grupos,
 * cada um com o que diz o nome. Nenhuma das duas usa `memo`: objectos novos a
 * cada desenho não mudam quando nem o que se desenha.
 */

/** As fotos do tema aberto e a leitura delas. */
export interface FotosDoSeletor {
  themeId: string | null;
  images: ThemeImage[];
  truncated: boolean;
  unreadable: boolean;
  falhaFotos: LeituraFalhada | null;
  loadingImages: boolean;
  loadingMore: boolean;
  remaining: number | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

/** O que está escolhido e como se escolhe. */
export interface SeleccaoDoSeletor {
  multiple: boolean;
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  selectedSet: Set<string>;
  focusIndex: number;
  setFocusIndex: Dispatch<SetStateAction<number>>;
  toggleAt: (index: number, extend: boolean) => void;
  selectAllVisible: () => void;
  onGridKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  atLimit: boolean;
  aEntrar: FotoDaPagina[];
}

/** As marcas de cada foto: a caminho, já usada, falhou, a qualidade. */
export interface MarcasDoSeletor {
  pendingSet: Set<string>;
  usedSet: Set<string>;
  failedPaths: string[];
  usadasNoutras: Readonly<Record<string, string>> | undefined;
  qualidadeDe: (im: ThemeImage) => AvaliacaoDaFoto | null;
}

/** A curadoria: escolher foto a foto o que entra. */
export interface CuradoriaDoSeletor {
  curadoria: boolean;
  setCuradoria: Dispatch<SetStateAction<boolean>>;
  decidirNaCuradoria: (path: string, incluir: boolean) => void;
}

/** Onde a grelha vive no ecrã: as referências, a lupa, a largura. */
export interface VistaDoSeletor {
  gridRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  setPreviewIndex: Dispatch<SetStateAction<number | null>>;
  largoQueChegue: boolean;
}
