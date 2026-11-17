import "server-only";
import type { Proposal } from "@/lib/orcamento/types";
import { eur } from "@/lib/money";
import { updateProposal } from "@/lib/proposals-store";
import { updateQuoteWith } from "@/lib/quotes-store";
import { transicaoDoPedido } from "@/lib/orcamento/estado-do-pedido";
import { aceitarSeOPedidoJaEstaGanho } from "@/lib/contrato-do-ganho";
import { registarEnvio } from "@/lib/envios-de-proposta";
import { guardarPdfDaProposta } from "@/lib/proposal-pdf-guardado";
import { chaveDoPdf } from "@/lib/proposal-pdf-cache";
import { log } from "@/lib/logger";
import type { EmailDaProposta } from "./email-da-proposta";
import type { BytesDoPdf, EnvioDaProposta } from "./envio-da-proposta";

/**
 * Etapa 12 do envio (`docs/ESTRUTURA-DO-CODIGO.md`, fase 5): as escritas
 * DEPOIS do correio. Todas são «melhor esforço»: o email já saiu e não se
 * desfaz. Mas cada uma que falha sai PELO NOME na resposta (`*Error`).
 */
export interface DepoisDoEmail {
  /** O estado com que a proposta FICOU — é este que a resposta conta. */
  estado: Proposal["status"];
  estadoError?: string;
  copiaError?: string;
  pedidoError?: string;
}

export interface ParaDepoisDoEmail extends EnvioDaProposta {
  proposal: Proposal;
  /** `true` quando o correio saiu. */
  emailed: boolean;
  /** `true` quando ela escolheu o WhatsApp. */
  semEmailPorEscolha: boolean;
  email: EmailDaProposta;
  /** A chave do modelo de que o corpo partiu (vazia sem ela). */
  modelo: string;
  pdf: BytesDoPdf;
}

/**
 * ── SEGUIU: PELO EMAIL, OU PELO WHATSAPP QUE ELA ESCOLHEU ──────────────
 *
 * Achado n.º 4 da auditoria. Com «Por onde segue: WhatsApp», a proposta
 * ficava «rascunho», a resposta vinha sem link e o estúdio dizia «o EMAIL
 * NÃO SAIU — o cliente não recebeu nada». O WhatsApp nunca abria.
 *
 * Escolher o WhatsApp é dizer «sou eu que lho mando». A proposta passa a
 * «enviada», o pedido sobe a «Proposta enviada», e o link volta na
 * resposta para o estúdio abrir o WhatsApp com ele. A cópia do email
 * (`registarEnvio`) continua só para o email: não houve email a copiar.
 */
