import { NextRequest, NextResponse, after } from "next/server";
import type { Proposal, Quote } from "@/lib/orcamento/types";
import { resolveValidUntil, type ProposalDoc } from "@/lib/proposal-doc";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import { dinheiroDaProposta } from "@/lib/proposal-budget";
import { isAuthed } from "@/lib/admin-auth";
import { getQuote } from "@/lib/quotes-store";
import { excedeOTecto, MAXIMO_CORPO_ESCRITO } from "@/lib/email-corpo-escrito";
import { enderecoDaProposta } from "@/lib/proposta-link-curto";
import { aquecerDerivadasDaCapa } from "@/lib/derivadas";
import { assinaturaDeQuemEnvia } from "@/lib/email-quem-assina";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";
import { fecharTrinco, type Trinco } from "@/lib/trinco";
import {
  idiomaDoPedido,
  lerOPedido,
  porQueEstaIncompleta,
  type PedidoDeProposta,
} from "@/lib/orcamento/envio/corpo-do-pedido";
import { prepararODocumento } from "@/lib/orcamento/envio/documento-do-envio";
import { travaDoEnvio, travaDoPdfFinal } from "@/lib/orcamento/envio/travas-do-envio";
import { desenharOPdf, type PdfDesenhado } from "@/lib/orcamento/envio/desenhar-o-pdf";
import {
  cabecalhosDaPreVisualizacao,
  perguntaDasFotos,
  perguntaDosCortes,
} from "@/lib/orcamento/envio/perguntas-antes-do-envio";
import {
  carimbarAVersao,
  irmasDoPedido,
  montarAProposta,
} from "@/lib/orcamento/envio/a-proposta-que-se-grava";
import { repeticaoDoEnvio } from "@/lib/orcamento/envio/repeticao-do-envio";
import { gravarAProposta } from "@/lib/orcamento/envio/gravar-a-proposta";
import { escreverOEmail } from "@/lib/orcamento/envio/email-da-proposta";
import { mandarOEmail } from "@/lib/orcamento/envio/mandar-o-email";
import { depoisDoEmail } from "@/lib/orcamento/envio/depois-do-email";
import { respostaDoEnvio } from "@/lib/orcamento/envio/resposta-do-envio";
import { linkDaUltimaEnviada } from "@/lib/orcamento/envio/ultima-enviada";
import type { Recusa } from "@/lib/orcamento/envio/recusa";

export const runtime = "nodejs";

