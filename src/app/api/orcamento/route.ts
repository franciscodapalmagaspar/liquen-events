import { NextRequest, NextResponse, after } from "next/server";
import type { ZodError } from "zod";
import type { Quote, QuoteFormData, PriceBreakdown } from "@/lib/orcamento/types";
import {
  CATEGORIES,
  EVENT_TYPES_BY_CATEGORY,
  LOCATION_LABELS,
  BUDGET_RANGES,
  URGENCY_OPTIONS,
  eventTagLabel,
} from "@/lib/orcamento/data";
import { sendMail, MAIL_TO } from "@/lib/mail";
import { rotularPontos } from "@/lib/orcamento/decoracao";
import {
  guestRangeLabel,
  ceremonyTypeLabel,
  spaceTypeLabel,
  coordenacaoLabel,
} from "@/lib/orcamento/data";
import { EMAIL_LOGO_CID, emailLogoAttachment } from "@/lib/email-logo";
import { buildClientConfirmation } from "@/lib/client-confirmation";
import { htmlDoPedidoParaAEquipa, type LinhaDoCartao } from "@/lib/email-pedido-equipa";
import { LANG_COOKIE, normalizeLocale } from "@/lib/i18n/config";
import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n";
import {
  createQuote,
  listQuotes,
  listQuoteSummaries,
  getQuote,
  generateQuoteId,
  quoteIdFor,
} from "@/lib/quotes-store";
import { isAuthed } from "@/lib/admin-auth";
import { jsonWithEtag } from "@/lib/api-cache";
import { sendPushToAll } from "@/lib/push";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { quotePayloadSchema } from "@/lib/validation";
import { log } from "@/lib/logger";
import { eur0 as eur } from "@/lib/money";
import { enviarEventos, ipDoPedido } from "@/lib/meta/capi";
import { EVENTOS as EVENTOS_META } from "@/lib/meta/eventos";
import { desserializar as desserializarMeta } from "@/lib/meta/click-id";
import { FUSO_DO_ESTUDIO } from "@/lib/fuso";
import { quemPedeEOCasal } from "@/lib/orcamento/quem-pede";

export const maxDuration = 30;

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * O QUE SE LÊ QUANDO O ENVIO É RECUSADO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * O `error` que estas respostas trazem vai DIREITO para o ecrã: os três
 * formulários públicos (OrcamentoForm, PedidoRapido, PedidoRelampago) mostram-no
 * tal e qual o receberam, e é a única frase que a pessoa tem para perceber o que
 * fazer a seguir.
 *
 * Duas coisas estavam mal, e as duas custam pedidos:
 *
 *  1. o 400 devolvia a frase INTERNA do zod. Quem colasse uma morada comprida no
 *     «Local / região» — campo sem tecto nenhum no ecrã — carregava em Enviar e
 *     lia «Too big: expected string to have <=300 characters». Em inglês, sem
 *     dizer de que campo se fala, e sem nada para corrigir à vista. O pedido não
 *     seguia, e o passo seguinte dessa pessoa é fechar a página;
 *
 *  2. tudo isto só sabia falar português, numa rota que já lê a língua de quem
 *     escreveu para escolher a língua do email de confirmação. Quem está a ler o
 *     site em inglês recebia a recusa em português — pior do que o genérico que o
 *     próprio formulário mostraria se o servidor não dissesse nada.
 *
 * As frases passam a ser escritas AQUI, na língua da pessoa, e a nomear o campo
 * com o mesmo rótulo que ela tem à frente — vindo do dicionário, para não haver
 * dois nomes para o mesmo campo.
 */

/** O rótulo do campo, tal como está escrito no formulário. `null` para os
 *  campos que a pessoa nunca vê (identificadores de anúncios, taxonomias). */
function rotuloDoCampo(caminho: PropertyKey[], locale: Locale): string | null {
  const to = getDictionary(locale).orcamento;
  const campo = String(caminho[caminho.length - 1] ?? "");
  const rotulos: Record<string, string> = {
    name: to.labelNome,
    email: to.labelEmail,
    phone: to.labelTelefone,
    location: to.labelLocal,
    notes: to.labelMensagem,
    guests: to.labelPessoas,
    date: to.labelData,
  };
  return rotulos[campo] ?? null;
}

function mensagemDeValidacao(err: ZodError, locale: Locale): string {
  const to = getDictionary(locale).orcamento;
  const en = locale === "en";
  const issue = err.issues[0];
  const campo = issue ? String(issue.path[issue.path.length - 1] ?? "") : "";
  const rotulo = issue ? rotuloDoCampo(issue.path, locale) : null;

  // As duas recusas com nome próprio, ditas com a MESMA frase que o formulário
  // já mostra ao lado do campo — ver o erro duas vezes escrito de duas maneiras
  // faz duvidar de que seja o mesmo erro.
  if (campo === "name" && issue?.code === "too_small") return to.errNome;
  if (campo === "email" && issue?.code === "invalid_format") return to.errEmail;

  // A regra "email OU telefone": a única invariante do esquema que não é sobre
  // um campo isolado, e por isso a única cuja frase não pode nomear um.
  //
  // Vem do dicionário, como as duas de cima, porque o FORMULÁRIO mostra esta
  // mesma frase ao lado do campo antes de sequer tentar enviar (ver `contactoErr`,
  // em OrcamentoForm.tsx). Estava aqui escrita à mão nas duas línguas, e duas
  // cópias da mesma frase é como se acaba com duas frases diferentes para a
  // mesma recusa.
  if (issue?.code === "custom") return to.errContacto;

  if (issue?.code === "too_big" && typeof issue.maximum === "number") {
    const max = issue.maximum;
    if (rotulo) {
      return en
        ? `“${rotulo}” is too long. Please shorten it to ${max} characters or fewer.`
        : `O campo «${rotulo}» é demasiado longo. Encurte-o para ${max} caracteres ou menos.`;
    }
    return en
      ? `One of the fields is too long (maximum ${max} characters).`
      : `Um dos campos é demasiado longo (máximo ${max} caracteres).`;
  }

  if (rotulo) {
    return en ? `Please check the “${rotulo}” field.` : `Verifique o campo «${rotulo}».`;
  }
  return en
    ? "We couldn't read your request. Please check the fields and try again."
    : "Não foi possível ler o seu pedido. Verifique os campos e tente novamente.";
}

