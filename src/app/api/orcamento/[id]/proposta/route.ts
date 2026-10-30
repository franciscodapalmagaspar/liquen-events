import { NextRequest, NextResponse } from "next/server";
import { porqueOEmailNaoSegue } from "@/lib/email-do-cliente";
import { randomUUID } from "node:crypto";
import type { Proposal } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { transicaoDoPedido } from "@/lib/orcamento/estado-do-pedido";
import { getQuote, updateQuoteWith } from "@/lib/quotes-store";
import { createProposal, updateProposal, listProposalsForQuote } from "@/lib/proposals-store";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { emailAoCliente } from "@/lib/email-assinatura";
import { assinaturaDeQuemEnvia } from "@/lib/email-quem-assina";
import { marcadoresDoPedido, modeloParaEnvioAutomatico, textoDoCorpo } from "@/lib/email-modelos";
import { arrumarLigacao, ROTULO_DA_PROPOSTA } from "@/lib/email-ligacoes";
import { corpoEscritoAMao, excedeOTecto, MAXIMO_CORPO_ESCRITO } from "@/lib/email-corpo-escrito";
import { enderecoDaProposta } from "@/lib/proposta-link-curto";
import { isAuthed } from "@/lib/admin-auth";
import { proposalCreateSchema, firstError, dataIso } from "@/lib/validation";
import { log } from "@/lib/logger";
/**
 * O MESMO NÚMERO NO EMAIL E NO PDF QUE ELE LEVA EM ANEXO — e dois formatadores.
 *
 * Aqui vivia uma QUARTA cópia do `Intl` de pt-PT, escrita à mão nesta rota — e
 * com ela o email dizia «7890,00 €» enquanto o PDF anexo, gerado no mesmo POST,
 * dizia «7.890,00 €»: o `Intl` só agrupa milhares a partir de cinco dígitos, e
 * agrupa-os com espaço inquebrável em vez do ponto português. Dois números para
 * o mesmo valor, a um clique de distância um do outro.
 *
 * O `eurDocumento` é o formatador de tudo o que sai para o CLIENTE; o porquê
 * inteiro está no `money.ts`. O `eur` fica na linha do HISTÓRICO, que só é lida
 * no painel — mudá-la aqui deixava-a a discordar das linhas que as rotas irmãs
 * escrevem para o mesmo pedido.
 */
import { eur, eurDocumento, round2 } from "@/lib/money";
import { FUSO_DO_ESTUDIO } from "@/lib/fuso";

export const runtime = "nodejs";
/** O POST desenha o PDF da proposta e ainda fala com o SMTP com o anexo
 *  colado; os 10 s por omissão do alojamento matavam a função a meio do envio
 *  e o estúdio ficava sem saber se a proposta chegou ao casal. */
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  return isAuthed(request);
}

