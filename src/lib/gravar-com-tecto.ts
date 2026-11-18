/**
 * O ritmo de todas as gravações do back office — a automática dos ecrãs
 * (`admin/useGravacaoAutomatica.ts`) e o rascunho do estúdio
 * (`lib/orcamento/estudio/gravar.ts`) — escrito UMA vez.
 *
 * Estavam escritos nos dois sítios, com um comentário a dizer que a cópia era
 * temporária; partir o estúdio fixou-a em duas camadas. Mudar o tecto ou as
 * tentativas num deles e não no outro punha o estúdio e o painel a repetir as
 * gravações de forma diferente sem nenhum teste dar por isso (júri de 17/11).
 */

/** Quantas vezes se tenta antes de desistir. */
export const GRAVACAO_TENTATIVAS = 3;
/** Pausa base entre tentativas; cresce com o número da tentativa. */
export const GRAVACAO_PAUSA_MS = 400;
/** Tecto de tempo de cada tentativa. */
export const GRAVACAO_TECTO_MS = 10000;

/**
 * Um `fetch` com tecto de tempo próprio. Sem ele, uma rede que aceita a ligação
 * e nunca responde deixa a gravação pendurada para sempre — e o indicador
 * ficaria eternamente em «a guardar…», que é outra maneira de mentir.
 */
export async function fetchComTecto(
  url: string,
  init: RequestInit,
  ms: number = GRAVACAO_TECTO_MS,
): Promise<Response> {
  const abortador = new AbortController();
  const t = setTimeout(() => abortador.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: abortador.signal });
  } finally {
    clearTimeout(t);
  }
}
