import { esc } from "./mail";
import { SITE } from "./site";
import {
  RESOLUCAO_DE_LITIGIOS,
  ROTULO_DO_LIVRO,
  trocosEmTexto,
  type Lingua,
  type Troco,
} from "./legal/textos-legais";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O RODAPÉ LEGAL DO CORREIO AO CLIENTE — UM SÓ, EM TODOS OS E-MAILS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido do Francisco, 17/11 (`docs/LEGAL-EMAILS.md`): no fundo de todos os
 * e-mails automáticos a clientes, a proteção de dados (RGPD, art. 13.º), a
 * resolução de litígios (Lei 144/2015, art. 18.º), o Livro de Reclamações
 * (DL 156/2005, art. 5.º-B) e «Recebeu este e-mail porque…». PT e EN, HTML e
 * texto simples. A finalidade muda com o e-mail (ver {@link Finalidade}).
 *
 * Os textos do CNIACC e do Livro são os do sítio (`textos-legais.ts`). Sem a
 * identificação legal da empresa: decisão do dono (`.claude/rules/legal.md`).
 *
 * ── O ÍCONE VAI POR URL, AO CONTRÁRIO DO RESTO DA ASSINATURA ──────────────
 * A assinatura manda as imagens por `cid:` (`email-assinatura.ts`). Este
 * ícone vai por URL absoluto, por instrução do dono (17/11): PNG, com `alt`,
 * `width` e `height`. Quando o cliente de correio bloqueia imagens remotas, o
 * `alt` lê-se no lugar do ícone e a ligação continua lá — e há sempre a
 * linha de texto com o nome e o endereço por extenso, ao lado.
 *
 * Duas versões, para contrastar: a oficial (vermelha) em fundo claro, e a
 * silhueta branca em modo escuro, trocadas por `prefers-color-scheme` onde o
 * cliente o entende — só nas molduras que têm modo escuro (`modoEscuro`).
 * Onde não entende, fica a oficial.
 */

/** Para que se tratam os dados, consoante o e-mail. */
export type Finalidade = "pedido" | "proposta" | "faturacao";

const ICONE_ESCURO = "/logos/livro-de-reclamacoes-email-escuro.png";
const ICONE_CLARO = "/logos/livro-de-reclamacoes-email-claro.png";
/** O tamanho em que se mostra (os ficheiros têm o dobro, 240×97). */
const ICONE_L = 120;
const ICONE_A = 48;

const TEXTOS: Record<
  Lingua,
  {
    protecao: string;
    finalidade: Record<Finalidade, string>;
    resto: string;
    politica: string;
    litigios: string;
    porque: (dominio: string) => string;
  }
> = {
  pt: {
    protecao: "Proteção de dados.",
    finalidade: {
      pedido:
        "A Líquen Events trata os dados deste pedido apenas para lhe responder e preparar a proposta, a pedido do titular (artigo 6.º, n.º 1, alínea b), do RGPD).",
      proposta:
        "A Líquen Events trata os dados deste pedido apenas para preparar e executar a proposta, a pedido do titular (artigo 6.º, n.º 1, alínea b), do RGPD).",
      faturacao:
        "A Líquen Events trata os dados deste pedido para preparar e executar a proposta, a pedido do titular (artigo 6.º, n.º 1, alínea b), do RGPD), e para cumprir as obrigações legais de faturação (alínea c) do mesmo número).",
    },
    resto: "Os prazos de conservação, os direitos do titular e a forma de os exercer constam da",
    politica: "Política de Privacidade",
    litigios: "Resolução de litígios.",
    porque: (d) => `Recebeu este e-mail porque foi submetido um pedido em ${d} com este endereço.`,
  },
  en: {
    protecao: "Data protection.",
    finalidade: {
      pedido:
        "Líquen Events processes the data in this request solely to reply and prepare the proposal, at the data subject's request (Article 6(1)(b) GDPR).",
      proposta:
        "Líquen Events processes the data in this request solely to prepare and carry out the proposal, at the data subject's request (Article 6(1)(b) GDPR).",
      faturacao:
        "Líquen Events processes the data in this request to prepare and carry out the proposal, at the data subject's request (Article 6(1)(b) GDPR), and to comply with its legal invoicing obligations (Article 6(1)(c) GDPR).",
    },
    resto:
      "Retention periods, the data subject's rights and how to exercise them are set out in the",
    politica: "Privacy Policy",
    litigios: "Dispute resolution.",
    porque: (d) =>
      `You are receiving this e-mail because a request was submitted at ${d} with this address.`,
  },
};

const COR_TEXTO = "#6e6e73";
const COR_LIGACAO = "#4d6650";
const COR_FILETE = "#d2d2d7";
const LETRA = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * As regras do modo escuro e da troca do ícone. Classes com prefixo próprio
 * (`rl-`), para não colidirem com as de nenhuma moldura.
 *
 * SÓ entram quando a moldura tem modo escuro a sério (fundo escuro em
 * `prefers-color-scheme: dark`). Medido nas capturas de 17/11: na moldura do
 * `emailAoCliente`, que é sempre branca, a silhueta branca desaparecia no
 * branco e o cinzento claro do texto ficava a 2,6:1. Aí fica a versão oficial
 * e as cores de dia, sempre.
 */
