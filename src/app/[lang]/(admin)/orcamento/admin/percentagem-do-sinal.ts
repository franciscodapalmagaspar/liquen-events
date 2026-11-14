"use client";

import { useMemo } from "react";
import { pctDoSinalDe, propostaQueContaDoPedido } from "@/lib/orcamento/proposta-que-conta";
import type { ProposalStatus } from "@/lib/orcamento/types";
import { revalidarLista, useCachedList } from "./useCachedList";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PERCENTAGEM DO SINAL DE UM PEDIDO, DO MESMO SÍTIO DE ONDE SAI A FACTURA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O sinal deixou de ser 30% no dia em que o estúdio ganhou a caixa
 * «Sinal (%)». A proposta passou a guardá-la (`depositPercentOf`), mas os ecrãs
 * onde ela vê o número — o painel de Pagamentos, o dossiê — continuavam a
 * dividir 30/70 à letra. Numa proposta de 50%, o atalho oferecia «sinal
 * 3.690,00 €» quando o combinado com o cliente eram 6.150,00 €: ela registava o
 * que o botão dizia e o «Em falta» ficava errado a partir daí. Não é um erro de
 * contas — é o ecrã a dizer uma coisa e o combinado a ser outra.
 *
 * Vive num sítio só, e não copiado nos dois componentes, precisamente porque
 * duas cópias é a forma de um deles voltar a ficar para trás.
 *
 * ── Porque é que sai da lista LEVE de propostas ───────────────────────────
 * `/api/propostas?semDoc=1` já é pedida (e pré-aquecida em ociosidade pelo
 * AdminClient), já está em cache de módulo, e traz este número como facto
 * derivado — sem os documentos, que são quase tudo o que se descarregaria. Um
 * pedido novo por evento, só para ir buscar um inteiro, seria pior em todos os
 * eixos.
 */

/** O que esta leitura precisa da lista leve. O resto dos campos ignora-se. */
export interface PropostaLeve {
  quoteId?: string;
  status?: ProposalStatus;
  pctSinal?: number;
  total?: number;
  subtotal?: number;
  /** O que o casal tem a pagar, pela versão escolhida (ver `/api/propostas`). */
  totalAPagar?: number;
  subtotalAPagar?: number;
  vatRate?: number;
}

/**
 * A proposta que conta para o dinheiro de um pedido: a ACEITE, se houver; senão
 * a mais recente que seguiu para o casal (nunca um rascunho por enviar).
 *
 * ── PORQUE É QUE A ACEITE PASSA À FRENTE (5/11) ─────────────────────────────
 * Ela: «o último valor que foi acordado foi porque o cliente aceitou a
 * proposta». Depois de um aceite pode nascer uma revisão (outra proposta, mais
 * nova, por enviar ou enviada), e é a aceite que o cliente assinou: é dela o
 * total a receber e a percentagem do sinal. É a mesma regra do link do casal
 * («o que foi aceite fica congelado», `proposta-do-link.ts`).
 *
 * A escolha vive em `lib/orcamento/proposta-que-conta.ts` — a MESMA do quadro
 * das Cobranças, do «Gerar» e do «Ganho» (auditoria de 13/11, n.os 3 e 9).
 */
const propostaQueConta = propostaQueContaDoPedido<PropostaLeve>;

/**
 * A percentagem do sinal do pedido, ou a da casa quando ainda não há proposta.
 * Vem da proposta que conta (ver {@link propostaQueConta}).
 */
export function usePercentagemDoSinal(quoteId: string | null | undefined): number {
  const { data } = useCachedList<PropostaLeve[]>("propostas-leves", "/api/propostas?semDoc=1");
  // Enquanto a lista não chega — ou se a leitura falhar — vale a percentagem da
  // casa. É o que o servidor também aplica quando não há proposta que diga
  // outra coisa, por isso o ecrã nunca promete um número que ninguém emitiria.
  return pctDoSinalDe(propostaQueConta(data, quoteId));
}

