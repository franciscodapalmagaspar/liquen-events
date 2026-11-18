import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "./logger";
import { isMissingTable } from "./repository";

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
 * Para um conjunto da reposição: as linhas cujo pedido já não existe levam o
 * destino que a chave estrangeira lhes daria, e fica no registo quantas foram
 * (sem valores de clientes).
 */
export function semLigacoesAPedidosQueNaoExistem<T extends Record<string, unknown>>(
  linhas: readonly T[],
  ligacao: LigacaoAoPedido,
  pedidosQueExistem: ReadonlySet<string>,
  conjunto: string,
): T[] {
  const r = soltarLigacoesOrfas(linhas, ligacao.campo, pedidosQueExistem);
  if (r.soltas === 0) return r.linhas;
  log.warn("restauro: linhas da cópia com um pedido que já não existe", {
    dataset: conjunto,
    linhas: r.soltas,
    destino: ligacao.seOPedidoNaoExiste,
  });
  if (ligacao.seOPedidoNaoExiste === "soltar") return r.linhas;
  return linhas.filter((l) => {
    const v = l[ligacao.campo];
    return typeof v !== "string" || !v.trim() || pedidosQueExistem.has(v);
  });
}

/**
 * A chave estrangeira de um conjunto para o pedido, e o que a base faz à
 * linha quando o pedido sai: `soltar` (`on delete set null`) ou `descartar`
 * (`on delete cascade`).
 */
export interface LigacaoAoPedido {
  campo: string;
  seOPedidoNaoExiste: "soltar" | "descartar";
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

/**
 * Uma tabela que cai em cascata quando o conjunto que a reposição apaga sai —
 * e que não vai na cópia, por isso não voltava. Hoje só os códigos curtos das
 * propostas (`ligacoes_de_proposta` → `proposals`, P7).
 */
export interface DependenteEmCascata {
  tabela: string;
  /** A coluna da chave primária do dependente. */
  chave: string;
  /** A coluna com a chave estrangeira para o conjunto reposto. */
  colunaDoPai: string;
  /** A tabela e a chave do conjunto reposto (para saber que pais ficaram). */
  tabelaDoPai: string;
  chaveDoPai: string;
}

/**
 * Guarda as linhas do dependente, deixa `repor` apagar e reinserir o conjunto
 * (a cascata leva-as), e volta a pôr as que ainda têm pai. As de um pai que a
 * cópia não traz ficam de fora — a chave estrangeira não as aceitava, e são o
 * que a cascata faria a um apagar normal. Devolve quantas voltaram.
 */
export async function comDependentesGuardados(
  sb: SupabaseClient,
  dependente: DependenteEmCascata,
  repor: () => Promise<ReadonlySet<string>>,
): Promise<number> {
  let guardadas: Record<string, unknown>[];
  try {
    guardadas = await lerTudo(sb, dependente.tabela, dependente.chave);
  } catch (e) {
    // Uma base onde a tabela ainda não existe não tem nada a guardar.
    if (isMissingTable(e)) return repor().then(() => 0);
    throw e;
  }
  let pais: ReadonlySet<string>;
  try {
    pais = await repor();
  } catch (e) {
    // A reposição rebentou a meio: o que a cascata já levou volta para os pais
    // que ficaram (lidos agora), e o erro segue para o conjunto sair em `failed`.
    const vivos = new Set(await lerIds(sb, dependente.tabelaDoPai, dependente.chaveDoPai));
    await porDeVolta(sb, dependente, guardadas, vivos).catch(() => 0);
    throw e;
  }
  return porDeVolta(sb, dependente, guardadas, pais);
}

/**
 * Volta a pôr as linhas cujo pai existe. Em lote; se o lote esbarrar numa
 * restrição (uma linha que entretanto nasceu igual, um índice único parcial
 * como o `atual` dos códigos), linha a linha, e a que esbarra fica de fora
 * — dita no registo, nunca a rebentar o conjunto já reposto.
 */
async function porDeVolta(
  sb: SupabaseClient,
  dependente: DependenteEmCascata,
  guardadas: readonly Record<string, unknown>[],
  pais: ReadonlySet<string>,
): Promise<number> {
  const voltam = guardadas.filter((l) => pais.has(String(l[dependente.colunaDoPai])));
  const opcoes = { onConflict: dependente.chave, ignoreDuplicates: true };
  let ficaram = 0;
  for (let i = 0; i < voltam.length; i += LINHAS_POR_ESCRITA) {
    const lote = voltam.slice(i, i + LINHAS_POR_ESCRITA);
    const { error } = await sb.from(dependente.tabela).upsert(lote, opcoes);
    if (!error) continue;
    for (const linha of lote) {
      const r = await sb.from(dependente.tabela).upsert([linha], opcoes);
      if (r.error) ficaram++;
    }
  }
  if (ficaram > 0) {
    log.warn("restauro: linhas dependentes que não voltaram", {
      tabela: dependente.tabela,
      ficaram,
    });
  }
  return voltam.length - ficaram;
}

/**
 * Todas as linhas de uma tabela, por páginas, PELA CHAVE (`> última vista`) e
 * não pela posição: uma inserção a meio da leitura não desloca a página nem faz
 * saltar uma linha. Pára numa página vazia — o tecto de linhas do PostgREST é
 * uma definição do projeto, e uma página curta não prova que acabou.
 */
async function lerPorChave(
  sb: SupabaseClient,
  tabela: string,
  colunas: string,
  chave: string,
): Promise<Record<string, unknown>[]> {
  const linhas: Record<string, unknown>[] = [];
  let ultima: string | null = null;
  for (;;) {
    let consulta = sb.from(tabela).select(colunas);
    if (ultima !== null) consulta = consulta.gt(chave, ultima);
    const { data, error } = await consulta.order(chave, { ascending: true }).limit(PAGINA);
    if (error) throw error;
    const pagina = (data ?? []) as unknown as Record<string, unknown>[];
    if (pagina.length === 0) return linhas;
    linhas.push(...pagina);
    ultima = String(pagina[pagina.length - 1][chave]);
  }
}

/** Todas as linhas de uma tabela. */
const lerTudo = (sb: SupabaseClient, tabela: string, chave: string) =>
  lerPorChave(sb, tabela, "*", chave);

/** Todos os valores de uma coluna (a chave). */
export async function lerIds(
  sb: SupabaseClient,
  tabela: string,
  coluna: string,
): Promise<string[]> {
  return (await lerPorChave(sb, tabela, coluna, coluna)).map((r) => String(r[coluna]));
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
