import "server-only";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { lerComNovaTentativa } from "@/lib/repository";
import { comTecto } from "./tecto";
import { TEMPO_POR_TENTATIVA_MS } from "./tentativas";
import { readFileState } from "./ficheiro";
import { comoPrefixo } from "./like";
import { lerAsPaginas } from "./paginas";

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
  /** A versão do apagar condicional (o `updated_at`; sem base de dados, o valor em JSON). */
  versao: string;
  /** Quando foi escrita (o `updated_at`); `null` sem base de dados, que não o sabe. */
  escritaEm: string | null;
  /** O valor é `null` (uma lápide). */
  nula: boolean;
  /** Os campos de topo pedidos, tal como estão no valor. */
  campos: Readonly<Record<string, unknown>>;
}

/**
 * O que a varredura sabe. Só `completa` traz linhas: as outras duas são «não
 * sei», e o tipo não deixa ler linhas de uma varredura que não acabou.
 *
 *  - `falhou`      → a leitura falhou ou veio noutra forma;
 *  - `transbordou` → leu-se bem, mas há mais do que o `limite`.
 */
export type Varredura =
  | { estado: "completa"; linhas: LinhaVarrida[] }
  | { estado: "falhou" }
  | { estado: "transbordou" };

const FALHOU: Varredura = { estado: "falhou" };
const TRANSBORDOU: Varredura = { estado: "transbordou" };

const CAMPO = /^[a-zA-Z][a-zA-Z0-9]*$/;

const linhaDaBase = z.looseObject({ key: z.string(), updated_at: z.string() });

/**
 * As linhas do espaço, sem os valores. Fora de `completa`, quem decide apagar
 * com base nisto tem de ler «não sei», nunca «não há».
 */
export async function varrerPrefixo(
  prefixo: string,
  opcoes: { campos?: readonly string[]; limite: number },
): Promise<Varredura> {
  const campos = opcoes.campos ?? [];
  if (campos.some((c) => !CAMPO.test(c))) throw new Error("campo inválido na varredura");
  const sb = getSupabase();
  if (!sb) return varrerFicheiro(prefixo, campos, opcoes.limite);

  const linhas: LinhaVarrida[] = [];
  const select = ["key", "updated_at", ...campos.map((c) => `${c}:value->${c}`)].join(", ");
  // Duas passagens: as nulas (só a chave e a versão) e as com valor. O
  // PostgREST não sabe devolver «o valor é nulo?» sem devolver o valor. O
  // limite é das duas juntas.
  for (const nulas of [true, false]) {
    const lidas = await lerAsPaginas(
      (desde, ate) =>
        // A consulta monta-se DENTRO de cada tentativa: um construtor reusado
        // repetia os filtros na segunda.
        lerComNovaTentativa(() => {
          const base = sb.from("app_state").select(nulas ? "key, updated_at" : select);
          const filtrada = nulas ? base.is("value", null) : base.not("value", "is", null);
          return comTecto(
            filtrada
              .like("key", comoPrefixo(prefixo))
              .order("key", { ascending: true })
              .range(desde, ate),
            TEMPO_POR_TENTATIVA_MS,
          );
        }),
      (crua): LinhaVarrida | null => {
        const r = linhaDaBase.safeParse(crua);
        if (!r.success) return null;
        const { key, updated_at, ...resto } = r.data;
        return {
          key,
          versao: updated_at,
          escritaEm: updated_at,
          nula: nulas,
          campos: nulas ? {} : resto,
        };
      },
      opcoes.limite - linhas.length,
    );
    if (lidas.estado === "falhou") return FALHOU;
    if (lidas.estado === "transbordou") return TRANSBORDOU;
    linhas.push(...lidas.linhas);
  }
  return { estado: "completa", linhas };
}

async function varrerFicheiro(
  prefixo: string,
  campos: readonly string[],
  limite: number,
): Promise<Varredura> {
  const todos = await readFileState();
  const linhas = Object.entries(todos)
    .filter(([k]) => k.startsWith(prefixo))
    .map(([key, value]): LinhaVarrida => {
      const objeto = value && typeof value === "object" && !Array.isArray(value) ? value : null;
      return {
        key,
        // Sem base de dados, a versão é o próprio valor (como no `lerEstadoComVersao`).
        versao: JSON.stringify(value),
        escritaEm: null,
        nula: value === null,
        campos: Object.fromEntries(
          campos.map((c) => [c, objeto ? Reflect.get(objeto, c) : undefined]),
        ),
      };
    });
  return linhas.length > limite ? TRANSBORDOU : { estado: "completa", linhas };
}
