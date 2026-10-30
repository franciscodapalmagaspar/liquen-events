import { NextRequest, NextResponse, after } from "next/server";
import { porqueOEmailNaoSegue } from "@/lib/email-do-cliente";
import { createHash, randomUUID } from "node:crypto";
import type { Proposal } from "@/lib/orcamento/types";
import {
  type ProposalDoc,
  withProposalDefaults,
  resolveValidUntil,
  MAX_PROPOSAL_DOC_BYTES,
} from "@/lib/proposal-doc";
import { dinheiroDaProposta } from "@/lib/proposal-budget";
import { oQueFaltaParaEnviar } from "@/lib/proposal-progress";
import { isAuthed } from "@/lib/admin-auth";
import { isMissingTable, nomeDaColunaEmFalta } from "@/lib/repository";
import { avisoDeColunasPerdidas } from "@/lib/estado-das-colunas";
import { transicaoDoPedido } from "@/lib/orcamento/estado-do-pedido";
import { getQuote, updateQuoteWith } from "@/lib/quotes-store";
/** `eur` é o formato do PAINEL (a linha do histórico); `eurDocumento` é o de
 *  tudo o que sai para o cliente — aqui, o `{valor}` que um modelo de email
 *  pode citar. O porquê da separação está no `money.ts`. */
import { eur, eurDocumento } from "@/lib/money";
import { createProposal, updateProposal, listProposalsForQuote } from "@/lib/proposals-store";
import { renderStoredEditorialPdfWithReport } from "@/lib/proposal-doc-render";
import { chaveDoPdf } from "@/lib/proposal-pdf-cache";
import { chaveDaVersao, pdfFinalDaVersao, type RelatorioDoPdf } from "@/lib/proposal-preview-cache";
import { guardarPdfDaProposta } from "@/lib/proposal-pdf-guardado";
import { enderecoDoPdfDaProposta } from "@/lib/proposta-link-curto";
import {
  ehIdiomaDaProposta,
  IDIOMA_POR_OMISSAO,
  type IdiomaDaProposta,
} from "@/lib/proposal-doc-textos";
import { textosDoEmailDaProposta } from "@/lib/email-proposta-textos";
import { enderecoDaProposta } from "@/lib/proposta-link-curto";
import { proximaVersao, seloDoConteudo } from "@/lib/proposta-versao";
import { aquecerDerivadasDaCapa } from "@/lib/derivadas";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { emailAoCliente } from "@/lib/email-assinatura";
import { assinaturaDeQuemEnvia } from "@/lib/email-quem-assina";
import { marcadoresDoPedido, modeloParaEnvioAutomatico, textoDoCorpo } from "@/lib/email-modelos";
import { arrumarLigacao, ROTULO_DA_PROPOSTA } from "@/lib/email-ligacoes";
import {
  assuntoEscritoAMao,
  corpoEscritoAMao,
  excedeOTecto,
  MAXIMO_CORPO_ESCRITO,
  paragrafosDeTexto,
} from "@/lib/email-corpo-escrito";
import { resolverLigacaoDaProposta } from "@/lib/email-ligacao-reservada";
import { listarEnvios, registarEnvio } from "@/lib/envios-de-proposta";
import { log } from "@/lib/logger";
import { eCasamento } from "@/lib/proposal-evento";

/** Os erros do estúdio que a rota também recusa — ver «O QUE TRAVA NO ESTÚDIO». */
const TRAVAM_NO_SERVIDOR: ReadonlySet<string> = new Set([
  "nome",
  "valor",
  "data",
  "validade",
  "email",
  "condicoes",
  // «Ver o PDF primeiro» (14/10): o envio leva a chave do PDF final que ela
  // descarregou e confirmou — ver `chaveDoQueChegou`, mais abaixo.
  "visto",
]);

export const runtime = "nodejs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * GET — O LINK DA PROPOSTA MAIS RECENTE REALMENTE ENVIADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Para o botão «Copiar resumo» do estúdio (ver `ProposalStudio.tsx`): três ou
 * quatro linhas prontas a colar no WhatsApp, com o link de aceitação quando ele
 * existe. O link é um token assinado (HMAC, `proposal-token.ts`) e só se
 * calcula aqui, no servidor — o estúdio não tem o segredo para o construir
 * sozinho, nem devia ter.
 *
 * Só a proposta REALMENTE enviada conta — `sentAt` só fica marcado quando o
 * `sendMail` do POST aqui em baixo confirma que o correio saiu (ver a nota «O
 * ESTADO NASCE "POR ENVIAR"»). Uma proposta gravada mas cujo email falhou não
 * tem, aos olhos do resto do produto, um link que valha a pena dar ao casal —
 * ele nunca chegou a recebê-lo.
 *
 * `acceptUrl: null` quando não há nenhuma — a primeira vez que se abre o
 * estúdio para um pedido novo, por exemplo. O botão sabe ler isso: o resumo
 * sai sem o link em vez de sair com um link partido.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const propostas = await listProposalsForQuote(id);
    const enviadas = propostas.filter((p): p is Proposal & { sentAt: string } => !!p.sentAt);
    // A mais recente pelo momento em que SEGUIU, não pela criação: uma
    // proposta reenviada (o "rascunho" que a nota da gravação reaproveita)
    // pode ter sido criada há dias e enviada agora mesmo.
    enviadas.sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt));
    const ultima = enviadas[0];
    return NextResponse.json({
      ok: true,
      acceptUrl: ultima ? await enderecoDaProposta(ultima.id, id) : null,
    });
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

/**
 * ── O ORÇAMENTO DE TEMPO DESTE PEDIDO (A10-004, A10-005) ──────────────────
 *
 * Tudo isto cabe em {@link maxDuration} segundos — o desenho do PDF (até duas
 * vezes, com fotografias que podem demorar 8 s cada), e depois o email, com
 * tempos de 8/8/20 s no SMTP. Ninguém contava o tempo que já tinha passado: um
 * PDF lento empurrava o SMTP para lá dos 60 s, a plataforma matava a função a
 * meio do envio, e ela via um erro sem saber se o email tinha saído.
 *
 * Duas regras, contadas a partir da chegada do pedido:
 *  · a SEGUNDA tentativa do PDF só corre se ainda houver tempo para ela e para
 *    o email depois dela;
 *  · o email só começa com {@link FOLGA_DO_EMAIL_MS} pela frente. Sem ela, não
 *    se começa: a proposta fica gravada como «gerada, por enviar» e a frase
 *    diz-lhe para carregar outra vez — um reenvio que já não paga o desenho.
 */
const FOLGA_DO_EMAIL_MS = 25_000;
/** O que uma segunda passagem do PDF costuma levar, com folga. */
const FOLGA_DA_SEGUNDA_PASSAGEM_MS = 15_000;
const ORCAMENTO_MS = maxDuration * 1000;

/**
 * O texto que ela escreveu, em HTML que não se parte.
 *
 * Era uma função escrita aqui; mudou-se inteira para o `email-corpo-escrito`,
 * onde tem agora um segundo utilizador (o corpo que quem envia escreve à mão) e
 * onde está a razão por extenso: uma caixa de texto é TEXTO, escapa-se tudo e
 * só depois se lhe acrescenta marcação nossa. Duas cópias do mesmo tratamento
 * eram duas oportunidades para uma delas ficar sem escape.
 */
