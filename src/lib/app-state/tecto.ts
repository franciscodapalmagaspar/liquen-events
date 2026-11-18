import "server-only";

/**
 * Um pedido com prazo: rejeita com «tempo esgotado» se o trabalho não acabar
 * em `ms`. Sem isto, um pedido pendurado ficava com a rota inteira na mão até
 * a plataforma matar a função. As tentativas (quantas, com que pausa) estão em
 * `tentativas.ts`.
 */
export async function comTecto<T>(trabalho: PromiseLike<T>, ms: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      trabalho,
      new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new Error("tempo esgotado")), ms);
      }),
    ]);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}
