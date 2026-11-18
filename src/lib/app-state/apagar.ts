import "server-only";
import { getSupabase } from "@/lib/supabase";
import { log } from "@/lib/logger";
import { comTecto, TEMPO_POR_TENTATIVA_MS } from "./tecto";
import { emFila, escreverFicheiro, mudarFicheiro, readFileState } from "./ficheiro";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * APAGAR NO `app_state` — SÓ AS LIMPEZAS DA NOITE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada função aqui apaga com uma CONDIÇÃO que vai junta para a base de dados,
 * para nada sair por engano entre a leitura e o apagar: o prefixo e a data
 * (`apagarEstadoPorPrefixo`), «ainda é uma lápide» (`apagarLapides`), «ainda
 * está como se leu» (`apagarEstadoSeNaoMudou`). Nenhuma lança: devolvem o que
 * saiu, ou `null`/`"falhou"`, e a noite seguinte tenta outra vez.
 */

/** O `%` e o `_` são curingas do LIKE: escapá-los impede um prefixo de varrer mais. */
const comoPrefixo = (prefixo: string) => `${prefixo.replace(/([%_\\])/g, "\\$1")}%`;

/** Lotes do `in (…)`: o endereço do PostgREST tem tecto de tamanho. */
const LOTE = 100;

/**
 * Apaga as entradas cuja chave começa por `prefix` E é menor do que
 * `chaveAntesDe` (comparação de texto) — e só essas.
 *
 * Existe para os registos com a DATA dentro da chave (`<prefixo><AAAA-MM-DD>:…`,
 * ver `diagnostico-video`): com a data no formato ISO, «a chave é menor do que
 * `<prefixo><dia>`» é exactamente «é de antes desse dia». As duas condições
 * vão juntas para a base de dados, numa só ordem: nada fora do prefixo pode
 * sair por engano.
 *
 * Devolve quantas saíram, ou `null` quando não se conseguiu apagar (o erro
 * fica registado; quem chama tenta outra vez na noite seguinte).
 */
export async function apagarEstadoPorPrefixo(
  prefix: string,
  chaveAntesDe: string,
): Promise<number | null> {
  if (!prefix || !chaveAntesDe.startsWith(prefix)) return 0;
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await comTecto(
        sb
          .from("app_state")
          .delete()
          .like("key", comoPrefixo(prefix))
          .lt("key", chaveAntesDe)
          .select("key"),
        TEMPO_POR_TENTATIVA_MS,
      );
      if (error) throw error;
      return (data ?? []).length;
    } catch (err) {
      log.error("app-state: apagar por prefixo falhou", err, { prefix });
      return null;
    }
  }
  try {
    return await emFila(async () => {
      const todos = await readFileState();
      const sair = Object.keys(todos).filter((k) => k.startsWith(prefix) && k < chaveAntesDe);
      if (sair.length === 0) return 0;
      for (const k of sair) delete todos[k];
      await escreverFicheiro(todos);
      return sair.length;
    });
  } catch (err) {
    log.error("app-state: apagar por prefixo em ficheiro falhou", err, { prefix });
    return null;
  }
}

/**
 * Apaga estas chaves, mas SÓ as que ainda forem lápides (`value` nulo): um
 * rascunho que o estúdio voltou a gravar entre a leitura e o apagar já não é
 * lápide, e fica. Devolve as chaves que saíram e se algum lote falhou (o que
 * já saiu, saiu; o resto fica para a noite seguinte).
 */
export async function apagarLapides(
  chaves: readonly string[],
): Promise<{ sairam: string[]; falhou: boolean }> {
  if (chaves.length === 0) return { sairam: [], falhou: false };
  const sb = getSupabase();
  if (!sb) {
    try {
      const sairam = await mudarFicheiro((todos) => {
        const sair = chaves.filter((k) => k in todos && todos[k] === null);
        for (const k of sair) delete todos[k];
        return sair;
      });
      return { sairam, falhou: false };
    } catch (err) {
      log.error("app-state: apagar lápides em ficheiro falhou", err, { n: chaves.length });
      return { sairam: [], falhou: true };
    }
  }
  const sairam: string[] = [];
  try {
    for (let i = 0; i < chaves.length; i += LOTE) {
      const { data, error } = await comTecto(
        sb
          .from("app_state")
          .delete()
          .in("key", chaves.slice(i, i + LOTE))
          .is("value", null)
          .select("key"),
        TEMPO_POR_TENTATIVA_MS,
      );
      if (error) throw error;
      for (const r of data ?? []) sairam.push(r.key);
    }
    return { sairam, falhou: false };
  } catch (err) {
    log.error("app-state: apagar lápides falhou", err, { n: chaves.length, sairam: sairam.length });
    return { sairam, falhou: true };
  }
}

/**
 * Apaga a chave só se ainda estiver na versão que se leu (o `updated_at`; sem
 * base de dados, o próprio valor em JSON — a mesma regra do
 * `gravarEstadoSeNaoMudou`).
 *
 *  · `"apagado"` — saiu;
 *  · `"mudou"`   — alguém escreveu entretanto (ou já não existe): fica;
 *  · `"falhou"`  — o apagar não se fez.
 */
export async function apagarEstadoSeNaoMudou(
  chave: string,
  versao: string,
): Promise<"apagado" | "mudou" | "falhou"> {
  const sb = getSupabase();
  if (!sb) {
    try {
      return await mudarFicheiro((todos) => {
        if (!(chave in todos) || JSON.stringify(todos[chave]) !== versao) return "mudou" as const;
        delete todos[chave];
        return "apagado" as const;
      });
    } catch (err) {
      log.error("app-state: apagar condicional em ficheiro falhou", err, { chave });
      return "falhou";
    }
  }
  try {
    const { data, error } = await comTecto(
      sb.from("app_state").delete().eq("key", chave).eq("updated_at", versao).select("key"),
      TEMPO_POR_TENTATIVA_MS,
    );
    if (error) throw error;
    return (data ?? []).length > 0 ? "apagado" : "mudou";
  } catch (err) {
    log.error("app-state: apagar condicional falhou", err, { chave });
    return "falhou";
  }
}
