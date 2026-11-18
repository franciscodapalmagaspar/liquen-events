import type { SupabaseClient } from "@supabase/supabase-js";
import type { Mapper } from "@/lib/repository";
import {
  comDependentesGuardados,
  semLigacoesAPedidosQueNaoExistem,
  substituirSemApagarOsQueFicam,
  type DependenteEmCascata,
  type IdsDosPedidos,
  type LigacaoAoPedido,
} from "./chaves-estrangeiras";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESCREVER UM CONJUNTO DA CÓPIA NA BASE, COM AS CHAVES ESTRANGEIRAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O motor de escrita da reposição: `backup-restore.ts` escolhe O QUE repor e
 * por que ordem; isto diz COMO se escreve um conjunto. Saiu de lá no P5 para
 * o ficheiro da reposição não crescer mais — o resto da partição é o P12.
 *
 * Três estratégias, escolhidas pelo conjunto (ver {@link EstrategiaDeEscrita}):
 * apagar tudo e inserir (a de sempre), escrever por cima sem apagar o que fica
 * (os pedidos), e guardar um dependente que cai em cascata (os códigos curtos
 * das propostas). As linhas com um pedido que já não existe levam o destino que
 * a chave estrangeira lhes daria.
 */
export interface EstrategiaDeEscrita {
  /**
   * Repor SEM apagar as linhas que estão na cópia e na base (só sai o que a
   * cópia não traz). Só os pedidos: são o alvo das chaves estrangeiras das
   * tarefas, faturas e contratos, e apagá-los todos levava-as atrás. Ver
   * `reposicao/chaves-estrangeiras.ts`.
   */
  semApagarOsQueFicam?: true;
  /**
   * A chave estrangeira para o pedido (o campo do domínio) e o que a base faz
   * quando o pedido sai: uma linha da cópia cujo pedido não existe leva o
   * mesmo destino — `soltar` (`on delete set null`) ou `descartar` (`on
   * delete cascade`) —, em vez de rebentar a inserção do conjunto inteiro.
   */
  ligacaoAoPedido?: LigacaoAoPedido;
  /**
   * Uma tabela que não vai na cópia e cai em cascata quando este conjunto é
   * apagado: guarda-se antes e volta depois (`comDependentesGuardados`).
   */
  dependenteEmCascata?: DependenteEmCascata;
}

/** O que a escrita precisa de um conjunto. */
export interface ConjuntoAEscrever<T> extends EstrategiaDeEscrita {
  key: string;
  table: string;
  mapper: Mapper<T>;
  extraColumns?: (row: T) => Record<string, unknown>;
}

type Linha = Record<string, unknown>;

export async function escreverConjuntoNaBase(
  sb: SupabaseClient,
  target: ConjuntoAEscrever<Linha>,
  rows: Linha[],
  /** Os ids dos pedidos que existem (lidos uma vez por reposição). */
  pedidos: IdsDosPedidos | null,
): Promise<void> {
  // PostgREST exige um filtro num delete: `<chave> is not null` é verdade
  // para toda a linha (é chave primária, não pode ser nula) e apaga a tabela
  // inteira.
  //
  // A coluna é a que o `mapper` DECLARA, nunca `id` à letra. Onze das doze
  // tabelas chamam-lhe mesmo `id`, mas a `biblioteca_fotos` tem `path text
  // primary key` e nenhuma coluna `id` (ver `Mapper.idColumn`) — e o Postgres
  // respondia `42703 — column does not exist` a um delete escrito à mão.
  // O estrago não ficava por não repor as fotos: as ETIQUETAS das fotos são
  // apagadas ANTES, por cascata da chave estrangeira, portanto a reposição
  // apagava o trabalho de etiquetar e depois não conseguia repor as fotos que
  // as etiquetas apontavam.
  const colunaDaChave = target.mapper.idColumn ?? "id";
  const linhas =
    target.ligacaoAoPedido && pedidos
      ? semLigacoesAPedidosQueNaoExistem(rows, target.ligacaoAoPedido, await pedidos(), target.key)
      : rows;
  // `toRow` primeiro (é a tradução oficial do store) e por cima as colunas
  // que ele deixa à base de dados preencher — ver `extraColumns`.
  const convertidas = linhas.map((r) => ({
    ...target.mapper.toRow(r),
    ...(target.extraColumns?.(r) ?? {}),
  }));
  if (target.semApagarOsQueFicam) {
    await substituirSemApagarOsQueFicam(sb, target.table, colunaDaChave, convertidas);
    return;
  }
  const apagarEInserir = async (): Promise<ReadonlySet<string>> => {
    const del = await sb.from(target.table).delete().not(colunaDaChave, "is", null);
    if (del.error) throw del.error;
    const CHUNK = 500;
    for (let i = 0; i < convertidas.length; i += CHUNK) {
      const { error } = await sb.from(target.table).insert(convertidas.slice(i, i + CHUNK));
      if (error) throw error;
    }
    return new Set(convertidas.map((r) => String(r[colunaDaChave])));
  };
  if (target.dependenteEmCascata) {
    await comDependentesGuardados(sb, target.dependenteEmCascata, apagarEInserir);
  } else {
    await apagarEInserir();
  }
}
