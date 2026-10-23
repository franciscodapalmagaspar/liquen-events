import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import type { Grupo } from "./grupos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE O DESENHO NOVO DIZ POR SI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Só os RÓTULOS que o desenho novo traz e o antigo não tinha: o índice, os
 * nomes dos capítulos, o rodapé, as etiquetas curtas dos factos. Tudo o resto —
 * a capa, o «Obrigada», o lema, as notas, as condições, os textos legais — vem
 * de `textosDaProposta` e de `blocosFixosNaLingua`, tal e qual, e não se repete
 * aqui: duas verdades para a mesma frase discordavam no dia em que alguém
 * mudasse uma.
 *
 * As etiquetas dos factos são as CURTAS do exemplo dela («Data», «Convidados»),
 * e não as do quadro antigo («Data do Evento», «Número de Convidados»): numa
 * grelha de quatro colunas com letra espaçada, as compridas não cabem numa
 * linha.
 */
export interface TextosEditoriais {
  indice: string;
  tituloIndice: string;
  /** A entrada do índice para a página «A proposta» (o sobretítulo é da casa). */
  aProposta: string;
  /** O título da página «A proposta», com os primeiros nomes do casal. */
  /**
   * O título da página «A proposta». Num casamento, «para o dia de A e B»; fora
   * dele (um restaurante, uma empresa, uma festa) não há «dia» de ninguém —
   * «para o Restaurante X», ou «para o vosso evento».
   */
  tituloDaProposta: (nomes: string | null, organizacao: boolean, casamento?: boolean) => string;
  factos: {
    evento: string;
    data: string;
    local: string;
    convidados: string;
    noivos: string;
    cliente: string;
    cerimonia: string;
    servico: string;
    hora: string;
  };
  inspiracao: string;
  /** O subtítulo da segunda página de um tema com mais de doze fotografias. */
  maisIdeias: string;
  grupos: Readonly<Record<Grupo, string>>;
  /** A linha do rodapé depois da marca: «Proposta de decoração». */
  rodapeModelo: (organizacao: boolean) => string;
  /** A marca de um PDF descarregado com erros por resolver — à frente do rodapé. */
  rascunho: string;

  // ── O que propomos ──
  /** «Seis serviços de decoração floral e decoração» — `grupo` é o título do
   *  grupo de serviços quando há um só, já em minúsculas. */
  tituloServicos: (quantos: number, grupo: string | null) => string;

  /** O sobretítulo da capa (§6.1): «proposta de decoração», «proposta de casamento». */
  sobretituloCapa: (organizacao: boolean, casamento: boolean) => string;
  /** O sobretítulo da citação (§6.7). */
  formaDeVer: string;
  /** «VÁLIDA ATÉ 03.11.2026», na linha pequena da contracapa (§6.10). */
  validaAte: string;

  // ── Paleta e ambiente ──
  sobretituloAmbiente: string;
  tituloAmbiente: string;
  subtituloAmbiente: string;

  // ── Investimento ──
  investimento: string;
  /** O sobretítulo das páginas do investimento. */
  sobretituloInvestimento: string;
  tituloOrcamento: string;
  /** «Seis serviços» — o subtítulo do quadro. */
  quantosServicos: (quantos: number) => string;
  comIvaIncluido: string;

  // ── Condições ──
  condicoes: string;
  tituloNotas: string;
  tituloCondicoesGerais: string;
  tituloPagamento: string;
  continuacao: string;
}

/** Os números por extenso, de um a vinte — o «Seis serviços» do exemplo. */
const EXTENSO_PT = [
  "zero",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "catorze",
  "quinze",
  "dezasseis",
  "dezassete",
  "dezoito",
  "dezanove",
  "vinte",
];
const EXTENSO_EN = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];
const comMaiuscula = (s: string) => s.charAt(0).toLocaleUpperCase("pt-PT") + s.slice(1);
/** «Seis» de 6; acima de vinte, o algarismo. */
const porExtenso = (n: number, tabela: readonly string[]) =>
  comMaiuscula(n <= 20 ? tabela[n] : String(n));

