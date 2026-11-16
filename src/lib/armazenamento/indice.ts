import "server-only";
import { getSupabase } from "@/lib/supabase";
import { listStateByPrefix } from "@/lib/app-state";
import { log } from "@/lib/logger";
import type { BaldeDoBlob } from "./baldes";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ÍNDICE DO BLOB — o que lá está, sabido sem perguntar ao Blob
 * ════════════════════════════════════════════════════════════════════════════
 *
 * No Supabase, a PASTA é o índice: a lista de temas, o estúdio e as limpezas
 * da noite listam pastas centenas de vezes por dia (961 listagens da
 * `theme-assets` num dia, medido a 10/11). No Blob, cada listagem é uma
 * operação AVANÇADA paga — o mesmo ritmo comia o tecto do mês inteiro em seis
 * semanas, e passado o tecto as fotos deixavam de aparecer.
 *
 * Por isso o Blob NUNCA é listado nos caminhos do dia a dia. O que lá está fica
 * escrito em `app_state`, uma linha por ficheiro — `blob:i:<balde>/<caminho>` —,
 * escrita por quem escreve no Blob (o `balde()` e a migração) e lida pela
 * listagem com uma consulta por prefixo (de graça, na base de dados). Uma linha
 * tem ~150 bytes: os ~3 000 originais de hoje são ~0,5 MB dos 500 MB do plano.
 *
 * A linha é a PROVA de que o ficheiro está no Blob: só se escreve DEPOIS de o
 * Blob confirmar a escrita, e uma escrita cujo índice não fique gravado é
 * desfeita (ver `balde.ts`). É também onde a migração guarda o sha256 que
 * verificou — o `libertar` só apaga do Supabase o que tem `v: true` aqui.
 */

export const PREFIXO_DO_INDICE = "blob:i:";

export interface LinhaDoIndice {
  /** Tamanho em bytes. */
  t: number;
  /** MD5 em hex, quando se sabe (o eTag do Supabase de um envio simples). */
  m?: string | null;
  /** SHA-256 em hex dos bytes que estão no Blob. */
  s?: string | null;
  /** Quando o ficheiro nasceu (o `created_at` do Supabase, numa cópia). */
  c: string;
  /** Tipo do conteúdo. */
  ct?: string;
  /** Verificado pela migração: tamanho e sha256 relidos do Blob. */
  v?: boolean;
  /** Quando foi verificado (ISO). O `libertar` recusa um original mexido depois disto. */
  vEm?: string;
}

export function chaveDoIndice(balde: BaldeDoBlob, caminho: string): string {
  return `${PREFIXO_DO_INDICE}${balde}/${caminho}`;
}

export function linhaValida(v: unknown): v is LinhaDoIndice {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.t === "number" && Number.isFinite(o.t) && o.t >= 0 && typeof o.c === "string";
}

/** As linhas destes caminhos (só as que existem). Lança se a base de dados falhar. */
export async function lerDoIndice(
  balde: BaldeDoBlob,
  caminhos: readonly string[],
): Promise<Map<string, LinhaDoIndice>> {
  const out = new Map<string, LinhaDoIndice>();
  const unicos = [...new Set(caminhos.filter(Boolean))];
  if (unicos.length === 0) return out;
  const sb = getSupabase();
  if (!sb) return out;
  for (let i = 0; i < unicos.length; i += 100) {
    const lote = unicos.slice(i, i + 100);
    const { data, error } = await sb
      .from("app_state")
      .select("key, value")
      .in(
        "key",
        lote.map((c) => chaveDoIndice(balde, c)),
      );
    if (error) throw new Error(`índice do Blob não lido: ${error.message}`);
    const prefixo = chaveDoIndice(balde, "");
    for (const r of (data ?? []) as { key: string; value: unknown }[]) {
      if (linhaValida(r.value)) out.set(r.key.slice(prefixo.length), r.value);
    }
  }
  return out;
}

/**
 * Todas as linhas debaixo de um prefixo (`pasta/` ou `""` para o balde todo),
 * com o caminho relativo ao balde. `completa: false` se ficou por ler.
 */
export async function indiceDebaixoDe(
  balde: BaldeDoBlob,
  prefixo: string,
  limite = 20_000,
): Promise<{ linhas: Map<string, LinhaDoIndice>; completa: boolean }> {
  const base = chaveDoIndice(balde, "");
  const { entradas, completa } = await listStateByPrefix<unknown>(base + prefixo, limite);
  const linhas = new Map<string, LinhaDoIndice>();
  for (const e of entradas) if (linhaValida(e.value)) linhas.set(e.key.slice(base.length), e.value);
  return { linhas, completa };
}

/** Escreve (ou substitui) linhas. Devolve se ficou gravado. Nunca lança. */
export async function gravarNoIndice(
  balde: BaldeDoBlob,
  linhas: ReadonlyArray<{ caminho: string; linha: LinhaDoIndice }>,
): Promise<boolean> {
  if (linhas.length === 0) return true;
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const agora = new Date().toISOString();
    const { error } = await sb.from("app_state").upsert(
      linhas.map(({ caminho, linha }) => ({
        key: chaveDoIndice(balde, caminho),
        value: linha,
        updated_at: agora,
      })),
    );
    if (error) throw error;
    return true;
  } catch (e) {
    log.error("blob: índice não gravado", e, { balde, n: linhas.length });
    return false;
  }
}

/** Tira linhas. Devolve se ficou feito. Nunca lança. */
export async function tirarDoIndice(
  balde: BaldeDoBlob,
  caminhos: readonly string[],
): Promise<boolean> {
  if (caminhos.length === 0) return true;
  const sb = getSupabase();
  if (!sb) return false;
  try {
    for (let i = 0; i < caminhos.length; i += 100) {
      const { error } = await sb
        .from("app_state")
        .delete()
        .in(
          "key",
          caminhos.slice(i, i + 100).map((c) => chaveDoIndice(balde, c)),
        );
      if (error) throw error;
    }
    return true;
  } catch (e) {
    log.error("blob: linhas do índice não apagadas", e, { balde, n: caminhos.length });
    return false;
  }
}