/**
 * O tecto de tentativas conta por ENDEREÇO, e um endereço não é uma pessoa: o
 * escritório, o espaço de eventos com wi-fi partilhado e a rede móvel do
 * operador põem muita gente atrás do mesmo. Quem for recusado por causa do
 * vizinho não fez nada de errado — e a frase dizia-lhe «dentro de momentos»,
 * que tanto podia ser cinco segundos como um minuto inteiro. O servidor SABE
 * quanto falta (é o que já vai no `Retry-After`); passa a dizê-lo.
 */
function mensagemDeLimite(segundos: number, locale: Locale): string {
  const en = locale === "en";
  const minutos = Math.ceil(segundos / 60);
  const quanto =
    segundos < 60
      ? en
        ? `${segundos} seconds`
        : `${segundos} segundos`
      : en
        ? `${minutos} minute${minutos === 1 ? "" : "s"}`
        : `${minutos} minuto${minutos === 1 ? "" : "s"}`;
  return en
    ? `Too many requests from this connection. Please try again in ${quanto}, or send us a message on WhatsApp.`
    : `Demasiados pedidos a partir desta ligação. Tente novamente daqui a ${quanto}, ou fale connosco pelo WhatsApp.`;
}

/**
 * O 503 é a ÚNICA recusa em que se sabe, com certeza, que o pedido se perdeu:
 * não ficou gravado em lado nenhum E o email à equipa também não saiu (ver o
 * ramo `if (!avisada)`, mais abaixo). Todas as outras — o 400, o 429, a rede a
 * cair — deixam a pessoa a poder tentar outra vez e chegar lá.
 *
 * Era, no entanto, a frase mais fraca das três. Dizia «contacte-nos
 * diretamente» sem dizer POR ONDE, enquanto a do 429 aqui em cima e a que o
 * formulário mostra quando a rede cai (`to.error`, no dicionário) nomeiam as
 * duas o WhatsApp. Quem acaba de escrever dez campos e lê que se perderam não
 * vai procurar o canal: fecha. O canal tem de estar na frase.
 */
function mensagemSemRegisto(locale: Locale): string {
  return locale === "en"
    ? "We couldn't record your request. Please try again in a moment, or send us a message on WhatsApp — we'll pick it up from there."
    : "Não foi possível registar o seu pedido. Tente novamente dentro de momentos, ou fale connosco pelo WhatsApp — tratamos dele por aí.";
}

/**
 * Não há email do cliente, logo não há confirmação a enviar.
 *
 * É uma saída antecipada com nome, e não um `if` a envolver sessenta linhas:
 * o bloco da confirmação já vive dentro de um `try`, e enfiá-lo num `if`
 * mudava a indentação de tudo o que lá está sem mudar o comportamento de
 * nada. Quem lê o `catch` vê explicitamente que este caso não é uma falha.
 */
class NadaParaConfirmar extends Error {}

/**
 * Reenvia o `Lead` para a Meta pela Conversions API, com o MESMO `event_id`
 * que o browser usou no pixel.
 *
 * ── AS TRÊS GUARDAS, E PORQUE É QUE CADA UMA EXISTE ────────────────────────
 *  1. sem `leadEventId` não se envia. É o que garante a deduplicação: um
 *     identificador gerado aqui nunca encontraria o par do browser, e a
 *     conversão contaria duas vezes;
 *  2. sem `metaClick` não se envia — sem ele não há com que ligar o evento ao
 *     anúncio. ATENÇÃO: isto NÃO é prova de consentimento (o `fbclid` do URL
 *     fica guardado mesmo sem ele). A prova é a guarda 1: o formulário só manda
 *     o `leadEventId` quando o visitante aceitou (`PedidoRelampago.tsx`);
 *  3. sem configuração (`META_DATASET_ID` / `META_CAPI_ACCESS_TOKEN`) o
 *     `enviarEventos` devolve `sem-configuracao` sem abrir socket nenhum.
 *
 * NUNCA lança para fora: quem chama embrulha à mesma, mas a regra vale a pena
 * ser dita duas vezes — o lead vale mil vezes mais do que o evento.
 */
async function reenviarLeadParaMeta(
  request: NextRequest,
  id: string,
  form: QuoteFormData,
): Promise<void> {
  const eventId = (form.leadEventId ?? "").trim();
  const meta = (form.metaClick ?? "").trim();
  if (!eventId || !meta) return;

  const { fbp, fbc } = desserializarMeta(meta);
  const r = await enviarEventos([
    {
      nome: EVENTOS_META.lead,
      eventId,
      quando: Math.floor(Date.now() / 1000),
      fonte: "website",
      contexto: form.notes?.slice(0, 100) || undefined,
      pessoa: {
        email: form.email || undefined,
        telefone: form.phone || undefined,
        nome: form.name || undefined,
        fbp: fbp || undefined,
        fbc: fbc || undefined,
        ip: ipDoPedido(request.headers) || undefined,
        agente: request.headers.get("user-agent") ?? undefined,
      },
    },
  ]);
  if (!r.enviado && r.motivo !== "sem-configuracao") {
    log.error("orcamento: Lead não chegou à Meta", undefined, {
      id,
      motivo: r.motivo,
      detalhe: r.detalhe,
    });
  }
}

