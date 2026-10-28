import { esc } from "./mail";
import { longDate } from "./workdays";
import { saudacaoDaCarta } from "./tratamento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL «PEDIDO DE PROPOSTA RECEBIDO», NA VERSÃO CARTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O desenho é dela e está guardado, tal como chegou, em
 * `docs/email-pedido-recebido-carta.html` — «é assim que quero que o cliente
 * receba a mensagem». Substitui o desenho anterior
 * (`docs/email-pedido-recebido-apple.html`, que fica como histórico), e com
 * ele caem duas regras antigas: a referência do pedido VOLTA a aparecer (está
 * no desenho dela) e o assunto passa a ser «Pedido de Proposta – Casamento |
 * 10 de junho de 2028».
 *
 * Depois de a mandar, pediu UMA mudança: o texto da carta «em formato
 * quadrado» — justificado (`text-align:justify`) nos cinco parágrafos
 * corridos. A saudação e a despedida ficam como estão: numa linha só,
 * justificar não muda nada.
 *
 * O que não muda: os textos, as cores, os tamanhos e os espaçamentos do HTML
 * são os dela, e o teste de fidelidade (`email-pedido-recebido.test.ts`) põe
 * este HTML lado a lado com o ficheiro dela e exige que sejam IGUAIS, byte a
 * byte, com os valores de exemplo do próprio ficheiro.
 *
 * ── AS PARTES QUE MUDAM DE PEDIDO PARA PEDIDO ──────────────────────────────
 *
 *   · «Estimada Diana,» — o género vem do nome, quando é claro; na dúvida,
 *     «Olá Diana,». Decisão dela, e as razões estão em `tratamento.ts`.
 *   · «do vosso casamento, previsto para…» — o tipo de evento entra numa
 *     frase, e por isso cada tipo tem o seu substantivo e o seu género
 *     («da vossa conferência, prevista para…»). Não se usa o rótulo da lista
 *     (plural, «Casamentos») nem o que o cliente escreveu (um título, «Casamento
 *     da Ana e do João»): esse vai para o assunto e para o título, que são
 *     etiquetas.
 *   · «no local indicado» — o sítio NÃO se repete nas frases (decisão dela,
 *     28/10): fica uma vez, no resumo, tal como a pessoa o escreveu. A
 *     preposição adivinhada (`noSitio`) dava «em Rampa beach club».
 *   · sem data, ou sem local, a frase encurta — nunca fica uma vírgula a
 *     separar coisa nenhuma.
 *
 * ── O INGLÊS ────────────────────────────────────────────────────────────────
 *
 * É tradução da carta, com o mesmo desenho (o teste prova que o esqueleto é o
 * mesmo). Pedida por ela, e para ela rever.
 *
 * ── AS IMAGENS SÃO ANEXOS `cid:` ────────────────────────────────────────
 *
 * Nunca endereços remotos (ver `email-logo.ts`): o Gmail, o Outlook e o Apple
 * Mail bloqueiam imagens remotas de um remetente que a pessoa não conhece, que
 * é o caso de quem acabou de mandar o primeiro pedido.
 */

export type IdiomaDoPedidoRecebido = "pt" | "en";

/** Uma rede social que tem endereço E ícone anexado. */
export interface RedeDoEmail {
  nome: string;
  url: string;
  /** O `cid` do anexo com o ícone (sem o prefixo `cid:`). */
  cid: string;
}