const PT: TextosEditoriais = {
  indice: "Índice",
  tituloIndice: "O que vai encontrar",
  aProposta: "A proposta",
  tituloDaProposta: (nomes, org, casamento = true) => {
    const oQue = org ? "Uma organização pensada" : "Uma decoração pensada";
    if (!casamento) return nomes ? `${oQue} para ${nomes}` : `${oQue} para o vosso evento`;
    return nomes ? `${oQue} para o dia de ${nomes}` : `${oQue} para o vosso dia`;
  },
  factos: {
    evento: "Evento",
    data: "Data",
    local: "Local",
    convidados: "Convidados",
    noivos: "Noivos",
    cliente: "Cliente",
    cerimonia: "Cerimónia",
    servico: "Serviço",
    hora: "Hora",
  },
  inspiracao: "Inspiração",
  maisIdeias: "Mais ideias…",
  grupos: {
    cerimonia: "Cerimónia",
    cocktail: "Cocktail",
    jantar: "Jantar",
    complementos: "Complementos",
    ambiente: "Ambiente",
  },
  rodapeModelo: (org) => (org ? "Proposta de organização" : "Proposta de decoração"),
  rascunho: "RASCUNHO",

  tituloServicos: (n, grupo) => {
    // «Um serviço», no singular; e «um» e não «uma»: «serviço» é masculino.
    const base = n === 1 ? "Um serviço" : `${porExtenso(n, EXTENSO_PT)} serviços`;
    return grupo ? `${base} de ${grupo}` : base;
  },

  sobretituloCapa: (org, casamento) =>
    org ? "Proposta de organização" : casamento ? "Proposta de casamento" : "Proposta de decoração",
  formaDeVer: "A nossa forma de ver",
  validaAte: "Válida até",

  sobretituloAmbiente: "Ambiente",
  tituloAmbiente: "A paleta do evento",
  subtituloAmbiente: "Cores retiradas das fotografias de inspiração desta proposta.",

  investimento: "Investimento",
  sobretituloInvestimento: "O investimento",
  tituloOrcamento: "Orçamento proposto",
  quantosServicos: (n) => (n === 1 ? "Um serviço" : `${porExtenso(n, EXTENSO_PT)} serviços`),
  comIvaIncluido: "Com IVA incluído.",

  condicoes: "Condições",
  tituloNotas: "Notas e próximos passos",
  tituloCondicoesGerais: "Condições gerais",
  tituloPagamento: "Pagamento e cancelamento",
  continuacao: "(cont.)",
};

const EN: TextosEditoriais = {
  indice: "Contents",
  tituloIndice: "What you will find",
  aProposta: "The proposal",
  tituloDaProposta: (nomes, org, casamento = true) => {
    if (!casamento) {
      const oQue = org ? "An event planned" : "A decoration designed";
      return nomes ? `${oQue} for ${nomes}` : `${oQue} for your event`;
    }
    const oQue = org ? "A celebration planned" : "A decoration designed";
    return nomes ? `${oQue} for ${nomes}’s day` : `${oQue} for your day`;
  },
  factos: {
    evento: "Event",
    data: "Date",
    local: "Venue",
    convidados: "Guests",
    noivos: "Couple",
    cliente: "Client",
    cerimonia: "Ceremony",
    servico: "Service",
    hora: "Time",
  },
  inspiracao: "Inspiration",
  maisIdeias: "More ideas…",
  grupos: {
    cerimonia: "Ceremony",
    cocktail: "Cocktail",
    jantar: "Dinner",
    complementos: "Bridal details",
    ambiente: "Atmosphere",
  },
  rodapeModelo: (org) => (org ? "Planning proposal" : "Decoration proposal"),
  rascunho: "DRAFT",

  // O nome do grupo é dela e fica em português; em inglês o título diz só
  // quantos são, que é o que se lê sem tradução.
  tituloServicos: (n) => (n === 1 ? "One service" : `${porExtenso(n, EXTENSO_EN)} services`),

  sobretituloCapa: (org, casamento) =>
    org ? "Planning proposal" : casamento ? "Wedding proposal" : "Decoration proposal",
  formaDeVer: "The way we see it",
  validaAte: "Valid until",

  sobretituloAmbiente: "Atmosphere",
  tituloAmbiente: "The event palette",
  subtituloAmbiente: "Colours taken from the inspiration photographs in this proposal.",

  investimento: "Investment",
  sobretituloInvestimento: "The investment",
  tituloOrcamento: "Quotation",
  quantosServicos: (n) => (n === 1 ? "One service" : `${porExtenso(n, EXTENSO_EN)} services`),
  comIvaIncluido: "VAT included.",

  condicoes: "Conditions",
  tituloNotas: "Notes and next steps",
  tituloCondicoesGerais: "General conditions",
  tituloPagamento: "Payment and cancellation",
  continuacao: "(cont.)",
};

export function textosEditoriais(idioma: IdiomaDaProposta): TextosEditoriais {
  return idioma === "en" ? EN : PT;
}

/**
 * Os primeiros nomes do casal, para o título: «Mafalda Santos & João Barros e
 * Cunha» → «Mafalda e João» (em inglês, «Mafalda and João»).
 *
 * Só o «&» separa o casal. O «e» não pode: «João Barros e Cunha» é UM nome.
 * Sem «&» (um cliente que é uma empresa, ou um só nome) devolve `null` e o
 * título diz «o vosso dia» — tirar a primeira palavra de «Quinta do Vale, Lda.»
 * dava «para o dia de Quinta».
 */
export function primeirosNomes(nomes: string, idioma: IdiomaDaProposta): string | null {
  const partes = nomes
    .split("&")
    .map((s) => s.trim())
    .filter(Boolean);
  if (partes.length !== 2) return null;
  const [a, b] = partes.map((p) => p.split(/\s+/)[0]);
  return `${a} ${idioma === "en" ? "and" : "e"} ${b}`;
}

/**
 * Uma data ISO (`2026-12-11`) como o documento a escreve na linha pequena da
 * capa e da contracapa: «11.12.2026». Sem data que se leia, `null`.
 */
export function dataCurta(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? "").trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null;
}