const MONTHS_PT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];
// "2026-09-12" → "12 set 2026". Anything that doesn't parse is shown as-is.
function prettyDate(d?: string): string {
  const raw = (d ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const mi = Number(m[2]) - 1;
  return mi >= 0 && mi < 12 ? `${Number(m[3])} ${MONTHS_PT[mi]} ${m[1]}` : raw;
}

// tel: href — keep only digits and a leading +, so the phone is tappable.
const telHref = (phone: string) => phone.replace(/[^\d+]/g, "");

interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * The team's new-quote notification. Optimised for the person RECEIVING it:
 * a scannable subject (who + what, not the long reference), the client's
 * contact one tap away (mailto/tel), only the fields that were actually filled
 * (no "—" clutter), and a clear reminder that replying reaches the client
 * (the message sets Reply-To to form.email).
 */
function buildEmail(id: string, form: QuoteFormData, breakdown?: PriceBreakdown): BuiltEmail {
  const cat = form.category ? (CATEGORIES.find((c) => c.id === form.category)?.label ?? "") : "";
  const et =
    (form.category && form.eventType
      ? EVENT_TYPES_BY_CATEGORY[form.category]?.find((e) => e.id === form.eventType)?.label
      : undefined) ??
    form.eventName ??
    "";
  const local =
    form.location ||
    (form.locationType ? (LOCATION_LABELS[form.locationType] ?? form.locationType) : "");
  const estimate = breakdown
    ? `${eur(breakdown.rangeMin)} – ${eur(breakdown.rangeMax)}${breakdown.isEstimate ? " (estimativa)" : ""}`
    : "";
  const name = form.name?.trim() || "Sem nome";
  const firstName = name.split(" ")[0] || "o cliente";
  // Quem vai em grande: o casal, quando quem escreveu não é um dos dois (a mãe
  // da noiva, uma wedding planner). Ver `quem-pede.ts` — a 14/10 ela leu
  // «Maria Silva» em grande num pedido da Luana e do Afonso.
  const { titulo, feitoPor } = quemPedeEOCasal({
    name,
    partnerA: form.partnerA,
    partnerB: form.partnerB,
  });
  const subtitle = [et, cat].filter(Boolean).join(" · ");
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * «O SEU PEDIDO PARA O CASAMENTOS» — e saiu assim para clientes verdadeiros
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O rótulo da taxonomia é um BALDE NO PLURAL («Casamentos», «Batizados») e
   * caía dentro de três frases escritas no singular: a mensagem de WhatsApp, e
   * o assunto e o corpo do `mailto`. Este último é o botão de resposta do email
   * que a equipa recebe — ela carrega, o correio abre com o assunto já escrito,
   * e o erro chega à caixa do cliente com o nome dela em cima.
   *
   * São duas correcções, e a segunda é a que fecha o buraco:
   *
   *   1. A PALAVRA DO PRÓPRIO CLIENTE PRIMEIRO, que é a regra que o corpo da
   *      confirmação (`confirmarAoCliente`) já seguia — quem escreveu «Casamento
   *      da Ana e do João» lê isso de volta, e não o nome do balde.
   *   2. AS FRASES DEIXARAM DE PRECISAR DE ARTIGO. Sem `eventName`, o que resta
   *      é o balde no plural, e nenhum artigo colado à frente serve para os dois
   *      números. Adivinhar a concordância (uma tabela de artigos, um
   *      pluralizador) é uma máquina inteira para um problema que se resolve
   *      escrevendo a frase de outra maneira: o evento passa a aparecer só onde
   *      cabe como ETIQUETA (o assunto, depois de um «·»), que é uma construção
   *      que nunca discorda. As outras duas frases dizem «o seu pedido» — o
   *      cliente sabe o que pediu, e o email à equipa tem o resumo todo em cima.
   */
  // A etiqueta sai do mesmo sítio que a da confirmação — o `eventTagLabel`,
  // que prefere a palavra do cliente e devolve o tipo no SINGULAR. A equipa lê
  // sempre em português; o assunto que ela envia com um clique deixa de dizer
  // «o seu pedido · Casamentos».
  const evento = eventTagLabel(form, "pt") || cat || "";

  // The date is the hero — availability decides the booking. Lead with the
  // weekday, flag weekends, and show the full range for a multi-day event. The
  // weekday is derived from a Y/M/D-constructed date, so it's correct whatever
  // the server timezone is.
  const WEEKDAYS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec((form.date ?? "").trim());
  const weekday = dm
    ? WEEKDAYS_PT[new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3])).getDay()]
    : "";
  const isWeekend = weekday === "sábado" || weekday === "domingo";
  const when = prettyDate(form.date);
  const dateHero =
    form.isMultiDay && form.endDate
      ? `${when} – ${prettyDate(form.endDate)}`
      : weekday
        ? `${weekday}, ${when}`
        : when;

  // Fields the form captures but the old email dropped — shown only when set.
  const budgetLabel = form.budgetRange
    ? (BUDGET_RANGES.find((b) => b.id === form.budgetRange)?.label ?? "")
    : "";
  const urgencyLabel =
    form.urgency && form.urgency !== "standard"
      ? (URGENCY_OPTIONS.find((u) => u.id === form.urgency)?.label ?? "")
      : "";
  // ── "COMO NOS CONHECEU" NÃO VAI NO EMAIL ─────────────────────────────────
  // "Retira isto do email", com a fotografia da linha a dizer
  // `Como nos conheceu  ref:www.google.com`.
  //
  // Tinha razão, e o problema não é o campo — é o sítio. O `referralSource`
  // não é escrito por ninguém: é apanhado pelo LeadSourceCapture no primeiro
  // ecrã da visita, e o que lá está é `ref:<domínio>` ou uma lista de UTMs,
  // ou seja, notação de máquina. Num email que a equipa lê com pressa para
  // decidir se responde, aquela linha ocupa espaço e não ajuda a decidir nada.
  //
  // O campo CONTINUA a ser capturado e gravado. O sítio dele é o back office,
  // onde já alimenta a agregação "de onde vêm os pedidos"
  // (StatsDashboard.tsx) — que é uma pergunta de fim de mês, não de resposta
  // a um pedido. Só deixou de ser desenhado no email.

  // ── O ASSUNTO DIZ PRIMEIRO O QUE É ────────────────────────────────────────
  // A queixa, textual: "não gosto disto assim, quero que fique mais claro que
  // é um pedido de orçamento, está uma confusão enorme".
  //
  // O assunto começava pelo trio de triagem — "Casamentos · 18 set 2027 ·
  // 250 pax — Catarina..." — porque isso é o que decide se o trabalho cabe na
  // agenda. Bom raciocínio, conclusão errada: na lista da caixa de correio,
  // ao lado de tudo o resto, aquilo lia-se como uma marcação já feita, e não
  // como alguém a pedir orçamento. A triagem só serve depois de se saber o
  // que a mensagem é.
  //
  // "Pedido de orçamento" leva 19 caracteres dos cerca de 45 que um telemóvel
  // mostra. É caro, e paga-se de bom grado: o resto do assunto repete-se todo
  // dentro do email, e a linha de pré-visualização — que é a seguir — leva o
  // nome e a data. O que não se pode recuperar é a mensagem parecer outra
  // coisa.
  const subjectLead = [et || cat, when, form.guests ? `${form.guests} pax` : ""]
    .filter(Boolean)
    .join(" · ");
  const subject = subjectLead
    ? `Pedido de orçamento · ${subjectLead} — ${titulo}`
    : `Pedido de orçamento — ${titulo}`;

  // Hidden inbox-preview line — surfaces what the subject can't.
  const preheader = [
    feitoPor ? `${titulo} (pedido de ${feitoPor})` : titulo,
    dateHero + (isWeekend ? " (fim de semana)" : ""),
    subtitle,
    form.guests ? `${form.guests} convidados` : "",
    local,
    budgetLabel ? `orçamento ${budgetLabel}` : "",
    urgencyLabel ? "resposta urgente" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  // Decision block first (can we do it?), contact block second (how to reply).
  // Os pontos de decoração que o casal escolheu no pedido. Vão no bloco de
  // DECISÃO e não nas notas porque é isto que diz, antes da primeira chamada,
  // se o pedido é a cerimónia toda ou só as mesas do jantar.
  const decor = rotularPontos(form.decorPoints ?? [], "pt").join(" · ");
  const noivos = [form.partnerA, form.partnerB]
    .map((n) => n?.trim())
    .filter(Boolean)
    .join(" & ");
  // Quando não há número exacto, a ordem de grandeza vale mais do que um vazio
  // — um casamento de 40 e um de 300 não são o mesmo trabalho.
  const convidados = form.guests
    ? String(form.guests)
    : guestRangeLabel(form.guestsRange)
      ? `~ ${guestRangeLabel(form.guestsRange)}`
      : "";
  // A cerimónia e o espaço vão no bloco de DECISÃO pela mesma razão que a
  // decoração: são as duas linhas que dizem, antes da primeira chamada, quantas
  // montagens são e se é preciso um plano para o caso de chover.
  const cerimonia = ceremonyTypeLabel(form.ceremonyType);
  const espaco = spaceTypeLabel(form.spaceType);
  // A coordenação do dia (pedido dela, 25/10): é trabalho a mais no dia, e por
  // isso vai no mesmo bloco de decisão.
  const coordenacao = coordenacaoLabel(form.dayCoordination);
  // As linhas que ficam: uma linha sem valor não se desenha (era o que o
  // `row()` fazia, e é o que este `filter` faz).
  const linhasDoPedido: LinhaDoCartao[] = [
    { rotulo: "Convidados", valor: convidados },
    { rotulo: "Local", valor: local },
    { rotulo: "Espaço", valor: espaco },
    { rotulo: "Cerimónia", valor: cerimonia },
    { rotulo: "Coordenação do dia", valor: coordenacao },
    // "Casal" e não "Noivos": o formulário deixou de presumir que são um homem
    // e uma mulher, e o email que ela lê a seguir não pode voltar a presumi-lo.
    { rotulo: "Casal", valor: noivos },
    { rotulo: "Decoração", valor: decor },
    { rotulo: "Orçamento", valor: budgetLabel },
    { rotulo: "Antecedência", valor: urgencyLabel },
    { rotulo: "Orçamento estimado", valor: estimate },
  ].filter((l) => l.valor);
  // O email pode agora vir VAZIO (a regra é "email ou telefone" — ver
  // quoteFormSchema): sem ele não há linha, e portanto não há um `mailto:`
  // para lado nenhum.
  const linhasDeContacto: LinhaDoCartao[] = [
    form.email ? { rotulo: "Email", valor: form.email, href: `mailto:${form.email}` } : null,
    form.phone
      ? { rotulo: "Telefone", valor: form.phone, href: `tel:${telHref(form.phone)}` }
      : null,
    form.company ? { rotulo: "Empresa", valor: form.company } : null,
    form.nif ? { rotulo: "NIF", valor: form.nif } : null,
  ].filter((l): l is LinhaDoCartao => l !== null);

  // Email-specific logo: the site PNG carries ~23% transparent padding, so at a
  // 38px box the wordmark rendered only ~18px tall (illegible), and width/height
  // attrs that didn't match its 1.674 ratio made Outlook stretch it. This asset
  // is pre-trimmed onto an opaque cream plate at an exact 2:1 ratio — the plate
  // also keeps the mark readable in Gmail's dark theme, which never inverts
  // image pixels.
  // cid: — the wordmark travels inside the message. A hosted URL 404s until
  // production is promoted, and is blocked outright by clients that suppress
  // remote images by default. See lib/email-logo.
  const logoUrl = `cid:${EMAIL_LOGO_CID}`;

  // Actions. WhatsApp is primary when there's a phone (fastest, warmest channel
  // for PT leads); otherwise the email reply is primary. Both are prefilled.
  const waMsg = `Olá ${firstName}, fala a equipa da Líquen Events 🌿 Recebemos o seu pedido e teríamos todo o gosto em ajudar. Quando lhe der jeito, é só dizer — combinamos uma conversa sem compromisso.`;
  const waDigits = form.phone ? form.phone.replace(/\D/g, "") : "";
  const waNumber = /^9\d{8}$/.test(waDigits) ? `351${waDigits}` : waDigits;
  const waHref = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}` : "";
  const mailtoHref = form.email
    ? // O evento entra como ETIQUETA, depois de um «·» — o separador que a casa
      // já usa em todo o lado. Assim identifica o assunto sem nunca discordar.
      `mailto:${form.email}?subject=${encodeURIComponent(
        `Líquen Events — o seu pedido${evento ? ` · ${evento}` : ""}`,
      )}` +
      `&body=${encodeURIComponent(
        `Olá ${firstName},\n\nMuito obrigado pelo seu pedido de orçamento — foi um gosto recebê-lo.\n\n\n\nCom os melhores cumprimentos,\nEquipa Líquen Events`,
      )}`
    : "";

  // Speed-to-lead nudge — urgency-aware when the client flagged it.
  const nudge = urgencyLabel
    ? "O cliente pediu resposta com urgência — um olá nas próximas horas faz toda a diferença."
    : "Pedidos respondidos no próprio dia convertem muito mais.";
  // O desenho é o do email ao cliente (ver `email-pedido-equipa.ts`); os
  // valores são os que estas linhas de cima já decidiam.
  const html = htmlDoPedidoParaAEquipa({
    logo: logoUrl,
    nome: titulo,
    feitoPor,
    data: dateHero,
    fimDeSemana: isWeekend,
    subtitulo: subtitle,
    preheader,
    whatsapp: waHref,
    mailto: mailtoHref,
    lembrete: nudge,
    primeiroNome: firstName,
    respostaPara: form.email ?? "",
    pedido: linhasDoPedido,
    contacto: linhasDeContacto,
    notas: form.notes ?? "",
    referencia: id,
    quando: new Date().toLocaleString("pt-PT", { timeZone: FUSO_DO_ESTUDIO }),
  });

  // ── A PRIMEIRA LINHA DESTE TEXTO É A PRÉ-VISUALIZAÇÃO DA CAIXA DE CORREIO ──
  // Ela fotografou a lista de mensagens e por baixo do assunto lia-se "NOVO
  // PEDIDO DE ORÇAMENTO Referência: LI...". Duas linhas de espaço, e nenhuma
  // delas a dizer quem escreveu nem quando é o casamento: o cabeçalho repetia
  // o que o assunto passa a dizer, e a referência é o dado menos útil que este
  // email tem — serve para procurar mais tarde, não para decidir agora.
  //
  // Alguns clientes de correio mostram o HTML e usam a linha invisível de
  // pré-visualização (a `preheader`, mais acima); outros — foi o caso — mostram
  // a versão em texto simples. As duas passam a dizer o mesmo, e a referência
  // desce para o fim.
  //
  // As linhas em branco são deliberadas e têm de sobreviver. O filtro de baixo
  // deixava cair TUDO o que fosse string vazia, e portanto deixava cair também
  // os espaçamentos: o texto chegava como um bloco corrido de dez linhas
  // coladas, que é a segunda metade da confusão de que ela se queixou. Os
  // campos ausentes passam a ser `null`, e é `null` que se filtra.
  const text = [
    preheader,
    "",
    "O EVENTO",
    subtitle ? `Evento: ${subtitle}` : null,
    dateHero ? `Data: ${dateHero}${isWeekend ? " (fim de semana)" : ""}` : null,
    convidados ? `Convidados: ${convidados}` : null,
    local ? `Local: ${local}` : null,
    espaco ? `Espaço: ${espaco}` : null,
    cerimonia ? `Cerimónia: ${cerimonia}` : null,
    coordenacao ? `Coordenação do dia: ${coordenacao}` : null,
    decor ? `Decoração: ${decor}` : null,
    budgetLabel ? `Orçamento: ${budgetLabel}` : null,
    urgencyLabel ? `Antecedência: ${urgencyLabel}` : null,
    estimate ? `Orçamento estimado: ${estimate}` : null,
    "",
    "QUEM PEDIU",
    `Nome: ${name}`,
    feitoPor ? `(Não é um dos noivos — o casal é ${titulo}.)` : null,
    form.email ? `Email: ${form.email}` : null,
    form.phone ? `Telefone: ${form.phone}` : null,
    form.company ? `Empresa: ${form.company}` : null,
    form.nif ? `NIF: ${form.nif}` : null,
    form.notes ? `\nNOTAS DO CLIENTE\n${form.notes}` : null,
    "",
    "Responda a este email para falar diretamente com o cliente.",
    `Referência: ${id}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { subject, html, text };
}

