import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A REPOSIÇÃO DE UMA CÓPIA, COM AS CHAVES ESTRANGEIRAS PARA OS PEDIDOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Desde o P5 (docs/ESTRUTURA-DOS-DADOS.md, 17/11) as tarefas, as faturas e os
 * contratos têm chave estrangeira para `quotes`: a tarefa sai com o pedido
 * (`on delete cascade`, que é o que `apagar-pedido.ts` já fazia à mão), e a
 * fatura e o contrato ficam, sem a ligação (`on delete set null`).
 *
 * A reposição (`backup-restore.ts`) apagava a tabela dos pedidos INTEIRA e
 * voltava a inseri-la. Com as chaves novas, esse apagar levava atrás todas as
 * tarefas e deixava todos os contratos sem pedido — e só voltavam se a cópia
 * também trouxesse esses conjuntos. Uma cópia sem tarefas (ou que as declare
 * incompletas) perdia as tarefas de hoje sem aviso.
 *
 * Daí as duas regras deste módulo:
 *
 *  1. Os pedidos repõem-se SEM apagar os que ficam: sai só o que a cópia não
 *     tem, e o resto é escrito por cima (`upsert`). Um pedido que está nos dois
 *     lados nunca chega a ser apagado, portanto nada cai em cascata atrás dele.
 *  2. Uma tarefa, fatura ou contrato da cópia que aponta para um pedido que já
 *     não existe entra SEM a ligação — que é exatamente o que o `set null` lhe
 *     teria feito se o pedido tivesse saído com ela já cá dentro. Sem isto, a
 *     inserção falhava e o conjunto ficava apagado e vazio.
 */

/** O máximo de ids num `in (…)`: o PostgREST põe-nos no endereço. */
const IDS_POR_PEDIDO = 200;
/** O máximo de linhas por escrita, o mesmo da reposição normal. */
const LINHAS_POR_ESCRITA = 500;
/** O que o PostgREST devolve por página (`max-rows` do Supabase). */
const PAGINA = 1000;

/** Os ids que estão na base agora e não estão na cópia: são os que saem. */
export function idsQueSaem(naBase: readonly string[], naCopia: readonly string[]): string[] {
  const ficam = new Set(naCopia);
  return naBase.filter((id) => !ficam.has(id));
}

/**
 * Tira a ligação ao pedido às linhas cujo pedido não existe. Devolve linhas
 * NOVAS (não muda as que recebe) e quantas perderam a ligação.
 */
export function soltarLigacoesOrfas<T extends Record<string, unknown>>(
  linhas: readonly T[],
  campo: string,
  pedidosQueExistem: ReadonlySet<string>,
): { linhas: T[]; soltas: number } {
  let soltas = 0;
  const out = linhas.map((l) => {
    const v = l[campo];
    if (typeof v !== "string" || !v.trim() || pedidosQueExistem.has(v)) return l;
    soltas++;
    return { ...l, [campo]: undefined };
  });
  return { linhas: out, soltas };
}

/**
 * O mesmo que {@link soltarLigacoesOrfas}, para um conjunto da reposição, e com
 * o registo de quantas linhas perderam a ligação (sem valores de clientes).
 */
export function semLigacoesAPedidosQueNaoExistem<T extends Record<string, unknown>>(
  linhas: readonly T[],
  campo: string,
  pedidosQueExistem: ReadonlySet<string>,
  conjunto: string,
): T[] {
  const r = soltarLigacoesOrfas(linhas, campo, pedidosQueExistem);
  if (r.soltas > 0) {
    log.warn("restauro: linhas da cópia com um pedido que já não existe entram sem a ligação", {
      dataset: conjunto,
      soltas: r.soltas,
    });
  }
  return r.linhas;
}

/** Os ids dos pedidos que existem, lidos da base na primeira vez que se pedem. */
export type IdsDosPedidos = () => Promise<ReadonlySet<string>>;

/**
 * Uma leitura só por reposição: as tarefas, as faturas e os contratos usam o
 * mesmo conjunto. Só se lê quando o primeiro deles o pede — depois de os
 * pedidos terem sido repostos, porque vêm antes na ordem da reposição.
 */
export function idsDosPedidosUmaVez(
  sb: SupabaseClient,
  tabela: string,
  coluna: string,
): IdsDosPedidos {
  let lidos: Promise<ReadonlySet<string>> | null = null;
  return () =>
    (lidos ??= lerIds(sb, tabela, coluna).then(
      (ids) => new Set(ids),
      (erro: unknown) => {
        // Uma falha passageira não fica guardada: o conjunto seguinte tenta outra vez.
        lidos = null;
        throw erro;
      },
    ));
}

/** Todos os valores de uma coluna, página a página. */
export async function lerIds(
  sb: SupabaseClient,
  tabela: string,
  coluna: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await sb
      .from(tabela)
      .select(coluna)
      .order(coluna, { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) throw error;
    const pagina = (data ?? []) as unknown as Record<string, unknown>[];
    for (const r of pagina) ids.push(String(r[coluna]));
    if (pagina.length < PAGINA) return ids;
  }
}

/**
 * Substitui o conteúdo de uma tabela pelo da cópia sem apagar as linhas que
 * estão nos dois lados (regra 1 do topo). O resultado final é o mesmo de
 * «apagar tudo e inserir», desde que `linhas` traga TODAS as colunas que a
 * inserção traria — quem chama acrescenta as que a base preencheria sozinha.
 */
export async function substituirSemApagarOsQueFicam(
  sb: SupabaseClient,
  tabela: string,
  coluna: string,
  linhas: readonly Record<string, unknown>[],
): Promise<void> {
  const saem = idsQueSaem(
    await lerIds(sb, tabela, coluna),
    linhas.map((l) => String(l[coluna])),
  );
  for (let i = 0; i < saem.length; i += IDS_POR_PEDIDO) {
    const { error } = await sb
      .from(tabela)
      .delete()
      .in(coluna, saem.slice(i, i + IDS_POR_PEDIDO));
    if (error) throw error;
  }
  for (let i = 0; i < linhas.length; i += LINHAS_POR_ESCRITA) {
    const { error } = await sb
      .from(tabela)
      .upsert(linhas.slice(i, i + LINHAS_POR_ESCRITA) as Record<string, unknown>[], {
        onConflict: coluna,
      });
    if (error) throw error;
  }
}
