import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lê uma tabela INTEIRA do Supabase, às páginas de 1000.
 *
 * O PostgREST corta cada resposta nas 1000 linhas e não avisa. As limpezas da
 * noite (pastas órfãs, PDFs substituídos) decidem o que APAGAR a partir do que
 * leem: uma lista cortada fazia um pedido ou uma proposta vivos parecerem
 * órfãos (revisão de 13/11, n.ºs 7 e 8). Ordena-se pela chave primária, que é
 * única — sem empates entre páginas. (Uma linha APAGADA a meio da leitura pode
 * fazer saltar uma linha da página seguinte: as duas limpezas aguentam isso
 * porque só apagam depois de 7 dias numa lista de espera, revista todas as
 * noites.)
 *
 * Custo, medido a 13/11: as 15 tabelas somam ~5 MB (a `app_state` ~3,4 MB,
 * ~1 770 linhas — já passava das 1000). Um pedido por cada 1000 linhas, e só
 * nas noites em que há candidatos. Mais um pedido, vazio, no fim.
 */
const PAGINA = 1000;

const chaveDe = (tabela: string) => (tabela === "app_state" ? "key" : "id");

export async function lerTodasAsLinhas<T = Record<string, unknown>>(
  sb: SupabaseClient,
  tabela: string,
  colunas: string,
): Promise<{ data: T[] | null; error: unknown }> {
  const todas: T[] = [];
  // Avança pelo que VEIO e só pára numa página vazia: assim não depende de o
  // `max-rows` ser 1000 (com 500, uma página «curta» de 500 não é o fim).
  // Custa um pedido vazio no fim — aceitável numa tarefa da noite.
  for (let desde = 0; ; ) {
    const { data, error } = await sb
      .from(tabela)
      .select(colunas)
      .order(chaveDe(tabela), { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error || !data) return { data: null, error: error ?? new Error("sem dados") };
    if (data.length === 0) return { data: todas, error: null };
    todas.push(...(data as T[]));
    desde += data.length;
  }
}
