/**
 * Um passo com prazo: se `trabalho` não acabar em `ms`, a promessa devolvida
 * é recusada com `TempoEsgotado` — e quem chama segue em frente.
 *
 * O trabalho de fora NÃO é cancelado (uma ida ao Supabase não se desfaz a
 * meio); só deixa de se esperar por ele — a não ser que traga um `parar`. É o que serve às rotinas agendadas,
 * em que o que importa é a função responder antes do tecto da Vercel: um passo
 * pendurado não pode levar os outros atrás.
 */
export class TempoEsgotado extends Error {
  constructor(
    readonly passo: string,
    readonly ms: number,
  ) {
    super(`${passo}: tempo esgotado ao fim de ${ms} ms`);
    this.name = "TempoEsgotado";
  }
}

/**
 * `parar`, quando o trabalho o sabe ler (revisão de 17/11): esgotado o prazo,
 * cancela-o, para o trabalho não continuar em fundo depois da resposta. Sem
 * ele, só se deixa de esperar.
 */
export async function comPrazo<T>(
  trabalho: PromiseLike<T>,
  ms: number,
  passo: string,
  parar?: AbortController,
): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      trabalho,
      new Promise<never>((_, recusar) => {
        temporizador = setTimeout(
          () => {
            parar?.abort(new TempoEsgotado(passo, ms));
            recusar(new TempoEsgotado(passo, ms));
          },
          Math.max(0, ms),
        );
      }),
    ]);
  } finally {
    clearTimeout(temporizador);
  }
}
