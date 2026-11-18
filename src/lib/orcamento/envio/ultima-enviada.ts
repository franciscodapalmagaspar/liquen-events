import "server-only";
import type { Proposal } from "@/lib/orcamento/types";
import { listProposalsForQuote } from "@/lib/proposals-store";
import { enderecoDaProposta } from "@/lib/proposta-link-curto";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LINK DA PROPOSTA MAIS RECENTE REALMENTE ENVIADA (o `GET` de `proposta-doc`)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Para o botão «Copiar resumo» do estúdio (ver `ProposalStudio.tsx`): três ou
 * quatro linhas prontas a colar no WhatsApp, com o link de aceitação quando ele
 * existe. O link é um token assinado (HMAC, `proposal-token.ts`) e só se
 * calcula no servidor — o estúdio não tem o segredo para o construir sozinho,
 * nem devia ter.
 *
 * Só a proposta REALMENTE enviada conta — `sentAt` só fica marcado quando o
 * correio saiu (ver «O ESTADO NASCE "POR ENVIAR"», em
 * `a-proposta-que-se-grava.ts`). Uma proposta gravada mas cujo email falhou não
 * tem, aos olhos do resto do produto, um link que valha a pena dar ao casal —
 * ele nunca chegou a recebê-lo.
 *
 * `null` quando não há nenhuma — a primeira vez que se abre o estúdio para um
 * pedido novo, por exemplo. O botão sabe ler isso: o resumo sai sem o link em
 * vez de sair com um link partido.
 */
export async function linkDaUltimaEnviada(pedidoId: string): Promise<string | null> {
  const propostas = await listProposalsForQuote(pedidoId);
  const enviadas = propostas.filter((p): p is Proposal & { sentAt: string } => !!p.sentAt);
  // A mais recente pelo momento em que SEGUIU, não pela criação: uma
  // proposta reenviada (o "rascunho" que a gravação reaproveita) pode ter
  // sido criada há dias e enviada agora mesmo.
  enviadas.sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt));
  const ultima = enviadas[0];
  return ultima ? enderecoDaProposta(ultima.id, pedidoId) : null;
}
