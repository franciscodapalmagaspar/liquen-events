import "server-only";
import type { Quote } from "@/lib/orcamento/types";
import { resolveValidUntil, type ProposalDoc } from "@/lib/proposal-doc";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import { dinheiroDaProposta } from "@/lib/proposal-budget";
import { getQuote } from "@/lib/quotes-store";
import { excedeOTecto, MAXIMO_CORPO_ESCRITO } from "@/lib/email-corpo-escrito";
import { enderecoDaProposta } from "@/lib/proposta-link-curto";
import { aquecerDerivadasDaCapa } from "@/lib/derivadas";
import { log } from "@/lib/logger";
import { comTrinco } from "@/lib/trinco";
import {
  avisarDoIdiomaDesconhecido,
  lerOPedido,
  porQueEstaIncompleta,
  type PedidoDeProposta,
} from "./corpo-do-pedido";
import { prepararODocumento } from "./documento-do-envio";
import { travaDoEnvio, travaDoPdfFinal } from "./travas-do-envio";
import { desenharOPdf, type PdfDesenhado } from "./desenhar-o-pdf";
import type { RelatorioDoPdf } from "@/lib/proposal-preview-cache";
import {
  cabecalhosDaPreVisualizacao,
  perguntaDasFotos,
  perguntaDosCortes,
} from "./perguntas-antes-do-envio";
import {
  irmasDoPedido,
  montarAProposta,
  propostasAnteriores,
  versaoDaProposta,
} from "./a-proposta-que-se-grava";
import { repeticaoDoEnvio } from "./repeticao-do-envio";
import { gravarAProposta } from "./gravar-a-proposta";
import { escreverOEmail } from "./email-da-proposta";
import { mandarOEmail } from "./mandar-o-email";
import { depoisDoEmail } from "./depois-do-email";
import { respostaDoEnvio, type RespostaDoEnvio } from "./resposta-do-envio";
import { TECTO_DO_ENVIO_S } from "./orcamento-de-tempo";
import { recusa, type Recusa } from "./recusa";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PEDIDO À ROTA DA PROPOSTA, ETAPA A ETAPA (fase 5 de `docs/ESTRUTURA-DO-CODIGO.md`)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estas duas funções só dizem a ORDEM; cada etapa vive, com a sua razão por
 * extenso, no seu ficheiro desta pasta:
 *
 *   1. o corpo do pedido ............ `corpo-do-pedido.ts` (esquema, modo de observar)
 *   2. o trinco ..................... `lib/trinco.ts` (`comTrinco`)
 *   3. o documento e a chave ........ `documento-do-envio.ts`
 *   4. o que trava .................. `travas-do-envio.ts`
 *   5. o desenho, e a 2.ª passagem .. `desenhar-o-pdf.ts` (e `orcamento-de-tempo.ts`)
 *   6. as duas perguntas ............ `perguntas-antes-do-envio.ts`
 *   7. a linha e a versão ........... `a-proposta-que-se-grava.ts`
 *   8. a repetição .................. `repeticao-do-envio.ts`
 *   9. a gravação ................... `gravar-a-proposta.ts`
 *  10. o email, escrito ............. `email-da-proposta.ts` (e `cartao-do-pdf.ts`)
 *  11. o email, mandado ............. `mandar-o-email.ts`
 *  12. o que fica depois ............ `depois-do-email.ts`
 *  13. a resposta ................... `resposta-do-envio.ts`
 *
 * A ordem é a regra: recusa-se tudo o que se pode recusar ANTES de desenhar
 * (um PDF de um minuto que não pode seguir é um minuto deitado fora), e
 * pergunta-se ANTES de gravar e de mandar (é o último instante em que voltar
 * atrás não custa nada).
 *
 * Não conhece o Next: devolve um {@link Desfecho}, e a rota traduz-o em HTTP.
 * O retrato de cada resposta está preso em `route.caracterizacao.test.ts`.
 */
export type Desfecho =
  | { tipo: "recusa"; recusa: Recusa }
  | { tipo: "pdf"; pdf: RelatorioDoPdf["pdf"]; cabecalhos: Record<string, string> }
  | { tipo: "envio"; resposta: RespostaDoEnvio };

/** O que a rota dá ao pedido: o que só ela sabe ler, e o relógio. */
export interface Contexto {
  id: string;
  request: Request;
  /** Quantos ms sobram do orçamento do pedido (`relogioDoEnvio`). */
  resta: () => number;
  /** Quem carregou em «Enviar» — só se lê no envio. */
  assinatura: () => { nome: string; cargo: string };
  /** Corre trabalho depois de a resposta sair (o `after` do Next). */
  depoisDaResposta: (trabalho: () => Promise<void>) => void;
}