export interface DadosDoPedidoRecebido {
  locale: IdiomaDoPedidoRecebido;
  /** Primeiro nome, já limpo. Vazio → «Olá,». */
  nome: string;
  /** A referência do pedido (LIQ-…). */
  referencia: string;
  pedido: {
    /** A etiqueta do evento, já na língua do email — vai para o assunto e o título. */
    evento: string;
    /** O tipo (`casamentos`, `conferencias`…) — dá o substantivo da frase. */
    tipo?: string | null;
    /** ISO `aaaa-mm-dd`. Vazio quando ela escolheu «ainda a definir». */
    data: string;
    /** Número exacto, quando o deu. */
    convidados?: number;
    /** A estimativa que escolheu («50 a 100»), já na língua do email. */
    convidadosEstimativa?: string;
    local: string;
    /** Já com o rótulo na língua do email («Interior», «Indoors»). */
    espaco: string;
    /** Já com o rótulo na língua do email («Religiosa», «Religious»). */
    cerimonia?: string;
    /** «Sim»/«Yes» quando pediram a coordenação do dia. */
    coordenacao?: string;
  };
  casa: {
    nome: string;
    cargo: string;
    /** `+351919259820` — vai para o `tel:`. */
    telefone: string;
    /** `+351 919 259 820` — o que se lê. */
    telefoneVisivel: string;
    email: string;
    /** `https://liquen-events.com` */
    site: string;
  };
  imagens: {
    /** `cid:…` do logótipo. */
    logo: string;
    /** `cid:…` do banner, ou `null` se o ficheiro faltar (o bloco não sai). */
    banner: string | null;
    redes: RedeDoEmail[];
  };
}

/** O substantivo de cada tipo, para entrar numa frase — com o género. */
const EVENTO_NA_FRASE: Record<string, { pt: string; feminino?: true; en: string }> = {
  casamentos: { pt: "casamento", en: "wedding" },
  batizados: { pt: "batizado", en: "christening" },
  aniversarios: { pt: "aniversário", en: "birthday" },
  jantares_gala: { pt: "jantar de gala", en: "gala dinner" },
  conferencias: { pt: "conferência", feminino: true, en: "conference" },
  teambuilding: { pt: "teambuilding", en: "team building" },
  lancamentos: { pt: "lançamento de produto", en: "product launch" },
  jantares_empresa: { pt: "jantar de empresa", en: "company dinner" },
};
const EVENTO_SEM_TIPO = { pt: "evento", en: "event" };

const semAcentos = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Sítios que se dizem com «na» (e, em inglês, com «at»). */
const SITIOS_FEMININOS = new Set(
  "quinta herdade casa igreja capela praia vila villa aldeia sala adega pousada estalagem tapada fazenda mata serra ermida se basilica catedral torre azenha cerca horta quintinha".split(
    " ",
  ),
);
/** Sítios que se dizem com «no» (e, em inglês, com «at»). */
const SITIOS_MASCULINOS = new Set(
  "convento palacio monte hotel solar paco castelo mosteiro restaurante espaco museu jardim parque clube centro teatro salao celeiro armazem palacete lagar moinho resort lodge".split(
    " ",
  ),
);
/** Regiões e cidades que levam artigo: «no Porto», «no Algarve». */
const LUGARES_COM_O = new Set(["porto", "algarve", "alentejo", "douro", "minho", "ribatejo"]);

/**
 * «na Quinta da Melhorada», «no Convento do Espinheiro», «em Évora».
 *
 * Pela primeira palavra do sítio. O que não se reconhece leva «em», que é o
 * certo para cidades e vilas (a maior parte dos locais escritos à mão) e
 * nunca é errado de forma grosseira. Um sítio escrito com o artigo («O
 * Convento») junta-o à preposição, em vez de dizer «no O Convento».
 */
export function noSitio(local: string, locale: IdiomaDoPedidoRecebido): string {
  const l = local.trim();
  const [primeira = "", ...resto] = l.split(/\s+/);
  const p = semAcentos(primeira);
  const ehLocalDeEventos = SITIOS_FEMININOS.has(p) || SITIOS_MASCULINOS.has(p);
  if (locale === "en") return `${ehLocalDeEventos ? "at" : "in"} ${l}`;
  if ((p === "a" || p === "o") && resto.length > 0) return `n${p} ${resto.join(" ")}`;
  if (SITIOS_FEMININOS.has(p)) return `na ${l}`;
  if (SITIOS_MASCULINOS.has(p) || LUGARES_COM_O.has(p)) return `no ${l}`;
  return `em ${l}`;
}