/**
 * A confirmação ao cliente, na língua em que ele escreveu (best-effort).
 *
 * Vive numa função à parte porque corre DEPOIS da resposta (ver o `after` no
 * POST): lá dentro é a última coisa que a pessoa recebe, mas já não é nada que
 * o ecrã dela esteja à espera.
 */
async function confirmarAoCliente(id: string, form: QuoteFormData, locale: Locale): Promise<void> {
  // Só existe quando o cliente deu email. Um pedido que chega só com
  // telemóvel — o caso normal nas variantes sociais — não tem para onde
  // mandar a confirmação, e é a EQUIPA que responde por WhatsApp. Não é uma
  // degradação silenciosa: o email à equipa traz o botão de WhatsApp já
  // pré-preenchido, que é o caminho mais rápido de qualquer forma.
  try {
    if (!form.email) throw new NadaParaConfirmar();
    // Feed the builder what the client actually told us, so the email mirrors
    // their event back in prose instead of being a generic acknowledgement.
    // Only the free-text `location` is passed — never the internal pricing
    // bucket (LOCATION_LABELS), which would read as "your venue is a rural
    // area". Weddings/christenings are organised by a couple → plural register.
    const confirmation = buildClientConfirmation({
      locale,
      name: form.name,
      referenceId: id,
      event: {
        /**
         * A etiqueta do evento NA LÍNGUA DESTE EMAIL — é aqui que a tradução
         * se faz, na leitura, porque o que está guardado é um identificador
         * («casamentos») e não uma palavra. Antes vinha o `eventName`, que era
         * o rótulo canónico PORTUGUÊS da lista: um email inglês dizia «Event:
         * Casamento», e com o `eventName` vazio (é o que os anúncios enviam)
         * caía-se no balde plural da taxonomia, «Casamentos».
         *
         * A palavra do PRÓPRIO cliente continua a ganhar — quem escreveu
         * «Casamento da Ana e do João» lê isso de volta. O que o
         * `eventTagLabel` deita fora é um rótulo de lista guardado onde devia
         * estar um nome.
         */
        typeLabel: eventTagLabel(form, locale) || undefined,
        eventType: form.eventType,
        date: form.date,
        guests: form.guests || undefined,
        // Sem número, devolve-se a ordem de grandeza que ELA escolheu — em
        // vez de calar a linha e deixá-la a pensar que não ficou registada.
        guestsRange: form.guests ? undefined : guestRangeLabel(form.guestsRange, locale),
        location: form.location?.trim() || undefined,
        plural: form.eventType === "casamentos" || form.eventType === "batizados",
        // Na língua do email, não na da equipa: quem escreveu em inglês
        // recebe "Ceremony · Dinner tables", não "Cerimónia · Mesas".
        decor: rotularPontos(form.decorPoints ?? [], locale),
        // Na língua do email, como tudo o resto deste resumo.
        ceremony: ceremonyTypeLabel(form.ceremonyType, locale),
        space: spaceTypeLabel(form.spaceType, locale),
        dayCoordination: coordenacaoLabel(form.dayCoordination, locale),
      },
    });
    // Per-recipient daily cap: this email goes to a user-SUPPLIED address, so
    // without a ceiling the endpoint could be abused to bombard a victim's
    // inbox from Líquen's sender reputation (a mail-bomb amplifier). 5/day per
    // address is far above any real client's needs; over it we skip the
    // confirmation — the lead is already persisted and the team notified.
    const emailKey = `confirm:${form.email.trim().toLowerCase()}`;
    if ((await rateLimit(emailKey, 5, 24 * 60 * 60_000)).ok) {
      const sentRes = await sendMail({
        to: form.email,
        // The body invites a reply ("basta responder a este email"), so point
        // replies explicitly at the monitored inbox. Without this they only
        // land correctly by coincidence — because MAIL_FROM happens to equal
        // MAIL_TO today — and a hot lead's reply would vanish the moment a
        // separate sending identity is configured.
        replyTo: MAIL_TO,
        headers: {
          "Auto-Submitted": "auto-generated", // RFC 3834 — don't auto-reply to us
          "X-Auto-Response-Suppress": "OOF, AutoReply", // Exchange/Outlook
        },
        // Os anexos vêm COM o email: o `buildClientConfirmation` devolve o
        // logótipo (e o banner, quando existir) que os `cid:` do HTML dele
        // precisam. Montá-los aqui à mão era voltar a ter duas listas para
        // manter de acordo — e uma cruz vermelha no dia em que divergissem.
        ...confirmation,
      });
      // sendMail resolves {sent:false} (no throw) when SMTP is unconfigured,
      // so without this the client silently gets nothing and nobody knows.
      if (!sentRes.sent) {
        log.error("orcamento: confirmação ao cliente NÃO enviada — verificar SMTP", undefined, {
          id,
        });
      }
    } else {
      log.warn("orcamento: cap diário do email de confirmação atingido — não reenviado", { id });
    }
  } catch (mailErr) {
    // `NadaParaConfirmar` não é uma falha: é o caso previsto de um pedido
    // que chegou só com telemóvel. Registar isso como erro encheria o
    // fan-out de alertas com o funcionamento normal das páginas sociais, e
    // um alerta que toca sempre deixa de ser lido.
    if (mailErr instanceof NadaParaConfirmar) {
      log.info("orcamento: pedido sem email — confirmação ao cliente não se aplica", { id });
    } else {
      log.error("orcamento: email de confirmação ao cliente falhou", mailErr, { id });
    }
  }
}