const recusado = (r: Recusa): Desfecho => ({ tipo: "recusa", recusa: r });

/**
 * ── DOIS ENVIOS EM VOO AO MESMO TEMPO (auditoria de 13/11, n.º 3) ───────
 *
 * A trava de repetição olha para o que JÁ seguiu. Dois pedidos ao mesmo tempo
 * leem as irmãs antes de qualquer um ter enviado, e nenhum vê o outro: dois
 * emails ao casal. O trinco deixa passar um só por pedido; o segundo ouve que
 * o primeiro ainda está a enviar. Vale o tempo máximo da função e mais uma
 * margem — se ela morrer a meio, vence.
 */
const VALIDADE_DO_TRINCO_MS = (TECTO_DO_ENVIO_S + 15) * 1000;
const A_SER_ENVIADA = recusa(409, {
  error:
    "Esta proposta já está a ser enviada (carregou duas vezes, ou noutro separador). Espere uns segundos: se não aparecer como enviada, volte a carregar em enviar.",
  aEnviar: true,
});

export async function atenderOPedido(c: Contexto): Promise<Desfecho> {
  const quote = await getQuote(c.id);
  if (!quote) return recusado(recusa(404, { error: "Pedido não encontrado" }));
  const pedido = await lerOPedido(c.request, c.id);
  if (pedido.modo === "preview") return desenharOuRecusar(c, quote, pedido);
  const r = await comTrinco(`envio-da-proposta:${c.id}`, VALIDADE_DO_TRINCO_MS, () =>
    desenharOuRecusar(c, quote, pedido),
  );
  return r.ok ? r.valor : recusado(A_SER_ENVIADA);
}

/** Da leitura ao PDF desenhado: tudo o que se recusa, recusa-se aqui. */
async function desenharOuRecusar(
  c: Contexto,
  quote: Quote,
  pedido: PedidoDeProposta,
): Promise<Desfecho> {
  const { id } = c;
  // O corpo escrito à mão recusa-se por tamanho ANTES de se desenhar o PDF:
  // recusar depois é gastar o desenho por nada. O resto dele (o
  // `{{link_proposta}}`) só se resolve depois de a proposta estar gravada.
  if (excedeOTecto(pedido.corpo)) {
    return recusado(
      recusa(400, {
        error:
          `O texto do email é demasiado longo (o máximo são ${MAXIMO_CORPO_ESCRITO} caracteres). ` +
          `Encurta-o e volta a enviar — não foi enviado nada.`,
      }),
    );
  }
  const incompleta = porQueEstaIncompleta(pedido.doc);
  if (incompleta || !pedido.doc) return recusado(recusa(400, { error: incompleta }));
  avisarDoIdiomaDesconhecido(pedido, id);
  const { idioma } = pedido;
  const { chaveDoQueChegou, doc, grandeDemais } = prepararODocumento(pedido.doc, idioma);
  if (grandeDemais) {
    return recusado(recusa(413, { error: "Proposta demasiado grande para ser guardada." }));
  }

  const trava =
    pedido.modo === "send"
      ? await travaDoEnvio({
          id,
          doc,
          quote,
          idioma,
          porEmail: pedido.porEmail,
          pdfVisto: pedido.pdfVisto,
          chaveDoQueChegou,
        })
      : pedido.rascunho
        ? null
        : await travaDoPdfFinal({ doc, quote, idioma });
  if (trava) return recusado(trava);

  const desenho = await desenharOPdf({
    id,
    doc,
    idioma,
    modo: pedido.modo,
    rascunho: pedido.rascunho,
    chaveDoQueChegou,
    resta: c.resta,
  });
  if (pedido.modo === "send") return enviar({ c, quote, pedido, doc, idioma, desenho });
  const { pdf, missingImages, truncations } = desenho.relatorio;
  return {
    tipo: "pdf",
    pdf,
    cabecalhos: cabecalhosDaPreVisualizacao({
      idioma,
      rascunho: pedido.rascunho,
      missingImages,
      truncations,
      chaveDoQueChegou,
      pdfDaMemoria: desenho.pdfDaMemoria,
    }),
  };
}