const ESTILO = `<style>
@media (prefers-color-scheme: dark){
  .rl-t{color:#a1a1a6 !important}
  .rl-a{color:#9dc0a2 !important}
  .rl-f{border-color:#424245 !important}
  .rl-ie{display:none !important}
  .rl-ic{display:inline-block !important;max-height:none !important}
}
</style>`;

function ligacaoHtml(texto: string, href: string): string {
  return `<a class="rl-a" href="${esc(href)}" style="color:${COR_LIGACAO};text-decoration:underline">${esc(texto)}</a>`;
}

function trocosHtml(trocos: Troco[]): string {
  return trocos
    .map((t) => (typeof t === "string" ? esc(t) : ligacaoHtml(t.texto, t.href)))
    .join("");
}

/** Os endereços do sítio, por língua. */
function urlDaPolitica(lingua: Lingua, base: string): string {
  return `${base}${lingua === "en" ? "/en" : ""}/privacidade`;
}

/**
 * O rodapé legal, nas duas formas. `base` é o endereço do sítio (por omissão
 * `SITE.url`); as capturas locais trocam-no para o servidor de teste.
 */
export function rodapeLegalDoEmail({
  lingua,
  finalidade,
  base = SITE.url,
  modoEscuro = false,
}: {
  lingua: Lingua;
  finalidade: Finalidade;
  base?: string;
  /** A moldura escurece o fundo em modo escuro? (Ver {@link ESTILO}.) */
  modoEscuro?: boolean;
}): { html: string; texto: string } {
  const t = TEXTOS[lingua];
  const raiz = base.replace(/\/$/, "");
  const dominio = raiz.replace(/^https?:\/\//, "");
  const politica = urlDaPolitica(lingua, raiz);
  const livro = ROTULO_DO_LIVRO[lingua];
  const p = (conteudo: string, extra = "") =>
    `<p class="rl-t" style="margin:0 0 10px;font-family:${LETRA};font-size:11px;line-height:17px;mso-line-height-rule:exactly;color:${COR_TEXTO}${extra}">${conteudo}</p>`;

  const iconeClaro = modoEscuro
    ? `<!--[if !mso]><!--><img class="rl-ic" src="${esc(raiz + ICONE_CLARO)}" alt="${esc(livro.nome)}" width="${ICONE_L}" height="${ICONE_A}" style="display:none;max-height:0;width:${ICONE_L}px;height:${ICONE_A}px;border:0"><!--<![endif]-->`
    : "";
  const html = `${modoEscuro ? ESTILO : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-rodape-legal="" style="border-collapse:collapse;margin-top:24px">
  <tr><td class="rl-f" style="border-top:1px solid ${COR_FILETE};padding-top:16px">
    ${p(`<strong>${esc(t.protecao)}</strong> ${esc(t.finalidade[finalidade])} ${esc(t.resto)} ${ligacaoHtml(t.politica, politica)}.`)}
    ${p(`<strong>${esc(t.litigios)}</strong> ${trocosHtml(RESOLUCAO_DE_LITIGIOS[lingua])}`)}
    <p style="margin:4px 0 10px;font-size:0;line-height:0">
      <a href="${esc(SITE.livroReclamacoes)}" title="${esc(livro.nome)}" style="display:inline-block;text-decoration:none">
        <img class="rl-ie" src="${esc(raiz + ICONE_ESCURO)}" alt="${esc(livro.nome)}" width="${ICONE_L}" height="${ICONE_A}" style="display:inline-block;width:${ICONE_L}px;height:${ICONE_A}px;border:0;font-family:${LETRA};font-size:11px;line-height:${ICONE_A}px;color:${COR_TEXTO}">
        ${iconeClaro}
      </a>
    </p>
    ${p(esc(t.porque(dominio)), ";margin-bottom:0")}
  </td></tr>
</table>`;

  const texto = [
    "",
    "—",
    `${t.protecao} ${t.finalidade[finalidade]} ${t.resto} ${t.politica} (${politica}).`,
    "",
    `${t.litigios} ${trocosEmTexto(RESOLUCAO_DE_LITIGIOS[lingua])}`,
    "",
    `${livro.nome}: ${SITE.livroReclamacoes}`,
    "",
    t.porque(dominio),
  ].join("\n");

  return { html, texto };
}

/**
 * A finalidade de um modelo enviado a pedido (`email-modelos.ts`). O do sinal
 * fala de um pagamento recebido: leva também a obrigação legal de faturação
 * (al. c), como pede o documento. Os outros acompanham a proposta.
 */
export function finalidadeDoModelo(chave: string): Finalidade {
  return chave === "sinal-recebido" ? "faturacao" : "proposta";
}

/** A língua de um pedido gravado (`quote.locale`), para o rodapé. */
export function linguaDoPedido(locale: string | undefined | null): Lingua {
  return locale === "en" ? "en" : "pt";
}
