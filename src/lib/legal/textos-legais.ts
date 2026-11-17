/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS TEXTOS LEGAIS DO SÍTIO E DO CORREIO — UMA FONTE SÓ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido do Francisco, 17/11 (`docs/LEGAL-FORMULARIO.md` e
 * `docs/LEGAL-EMAILS.md`): a nota de proteção de dados por baixo dos
 * formulários, a resolução de litígios no rodapé de todas as páginas e o
 * mesmo rodapé nos e-mails. Os três dizem as mesmas coisas — o CNIACC, a
 * política, o Livro de Reclamações — e por isso o texto vive aqui uma vez, e
 * a página, o formulário e o e-mail leem-no daqui.
 *
 * Sem `server-only`: a nota do formulário é desenhada em componentes de
 * cliente. Nada aqui é segredo.
 *
 * O que NÃO está aqui, por decisão do dono (`.claude/rules/legal.md`): a
 * identificação legal da empresa (denominação, NIF, morada). Nem preparada,
 * nem escondida.
 *
 * E a plataforma europeia ODR também não: o Reg. (UE) 2024/3228 extinguiu-a
 * a 20/07/2025. Um teste (`textos-legais.test.ts`) prende que não volta.
 */

export type Lingua = "pt" | "en";

/** Um bocado de frase: texto corrido, ou uma ligação. */
export type Troco = string | { texto: string; href: string };

export const CNIACC_URL = "https://www.cniacc.pt/";
export const PORTAL_DO_CONSUMIDOR_URL = "https://www.consumidor.gov.pt/";

/**
 * O prazo de conservação dos pedidos sem evento, em meses. É o mesmo que a
 * política publica (secção 4) e o mesmo que `retencao.ts` cumpre (`PRAZO_MS`,
 * 365 dias); um teste confere os três.
 */
export const MESES_DE_CONSERVACAO = 12;

/** O `aria-label` do Livro de Reclamações (texto do documento, 17/11). */
export const ROTULO_DO_LIVRO: Record<Lingua, { nome: string; rotulo: string }> = {
  pt: {
    nome: "Livro de Reclamações Eletrónico",
    rotulo: "Livro de Reclamações Eletrónico (abre noutro separador)",
  },
  en: { nome: "Complaints Book", rotulo: "Complaints Book (opens in a new tab)" },
};

/** A resolução alternativa de litígios (Lei 144/2015, art. 18.º). */
export const RESOLUCAO_DE_LITIGIOS: Record<Lingua, Troco[]> = {
  pt: [
    "Em caso de litígio de consumo, o consumidor pode recorrer ao CNIACC — Centro Nacional de Informação e Arbitragem de Conflitos de Consumo (",
    { texto: "cniacc.pt", href: CNIACC_URL },
    "). Mais informação no ",
    { texto: "Portal do Consumidor", href: PORTAL_DO_CONSUMIDOR_URL },
    ".",
  ],
  en: [
    "In the event of a consumer dispute, the consumer may refer it to CNIACC, the National Centre for Information and Arbitration of Consumer Disputes (",
    { texto: "cniacc.pt", href: CNIACC_URL },
    "). Further information on the ",
    { texto: "Consumer Portal", href: PORTAL_DO_CONSUMIDOR_URL },
    ".",
  ],
};

/** As três ligações legais do rodapé. Os caminhos são os do sítio em PT; quem
 *  desenha localiza-os (`localizeHref`). */
export const LIGACOES_LEGAIS: Record<Lingua, { texto: string; caminho: string }[]> = {
  pt: [
    { texto: "Privacidade", caminho: "/privacidade" },
    { texto: "Cookies", caminho: "/privacidade#cookies" },
    { texto: "Termos", caminho: "/termos" },
  ],
  en: [
    { texto: "Privacy", caminho: "/privacidade" },
    { texto: "Cookies", caminho: "/privacidade#cookies" },
    { texto: "Terms", caminho: "/termos" },
  ],
};

/** O nome da navegação com as três ligações, para quem lê com leitor de ecrã. */
export const NOME_DAS_LIGACOES: Record<Lingua, string> = {
  pt: "Informação legal",
  en: "Legal information",
};

/**
 * A nota por baixo do botão «Enviar» de todos os formulários de pedido.
 * Não leva caixa de «aceito»: a base legal é o pedido do próprio titular.
 * O último troço é a ligação à política (o caminho, por localizar).
 */
export const NOTA_DO_FORMULARIO: Record<Lingua, Troco[]> = {
  pt: [
    `A Líquen Events trata estes dados apenas para responder ao pedido e preparar a proposta, a pedido do titular (artigo 6.º, n.º 1, alínea b), do RGPD). Os pedidos que não resultem em evento são eliminados ao fim de ${MESES_DE_CONSERVACAO} meses. Os prestadores envolvidos, os direitos do titular e a forma de os exercer constam da `,
    { texto: "Política de privacidade", href: "/privacidade" },
    ".",
  ],
  en: [
    `Líquen Events processes this data solely to respond to the request and prepare the proposal, at the request of the data subject (Article 6(1)(b) GDPR). Requests that do not lead to an event are deleted after ${MESES_DE_CONSERVACAO} months. The service providers involved, the rights of the data subject and how to exercise them are set out in the `,
    { texto: "Privacy policy", href: "/privacidade" },
    ".",
  ],
};

/** Junta os troços em texto simples, com os endereços por extenso. */
export function trocosEmTexto(trocos: Troco[], base = ""): string {
  return trocos
    .map((t) => {
      if (typeof t === "string") return t;
      const href = t.href.startsWith("/") ? `${base}${t.href}` : t.href;
      // «cniacc.pt» já é o endereço: não se repete entre parênteses.
      return href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") === t.texto
        ? href
        : `${t.texto} (${href})`;
    })
    .join("");
}
