import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lê uma tabela INTEIRA do Supabase, às páginas de 1000.
 *
 * O PostgREST corta cada resposta nas 1000 linhas e não avisa. As limpezas da
 * noite (pastas órfãs, PDFs substituídos) decidem o que APAGAR a partir do que
 * leem: uma lista cortada fazia um pedido ou uma proposta vivos parecerem
 * órfãos (revisão de 13/11, n.ºs 7 e 8). Ordena-se pela chave primária, que é
 * única — sem empates, as páginas não repetem nem saltam linhas.
 *
 * Custo: um pedido por cada 1000 linhas (mais um, vazio, quando o total é
 * múltiplo exacto de 1000). Só corre nas tarefas da noite.
 */
const PAGINA = 1000;

const chaveDe = (tabela: string) => (tabela === "app_state" ? "key" : "id");

export async function lerTodasAsLinhas<T = Record<string, unknown>>(
  sb: SupabaseClient,
  tabela: string,
  colunas: string,
): Promise<{ data: T[] | null; error: unknown }> {
  const todas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await sb
      .from(tabela)
      .select(colunas)
      .order(chaveDe(tabela), { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error || !data) return { data: null, error: error ?? new Error("sem dados") };
    todas.push(...(data as T[]));
    if (data.length < PAGINA) return { data: todas, error: null };
  }
}
