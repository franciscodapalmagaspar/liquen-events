import "server-only";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { lerComNovaTentativa } from "@/lib/repository";
import { comTecto, TEMPO_POR_TENTATIVA_MS } from "./tecto";
import { readFileState } from "./ficheiro";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * VARRER UM ESPAÇO SEM TRAZER OS VALORES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Para decidir o que sai de noite não é preciso o rascunho inteiro, nem a
 * página guardada da proposta online: basta a chave, a versão (`updated_at`),
 * se o valor é nulo, e um ou dois campos de topo (`propostaId`, `validoAte`).
 * O PostgREST deixa pedir só isso (`campo:value->campo`), e é a diferença entre
 * trazer ~2 MB por noite e trazer alguns kB — saída do Supabase, que no plano
 * gratuito tem tecto (regra `custo.md`).
 *
 * Os campos vêm como o JSON os tem (`->`, não `->>`): um número continua número.
 */

export interface LinhaVarrida {
  key: string;
  /** O `updated_at` — a versão do apagar condicional. */
  versao: string;
  /** O valor é `null` (uma lápide). */
  nula: boolean;
  /** Os campos de topo pedidos, tal como estão no valor. */
  campos: Readonly<Record<string, unknown>>;
}

const PAGINA = 1000;
const CAMPO = /^[a-zA-Z][a-zA-Z0-9]*$/;

const linhaDaBase = z.looseObject({ key: z.string(), updated_at: z.string() });

/**
 * As linhas do espaço, sem os valores. `completa: false` quando a leitura
 * falhou, veio noutra forma, ou passou do `limite` — quem decide apagar com
 * base nisto tem de ler «não sei», nunca «não há».
 */
export async function varrerPrefixo(
  prefixo: string,
  opcoes: { campos?: readonly string[]; limite: number },
): Promise<{ linhas: LinhaVarrida[]; completa: boolean }> {
  const campos = opcoes.campos ?? [];
  if (campos.some((c) => !CAMPO.test(c))) throw new Error("campo inválido na varredura");
  const sb = getSupabase();
  if (!sb) return varrerFicheiro(prefixo, campos, opcoes.limite);

  const falhou = { linhas: [], completa: false };
  const linhas: LinhaVarrida[] = [];
  const select = ["key", "updated_at", ...campos.map((c) => `${c}:value->${c}`)].join(", ");
  const comoPrefixo = `${prefixo.replace(/([%_\\])/g, "\\$1")}%`;
  // Duas passagens: as nulas (só a chave e a versão) e as com valor. O
  // PostgREST não sabe devolver «o valor é nulo?» sem devolver o valor.
  for (const nulas of [true, false]) {
    for (let desde = 0; ; desde += PAGINA) {
      const ate = desde + PAGINA - 1;
      try {
        const base = sb.from("app_state").select(nulas ? "key, updated_at" : select);
        const filtrada = nulas ? base.is("value", null) : base.not("value", "is", null);
        const { data, error } = await comTecto(
          lerComNovaTentativa(() =>
            filtrada.like("key", comoPrefixo).order("key", { ascending: true }).range(desde, ate),
          ),
          TEMPO_POR_TENTATIVA_MS,
        );
        if (error || !Array.isArray(data)) return falhou;
        for (const crua of data) {
          const r = linhaDaBase.safeParse(crua);
          if (!r.success) return falhou;
          const { key, updated_at, ...resto } = r.data;
          linhas.push({ key, versao: updated_at, nula: nulas, campos: nulas ? {} : resto });
        }
        if (linhas.length > opcoes.limite) return falhou;
        if (data.length < PAGINA) break;
      } catch {
        return falhou;
      }
    }
  }
  return { linhas, completa: true };
}

async function varrerFicheiro(
  prefixo: string,
  campos: readonly string[],
  limite: number,
): Promise<{ linhas: LinhaVarrida[]; completa: boolean }> {
  const todos = await readFileState();
  const linhas = Object.entries(todos)
    .filter(([k]) => k.startsWith(prefixo))
    .map(([key, value]): LinhaVarrida => {
      const objeto = value && typeof value === "object" && !Array.isArray(value) ? value : null;
      return {
        key,
        // Sem base de dados, a versão é o próprio valor (como no `lerEstadoComVersao`).
        versao: JSON.stringify(value),
        nula: value === null,
        campos: Object.fromEntries(
          campos.map((c) => [c, objeto ? Reflect.get(objeto, c) : undefined]),
        ),
      };
    });
  return linhas.length > limite ? { linhas: [], completa: false } : { linhas, completa: true };
}