/** O link da proposta mais recente REALMENTE enviada — ver `ultima-enviada.ts`. */
async function GET_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  try {
    return NextResponse.json({ ok: true, acceptUrl: await linkDaUltimaEnviada(id) });
  } catch (err) {
    log.error("proposta-doc GET falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «NÃO DÁ PARA MANDAR A PROPOSTA PARA O CLIENTE»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta é a rota mais pesada da aplicação inteira: vai buscar ao armazenamento
 * até oitenta fotografias, redimensiona cada uma com o sharp, desenha um PDF de
 * uma dúzia de páginas, guarda a proposta e envia um email com o ficheiro em
 * anexo. E era a ÚNICA das rotas pesadas que não dizia quanto tempo precisa.
 *
 * Sem esta linha, a plataforma dá o mínimo — dez segundos — e mata a função a
 * meio. Do lado dela não aparece um erro que se perceba: aparece um erro
 * qualquer, ou nada, depois de o botão ter ficado a rodar. E o mais cruel é que
 * funciona nos testes e nas propostas pequenas: só falha nas que têm fotografias
 * a sério, que são exactamente as que ela manda aos casais.
 *
 * A comparação diz tudo: a rota que serve o PDF já feito ao cliente pede 20 s,
 * a que faz miniaturas pede 60, e a que faz TUDO isto não pedia nada.
 *
 * 60 s é o tecto do plano e é o valor certo aqui: não torna nada mais lento (só
 * se paga o que se usa), e é a diferença entre uma proposta que sai e uma
 * proposta que morre a meio sem explicação.
 */
export const maxDuration = 60;
const ORCAMENTO_MS = maxDuration * 1000;

/** Uma etapa que parou o envio, como resposta. */
const responder = (r: Recusa) => NextResponse.json(r.corpo, { status: r.status });

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ENVIO, ETAPA A ETAPA (fase 5 de `docs/ESTRUTURA-DO-CODIGO.md`)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estas três funções só dizem a ORDEM. Cada etapa vive, com a sua razão por
 * extenso, em `lib/orcamento/envio/`:
 *
 *   1. o corpo do pedido ............ `corpo-do-pedido.ts` (esquema, modo de observar)
 *   2. o trinco ..................... `lib/trinco.ts`
 *   3. o documento e a chave ........ `documento-do-envio.ts`
 *   4. o que trava .................. `travas-do-envio.ts`
 *   5. o desenho, e a 2.ª passagem .. `desenhar-o-pdf.ts`
 *   6. as duas perguntas ............ `perguntas-antes-do-envio.ts`
 *   7. a linha e a versão ........... `a-proposta-que-se-grava.ts`
 *   8. a repetição .................. `repeticao-do-envio.ts`
 *   9. a gravação ................... `gravar-a-proposta.ts`
 *  10. o email ...................... `email-da-proposta.ts`, `mandar-o-email.ts`
 *  11. o que fica depois ............ `depois-do-email.ts`
 *  12. a resposta ................... `resposta-do-envio.ts`
 *
 * A ordem é a regra: recusa-se tudo o que se pode recusar ANTES de desenhar
 * (um PDF de um minuto que não pode seguir é um minuto deitado fora), e
 * pergunta-se ANTES de gravar e de mandar (é o último instante em que voltar
 * atrás não custa nada). O retrato de cada resposta está preso em
 * `route.caracterizacao.test.ts`.
 */
async function POST_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const chegou = Date.now();
  const resta = () => ORCAMENTO_MS - (Date.now() - chegou);
  /** O trinco do envio. Solta-se no `finally`, aconteça o que acontecer. */
  const trinco: { fechado: Trinco | null } = { fechado: null };
  try {
    return await atenderOPedido(request, id, resta, trinco);
  } catch (err) {
    log.error("proposta-doc POST falhou", err);
    // Rota só para administradores autenticados — incluir o motivo real ajuda a
    // equipa (e o suporte) a perceber a causa em vez de um erro genérico opaco.
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Erro ao gerar a proposta: ${detail || "desconhecido"}` },
      { status: 500 },
    );
  } finally {
    if (trinco.fechado?.ok) await trinco.fechado.soltar();
  }
}

/** Da chegada ao PDF desenhado: tudo o que se recusa, recusa-se aqui. */
async function atenderOPedido(
  request: NextRequest,
  id: string,
  resta: () => number,
  trinco: { fechado: Trinco | null },
) {
  const quote = await getQuote(id);
  if (!quote) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }
  const pedido = await lerOPedido(request, id);

  /**
   * ── DOIS ENVIOS EM VOO AO MESMO TEMPO (auditoria de 13/11, n.º 3) ───────
   *
   * A trava de repetição olha para o que JÁ seguiu. Dois pedidos ao mesmo
   * tempo leem as irmãs antes de qualquer um ter enviado, e nenhum vê o
   * outro: dois emails ao casal. O trinco deixa passar um só por pedido; o
   * segundo ouve que o primeiro ainda está a enviar. Vale o tempo máximo
   * desta função e mais uma margem — se ela morrer a meio, vence.
   */
  if (pedido.modo === "send") {
    trinco.fechado = await fecharTrinco(`envio-da-proposta:${id}`, (maxDuration + 15) * 1000);
    if (!trinco.fechado.ok) {
      return NextResponse.json(
        {
          error:
            "Esta proposta já está a ser enviada (carregou duas vezes, ou noutro separador). Espere uns segundos: se não aparecer como enviada, volte a carregar em enviar.",
          aEnviar: true,
        },
        { status: 409 },
      );
    }
  }

  // O corpo escrito à mão recusa-se por tamanho ANTES de se desenhar o PDF:
  // recusar depois é gastar o desenho por nada. O resto dele (o
  // `{{link_proposta}}`) só se resolve depois de a proposta estar gravada.
  if (excedeOTecto(pedido.corpo)) {
    return NextResponse.json(
      {
        error:
          `O texto do email é demasiado longo (o máximo são ${MAXIMO_CORPO_ESCRITO} caracteres). ` +
          `Encurta-o e volta a enviar — não foi enviado nada.`,
      },
      { status: 400 },
    );
  }
  const incompleta = porQueEstaIncompleta(pedido.doc);
  if (incompleta || !pedido.doc) return NextResponse.json({ error: incompleta }, { status: 400 });
  const idioma = idiomaDoPedido(pedido.idioma, id);
  const { chaveDoQueChegou, doc, grandeDemais } = prepararODocumento(pedido.doc, idioma);
  if (grandeDemais) {
    return NextResponse.json(
      { error: "Proposta demasiado grande para ser guardada." },
      { status: 413 },
    );
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
  if (trava) return responder(trava);

  const desenho = await desenharOPdf({
    id,
    doc,
    idioma,
    modo: pedido.modo,
    rascunho: pedido.rascunho,
    chaveDoQueChegou,
    resta,
  });
  if (pedido.modo === "preview") {
    const { pdf, missingImages, truncations } = desenho.relatorio;
    return new NextResponse(pdf, {
      headers: cabecalhosDaPreVisualizacao({
        idioma,
        rascunho: pedido.rascunho,
        missingImages,
        truncations,
        chaveDoQueChegou,
        pdfDaMemoria: desenho.pdfDaMemoria,
      }),
    });
  }
  return enviarAProposta({ request, id, quote, pedido, doc, idioma, desenho, resta });
}

/** Do PDF desenhado ao email: pergunta, grava, manda, e conta o que fez. */
async function enviarAProposta(e: {
  request: NextRequest;
  id: string;
  quote: Quote;
  pedido: PedidoDeProposta;
  doc: ProposalDoc;
  idioma: IdiomaDaProposta;
  desenho: PdfDesenhado;
  resta: () => number;
}) {
  const { request, id, quote, pedido, doc, idioma, resta } = e;
  const { relatorio, pdfDaMemoria } = e.desenho;
  const { pdf: pdfBuffer, missingImages, truncations } = relatorio;
  const pergunta =
    perguntaDasFotos(id, missingImages, pedido.fotosEmFaltaConfirmadas) ??
    perguntaDosCortes(id, truncations, pedido.cortesConfirmados);
  if (pergunta) return responder(pergunta);
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
  const proposal: Proposal = montarAProposta({
    id,
    quote,
    doc,
    idioma,
    money,
    // Honra a data que `prepararODocumento` escreveu no doc — o /proposta
    // recusa aceitar uma proposta expirada.
    validUntil: resolveValidUntil(doc),
    pdf: pdfBuffer,
    porEnviar,
  });
  const irmasAnteriores = carimbarAVersao(proposal, irmas);
  const repetido = await repeticaoDoEnvio({
    id,
    proposal,
    irmasAnteriores,
    pedeEmail: pedido.porEmail,
    relatorio,
    pdfBytes: pdfBuffer.byteLength,
  });
  if (repetido) return NextResponse.json(repetido);

  const gravada = await gravarAProposta(id, proposal, porEnviar);
  if (!gravada.ok) return responder(gravada.recusa);

  const acceptUrl = await enderecoDaProposta(proposal.id, id);
  const escrito = await escreverOEmail({
    id,
    quote,
    doc,
    idioma,
    mensagem: pedido.mensagem,
    corpoCru: pedido.corpo,
    assuntoCru: pedido.assunto,
    acceptUrl,
    money,
    assinatura: assinaturaDeQuemEnvia(request),
  });
  /* ── A CAPA FABRICADA ENQUANTO O CORREIO SAI ──────────────────────────
     «Esta foto demora imenso tempo a carregar.» A derivada de 1200 px da capa
     era fabricada pela primeira visita — que numa proposta acabada de enviar é
     a do casal a abrir o email, com um `sharp` a acontecer enquanto eles olham
     para um rectângulo vazio. Começa AQUI e é esperada depois do `sendMail`:
     corre em paralelo com a ida ao servidor de correio. O `.catch` é
     obrigatório — uma promessa rejeitada sem tratamento no intervalo
     derrubaria o processo. */
  const capaAQuecer = aquecerDerivadasDaCapa(doc.coverImages ?? []).catch(() => 0);
  const desfecho = await mandarOEmail({
    id,
    propostaId: proposal.id,
    para: quote.email,
    querEmail: pedido.porEmail,
    escrito,
    pdf: pdfBuffer,
    resta,
  });
  // A capa, se ainda não estava pronta. Nunca lança e tem tecto próprio: se
  // passou dele, fica para a visita, como era antes.
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
    pdf: pdfBuffer,
  });
  aquecerAPropostaWeb(proposal.id);

  return NextResponse.json(
    respostaDoEnvio({
      propostaId: proposal.id,
      acceptUrl,
      desfecho,
      depois,
      gravada,
      relatorio,
      pdfDaMemoria,
    }),
  );
}

/**
 * A proposta online fica pronta já, depois da resposta: o primeiro clique
 * do casal no email não espera pelo motor (`proposta-web/guardado.ts`).
 * Nunca pode estragar um envio: se não houver onde o deixar a correr, a
 * primeira visita faz o trabalho, como antes.
 */
function aquecerAPropostaWeb(propostaId: string): void {
  try {
    after(async () => {
      try {
        const { aquecerPropostaWeb } = await import("@/lib/proposta-web/modelo");
        await aquecerPropostaWeb(propostaId);
      } catch (e) {
        log.warn("proposta-doc: a página online não ficou preparada", { erro: String(e) });
      }
    });
  } catch {
    /* sem contexto de pedido: fica para a primeira visita */
  }
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const GET = comCpu("proposta-doc GET", GET_semMedida);
export const POST = comCpu("proposta-doc POST", POST_semMedida);
