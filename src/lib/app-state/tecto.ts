import "server-only";

/**
 * Um pedido com prazo: rejeita com «tempo esgotado» se o trabalho não acabar
 * em `ms`. Sem isto, um pedido pendurado ficava com a rota inteira na mão até
 * a plataforma matar a função. As tentativas (quantas, com que pausa) estão em
 * `tentativas.ts`.
 *
 * Dado como FUNÇÃO, o trabalho recebe um `AbortSignal` que se dispara no
 * prazo: um pedido do PostgREST com `.abortSignal(sinal)` é mesmo cortado, em
 * vez de continuar a correr (e a ocupar a ligação) depois de se ter desistido
 * dele. Dado como promessa, só se deixa de esperar.
 */
export async function comTecto<T>(
  trabalho: PromiseLike<T> | ((sinal: AbortSignal) => PromiseLike<T>),
  ms: number,
): Promise<T> {
  const controlo = new AbortController();
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      typeof trabalho === "function" ? trabalho(controlo.signal) : trabalho,
      new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => {
          const erro = new Error("tempo esgotado");
          controlo.abort(erro);
          rejeitar(erro);
        }, ms);
      }),
    ]);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}