const TEXTOS = {
  pt: {
    lang: "pt",
    assunto: "Pedido de Proposta",
    titulo: "Pedido de proposta",
    rotulos: {
      data: "Data",
      local: "Local",
      convidados: "Convidados",
      espaco: "Espaço",
      cerimonia: "Cerimónia",
      coordenacao: "Coordenação do dia",
      referencia: "Referência",
    },
    aDefinir: "Ainda a definir",
    noLocalIndicado: "no local indicado",
    previsao: (v: string) => `${v} (previsão)`,
    preheader: (quando: string, onde: string) =>
      `Confirmamos a receção do vosso pedido${quando ? ` para ${quando}` : ""}${onde ? `, ${onde}` : ""}.`,
    agradecemos: (tipo: string | null | undefined, quando: string, onde: string) => {
      const e = (tipo && EVENTO_NA_FRASE[tipo]) || EVENTO_SEM_TIPO;
      const f = "feminino" in e && e.feminino;
      return `Agradecemos o seu contacto e o interesse demonstrado nos serviços da Líquen Events para a organização ${f ? "da vossa" : "do vosso"} ${e.pt}${
        quando ? `, ${f ? "prevista" : "previsto"} para o dia ${quando}` : ""
      }${onde ? `, ${onde}` : ""}.`;
    },
    confirmamos:
      "Confirmamos a receção de todos os detalhes partilhados na vossa solicitação, incluindo as vossas necessidades de decoração:",
    aNossaEquipa:
      "A nossa equipa já se encontra a analisar os dados fornecidos e a verificar a disponibilidade para a data indicada, com o objetivo de elaborar uma proposta detalhada e totalmente personalizada, ajustada às vossas expectativas.",
    entraremos:
      "Entraremos em contacto brevemente para enviar a respetiva proposta e, caso seja do vosso interesse, agendar uma reunião presencial ou por videochamada para podermos conversar detalhadamente sobre o vosso dia.",
    casoNecessite:
      "Caso necessite de retificar alguma informação ou adicionar novos detalhes até lá, poderá responder diretamente a este e&#8209;mail ou contactar-nos através dos canais habituais.",
    casoNecessiteTexto:
      "Caso necessite de retificar alguma informação ou adicionar novos detalhes até lá, poderá responder diretamente a este e-mail ou contactar-nos através dos canais habituais.",
    cumprimentos: "Apresentamos os nossos melhores cumprimentos,",
    porque: (ligacao: string) =>
      `Líquen Events, Portugal. Recebeu este e-mail porque enviou um pedido de proposta em ${ligacao}.`,
  },
  en: {
    lang: "en",
    assunto: "Proposal Request",
    titulo: "Proposal request",
    rotulos: {
      data: "Date",
      local: "Location",
      convidados: "Guests",
      espaco: "Space",
      cerimonia: "Ceremony",
      coordenacao: "Day-of coordination",
      referencia: "Reference",
    },
    aDefinir: "Still to be decided",
    noLocalIndicado: "at the venue you mentioned",
    previsao: (v: string) => `${v} (estimate)`,
    preheader: (quando: string, onde: string) =>
      `We confirm receipt of your request${quando ? ` for ${quando}` : ""}${onde ? `, ${onde}` : ""}.`,
    agradecemos: (tipo: string | null | undefined, quando: string, onde: string) => {
      const e = (tipo && EVENTO_NA_FRASE[tipo]) || EVENTO_SEM_TIPO;
      return `Thank you for getting in touch and for your interest in Líquen Events' services for the organisation of your ${e.en}${
        quando ? `, planned for ${quando}` : ""
      }${onde ? `, ${onde}` : ""}.`;
    },
    confirmamos:
      "We confirm that we have received all the details shared in your request, including your decoration needs:",
    aNossaEquipa:
      "Our team is already reviewing the information provided and checking availability for the date indicated, in order to prepare a detailed and fully personalised proposal, tailored to your expectations.",
    entraremos:
      "We will be in touch shortly to send you the proposal and, should you wish, to arrange a meeting in person or by video call so that we can talk through your day in detail.",
    casoNecessite:
      "Should you need to correct any information or add further details in the meantime, you can reply directly to this email or contact us through the usual channels.",
    casoNecessiteTexto:
      "Should you need to correct any information or add further details in the meantime, you can reply directly to this email or contact us through the usual channels.",
    cumprimentos: "Kind regards,",
    porque: (ligacao: string) =>
      `Líquen Events, Portugal. You are receiving this email because you sent a proposal request at ${ligacao}.`,
  },
} as const;

