/**
 * O ritmo de todas as gravações do back office — a automática dos ecrãs
 * (`admin/useGravacaoAutomatica.ts`) e o rascunho do estúdio
 * (`lib/orcamento/estudio/gravar.ts`) — escrito UMA vez.
 *
 * O ritmo (quantas vezes, que pausa, que tecto) e o CICLO que o usa — tentar,
 * parar perante uma recusa definitiva, esperar e tentar outra vez — estavam
 * escritos três vezes, com um comentário a dizer que a cópia era temporária;
 * partir o estúdio fixou-a em duas camadas. Mudar o tecto ou as
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

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * O ciclo de todas as gravações: chama `tentar` até ele dizer que ACABOU
 * (`true`: gravou, ou a recusa é definitiva e repetir dá o mesmo), no máximo
 * `GRAVACAO_TENTATIVAS` vezes, com uma pausa curta e crescente entre elas.
 *
 * Uma excepção (a rede em baixo, o tecto de tempo) é exactamente o caso que a
 * repetição existe para apanhar: conta como uma tentativa falhada, e
 * `aoRebentar` deixa quem chama esquecer o motivo da anterior. O que se gravou
 * e porquê falhou fica com quem chama — este só decide o RITMO.
 */
export async function repetirAteGravar(
  tentar: () => Promise<boolean>,
  aoRebentar: () => void = () => {},
): Promise<void> {
  for (let tentativa = 1; tentativa <= GRAVACAO_TENTATIVAS; tentativa++) {
    try {
      if (await tentar()) return;
    } catch {
      aoRebentar();
    }
    if (tentativa < GRAVACAO_TENTATIVAS) await pausa(GRAVACAO_PAUSA_MS * tentativa);
  }
}
