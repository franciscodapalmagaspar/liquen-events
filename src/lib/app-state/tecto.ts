import "server-only";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FALHA PASSAGEIRA NÃO PODE CUSTAR UM RASCUNHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O mesmo desenho que `proposal-storage.descarregar` já usa para as fotos, e
 * pela mesma razão: uma ligação reciclada do outro lado, um pico no Supabase, e
 * a gravação morria à primeira. Aqui o que morre é a montagem de uma proposta.
 *
 * Duas tentativas extra, com pausa curta e crescente (150 ms, 300 ms), e um
 * tecto de tempo por tentativa — sem ele um pedido pendurado fica com a rota
 * inteira na mão até a plataforma matar a função.
 *
 * O que NÃO se repete: uma tabela em falta e uma permissão recusada. Essas
 * respondem exactamente o mesmo à terceira vez que à primeira, e repeti-las só
 * atrasa o momento em que o ecrã pode dizer a verdade.
 */
export const TENTATIVAS = 3;
export const PAUSA_MS = 150;
export const TEMPO_POR_TENTATIVA_MS = 8000;

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
