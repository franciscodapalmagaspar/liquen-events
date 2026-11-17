import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/base";

/**
 * Server-side Supabase client built from environment variables. Uses the
 * service-role key, so it must NEVER be imported into client components.
 * Returns null when unconfigured so callers can fall back gracefully
 * (e.g. local development without a database).
 *
 * Required env vars (Vercel → Settings → Environment Variables):
 *   SUPABASE_URL                e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   the service_role secret (NOT the anon key)
 */
/** O cliente com o tipo da base de dados VIVA (`src/lib/db/tipos-da-base.ts`,
 *  gerado — docs/ESTRUTURA-DOS-DADOS.md, P1): uma coluna escrita com o nome ou
 *  o tipo errado passa a ser um erro do compilador, e não um `undefined` três
 *  ecrãs depois. */
export type ClienteDaBase = SupabaseClient<Database>;

let cached: ClienteDaBase | null = null;

export function getSupabase(): ClienteDaBase | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!cached) {
    cached = createClient<Database>(url, key, { auth: { persistSession: false } });
  }
  return cached;
}

export function isDatabaseConfigured(): boolean {
  return getSupabase() !== null;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A AVARIA QUE NÃO DÁ ERRO NENHUM: a chave errada com RLS ligado
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Todas as tabelas têm `row level security` ligado e NENHUMA tem políticas (ver
 * o fim de db/schema.sql): a única chave que lá chega é a `service_role`, que
 * ignora o RLS. Com a chave `anon` no lugar dela, o Postgres não recusa coisa
 * nenhuma — devolve ZERO LINHAS, com estado 200 e sem erro.
 *
 * Foi isto que se mediu: das nove maneiras de partir a leitura dos temas, oito
 * dão um erro que se pode nomear e esta dá uma lista vazia. No ecrã, «a
 * Biblioteca está vazia» e «a Biblioteca está escondida de ti» ficam a ser a
 * mesma imagem — e a segunda é o trabalho de anos a parecer que desapareceu.
 *
 * Como se distingue sem ir à base de dados: a chave DIZ o papel que tem. As
 * chaves antigas são JWT com `{"role":"service_role"}` no corpo; as novas
 * dizem-no no prefixo (`sb_secret_` contra `sb_publishable_`). Nenhuma das
 * leituras precisa de rede, e não se regista nem se mostra a chave — só o papel.
 */
export type PapelDaChave = "service_role" | "anon" | "desconhecido" | "ausente";

export function papelDaChaveSupabase(): PapelDaChave {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return "ausente";
  // Chaves novas: o papel está no prefixo, sem nada para descodificar.
  if (key.startsWith("sb_secret_")) return "service_role";
  if (key.startsWith("sb_publishable_")) return "anon";
  // Chaves antigas: JWT de três partes, o papel no corpo.
  const partes = key.split(".");
  if (partes.length !== 3) return "desconhecido";
  try {
    const corpo = JSON.parse(Buffer.from(partes[1], "base64url").toString()) as {
      role?: unknown;
    };
    if (corpo.role === "service_role") return "service_role";
    if (corpo.role === "anon" || corpo.role === "authenticated") return "anon";
    return "desconhecido";
  } catch {
    // Uma chave que não se consegue ler não é acusada de nada: só o que se sabe
    // é que se diz.
    return "desconhecido";
  }
}