/** Do PDF desenhado ao email: pergunta, grava, manda, e conta o que fez. */
async function enviar(e: {
  c: Contexto;
  quote: Quote;
  pedido: PedidoDeProposta;
  doc: ProposalDoc;
  idioma: IdiomaDaProposta;
  desenho: PdfDesenhado;
}): Promise<Desfecho> {
  const { c, quote, pedido, doc, idioma } = e;
  const { id } = c;
  const { relatorio, pdfDaMemoria } = e.desenho;
  const { pdf, missingImages, truncations } = relatorio;
  const pergunta =
    perguntaDasFotos(id, missingImages, pedido.fotosEmFaltaConfirmadas) ??
    perguntaDosCortes(id, truncations, pedido.cortesConfirmados);
  if (pergunta) return recusado(pergunta);
  // Só aqui é «segue com fotos a menos»: ela respondeu às duas perguntas
  // (fotos e cortes). Antes disso, o envio ainda podia parar (revisão de 17/11).
  if (missingImages > 0) {
    log.warn("proposta-doc: a proposta segue com fotos a menos, confirmado por ela", {
      id,
      emFalta: missingImages,
    });
  }

  // `dinheiroDaProposta` e não `resolveProposalMoney`: quando os valores
  // adicionais somam ao valor escrito, o bruto que fica GRAVADO tem de os
  // trazer. Senão o PDF dizia 3.862,20 € e o sinal continuava a ser calculado
  // sobre 3.690 € — o documento e a cobrança a discordarem em silêncio.
  const money = dinheiroDaProposta(doc);
  const { irmas, porEnviar } = await irmasDoPedido(id);
  const linha = montarAProposta({
    id,
    quote,
    doc,
    idioma,
    money,
    // Honra a data que `prepararODocumento` escreveu no doc — o /proposta
    // recusa aceitar uma proposta expirada.
    validUntil: resolveValidUntil(doc),
    pdf,
    porEnviar,
  });
  const anteriores = propostasAnteriores(linha, irmas);
  const proposal = { ...linha, ...versaoDaProposta(linha, anteriores) };
  const repetido = await repeticaoDoEnvio({
    id,
    proposal,
    irmasAnteriores: anteriores,
    porEmail: pedido.porEmail,
    relatorio,
    pdfBytes: pdf.byteLength,
  });
  if (repetido) return { tipo: "envio", resposta: repetido };

  const gravada = await gravarAProposta(id, proposal, porEnviar);
  if (!gravada.ok) return recusado(gravada.recusa);

  const acceptUrl = await enderecoDaProposta(proposal.id, id);
  const escrito = await escreverOEmail({
    id,
    quote,
    doc,
    idioma,
    mensagem: pedido.mensagem,
    corpo: pedido.corpo,
    assunto: pedido.assunto,
    acceptUrl,
    money,
    assinatura: c.assinatura(),
  });
  /* ── A CAPA FABRICADA ENQUANTO O CORREIO SAI ──────────────────────────
     A derivada de 1200 px da capa era fabricada pela primeira visita — que
     numa proposta acabada de enviar é a do casal a abrir o email. Começa AQUI
     e é esperada depois do `sendMail`: corre em paralelo com o correio. O
     `.catch` é obrigatório — uma promessa rejeitada sem tratamento no
     intervalo derrubaria o processo. */
  const capaAQuecer = aquecerDerivadasDaCapa(doc.coverImages ?? []).catch(() => 0);
  const desfecho = await mandarOEmail({
    id,
    propostaId: proposal.id,
    para: quote.email,
    porEmail: pedido.porEmail,
    escrito,
    pdf,
    resta: c.resta,
  });
  // Nunca lança e tem tecto próprio: se passou dele, fica para a visita.
  await capaAQuecer;
  const depois = await depoisDoEmail({
    id,
    quote,
    proposal,
    doc,
    idioma,
    money,
    emailed: desfecho.emailed,
    semEmailPorEscolha: desfecho.semEmailPorEscolha,
    escrito,
    modelo: pedido.modelo,
    pdf,
  });
  // A proposta online fica pronta já, depois da resposta: o primeiro clique
  // do casal no email não espera pelo motor (`proposta-web/guardado.ts`).
  c.depoisDaResposta(async () => {
    const { aquecerPropostaWeb } = await import("@/lib/proposta-web/modelo");
    await aquecerPropostaWeb(proposal.id);
  });
  return {
    tipo: "envio",
    resposta: respostaDoEnvio({
      propostaId: proposal.id,
      acceptUrl,
      desfecho,
      depois,
      gravada,
      relatorio,
      pdfDaMemoria,
    }),
  };
}