/**
 * Uma linha da tabela do resumo. Todas têm o filete de cima; a ÚLTIMA leva
 * também o de baixo — é assim no desenho dela, e o filete fica sempre na linha
 * que é a última de facto, mesmo que alguma falte. A referência quebra onde
 * for preciso (é uma cadeia comprida sem espaços).
 */
function linhaDoResumo(rotulo: string, valor: string, ultima: boolean, quebra: boolean): string {
  const fundo = ultima ? "border-bottom:1px solid #d2d2d7;" : "";
  return `      <tr>
        <td class="lbl t2 line" width="140" valign="top" style="width:140px;padding:12px 12px 12px 0;border-top:1px solid #d2d2d7;${fundo}color:#6e6e73;">${esc(rotulo)}</td>
        <td class="t1 line" valign="top" style="padding:12px 0;border-top:1px solid #d2d2d7;${fundo}color:#1d1d1f;${quebra ? "word-break:break-all;" : ""}">${esc(valor)}</td>
      </tr>
`;
}

/** Os ícones das redes, com 14 px entre eles e nenhum depois do último. */
function blocoDasRedes(redes: readonly RedeDoEmail[]): string {
  if (redes.length === 0) return "";
  const icones = redes
    .map(
      (r, i) =>
        `      <a href="${esc(r.url)}"><img src="cid:${esc(r.cid)}" width="18" height="18" alt="${esc(r.nome)}" style="display:inline-block;${
          i < redes.length - 1 ? "margin-right:14px;" : ""
        }font-size:11px;color:#6e6e73;"></a>
`,
    )
    .join("");
  return `    <p style="margin:14px 0 0;font-size:0;line-height:0;">
${icones}    </p>
`;
}

function blocoDoBanner(banner: string | null, site: string): string {
  if (!banner) return "";
  return `  <!-- Banner Líquen -->
  <tr><td class="pad" style="padding:32px 40px 0;">
    <a href="${site}" style="text-decoration:none;display:block;">
      <img src="${esc(banner)}" width="520" alt="LÍQUEN EVENTS" style="display:block;width:100%;max-width:520px;height:auto;background:#4d6650;color:#ffffff;font-size:18px;line-height:140px;font-weight:600;letter-spacing:3px;text-align:center;">
    </a>
  </td></tr>

`;
}

/**
 * A folha de estilo da carta, à letra. Exportada porque o email que a EQUIPA
 * recebe quando chega um pedido passou a ter a mesma estrutura (14/10: «quero
 * que coloques a estrutura do email que enviamos para o cliente… no email que
 * recebemos quando recebemos o pedido do cliente»). Uma folha só: se a carta
 * mudar de cor no modo escuro, o email da equipa muda com ela.
 */
export const ESTILO_DA_CARTA = `<style>
  body { margin:0; padding:0; width:100% !important; background:#ffffff; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }
  img { border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }

  @media only screen and (max-width:640px) {
    .pad { padding-left:24px !important; padding-right:24px !important; }
    .top { padding-top:32px !important; }
    .h1 { font-size:28px !important; line-height:32px !important; }
    .lbl { width:112px !important; }
  }

  @media (prefers-color-scheme: dark) {
    body, .page { background:#000000 !important; }
    .t1 { color:#f5f5f7 !important; }
    .t2 { color:#a1a1a6 !important; }
    .t3 { color:#86868b !important; }
    .line { border-color:#424245 !important; }
    .accent { color:#9dc0a2 !important; }
  }
</style>`;