/** O dinheiro da proposta ACEITE de um pedido, para as contas dos pagamentos. */
export interface DinheiroAceite {
  total: number;
  subtotal: number;
  vatRate?: number;
}

/**
 * O total da proposta que o cliente ACEITOU, ou `null` se nenhuma foi aceite
 * (ou a lista ainda não chegou).
 *
 * ── O ERRO QUE ISTO FECHA (5/11) ─────────────────────────────────────────────
 * O painel de Pagamentos fazia as contas sem proposta nenhuma: o total era o
 * «Preço final (sem IVA)» do pedido mais IVA. Num cliente aceite por 5.317,29 €,
 * esse campo tinha ficado com 4,323 € em vez de 4.323 € (uma vírgula de
 * milhares lida como decimal), e o painel dizia que havia 5,32 € a pagar. O
 * total que o cliente aceitou está gravado na proposta: é esse que manda.
 */
export function useDinheiroAceite(quoteId: string | null | undefined): DinheiroAceite | null {
  const { data } = useCachedList<PropostaLeve[]>("propostas-leves", "/api/propostas?semDoc=1");
  const p = propostaQueConta(data, quoteId);
  const aceite = p?.status === "aceite";
  // Pela versão que o casal escolheu (a base, sem os extras, quando foi essa):
  // o mesmo número que a faturação manda ao Moloni (auditoria de 13/11, n.º 1).
  const total = aceite ? (p?.totalAPagar ?? p?.total ?? NaN) : NaN;
  const subtotal = aceite ? (p?.subtotalAPagar ?? p?.subtotal ?? NaN) : NaN;
  const vatRate = aceite && typeof p?.vatRate === "number" ? p.vatRate : undefined;
  // O mesmo objecto enquanto os números não mudam: quem o usa num `useMemo`
  // não recalcula as contas a cada desenho.
  return useMemo(() => {
    if (!Number.isFinite(total) || total <= 0) return null;
    return { total, subtotal: Number.isFinite(subtotal) ? subtotal : 0, vatRate };
  }, [total, subtotal, vatRate]);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PROPOSTA QUE CONTA, PARA A FASE DO PEDIDO NA LISTA (auditoria de 14/11)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A lista de Pedidos (o `LifecycleStepper` e a «próxima ação») passou a pedir
 * a fase com a proposta que conta, como o dossiê — sem ela, dizia «Concluído»
 * a casamentos com dinheiro por receber.
 *
 * SÓ OUVE a cache (`pedir: false`): a lista leve já é aquecida em ociosidade
 * pelo AdminClient e revalidada pelos painéis que a usam (Pagamentos, …). Uma
 * leitura nova aqui seria mais uma leitura da tabela inteira de propostas por
 * cada vez que o back office abre. Nenhum pedido por linha, nenhum pedido novo.
 */
export function usePropostasLevesSoOuvir(): PropostaLeve[] | undefined {
  return useCachedList<PropostaLeve[]>("propostas-leves", "/api/propostas?semDoc=1", {
    pedir: false,
  }).data;
}

/**
 * A proposta que conta para a fase de um pedido: a proposta, `null` se o
 * pedido não tem nenhuma que conte, ou `undefined` se a lista ainda não chegou
 * (e então a fase nunca diz «concluído» às cegas — ver `faseDoPedido`).
 */
export function propostaDaFaseDoPedido(
  lista: readonly PropostaLeve[] | undefined,
  quoteId: string | null | undefined,
): PropostaLeve | null | undefined {
  if (!Array.isArray(lista)) return undefined;
  return propostaQueConta(lista, quoteId);
}

/**
 * Uma proposta mudou no servidor (enviada, aceite, recusada, apagada, ou o
 * pedido mudou de desfecho e arrastou-a): a lista leve volta a ser lida UMA
 * vez, para a fase da lista, os Pagamentos e as Cobranças acompanharem.
 */
export function asPropostasMudaram(): void {
  revalidarLista("propostas-leves", "/api/propostas?semDoc=1");
}
