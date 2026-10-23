import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";

/**
 * Os textos da MOLDURA da proposta online (o protótipo dela de 23/10): a barra,
 * os botões, as frases de passagem. Os textos do DOCUMENTO — títulos, factos,
 * condições, valores — vêm do motor do PDF (`conteudoDoEditorial`) e nunca
 * daqui, para a página e o PDF não poderem dizer coisas diferentes.
 *
 * Regra que continua (`nada-de-aceitar-por-botao.test.ts`): nada aqui convida a
 * aceitar online. «Quero avançar» leva ao fecho, onde se responde por WhatsApp
 * ou por email — uma conversa, como ela pediu.
 */
export interface TextosWeb {
  capa: (organizacao: boolean) => string;
  descer: string;
  ola: (nomes: string) => string;
  introducao: string;
  ancoras: {
    proposta: string;
    servicos: string;
    inspiracao: string;
    investimento: string;
    condicoes: string;
  };
  queroAvancar: string;
  verCondicoes: string;
  oQuePropomos: string;
  textoDosServicos: string;
  paleta: string;
  totalComIva: string;
  condicoesSobre: string;
  obrigado: (nome: string) => string;
  tituloDoFecho: string;
  fraseDoFecho: string;
  copiar: string;
  copiado: string;
  responderWhatsApp: string;
  responderEmail: string;
  mensagemWhatsApp: (nomes: string) => string;
  assuntoEmail: (nomes: string) => string;
  validaAte: (data: string) => string;
  emitidaA: (data: string) => string;
  verPdf: string;
  fechar: string;
  anterior: string;
  seguinte: string;
  fotografia: string;
  convidados: (n: string) => string;
}

const PT: TextosWeb = {
  capa: (org) => (org ? "uma proposta de organização para" : "uma proposta de decoração para"),
  descer: "descer",
  ola: (nomes) => (nomes ? `Olá, ${nomes}.` : "Olá."),
  introducao:
    "Pensámos cada pormenor: as mesas, a luz, as flores e cada canto do espaço. Está tudo aqui, à vossa medida.",
  ancoras: {
    proposta: "Proposta",
    servicos: "Serviços",
    inspiracao: "Inspiração",
    investimento: "Investimento",
    condicoes: "Condições",
  },
  queroAvancar: "Quero avançar",
  verCondicoes: "Ver condições",
  oQuePropomos: "o que propomos",
  textoDosServicos:
    "Cada serviço foi desenhado para trabalhar com os outros: contam a mesma história.",
  paleta: "paleta & ambiente",
  totalComIva: "Total com IVA incluído",
  condicoesSobre: "o que precisa de saber",
  obrigado: (nome) => (nome ? `obrigado, ${nome}` : "obrigado"),
  tituloDoFecho: "Vamos fazer este dia acontecer",
  fraseDoFecho:
    "Para avançar, basta responder-nos por email ou por telefone. Tratamos de tudo a partir daqui.",
  copiar: "Copiar",
  copiado: "Copiado",
  responderWhatsApp: "Responder por WhatsApp",
  responderEmail: "Responder por email",
  mensagemWhatsApp: (nomes) =>
    `Olá! Vimos a proposta${nomes ? ` para ${nomes}` : ""} e queremos avançar.`,
  assuntoEmail: (nomes) => `Proposta${nomes ? ` — ${nomes}` : ""}: queremos avançar`,
  validaAte: (d) => `Válida até ${d}`,
  emitidaA: (d) => `Emitida a ${d}`,
  verPdf: "Ver a proposta em PDF",
  fechar: "Fechar",
  anterior: "Anterior",
  seguinte: "Seguinte",
  fotografia: "Fotografia",
  convidados: (n) => `${n} convidados`,
};

const EN: TextosWeb = {
  capa: (org) => (org ? "an event planning proposal for" : "a decoration proposal for"),
  descer: "scroll",
  ola: (nomes) => (nomes ? `Hello, ${nomes}.` : "Hello."),
  introducao:
    "We thought through every detail: the tables, the light, the flowers and every corner of the venue. It is all here, made to measure.",
  ancoras: {
    proposta: "Proposal",
    servicos: "Services",
    inspiracao: "Inspiration",
    investimento: "Investment",
    condicoes: "Conditions",
  },
  queroAvancar: "I want to go ahead",
  verCondicoes: "See conditions",
  oQuePropomos: "what we propose",
  textoDosServicos: "Each service was designed to work with the others: they tell the same story.",
  paleta: "palette & atmosphere",
  totalComIva: "Total including VAT",
  condicoesSobre: "what you need to know",
  obrigado: (nome) => (nome ? `thank you, ${nome}` : "thank you"),
  tituloDoFecho: "Let’s make this day happen",
  fraseDoFecho: "To go ahead, just reply by email or phone. We take care of everything from here.",
  copiar: "Copy",
  copiado: "Copied",
  responderWhatsApp: "Reply on WhatsApp",
  responderEmail: "Reply by email",
  mensagemWhatsApp: (nomes) =>
    `Hello! We saw the proposal${nomes ? ` for ${nomes}` : ""} and would like to go ahead.`,
  assuntoEmail: (nomes) => `Proposal${nomes ? ` — ${nomes}` : ""}: we would like to go ahead`,
  validaAte: (d) => `Valid until ${d}`,
  emitidaA: (d) => `Issued on ${d}`,
  verPdf: "See the proposal as a PDF",
  fechar: "Close",
  anterior: "Previous",
  seguinte: "Next",
  fotografia: "Photograph",
  convidados: (n) => `${n} guests`,
};

export const textosWeb = (idioma: IdiomaDaProposta): TextosWeb => (idioma === "en" ? EN : PT);
