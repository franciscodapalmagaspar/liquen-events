import "server-only";
import { listContractsForQuote } from "./contracts-store";
import { listInvoicesForQuote } from "./invoices-store";
import { getQuote } from "./quotes-store";
import type { Quote } from "./orcamento/types";
import { fasesQuePodemTerFaturaNoMoloni } from "./orcamento/fatura-no-moloni";
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

/** Contratos e faturas de um pedido. */
export type RegistosFiscais = Pick<LigacoesDoPedido, "contratos" | "faturas">;

/**
 * Contratos e faturas — as do livro antigo (`invoices`, só de leitura) e as do
 * Moloni (`quote.faturasMoloni`, onde as faturas vivem hoje; conta cada fase
 * que PODE ter documento lá, marca de «a ser criado» incluída — a regra está em
 * `orcamento/fatura-no-moloni.ts`) —, lidos em paralelo.
 * Uma leitura que falha fica em `falhou`, e as que correram bem contam na
 * mesma: um registo que se VIU vale mais do que outro que não se pôde ver.
 */
async function lerFiscais(
  pedidoId: string,
  /** O pedido, se quem chama já o leu (poupa uma leitura da linha inteira). */
  jaLido?: Pick<Quote, "faturasMoloni">,
): Promise<RegistosFiscais & { falhou?: unknown }> {
  const [contratos, livro, pedido] = await Promise.allSettled([
    listContractsForQuote(pedidoId),
    listInvoicesForQuote(pedidoId),
    jaLido ?? getQuote(pedidoId),
  ]);
  const falhou = [contratos, livro, pedido].find((r) => r.status === "rejected") as
    | PromiseRejectedResult
    | undefined;
  return {
    contratos: contratos.status === "fulfilled" ? contratos.value.length : 0,
    faturas:
      (livro.status === "fulfilled" ? livro.value.length : 0) +
      (pedido.status === "fulfilled" ? fasesQuePodemTerFaturaNoMoloni(pedido.value) : 0),
    ...(falhou ? { falhou: falhou.reason } : {}),
  };
}

/**
 * A pergunta do INÍCIO: há contrato ou fatura? Não lê as propostas nem as
 * tarefas (o `doc` das propostas é pesado, e o apagar lê-as a seguir). Um
 * registo visto recusa mesmo que a outra leitura tenha falhado; sem nenhum
 * visto e com uma leitura falhada, lança {@link NaoSeiSeHaRegistoFiscal}.
 */
export async function registoFiscalDoPedido(
  pedido: Pick<Quote, "id" | "faturasMoloni">,
): Promise<"tem-contrato" | "tem-fatura" | null> {
  const f = await lerFiscais(pedido.id, pedido);
  const visto = registoFiscal(f);
  if (visto) return visto;
  if (f.falhou !== undefined) throw new NaoSeiSeHaRegistoFiscal(f.falhou);
  return null;
}

/**
 * A pergunta do FIM: tudo o que ainda está ligado. Como no início, um registo
 * fiscal VISTO conta mesmo que outra leitura fiscal tenha falhado (o relatório
 * diz o que nasceu); sem nenhum visto, uma leitura falhada lança.
 */
export async function ligacoesDoPedido(pedidoId: string): Promise<LigacoesDoPedido> {
  const [fiscais, propostas, tarefas] = await Promise.all([
    lerFiscais(pedidoId),
    listProposalsForQuote(pedidoId),
    listTasksForQuote(pedidoId),
  ]);
  if (fiscais.falhou !== undefined && !registoFiscal(fiscais)) {
    throw new NaoSeiSeHaRegistoFiscal(fiscais.falhou);
  }
  return {
    contratos: fiscais.contratos,
    faturas: fiscais.faturas,
    propostas: propostas.length,
    tarefas: tarefas.length,
  };
}

/** Contrato ou fatura: recusam. Puro. */
export function registoFiscal(l: RegistosFiscais): "tem-contrato" | "tem-fatura" | null {
  if (l.contratos > 0) return "tem-contrato";
  if (l.faturas > 0) return "tem-fatura";
  return null;
}

/** A frase de quando ficaram propostas no pedido (no meio e no fim do apagar). */
export const fraseDasPropostasQueFicaram = (n: number): string =>
  `ficaram ${n} proposta(s) neste pedido`;

/**
 * O relatório das propostas que a confirmação ainda encontrou: as que
 * falharam ao apagar, uma a uma, e quantas nasceram entretanto (as que lá
 * estão sem terem falhado). Pelos ids — as contagens enganavam quando uma que
 * falhou saía por outro lado e nascia outra. Puro.
 */
export function oQueFicouDasPropostas(
  ficaram: readonly string[],
  falharam: ReadonlySet<string>,
): string[] {
  const linhas = ficaram
    .filter((id) => falharam.has(id))
    .map((id) => `a proposta ${id} não foi apagada`);
  const novas = ficaram.filter((id) => !falharam.has(id)).length;
  if (novas > 0) linhas.push(fraseDasPropostasQueFicaram(novas));
  return linhas;
}

/**
 * As propostas que falharam ao apagar mas que a confirmação já não encontra:
 * saíram, só a resposta se perdeu. Puro.
 */
export function propostasQueSairamSemResposta(
  falharam: ReadonlySet<string>,
  ficaram: readonly string[],
): string[] {
  const aindaLa = new Set(ficaram);
  return [...falharam].filter((id) => !aindaLa.has(id));
}

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