const paragrafosDaMensagem = paragrafosDeTexto;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const chegou = Date.now();
  const resta = () => ORCAMENTO_MS - (Date.now() - chegou);

  try {
    const quote = await getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as {
      mode?: "preview" | "send";
      doc?: ProposalDoc;
      idioma?: unknown;
      mensagem?: unknown;
      /** O corpo do email reescrito por quem envia — ver a nota mais abaixo.
       *  Ausente em todos os pedidos anteriores a esta caixa existir. */
      corpo?: unknown;
      /** A linha de assunto que o ecrã de envio mostrou. Só conta com `corpo`
       *  — ver o `assuntoEscritoAMao`. */
      assunto?: unknown;
      /** A chave do modelo de que o corpo partiu («registo-formal»), para a
       *  CÓPIA do envio. Não escolhe texto nenhum: o texto é o `corpo`. */
      modelo?: unknown;
      /** «Já vi o que fica cortado, envia à mesma» — ver a pergunta antes do
       *  envio, mais abaixo. Só `true` conta: qualquer outra coisa é «ainda
       *  não respondeu». */
      cortesConfirmados?: unknown;
      /**
       * ── POR ONDE É QUE A PROPOSTA SEGUE ────────────────────────────────
       *
       * «Quero que seja possível escolher enviar apenas para o email, apenas
       * para o WhatsApp, ou para os dois.»
       *
       * Só o EMAIL passa por aqui: o WhatsApp não se manda do servidor — abre-se
       * no telemóvel dela, com a mensagem escrita, e é ela que escolhe a quem.
       * Por isso o servidor tem uma pergunta só: **sai email?**
       *
       * Ausente ou qualquer coisa que não seja `false` significa SIM, e é
       * deliberado: todos os pedidos anteriores a esta escolha existir não
       * trazem o campo, e nenhum deles pode deixar de enviar por causa disso.
       * A escolha nova tem de ser explícita para tirar alguma coisa.
       */
      porEmail?: unknown;
      /** Só na pré-visualização: o PDF sai marcado «RASCUNHO» (B1). */
      rascunho?: unknown;
      /** Só no envio: a chave do PDF final que foi visto e confirmado — a que
       *  a pré-visualização devolveu em `X-Chave-Do-Pdf`. */
      pdfVisto?: unknown;
    } | null;
    const raw = body?.doc;
    const mode = body?.mode === "send" ? "send" : "preview";

    /**
     * A mensagem pessoal do passo «Enviar» do estúdio. OPCIONAL A SÉRIO: vazia,
     * só com espaços, ou de um tipo que não é texto (um cliente avariado), o
     * email sai exactamente como saía antes de esta caixa existir. Um envio
     * nunca pode parar por causa da nota de acompanhamento — ver o cabeçalho
     * deste ficheiro: uma proposta que não segue é um negócio parado.
     */
    const mensagem = typeof body?.mensagem === "string" ? body.mensagem.trim() : "";

    /**
     * ══════════════════════════════════════════════════════════════════════
     * O CORPO ESCRITO À MÃO — O MODELO É O PONTO DE PARTIDA, NÃO A PALAVRA FINAL
     * ══════════════════════════════════════════════════════════════════════
     *
     * Quem envia pode reescrever o corpo do email antes de carregar em Enviar,
     * e é esse que sai. O tratamento — escape, tecto, parágrafos — está todo no
     * `email-corpo-escrito`: é texto de uma caixa, não é marcação, e a razão
     * está escrita lá.
     *
     * SEM `corpo`, nada disto acontece e o email é byte a byte o que era: o
     * texto da casa com a mensagem pessoal dela, ou o modelo, pelas mesmas
     * regras de sempre (a nota longa está mais abaixo). Uma rota que passasse a
     * EXIGIR o corpo de fora partia tudo o que já a chama, a começar pela
     * pré-visualização.
     *
     * Com `corpo`, a MENSAGEM PESSOAL fica de fora do email — e a regra que se
     * segue é a mesma de sempre, só com mais um degrau em cima: ganha a mais
     * específica. Quem está a escrever o corpo inteiro já lá põe a nota pessoal
     * onde quiser; acrescentá-la outra vez a seguir dava-lhe o texto a dobrar.
     * E a MOLDURA continua a fechar sempre no `emailAoCliente`, corpo escrito à
     * mão ou não: a assinatura é da casa e entra uma só vez.
     */
    const corpoCru = body?.corpo;
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
    /**
     * O `corpoEscritoAMao` desceu para depois do `acceptUrl`, e não é arrumação:
     * o corpo que vem do ecrã de envio traz lá dentro o `{{link_proposta}}`, e o
     * endereço que o substitui só existe depois de a proposta estar gravada.
     * Aqui em cima já só fica a recusa por tamanho — que se faz ANTES de se
     * desenhar o PDF, porque recusar depois é gastar o desenho por nada.
     */

    /**
     * ══════════════════════════════════════════════════════════════════════
     * A LÍNGUA É DO DOCUMENTO QUE SEGUE, NÃO SÓ DESTE CLIQUE
     * ══════════════════════════════════════════════════════════════════════
     *
     * O documento guardado (`doc`) continua a ser um só, em português: a língua
     * não entra lá dentro, é a moldura com que ele é DESENHADO — ver o
     * cabeçalho de `proposal-doc-textos`.
     *
     * O que mudou é o que acontece a esta variável a seguir. Era um parâmetro
     * de desenho e mais nada: desenhava o PDF, nomeava o ficheiro e morria no
     * fim do pedido. Com isso, uma proposta gerada em inglês seguia dentro de
     * um email português, abria numa página de aceite na língua do VISITANTE, e
     * voltava a descarregar-se em português — pelo link do casal e pelo portal.
     * Agora, no ENVIO, fica GRAVADA com a proposta (`proposals.idioma`), e é
     * dela que vivem o email daqui a vinte linhas, a página do aceite, o portal
     * e as duas rotas que voltam a desenhar o PDF.
     *
     * Na PRÉ-VISUALIZAÇÃO não se grava nada, porque não há proposta nenhuma:
     * é um PDF para ela ver, e volta a gerar-se daqui a dez segundos.
     *
     * ── PORQUE É QUE UM VALOR ESTRANHO NÃO É UM 400 ───────────────────────
     *
     * Cai em português, que é a mesma escolha que esta rota já faz com o
     * `mode`: o que não se reconhece vale o valor por omissão. As razões, por
     * ordem de peso:
     *
     * · O português é a língua em que a proposta foi ESCRITA. Cair nele é cair
     *   no documento que sempre saiu — nada fica mal traduzido, no máximo fica
     *   por traduzir, e ela vê isso no PDF que abre a seguir.
     * · Recusar transformava um erro de quem chama em «não dá para gerar a
     *   proposta» — exactamente a avaria que o cabeçalho deste ficheiro conta.
     *   Uma moldura em português nunca vale um negócio parado.
     * · Um valor estranho só pode vir de um cliente avariado (o estúdio manda
     *   sempre "pt" ou "en"), e por isso fica REGISTADO: cair calado seria
     *   esconder essa avaria para sempre.
     *
     * Um pedido SEM o campo não é um valor estranho — é o caminho de sempre, e
     * não regista nada.
     */
    if (!raw || !raw.ref || !raw.clientNames) {
      return NextResponse.json({ error: "Proposta incompleta." }, { status: 400 });
    }
    let idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO;
    if (body?.idioma !== undefined) {
      if (ehIdiomaDaProposta(body.idioma)) {
        idioma = body.idioma;
      } else {
        log.warn("proposta-doc: idioma desconhecido, a desenhar em português", {
          id,
          recebido: String(body.idioma),
        });
      }
    }
    /**
     * ── A CHAVE DO QUE FOI VISTO ─────────────────────────────────────────
     *
     * Pedido dela: antes de enviar, alguém tem de VER o PDF final e dizer que
     * está tudo certo. A pré-visualização final devolve esta chave; o envio
     * tem de trazer a mesma. Calcula-se sobre o documento TAL COMO CHEGOU —
     * antes dos textos da casa e da validade que esta rota lhe escreve — e
     * sem as `fotosDeBiblioteca`, que só o envio manda. Mudar uma vírgula
     * depois de ver muda a chave, e o envio é recusado.
     */
    const { fotosDeBiblioteca: _origens, ...semOrigens } = raw;
    const chaveDoQueChegou = chaveDoPdf(semOrigens as ProposalDoc, idioma);

    // Fill the studio's fixed boilerplate (condições, observações, faseamento,
    // cancelamento) + event-token substitution so the UI only sends what varies.
    const doc = withProposalDefaults(raw);

    /**
     * ══════════════════════════════════════════════════════════════════════
     * A VALIDADE CONGELA-SE AQUI, DENTRO DO DOCUMENTO
     * ══════════════════════════════════════════════════════════════════════
     *
     * O estúdio escreve o PRAZO («válida por 60 dias»), não a data. A data era
     * calculada em dois sítios separados — aqui, para a coluna
     * `proposals.valid_until`, e outra vez DENTRO do desenhador
     * (`resolveValidUntil(doc)`, em `proposal-doc-pdf.ts`) — e o desenhador
     * corre outra vez a CADA descarga do PDF pelo link do casal.
     *
     * MEDIDO: proposta enviada a 20-06-2026 grava `valid_until = 2026-08-19`;
     * o mesmo PDF, descarregado pelo link a 20-08-2026, imprime «válida até 19
     * de outubro de 2026». **Mais 61 dias, e mais um por cada dia que passa.**
     * O casal ficava com dois PDF do mesmo documento a dizer coisas
     * diferentes — o anexo do email e o do link —, e a página a marcar
     * «expirada» com um botão ao lado a entregar um PDF que dizia o contrário.
     *
     * A correcção é a mesma que o `kmDeslocacao` já usa e explica: o que é um
     * FACTO deste documento escreve-se DENTRO dele, e a partir daí mudar o
     * relógio deixa de lhe tocar. `resolveValidUntil` honra uma data explícita
     * no `doc`, portanto isto é idempotente: quem redesenhar amanhã, ou daqui
     * a um ano, obtém exactamente a mesma folha.
     *
     * É escrito ANTES de o PDF ser desenhado, de propósito: assim o anexo que
     * segue no email e o documento que fica guardado são o mesmo, por
     * construção, e não por coincidência de terem sido feitos no mesmo minuto.
     */
    doc.validUntil = resolveValidUntil(doc);

    // O documento passou a ser GUARDADO (coluna `proposals.doc`), por isso o
    // tamanho deixou de ser um detalhe do pedido e passou a ser uma linha na
    // base de dados e uma linha na cópia de segurança. Medido: 4,3 KB de texto
    // fixo, 18,5 KB no tecto de 80 fotos — 512 KB é ~28× isso, e é o mesmo teto
    // que o rascunho já recusava. Recusa-se ANTES de desenhar o PDF: um
    // documento absurdo não vale o trabalho de sharp/pdf-lib.
    const docBytes = JSON.stringify(doc).length;
    if (docBytes > MAX_PROPOSAL_DOC_BYTES) {
      return NextResponse.json(
        { error: "Proposta demasiado grande para ser guardada." },
        { status: 413 },
      );
    }

    // Shared pipeline (resolve Storage images → render) — the exact same helper
    // the public portal PDF route uses, so both emit an identical document.
    // É o desenho NOVO (`pdf-editorial`): ela aprovou-o — «Sim, passa a enviar
    // o novo». O gerador antigo fica no código, sem uso nas rotas.
    /**
     * ══════════════════════════════════════════════════════════════════════
     * O QUE TRAVA NO ESTÚDIO TAMBÉM TRAVA AQUI (B1)
     * ══════════════════════════════════════════════════════════════════════
     *
     * «Já saiu um PDF sem orçamento e sem condições, e nada no ecrã o
     * impediu.» O estúdio passou a desligar o botão — mas o botão é uma porta
     * do lado de lá, e um estúdio antigo aberto noutra aba, ou um pedido feito
     * à mão, passava por cima. A regra é a MESMA (`oQueFaltaParaEnviar`), e
     * aqui confere-se o que o documento dela listou como erro: o valor, as
     * condições, a data, os nomes, a validade e o email.
     *
     * Os outros bloqueios do estúdio (serviços, marcadores, traduções…)
     * continuam a ser do estúdio: dependem do que só a aba sabe, ou já têm
     * guarda própria mais abaixo, e duplicá-los aqui seria uma segunda regra a
     * poder discordar da primeira.
     *
     * Recusa ANTES de desenhar: um PDF de um minuto que não pode seguir é um
     * minuto deitado fora.
     */
    if (mode === "send") {
      const travam = oQueFaltaParaEnviar(doc, dinheiroDaProposta(doc).gross, {
        idioma,
        canal: body?.porEmail === false ? "whatsapp" : "email",
        emailDoCliente: quote.email,
        pdfVisto: typeof body?.pdfVisto === "string" && body.pdfVisto === chaveDoQueChegou,
      }).filter((f) => f.trava && TRAVAM_NO_SERVIDOR.has(f.id));
      if (travam.length > 0) {
        log.warn("proposta-doc: envio recusado, a proposta tem erros", {
          id,
          erros: travam.map((f) => f.id),
        });
        return NextResponse.json(
          {
            error: `A proposta não pode seguir: ${travam.map((f) => f.texto.toLowerCase()).join("; ")}.`,
            faltas: travam,
          },
          { status: 422 },
        );
      }
      /**
       * O domínio do email do cliente tem de receber correio (pedido dela,
       * 30/10: «não deixe enviar emails que não existem»). Recusa-se ANTES de
       * gravar e de mandar seja o que for — ver `email-do-cliente.ts`.
       */
      if (body?.porEmail !== false) {
        const semDominio = await porqueOEmailNaoSegue(quote.email);
        if (semDominio) {
          log.warn("proposta-doc: envio recusado, o domínio do email não recebe correio", { id });
          return NextResponse.json({ error: semDominio, campo: "email" }, { status: 422 });
        }
      }
    }

    // O rascunho só existe na pré-visualização: um envio nunca sai marcado.
    const rascunho = mode === "preview" && body?.rascunho === true;
    /**
     * O PDF FINAL de uma versão desenha-se uma vez: o «Descarregar o PDF
     * final», o que o estúdio prepara em segundo plano e o envio a seguir são
     * o mesmo documento, e o segundo e o terceiro saem da memória. O rascunho
     * desenha-se sempre. Ver `proposal-preview-cache.ts`.
     */
    let relatorio: RelatorioDoPdf;
    // Saiu da memória? O estúdio aprende a estimativa da espera com o tempo de
    // cada geração, e um PDF que veio pronto ensinava-lhe que desenhar leva um
    // segundo.
    let pdfDaMemoria = false;
    if (rascunho) {
      relatorio = await renderStoredEditorialPdfWithReport(doc, idioma, { rascunho });
    } else {
      const versao = await pdfFinalDaVersao(chaveDaVersao(chaveDoQueChegou, doc.validUntil), () =>
        renderStoredEditorialPdfWithReport(doc, idioma, { rascunho }),
      );
      relatorio = versao.relatorio;
      pdfDaMemoria = versao.daMemoria;
    }

    /**
     * ════════════════════════════════════════════════════════════════════════
     * SEGUNDA TENTATIVA ANTES DE UMA PROPOSTA SEGUIR COM BURACOS
     * ════════════════════════════════════════════════════════════════════════
     *
     * O envio desenhava o documento UMA vez. Se uma fotografia não resolvesse,
     * o email saía à mesma com uma moldura vazia e o estúdio dizia, depois,
     * «no PDF que seguiu, falta uma foto; verifique e reenvie» — com o casal já
     * com a proposta incompleta na caixa de correio.
     *
     * A causa mais comum de uma foto não resolver é PASSAGEIRA: um pedido ao
     * armazenamento que expirou, uma ligação que caiu a meio de oitenta.
     * Desenhar outra vez apanha esse caso, e não custa nada quando não é esse —
     * o caminho normal é zero em falta e não repete.
     *
     * ── O QUE ISTO NÃO FAZ, E PORQUÊ ─────────────────────────────────────
     *
     * NÃO recusa o envio. A porta do CLIENTE recusa (ver `proposal-pdf-cache`,
     * `PropostaIncompleta`), e aqui está escrito o contrário de propósito, com
     * a razão dela: «recusar seria pior — ela fica sem nada e sem perceber
     * porquê». É uma decisão de produto e não é minha para virar; a repetição
     * melhora-a sem lhe tocar. Se um dia quiser que o envio também trave, é
     * mudar estas linhas e o teste que as guarda.
     *
     * Fica-se com o MELHOR dos dois desenhos: se a segunda tentativa correr
     * pior do que a primeira (o armazenamento a piorar a meio), manda-se a
     * primeira. Repetir nunca pode deixar a proposta pior do que estava.
     *
     * A pré-visualização não repete: é onde ela DESCOBRE o que falta, e é para
     * ser rápida.
     */
    if (
      mode === "send" &&
      relatorio.missingImages > 0 &&
      resta() > FOLGA_DO_EMAIL_MS + FOLGA_DA_SEGUNDA_PASSAGEM_MS
    ) {
      log.warn("proposta-doc: fotos em falta no envio, a desenhar segunda vez", {
        id,
        emFalta: relatorio.missingImages,
      });
      // A segunda tentativa é o MESMO documento na MESMA língua: repetir é para
      // apanhar uma foto que não resolveu, não para mudar o que sai.
      const segunda = await renderStoredEditorialPdfWithReport(doc, idioma);
      if (segunda.missingImages < relatorio.missingImages) relatorio = segunda;
      if (relatorio.missingImages > 0) {
        log.error("proposta-doc: a proposta segue com fotos a menos", null, {
          id,
          emFalta: relatorio.missingImages,
        });
      }
    }

    const { pdf: pdfBuffer, missingImages, truncations } = relatorio;

    if (mode === "preview") {
      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          // O nome do ficheiro segue a língua pedida. Quem descarrega pelo
          // estúdio nem chega a ver este nome (o botão escolhe o seu), mas quem
          // chamar a rota à mão fica com dois PDF distinguíveis na pasta em vez
          // de `proposta-preview (1).pdf`.
          "Content-Disposition": `inline; filename="${
            idioma === "en" ? "proposal-preview" : "proposta-preview"
          }${rascunho ? (idioma === "en" ? "-draft" : "-rascunho") : ""}.pdf"`,
          // Quantas fotos não entraram. O gerador salta a que não resolve, por
          // isso sem este cabeçalho o PDF sai com fotos a menos e o estúdio não
          // tem como saber. É lido em ProposalStudio para avisar antes de enviar.
          "X-Fotos-Em-Falta": String(missingImages),
          // O que o DESENHO deixou de fora (a sétima foto de um mood board, a
          // terceira linha do "Local"…) — a mesma perda, por outro caminho.
          // Vai em base64 porque o corpo desta resposta é o PDF e um cabeçalho
          // HTTP não transporta com segurança os acentos dos nomes dos campos.
          "X-Conteudo-Cortado": Buffer.from(JSON.stringify(truncations), "utf8").toString("base64"),
          // A chave do que se está a ver — só no PDF FINAL. O rascunho não
          // conta como visto: é o PDF que ainda não pode seguir.
          ...(rascunho ? {} : { "X-Chave-Do-Pdf": chaveDoQueChegou }),
          ...(pdfDaMemoria ? { "X-Pdf-Da-Memoria": "1" } : {}),
        },
      });
    }

    /**
     * ══════════════════════════════════════════════════════════════════════
     * O QUE FICOU CORTADO É UMA PERGUNTA ANTES DE SEGUIR, NÃO UM AVISO DEPOIS
     * ══════════════════════════════════════════════════════════════════════
     *
     * O relatório de truncagens já existia e já viajava — mas no ENVIO chegava
     * ao estúdio DENTRO da resposta, ou seja depois de o email ter saído. Ela
     * lia «o nome do casal não cabe na capa» com o casal já a ter a proposta na
     * caixa de correio, e o nome cortado a acabar num «&» solto.
     *
     * Agora o envio pára aqui e pergunta. O PDF já está desenhado (custou o
     * que custou), a proposta ainda NÃO foi gravada e o email ainda NÃO saiu:
     * é o último instante em que voltar atrás não custa nada a ninguém.
     *
     * ── PORQUE É QUE NÃO RECUSA ──────────────────────────────────────────
     *
     * Porque uma truncagem pode ser deliberada — uma legenda comprida de
     * propósito, um mood board com mais fotos do que a página leva. A regra
     * dela é a de sempre e está escrita duas dezenas de linhas acima: «uma
     * proposta que não sai é pior do que uma proposta com um aviso», e
     * «recusar seria pior — ela fica sem nada e sem perceber porquê». Por isso
     * isto não é uma porta fechada: é uma pergunta com resposta. O estúdio
     * mostra o que ficou de fora e reenvia com `cortesConfirmados`.
     *
     * 409 e não 400: o pedido está bem formado e o servidor fez o trabalho
     * todo — o que falta é uma decisão de quem envia. É o código que o estúdio
     * distingue de uma avaria (ver `porqueFalhouOEnvio`).
     *
     * As FOTOS EM FALTA não passam por aqui, e é de propósito: essas são uma
     * AVARIA (a foto devia estar e não está), já têm segunda tentativa aqui em
     * cima, e a decisão escrita é que o envio não trava por causa delas.
     */
    const cortesConfirmados = body?.cortesConfirmados === true;
    if (mode === "send" && truncations.length > 0 && !cortesConfirmados) {
      log.warn("proposta-doc: envio parado para confirmar o que ficou cortado", {
        id,
        cortado: truncations.map((t) => `${t.where}: -${t.dropped} ${t.unit}`),
      });
      return NextResponse.json(
        {
          error: "O documento sai com conteúdo cortado.",
          // O nome do campo é a pergunta: quem chama esta rota à mão percebe o
          // que lhe falta sem ter de ler o código.
          precisaConfirmarCortes: true,
          truncations,
        },
        { status: 409 },
      );
    }

    // ── Send ──
    // Resolve o total ESTRUTURADO para um bruto (com IVA) coerente. O
    // `total` guardado é sempre o BRUTO, para que splitThirtySeventy(total)
    // devolva o sinal correto e o invoice-pdf (base = amount/(1+IVA)) fique
    // consistente. Se a proposta dizia "+ IVA", o valor é grossed-up aqui.
    // `dinheiroDaProposta` e não `resolveProposalMoney`: quando os valores
    // adicionais somam ao valor escrito, o bruto que fica GRAVADO tem de os
    // trazer. Senão o PDF dizia 3.862,20 € e o sinal continuava a ser calculado
    // sobre 3.690 € — o documento e a cobrança a discordarem em silêncio.
    const money = dinheiroDaProposta(doc);
    // Validade: honra uma data explícita no doc, senão hoje + validUntilDays
    // (30 por omissão) — o /proposta recusa aceitar uma proposta expirada.
    const validUntil = resolveValidUntil(doc);

    /**
     * ══════════════════════════════════════════════════════════════════════
     * REENVIAR NÃO PODE SER GERAR OUTRA
     * ══════════════════════════════════════════════════════════════════════
     *
     * Quando o email não sai (SMTP em baixo, contacto errado), a proposta fica
     * gravada — tem de ficar, ver a nota da gravação aqui em baixo — mas fica
     * POR ENVIAR. Ela corrige o que estava mal e carrega outra vez no mesmo
     * botão: sem isto, cada tentativa gravava MAIS UMA proposta, e três
     * tentativas eram três linhas no quadro «Propostas» para o mesmo casal.
     * É a mesma família das «propostas fantasma» que a rota irmã descreve.
     *
     * Reaproveita-se a mais recente que ainda não foi oferecida a ninguém
     * (`rascunho`) — e só essa. Uma proposta que JÁ seguiu para o casal nunca
     * é reescrita: uma revisão é uma proposta nova, e é disso que dependem o
     * histórico, a análise, e a guarda da proposta mais recente no link do
     * cliente (`/api/proposta`).
     *
     * Uma leitura que falhe não pode travar o envio: cai-se na proposta nova,
     * que é exactamente o que a rota fazia antes.
     */
    let porEnviar: Proposal | null = null;
    /** As outras propostas DESTE pedido: é delas que sai o número da versão. */
    let irmas: Proposal[] = [];
    if (mode === "send") {
      try {
        irmas = await listProposalsForQuote(id);
        porEnviar =
          irmas
            .filter((p) => p.status === "rascunho")
            .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0] ?? null;
      } catch (e) {
        log.warn("proposta-doc: não deu para procurar uma proposta por enviar", { id, erro: e });
      }
    }

    const proposal: Proposal = {
      id: porEnviar?.id ?? randomUUID(),
      quoteId: id,
      clientName: doc.clientNames,
      clientEmail: quote.email,
      currency: "EUR",
      lineItems: [],
      vatRate: money.vatRate,
      subtotal: money.base,
      vat: money.vat,
      total: money.gross,
      validUntil,
      /**
       * ══════════════════════════════════════════════════════════════════════
       * O ESTADO NASCE «POR ENVIAR», E É O CORREIO QUE O FAZ SUBIR
       * ══════════════════════════════════════════════════════════════════════
       *
       * Isto dizia `status: "enviada"` e `sentAt: agora` — escritos ANTES de se
       * tentar enviar seja o que for. Com o SMTP em baixo, o estúdio mostrava um
       * aviso passageiro e o registo ficava com
       * `{"status":"enviada","sentAt":"…"}` para sempre: o quadro «Propostas»
       * mostrava uma proposta «Enviada, à espera de resposta» que nunca saiu de
       * casa, e o Acompanhamento punha-a a contar dias por uma resposta que não
       * podia chegar. Um aviso passa; um estado errado fica.
       *
       * «Enviada» é um FACTO sobre o mundo — o servidor de correio aceitou a
       * mensagem — e só se escreve depois de ele acontecer (mais abaixo, a
       * seguir ao `sendMail`). Até lá a proposta é o que é: um documento gerado,
       * guardado, por enviar. O `rascunho` é o estado que o resto do produto já
       * lê como «nunca foi oferecida a ninguém» — o link do cliente recusa-a
       * (`EM_ABERTO`), a análise não a conta, o Acompanhamento não a persegue.
       *
       * O que NÃO muda: a proposta é gravada na mesma, antes do envio. Ver a
       * nota da gravação, aqui em baixo — é o que impede as propostas fantasma.
       */
      status: "rascunho",
      createdAt: porEnviar?.createdAt ?? new Date().toISOString(),
      doc, // stored with Storage paths so it can be re-opened + edited
      /**
       * ── O SELO DO DOCUMENTO ────────────────────────────────────────────────
       *
       * A impressão digital do PDF que segue AGORA para o casal. Os bytes já
       * estão em memória (foram desenhados dez linhas acima), portanto isto
       * custa um `createHash` sobre um buffer e mais nada — nem um pedido, nem
       * um milissegundo de espera do lado dela.
       *
       * PORQUÊ AQUI E NÃO NO ACEITE: no aceite, desenhar o PDF outra vez seriam
       * segundos (259 ms fixos + ~75 ms por fotografia) na única página onde não
       * se pode fazer o casal esperar — a do «sim». E seria um documento
       * RECONSTRUÍDO, não o que eles viram. Aqui é o próprio.
       *
       * O que isto passa a permitir: numa discussão do género «o arco não
       * estava incluído», comparar o PDF que ela tem com o que foi aceite é
       * `sha256sum` contra o valor guardado no contrato. Sem isto, o `doc` é
       * reconstruído e qualquer mudança no código do desenho — uma fonte, uma
       * margem, uma fotografia entretanto substituída — dá um ficheiro
       * diferente, sem forma de saber se o conteúdo mudou ou só o desenho.
       */
      pdfSha256: createHash("sha256").update(pdfBuffer).digest("hex"),
      pdfBytes: pdfBuffer.byteLength,
      /**
       * ── A LÍNGUA EM QUE ESTE PDF FOI DESENHADO ────────────────────────────
       *
       * Gravada SEMPRE, mesmo quando é o português: é um facto sobre o
       * documento que acabou de ser selado na linha de cima — foi desenhado com
       * esta moldura, e é esta que tem de voltar quando alguém o pedir outra
       * vez. Deixá-la em branco no caminho português punha uma proposta nova a
       * ser indistinguível de uma anterior a esta coluna, e obrigava a adivinhar
       * onde não é preciso.
       *
       * É também o que faz o SELO poder ser verificado: quem redesenhar o
       * documento a partir do `doc` tem agora como saber em que língua o fazer,
       * e o `sha256` volta a bater. Enquanto isto não se guardava, um PDF inglês
       * selado no envio nunca mais podia ser reproduzido — quem o redesenhava
       * desenhava-o em português e obtinha outra impressão digital.
       */
      idioma,
    };

    /**
     * ══════════════════════════════════════════════════════════════════════
     * A VERSÃO — CONTA-SE POR PEDIDO, NÃO POR LINHA
     * ══════════════════════════════════════════════════════════════════════
     *
     * Uma revisão nesta casa é uma proposta NOVA (ver o comentário do
     * `porEnviar`, aqui em cima: uma proposta que já seguiu nunca é
     * reescrita). Logo, o número da versão não pode viver na linha — cada
     * linha nasceria na versão 1 e o casal ouviria «versão 1» ao telefone
     * três revisões depois. Conta-se sobre as IRMÃS: o maior número já
     * atribuído neste pedido, mais um.
     *
     * E só sobe quando o CONTEÚDO muda. O selo é o de `proposta-versao.ts` —
     * sobre o que o casal vê, não sobre os bytes do PDF, que mudam sozinhos a
     * cada gravação (medido: a pdf-lib carimba a data lá dentro). Sem essa
     * distinção, carregar duas vezes em enviar inventava uma versão nova.
     *
     * Melhor esforço declarado: se a leitura das irmãs falhou (o `try` acima
     * escreve um aviso), `irmas` fica vazia e esta proposta entra na versão 1.
     * É a única coisa que se pode dizer sem inventar, e não trava o envio.
     */
    const irmasAnteriores = irmas.filter((p) => p.id !== proposal.id);
    const maisRecente =
      irmasAnteriores.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0] ?? null;
    const maiorNumero = irmasAnteriores.reduce(
      (maior, p) =>
        Number.isFinite(p.versaoNumero) ? Math.max(maior, Number(p.versaoNumero)) : maior,
      0,
    );
    const versao = proximaVersao(
      { versaoSelo: maisRecente?.versaoSelo, versaoNumero: maiorNumero },
      seloDoConteudo(proposal),
    );
    proposal.versaoSelo = versao.versaoSelo;
    proposal.versaoNumero = versao.versaoNumero;
    // A data é a do CONTEÚDO, não a da gravação: uma proposta reenviada sem
    // uma vírgula mudada continua a dizer ao casal que foi actualizada no dia
    // em que mudou mesmo.
    proposal.versaoEm = versao.mudou
      ? new Date().toISOString()
      : (maisRecente?.versaoEm ?? new Date().toISOString());

    /**
     * ══════════════════════════════════════════════════════════════════════
     * O MESMO ENVIO DUAS VEZES NÃO SÃO DOIS EMAILS AO CASAL
     * ══════════════════════════════════════════════════════════════════════
     *
     * MEDIDO: dois envios em voo do mesmo documento davam 2 propostas gravadas
     * e 2 emails ao casal — com DOIS links de aceitação diferentes, e duas
     * linhas «versão 1» para o mesmo casamento no quadro.
     *
     * E o caminho provável nem são dois separadores. É este: o `fetch` do
     * envio não tem tecto de tempo próprio, a rede tosse, o ecrã diz «Erro ao
     * enviar a proposta» e repõe o botão — e ela carrega outra vez, enquanto o
     * primeiro pedido continua a correr do lado de cá e acaba por enviar.
     *
     * A trava que existia era o `busy` do estúdio: estado de React, vale só
     * naquele separador, e o `catch` de rede rearma-o. Não chega.
     *
     * A trava daqui é sobre o CONTEÚDO, e é por isso que só agora se pode
     * fazer: o selo de versão diz se este documento é o mesmo que já seguiu.
     * Se já seguiu, com o mesmo selo, há menos de {@link JANELA_DE_REPETICAO_MS},
     * isto é uma repetição — devolve-se o que aconteceu da primeira vez, com o
     * link que o casal recebeu, e NÃO se envia nada.
     *
     * A janela é curta de propósito. Reenviar a mesma proposta é uma coisa
     * legítima e acontece («perdi o email, podes reenviar?»), e três minutos
     * depois volta a ser possível sem nada no caminho. O que a janela apanha é
     * o dedo duas vezes no mesmo botão, que é outra coisa.
     */
    const JANELA_DE_REPETICAO_MS = 3 * 60_000;
    let jaSeguiu = irmasAnteriores.find(
      (p) =>
        p.status === "enviada" &&
        !!p.versaoSelo &&
        p.versaoSelo === proposal.versaoSelo &&
        !!p.sentAt &&
        Date.now() - Date.parse(p.sentAt) < JANELA_DE_REPETICAO_MS,
    );
    /**
     * ── «ENVIADA» JÁ NÃO QUER DIZER SÓ «O EMAIL SAIU» ──────────────────────
     *
     * Desde o achado n.º 4, escolher o WhatsApp também deixa a proposta
     * «enviada» — sem email nenhum. Se ela a marcou pelo WhatsApp e, um minuto
     * depois, decide mandá-la também por email, isto não é uma repetição: o
     * email nunca saiu. Um email que saiu deixa sempre a sua linha no registo
     * de envios; sem essa linha, não houve email a repetir. (Se o registo não
     * responder, fica a trava de sempre: é o lado seguro.)
     */
    const pedeEmail = body?.porEmail !== false;
    if (jaSeguiu && pedeEmail) {
      const alvo = jaSeguiu;
      try {
        const envios = await listarEnvios(id);
        if (!envios.some((e) => e.propostaId === alvo.id)) jaSeguiu = undefined;
      } catch {
        /* sem registo, a trava fica — ver acima */
      }
    }
    /**
     * ══════════════════════════════════════════════════════════════════════
     * A TRAVA TEM DE OLHAR PARA O FACTO DO ENVIO, E NÃO PARA O ESTADO
     * ══════════════════════════════════════════════════════════════════════
     *
     * A trava de cima reconhece uma repetição pelo ESTADO da proposta
     * (`status === "enviada"`) — e o estado é a SEGUNDA escrita depois do
     * `sendMail`. Quando essa segunda escrita falha, o desfecho é este:
     *
     *   1. o email SAI e o casal recebe-o;
     *   2. a proposta fica marcada como «por enviar»;
     *   3. o ecrã diz-lhe, textualmente: «Reenvia-a para acertar o estado (é a
     *      mesma proposta, não se cria outra)»;
     *   4. ela reenvia — e a trava não reconhece nada, porque procura um
     *      `status` que nunca chegou a ser gravado. O `sendMail` corre outra
     *      vez, e o casal recebe DOIS emails com a mesma proposta.
     *
     * Ou seja: a frase que ela lê era a que provocava o defeito.
     *
     * O facto do envio, esse, EXISTE e está gravado uma linha antes da que
     * falhou — o `registarEnvio` escreve `enviadoEm` + `propostaId` em
     * `app_state` ANTES do `updateProposal`. A trava passa a consultá-lo.
     *
     * Melhor esforço declarado: se a leitura dos envios falhar, segue-se sem
     * ela — que é exactamente o que a rota fazia antes. Uma consulta que não
     * responde não pode travar um envio.
     */
    let jaSeguiuPeloRegisto: { enviadoEm: string; propostaId?: string } | undefined;
    if (!jaSeguiu) {
      try {
        jaSeguiuPeloRegisto = (await listarEnvios(id)).find(
          (e) =>
            e.propostaId === proposal.id &&
            !!e.enviadoEm &&
            Date.now() - Date.parse(e.enviadoEm) < JANELA_DE_REPETICAO_MS,
        );
      } catch (e) {
        log.warn("proposta-doc: não deu para ler os envios registados", { id, erro: String(e) });
      }
    }
    if (!jaSeguiu && jaSeguiuPeloRegisto) {
      log.warn(
        "proposta-doc: o email já tinha saído (registo de envios) — não se enviou outra vez",
        {
          id,
          proposta: proposal.id,
        },
      );
      return NextResponse.json({
        ok: true,
        id: proposal.id,
        emailed: true,
        estado: "enviada",
        acceptUrl: await enderecoDaProposta(proposal.id, id),
        missingImages,
        truncations,
        pdfBytes: pdfBuffer.byteLength,
        repetido: true,
        repetidoAviso:
          "O cliente JÁ recebeu esta proposta há instantes — o email saiu, e o que tinha " +
          "falhado foi só a marcação do estado deste lado. Não se enviou outra vez, e o " +
          "link é o mesmo que ele tem.",
      });
    }
    if (jaSeguiu && !pedeEmail) {
      // A mesma proposta marcada duas vezes pelo WhatsApp: não se cria outra,
      // e não se diz que saiu um email que ninguém mandou.
      return NextResponse.json({
        ok: true,
        id: jaSeguiu.id,
        emailed: false,
        semEmailPorEscolha: true,
        estado: "enviada",
        acceptUrl: await enderecoDaProposta(jaSeguiu.id, id),
        missingImages,
        truncations,
        pdfBytes: pdfBuffer.byteLength,
        repetido: true,
        repetidoAviso:
          "Esta proposta já tinha sido marcada como enviada pelo WhatsApp há instantes. " +
          "O link é o mesmo.",
      });
    }
    if (jaSeguiu) {
      log.warn("proposta-doc: envio repetido do mesmo documento — não se enviou outra vez", {
        id,
        proposta: jaSeguiu.id,
      });
      return NextResponse.json({
        ok: true,
        id: jaSeguiu.id,
        emailed: true,
        estado: "enviada",
        /** O link que o casal RECEBEU — não um segundo, que ninguém tem. É
         *  literalmente o mesmo: o código curto de uma proposta é cunhado uma
         *  vez e reaproveitado daí em diante. */
        acceptUrl: await enderecoDaProposta(jaSeguiu.id, id),
        missingImages,
        truncations,
        pdfBytes: pdfBuffer.byteLength,
        /** Para o ecrã poder dizer o que aconteceu em vez de fingir um envio. */
        repetido: true,
        repetidoAviso:
          "Esta proposta já tinha seguido para o cliente há instantes, com este mesmo " +
          "documento. Não foi enviada outra vez — o link é o mesmo que ele recebeu.",
      });
    }

    // A proposta fica guardada COM o documento (`doc`): é a única cópia
    // DURÁVEL do que seguiu para o cliente (o rascunho do estúdio vive em
    // `app_state`, apaga-se e não vai na cópia de segurança), e é dela que sai
    // o botão "ver a proposta em PDF" do link do cliente. `docSaved` diz se
    // isso aconteceu mesmo.
    let docSaved = true;
    let docError: string | undefined;
    /**
     * Gravar ESTA proposta: uma linha nova, ou a que ficou por enviar (acima).
     *
     * ── UMA GRAVAÇÃO QUE NÃO ACONTECEU NÃO PODE PASSAR POR UMA QUE ACONTECEU ─
     *
     * O `updateProposal` devolve `null` — SEM lançar — quando a linha que se ia
     * actualizar já não existe (`repository.updateWith`: «const current = await
     * backend.get(id); if (!current) return null»). O valor de retorno era
     * ignorado, e o desfecho era o pior que esta rota tem:
     *
     *   1. um envio anterior falhou o email e deixou uma proposta em rascunho;
     *   2. essa linha é apagada noutro separador (o quadro «Propostas» deixa,
     *      e não pergunta nada);
     *   3. este pedido, que a leu no princípio, passa 15 a 40 segundos a
     *      desenhar o PDF e só depois tenta gravar;
     *   4. a gravação não faz nada, `docSaved` fica `true`, e o email SEGUE com
     *      um link assinado sobre um id que não existe. O casal abre-o e lê
     *      «proposta não encontrada».
     *
     * A rota irmã tem escrito, em comentário, que isto nunca pode acontecer —
     * «A persistence failure here is fatal — we do not send an un-acceptable
     * proposal» — e a de baixo, 440 linhas à frente, já verifica o retorno.
     * Faltava aqui.
     *
     * E a resposta certa não é recusar o envio: a linha antiga já não existe,
     * portanto não há duplicado nenhum a criar. Cria-se uma. É a correcção que
     * mantém a regra da casa — uma proposta que não sai é um negócio parado.
     */
    const guardar = async (p: Proposal): Promise<void> => {
      if (!porEnviar) {
        await createProposal(p);
        return;
      }
      const gravado = await updateProposal(p.id, p);
      if (gravado) return;
      log.warn("proposta-doc: a proposta por enviar desapareceu a meio — cria-se de novo", {
        id,
        proposta: p.id,
      });
      await createProposal(p);
    };
    /**
     * ════════════════════════════════════════════════════════════════════════
     * UMA COLUNA QUE FALTA NÃO PODE LEVAR AS OUTRAS À FRENTE
     * ════════════════════════════════════════════════════════════════════════
     *
     * O `db/schema.sql` é corrido À MÃO no editor de SQL do Supabase. Numa base
     * onde a versão nova ainda não foi aplicada, as colunas novas não existem e
     * a gravação rebenta. A resposta certa nunca foi recusar o envio — «uma
     * proposta que não sai é um negócio parado» — mas era demasiado bruta:
     * tirava-se TUDO o que fosse recente de uma vez.
     *
     * ── O QUE ISSO CUSTOU, MEDIDO ─────────────────────────────────────────
     *
     * A coluna `proposals.doc` existe naquela base desde 30 de julho. As do
     * selo da versão (`versao_selo`, `versao_numero`, `versao_em`) nasceram a
     * 20 de agosto. No primeiro envio depois disso, a base recusou o
     * `versao_selo` — e o resgate, para salvar três colunas que não existiam,
     * deitou fora a única que existia e a única que o casal vê.
     *
     * O casal recebeu a proposta em anexo, com quinze páginas e mood boards, e
     * o link ao lado abriu uma página com a saudação, o subtotal, o IVA e o
     * total. Nada disto deu erro: a proposta gerou-se, o email saiu, o quadro
     * disse «enviada». A única coisa que dizia o que se tinha perdido era um
     * aviso vermelho no fim do envio, entre outros quatro.
     *
     * ── A REGRA NOVA ──────────────────────────────────────────────────────
     *
     * Tira-se O QUE FALTA, e só isso. O erro nomeia a coluna
     * (`nomeDaColunaEmFalta`); tira-se essa, tenta-se outra vez, e assim por
     * diante até a base aceitar. Uma base a três colunas de distância paga três
     * tentativas — e fica com o documento, que é o que interessa.
     *
     * O tecto de tentativas não é defensivo por hábito: é o que impede um erro
     * que nomeia sempre a mesma coluna (ou uma que não sabemos desmontar) de
     * dar uma volta infinita. Chegando lá, cai-se no resgate largo de antes,
     * que é o comportamento que esta casa já tinha.
     */
    /** Coluna da base → campo do `Proposal` que a escreve. */
    const CAMPO_DA_COLUNA: Readonly<Record<string, keyof Proposal>> = {
      doc: "doc",
      pdf_sha256: "pdfSha256",
      pdf_bytes: "pdfBytes",
      idioma: "idioma",
      versao_selo: "versaoSelo",
      versao_numero: "versaoNumero",
      versao_em: "versaoEm",
    };
    /** Tudo o que se pode tirar, quando não se sabe o que tirar. */
    const TUDO_O_QUE_E_RECENTE: readonly (keyof Proposal)[] = [
      "doc",
      "pdfSha256",
      "pdfBytes",
      "idioma",
      "versaoSelo",
      "versaoNumero",
      "versaoEm",
    ];
    /** As colunas que a base não aceitou — é o que o aviso vai nomear. */
    const colunasPerdidas: string[] = [];

    try {
      let candidata = proposal;
      let guardada = false;
      /** O último erro de coluna em falta, para o poder atirar tal e qual se as
       *  tentativas acabarem — o resgate largo precisa de o reconhecer. */
      let ultimoErro: unknown = null;
      // Sete colunas removíveis: oito voltas chegam para as tirar todas uma a
      // uma e ainda sobra a última tentativa.
      for (let tentativa = 0; tentativa < 8 && !guardada; tentativa += 1) {
        try {
          await guardar(candidata);
          guardada = true;
        } catch (e) {
          if (!isMissingTable(e)) throw e;
          const coluna = nomeDaColunaEmFalta(e);
          const campo = coluna ? CAMPO_DA_COLUNA[coluna] : undefined;
          if (!coluna || !campo) throw e;
          /**
           * PROGRESSO OU NADA FEITO.
           *
           * O erro pode nomear uma coluna que já se tirou — acontece quando o
           * que a base recusa não é a coluna que o erro nomeia (mensagens de
           * driver, erros em cadeia). Sem esta guarda, tirava-se a mesma coluna
           * oito vezes seguidas, sempre com o mesmo resultado, e o envio pagava
           * oito idas à base para acabar no mesmo sítio.
           *
           * Não havendo progresso possível, atira-se o erro ORIGINAL — que é um
           * erro de coluna em falta — para o resgate largo lá fora fazer o que
           * sabe: tirar tudo, gravar o que a base aceitar, e dizer o que se
           * perdeu.
           */
          if (candidata[campo] === undefined) throw e;
          log.warn("proposta-doc: coluna em falta — tira-se só essa e tenta-se de novo", {
            id,
            coluna,
          });
          colunasPerdidas.push(coluna);
          candidata = { ...candidata, [campo]: undefined };
          ultimoErro = e;
        }
      }
      if (!guardada) {
        // O tecto foi ao fundo sem a base aceitar. Não se declara guardada uma
        // coisa que não foi: atira-se o último erro DE COLUNA, para o resgate
        // largo lá fora o reconhecer como tal — um `Error` genérico aqui dava
        // um 503 «tenta outra vez» sobre um problema que tentar não resolve.
        throw ultimoErro ?? new Error("proposta-doc: a base recusou todas as tentativas");
      }
      if (colunasPerdidas.length > 0) {
        log.error(
          "proposta-doc: colunas em falta na tabela `proposals` — proposta guardada sem elas; corra db/schema.sql",
          null,
          { id, colunas: colunasPerdidas },
        );
        docSaved = !colunasPerdidas.includes("doc");
        docError = avisoDeColunasPerdidas(colunasPerdidas);
      }
    } catch (e) {
      if (isMissingTable(e)) {
        /**
         * O RESGATE LARGO, para o caso em que o erro não nomeia a coluna.
         *
         * Acontece com uma tabela inteira em falta e com mensagens que não
         * sabemos desmontar. Aqui não há como escolher o que tirar, portanto
         * tira-se tudo o que possa não existir — a proposta é gravada com o
         * que a base aceitar, o email segue, e o que se perdeu é DITO.
         */
        log.error(
          "proposta-doc: a base recusou os campos novos sem dizer qual — proposta guardada sem eles; corra db/schema.sql",
          e,
          { id },
        );
        try {
          const semNada = { ...proposal };
          for (const campo of TUDO_O_QUE_E_RECENTE) semNada[campo] = undefined as never;
          await guardar(semNada);
          docSaved = false;
          docError = avisoDeColunasPerdidas(Object.keys(CAMPO_DA_COLUNA));
        } catch (e2) {
          log.error("proposta-doc: guardar falhou mesmo sem os campos novos", e2, { id });
          return NextResponse.json(
            {
              error:
                "Não foi possível guardar a proposta — a base de dados recusou a gravação. " +
                "Verifica se o db/schema.sql foi corrido nesta base.",
            },
            { status: 503 },
          );
        }
      } else {
        log.error("proposta-doc: guardar falhou", e, { id });
        return NextResponse.json(
          { error: "Não foi possível guardar a proposta. Tenta novamente." },
          { status: 503 },
        );
      }
    }

    const acceptUrl = await enderecoDaProposta(proposal.id, id);

    /**
     * ══════════════════════════════════════════════════════════════════════
     * O MARCADOR DA LIGAÇÃO, TROCADO PELO ENDEREÇO QUE JÁ EXISTE
     * ══════════════════════════════════════════════════════════════════════
     *
     * O ecrã de envio abre com o corpo já resolvido — o nome do casal, a data, o
     * valor — com uma excepção de facto: a `{{link_proposta}}`. O endereço é
     * assinado sobre o ID DA PROPOSTA, e a proposta nasce aqui, três linhas
     * acima. O porquê inteiro (e as saídas que se recusaram) está no
     * `email-ligacao-reservada.ts`.
     *
     * Isto NÃO é voltar ao interpretador: não se analisa fonte nenhuma nem se lê
     * mapa de valores. Troca-se UM texto que fomos nós que lá pusemos por UM
     * endereço que o servidor acabou de assinar. Um `{{cliente_nome}}` escrito
     * na caixa sai tal e qual, como sairia qualquer outra palavra.
     *
     * A guarda do `typeof` é a de sempre: o `resolverLigacaoDaProposta` faz
     * `String(...)`, e sem ela um `corpo: 42` de um cliente avariado passava a
     * ser o texto «42» — um email com um número por corpo.
     */
    const corpoComLigacao =
      typeof corpoCru === "string" ? resolverLigacaoDaProposta(corpoCru, acceptUrl) : corpoCru;
    const escrito = corpoEscritoAMao(corpoComLigacao);

    /**
     * O assunto que o ecrã mostrou. ANDA COM O CORPO, e é condição e não
     * coincidência: os dois vêm do mesmo rascunho, e um assunto solto era
     * reescrever a linha que o casal lê antes de abrir um email cujo texto
     * ninguém viu. Sem corpo escrito, o assunto continua a ser o do modelo dela
     * (quando é o modelo que sai) ou o da casa, na língua da proposta.
     */
    const assuntoDoEcra = escrito ? assuntoEscritoAMao(body?.assunto) : null;
    // Só o corpo: a moldura, a assinatura da casa e os anexos da marca vêm do
    // `email-assinatura` — o mesmo fecho de todo o correio que sai daqui.
    /**
     * ══════════════════════════════════════════════════════════════════════
     * ONDE ENTRA A MENSAGEM DELA, E PORQUÊ AÍ
     * ══════════════════════════════════════════════════════════════════════
     *
     * Logo a seguir ao «Olá», ANTES da frase da casa e do botão.
     *
     * Quem abre este email é um casal à espera de saber o que a Catarina lhes
     * tem para dizer. O que é dela — «foi um gosto conhecer-vos na quinta», «o
     * arco fica incluído, como combinámos» — é a única parte que não se
     * adivinha; a frase «segue em anexo a proposta» e o botão são a moldura,
     * que se lê em meio segundo e está igual em todos os emails que já
     * receberam. Pôr a nota pessoal depois do botão era pô-la depois do sítio
     * onde muita gente já carregou.
     *
     * Fica DEPOIS do «Olá» e não antes porque o cumprimento é o cumprimento: a
     * mensagem dela é o que se diz ao casal, não o que se diz antes de o
     * saudar.
     *
     * E fica ANTES da assinatura da casa sem que isso se escreva aqui: o
     * `emailAoCliente` fecha sempre no fim. É por isso que a caixa do estúdio
     * diz, ao lado, que ela não precisa de se despedir — o fecho é um só, e é
     * o da casa (ver `email-assinatura.ts` e os modelos do `ClientMessenger`,
     * que se despediam por cima dele).
     */
    /**
     * ══════════════════════════════════════════════════════════════════════
     * O MODELO DELA, E QUANDO É QUE ELE NÃO É USADO
     * ══════════════════════════════════════════════════════════════════════
     *
     * O modelo «proposta-enviada» do ecrã «Modelos de email» passa a ser o
     * corpo deste email — nas DUAS rotas que mandam uma proposta, senão o que
     * o cliente recebe passava a depender do botão em que ela carregou. O
     * recurso é o texto que está aqui em baixo, e a razão inteira está escrita
     * na rota irmã (`orcamento/[id]/proposta`), que é onde o mesmo `null`
     * também significa «sai o texto da casa».
     *
     * ── A MENSAGEM PESSOAL GANHA AO MODELO ────────────────────────────────
     *
     * Quando ela escreve uma mensagem para acompanhar ESTA proposta, o modelo
     * fica de fora. Não é indecisão: o texto da casa foi desenhado à volta
     * dessa mensagem — ela entra logo a seguir ao «Olá» e antes do botão, pela
     * razão que está na nota aqui em cima. O corpo de um modelo é markup
     * opaco; não há onde lá dentro a enfiar sem adivinhar, e despejá-la no fim
     * era pô-la depois do sítio onde muita gente já carregou.
     *
     * Das duas, ganha a mais específica: a mensagem foi escrita há um minuto
     * para este casal; o modelo serve todos. O ecrã dos modelos di-lo.
     *
     * ── E DESDE QUE HÁ UM TERCEIRO ────────────────────────────────────────
     *
     * Esta escolha entre «ou o modelo, ou a mensagem» nasceu de uma limitação
     * que já não é a única saída: o corpo de um modelo é markup opaco e não há
     * onde lá dentro enfiar a mensagem sem adivinhar. Com o CORPO a poder vir
     * escrito à mão (mais acima), quem quiser a nota no meio do texto escreve-a
     * lá, no sítio que quiser, e não fica dependente de nenhuma das duas.
     *
     * Fica na mesma, e não por inércia: é o que acontece a um envio que venha
     * SEM corpo escrito — que é todo o correio que hoje sai, incluindo a
     * pré-visualização e tudo o que já chama esta rota. A regra passa a ter
     * três degraus, e é sempre a mesma regra: ganha a mais específica. Corpo
     * escrito à mão > mensagem pessoal > modelo > texto da casa.
     */
    /**
     * ══════════════════════════════════════════════════════════════════════
     * O MODELO DELA É UM TEXTO PORTUGUÊS — E FICA DE FORA NUMA PROPOSTA INGLESA
     * ══════════════════════════════════════════════════════════════════════
     *
     * O ecrã «Modelos de email» guarda UM «Proposta enviada», escrito por ela,
     * em português. Não há versão inglesa, e não se inventa uma: traduzir à
     * máquina o texto que ela escreveu é exactamente o que esta funcionalidade
     * se recusa a fazer no documento («o que ela escreveu sai tal e qual»), e
     * fazê-lo aqui era pior — chegava ao casal sem ninguém o ter lido.
     *
     * Restavam duas opções, e nenhuma é indolor:
     *
     *   a) MANDAR O MODELO À MESMA. O casal inglês recebe um assunto e um corpo
     *      em português com um PDF inglês em anexo. É o defeito que se está a
     *      corrigir, a entrar pela porta do lado — e é o que ele vê PRIMEIRO,
     *      antes sequer de abrir o documento.
     *   b) NÃO O USAR, e sair o texto da casa em inglês. Ela perde, naquele
     *      email, um texto que escreveu; ganha um email inteiro numa língua só.
     *
     * Escolhida a (b), por ser a que menos surpreende quem RECEBE — e porque a
     * rota já tem este recurso montado e explicado para dois casos vizinhos: um
     * modelo vazio e um modelo com um marcador sem valor caem no texto da casa
     * exactamente da mesma maneira. Isto é um terceiro «não dá para usar este
     * modelo aqui», não um mecanismo novo.
     *
     * Fica REGISTADO, pela mesma razão que os outros dois: ela guardou um
     * modelo e o email que saiu não foi o dela; isso tem de se poder ver.
     *
     * O que NÃO muda: numa proposta portuguesa — que são todas menos as que ela
     * marcar como inglesas — o modelo dela continua a ser o que sai, assunto
     * incluído.
     *
     * O caminho por direito é o ecrã dos modelos ganhar uma versão inglesa de
     * cada modelo. É trabalho de interface e é uma decisão dela; até lá, isto.
     */
    if (idioma !== "pt" && !mensagem && !escrito) {
      log.warn(
        "proposta-doc: proposta noutra língua — o modelo «proposta-enviada» não é consultado, sai o texto da casa",
        { id, idioma },
      );
    }
    const doModelo =
      escrito || mensagem || idioma !== "pt"
        ? null
        : await modeloParaEnvioAutomatico(
            "proposta-enviada",
            marcadoresDoPedido(quote, {
              // Quem este email saúda são os NOMES DO CASAL do documento do
              // estúdio, e não o `quote.name` — que é quem escreveu o pedido e
              // pode ser a mãe da noiva ou uma wedding planner. É a mesma escolha
              // que o texto da casa aqui em baixo já fazia.
              //
              // Fora de um casamento, o cliente é um restaurante ou uma empresa
              // («Tasca do Pão e Vinho» virava «Tasca e Vinho» no `{cliente_nome}`):
              // aí saúda-se a pessoa que escreveu o pedido.
              nome: eCasamento(doc.eventType)
                ? String(doc.clientNames ?? "").trim()
                : String(quote.name ?? "").trim() || String(doc.clientNames ?? "").trim(),
              link: acceptUrl,
              valor: eurDocumento(money.gross),
              ...(String(doc.eventDate ?? "").trim()
                ? { data_evento: String(doc.eventDate).trim() }
                : {}),
              ...(String(doc.location ?? "").trim() ? { local: String(doc.location).trim() } : {}),
            }),
          );

    /**
     * O TEXTO DA CASA, NA LÍNGUA DA PROPOSTA.
     *
     * O desenho do email é UM só — o mesmo título, o mesmo cumprimento, o mesmo
     * botão verde, no mesmo sítio. O que muda são as PALAVRAS, e elas vivem no
     * `email-proposta-textos`. Duplicar o markup por língua era garantir que um
     * dia o botão inglês ficava com outra cor, e ninguém dava por isso porque o
     * email inglês é o que ela não lê.
     *
     * O português é, palavra por palavra, o que sempre saiu daqui.
     */
    const t = textosDoEmailDaProposta(idioma, eCasamento(doc.eventType));
    /**
     * Quem assina é quem carregou em «Enviar», não a casa. O nome que vai para
     * a protecção é o do DOCUMENTO (o casal), que é quem lê este email — e não
     * o `quote.name`, que pode ser a mãe da noiva. Ver `email-assinatura.ts`.
     */
    const quem = {
      ...assinaturaDeQuemEnvia(request),
      destinatario: String(doc.clientNames ?? "").trim() || quote.name,
    };

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
    const corpoDoModelo =
      doModelo && arrumarLigacao(doModelo.html, { url: acceptUrl, rotulo: ROTULO_DA_PROPOSTA });

    /**
     * O nome do ficheiro que fica na pasta de transferências deles — o mesmo
     * que segue no anexo e o mesmo que a cópia do envio guarda. Uma segunda
     * chamada ao `nomeDoAnexo` mais abaixo era uma segunda oportunidade para as
     * duas discordarem, e a cópia passava a falar de um ficheiro que não seguiu.
     */
    const nomeDoAnexo = t.nomeDoAnexo({
      // O nome que ela escreveu, quando escreveu — manda sobre a composição.
      escolhido: doc.nomeDoFicheiro,
      clientNames: doc.clientNames,
      eventDate: doc.eventDate,
      ref: id,
    });

    /**
     * ════════════════════════════════════════════════════════════════════════
     * O PDF TEM DE SE VER NO CORPO, E NÃO SÓ LÁ NO FUNDO
     * ════════════════════════════════════════════════════════════════════════
     *
     * Palavras dela: «dá para colocar o pdf da proposta mais visível no email?».
     *
     * O ficheiro segue em anexo, mas quem manda no sítio onde o anexo aparece é
     * o leitor de correio, não nós: no Gmail do telemóvel dela cai DEPOIS da
     * assinatura, do banner e de tudo — é preciso rolar o email inteiro para o
     * encontrar, e o corpo só o menciona de passagem numa frase.
     *
     * O que se pode pôr onde se vê é um caminho PRÓPRIO para o mesmo documento,
     * dentro do corpo e antes da assinatura. As duas portas abrem com a mesma
     * chave (ver `enderecoDoPdfDaProposta`), portanto não se emite ligação
     * nenhuma nova nem se gere uma segunda validade.
     *
     * Vai nos TRÊS caminhos do envio — o corpo escrito no ecrã, o modelo
     * guardado e o de recurso —, porque o anexo também vai nos três e o defeito
     * não era de nenhum deles em particular.
     *
     * O nome do ficheiro está escrito no cartão de propósito: é assim que o
     * casal reconhece, na caixa de correio, que o anexo lá em baixo e este
     * botão são o mesmo documento.
     */
    const linkDoPdf = enderecoDoPdfDaProposta(acceptUrl);
    /**
     * ── DOIS BOTÕES IGUAIS NÃO SÃO DUAS ACÇÕES ───────────────────────────────
     *
     * «Quero algo mais bonito e minimalista.» Desenhei o cartão sozinho e ficou
     * bem; só ao desenhar o EMAIL INTEIRO é que se viu o problema — e não era o
     * cartão.
     *
     * Eram dois rectângulos verdes do mesmo tamanho, um por cima do outro, a
     * dizer «Ver a proposta →» e «Abrir a proposta →». Fazem coisas diferentes
     * — o primeiro leva à página onde o casal responde, o segundo abre o PDF —
     * e não havia como saber qual era qual sem ler as duas com atenção. Duas
     * coisas com o mesmo peso não são uma hierarquia: são uma escolha que se
     * empurra para quem lê.
     *
     * Um botão cheio, e um link. O botão é o que se quer que aconteça: ir à
     * página, ler, responder. O PDF é o outro caminho para o mesmo documento —
     * continua à vista, no corpo, acima da assinatura, que era toda a razão por
     * que este bloco existe (antes só ia em anexo, e quem arquivasse a mensagem
     * decidia milhares de euros a olhar para um total).
     *
     * ── E CONTINUA A CABER NO POLEGAR ───────────────────────────────────────
     *
     * O link é `inline-block` com 12 px em cima e em baixo: 44 px de alvo,
     * contando a entrelinha de 20. Minimalismo não é encolher o que se toca —
     * era esse o defeito de origem deste bloco, com um botão de 37 px.
     *
     * Em tabelas e estilos em linha, que é o que sobrevive ao Outlook.
     */
    const cartaoDoPdf = `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:32px 0 0;border-collapse:collapse">
          <tr><td style="border-top:1px solid #e6dfd2;padding-top:20px">
            <a href="${linkDoPdf}" style="display:inline-block;padding:12px 0;font-size:16px;line-height:20px;color:#4c6350;text-decoration:underline;text-underline-offset:3px">${esc(t.anexoBotao)}</a>
            <p style="margin:0;font-size:11px;line-height:1.5;color:#a49c8e;word-break:break-word">${esc(nomeDoAnexo)}</p>
          </td></tr>
        </table>`;
    /** O mesmo, para quem lê o email em texto simples. */
    // Em texto simples a seta do botão não diz nada; quem lê assim precisa do
    // NOME da coisa, que é o que a etiqueta é.
    const pdfEmTexto = ["", `${t.anexoEtiqueta}: ${linkDoPdf}`];

    const email = escrito
      ? emailAoCliente({
          /**
           * ════════════════════════════════════════════════════════════════
           * O CORPO ESCRITO NO ECRÃ TAMBÉM PASSA PELA ARRUMAÇÃO DO LINK
           * ════════════════════════════════════════════════════════════════
           *
           * MEDIDO num email real: o endereço da proposta saiu por extenso, com
           * o token inteiro, a ocupar cinco linhas de caracteres aleatórios. É
           * o desenho de uma mensagem de phishing e um dos padrões que os
           * filtros de spam penalizam.
           *
           * A arrumação existia e funcionava — mas só neste ramo é que não era
           * chamada. Dos três caminhos deste envio, o do MODELO passava pelo
           * `arrumarLigacao` (uma linha abaixo) e o de recurso desenha um botão
           * a sério; o corpo escrito no ECRÃ DE ENVIO, que é o que ela usa
           * todos os dias, ia tal e qual.
           *
           * O `resolverLigacaoDaProposta`, que corre antes, troca o marcador
           * pelo endereço verdadeiro — e é por isso que o endereço aqui está nu:
           * o trabalho dele acaba onde o desta função começa.
           */
          html: `${arrumarLigacao(escrito.html, { url: acceptUrl, rotulo: ROTULO_DA_PROPOSTA })}${cartaoDoPdf}`,
          /**
           * O TEXTO SIMPLES fica com o endereço — não há `href` onde o esconder,
           * e um email de texto sem o link é um email sem a proposta. O que o
           * torna legível é o endereço ser CURTO; é outro trabalho, e é o do
           * identificador curto.
           */
          texto: [escrito.texto, ...pdfEmTexto].join("\n"),
          quem,
        })
      : corpoDoModelo
        ? emailAoCliente({
            html: `${corpoDoModelo}${cartaoDoPdf}`,
            texto: [textoDoCorpo(corpoDoModelo), ...pdfEmTexto].join("\n"),
            quem,
          })
        : emailAoCliente({
            quem,
            html: `<h2 style="font-size:18px;margin:0 0 12px">${esc(t.titulo)}</h2>
        <p style="font-size:14px;line-height:1.6">${esc(t.ola)} ${esc(doc.clientNames)},</p>
        ${mensagem ? `${paragrafosDaMensagem(mensagem)}\n        ` : ""}<p style="font-size:14px;line-height:1.6">${esc(t.intro)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;border-collapse:separate">
          <tr><td style="background:#4c6350;border-radius:8px">
            <!-- 48 px de altura (14+20+14) e letra de 16: é o outro botão deste
                 mesmo email, e tinha 39 px com letra de 13. Dois botões lado a
                 lado com alturas diferentes leem-se como dois produtos. -->
            <a href="${acceptUrl}" style="display:block;padding:14px 26px;font-size:16px;line-height:20px;color:#f7f4ee;text-decoration:none;font-weight:600;white-space:nowrap">${esc(t.botao)}</a>
          </td></tr>
        </table>${cartaoDoPdf}`,
            texto: [
              t.titulo,
              "",
              `${t.ola} ${doc.clientNames},`,
              "",
              // Tal e qual, com as quebras dela: escapar é uma preocupação de HTML, e
              // aqui só se lhe acrescenta a linha em branco que a separa do resto.
              // A mensagem pessoal não se traduz em língua nenhuma — é dela, como
              // os títulos e as legendas do documento.
              ...(mensagem ? [mensagem, ""] : []),
              t.introEmTexto,
              `${t.verOnline} ${acceptUrl}`,
              ...pdfEmTexto,
            ].join("\n"),
          });

    /* ── A CAPA FABRICADA ENQUANTO O CORREIO SAI ──────────────────────────
       «Esta foto demora imenso tempo a carregar.» A derivada de 1200 px da capa
       era fabricada pela primeira visita — que numa proposta acabada de enviar é
       a do casal a abrir o email, com um `sharp` a acontecer enquanto eles olham
       para um rectângulo vazio.

       Começa AQUI e é esperada depois do `sendMail`: corre em paralelo com a ida
       ao servidor de correio, portanto não acrescenta praticamente nada ao
       envio. O `.catch` é obrigatório — entre este ponto e o `await` lá em baixo
       há um `await` pelo meio, e uma promessa rejeitada sem tratamento nesse
       intervalo derrubaria o processo. */
    const capaAQuecer = aquecerDerivadasDaCapa(doc.coverImages ?? []).catch(() => 0);

    // A proposta JÁ foi guardada acima. O envio do email é um passo separado: se
    // falhar (SMTP em baixo, credenciais erradas, email do cliente inválido) NÃO
    // pode deitar abaixo a geração inteira com um 500 — senão o utilizador vê
    // "erro", tenta de novo e cria propostas duplicadas. Falhar no email devolve
    // 200 com emailed:false + motivo, para a UI explicar o que aconteceu.
    const hasRecipient = !!quote.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(quote.email);
    /* Ver a nota do `porEmail` no corpo do pedido: só um `false` EXPLÍCITO
       cala o email. Um pedido antigo, que não conhece este campo, envia como
       sempre enviou. */
    const querEmail = body?.porEmail !== false;
    let emailed = false;
    let emailError: string | undefined;
    /** Não saiu email porque ela ESCOLHEU que não saísse — e não porque falhou. */
    let semEmailPorEscolha = false;
    if (!querEmail) {
      /* Sem `emailError`: a diferença entre «não saiu» e «não saiu por culpa
         de alguma coisa» é a diferença entre um ecrã calmo e um ecrã que
         parece avariado. A proposta fica gravada e o link do casal nasce à
         mesma — é ele que vai no WhatsApp. */
      semEmailPorEscolha = true;
      log.info("proposta-doc: envio sem email, por escolha de quem enviou", {
        id,
        proposta: proposal.id,
      });
    } else if (!hasRecipient) {
      emailError = "O pedido não tem um email de cliente válido.";
    } else if (resta() < FOLGA_DO_EMAIL_MS) {
      emailError =
        "O documento demorou mais do que o costume e o email não chegou a sair. A proposta ficou gravada: carregue outra vez em enviar.";
      log.warn("proposta-doc: sem tempo para o email, não se começa", {
        id,
        restaMs: resta(),
      });
    } else {
      try {
        const mail = await sendMail({
          to: quote.email,
          replyTo: MAIL_TO,
          // Sem o identificador interno — a mesma decisão da rota irmã
          // (`orcamento/[id]/proposta`), onde está escrita por extenso: o
          // `randomUUID()` da nossa base não é referência de ninguém.
          // O assunto vem do MODELO quando é o modelo que sai — o corpo é dela
          // e a linha que o cliente lê antes de abrir também tem de ser.
          // …e o assunto da CASA vem na língua da proposta, como o corpo: é a
          // única linha que o casal lê antes de decidir se abre.
          // …e o assunto ESCRITO no ecrã de envio ganha aos dois: é o que ela
          // leu com o dedo no botão. Ver o `assuntoEscritoAMao`.
          subject: assuntoDoEcra ?? doModelo?.assunto ?? t.assunto,
          html: email.html,
          text: email.text,
          // O PDF junta-se aos anexos da assinatura; substituí-los deixava o
          // logótipo de fora e o `cid:` do HTML sem destino.
          attachments: [
            ...email.attachments,
            {
              // O nome do anexo também é a língua da proposta: ela manda as duas
              // versões (a portuguesa aos pais, a inglesa ao casal) e com o mesmo
              // nome a segunda fica «Proposta-Liquen-q1 (1).pdf» na pasta de quem
              // as receba, sem forma de saber qual é qual sem abrir as duas.
              // O NOME é o do casal e o da data do evento, e não o
              // identificador interno do pedido: é este ficheiro que fica na
              // pasta de transferências deles e que é reencaminhado aos pais.
              filename: nomeDoAnexo,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        });
        emailed = mail.sent;
        if (!mail.sent) emailError = "Envio de email não configurado.";
      } catch (e) {
        log.error("proposta-doc: envio de email falhou", e, { id });
        emailError = "A proposta foi guardada, mas o email ao cliente falhou.";
      }
    }

    // A capa, se ainda não estava pronta. Nunca lança e tem tecto próprio: se
    // passou dele, fica para a visita, como era antes.
    await capaAQuecer;

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
     * enviar. É o erro para o lado seguro — mostra menos do que a verdade em
     * vez de mais — mas não é inofensivo: o link do cliente recusa uma
     * proposta que não está em aberto. Por isso grita no registo e volta na
     * resposta, para ela poder reenviá-la (o reenvio reaproveita esta linha, e
     * o casal recebe o mesmo documento).
     */
    let estadoError: string | undefined;
    /** As duas escritas «melhor esforço» que acontecem DEPOIS do correio. Só
     *  viajam na resposta quando falham — o mesmo desenho do `estadoError`. */
    let copiaError: string | undefined;
    let pedidoError: string | undefined;
    /** O estado com que a proposta FICOU — é este que a resposta conta. (Uma
     *  variável e não `proposal.status`: o objecto já foi entregue à camada de
     *  gravação, e mudá-lo por baixo dela seria mentir a quem o guardou.) */
    let estado = proposal.status;
    /**
     * ── SEGUIU: PELO EMAIL, OU PELO WHATSAPP QUE ELA ESCOLHEU ──────────────
     *
     * Achado n.º 4 da auditoria. Com «Por onde segue: WhatsApp», a proposta
     * ficava «rascunho», a resposta vinha sem link e o estúdio dizia «o EMAIL
     * NÃO SAIU — o cliente não recebeu nada». O WhatsApp nunca abria. O
     * comentário do `porEmail`, lá em cima, prometia o contrário: «o link do
     * casal nasce à mesma — é ele que vai no WhatsApp».
     *
     * Escolher o WhatsApp é dizer «sou eu que lho mando». A proposta passa a
     * «enviada», o pedido sobe a «Proposta enviada», e o link volta na
     * resposta para o estúdio abrir o WhatsApp com ele. A cópia do email
     * (`registarEnvio`) continua só para o email: não houve email a copiar.
     */
    const seguiu = emailed || semEmailPorEscolha;
    if (seguiu) {
      const sentAt = new Date().toISOString();

      /**
       * ══════════════════════════════════════════════════════════════════════
       * A CÓPIA DO QUE SEGUIU — E O QUE ELA NÃO É
       * ══════════════════════════════════════════════════════════════════════
       *
       * «O que é que nós lhes escrevemos?», três semanas depois, ao telefone.
       * Desde que o corpo passou a ser editável no ecrã de envio, essa pergunta
       * não tinha resposta em lado nenhum: o modelo guardado é o ponto de
       * partida e pode ter mudado, e o rascunho do estúdio é o documento, não o
       * email. Fica aqui o que saiu — ver `envios-de-proposta.ts`.
       *
       * NÃO É RASTREIO, e é decisão dela: não há «aberto em», «lido às» nem
       * «carregou no link», e não pode passar a haver. Tudo o que se guarda são
       * factos do lado de cá — o que nós mandámos, quando, e quem carregou no
       * botão.
       *
       * DEPOIS de o correio ter sido aceite (`emailed`), e sem `await` que
       * possa deitar o pedido abaixo: o `registarEnvio` nunca lança, mas um
       * `catch` à volta custa uma linha e vale a garantia — do lado dela, a
       * proposta seguiu, e um erro aqui só a fazia carregar em Enviar outra vez.
       */
      if (emailed)
        try {
          await registarEnvio(id, {
            enviadoEm: sentAt,
            para: String(quote.email ?? ""),
            porQuem: quem.nome,
            // A chave do modelo de onde o corpo partiu, para se saber de que
            // texto se partiu. Vazia quando o envio não passou pelo ecrã novo.
            modelo: typeof body?.modelo === "string" ? body.modelo : "",
            idioma: idioma === "en" ? "en" : "pt",
            assunto: assuntoDoEcra ?? doModelo?.assunto ?? t.assunto,
            // O CORPO tal e qual, em texto, já com a ligação resolvida. Sem corpo
            // escrito à mão fica o texto simples do email que saiu — é o que há, e
            // é o que se quer reler.
            texto: escrito ? escrito.texto : email.text,
            anexo: { nome: nomeDoAnexo, bytes: pdfBuffer.byteLength },
            propostaId: proposal.id,
          });
        } catch (e) {
          log.error("proposta-doc: o email saiu mas a cópia não ficou guardada", e, { id });
          /**
           * MELHOR ESFORÇO QUE FALHA TEM DE SER DITO.
           *
           * Isto era só um `log.error`, e a resposta saía
           * `{ok:true, emailed:true, estado:"enviada"}` — o toast dizia «Proposta
           * enviada ao cliente» e mais nada. O que se perde não é ruído: é a
           * resposta à pergunta «o que é que nós lhes escrevemos?», que não existe
           * em mais lado nenhum (o modelo é só o ponto de partida, e o rascunho é
           * o documento, não o email). Está escrito em `envios-de-proposta.ts`.
           *
           * Não pode deitar abaixo um envio que já aconteceu — por isso continua a
           * ser melhor esforço. O que muda é sair pelo nome, como o `docError` e o
           * `estadoError` já saem.
           */
          copiaError =
            "O email seguiu para o cliente, mas a CÓPIA do que lhe escrevemos não ficou " +
            "guardada. O envio está feito; o que se perde é poder reler o texto mais tarde.";
        }

      try {
        const gravado = await updateProposal(proposal.id, { status: "enviada", sentAt });
        if (!gravado) throw new Error("proposta não encontrada ao marcar como enviada");
        estado = "enviada";
      } catch (e) {
        log.error("proposta-doc: o email saiu mas a proposta ficou por marcar como enviada", e, {
          id,
          proposta: proposal.id,
        });
        /**
         * A FRASE DEIXOU DE MANDAR REENVIAR.
         *
         * Dizia: «Reenvia-a para acertar o estado (é a mesma proposta, não se
         * cria outra)». Não era verdade — a trava de repetição reconhecia uma
         * repetição pelo `status`, que é precisamente o que acabou de não ser
         * gravado, e o reenvio mandava um SEGUNDO email ao casal. A frase que
         * ela lia era a que provocava o defeito.
         *
         * A trava passou a consultar também o registo de envios, portanto
         * reenviar já não duplica nada. Mesmo assim a frase não o pede: o que
         * ela precisa de saber é que o cliente JÁ recebeu, e que o que falta é
         * uma correcção deste lado.
         */
        estadoError = emailed
          ? "O email seguiu para o cliente — ele JÁ a recebeu. O que falhou foi a marcação " +
            "deste lado: a proposta ficou como «por enviar» e o Quadro pode não a mostrar na " +
            "coluna certa. Não é preciso reenviar nada."
          : "A proposta está gravada, mas não ficou marcada como enviada: o Quadro pode não " +
            "a mostrar na coluna certa.";
      }
    }

    try {
      /**
       * ══════════════════════════════════════════════════════════════════════
       * O PREÇO GRAVA-SE SEMPRE; O ESTADO SÓ SOBE
       * ══════════════════════════════════════════════════════════════════════
       *
       * `money.base` (SEM IVA) e não `money.gross`. O campo chama-se "Preço
       * final (sem IVA)" no ecrã, quem o escreve à mão escreve-o líquido, e o
       * `contractedAmounts` (dossier.ts) trata-o como líquido — faz
       * `gross = quotedPrice * (1 + taxa)` para obter o valor com IVA.
       *
       * Gravar aqui o valor COM IVA punha as três coisas em desacordo e o
       * estrago era em cascata: a margem do evento (EventCosts) compara
       * `revenueNet` com os custos líquidos, e `revenueNet` passava a ser o
       * valor com IVA — margem cerca de 23% melhor do que a real. O valor "com
       * IVA" derivado ficava 51% acima. E ao fazer uma segunda proposta para o
       * mesmo casamento, o estúdio partia desse número já com IVA e voltava a
       * marcar "+ IVA" por cima.
       *
       * ── O QUE MUDOU: `status: "cotado"` ERA INCONDICIONAL ────────────────
       *
       * Escrever "cotado" a seco fazia RECUAR um pedido já ganho. E não é um
       * caso teórico: rever a proposta DEPOIS do aceite acontece (o cálculo do
       * saldo em faturas/[id] tem uma nota inteira sobre isso). Bastava
       * reenviar o documento com uma linha corrigida para o casamento fechado
       * voltar a «Proposta enviada» no quadro — com o sinal já emitido e pago.
       *
       * Agora a decisão é a de `@/lib/orcamento/estado-do-pedido`, que nunca
       * desce a escada, e deixa a linha no histórico a dizer o que a causou.
       * O PREÇO grava-se na mesma nos dois casos: é o valor da proposta que
       * acabou de seguir, e nada nele depende do estado.
       *
       * `updateQuoteWith` e não `updateQuote` porque o `getQuote` do princípio
       * desta rota está a dezenas de segundos daqui — pelo meio desenhou-se um
       * PDF de uma dúzia de páginas e mandou-se um email. A regra tem de ser
       * avaliada contra o que está gravado AGORA, e a linha nova do histórico
       * não pode apagar a que outra ferramenta escreveu entretanto.
       *
       * ── E A TRANSIÇÃO SÓ ACONTECE SE O EMAIL SAIU ────────────────────────
       *
       * «Proposta enviada» no Quadro é a mesma afirmação que o estado da
       * proposta faz, vista do outro lado do back office — e era escrita com a
       * mesma cegueira. Um pedido em «Proposta enviada» sobre um email que
       * nunca saiu tira-o da coluna onde ela ia dar por ele, e escreve no
       * histórico uma linha que não é verdade. O PREÇO grava-se na mesma: foi
       * decidido, é dele que vivem a margem e a proposta seguinte, e nada nele
       * depende de o correio ter funcionado.
       */
      await updateQuoteWith(id, (actual) => {
        const transicao = seguiu
          ? transicaoDoPedido({
              acontecimento: "proposta_enviada",
              estadoActual: actual.status,
              detalhe: eur(money.gross),
            })
          : null;
        return {
          ...actual,
          quotedPrice: money.base,
          ...(transicao
            ? {
                status: transicao.status,
                activityLog: [...(actual.activityLog ?? []), transicao.entrada],
              }
            : {}),
        };
      });
    } catch (e) {
      log.error("proposta-doc: actualizar pedido falhou", e);
      /**
       * A MESMA REGRA, E AQUI CUSTA MAIS.
       *
       * Sem esta escrita, duas coisas ficam erradas do lado de cá e nenhuma
       * dava sinal: o pedido não avança para «Proposta enviada» no Quadro (sai
       * da coluna onde ela ia dar por ele) e o `quotedPrice` não grava — e é
       * dele que vivem a margem do evento e a proposta seguinte.
       *
       * Melhor esforço, como a cópia: o email já saiu e não se desfaz. Mas dito.
       */
      pedidoError =
        "O email seguiu para o cliente, mas o PEDIDO não ficou actualizado: pode continuar " +
        "na coluna anterior do Quadro, e o preço final pode não ter sido gravado. " +
        "Confirma-os antes de fechar.";
    }

    // `missingImages` VAI TAMBÉM NO ENVIO, não só na pré-visualização.
    //
    // A contagem foi acrescentada quando a Catarina recebeu um PDF com fotos a
    // menos e ninguém a avisou. Mas ficou só no caminho da pré-visualização — e
    // os passos do estúdio são clicáveis, portanto dá para ir do Conteúdo
    // direito ao Enviar sem passar por lá. Nesse caminho o número era calculado
    // (é o mesmo `renderStoredEditorialPdfWithReport` lá em cima) e deitado
    // fora, o que deixava a porta aberta exactamente para o caso que a magoou:
    // a proposta segue para o noivo com fotos a menos, em silêncio.
    //
    /**
     * ══════════════════════════════════════════════════════════════════════
     * O PDF FICA GUARDADO, PARA O CASAL NÃO O MANDAR DESENHAR OUTRA VEZ
     * ══════════════════════════════════════════════════════════════════════
     *
     * Na página onde o casal aceita a proposta há um «Ver a proposta completa
     * (PDF)». Era um link directo: carregava-se, e a página não sabia de nada
     * — nem que estava a trabalhar, nem que tinha falhado. Do outro lado, o
     * servidor REDESENHAVA o documento inteiro, com as oitenta fotografias a
     * passar outra vez pelo `sharp`. Num processo acabado de arrancar — que é
     * o caso normal três dias depois do envio — são segundos.
     *
     * A escolha entre dar-lhe uma espera com nome e tirar-lhe a espera foi
     * fácil: **o ficheiro já está desenhado.** É este `pdfBuffer`, o mesmo que
     * acabou de seguir em anexo e cujo `sha256` ficou selado no contrato.
     *
     * ── PORQUÊ AQUI, DEPOIS DO EMAIL ─────────────────────────────────────
     *
     * Porque nada disto pode atrasar o correio. Se a escrita falhar, o casal
     * recebe a proposta na mesma e o botão volta a desenhar como sempre fez —
     * é memória, não é a verdade. Por isso não há `throw`, e o desfecho vai
     * no registo e não na resposta: quem enviou não tem nada a fazer com esta
     * informação.
     */
    try {
      const guardou = await guardarPdfDaProposta(proposal.id, chaveDoPdf(doc, idioma), pdfBuffer);
      if (!guardou) {
        log.warn("proposta-doc: o PDF não ficou guardado — o link do casal vai redesenhar", {
          id: proposal.id,
        });
      }
    } catch (e) {
      log.warn("proposta-doc: o PDF não ficou guardado", { erro: String(e) });
    }

    // A proposta online fica pronta já, depois da resposta: o primeiro clique
    // do casal no email não espera pelo motor (`proposta-web/guardado.ts`).
    // Nunca pode estragar um envio: se não houver onde o deixar a correr, a
    // primeira visita faz o trabalho, como antes.
    try {
      after(async () => {
        try {
          const { aquecerPropostaWeb } = await import("@/lib/proposta-web/modelo");
          await aquecerPropostaWeb(proposal.id);
        } catch (e) {
          log.warn("proposta-doc: a página online não ficou preparada", { erro: String(e) });
        }
      });
    } catch {
      /* sem contexto de pedido: fica para a primeira visita */
    }

    // `truncations` viaja pelo mesmo motivo e pelo mesmo caminho: é a mesma
    // perda vista do outro lado — conteúdo que chegou e que a página não
    // desenhou.
    return NextResponse.json({
      ok: true,
      id: proposal.id,
      emailed,
      emailError,
      /* «Não saiu email» tem duas causas muito diferentes, e o ecrã tem de as
         separar: uma é uma avaria (o `emailError`), a outra é a escolha dela.
         Sem esta linha, escolher «só WhatsApp» dava um aviso cor de laranja a
         dizer que alguma coisa correu mal. */
      ...(semEmailPorEscolha ? { semEmailPorEscolha: true } : {}),
      /**
       * O estado em que a proposta FICOU. Vai na resposta porque é a resposta a
       * «e agora, o que é que ela vê no quadro?»: com o email fora, é
       * `rascunho` — «Gerada, por enviar» — e não «Enviada, à espera de
       * resposta». Quem chamar esta rota à mão fica a saber o mesmo.
       */
      estado,
      ...(estadoError ? { estadoError } : {}),
      ...(copiaError ? { copiaError } : {}),
      ...(pedidoError ? { pedidoError } : {}),
      /**
       * O link de aceitação, só quando o email saiu mesmo (`estado ===
       * "enviada"`) — para o botão «Copiar resumo» poder usá-lo já, sem um
       * segundo pedido, mal este envio termine. `null` no caminho "gravada
       * mas sem email": esse link nunca chegou ao casal, e dá-lo ao estúdio
       * era oferecer para colar num WhatsApp um link que ninguém recebeu.
       */
      // E no caminho do WhatsApp (achado n.º 4) é ESTE o link que ela manda.
      acceptUrl: estado === "enviada" ? acceptUrl : null,
      missingImages,
      truncations,
      // Quanto pesou este documento. O estúdio guarda-o com o tempo que a
      // geração demorou, e é dessas medições que sai a estimativa que aparece
      // antes do botão — incluindo o aviso de que o anexo passa do que um
      // email leva. Na pré-visualização isto sabe-se do próprio blob; no envio
      // o PDF não passa pelo browser, e sem esta linha o envio não ensinava
      // nada à estimativa.
      pdfBytes: pdfBuffer.byteLength,
      ...(pdfDaMemoria ? { pdfDaMemoria } : {}),
      // Só viaja quando NÃO foi guardado: uma resposta normal não ganha nada
      // com um `docSaved:true` a mais, e quem falha tem de sair pelo nome.
      ...(docSaved ? {} : { docSaved, docError }),
    });
  } catch (err) {
    log.error("proposta-doc POST falhou", err);
    // Rota só para administradores autenticados — incluir o motivo real ajuda a
    // equipa (e o suporte) a perceber a causa em vez de um erro genérico opaco.
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Erro ao gerar a proposta: ${detail || "desconhecido"}` },
      { status: 500 },
    );
  }
}
