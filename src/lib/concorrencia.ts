/**
 * ════════════════════════════════════════════════════════════════════════════
 * N DE CADA VEZ — UM SÓ LIMITADOR DE TAREFAS EM VOO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Havia dois (o `comLimite` das escritas em lote e o `pool` do envio de
 * fotografias), com contratos diferentes e um deles sem chão: `pool(itens, 0)`
 * não arrancava ninguém e voltava sem ter feito nada. Fica um código, com duas
 * portas: o resultado por item (`comLimite`), e «faz isto a cada um, até
 * mandarem parar» (`pool`).
 */

/**
 * AS ESCRITAS DE UM LOTE (revisão · 3 do BO 4).
 *
 * Um lote de 37 pedidos eram 37 PATCH lançados no mesmo instante: 37 funções
 * da Vercel a acordar juntas, 37 ligações ao Supabase ao mesmo tempo, e — no
 * 4G dela — 37 pedidos a disputar a mesma ligação, com os primeiros a
 * esgotarem o tempo à espera dos últimos. Agora vão `limite` de cada vez: o
 * próximo sai quando um acaba, e a ordem das respostas é a ordem dos itens.
 *
 * Nunca rejeita por um item: o resultado é POR ITEM — o valor, ou `null`
 * quando aquele item falhou (atirou ou rejeitou). Um item que atira não pode
 * derrubar o lote inteiro: era o que deixava o «Anular» do «Marcar como» sem
 * aplicar os que voltaram (2.ª revisão · 2).
 */
export async function comLimite<T, R>(
  itens: readonly T[],
  limite: number,
  fazer: (item: T, indice: number) => Promise<R>,
): Promise<(R | null)[]> {
  const resultados: (R | null)[] = new Array(itens.length).fill(null);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      try {
        resultados[i] = await fazer(itens[i], i);
      } catch {
        resultados[i] = null;
      }
    }
  };
  const quantos = Math.max(1, Math.min(limite, itens.length));
  await Promise.all(Array.from({ length: quantos }, trabalhador));
  return resultados;
}

/**
 * Corre `worker` sobre `items`, no máximo `limit` em voo, pela ordem em que
 * vêm. Uma falha num item não pára os outros (é o `comLimite` por baixo).
 * `stop` é consultado antes de cada item: é assim que sair da pasta trava o
 * que ainda não começou, sem cortar o que já vai a caminho.
 */
export async function pool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  stop: () => boolean = () => false,
): Promise<void> {
  await comLimite(items, limit, async (item) => {
    if (!stop()) await worker(item);
  });
}

/** Quantas escritas de um lote do back office podem estar no ar ao mesmo tempo. */
export const ESCRITAS_EM_SIMULTANEO = 4;
