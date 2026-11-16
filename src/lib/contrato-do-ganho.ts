import type { Proposal } from "@/lib/orcamento/types";
import {
  createContractIfAbsent,
  deleteContract,
  getContractByProposal,
  newContractId,
} from "@/lib/contracts-store";
import { listProposalsForQuote, updateProposal } from "@/lib/proposals-store";
import { idiomaDaProposta } from "@/lib/proposta-idioma";
import { TERMS_VERSION, termosPara, termsToPlainText } from "@/lib/contract-terms";
import { depositPercentOf, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTRATO NASCE QUANDO A EQUIPA MARCA «GANHO» — POR ASSINAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Vivia dentro do PATCH do pedido (`api/orcamento/[id]`), e por isso só esse
 * caminho do «Ganho» criava contrato. O «Aceitar» das Propostas e o
 * Acompanhamento passam pelo PATCH da PROPOSTA, e o pedido ficava ganho sem
 * contrato — e fora das Propostas Aceites. Ela deu por isso: «já houve mais
 * propostas aceites e não estão aqui».
 *
 * Agora é uma função só, chamada pelos três: o PATCH do pedido, o PATCH da
 * proposta, e o botão «Criar contrato» das Propostas Aceites.
 *
 * `createContractIfAbsent` é o LOCK: marcar «Ganho» duas vezes, ou aceitar e
 * depois mover o pedido, não nasce dois contratos — a segunda chamada encontra
 * o primeiro pela `proposalId` e não faz nada.
 *
 * ── O QUE ESTE CONTRATO NÃO FINGE ─────────────────────────────────────────
 * Quem marca é a EQUIPA, a partir de um email, um telefonema ou um WhatsApp.
 * Não há aqui nem nome escrito, nem IP, nem o momento em que o casal disse que
 * sim. Por isso o contrato nasce `pendente` — por assinar — e SEM
 * `acceptedAt`/`acceptedName`/`acceptedIp`: inventá-los seria fingir um aceite
 * que este sistema não presenciou.
 *
 * Os termos vão CONGELADOS na versão actual, sobre a percentagem de sinal DESTA
 * proposta e na língua que ela levou. O selo do PDF e a versão só vão quando a
 * proposta os tem: um selo inventado a posteriori não provaria nada.
 */
export function nascerContratoDoGanho(quoteId: string, proposta: Proposal) {
  const idioma = idiomaDaProposta(proposta);
  return createContractIfAbsent({
    id: newContractId(),
    quoteId,
    proposalId: proposta.id,
    clientName: proposta.clientName,
    clientEmail: proposta.clientEmail,
    termsVersion: TERMS_VERSION,
    idioma,
    termsSnapshot: termsToPlainText(
      termosPara(depositPercentOf(proposta.doc as ProposalDoc | undefined), idioma),
    ),
    status: "pendente",
    createdAt: new Date().toISOString(),
    ...(proposta.pdfSha256 !== undefined ? { propostaPdfSha256: proposta.pdfSha256 } : {}),
    ...(proposta.pdfBytes !== undefined ? { propostaPdfBytes: proposta.pdfBytes } : {}),
    ...(proposta.versaoSelo !== undefined ? { propostaVersaoSelo: proposta.versaoSelo } : {}),
    ...(proposta.versaoNumero !== undefined ? { propostaVersaoNumero: proposta.versaoNumero } : {}),
  });
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROPOSTA QUE SEGUE DEPOIS DO «GANHO» JÁ NASCE ACEITE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O «Ganho» aceita a proposta que o pedido TEM nesse momento. Quando ela marca
 * «Ganho» primeiro (o casal disse que sim ao telefone) e só depois envia o
 * documento, não havia proposta nenhuma para aceitar — e a que seguiu a seguir
 * ficava «enviada» para sempre, sem contrato, fora das Propostas Aceites.
 * Aconteceu (16/11): «nem estão aqui as propostas todas aceites».
 *
 * Só quando NENHUMA outra proposta do pedido está aceite: uma revisão enviada
 * depois de uma proposta aceite é isso mesmo — uma revisão por responder — e a
 * aceite continua a ser a que conta (`propostaQueConta`).
 *
 * Devolve se aceitou. Quem chama trata isto como melhor esforço: o envio já
 * aconteceu e não se desfaz por causa disto.
 */
export async function aceitarSeOPedidoJaEstaGanho(
  quoteId: string,
  estadoDoPedido: string | undefined,
  proposta: Proposal,
  agora: string = new Date().toISOString(),
): Promise<boolean> {
  if (estadoDoPedido !== "aceite") return false;
  const irmas = await listProposalsForQuote(quoteId);
  if (irmas.some((p) => p.id !== proposta.id && p.status === "aceite")) return false;
  const aceite = await updateProposal(proposta.id, { status: "aceite", respondedAt: agora });
  if (!aceite) return false;
  // Dois envios em voo ao mesmo tempo podiam aceitar cada um a sua: relê-se, e
  // fica a que foi aceite primeiro (empate: o id menor). A outra volta a
  // «enviada» — uma revisão por responder — e não nasce segundo contrato.
  const depois = await listProposalsForQuote(quoteId);
  const primeira = depois
    .filter((p) => p.status === "aceite")
    .sort(
      (a, b) =>
        String(a.respondedAt ?? "").localeCompare(String(b.respondedAt ?? "")) ||
        a.id.localeCompare(b.id),
    )[0];
  if (primeira && primeira.id !== proposta.id) {
    await updateProposal(proposta.id, { status: "enviada", respondedAt: "" });
    return false;
  }
  await nascerContratoDoGanho(quoteId, { ...proposta, ...aceite });
  return true;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DESFAZER UM «GANHO» MARCADO POR ENGANO — E O QUE ELE ARRASTOU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a 10/10: «tem que haver no site todo, em tudo aquilo que se
 * faz, uma forma de voltar atrás». Pôr um pedido em «Ganho» faz três coisas
 * além de mudar a coluna: aceita a proposta, cria o contrato e pré-preenche a
 * produção. O «Anular» do estado tem de levar as duas primeiras de volta, ou o
 * pedido volta para trás e o contrato fica nas Propostas Aceites a dizer o
 * contrário.
 *
 *  · a proposta aceite volta a `enviada`, sem data de resposta;
 *  · o contrato dessa proposta sai — SÓ se ainda estiver `pendente` e sem
 *    registo nenhum. Um contrato que alguém já marcou como assinado é trabalho
 *    de uma pessoa, e não se apaga por arrasto;
 *  · a produção pré-preenchida FICA. A sementeira é idempotente (marcar
 *    «Ganho» outra vez não duplica nada) e o histórico diz o que entrou; e
 *    tirar tarefas que alguém pode já ter começado a riscar seria apagar
 *    trabalho a meio de um «Anular». Diz-se no aviso.
 *
 * Só corre quando o ecrã o pede explicitamente (`desfazerGanho` no PATCH do
 * pedido) — mover um pedido de «Ganho» para «Perdido» porque o casamento caiu
 * NÃO é desfazer, e o contrato desse fica para a história.
 */
export async function desfazerCadeiaDoGanho(quoteId: string): Promise<{
  propostas: number;
  contratos: number;
}> {
  let propostas = 0;
  let contratos = 0;
  for (const p of await listProposalsForQuote(quoteId)) {
    if (p.status !== "aceite") continue;
    await updateProposal(p.id, { status: "enviada", respondedAt: "" });
    propostas++;
    const c = await getContractByProposal(p.id);
    if (c && c.status === "pendente" && !c.registadoComo && !c.acceptedAt) {
      await deleteContract(c.id);
      contratos++;
    }
  }
  return { propostas, contratos };
}
