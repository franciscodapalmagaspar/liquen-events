/**
 * O tecto de tempo dos pedidos do estúdio (auditoria de 13/11, estúdio n.º 15).
 *
 * Sem tecto, um `fetch` que a rede deixou pendurado ficava pendurado para
 * sempre — e o botão com ele, preso em «a enviar». O `AbortSignal.timeout`
 * corta-o; quando corta, o browser lança um `DOMException` de nome
 * `TimeoutError`, com uma frase inglesa («signal timed out») que não pode
 * chegar ao ecrã. Isto reconhece-o pela forma, para cada sítio dizer em
 * português o que se sabe.
 */

/** O envio da proposta: a rota tem 60 s, e a resposta ainda tem de voltar. */
export const TECTO_DO_ENVIO_MS = 90_000;
/** A pré-visualização: o mesmo desenho do envio, sem email. */
export const TECTO_DA_PRE_VISUALIZACAO_MS = 90_000;
/** Uma fotografia a subir (até ~10 MB numa rede de telemóvel). */
export const TECTO_DE_UMA_FOTO_MS = 120_000;

export function eTempoEsgotado(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const nome = (erro as { name?: unknown }).name;
  return nome === "TimeoutError" || nome === "AbortError";
}

/**
 * Um sinal com tecto, ou nenhum onde o browser não o sabe fazer (o pedido
 * segue como seguia antes — sem tecto, mas sem rebentar).
 */
export function sinalComTecto(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(ms)
    : undefined;
}
