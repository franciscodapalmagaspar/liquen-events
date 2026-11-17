/**
 * Um tecto de tarefas em voo, sem biblioteca.
 *
 * Corre `worker` sobre `items` com no máximo `limit` em voo, pela ordem em que
 * vêm. `worker` NUNCA deve lançar — quem chama trata cada falha dentro dele e
 * guarda-a, para que um ficheiro mau não deite fora os 299 que faltam.
 * `stop` é consultado antes de cada item: é assim que sair da pasta trava o
 * que ainda não começou, sem cortar o que já vai a caminho.
 */
export async function pool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  stop: () => boolean = () => false,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length || stop()) return;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}
