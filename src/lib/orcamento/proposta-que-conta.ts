import type { Proposal } from "./types";
import { totalDaVersaoAceite } from "./versoes-da-proposta";
import { SINAL_POR_OMISSAO } from "@/lib/money";
import { depositPercentOf } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROPOSTA QUE CONTA PARA O DINHEIRO DE UM PEDIDO — UM SÍTIO SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Auditoria do dinheiro (13/11), n.os 1, 3 e 9. Cada ecrã escolhia a proposta à
 * sua maneira: o painel de Pagamentos «a aceite, senão a mais recente»; o quadro
 * das Cobranças «só a aceite»; o «Gerar» e o «Ganho» «a mais recente» — mesmo
 * um rascunho nunca enviado, que podia passar a aceite e dar origem ao
 * contrato.
 *
 * A regra é a do painel e do link do casal: a ACEITE manda. Sem aceite, a mais
 * recente que SEGUIU para o casal (qualquer estado menos «rascunho»). Um
 * rascunho por enviar nunca conta: o cliente nunca o viu.
 *
 * Puro e sem `server-only`: corre no browser (Pagamentos, Cobranças) e no
 * servidor (o «Gerar», o «Ganho», o resumo diário).
 */

/** O mínimo que a escolha lê de uma proposta. */
interface ComEstado {
  status?: string;
}

/**
 * A proposta que conta, de uma lista JÁ filtrada a um pedido e ordenada da mais
 * nova para a mais velha (é a ordem em que o armazém as devolve).
 */
export function propostaQueConta<T extends ComEstado>(doPedido: readonly T[]): T | null {
  return (
    doPedido.find((p) => p?.status === "aceite") ??
    doPedido.find((p) => !!p && p.status !== "rascunho") ??
    null
  );
}

/** A mesma escolha, a partir da lista de TODAS as propostas. */
export function propostaQueContaDoPedido<T extends ComEstado & { quoteId?: string }>(
  todas: readonly T[] | undefined,
  quoteId: string | null | undefined,
): T | null {
  if (!quoteId || !Array.isArray(todas)) return null;
  return propostaQueConta(todas.filter((p) => p?.quoteId === quoteId));
}

/**
 * A percentagem do sinal da proposta que conta, ou a da casa (30%) sem proposta
 * ou sem uma percentagem que se leia. A MESMA para o painel e o quadro.
 */
export function pctDoSinalDe(p: { pctSinal?: number } | null | undefined): number {
  const pct = p?.pctSinal;
  return typeof pct === "number" && Number.isFinite(pct) && pct >= 1 && pct <= 99
    ? Math.round(pct)
    : SINAL_POR_OMISSAO;
}

/**
 * O que o casal tem a pagar por esta proposta: com IVA (`total`) e sem
 * (`subtotal`), pela VERSÃO que escolheu — a mesma conta da faturação
 * (`totalDaVersaoAceite`), lida do documento como o Moloni a lê. Sem versão
 * escolhida dá o mesmo que os totais gravados ao enviar (que saem desse mesmo
 * `dinheiroDaProposta`). Uma proposta de linhas antiga, sem documento, fica com
 * os totais gravados.
 */
export function totalAPagarDaProposta(
  p: Pick<Proposal, "total" | "subtotal" | "doc" | "versaoEscolhida">,
): { total: number; subtotal: number } {
  if (p.doc) {
    const t = totalDaVersaoAceite(p.doc, p.versaoEscolhida);
    return { total: t.bruto, subtotal: t.base };
  }
  return { total: p.total, subtotal: p.subtotal };
}

/**
 * Uma proposta inteira na forma LEVE que as contas das cobranças lêem — a mesma
 * que `/api/propostas?semDoc=1` dá aos ecrãs. É o que deixa o resumo diário,
 * no servidor, fazer a conta do quadro sem uma segunda versão dela.
 */
export function propostaParaCobrar(p: Proposal) {
  return {
    quoteId: p.quoteId,
    status: p.status,
    total: p.total,
    subtotal: p.subtotal,
    vatRate: p.vatRate,
    pctSinal: depositPercentOf(p.doc),
    totalAPagar: totalAPagarDaProposta(p).total,
  };
}
