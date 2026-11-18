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

/** O que uma tentativa diz: se ACABOU (gravou, ou a recusa é definitiva) e o
 *  resultado que fica se for a última. */
export interface Tentativa<T> {
  acabou: boolean;
  valor: T;
}

/**
 * O ciclo de todas as gravações: chama `tentar` até ele dizer que acabou, no
 * máximo `GRAVACAO_TENTATIVAS` vezes, com uma pausa curta e crescente entre
 * elas, e devolve o resultado da última. Cada tentativa recebe o resultado da
 * anterior (para guardar o motivo de uma recusa, por exemplo).
 *
 * Uma excepção (a rede em baixo, o tecto de tempo) é exactamente o caso que a
 * repetição existe para apanhar: conta como uma tentativa falhada, com o
 * resultado que `seRebentar` disser. O que se grava e porquê falhou é de quem
 * chama — este só decide o RITMO.
 */
export async function repetirAteGravar<T>(
  tentar: (anterior: T | undefined) => Promise<Tentativa<T>>,
  seRebentar: (anterior: T | undefined) => T,
): Promise<T> {
  let valor: T | undefined;
  for (let tentativa = 1; ; tentativa++) {
    let t: Tentativa<T>;
    try {
      t = await tentar(valor);
    } catch {
      t = { acabou: false, valor: seRebentar(valor) };
    }
    valor = t.valor;
    if (t.acabou || tentativa >= GRAVACAO_TENTATIVAS) return valor;
    await pausa(GRAVACAO_PAUSA_MS * tentativa);
  }
}

/** O que UMA tentativa de envio devolve. A repetição é desta casa, não de quem
 *  chama: `definitivo` é a forma de dizer «não voltes a tentar, a resposta vai
 *  ser esta». */
export type RespostaDoEnvio =
  | { estado: "guardado" }
  | { estado: "falhou"; porque?: string; definitivo?: boolean };

/** O que a gravação inteira devolve — depois de esgotadas as tentativas. */
export type ResultadoDaGravacao =
  | { estado: "guardado" }
  /** Não ficou no servidor. Quem chama sabe se ficou nalgum outro lado. */
  | { estado: "nao-guardado"; porque?: string };

/** Repetir esta resposta dá o mesmo? Um 4xx (o pedido está errado) ou um 503
 *  `permanente` (a instalação está incompleta): sim. */
export function eRecusaDefinitiva(status: number, permanente?: boolean): boolean {
  return status < 500 || permanente === true;
}

/**
 * Traduz um código de estado HTTP numa tentativa.
 *
 * Um 4xx é o pedido que está errado (sessão expirada, corpo grande demais,
 * campo inválido) e repeti-lo dá exactamente o mesmo. Um 503 marcado como
 * `permanente` é a instalação que está incompleta — a tabela não existe, ou a
 * chave não a pode escrever — e também dá o mesmo. Nos dois casos, repetir só
 * atrasa o aviso.
 */
export function respostaDeHttp(
  status: number,
  opcoes: { porque?: string; permanente?: boolean } = {},
): RespostaDoEnvio {
  if (status >= 200 && status < 300) return { estado: "guardado" };
  return {
    estado: "falhou",
    porque: opcoes.porque,
    definitivo: eRecusaDefinitiva(status, opcoes.permanente),
  };
}

/**
 * Corre uma tentativa de cada vez, com pausa curta e crescente, e devolve a
 * VERDADE sobre onde é que a coisa ficou. Nunca lança: uma edição não pode
 * falhar porque a gravação falhou. Uma tentativa que rebenta não tem motivo
 * para mostrar (não houve resposta): fica o da anterior, se havia.
 */
export function enviarComRepeticao(
  tentar: () => Promise<RespostaDoEnvio>,
): Promise<ResultadoDaGravacao> {
  const porqueDe = (r?: ResultadoDaGravacao) =>
    r?.estado === "nao-guardado" ? r.porque : undefined;
  return repetirAteGravar<ResultadoDaGravacao>(
    async (anterior) => {
      const r = await tentar();
      if (r.estado === "guardado") return { acabou: true, valor: { estado: "guardado" } };
      return {
        acabou: r.definitivo === true,
        valor: { estado: "nao-guardado", porque: r.porque ?? porqueDe(anterior) },
      };
    },
    (anterior) => ({ estado: "nao-guardado", porque: porqueDe(anterior) }),
  );
}
