/**
 * ════════════════════════════════════════════════════════════════════════════
 * N DE CADA VEZ — AS ESCRITAS DE UM LOTE (revisão · 3 do BO 4)
 * ════════════════════════════════════════════════════════════════════════════
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

/** Quantas escritas de um lote do back office podem estar no ar ao mesmo tempo. */
export const ESCRITAS_EM_SIMULTANEO = 4;