export async function depoisDoEmail(p: ParaDepoisDoEmail): Promise<DepoisDoEmail> {
  const seguiu = p.emailed || p.semEmailPorEscolha;
  /** (Uma variável e não `proposal.status`: o objecto já foi entregue à camada
   *  de gravação, e mudá-lo por baixo dela seria mentir a quem o guardou.) */
  const r: DepoisDoEmail = { estado: p.proposal.status };
  if (seguiu) {
    const sentAt = new Date().toISOString();
    if (p.emailed) r.copiaError = await guardarACopia(p, sentAt);
    r.estadoError = await marcarEnviada(p, sentAt);
    if (!r.estadoError) r.estado = "enviada";
  }
  r.pedidoError = await actualizarOPedido(p, seguiu, r.estado);
  await guardarOPdf(p);
  return r;
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * A CÓPIA DO QUE SEGUIU — E O QUE ELA NÃO É
 * ══════════════════════════════════════════════════════════════════════
 *
 * «O que é que nós lhes escrevemos?», três semanas depois, ao telefone.
 * Desde que o corpo passou a ser editável no ecrã de envio, essa pergunta
 * não tinha resposta em lado nenhum. Fica aqui o que saiu — ver
 * `envios-de-proposta.ts`.
 *
 * NÃO É RASTREIO, e é decisão dela: não há «aberto em», «lido às» nem
 * «carregou no link», e não pode passar a haver. Tudo o que se guarda são
 * factos do lado de cá — o que nós mandámos, quando, e quem carregou no
 * botão.
 *
 * MELHOR ESFORÇO QUE FALHA TEM DE SER DITO: o que se perde é a resposta à
 * pergunta «o que é que nós lhes escrevemos?», que não existe em mais lado
 * nenhum.
 */
async function guardarACopia(p: ParaDepoisDoEmail, sentAt: string): Promise<string | undefined> {
  try {
    await registarEnvio(p.pedidoId, {
      enviadoEm: sentAt,
      para: String(p.quote.email ?? ""),
      porQuem: p.email.quem.nome,
      // A chave do modelo de onde o corpo partiu, para se saber de que
      // texto se partiu. Vazia quando o envio não passou pelo ecrã novo.
      modelo: p.modelo,
      idioma: p.idioma,
      assunto: p.email.assunto,
      texto: p.email.textoDaCopia,
      anexo: { nome: p.email.nomeDoAnexo, bytes: p.pdf.byteLength },
      propostaId: p.proposal.id,
    });
    return undefined;
  } catch (e) {
    log.error("proposta-doc: o email saiu mas a cópia não ficou guardada", e, { id: p.pedidoId });
    return (
      "O email seguiu para o cliente, mas a CÓPIA do que lhe escrevemos não ficou " +
      "guardada. O envio está feito; o que se perde é poder reler o texto mais tarde."
    );
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * AGORA SIM: SEGUIU, LOGO ESTÁ «ENVIADA»
 * ══════════════════════════════════════════════════════════════════════
 *
 * Segunda escrita, e de propósito. A primeira teve de ser antes do email
 * (o link assinado que vai no correio tem de encontrar a proposta se o
 * casal carregar nele no segundo seguinte); esta é a única que pode dizer
 * «enviada», porque só aqui é que isso já aconteceu.
 *
 * Se ESTA falhar, a proposta seguiu na mesma e fica marcada como por
 * enviar. É o erro para o lado seguro — mas grita no registo e volta na
 * resposta. A frase NÃO manda reenviar: a trava de repetição reconhece o
 * envio pelo registo de envios (`repeticao-do-envio.ts`), e o que ela
 * precisa de saber é que o cliente JÁ recebeu.
 */
async function marcarEnviada(p: ParaDepoisDoEmail, sentAt: string): Promise<string | undefined> {
  try {
    const gravado = await updateProposal(p.proposal.id, { status: "enviada", sentAt });
    if (!gravado) throw new Error("proposta não encontrada ao marcar como enviada");
    return undefined;
  } catch (e) {
    log.error("proposta-doc: o email saiu mas a proposta ficou por marcar como enviada", e, {
      id: p.pedidoId,
      proposta: p.proposal.id,
    });
    return p.emailed
      ? "O email seguiu para o cliente — ele JÁ a recebeu. O que falhou foi a marcação " +
          "deste lado: a proposta ficou como «por enviar» e o Quadro pode não a mostrar na " +
          "coluna certa. Não é preciso reenviar nada."
      : "A proposta está gravada, mas não ficou marcada como enviada: o Quadro pode não " +
          "a mostrar na coluna certa.";
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * O PREÇO GRAVA-SE SEMPRE; O ESTADO SÓ SOBE
 * ══════════════════════════════════════════════════════════════════════
 *
 * `dinheiro.base` (SEM IVA) e não `dinheiro.gross`. O campo chama-se "Preço
 * final (sem IVA)" no ecrã, e o `contractedAmounts` (dossier.ts) trata-o
 * como líquido. Gravar o valor COM IVA punha a margem do evento cerca de
 * 23% melhor do que a real, e a proposta seguinte marcava "+ IVA" por cima.
 *
 * O estado decide-o `@/lib/orcamento/estado-do-pedido`, que nunca desce a
 * escada (rever a proposta DEPOIS do aceite não faz recuar um casamento
 * fechado), e só se o email SAIU (ou ela escolheu o WhatsApp): «Proposta
 * enviada» no Quadro sobre um email que nunca saiu seria mentira.
 *
 * `updateQuoteWith` e não `updateQuote`: o `getQuote` do princípio está a
 * dezenas de segundos daqui, e a regra tem de ser avaliada contra o que está
 * gravado AGORA.
 *
 * Se falhar: o pedido não avança no Quadro e o `quotedPrice` não grava — e é
 * dele que vivem a margem e a proposta seguinte. Melhor esforço, mas dito.
 */
async function actualizarOPedido(
  p: ParaDepoisDoEmail,
  seguiu: boolean,
  estado: Proposal["status"],
): Promise<string | undefined> {
  try {
    const pedidoDepois = await updateQuoteWith(p.pedidoId, (actual) => {
      const transicao = seguiu
        ? transicaoDoPedido({
            acontecimento: "proposta_enviada",
            estadoActual: actual.status,
            detalhe: eur(p.dinheiro().gross),
          })
        : null;
      return {
        ...actual,
        quotedPrice: p.dinheiro().base,
        ...(transicao
          ? {
              status: transicao.status,
              activityLog: [...(actual.activityLog ?? []), transicao.entrada],
            }
          : {}),
      };
    });
    // O pedido já estava «Ganho» antes de esta proposta seguir: ela é a que
    // o casal aceitou — fica aceite, e o contrato nasce (16/11).
    if (seguiu && estado === "enviada") {
      try {
        await aceitarSeOPedidoJaEstaGanho(p.pedidoId, pedidoDepois?.status, p.proposal);
      } catch (e) {
        log.error("proposta-doc: aceitar a proposta de um pedido já ganho falhou", e, {
          id: p.pedidoId,
        });
      }
    }
    return undefined;
  } catch (e) {
    log.error("proposta-doc: actualizar pedido falhou", e);
    return (
      "O email seguiu para o cliente, mas o PEDIDO não ficou actualizado: pode continuar " +
      "na coluna anterior do Quadro, e o preço final pode não ter sido gravado. " +
      "Confirma-os antes de fechar."
    );
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * O PDF FICA GUARDADO, PARA O CASAL NÃO O MANDAR DESENHAR OUTRA VEZ
 * ══════════════════════════════════════════════════════════════════════
 *
 * O «Ver a proposta completa (PDF)» da página do casal REDESENHAVA o
 * documento inteiro, com as oitenta fotografias a passar outra vez pelo
 * `sharp`. O ficheiro já está desenhado: é este, o mesmo que acabou de seguir
 * em anexo e cujo `sha256` ficou selado no contrato.
 *
 * Depois do email, porque nada disto pode atrasar o correio. Se a escrita
 * falhar, o botão volta a desenhar como sempre fez — é memória, não é a
 * verdade. Por isso não há `throw`, e o desfecho vai só no registo.
 */
async function guardarOPdf(p: ParaDepoisDoEmail): Promise<void> {
  try {
    const guardou = await guardarPdfDaProposta(p.proposal.id, chaveDoPdf(p.doc, p.idioma), p.pdf);
    if (!guardou) {
      log.warn("proposta-doc: o PDF não ficou guardado — o link do casal vai redesenhar", {
        id: p.proposal.id,
      });
    }
  } catch (e) {
    log.warn("proposta-doc: o PDF não ficou guardado", { erro: String(e) });
  }
}
