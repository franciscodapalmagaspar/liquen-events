import "server-only";
import { listContractsForQuote } from "./contracts-store";
import { listInvoicesForQuote } from "./invoices-store";
import { listProposalsForQuote } from "./proposals-store";
import { listTasksForQuote } from "./tasks-store";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE AINDA ESTÁ LIGADO A UM PEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Desde o P5 (17/11) as tabelas ligadas ao pedido têm chave estrangeira:
 * tarefas em cascata, faturas, contratos e propostas em `set null`. Apagar o
 * pedido com alguma destas ainda lá ou leva-a sem relatório (cascata) ou
 * deixa-a sem origem (`set null`).
 *
 * O `apagar-pedido.ts` pergunta duas coisas, e as duas saem daqui:
 *
 *  · no INÍCIO, {@link registoFiscalDoPedido}: há contrato ou fatura? Esses
 *    recusam antes de qualquer coisa sair;
 *  · mesmo ANTES de apagar o pedido, {@link ligacoesDoPedido}: ainda há alguma
 *    ligação (nascida noutro ecrã, ou que não saiu)? Faz parar a meio.
 *
 * As duas leem os registos fiscais pelo MESMO leitor (`lerFiscais`): um
 * registo fiscal novo acrescenta-se lá e vale nos dois sítios; uma ligação
 * não fiscal nova acrescenta-se a `ligacoesDoPedido` e a {@link oQueAindaPrende}.
 * Cada leitura vai pelo índice da chave estrangeira, em paralelo.
 */
export interface LigacoesDoPedido {
  contratos: number;
  faturas: number;
  propostas: number;
  tarefas: number;
}

/** Não se conseguiu ver se há registo fiscal: na dúvida, não se apaga nada. */
export class NaoSeiSeHaRegistoFiscal extends Error {
  constructor(causa: unknown) {
    super("não consegui ler os contratos ou as faturas do pedido", { cause: causa });
    this.name = "NaoSeiSeHaRegistoFiscal";
  }
}

/**
 * Contratos e faturas, lidos em paralelo. Uma leitura que falha fica em
 * `falhou`, e a que correu bem conta na mesma: um registo que se VIU vale
 * mais do que outro que não se pôde ver.
 */
async function lerFiscais(
  pedidoId: string,
): Promise<{ contratos: number; faturas: number; falhou?: unknown }> {
  const [contratos, faturas] = await Promise.allSettled([
    listContractsForQuote(pedidoId),
    listInvoicesForQuote(pedidoId),
  ]);
  const falhou =
    contratos.status === "rejected"
      ? contratos.reason
      : faturas.status === "rejected"
        ? faturas.reason
        : undefined;
  return {
    contratos: contratos.status === "fulfilled" ? contratos.value.length : 0,
    faturas: faturas.status === "fulfilled" ? faturas.value.length : 0,
    ...(falhou !== undefined ? { falhou } : {}),
  };
}

/**
 * A pergunta do INÍCIO: há contrato ou fatura? Não lê as propostas nem as
 * tarefas (o `doc` das propostas é pesado, e o apagar lê-as a seguir). Um
 * registo visto recusa mesmo que a outra leitura tenha falhado; sem nenhum
 * visto e com uma leitura falhada, lança {@link NaoSeiSeHaRegistoFiscal}.
 */
export async function registoFiscalDoPedido(
  pedidoId: string,
): Promise<"tem-contrato" | "tem-fatura" | null> {
  const f = await lerFiscais(pedidoId);
  const visto = registoFiscal({ ...f, propostas: 0, tarefas: 0 });
  if (visto) return visto;
  if (f.falhou !== undefined) throw new NaoSeiSeHaRegistoFiscal(f.falhou);
  return null;
}

/** A pergunta do FIM: tudo o que ainda está ligado. Uma leitura falhada lança. */
export async function ligacoesDoPedido(pedidoId: string): Promise<LigacoesDoPedido> {
  const [fiscais, propostas, tarefas] = await Promise.all([
    lerFiscais(pedidoId),
    listProposalsForQuote(pedidoId),
    listTasksForQuote(pedidoId),
  ]);
  if (fiscais.falhou !== undefined) throw new NaoSeiSeHaRegistoFiscal(fiscais.falhou);
  return {
    contratos: fiscais.contratos,
    faturas: fiscais.faturas,
    propostas: propostas.length,
    tarefas: tarefas.length,
  };
}

/** Contrato ou fatura: recusam. Puro. */
export function registoFiscal(l: LigacoesDoPedido): "tem-contrato" | "tem-fatura" | null {
  if (l.contratos > 0) return "tem-contrato";
  if (l.faturas > 0) return "tem-fatura";
  return null;
}

/** A frase de quando ficaram propostas no pedido (no meio e no fim do apagar). */
export const fraseDasPropostasQueFicaram = (n: number): string =>
  `ficaram ${n} proposta(s) neste pedido`;

/**
 * O que, mesmo antes de apagar o pedido, ainda o prende — em linguagem de quem
 * vai ler o registo. Vazio quando já pode sair. Puro.
 */
export function oQueAindaPrende(l: LigacoesDoPedido): string[] {
  const prende: string[] = [];
  if (l.contratos > 0) prende.push("nasceu um contrato neste pedido enquanto se apagava");
  if (l.faturas > 0) prende.push("nasceu uma fatura neste pedido enquanto se apagava");
  if (l.propostas > 0) prende.push(fraseDasPropostasQueFicaram(l.propostas));
  if (l.tarefas > 0) prende.push(`apareceram ${l.tarefas} tarefa(s) novas neste pedido`);
  return prende;
}
