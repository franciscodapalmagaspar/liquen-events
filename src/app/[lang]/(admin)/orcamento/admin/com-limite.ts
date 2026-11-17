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
 * Nunca rejeita por um item: quem chama decide o que é falhar (as escritas
 * do back office devolvem `null` em vez de atirar).
 */
export async function comLimite<T, R>(
  itens: readonly T[],
  limite: number,
  fazer: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = new Array(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await fazer(itens[i], i);
    }
  };
  const quantos = Math.max(1, Math.min(limite, itens.length));
  await Promise.all(Array.from({ length: quantos }, trabalhador));
  return resultados;
}

/** Quantas escritas de um lote do back office podem estar no ar ao mesmo tempo. */
export const ESCRITAS_EM_SIMULTANEO = 4;