export async function POST(request: NextRequest) {
  // A língua em que esta pessoa está a ler, lida ANTES de tudo o resto: é a
  // língua de todas as respostas desta rota, incluindo as que recusam o pedido.
  const locale = normalizeLocale(request.cookies?.get?.(LANG_COOKIE)?.value);
  try {
    sweep();
    const limited = await rateLimit(`orcamento:${clientIp(request)}`, 5, 60_000);
    if (!limited.ok) {
      const segundos = Math.max(1, Math.ceil(limited.retryAfter ?? 60));
      return NextResponse.json(
        { error: mensagemDeLimite(segundos, locale) },
        { status: 429, headers: { "Retry-After": String(segundos) } },
      );
    }

    const body = await request.json().catch(() => null);
    // Honeypot: a real visitor never fills the hidden "website" field. If it's
    // set, this is a bot — pretend success and drop it silently. The client
    // guards it too, but that alone is bypassable, so re-check server-side.
    // We LOG the drop (with the UA) so a false positive — a real lead lost to an
    // over-eager autofill on a non-bot browser — is observable instead of 100%
    // silent. Behaviour is unchanged: the request is still discarded.
    if (body && typeof body === "object" && (body as Record<string, unknown>).website) {
      const ua = request.headers.get("user-agent") ?? "";
      const looksLikeBot = /bot|crawl|spider|headless|python|curl|wget|scrapy/i.test(ua);
      log.warn("orcamento: honeypot acionado — pedido descartado", {
        looksLikeBot,
        ua: ua.slice(0, 120),
      });
      return NextResponse.json({ id: generateQuoteId(), status: "ok" });
    }
    const parsed = quotePayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: mensagemDeValidacao(parsed.error, locale) },
        { status: 400 },
      );
    }
    const { form, breakdown } = parsed.data as unknown as {
      form: QuoteFormData;
      breakdown: PriceBreakdown;
    };

    // Idempotency: the client sends a stable submissionId (persisted across a
    // reload for the same unsent enquiry). Deriving a deterministic id from it
    // means a retried POST — the response was lost and the visitor resubmitted
    // — maps to the SAME quote instead of creating a duplicate lead and sending
    // a duplicate email. A fresh random id is used when no submissionId is sent.
    const rawSub = (body as Record<string, unknown> | null)?.submissionId;
    const submissionId =
      typeof rawSub === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(rawSub) ? rawSub : null;
    const id = submissionId ? quoteIdFor(submissionId) : generateQuoteId();

    if (submissionId) {
      try {
        if (await getQuote(id)) return NextResponse.json({ id, status: "ok" });
      } catch (lookupErr) {
        // A lookup failure must never block a genuine new lead — fall through
        // and create it (a duplicate is far better than a dropped enquiry).
        log.error("orcamento: verificação de idempotência falhou", lookupErr, { id });
      }
    }

    const quote: Quote = {
      ...form,
      id,
      submittedAt: new Date().toISOString(),
      status: "pendente",
      priceBreakdown: breakdown,
      // A língua em que esta pessoa escreveu. Já se lia do cookie para escolher
      // a língua do email de confirmação e deitava-se fora a seguir; guardada,
      // permite meses depois saber que aquele casal escreveu em inglês — e a
      // proposta do estúdio sai em português.
      locale,
    };

    // ── Durable delivery FIRST ──────────────────────────────────────────────
    // A lead is the whole point of this endpoint, so it must never be lost.
    // We persist BEFORE sending any email: (1) the store is the record the admin
    // dashboard reads, and (2) persisting first means a slow/hanging SMTP call
    // can't make the function hit maxDuration before the lead is saved.
    // Persistence: Supabase when configured; local file in dev.
    let persisted = false;
    try {
      await createQuote(quote);
      persisted = true;
    } catch (storeErr) {
      /**
       * ── O GÉMEO QUE CHEGOU AO MESMO TEMPO ──────────────────────────────
       *
       * Achado n.º 18 da auditoria: dois envios SIMULTÂNEOS do mesmo pedido
       * (a rede repete o POST) passam os dois pela verificação de cima, e o
       * segundo a gravar leva «chave duplicada» (23505). Seguia o caminho da
       * gravação falhada — e a equipa recebia o email duas vezes.
       *
       * Se o pedido com este id já lá está, a gravação não falhou: foi o
       * primeiro dos dois a fazê-la. Responde-se como a repetição de cima, sem
       * email nenhum — o do primeiro já está a caminho.
       */
      if (submissionId) {
        const jaGravado = await getQuote(id).catch(() => null);
        if (jaGravado) {
          log.info("orcamento: envio repetido em simultâneo — o primeiro já gravou", { id });
          return NextResponse.json({ id, status: "ok" });
        }
      }
      log.error("orcamento: persistência falhou", storeErr, { id });
    }

    // Notify the team by email (a second, independent delivery path). `sendMail`
    // never throws — it returns { sent:false } when SMTP isn't configured — so we
    // read `sent` to know whether the lead actually reached the team's inbox.
    const avisarEquipa = async (): Promise<boolean> => {
      try {
        const email = buildEmail(id, form, breakdown);
        const res = await sendMail({
          subject: email.subject,
          html: email.html,
          text: email.text,
          // Sem email do cliente não há a quem responder: omite-se o cabeçalho
          // em vez de o enviar vazio, que faria alguns servidores recusar a
          // mensagem inteira e perder a notificação do lead.
          replyTo: form.email || undefined,
          attachments: [emailLogoAttachment()],
        });
        return res.sent;
      } catch (mailErr) {
        log.error("orcamento: email falhou", mailErr, { id });
        return false;
      }
    };

    /**
     * ── QUANDO É QUE O EMAIL À EQUIPA TEM DE SAIR ANTES DA RESPOSTA ────────
     *
     * Só quando a gravação falhou. Aí o email deixa de ser um aviso e passa a
     * ser a ÚNICA cópia do pedido, e é ele que decide entre um «recebemos»
     * verdadeiro e um 503 honesto — não se pode responder sem saber se saiu.
     *
     * Com a gravação feita, o pedido já está seguro: esperar pelo SMTP para
     * responder era pendurar o ecrã de quem enviou num serviço que nada tem que
     * ver com a pergunta que ele está a fazer («chegou?»). E o nodemailer sabe
     * esperar 8 s pela ligação, 8 s pela saudação e 20 s pela transferência —
     * somado ao resto, isso passava dos 25 s em que os três formulários cortam
     * o pedido. O desfecho: a pessoa lia «não foi possível enviar» sobre um
     * pedido que estava gravado e já a caminho da caixa de correio da equipa.
     */
    let avisada = false;
    if (!persisted) {
      avisada = await avisarEquipa();
      // If the lead reached NEITHER a durable store NOR the team inbox, it is lost.
      // Return a real error so the visitor can retry or contact us directly, instead
      // of a false "success" screen over a dropped enquiry.
      if (!avisada) {
        log.error("orcamento: lead não registada nem enviada — a devolver erro", undefined, { id });
        return NextResponse.json({ error: mensagemSemRegisto(locale) }, { status: 503 });
      }
      // Partial success ao contrário: a equipa foi avisada, mas o pedido não
      // ficou em lado nenhum — não aparece no painel, e a referência que o
      // cliente leva não corresponde a nada. Fica no fan-out de alertas.
      log.error("orcamento: lead NÃO gravada — só existe no email à equipa", undefined, { id });
    }

    /**
     * ── O QUE FICA PARA DEPOIS DA RESPOSTA ────────────────────────────────
     *
     * `after` e não um `void` solto: a plataforma mantém a função viva até isto
     * acabar (na Vercel, o `waitUntil`). Um `void` fazia o contrário — o
     * contentor pode congelar assim que a resposta sai, e o email de confirmação,
     * o `Lead` da Meta e o push desapareciam sem deixar rasto. A diferença entre
     * os dois só se vê em produção, que é o pior sítio para a descobrir.
     *
     * Nada do que está aqui dentro muda a verdade do que já foi respondido: o
     * pedido está gravado (ou, no caso acima, já na caixa de correio da equipa)
     * antes de esta linha correr.
     */
    const depoisDaResposta = async () => {
      // Partial success: the lead is safely in the store but the team's email
      // didn't go out (e.g. SMTP unset/misconfigured in prod). The visitor still
      // sees success — the lead isn't lost — but nobody was actively notified, so
      // it can sit unseen in the dashboard. Log at ERROR so it reaches the alert
      // fan-out (Sentry/webhook), turning a silent notification gap into a signal.
      if (!avisada && !(await avisarEquipa())) {
        log.error(
          "orcamento: lead registada mas email à equipa NÃO enviado — verificar SMTP",
          undefined,
          { id },
        );
      }

      // Confirmation to the client, in the language they were browsing in (best-effort).
      await confirmarAoCliente(id, form, locale);

      // ── A Meta, pelo servidor ─────────────────────────────────────────────
      // O browser já disparou o `Lead` para o pixel com um `event_id`, e enviou-o
      // aqui dentro do formulário. Reenvia-se o MESMO identificador pela
      // Conversions API: a Meta reconhece os dois como um acontecimento só, e o
      // envio do servidor é o que sobrevive ao ITP do Safari e aos bloqueadores.
      //
      // Sem `leadEventId` não se envia NADA. Um `event_id` inventado aqui nunca
      // encontraria o par do browser e a conversão passaria a contar a dobrar —
      // que é exactamente a avaria que a deduplicação existe para evitar.
      try {
        await reenviarLeadParaMeta(request, id, form);
      } catch (metaErr) {
        log.error("orcamento: reenvio do Lead para a Meta falhou", metaErr, { id });
      }

      // Push notification to the team's devices (best-effort).
      try {
        await sendPushToAll({
          title: "Novo pedido de orçamento",
          body: `${form.name}${form.guests ? ` · ${form.guests} convidados` : ""}`,
          url: "/orcamento/admin",
          tag: "novo-orcamento",
        });
      } catch (pushErr) {
        log.error("orcamento: push falhou", pushErr, { id });
      }
    };

    /**
     * O `after` LANÇA quando é chamado fora de um pedido. Se isso acontecer, o
     * que não pode acontecer é nenhuma das duas coisas que vinham a seguir: nem
     * este trabalho desaparecer, nem uma resposta JÁ DECIDIDA — o pedido está
     * gravado — virar um 500 que diz a quem enviou que não conseguiu. Faz-se ali
     * mesmo, à moda antiga: mais lento, e verdadeiro.
     */
    try {
      after(depoisDaResposta);
    } catch (semContexto) {
      log.warn("orcamento: sem contexto para o `after` — a notificar dentro da resposta", {
        id,
        motivo: String(semContexto),
      });
      await depoisDaResposta();
    }

    return NextResponse.json({ id, status: "ok" });
  } catch (err) {
    log.error("orcamento POST falhou", err);
    // "Erro interno" não diz nada a quem está do outro lado, e dizia-o só em
    // português. Uma frase que admite a avaria e aponta o caminho alternativo
    // vale mais do que o nome técnico do que correu mal.
    return NextResponse.json({ error: mensagemSemRegisto(locale) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    /**
     * `?resumo=1` devolve a lista SEM as colecções que só o pedido aberto
     * mostra — ver `resumirQuote`. É a mesma forma que a página de
     * administração recebe no primeiro carregamento, e é preciso aqui pela
     * mesma razão: esta rota é relida ao voltar ao separador, ao devolver o
     * foco e de dois em dois minutos. Sem o resumo, a lista inteira voltava a
     * descarregar-se de dois em dois minutos e a poupança do primeiro
     * carregamento durava até à primeira mudança de separador.
     *
     * Por ADESÃO: sem o parâmetro a resposta é a de sempre, com tudo.
     */
    const resumo = new URL(request.url).searchParams.get("resumo") === "1";
    return jsonWithEtag(request, resumo ? await listQuoteSummaries() : await listQuotes());
  } catch (err) {
    log.error("orcamento GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
