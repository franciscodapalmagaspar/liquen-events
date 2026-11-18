import type { Dispatch, SetStateAction } from "react";
import type { Quote } from "@/lib/orcamento/types";
import type { useToast } from "../../Toast";
import type { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import type { useMapasDasFotos } from "../fotos/useMapasDasFotos";
import type { useTotalDaProposta } from "../passos/orcamento/useTotalDaProposta";
import type { useTraducoes } from "../traducoes/useTraducoes";
import type { useCamposPorConfirmar } from "../versoes/useCamposPorConfirmar";
import type { useEstadoDoRascunho } from "./useEstadoDoRascunho";
import type { useGravarNoServidor } from "./useGravarNoServidor";

/** O que a abertura do estúdio (os dois tempos) precisa dos outros ganchos. */
export interface EntradaAberturaDoEstudio {
  DRAFT_KEY: string;
  SIDE_KEY: string;
  camposPorConfirmar: ReturnType<typeof useCamposPorConfirmar>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  fotos: ReturnType<typeof useMapasDasFotos>;
  quote: Quote;
  rascunho: ReturnType<typeof useEstadoDoRascunho>;
  servidor: ReturnType<typeof useGravarNoServidor>;
  setRefEdited: Dispatch<SetStateAction<boolean>>;
  toast: ReturnType<typeof useToast>["toast"];
  total: ReturnType<typeof useTotalDaProposta>;
  traducoes: ReturnType<typeof useTraducoes>;
}