// List existing proposals for a quote (admin)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const proposals = await listProposalsForQuote(id);
    return NextResponse.json(proposals);
  } catch (err) {
    log.error("proposta GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// Create + send a proposal as a PDF emailed to the client
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = proposalCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    /**
     * O corpo escrito por quem envia. Lê-se do corpo CRU do pedido e não do
     * `parsed.data`: o esquema de validação é partilhado com quem só grava
     * propostas, e este campo diz respeito ao email, não à proposta.
     *
     * O tecto verifica-se AQUI, antes de se desenhar o PDF: recusar depois de
     * gastar o desenho é gastar por nada, e a recusa é a mesma.
     */
    const corpoCru = (body as { corpo?: unknown } | null)?.corpo;
    if (excedeOTecto(corpoCru)) {
      return NextResponse.json(
        {
          error:
            `O texto do email é demasiado longo (o máximo são ${MAXIMO_CORPO_ESCRITO} caracteres). ` +
            `Encurta-o e volta a enviar — não foi enviado nada.`,
        },
        { status: 400 },
      );
    }

    const lineItems = parsed.data.lineItems.filter((it) => it.description && it.qty > 0);

    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: "A proposta precisa de pelo menos uma linha válida." },
        { status: 400 },
      );
    }

    /**
     * O domínio do email do cliente tem de receber correio (pedido dela,
     * 30/10: «não deixe enviar emails que não existem»). Recusa-se ANTES de
     * gravar e de mandar seja o que for — ver `email-do-cliente.ts`.
     */
    const semDominio = await porqueOEmailNaoSegue(quote.email);
    if (semDominio) {
      return NextResponse.json({ error: semDominio, campo: "email" }, { status: 422 });
    }

    const vatRate = parsed.data.vatRate ?? 0.23;
    /**
     * ══════════════════════════════════════════════════════════════════════
     * AS TRÊS LINHAS DE UMA FOLHA DE DINHEIRO TÊM DE FECHAR
     * ══════════════════════════════════════════════════════════════════════
     *
     * Isto era `subtotal * vatRate` e `subtotal + vat`, sem arredondar nenhum
     * dos três. Cada parcela era arredondada só na altura de a DESENHAR, e a
     * conta nunca. Uma linha de 36,50 € imprimia, no PDF que segue em anexo
     * (`proposal-pdf.ts` desenha as três a partir destes campos):
     *
     *     Subtotal   36,50 €      IVA (23%)   8,40 €      TOTAL   44,89 €
     *
     * 36,50 + 8,40 = 44,90. O IVA real é 8,395 (arredonda para cima ao mostrar)
     * e o total real 44,895, que em vírgula flutuante é 44,89499999… e arredonda
     * para BAIXO. Falham assim todos os subtotais terminados em ,50 com dezena
     * ímpar de euros, e mais casos — 36,50 · 85,50 · 158,50 · 183,50 · 279,50…
     * O corpo do email imprime só o total, e por isso saía sozinho e errado.
     * Estes três campos são também os que ficam GRAVADOS na proposta.
     *
     * A regra da casa está escrita em `pricing.ts` desde que este mesmo erro foi
     * corrigido lá: «o IVA é 23% DAQUELE número, o que lá está escrito, e não de
     * um número intermédio que ninguém vê». Esta rota tinha ficado de fora.
     */
    const subtotal = round2(lineItems.reduce((s, it) => s + it.qty * it.unitPrice, 0));
    const vat = round2(subtotal * vatRate);
    const total = round2(subtotal + vat);

    /**
     * ══════════════════════════════════════════════════════════════════════
     * UM REENVIO REAPROVEITA A PROPOSTA POR ENVIAR — NÃO CRIA OUTRA
     * ══════════════════════════════════════════════════════════════════════
     *
     * Esta rota criava sempre `randomUUID()`. A irmã do estúdio já não fazia
     * isso, e a razão está escrita lá: uma proposta que ficou gravada mas cujo
     * email não saiu tem de ser REAPROVEITADA no reenvio, senão cada tentativa
     * deixa uma linha nova para o mesmo negócio.
     *
     * O que isso custava aqui, e não é só ruído no ecrã «Propostas»: o
     * `getProposalByQuote` devolve A MAIS RECENTE, portanto um rascunho
     * falhado do construtor, criado depois da proposta que o casal recebeu,
     * passava a ser o documento oficial do pedido — é dele que o portal do
     * casal mostra o total, e é dele que o contrato congela o selo e a versão.
     * O documento errado a servir de prova.
     *
     * E a própria mensagem de erro desta rota já PROMETIA este comportamento:
     * «Reenvia daqui a pouco: é a mesma proposta, não se cria outra.» Passa a
     * ser verdade.
     *
     * Melhor esforço declarado: se a leitura das irmãs falhar, cria-se uma
     * proposta nova — que é exactamente o que a rota fazia antes — em vez de
     * travar um envio por causa de uma consulta.
     */
    let porEnviar: Proposal | null = null;
    try {
      porEnviar =
        (await listProposalsForQuote(id))
          .filter((p) => p.status === "rascunho")
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0] ?? null;
    } catch (e) {
      log.warn("proposta: não deu para procurar uma proposta por enviar", { id, erro: e });
    }

    const proposal: Proposal = {
      id: porEnviar?.id ?? randomUUID(),
      quoteId: id,
      clientName: quote.name,
      clientEmail: quote.email,
      currency: "EUR",
      lineItems,
      vatRate,
      subtotal,
      vat,
      total,
      // Passa pelo `dataIso` mesmo já tendo passado pelo esquema: esta data é
      // lida em TRÊS sítios (o HTML, o texto simples e o PDF anexo), todos com
      // `new Date(... + "T12:00:00")`, e o que ali não é uma data imprime
      // «Válida até Invalid Date» ao cliente. Uma proposta sem validade é uma
      // proposta sem prazo; uma proposta com uma validade ilegível é um erro
      // nosso na mão dele.
      validUntil: dataIso(parsed.data.validUntil) || undefined,
      notes: parsed.data.notes || undefined,
      /**
       * ══════════════════════════════════════════════════════════════════════
       * «ENVIADA» É UM FACTO, E AINDA NÃO ACONTECEU AQUI
       * ══════════════════════════════════════════════════════════════════════
       *
       * Dizia `status: "enviada"` com `sentAt` a acompanhar — as duas coisas
       * escritas ANTES de se falar com o servidor de correio, e nenhuma delas
       * desfeita quando ele não aceitava a mensagem. Com o SMTP em baixo, ou um
       * pedido sem email (o caso que está contado mais abaixo), ficava gravada
       * uma proposta «Enviada, à espera de resposta» que nunca saiu de casa: o
       * quadro «Propostas» mostrava-a à espera, o Acompanhamento contava-lhe os
       * dias, e a resposta não podia chegar.
       *
       * Nasce por enviar; sobe a «enviada» a seguir ao envio, e só se ele
       * correr bem. É a mesma correcção, com a mesma razão, da rota do estúdio
       * (`proposta-doc`) — que é onde vive o botão que ela usa todos os dias, e
       * onde está também o reaproveitamento da proposta por enviar no reenvio.
       */
      status: "rascunho",
      // A data de nascimento é a da PRIMEIRA tentativa: é ela que ordena as
      // propostas do pedido, e reescrevê-la a cada reenvio fazia a linha
      // reaproveitada saltar para a frente de propostas mais recentes.
      createdAt: porEnviar?.createdAt ?? new Date().toISOString(),
    };

    // Event metadata for the PDF header
    const eventType =
      quote.category && quote.eventType
        ? (EVENT_TYPES_BY_CATEGORY[quote.category]?.find((e) => e.id === quote.eventType)?.label ??
          CATEGORIES.find((c) => c.id === quote.category)?.label)
        : CATEGORIES.find((c) => c.id === quote.category)?.label;

    // Lazy-load pdf-lib (large) only when actually rendering a PDF: this route's
    // GET handler lists proposals and never renders one, so the top-level import
    // was dragging pdf-lib into every cold start of the admin polling the list.
    const { renderProposalPdf } = await import("@/lib/proposal-pdf");
    const pdfBytes = await renderProposalPdf(proposal, {
      eventType,
      date: quote.date,
      guests: quote.guests,
      location: quote.location,
    });
    const pdfBuffer = Buffer.from(pdfBytes);

    // O endereço por onde o casal aceita ou recusa. Curto quando o
    // armazenamento responde, token assinado quando não responde — as duas
    // portas abrem a mesma sala e expiram no mesmo instante.
    const acceptUrl = await enderecoDaProposta(proposal.id, id);

    // Email the client with the PDF attached. Só o corpo se escreve aqui — a
    // moldura, a assinatura e os anexos da marca vêm do `email-assinatura`,
    // que é a mesma assinatura de todo o correio que sai para um cliente.
    //
    // A alternativa em TEXTO simples (`texto`) anda sempre com o HTML: um
    // multipart/alternative passa melhor pelos filtros de spam e é o que se lê
    // num cliente só de texto ou num leitor de ecrã. Valores em bruto (sem
    // `esc`): escapar é uma preocupação de HTML; o texto leva-os tal e qual.
    /**
     * A saudação é pelo PRIMEIRO nome. O `quote.name` é o que a pessoa escreveu
     * no formulário, e há quem lá ponha o nome legal inteiro — saiu mesmo assim
     * noutro email da casa, «Olá Francisco Maria Carrelhas Das Neves Da Palma
     * Gaspar,», que ninguém escreveria a falar com um cliente.
     *
     * É a mesma forma que o mensageiro já usa.
     */
    const primeiroNome = String(quote.name ?? "")
      .trim()
      .split(/\s+/)[0];

    /**
     * ══════════════════════════════════════════════════════════════════════
     * O MODELO DELA, E O TEXTO DA CASA COMO RECURSO
     * ══════════════════════════════════════════════════════════════════════
     *
     * O ecrã «Modelos de email» prometia, por baixo do «Proposta enviada»,
     * «Enviado ao cliente quando a proposta segue». Era falso: o
     * `renderTemplate` não tinha um único chamador de produção e o que saía
     * era o HTML que está aqui em baixo. Passa a ser verdade.
     *
     * ── O RECURSO NÃO É ZELO ──────────────────────────────────────────────
     *
     * `modeloParaEnvioAutomatico` devolve `null` — e regista porquê — sempre
     * que o modelo guardado não sirva: não existe, está vazio, ou cita um
     * marcador que este pedido não sabe preencher. Aí sai o texto de sempre,
     * que não tem marcadores nenhuns e por isso nunca tem buracos. Um email
     * em branco, ou com «no » a meio de uma frase, é pior do que não ter
     * modelo nenhum — e não há aqui ninguém para ler um erro e corrigir.
     *
     * Note-se que o `null` é também o estado de quem NUNCA abriu o ecrã: a
     * semente que ele mostra é um exemplo, não uma decisão dela, e adoptá-la
     * calava o VALOR TOTAL e a VALIDADE que este texto diz. Nada muda até ela
     * guardar; a partir daí é o dela que sai.
     */
    const doModelo = await modeloParaEnvioAutomatico(
      "proposta-enviada",
      marcadoresDoPedido(quote, { link: acceptUrl, valor: eurDocumento(total) }),
    );

    /**
     * Quem assina este email é quem carregou no botão, não a casa — e o nome
     * do casal vai junto só para a protecção: nenhum email pode sair assinado
     * com o nome de quem o vai ler (ver `email-assinatura.ts`).
     */
    const quem = { ...assinaturaDeQuemEnvia(request), destinatario: quote.name };

    /**
     * O corpo dela, com o endereço arrumado: o token gigante fica no `href` e o
     * que se lê é uma frase. O porquê inteiro (e porque é que isto acontece no
     * envio e não no modelo guardado) está no `email-ligacoes.ts`.
     *
     * O texto simples volta a derivar-se do HTML JÁ arrumado, e não do que o
     * modelo trazia: as duas alternativas de um email têm de dizer o mesmo, e
     * uma que ainda mostrasse o endereço nu enquanto a outra mostra a frase era
     * a divergência que os filtros de spam medem.
     */
    /**
     * ══════════════════════════════════════════════════════════════════════
     * O CORPO ESCRITO À MÃO GANHA A TUDO — E A SUA AUSÊNCIA NÃO MUDA NADA
     * ══════════════════════════════════════════════════════════════════════
     *
     * O modelo passa a ser o PONTO DE PARTIDA e não a palavra final: quem envia
     * pode reescrever o corpo antes de carregar em Enviar, e é esse que sai. O
     * tratamento (escape, tecto, parágrafos) está todo no `email-corpo-escrito`
     * — é texto de uma caixa, não é marcação, e a razão está escrita lá.
     *
     * SEM `corpo` no pedido — que é todo o correio que hoje sai daqui — nada
     * disto acontece e o email é byte a byte o que era: o modelo dela, ou o
     * texto da casa. Uma rota que passasse a EXIGIR o corpo de fora partia tudo
     * o que já a chama.
     *
     * O ASSUNTO não se toca: continua a ser o do modelo dela quando é o modelo
     * que manda o assunto, e o da casa quando não é. Aqui reescreve-se o corpo,
     * não o email inteiro.
     *
     * E a moldura continua a fechar sempre no `emailAoCliente`: o corpo é o que
     * vem de fora, a assinatura é da casa e entra uma só vez — incluindo a
     * protecção que impede um email de sair assinado com o nome de quem o vai
     * ler, que é exactamente o caso de quem escreve à pressa.
     */
    const escrito = corpoEscritoAMao(corpoCru);

    const corpoDoModelo =
      doModelo && arrumarLigacao(doModelo.html, { url: acceptUrl, rotulo: ROTULO_DA_PROPOSTA });

    /**
     * «17 de outubro de 2026», nunca «17/10/2026».
     *
     * O `toLocaleDateString` sem opções dá o formato CURTO, e o curto em
     * Portugal é com barras. Uma data com barras é a data de um recibo, e este
     * é o email que acompanha uma proposta de casamento. (O PDF não é tocado —
     * decisão dela; isto é o email.)
     */
    const porExtenso = (iso: string) =>
      new Date(`${iso}T12:00:00`).toLocaleDateString("pt-PT", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: FUSO_DO_ESTUDIO,
      });

    const email = escrito
      ? emailAoCliente({ html: escrito.html, texto: escrito.texto, quem })
      : corpoDoModelo
        ? emailAoCliente({ html: corpoDoModelo, texto: textoDoCorpo(corpoDoModelo), quem })
        : emailAoCliente({
            quem,
            html: `<h2 style="font-size:18px;margin:0 0 12px">A vossa proposta — Líquen Events</h2>
      <p style="font-size:14px;line-height:1.6;color:#333">Olá ${esc(primeiroNome)},</p>
      <p style="font-size:14px;line-height:1.6;color:#333">
        Obrigado pelo vosso interesse. Segue em anexo a proposta que preparámos para o vosso dia,
        no valor total de <strong style="color:#7c854b">${eurDocumento(total)}</strong> (IVA incluído).
      </p>
      ${proposal.validUntil ? `<p style="font-size:13px;color:#777">Válida até ${esc(porExtenso(proposal.validUntil))}.</p>` : ""}
      <p style="margin:24px 0">
        <a href="${acceptUrl}" style="display:inline-block;background:#7c854b;color:#f5f3ee;text-decoration:none;padding:13px 28px;border-radius:4px;font-size:13px;letter-spacing:0.06em">Ver e responder à proposta online →</a>
      </p>
      <p style="font-size:14px;line-height:1.6;color:#333">
        Ficamos ao dispor para qualquer questão ou ajuste. Será um prazer criar este momento convosco.
      </p>`,
            texto: [
              "A vossa proposta — Líquen Events",
              "",
              `Olá ${primeiroNome},`,
              "",
              `Obrigado pelo vosso interesse. Segue em anexo a proposta que preparámos para o vosso dia, no valor total de ${eurDocumento(total)} (IVA incluído).`,
              proposal.validUntil ? `Válida até ${porExtenso(proposal.validUntil)}.` : "",
              "",
              `Ver e responder à proposta online: ${acceptUrl}`,
              "",
              "Ficamos ao dispor para qualquer questão ou ajuste. Será um prazer criar este momento convosco.",
            ]
              .filter((line) => line !== "")
              .join("\n"),
          });

    // Persist the proposal BEFORE emailing. The email carries a signed accept
    // link; sending it before the proposal exists means that link 404s the moment
    // the client clicks "accept". A persistence failure here is fatal — we do not
    // send an un-acceptable proposal.
    try {
      // A mesma linha quando é um reenvio; uma nova quando não é.
      await (porEnviar ? updateProposal(proposal.id, proposal) : createProposal(proposal));
    } catch (e) {
      log.error("guardar proposta falhou", e, { id });
      return NextResponse.json(
        { error: "Não foi possível guardar a proposta. Tenta novamente." },
        { status: 503 },
      );
    }

    /**
     * ══════════════════════════════════════════════════════════════════════
     * SEM EMAIL, O ENVIO CRIAVA PROPOSTAS FANTASMA
     * ══════════════════════════════════════════════════════════════════════
     *
     * Um pedido criado a partir de um telefonema tem `email: ""`. O servidor
     * de correio recusa um destinatário vazio, o envio atirava, e o `catch` de
     * topo devolvia 500 — mas a proposta JÁ TINHA SIDO GRAVADA, com um
     * identificador novo, e o estado do pedido nunca chegava a avançar.
     *
     * Cada nova tentativa gravava MAIS UMA proposta. Três tentativas eram três
     * propostas «enviada» na lista, no Acompanhamento, nas contagens e na
     * Análise — nenhuma delas enviada a ninguém.
     *
     * Agora sem destinatário não se tenta enviar: a proposta fica gravada (o
     * link continua a servir), o estado avança, e a resposta diz que o email
     * não saiu e porquê. Uma proposta por enviar é um negócio parado; três
     * propostas fantasma são um negócio confuso.
     *
     * ── E O MESMO QUANDO É O CORREIO QUE FALHA ────────────────────────────
     *
     * A guarda acima cobria só o endereço VAZIO. Com um endereço bom e o
     * servidor de correio em baixo — uma ligação que expira (o `mail.ts` corta
     * aos 8 s), credenciais recusadas, a caixa do cliente cheia — o `sendMail`
     * ATIRA e a excepção subia ao `catch` do fim: 500 «Erro ao gerar a
     * proposta», com a proposta JÁ gravada e o pedido por avançar. Cada nova
     * tentativa gravava mais uma — exactamente as propostas fantasma que a
     * nota acima descreve, chegadas pela outra porta.
     *
     * A rota irmã (`proposta-doc`, o estúdio) já embrulhava este envio pela
     * mesma razão, com as mesmas palavras. Aqui faltava.
     */
    const temDestinatario = !!quote.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(quote.email);
    let envioFalhou = false;
    const enviar = async () =>
      await sendMail({
        to: quote.email,
        replyTo: MAIL_TO,
        // Sem identificador nenhum. Levava `proposal.id.slice(0, 8)` — oito
        // caracteres do `randomUUID()` da nossa base, que o casal lia como
        // «(3f2b1c9a)» na caixa de correio: não é a referência da casa (essa é
        // a `LIQ-…` que a confirmação lhe mandou guardar), não diz nada a
        // ninguém, e num telemóvel come os caracteres do assunto que ainda se
        // veem. O que junta esta conversa na caixa dele são os cabeçalhos
        // `In-Reply-To`/`References`, nunca o assunto.
        //
        // O assunto vem do MODELO quando é o modelo que sai: o corpo é dela e
        // a linha que o cliente lê antes de abrir também tem de ser — dois
        // assuntos para o mesmo email era o ecrã dos modelos a mentir outra
        // vez, agora só a meio.
        subject: doModelo?.assunto ?? "A vossa proposta — Líquen Events",
        html: email.html,
        text: email.text,
        // O PDF JUNTA-SE aos anexos da assinatura, não os substitui:
        // substituí-los deixava o logótipo de fora e punha uma cruz vermelha
        // no email mais importante que sai daqui.
        attachments: [
          ...email.attachments,
          {
            filename: `Proposta-Liquen-${id}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });

    let mail: { sent: boolean } = { sent: false };
    if (temDestinatario) {
      try {
        mail = await enviar();
      } catch (e) {
        envioFalhou = true;
        log.error("proposta: a proposta ficou gravada mas o email ao cliente falhou", e, { id });
      }
    }

    /**
     * Seguiu: agora sim, «enviada» — com a hora a que saiu.
     *
     * Segunda escrita de propósito, pela razão da primeira: o link assinado vai
     * dentro do email e tem de encontrar a proposta se o casal carregar nele no
     * segundo seguinte. Se esta falhar, a proposta seguiu e fica marcada como
     * por enviar — erro para o lado seguro, mas registado, porque o link do
     * cliente só aceita uma proposta em aberto.
     */
    if (mail.sent) {
      const sentAt = new Date().toISOString();
      try {
        await updateProposal(proposal.id, { status: "enviada", sentAt });
      } catch (e) {
        log.error("proposta: o email saiu mas a proposta ficou por marcar como enviada", e, {
          id,
          proposta: proposal.id,
        });
      }
    }

    // Advance the quote status (best-effort — the proposal is already saved & sent).
    try {
      // `subtotal` (SEM IVA) e não `total`. Ver a nota extensa na rota irmã
      // proposta-doc: o campo chama-se "Preço final (sem IVA)", quem o escreve
      // à mão escreve-o líquido, e o `contractedAmounts` multiplica-o pela taxa
      // para obter o valor com IVA. Gravar aqui o total inflacionava a margem
      // do evento em cerca de 23%.
      //
      // O ESTADO passa pela decisão única (`@/lib/orcamento/estado-do-pedido`)
      // em vez de ser escrito a seco: escrever "cotado" incondicionalmente
      // fazia recuar um pedido já ganho a quem se reenviasse uma proposta
      // revista. O preço grava-se nos dois casos — ver a nota longa na rota
      // irmã, que tem exactamente o mesmo problema e a mesma solução.
      //
      // E, pela mesma razão do estado da proposta, a transição só acontece
      // quando o email SAIU: «Proposta enviada» no Quadro é a mesma afirmação,
      // vista do outro lado. O preço não depende disso.
      await updateQuoteWith(id, (actual) => {
        const transicao = mail.sent
          ? transicaoDoPedido({
              acontecimento: "proposta_enviada",
              estadoActual: actual.status,
              detalhe: eur(total),
            })
          : null;
        return {
          ...actual,
          quotedPrice: subtotal,
          ...(transicao
            ? {
                status: transicao.status,
                activityLog: [...(actual.activityLog ?? []), transicao.entrada],
              }
            : {}),
        };
      });
    } catch (e) {
      log.error("actualizar pedido falhou", e);
    }

    return NextResponse.json({
      ok: true,
      id: proposal.id,
      total,
      emailed: mail.sent,
      ...(!temDestinatario
        ? {
            emailError:
              "Este pedido não tem email de cliente — a proposta foi gravada e o link continua a " +
              "servir, mas não foi enviada a ninguém. Acrescenta o email e reenvia.",
          }
        : envioFalhou
          ? {
              emailError:
                "A proposta foi gravada, mas o servidor de correio não a aceitou — o cliente NÃO " +
                "a recebeu. Reenvia daqui a pouco: é a mesma proposta, não se cria outra.",
            }
          : {}),
      pdfBase64: pdfBuffer.toString("base64"),
    });
  } catch (err) {
    log.error("proposta POST falhou", err);
    return NextResponse.json({ error: "Erro ao gerar a proposta" }, { status: 500 });
  }
}
