import "server-only";
import { getState, setState } from "@/lib/app-state";
import { log } from "@/lib/logger";
import {
  BALDES_DO_BLOB,
  CHAVE_DOS_MODOS,
  blobConfigurado,
  ehBaldeDoBlob,
  ehModo,
  type BaldeDoBlob,
  type ModoDoBalde,
} from "./baldes";

/**
 * O modo de cada balde, lido de `app_state` com 60 s de cache em memória.
 *
 * Sem o token do Blob é SEMPRE `supabase`, diga a linha o que disser — e nem
 * se lê a linha: sem token não há uma única ida a mais à base de dados.
 * Uma leitura que falhe também dá `supabase`: na dúvida, o sítio de sempre.
 */

const VIDA_MS = 60_000;
let cache: { modos: Record<BaldeDoBlob, ModoDoBalde>; lidoEm: number } | null = null;

function todosEmSupabase(): Record<BaldeDoBlob, ModoDoBalde> {
  return Object.fromEntries(BALDES_DO_BLOB.map((b) => [b, "supabase"])) as Record<
    BaldeDoBlob,
    ModoDoBalde
  >;
}

export function modosValidos(v: unknown): Record<BaldeDoBlob, ModoDoBalde> {
  const out = todosEmSupabase();
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [b, m] of Object.entries(v as Record<string, unknown>)) {
      if (ehBaldeDoBlob(b) && ehModo(m)) out[b] = m;
    }
  }
  return out;
}

export async function modosDosBaldes(): Promise<Record<BaldeDoBlob, ModoDoBalde>> {
  if (!blobConfigurado()) return todosEmSupabase();
  if (cache && Date.now() - cache.lidoEm < VIDA_MS) return cache.modos;
  try {
    const modos = modosValidos(await getState<unknown>(CHAVE_DOS_MODOS, { ouFalha: true }));
    cache = { modos, lidoEm: Date.now() };
    return modos;
  } catch (e) {
    log.warn("blob: modos não lidos — fica tudo no Supabase", { erro: String(e) });
    return cache?.modos ?? todosEmSupabase();
  }
}

export async function modoDoBalde(balde: string): Promise<ModoDoBalde> {
  if (!ehBaldeDoBlob(balde) || !blobConfigurado()) return "supabase";
  return (await modosDosBaldes())[balde];
}

/** Muda o modo de um balde. Devolve os modos como ficaram, ou `null` se não gravou. */
export async function mudarModo(
  balde: BaldeDoBlob,
  modo: ModoDoBalde,
): Promise<Record<BaldeDoBlob, ModoDoBalde> | null> {
  const atuais = modosValidos(await getState<unknown>(CHAVE_DOS_MODOS, { ouFalha: true }));
  const novos = { ...atuais, [balde]: modo };
  const r = await setState(CHAVE_DOS_MODOS, novos);
  if (!r.gravado || !r.duradouro) return null;
  cache = { modos: novos, lidoEm: Date.now() };
  return novos;
}

/** Só para os testes. */
export function esquecerModos(): void {
  cache = null;
}
