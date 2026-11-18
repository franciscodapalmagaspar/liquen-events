"use client";

import { useConteudoDoEstudio } from "./etapas/useConteudoDoEstudio";
import { useEcraEmDia } from "./etapas/useEcraEmDia";
import { useEnvioDoEstudio } from "./etapas/useEnvioDoEstudio";
import { useInspiracaoDoEstudio } from "./etapas/useInspiracaoDoEstudio";
import { useNucleoDoEstudio } from "./etapas/useNucleoDoEstudio";
import { useRascunhoGuardaSozinho } from "./etapas/useRascunhoGuardaSozinho";
import type { PropsDoEstudio } from "./tipos";

/**
 * O estúdio de uma proposta: todos os ganchos de domínio, juntos.
 *
 * As etapas chamam-se SEMPRE por esta ordem, porque a ordem em que os efeitos
 * são declarados é a ordem em que o React os corre — e no estúdio essa ordem é
 * comportamento (a abertura do rascunho antes da gravação automática, a
 * gravação antes de quem lê o que ficou gravado). Cada etapa recebe o que as
 * anteriores devolveram e devolve fatias com nome de domínio (`documento`,
 * `fotos`, `total`, `envio`…), que o ecrã lê do contexto.
 *
 * A ordem dos 53 efeitos confere-se contra a do componente antigo — ver
 * `docs/ESTRUTURA-DO-CODIGO.md`, «A ordem dos efeitos é comportamento».
 */
export function useEstudioDaProposta(props: PropsDoEstudio) {
  const nucleo = useNucleoDoEstudio(props);
  useEcraEmDia(nucleo);
  const gravacao = useRascunhoGuardaSozinho(nucleo);
  const conteudo = useConteudoDoEstudio({ ...nucleo, ...gravacao });
  const inspiracao = useInspiracaoDoEstudio({ ...nucleo, ...conteudo });
  const envio = useEnvioDoEstudio({ ...nucleo, ...gravacao, ...conteudo, ...inspiracao });
  return { ...nucleo, ...gravacao, ...conteudo, ...inspiracao, ...envio };
}

/** O que o `ContextoDoEstudio` dá às peças do ecrã. */
export type Estudio = ReturnType<typeof useEstudioDaProposta>;
