import { type Dispatch, type SetStateAction } from "react";
import { type LeituraFalhada } from "@/lib/porque-nao-leu";
import { type ThemeCopyMode, type ThemeImage } from "@/lib/theme-types";
import { type ThemeCopyOutcome } from "../ThemeCopyDialog";
import { type Failure, type Skipped, type ThumbJob } from "./tipos-da-pasta";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE AS PEÇAS DA PASTA RECEBEM — por intenção, e não 24 props soltas
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os avisos da pasta recebiam 24 props e a grelha 19. Passam a grupos com
 * nome: o que se está a mandar, as miniaturas, a cópia para outro tema, a
 * leitura da pasta e o largar de ficheiros. Nenhuma das peças usa `memo`.
 */

/** O envio em curso: o progresso, o que falhou, o que se saltou. */
export interface EnvioDaPasta {
  progress: { done: number; total: number } | null;
  pct: number;
  failed: Failure[];
  setFailed: Dispatch<SetStateAction<Failure[]>>;
  skipped: Skipped[];
  setSkipped: Dispatch<SetStateAction<Skipped[]>>;
  legacyPhotos: boolean;
  partialCheck: boolean;
  verifying: { done: number; total: number } | null;
  trackUrl: (file: File) => string | undefined;
  retryFailed: () => void;
  addSkippedAnyway: () => void;
}

/** As miniaturas que faltam e o trabalho que as refaz. */
export interface MiniaturasDaPasta {
  thumbJob: ThumbJob | null;
  missingThumbs: boolean;
  thumbPct: number;
  runThumbJob: () => Promise<void>;
  /** Pede à geração de miniaturas que pare (no fim do lote que vai a meio). */
  pararMiniaturas: () => void;
}

/** Copiar ou mover fotos para outro tema, e o relatório do que aconteceu. */
export interface CopiaDaPasta {
  setCopyOpen: Dispatch<SetStateAction<boolean>>;
  setCopyMode: Dispatch<SetStateAction<ThemeCopyMode>>;
  copyReport: ThemeCopyOutcome | null;
  setCopyReport: Dispatch<SetStateAction<ThemeCopyOutcome | null>>;
}

/** As fotos da pasta e a leitura delas, página a página. */
export interface LeituraDaPasta {
  images: ThemeImage[];
  truncated: boolean;
  falhaDaPasta: LeituraFalhada | null;
  loading: boolean;
  loadingMore: boolean;
  remaining: number | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

/** Largar ficheiros (e pastas inteiras) por cima da grelha. */
export interface LargarNaPasta {
  drag: boolean;
  setDrag: Dispatch<SetStateAction<boolean>>;
  /**
   * A profundidade do arrasto por cima da grelha (cada filho que o ponteiro
   * atravessa conta uma entrada e uma saída). Vive na pasta, que é dona dela;
   * a grelha só a faz andar — e sabe quando voltou a zero.
   */
  arrasto: { entrar: () => void; sair: () => number; zerar: () => void };
  handleDrop: (entries: FileSystemEntry[], files: File[]) => Promise<void>;
}
