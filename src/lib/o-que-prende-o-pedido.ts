import "server-only";
import { listContractsForQuote } from "./contracts-store";
import { listInvoicesForQuote } from "./invoices-store";
import { listProposalsForQuote } from "./proposals-store";
import { listTasksForQuote } from "./tasks-store";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE AINDA ESTÁ LIGADO A UM PEDIDO — UMA LISTA SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Desde o P5 (17/11) as tabelas ligadas ao pedido têm chave estrangeira:
 * tarefas em cascata, faturas, contratos e propostas em `set null`. Apagar o
 * pedido com alguma destas ainda lá ou leva-a sem relatório (cascata) ou
 * deixa-a sem origem (`set null`). O `apagar-pedido.ts` pergunta isto DUAS
 * vezes — no início, e mesmo antes de apagar o pedido, para o que nasceu
 * entretanto noutro ecrã —, e as duas perguntas são esta função: uma
 * ligação nova acrescenta-se aqui e vale nos dois sítios.
 *
 * Cada leitura vai pelo índice da chave estrangeira, e as quatro correm em
 * paralelo. Se alguma falha, lança: não saber não é o mesmo que não haver.
 */
export interface LigacoesDoPedido {
  contratos: number;
  faturas: number;
  propostas: number;
  tarefas: number;
}

export async function ligacoesDoPedido(pedidoId: string): Promise<LigacoesDoPedido> {
  const [contratos, faturas, propostas, tarefas] = await Promise.all([
    listContractsForQuote(pedidoId),
    listInvoicesForQuote(pedidoId),
    listProposalsForQuote(pedidoId),
    listTasksForQuote(pedidoId),
  ]);
  return {
    contratos: contratos.length,
    faturas: faturas.length,
    propostas: propostas.length,
    tarefas: tarefas.length,
  };
}

/**
 * Registos fiscais: um contrato ou uma fatura fazem RECUSAR o apagar, antes de
 * qualquer coisa sair. Puro.
 */
export function registoFiscal(l: LigacoesDoPedido): "tem-contrato" | "tem-fatura" | null {
  if (l.contratos > 0) return "tem-contrato";
  if (l.faturas > 0) return "tem-fatura";
  return null;
}

/**
 * O que, mesmo antes de apagar o pedido, ainda o prende — em linguagem de quem
 * vai ler o registo. Vazio quando já pode sair. Puro.
 */
export function oQueAindaPrende(l: LigacoesDoPedido): string[] {
  const prende: string[] = [];
  if (l.contratos > 0) prende.push("nasceu um contrato neste pedido enquanto se apagava");
  if (l.faturas > 0) prende.push("nasceu uma fatura neste pedido enquanto se apagava");
  if (l.propostas > 0) prende.push(`ficaram ${l.propostas} proposta(s) neste pedido`);
  if (l.tarefas > 0) prende.push(`apareceram ${l.tarefas} tarefa(s) novas neste pedido`);
  return prende;
}