export function emailPedidoRecebido(d: DadosDoPedidoRecebido): {
  subject: string;
  html: string;
  text: string;
} {
  const t = TEXTOS[d.locale];
  const dominio = d.casa.site.replace(/^https?:\/\//, "");
  const site = esc(d.casa.site);
  const email = esc(d.casa.email);
  const logo = esc(d.imagens.logo);

  const evento = d.pedido.evento.trim();
  const dataLonga = d.pedido.data ? longDate(d.pedido.data, d.locale) : "";
  const local = d.pedido.local.trim();
  /**
   * «no local indicado», e não o sítio escrito outra vez.
   *
   * Ela (28/10): o local aparecia três vezes — no resumo, na frase de abertura
   * e na pré-visualização da caixa de correio — e, nas duas frases, com a
   * preposição adivinhada pela primeira palavra («em Rampa beach club»). O
   * sítio fica UMA vez, no resumo, tal e qual a pessoa o escreveu; as frases
   * dizem só que é lá.
   */
  const onde = local ? t.noLocalIndicado : "";

  // «Pedido de Proposta – Casamento | 10 de junho de 2028», e sem o que faltar.
  const subject = `${t.assunto}${evento ? ` – ${evento}` : ""}${dataLonga ? ` | ${dataLonga}` : ""}`;
  // «Casamento, 10 de junho de 2028» por baixo do título.
  const subtitulo = [evento, dataLonga].filter(Boolean).join(", ");
  const saudacao = saudacaoDaCarta(d.nome, d.locale);
  const agradecemos = t.agradecemos(d.pedido.tipo, dataLonga, onde);
  const preheader = t.preheader(dataLonga, onde);

  // ── O RESUMO: O QUE ELE ESCOLHEU NO FORMULÁRIO, DITO COMO O ESCOLHEU ────
  const convidados = d.pedido.convidados
    ? String(d.pedido.convidados)
    : (d.pedido.convidadosEstimativa ?? "").trim();
  const valores = {
    data: dataLonga || t.aDefinir,
    local,
    convidados: convidados ? t.previsao(convidados) : "",
    espaco: d.pedido.espaco.trim(),
    cerimonia: (d.pedido.cerimonia ?? "").trim(),
    coordenacao: (d.pedido.coordenacao ?? "").trim(),
    referencia: d.referencia.trim(),
  };
  // Uma linha só fica de fora se chegar vazia — um rótulo com nada à frente
  // lê-se como avaria.
  const presentes = (
    ["data", "local", "convidados", "espaco", "cerimonia", "coordenacao", "referencia"] as const
  ).filter((k) => valores[k] !== "");
  const linhas = presentes
    .map((k, i) =>
      linhaDoResumo(t.rotulos[k], valores[k], i === presentes.length - 1, k === "referencia"),
    )
    .join("");

  const subtituloHtml = subtitulo
    ? `
    <p class="t2" style="margin:6px 0 0;font-size:17px;line-height:24px;color:#6e6e73;">${esc(subtitulo)}</p>`
    : "";
  const cargo = esc(d.casa.cargo ? `${d.casa.cargo}, Líquen Events` : "Líquen Events");
  const ligacaoDoSite = `<a href="${site}" class="t3" style="color:#86868b;text-decoration:underline;">${esc(dominio)}</a>`;

  const html = `<!DOCTYPE html>
<html lang="${t.lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(subject)}</title>
<!--[if mso]>
<style>table,td,div,p,a,h1{font-family:'Segoe UI',Arial,sans-serif !important;}</style>
<![endif]-->
${ESTILO_DA_CARTA}
</head>
<body style="margin:0;padding:0;background:#ffffff;">

<!-- Pré-visualização na caixa de entrada -->
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">${esc(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="page" style="background:#ffffff;">
<tr><td align="center">

<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1d1d1f;">

  <!-- Logótipo -->
  <tr><td class="pad top" style="padding:48px 40px 0;">
    <a href="${site}" style="text-decoration:none;">
      <img src="${logo}" width="96" alt="LÍQUEN EVENTS" style="display:block;width:96px;height:auto;font-size:12px;line-height:16px;font-weight:600;letter-spacing:2px;color:#4d6650;">
    </a>
  </td></tr>

  <!-- Título -->
  <tr><td class="pad" style="padding:40px 40px 0;">
    <h1 class="h1 t1" style="margin:0;font-size:32px;line-height:36px;font-weight:600;letter-spacing:0.1px;color:#1d1d1f;">${t.titulo}</h1>${subtituloHtml}
  </td></tr>

  <!-- Linha -->
  <tr><td class="pad" style="padding:28px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="line" style="border-top:1px solid #d2d2d7;font-size:0;line-height:0;">&nbsp;</td></tr></table>
  </td></tr>

  <!-- Carta: primeira parte -->
  <tr><td class="pad" style="padding:28px 40px 0;">
    <p class="t1" style="margin:0;font-size:17px;line-height:27px;color:#1d1d1f;">${esc(saudacao)}</p>
    <p class="t1" style="margin:18px 0 0;font-size:17px;line-height:27px;color:#1d1d1f;text-align:justify;">${esc(agradecemos)}</p>
    <p class="t1" style="margin:18px 0 0;font-size:17px;line-height:27px;color:#1d1d1f;text-align:justify;">${t.confirmamos}</p>
  </td></tr>

  <!-- Resumo do pedido: tabela de linhas finas -->
  <tr><td class="pad" style="padding:24px 40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:15px;line-height:22px;">
${linhas}    </table>
  </td></tr>

  <!-- Carta: segunda parte -->
  <tr><td class="pad" style="padding:26px 40px 0;">
    <p class="t1" style="margin:0;font-size:17px;line-height:27px;color:#1d1d1f;text-align:justify;">${t.aNossaEquipa}</p>
    <p class="t1" style="margin:18px 0 0;font-size:17px;line-height:27px;color:#1d1d1f;text-align:justify;">${t.entraremos}</p>
    <p class="t1" style="margin:18px 0 0;font-size:17px;line-height:27px;color:#1d1d1f;text-align:justify;">${t.casoNecessite}</p>
    <p class="t1" style="margin:30px 0 0;font-size:17px;line-height:27px;color:#1d1d1f;">${t.cumprimentos}</p>
  </td></tr>

  <!-- Assinatura -->
  <tr><td class="pad" style="padding:22px 40px 0;">
    <p class="t1" style="margin:0;font-size:17px;line-height:24px;font-weight:600;color:#1d1d1f;">${esc(d.casa.nome)}</p>
    <p class="t2" style="margin:0;font-size:15px;line-height:22px;color:#6e6e73;">${cargo}</p>
    <p class="t2" style="margin:12px 0 0;font-size:15px;line-height:24px;color:#6e6e73;">
      <a href="tel:${esc(d.casa.telefone)}" class="t2" style="color:#6e6e73;text-decoration:none;">${esc(d.casa.telefoneVisivel)}</a><br>
      <a href="mailto:${email}" class="accent" style="color:#4d6650;text-decoration:none;">${email}</a><br>
      <a href="${site}" class="accent" style="color:#4d6650;text-decoration:none;">${esc(dominio)}</a>
    </p>
${blocoDasRedes(d.imagens.redes)}  </td></tr>

${blocoDoBanner(d.imagens.banner, site)}  <!-- Rodapé legal -->
  <tr><td class="pad" style="padding:28px 40px 48px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td class="line" style="border-top:1px solid #d2d2d7;padding-top:16px;">
        <p class="t3" style="margin:0;font-size:12px;line-height:17px;color:#86868b;">${t.porque(ligacaoDoSite)}</p>
      </td></tr>
    </table>
  </td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->

</td></tr>
</table>
</body>
</html>
`;

  // Paralelo ao HTML — os filtros lêem esta parte, e duas alternativas muito
  // diferentes são, por si só, um sinal de spam.
  const text = [
    t.titulo,
    ...(subtitulo ? [subtitulo] : []),
    "",
    saudacao,
    "",
    agradecemos,
    "",
    t.confirmamos,
    "",
    ...presentes.map((k) => `${t.rotulos[k]}: ${valores[k]}`),
    "",
    t.aNossaEquipa,
    "",
    t.entraremos,
    "",
    t.casoNecessiteTexto,
    "",
    t.cumprimentos,
    "",
    d.casa.nome,
    d.casa.cargo ? `${d.casa.cargo}, Líquen Events` : "Líquen Events",
    d.casa.telefoneVisivel,
    d.casa.email,
    dominio,
    ...d.imagens.redes.map((r) => `${r.nome}: ${r.url}`),
    "",
    t.porque(dominio),
  ].join("\n");

  return { subject, html, text };
}
