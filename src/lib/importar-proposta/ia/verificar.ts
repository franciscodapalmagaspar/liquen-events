import { DEFAULT_VAT_RATE, resolveProposalMoney } from "../../proposal-doc";
import { eur, round2 } from "../../money";
import { datasDaLinha, semAcentos } from "../heuristicas";
import type { DocumentoCompleto, UnidadeLida } from "../documento-completo";
import type { Leitura, LinhaLida } from "./esquema";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * VERIFICAR — REGRAS FIXAS, SEM IA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A IA percebe o documento; as contas e as provas fazem-se aqui, sempre da
 * mesma maneira, com as regras de dinheiro que a casa já tem
 * (`resolveProposalMoney`, `round2`, `DEFAULT_VAT_RATE`). Seis verificações:
 *
 *  (a) cada citação, e cada texto literal, existe MESMO no documento (a
 *      comparação é normalizada: maiúsculas, espaços, aspas, travessões);
 *      e cada valor está dentro da sua citação;
 *  (b) cada valor em € escrito no documento está numa linha, num total, ou
 *      listado como «não usado» com o motivo;
 *  (c) quantidade × preço = total da linha; as linhas somam o total ao
 *      cêntimo; o total sem IVA e o com IVA batem pela taxa;
 *  (d) todas as imagens têm destino (e só uma capa);
 *  (e) todo o parágrafo com conteúdo está num campo, ou listado como «não
 *      colocado»;
 *  (f) a data é uma data a sério, e está na citação.
 *
 * O que falha a (a) ou a (f) — um valor inventado — SAI da leitura limpa:
 * nunca chega à proposta. O resto fica, com o aviso ao lado. Os avisos que
 * mexem em dinheiro (`dinheiro: true`) têm de ser confirmados por ela antes
 * de a proposta se criar.
 */

export interface Aviso {
  /** Estável entre leituras do mesmo documento (serve de chave à confirmação). */
  id: string;
  texto: string;
  /** Onde vai no ecrã: `evento.data`, `orcamento.linhas.2`, `orcamento.total`, `imagens`… */
  campo: string;
  dinheiro: boolean;
  gravidade: "erro" | "aviso";
}

export interface ValorDoDocumento {
  unidade: string;
  valor: number;
  trecho: string;
  usado: "linha" | "total" | "nao-usado" | null;
  motivo?: string;
}

export interface Contas {
  vatRate: number;
  /** A soma das linhas normais com valor (no modo das linhas), ou null sem valores. */
  somaDasLinhas: number | null;
  linhasSemValor: number;
  /** Sempre «desconhecido»: o modo é ela que o escolhe (ver `ivaPorEscolher`). */
  modoDasLinhas: "sem_iva" | "com_iva" | "desconhecido";
  /** Sempre «desconhecido»: o modo é ela que o escolhe. */
  modoDoTotal: "sem_iva" | "com_iva" | "desconhecido";
  /** O IVA é SEMPRE ela que o escolhe (nada pré-escolhido), quando há valores. */
  ivaPorEscolher: boolean;
  /** O que as contas do documento sugerem (um par ou trio que bate pela taxa) — só sugestão. */
  sugestaoDasContas: { modo: "sem_iva" | "com_iva"; texto: string } | null;
  /** O que as frases do documento parecem dizer, quando dizem uma coisa só — só sugestão. */
  sugestaoDasFrases: "sem_iva" | "com_iva" | null;
  /** As contas sugerem uma coisa e as frases outra. */
  discordancia: boolean;
  /** As frases do documento que falam de IVA (só para mostrar). */
  frasesDoIva: { unidade: string; texto: string; parece: ModoNoTexto }[];
  /** O que a leitura (IA ou JSON) disse — só para mostrar. */
  leituraDoIva: {
    linhas: { valor: "sem_iva" | "com_iva" | "desconhecido"; citacao: string | null };
    total: { valor: "sem_iva" | "com_iva" | "desconhecido"; citacao: string | null };
  };
}

export interface Verificacao {
  leitura: Leitura;
  avisos: Aviso[];
  valores: ValorDoDocumento[];
  naoColocados: { id: string; texto: string; parte: string; motivo: string | null }[];
  contas: Contas;
  /** Quantos valores ou textos inventados saíram da leitura. */
  inventados: number;
}

// ── Normalizar ───────────────────────────────────────────────────────────────

/**
 * O texto normalizado COM as células das tabelas separadas (« | »). É neste
 * que se lêem os números: «1 | 250,00» são duas células, nunca 1 250.
 */
export function normalizarComCelulas(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u00ad\u200b-\u200d\ufeff]/g, "")
    .replace(/[\u2018\u2019\u201a\u201b\u00b4`]/g, "'")
    .replace(/[\u201c\u201d\u201e\u00ab\u00bb]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u23ce/g, " ")
    .replace(/\|/g, " | ")
    .replace(/[\s\u00a0]+/g, " ")
    .toLowerCase()
    .trim();
}

/**
 * O mesmo texto sem as barras das células (é contra este que se procuram as
 * citações e os textos copiados: a IA nem sempre copia o «|»), e, para cada
 * posição do texto com células, a posição correspondente neste.
 */
export function plano(comCelulas: string): { texto: string; deCan: Int32Array } {
  const deCan = new Int32Array(comCelulas.length + 1);
  let out = "";
  const espaco = (i: number) => {
    // Nunca dois espaços seguidos (uma célula vazia deixava «a  b»).
    deCan[i] = out.endsWith(" ") ? out.length - 1 : out.length;
    if (!out.endsWith(" ")) out += " ";
  };
  let i = 0;
  while (i < comCelulas.length) {
    if (comCelulas.startsWith(" | ", i)) {
      espaco(i);
      deCan[i + 1] = deCan[i + 2] = deCan[i];
      i += 3;
    } else if (comCelulas[i] === "|") {
      deCan[i] = out.length;
      i += 1;
    } else if (comCelulas[i] === " ") {
      espaco(i);
      i += 1;
    } else {
      deCan[i] = out.length;
      out += comCelulas[i];
      i += 1;
    }
  }
  deCan[comCelulas.length] = out.length;
  const t = out.trim();
  const corte = out.length - out.trimStart().length;
  if (corte) for (let k = 0; k < deCan.length; k++) deCan[k] = Math.max(0, deCan[k] - corte);
  return { texto: t, deCan };
}

export function normalizar(s: string): string {
  return plano(normalizarComCelulas(s)).texto;
}

/** Uma linha de um texto, sem o marcador de lista da ponta. */
function segmentos(texto: string): string[] {
  return texto
    .split(/\n|⏎/)
    .map((s) =>
      normalizar(s)
        .replace(/^[•·\-*–—▪◦●○■□✓✔>]+\s*/, "")
        .replace(/\s*[:;]$/, ""),
    )
    .filter((s) => s.length > 0);
}

function textoDaUnidade(u: UnidadeLida): string {
  if (u.tipo === "paragrafo") return u.texto;
  if (u.tipo === "linha-de-tabela") return u.celulas.join(" | ");
  return [u.descricao, u.legenda].filter(Boolean).join(" ");
}

function nomeDaParte(d: DocumentoCompleto, parte: string): string {
  return d.partes.find((p) => p.id === parte)?.nome ?? parte;
}

function curto(s: string, n = 90): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

// ── Números ──────────────────────────────────────────────────────────────────

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS NÚMEROS — INTEIROS, COM SINAL, E O FORMATO DECIDIDO NÚMERO A NÚMERO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um token é um número INTEIRO: nunca um bocado de outro («740» não é um
 * token de «1.740,00», nem «7» de «2027»), e nunca atravessa uma célula.
 *
 * O formato decide-se pelo PRÓPRIO número, não pelo idioma da proposta (uma
 * proposta portuguesa tem preços colados do Excel, uma inglesa tem números
 * portugueses):
 *
 *  · «1.000,00» — os dois separadores: o último é o decimal (português);
 *  · «1,740.00» — idem (inglês);
 *  · «45,00» / «45.00» — um separador com 1–2 dígitos depois: é o decimal;
 *  · «1.200» / «1,740» — um separador com 3 dígitos depois: AMBÍGUO. Ficam os
 *    dois candidatos (1 200 e 1,2), e vale o que bater com a leitura;
 *  · «2 120,00» — o espaço de milhar também é ambíguo: 2 120, ou o 120 da
 *    direita (só se a mesma linha disser quantidade 2), ou o 2 da esquerda
 *    (só como quantidade). Um aviso mostra o texto escrito, nunca um número
 *    que lá não está.
 *
 * SINAL: «-100,00 €», «− 100 €» ou «(100,00 €)» são −100. O hífen só conta
 * como sinal no princípio, depois de um espaço, «(» ou «:» — nunca entre
 * números («12-06-2027»).
 */

/**
 * Um valor possível de um token. Com o espaço ambíguo («2 120,00»): o inteiro
 * (2 120), o da DIREITA (120 — só vale se a mesma linha disser quantidade 2,
 * a da esquerda) e o da ESQUERDA (2 — só vale como quantidade).
 */
export interface Candidato {
  valor: number;
  ini: number;
  fim: number;
  papel?: "direita" | "esquerda";
  esquerda?: number;
}

export interface Token {
  /** O valor principal. */
  valor: number;
  /** Todos os valores possíveis (sem o «da esquerda», que só serve para quantidades). */
  valores: number[];
  candidatos: Candidato[];
  ini: number;
  fim: number;
  texto: string;
  /** Em que célula da linha da tabela está (0 fora das tabelas). */
  celula: number;
  /**
   * Um só separador seguido de três dígitos («1.200», «1,740»): milhares ou
   * decimal? Fica com os dois candidatos até o documento o decidir.
   */
  ambiguo?: "ponto" | "virgula";
}

const NUMERO_CRU =
  /(?<![\d.,])(?:\d{1,3}(?: \d{3})+(?:,\d{1,2})?(?![\d]|[.,]\d)|\d+(?:[.,]\d+)*)(?!\d)/g;

/** Os valores possíveis de um número escrito sem espaços, pelo próprio número. */
export function valoresDoNumero(cru: string): number[] {
  const n = (x: string) => Number(x);
  const ponto = cru.includes(".");
  const virgula = cru.includes(",");
  if (ponto && virgula) {
    const pt = cru.lastIndexOf(",") > cru.lastIndexOf(".");
    const [int, dec] = pt
      ? [cru.slice(0, cru.lastIndexOf(",")), cru.slice(cru.lastIndexOf(",") + 1)]
      : [cru.slice(0, cru.lastIndexOf(".")), cru.slice(cru.lastIndexOf(".") + 1)];
    const sep = pt ? "." : ",";
    if (!new RegExp(`^\\d{1,3}(?:\\${sep}\\d{3})*$`).test(int) || !/^\d{1,2}$/.test(dec)) return [];
    return [n(`${int.split(sep).join("")}.${dec}`)];
  }
  if (virgula || ponto) {
    const sep = virgula ? "," : ".";
    const partes = cru.split(sep);
    if (partes.length === 2 && /^\d{1,2}$/.test(partes[1])) return [n(`${partes[0]}.${partes[1]}`)];
    if (partes.slice(1).every((x) => x.length === 3) && partes[0].length <= 3) {
      const milhares = n(partes.join(""));
      // Um só separador com três dígitos: também pode ser um decimal.
      return partes.length === 2 ? [milhares, n(`${partes[0]}.${partes[1]}`)] : [milhares];
    }
    return [];
  }
  return [n(cru)];
}

/**
 * Uma linha de DESCONTO (pelo rótulo): só aí um valor entre parênteses, ou com
 * um travessão separado, pode ser negativo. «Bouquet — 180 €» é 180, e a
 * prestação «(1.475,00 €)» é 1 475.
 */
export const E_DESCONTO =
  /\b(?:descontos?|abatimentos?|dedu[cç](?:ao|ão|oes|ões)|ofertas?|cr[eé]ditos?|discount|deduction)\b/i;

export function tokensDe(normalizado: string): Token[] {
  const out: Token[] = [];
  const desconto = E_DESCONTO.test(normalizado);
  for (const m of normalizado.matchAll(NUMERO_CRU)) {
    let ini = m.index!;
    let fim = ini + m[0].length;
    const comEspaco = m[0].includes(" ");
    const basicos = comEspaco ? valoresDoNumero(m[0].replace(/ /g, "")) : valoresDoNumero(m[0]);
    if (!basicos.length) continue;
    // O sinal: só COLADO ao número («-180», «−180»), no princípio ou depois de
    // um espaço, «(» ou «:». Numa linha de desconto, também «− 180» e «(180)».
    let sinal = 1;
    const antes = normalizado.slice(Math.max(0, ini - 3), ini);
    const colado = /(^|[\s(:])-$/.exec(antes);
    const separado = desconto ? /(^|[\s(:])-\s$/.exec(antes) : null;
    const sm = colado ?? separado;
    if (sm && (sm[1] !== "" || ini <= 2)) {
      sinal = -1;
      ini -= sm[0].length - sm[1].length;
    } else if (
      desconto &&
      normalizado[ini - 1] === "(" &&
      /^\s?(?:€|eur\b|euros?\b)?\s?\)/.test(normalizado.slice(fim, fim + 9))
    ) {
      sinal = -1;
      ini -= 1;
      fim = normalizado.indexOf(")", fim) + 1;
    }
    const candidatos: Candidato[] = basicos.map((v) => ({ valor: round2(sinal * v), ini, fim }));
    // Numa linha de desconto escrita sem sinal, o valor também pode ser lido negativo.
    if (desconto && sinal === 1) {
      for (const v of basicos) candidatos.push({ valor: round2(-v), ini, fim });
    }
    if (comEspaco) {
      const k = m[0].lastIndexOf(" ") + 1;
      const esquerda = Number(m[0].slice(0, k - 1).replace(/ /g, ""));
      const direita = valoresDoNumero(m[0].slice(k));
      for (const v of direita) {
        candidatos.push({
          valor: round2(v),
          ini: m.index! + k,
          fim: m.index! + m[0].length,
          papel: "direita",
          esquerda,
        });
      }
      candidatos.push({ valor: esquerda, ini: m.index!, fim: m.index! + k - 1, papel: "esquerda" });
    }
    const ambiguo =
      !comEspaco && basicos.length === 2
        ? m[0].includes(".")
          ? ("ponto" as const)
          : ("virgula" as const)
        : undefined;
    out.push({
      valor: candidatos[0].valor,
      valores: candidatos.filter((c) => c.papel !== "esquerda").map((c) => c.valor),
      candidatos,
      ini,
      fim,
      texto: normalizado.slice(ini, fim),
      celula: (normalizado.slice(0, ini).match(/ \| /g) ?? []).length,
      ...(ambiguo ? { ambiguo } : {}),
    });
  }
  return out;
}

/**
 * O formato do DOCUMENTO, pelos números que não deixam dúvidas: «45,00» e
 * «1.000,00» são portugueses; «1,740.00» e «45.00» são ingleses. `null`
 * quando não há números claros (ou há dos dois em quantidade parecida).
 */
/** Uma hora escrita com ponto («16.30», «19.30»): nem dinheiro, nem formato. */
export const E_HORA = /^(?:[01]?\d|2[0-3])[.:][0-5]\d$/;

export function formatoDoDocumento(tokens: readonly Token[]): "pt" | "en" | null {
  let pt = 0;
  let en = 0;
  for (const t of tokens) {
    // Uma hora («16.30», «19.30») não diz nada do formato.
    if (E_HORA.test(t.texto)) continue;
    if (/\d,\d{1,2}(?!\d)/.test(t.texto)) pt++;
    else if (/\d\.\d{1,2}(?!\d)/.test(t.texto)) en++;
  }
  if (pt && !en) return "pt";
  if (en && !pt) return "en";
  if (pt >= 2 * en && pt) return "pt";
  if (en >= 2 * pt && en) return "en";
  return null;
}

/**
 * Resolve os números ambíguos pelo formato do documento: num documento
 * português «1.200» é 1 200; num inglês «1,740» é 1 740. O que continua
 * ambíguo (a leitura decimal de três dígitos) nunca passa sem aviso.
 */
export function resolverAmbiguos(tokens: Token[], formato: "pt" | "en" | null): void {
  for (const t of tokens) {
    if (!t.ambiguo) continue;
    const resolve =
      (formato === "pt" && t.ambiguo === "ponto") || (formato === "en" && t.ambiguo === "virgula");
    if (!resolve) continue;
    // O primeiro candidato é sempre o dos milhares.
    const milhares = t.candidatos[0];
    t.candidatos = t.candidatos.filter(
      (c) => c === milhares || Math.abs(c.valor) === Math.abs(milhares.valor),
    );
    t.valores = t.candidatos.filter((c) => c.papel !== "esquerda").map((c) => c.valor);
    delete t.ambiguo;
  }
}

/**
 * Os tokens de uma unidade lidos no texto COM células e postos nas posições do
 * texto plano (onde as citações se procuram).
 */
export function tokensDoTexto(texto: string): { plano: string; tokens: Token[] } {
  const can = normalizarComCelulas(texto);
  const { texto: p, deCan } = plano(can);
  const mapa = (i: number) => deCan[i];
  const tokens = tokensDe(can).map((t) => ({
    ...t,
    ini: mapa(t.ini),
    fim: mapa(t.fim - 1) + 1,
    candidatos: t.candidatos.map((c) => ({ ...c, ini: mapa(c.ini), fim: mapa(c.fim - 1) + 1 })),
  }));
  return { plano: p, tokens };
}

/** Os valores dos tokens de um texto, todos os candidatos. */
export function numerosDe(texto: string): number[] {
  return tokensDoTexto(texto).tokens.flatMap((t) => t.valores);
}

const CABECA_DE_DINHEIRO =
  /€|eur\b|euros|pre[cç]o|valor|total|montante|custo|investimento|price|amount/i;
const EURO_DEPOIS = /^\s?\)?\s?(?:€|eur\b|euros?\b)/;
const EURO_ANTES = /(?:€|eur)\s?-?\s?$/;

/** Os valores em euros de uma unidade (texto normalizado), com a posição. */
function valoresEmEuros(
  u: UnidadeLida,
  n: string,
  tokens: Token[],
  tabelaComDinheiro: boolean,
): Token[] {
  return tokens.filter((t) => {
    if (t.valor === 0) return false;
    const euro =
      EURO_DEPOIS.test(n.slice(t.fim, t.fim + 8)) ||
      EURO_ANTES.test(n.slice(Math.max(0, t.ini - 6), t.ini));
    // Numa tabela de preços, as células sem «€» mas com cara de dinheiro.
    const naTabela =
      u.tipo === "linha-de-tabela" &&
      tabelaComDinheiro &&
      u.linha > 0 &&
      /[.,]\d{2}\)?$|\d[.,]\d{3}/.test(t.texto) &&
      !E_HORA.test(t.texto) &&
      !/%/.test(n.slice(t.fim, t.fim + 2));
    return euro || naTabela;
  });
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O TEXTO DIZ DO IVA — A NEGAÇÃO PRIMEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Não inclui IVA» contém «inclui IVA». Lido ao contrário, uma proposta de
 * 1.230 € «não inclui IVA» passava como 1.000 € + IVA: 230 € perdidos. Por
 * isso tiram-se PRIMEIRO todas as frases que dizem «sem IVA» (com a negação),
 * e só no que sobra se procura o «com IVA». Se sobram as duas, é contradição.
 * «IVA à taxa legal em vigor», sozinho, não diz nada; «acresce IVA à taxa
 * legal» diz sem IVA. «Isento de IVA» é um caso próprio.
 */
const SEM_IVA = [
  /\bnao\s+(?:se\s+)?inclu\w*\s+(?:o\s+|de\s+)?(?:iva|vat)\b/g,
  /\b(?:iva|vat)\s+(?:nao\s+inclu\w*|excluid\w*)/g,
  /\bexcl\w*\.?\s+(?:de\s+|o\s+)?(?:iva|vat)\b/g,
  /\bsem\s+(?:o\s+)?(?:iva|vat)\b/g,
  /\bs\/\s*(?:iva|vat)\b/g,
  /\+\s*(?:iva|vat)\b/g,
  /\bmais\s+(?:iva|vat)\b/g,
  /\bacresc\w*\s+(?:de\s+|o\s+|a\s+)*(?:iva|vat)\b/g,
  /\b(?:iva|vat)\s+a\s+acrescer\b/g,
  /\bplus\s+vat\b/g,
  /\bvat\s+not\s+included\b/g,
];
const ISENTO =
  /\b(?:isent\w*|exempt\w*)\s+(?:de\s+|from\s+)?(?:iva|vat)\b|\b(?:iva|vat)\s*:?\s*isent/;
const COM_IVA =
  /\b(?:iva|vat)\s*inclu\w*|\bc\/\s*(?:iva|vat)\b|\bcom\s+(?:o\s+)?(?:iva|vat)\b|\binclu(?:i|em|indo|ido|idos|ding|des|ded)\s+(?:o\s+)?(?:iva|vat)\b|\b(?:iva|vat)\s+incl\b|\bincl\.?\s+(?:iva|vat)\b/g;

export interface MarcaDoIva {
  modo: "sem" | "com";
  ini: number;
  fim: number;
}

/**
 * As marcas de IVA de um texto INTEIRO, com o sítio de cada uma. As de «sem
 * IVA» (com a negação) tiram-se PRIMEIRO, e só no que sobra se procura o «com
 * IVA» — «não inclui IVA» nunca é um «inclui IVA».
 */
export function marcasDoIva(texto: string): { marcas: MarcaDoIva[]; isento: boolean } {
  const original = semAcentos(texto);
  // As posições têm de ser as do texto dado: sem acentos tem o mesmo tamanho
  // no português; se não tiver, as marcas ficam sem sítio (valem para tudo).
  const mesmoTamanho = original.length === texto.length;
  if (ISENTO.test(original)) return { marcas: [], isento: true };
  const marcas: MarcaDoIva[] = [];
  let t = original;
  for (const r of SEM_IVA) {
    for (const m of t.matchAll(r)) {
      marcas.push({
        modo: "sem",
        ini: mesmoTamanho ? m.index! : 0,
        fim: mesmoTamanho ? m.index! + m[0].length : 0,
      });
    }
    t = t.replace(r, (x) => " ".repeat(x.length));
  }
  for (const m of t.matchAll(COM_IVA)) {
    marcas.push({
      modo: "com",
      ini: mesmoTamanho ? m.index! : 0,
      fim: mesmoTamanho ? m.index! + m[0].length : 0,
    });
  }
  return { marcas: marcas.sort((a, b) => a.ini - b.ini), isento: false };
}

export type ModoNoTexto = "sem" | "com" | "ambos" | "isento" | null;

/** O que um texto INTEIRO diz do IVA (nunca um pedaço dele). */
export function modoDoIvaNoTexto(texto: string): ModoNoTexto {
  const { marcas, isento } = marcasDoIva(texto);
  if (isento) return "isento";
  const sem = marcas.some((m) => m.modo === "sem");
  const com = marcas.some((m) => m.modo === "com");
  return sem && com ? "ambos" : sem ? "sem" : com ? "com" : null;
}

// ── A verificação ────────────────────────────────────────────────────────────

export function verificar(d: DocumentoCompleto, entrada: Leitura): Verificacao {
  const leitura: Leitura = structuredClone(entrada);
  const avisos: Aviso[] = [];
  let inventados = 0;
  const aviso = (a: Aviso) => {
    if (!avisos.some((x) => x.id === a.id)) avisos.push(a);
  };

  const unidades = d.unidades;
  const lidas = new Map(unidades.map((u) => [u.id, tokensDoTexto(textoDaUnidade(u))]));
  const normDe = new Map([...lidas].map(([id, l]) => [id, l.plano]));
  const tokensDaUnidade = new Map([...lidas].map(([id, l]) => [id, l.tokens]));
  const tabelasComDinheiro = new Set(
    unidades
      .filter(
        (u): u is Extract<UnidadeLida, { tipo: "linha-de-tabela" }> => u.tipo === "linha-de-tabela",
      )
      .filter((u) => u.linha === 0 && CABECA_DE_DINHEIRO.test(u.celulas.join(" ")))
      .map((u) => u.tabela),
  );
  /** Os tokens de dinheiro de uma unidade (com «€», ou numa coluna de preços). */
  const dinheiroDa = (u: UnidadeLida) =>
    valoresEmEuros(
      u,
      normDe.get(u.id)!,
      tokensDaUnidade.get(u.id)!,
      u.tipo === "linha-de-tabela" && tabelasComDinheiro.has(u.tabela),
    );
  // O formato dos números ambíguos decide-se pelos números claros do documento
  // — só os de DINHEIRO (com «€» ou numa coluna de preços): horas («16.30»)
  // e datas («12.06.2027») não contam.
  resolverAmbiguos(
    [...tokensDaUnidade.values()].flat(),
    formatoDoDocumento(unidades.flatMap((u) => dinheiroDa(u))),
  );
  const unidadesDeTexto = unidades.filter((u) => u.tipo !== "imagem");
  /**
   * Um texto copiado: cada linha contígua numa unidade, e as linhas pela ORDEM
   * do documento — na mesma unidade, a seguir, ou na unidade de texto seguinte.
   * Nunca uma frase montada com bocados de sítios diferentes.
   */
  const existe = (texto: string): boolean => {
    const ss = segmentos(texto);
    if (!ss.length) return false;
    if (ss.join(" ").replace(/[^\p{L}\p{N}]/gu, "").length < 3) return false;
    const vistos = new Set<string>();
    const seguir = (k: number, iu: number, desde: number): boolean => {
      if (k === ss.length) return true;
      const chave = `${k}:${iu}:${desde}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      const n = normDe.get(unidadesDeTexto[iu].id)!;
      // Na mesma unidade, depois do que já se casou…
      for (let p = n.indexOf(ss[k], desde); p >= 0; p = n.indexOf(ss[k], p + 1)) {
        if (seguir(k + 1, iu, p + ss[k].length)) return true;
      }
      // … ou na unidade de texto seguinte.
      const prox = unidadesDeTexto[iu + 1];
      if (!prox) return false;
      const m = normDe.get(prox.id)!;
      for (let p = m.indexOf(ss[k]); p >= 0; p = m.indexOf(ss[k], p + 1)) {
        if (seguir(k + 1, iu + 1, p + ss[k].length)) return true;
      }
      return false;
    };
    return unidadesDeTexto.some((u, iu) => {
      const n = normDe.get(u.id)!;
      for (let p = n.indexOf(ss[0]); p >= 0; p = n.indexOf(ss[0], p + 1)) {
        if (seguir(1, iu, p + ss[0].length)) return true;
      }
      return false;
    });
  };
  const normCitacao = (c: string) =>
    normalizar(c)
      .replace(/^[•·\-*▪◦●○■□✓✔>]+\s*/, "")
      .replace(/\s*[:;]$/, "");
  /** As unidades onde a citação inteira está, contígua, e onde. */
  const ocorrencias = (c: string): { u: UnidadeLida; k: number; fim: number }[] => {
    const x = normCitacao(c);
    if (!x) return [];
    const out: { u: UnidadeLida; k: number; fim: number }[] = [];
    for (const u of unidades) {
      const n = normDe.get(u.id)!;
      for (let k = n.indexOf(x); k >= 0; k = n.indexOf(x, k + 1))
        out.push({ u, k, fim: k + x.length });
    }
    return out;
  };
  const citacaoNumaUnidade = (c: string | null): boolean => Boolean(c && ocorrencias(c).length);
  /**
   * As unidades onde o valor é um token INTEIRO dentro da citação (e a citação
   * está, inteira, nessa unidade). Vazio = o valor não está onde a citação diz.
   */
  const ligar = (
    valor: number,
    c: string,
    comPercentagem = false,
    contexto: { quantidade?: boolean; quantidadeDaLinha?: number | null } = {},
  ): string[] => {
    const v = round2(valor);
    const ids = new Set<string>();
    ambiguosLigados = [];
    for (const o of ocorrencias(c)) {
      const n = normDe.get(o.u.id)!;
      for (const t of tokensDaUnidade.get(o.u.id)!) {
        for (const c of t.candidatos) {
          if (c.valor !== v || c.ini < o.k || c.fim > o.fim) continue;
          // O espaço ambíguo: «2 120,00» só é «2 × 120» se a linha o disser.
          if (c.papel === "esquerda" && !contexto.quantidade) continue;
          if (c.papel === "direita" && contexto.quantidadeDaLinha !== c.esquerda) continue;
          if (comPercentagem && !/^\s?%/.test(n.slice(c.fim, c.fim + 2))) continue;
          ids.add(o.u.id);
          if (t.ambiguo) ambiguosLigados.push(t);
        }
      }
    }
    return [...ids];
  };
  let ambiguosLigados: Token[] = [];
  /** O que cada campo de dinheiro prende no documento: unidade e valor. */
  const ligacoes: { valor: number; unidades: string[]; usado: "linha" | "total" }[] = [];

  // ── (a) Os textos literais ──
  const literal = (
    valor: string | null,
    campo: string,
    nome: string,
    dinheiro = false,
  ): string | null => {
    if (valor === null || !valor.trim()) return null;
    if (existe(valor)) return valor;
    inventados++;
    aviso({
      id: `inventado:${campo}`,
      campo,
      dinheiro,
      gravidade: "erro",
      texto: `${nome} «${curto(valor)}» não está no documento — ficou de fora.`,
    });
    return null;
  };

  leitura.cliente.nomes = literal(leitura.cliente.nomes, "cliente.nomes", "O nome");
  leitura.cliente.email = literal(leitura.cliente.email, "cliente.email", "O e-mail");
  leitura.cliente.telefone = literal(leitura.cliente.telefone, "cliente.telefone", "O telefone");
  leitura.evento.local = literal(leitura.evento.local, "evento.local", "O local");

  leitura.servicos = leitura.servicos.map((g, gi) => ({
    titulo: literal(g.titulo, `servicos.${gi}`, "O título do grupo"),
    itens: g.itens
      .map((it, ii) => ({
        titulo: literal(it.titulo, `servicos.${gi}.${ii}.titulo`, "O item"),
        descricao: literal(it.descricao, `servicos.${gi}.${ii}.descricao`, "A descrição"),
        subitens: it.subitens
          .map((s, si) => ({
            titulo: literal(s.titulo, `servicos.${gi}.${ii}.${si}.titulo`, "O subitem"),
            descricao: literal(s.descricao, `servicos.${gi}.${ii}.${si}.descricao`, "A descrição"),
          }))
          .filter((s) => s.titulo || s.descricao),
      }))
      .filter((it) => it.titulo || it.descricao || it.subitens.length),
  }));
  leitura.notas = leitura.notas.filter((n, i) => literal(n.texto, `notas.${i}`, "A nota") !== null);

  // ── (a) Os valores citados ──
  type Citado = { valor: number | null; citacao: string | null };
  const numeroCitado = (
    c: Citado,
    campo: string,
    nome: string,
    dinheiro: boolean,
    usado?: "linha" | "total",
    contexto: { quantidade?: boolean; quantidadeDaLinha?: number | null } = {},
  ): Citado => {
    if (c.valor === null) return { valor: null, citacao: c.citacao };
    const falha = (porque: string) => {
      inventados++;
      aviso({
        id: `inventado:${campo}`,
        campo,
        dinheiro,
        gravidade: "erro",
        texto: `${nome} (${dinheiro ? eur(c.valor!) : c.valor}) ${porque} — não foi preenchido.`,
      });
      return { valor: null, citacao: null };
    };
    if (!c.citacao || !c.citacao.trim()) return falha("não diz de onde veio");
    if (!citacaoNumaUnidade(c.citacao))
      return falha(`vem de «${curto(c.citacao, 60)}», que não está no documento`);
    const onde = ligar(c.valor, c.citacao, false, contexto);
    if (!onde.length) return falha(`não está escrito em «${curto(c.citacao, 60)}»`);
    // Um número que tanto pode ser 1 200 como 1,2 nunca passa calado.
    for (const t of ambiguosLigados) {
      const leituras = [...new Set(t.valores.map((x) => Math.abs(x)))];
      aviso({
        id: `numero:ambiguo:${campo}:${t.texto}`,
        campo,
        dinheiro: true,
        gravidade: "erro",
        texto: `${nome}: «${t.texto}» tanto pode ser ${leituras.map((x) => eur(x)).join(" como ")} — o documento não tem números que digam o formato. Ficou ${eur(Math.abs(c.valor))}: confirma.`,
      });
    }
    if (usado) ligacoes.push({ valor: round2(c.valor), unidades: onde, usado });
    return c;
  };

  const ev = leitura.evento;
  ev.convidados = numeroCitado(ev.convidados, "evento.convidados", "O número de convidados", false);
  if (ev.tipo.valor !== null) {
    const ok =
      ev.tipo.citacao &&
      citacaoNumaUnidade(ev.tipo.citacao) &&
      semAcentos(ev.tipo.citacao).includes(semAcentos(ev.tipo.valor).split(/\s+/)[0].slice(0, 6));
    if (!ok) {
      inventados++;
      aviso({
        id: "inventado:evento.tipo",
        campo: "evento.tipo",
        dinheiro: false,
        gravidade: "erro",
        texto: `O tipo de evento «${ev.tipo.valor}» não se confirma no documento — ficou por preencher.`,
      });
      ev.tipo = { valor: null, citacao: null };
    }
  }

  // ── (f) A data ──
  if (ev.data.valor !== null) {
    const iso = ev.data.valor;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    const real =
      m &&
      Number(m[1]) >= 2000 &&
      Number(m[1]) <= 2100 &&
      new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString().slice(0, 10) === iso;
    let porque = "";
    if (!real) porque = "não é uma data válida";
    else if (!citacaoNumaUnidade(ev.data.citacao)) porque = "não vem de um sítio do documento";
    else {
      const datas = datasDaLinha(ev.data.citacao!);
      const nums = normalizar(ev.data.citacao!)
        .split(/[^\d]+/)
        .filter(Boolean)
        .map(Number);
      const dia = Number(m![3]);
      const ano = Number(m![1]);
      const bate =
        datas.includes(iso) ||
        (nums.includes(dia) && (nums.includes(ano) || nums.includes(ano % 100)));
      if (!bate) porque = `não está escrita em «${curto(ev.data.citacao!, 60)}»`;
    }
    if (porque) {
      inventados++;
      aviso({
        id: "inventado:evento.data",
        campo: "evento.data",
        dinheiro: false,
        gravidade: "erro",
        texto: `A data ${iso} ${porque} — ficou por preencher.`,
      });
      ev.data = { valor: null, citacao: null };
    }
  }

  // ── O dinheiro ──
  const o = leitura.orcamento;
  // A taxa: o número com «%» colado, e «IVA» na MESMA unidade. Uma taxa que
  // não seja a da casa é sempre um aviso de dinheiro.
  if (o.iva.taxa.valor !== null) {
    const t = o.iva.taxa;
    const onde = t.citacao ? ligar(t.valor!, t.citacao, true) : [];
    const comIva = onde.filter((id) => /\biva\b/.test(normDe.get(id)!));
    if (!comIva.length) {
      inventados++;
      aviso({
        id: "inventado:orcamento.iva",
        campo: "orcamento.iva",
        dinheiro: true,
        gravidade: "erro",
        texto: `A taxa de IVA (${t.valor}%) não está escrita como «${t.valor}%» ao lado da palavra IVA${t.citacao ? ` em «${curto(t.citacao, 60)}»` : ""} — ficou a da casa (${DEFAULT_VAT_RATE * 100}%).`,
      });
      o.iva.taxa = { valor: null, citacao: null };
    }
  }
  const taxaLida = o.iva.taxa.valor;
  let vatRate = DEFAULT_VAT_RATE;
  if (taxaLida !== null) {
    if (taxaLida >= 0 && taxaLida <= 30) {
      vatRate = round2(taxaLida) / 100;
      if (round2(taxaLida) !== round2(DEFAULT_VAT_RATE * 100)) {
        aviso({
          id: "iva:taxa-diferente",
          campo: "orcamento.iva",
          dinheiro: true,
          gravidade: "aviso",
          texto: `O documento usa IVA a ${taxaLida}%, e não a ${DEFAULT_VAT_RATE * 100}% da casa. A proposta nova fica com ${taxaLida}%: confirma que ainda é a taxa certa.`,
        });
      }
    } else {
      aviso({
        id: "iva:taxa-estranha",
        campo: "orcamento.iva",
        dinheiro: true,
        gravidade: "erro",
        texto: `A taxa de IVA lida (${taxaLida}%) não é uma taxa de IVA. Ficou a da casa (${DEFAULT_VAT_RATE * 100}%).`,
      });
    }
  }
  o.totalSemIva = numeroCitado(o.totalSemIva, "orcamento.total", "O total sem IVA", true, "total");
  o.valorDoIva = numeroCitado(o.valorDoIva, "orcamento.total", "O valor do IVA", true, "total");
  o.totalComIva = numeroCitado(o.totalComIva, "orcamento.total", "O total com IVA", true, "total");

  o.linhas = o.linhas.map((l, i): LinhaLida => {
    const campo = `orcamento.linhas.${i}`;
    const nome = l.descricao ? `A linha «${curto(l.descricao, 40)}»` : `A linha ${i + 1}`;
    const quantidade = numeroCitado(l.quantidade, campo, `${nome}: a quantidade`, true, undefined, {
      quantidade: true,
    });
    const daLinha = { quantidadeDaLinha: quantidade.valor };
    return {
      descricao: literal(l.descricao, campo, "A linha do orçamento", true),
      quantidade,
      precoUnitario: numeroCitado(
        l.precoUnitario,
        campo,
        `${nome}: o preço unitário`,
        true,
        "linha",
        daLinha,
      ),
      totalDaLinha: numeroCitado(l.totalDaLinha, campo, `${nome}: o total`, true, "linha", daLinha),
      tipo: l.tipo,
    };
  });
  const naoUsadosLigados: { valor: number; unidades: string[]; motivo: string }[] = [];
  o.valoresNaoUsados = o.valoresNaoUsados.filter((v) => {
    const onde = ligar(v.valor, v.citacao);
    if (onde.length) {
      naoUsadosLigados.push({ valor: round2(v.valor), unidades: onde, motivo: v.motivo });
      return true;
    }
    aviso({
      id: `inventado:nao-usado:${round2(v.valor)}`,
      campo: "orcamento",
      dinheiro: true,
      gravidade: "erro",
      texto: `A leitura diz que ${eur(v.valor)} ficou de fora («${curto(v.motivo, 50)}»), mas esse valor não está onde diz.`,
    });
    return false;
  });

  // ── S8: a descrição e o valor de cada linha estão no MESMO sítio ──
  // (a mesma unidade, ou a mesma linha de tabela). «Flores» com o valor das
  // «Velas» é um valor trocado que nenhuma citação apanha sozinha.
  o.linhas.forEach((l, i) => {
    if (!l.descricao) return;
    const desc = segmentos(l.descricao)[0];
    const daDescricao = new Set(
      unidades.filter((u) => desc && normDe.get(u.id)!.includes(desc)).map((u) => u.id),
    );
    for (const f of [l.totalDaLinha, l.precoUnitario]) {
      if (f.valor === null || !f.citacao) continue;
      const doValor = ligar(f.valor, f.citacao, false, { quantidadeDaLinha: l.quantidade.valor });
      if (doValor.length && daDescricao.size && !doValor.some((id) => daDescricao.has(id))) {
        aviso({
          id: `linha:outro-sitio:${i}`,
          campo: `orcamento.linhas.${i}`,
          dinheiro: true,
          gravidade: "erro",
          texto: `O valor ${eur(f.valor)} está noutro sítio do documento — confirma que é de «${curto(l.descricao, 40)}».`,
        });
      }
    }
  });

  // ── (c) Cada linha, e a soma ──
  const valorDaLinha = (l: LinhaLida): number | null => {
    if (l.totalDaLinha.valor !== null) return l.totalDaLinha.valor;
    if (l.precoUnitario.valor === null) return null;
    const q = l.quantidade.valor ?? 1;
    return round2(q * l.precoUnitario.valor);
  };
  o.linhas.forEach((l, i) => {
    const v = valorDaLinha(l);
    if (v !== null && v < 0) {
      aviso({
        id: `desconto:${i}`,
        campo: `orcamento.linhas.${i}`,
        dinheiro: true,
        gravidade: "erro",
        texto: `A linha «${curto(l.descricao ?? `${i + 1}`, 40)}» é um desconto de ${eur(-v)}: o orçamento da proposta nova não leva linhas negativas, por isso não passou — põe o desconto à mão no Fazer proposta.`,
      });
    }
    const q = l.quantidade.valor;
    const p = l.precoUnitario.valor;
    const t = l.totalDaLinha.valor;
    if (q !== null && p !== null && t !== null && round2(q * p) !== round2(t)) {
      aviso({
        id: `conta:linha:${i}`,
        campo: `orcamento.linhas.${i}`,
        dinheiro: true,
        gravidade: "erro",
        texto: `A linha «${curto(l.descricao ?? `${i + 1}`, 40)}» diz ${q} × ${eur(p)} = ${eur(t)}, mas ${q} × ${eur(p)} são ${eur(round2(q * p))}.`,
      });
    }
  });
  const normais = o.linhas.filter((l) => l.tipo === "normal");
  const comValor = normais.map(valorDaLinha).filter((v): v is number => v !== null);
  const linhasSemValor = normais.length - comValor.length;
  const soma = comValor.length ? round2(comValor.reduce((a, b) => a + b, 0)) : null;

  const base = o.totalSemIva.valor;
  const bruto = o.totalComIva.valor;
  const ivaEscrito = o.valorDoIva.valor;
  // O total no outro modo, pela regra da casa — nunca uma conta à parte.
  const baseDoBruto = (g: number) =>
    resolveProposalMoney({ totalAmount: g, totalVatMode: "incluido", vatRate }).base;
  const brutoDaBase = (b: number) =>
    resolveProposalMoney({ totalAmount: b, totalVatMode: "acrescer", vatRate }).gross;

  if (base !== null && bruto !== null) {
    const bate = brutoDaBase(base) === round2(bruto) || baseDoBruto(bruto) === round2(base);
    if (!bate) {
      aviso({
        id: "conta:base-e-bruto",
        campo: "orcamento.total",
        dinheiro: true,
        gravidade: "erro",
        texto:
          taxaLida === null
            ? `O total sem IVA (${eur(base)}) e o total com IVA (${eur(bruto)}) não batem com o IVA a ${vatRate * 100}%, e o documento não escreve a taxa (os totais dão ${round2((bruto / base - 1) * 100)}%).`
            : `O total sem IVA (${eur(base)}) e o total com IVA (${eur(bruto)}) não batem com o IVA a ${vatRate * 100}%: ${eur(base)} + IVA são ${eur(brutoDaBase(base))}.`,
      });
    }
  }
  if (
    ivaEscrito !== null &&
    base !== null &&
    bruto !== null &&
    round2(base + ivaEscrito) !== round2(bruto)
  ) {
    aviso({
      id: "conta:iva",
      campo: "orcamento.total",
      dinheiro: true,
      gravidade: "erro",
      texto: `${eur(base)} + IVA de ${eur(ivaEscrito)} são ${eur(round2(base + ivaEscrito))}, mas o documento diz ${eur(bruto)} com IVA.`,
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // O IVA: SÓ A ARITMÉTICA DECIDE — OU ELA
  // ════════════════════════════════════════════════════════════════════════
  //
  // Quatro rondas de revisão mostraram que nenhuma expressão regular lê bem
  // todas as maneiras de dizer o IVA («não têm IVA incluído», «IVA incluído:
  // não», «a fatura com IVA é emitida…», uma nota sobre o catering). Por isso
  // o TEXTO NUNCA DECIDE. O modo só se aceita sem perguntar quando o próprio
  // documento o PROVA com contas:
  //
  //  · um PAR sem IVA / com IVA que bate ao cêntimo pela taxa — na mesma
  //    unidade e ligado («1.740,00 € + IVA (2.140,20 € com IVA)»), na mesma
  //    linha de uma tabela, ou um TRIO perto uns dos outros («Subtotal
  //    1.740,00 / IVA (23%) 400,20 / Total 2.140,20»);
  //  · E a soma das linhas bate com um dos lados do par: com o sem IVA, as
  //    linhas são sem IVA; com o com IVA, são com IVA.
  //
  // Sem prova, o IVA fica POR ESCOLHER: ela escolhe com um clique, com as
  // frases do documento que falam de IVA ao lado (as expressões regulares só
  // servem para as encontrar e mostrar) e o que a leitura disse. Nada vem
  // pré-escolhido, e a criação espera por ela. A resposta da IA, sozinha,
  // também não decide.
  type Modo = "sem_iva" | "com_iva" | "desconhecido";
  const batemPelaTaxa = (s: number, c: number) =>
    s > 0 && (brutoDaBase(s) === round2(c) || baseDoBruto(c) === round2(s));
  const parDoToken = new Map<Token, number>();
  const pares: { s: number; c: number; onde: string }[] = [];
  const marcarPar = (a: Token, b: Token, onde: string) => {
    pares.push({ s: a.valor, c: b.valor, onde });
    parDoToken.set(a, b.valor);
    parDoToken.set(b, a.valor);
  };
  /** Entre dois valores LIGADOS só há sinais, «€», parênteses e as marcas de IVA. */
  const ligados = (n: string, a: Token, b: Token) => {
    let entre = n.slice(a.fim, b.ini);
    for (const m of marcasDoIva(entre).marcas)
      entre = entre.slice(0, m.ini) + " ".repeat(m.fim - m.ini) + entre.slice(m.fim);
    entre = entre.replace(/\b(?:iva|vat|eur|euros?)\b/g, " ");
    return entre.length <= 40 && /^[\s€()[\]=:/;,.+\-%\d]*$/.test(entre.replace(/\d+\s?%/g, ""));
  };
  for (const u of unidadesDeTexto) {
    const n = normDe.get(u.id)!;
    const dinheiro = dinheiroDa(u).filter((t) => t.valor > 0);
    for (let i = 0; i + 1 < dinheiro.length; i++) {
      const a = dinheiro[i];
      const b = dinheiro[i + 1];
      // Na mesma linha de uma tabela, ou ligados na mesma frase (M1: dois
      // serviços diferentes na mesma frase não fazem um par).
      const linhaDeTabela = u.tipo === "linha-de-tabela" && a.celula !== b.celula;
      if (!linhaDeTabela && !ligados(n, a, b)) continue;
      if (batemPelaTaxa(a.valor, b.valor)) marcarPar(a, b, u.id);
      else if (batemPelaTaxa(b.valor, a.valor)) marcarPar(b, a, u.id);
      else if (!linhaDeTabela && modoDoIvaNoTexto(n) === "ambos") {
        aviso({
          id: `iva:par-nao-bate:${u.id}`,
          campo: "orcamento",
          dinheiro: true,
          gravidade: "erro",
          texto: `O documento diz «${curto(textoDaUnidade(u), 80)}»: os valores sem e com IVA não batem pela taxa de ${Math.round(vatRate * 100)}% (${eur(a.valor)} + IVA são ${eur(brutoDaBase(a.valor))}).`,
        });
      }
    }
  }
  // O trio «subtotal / IVA / total», em unidades seguidas (até 5).
  {
    const seq = unidadesDeTexto.flatMap((u, iu) =>
      dinheiroDa(u)
        .filter((t) => t.valor > 0)
        .map((t) => ({ t, iu, id: u.id })),
    );
    for (let i = 0; i < seq.length; i++) {
      for (let j = i + 1; j < seq.length && seq[j].iu - seq[i].iu <= 4; j++) {
        for (let k = j + 1; k < seq.length && seq[k].iu - seq[i].iu <= 4; k++) {
          // Em qualquer ordem: o maior é o total; os outros dois somam-no, e
          // um deles (a base) dá o total pela taxa.
          const [x, y, t] = [seq[i], seq[j], seq[k]].sort((a, b) => a.t.valor - b.t.valor);
          if (round2(x.t.valor + y.t.valor) !== round2(t.t.valor)) continue;
          const base = batemPelaTaxa(y.t.valor, t.t.valor)
            ? y
            : batemPelaTaxa(x.t.valor, t.t.valor)
              ? x
              : null;
          if (!base) continue;
          const iva = base === y ? x : y;
          marcarPar(base.t, t.t, base.id);
          parDoToken.set(iva.t, base.t.valor);
        }
      }
    }
  }

  // ── O IVA É SEMPRE ELA QUE O ESCOLHE ──
  // Nem o texto, nem as contas, nem a leitura decidem sozinhos (quinta
  // revisão: «Decoração 1.000 / Transporte 230 / Total 1.230» parece um trio
  // de IVA, e um trio de outra secção — o catering de um parceiro — decidia as
  // linhas). Um clique por proposta é barato; um IVA errado é caro. As contas
  // e as frases ficam como SUGESTÕES, ao lado da escolha.
  const temValores = o.linhas.some(
    (l) => l.totalDaLinha.valor !== null || l.precoUnitario.valor !== null,
  );
  const modoDasLinhas: Modo = "desconhecido";
  const modoDoTotal: Modo = "desconhecido";
  const ivaPorEscolher = temValores || base !== null || bruto !== null;
  const taxaEmTexto = `${Math.round(vatRate * 10000) / 100}%`;
  const parDa = (v: number, lado: "s" | "c") => pares.find((p) => p[lado] === round2(v));
  let sugestaoDasContas: { modo: "sem_iva" | "com_iva"; texto: string } | null = null;
  {
    const alvo = temValores && soma !== null ? soma : (base ?? bruto);
    const ps = alvo !== null ? parDa(alvo, "s") : undefined;
    const pc = alvo !== null && !ps ? parDa(alvo, "c") : undefined;
    const par = ps ?? pc;
    if (par) {
      const quem =
        temValores && soma !== null ? `as linhas somam ${eur(alvo!)}` : `o total é ${eur(alvo!)}`;
      sugestaoDasContas = {
        modo: ps ? "sem_iva" : "com_iva",
        texto: `As contas do documento sugerem: ${ps ? "sem IVA" : "com IVA"} — ${quem}, e o documento mostra ${eur(par.s)} + IVA a ${taxaEmTexto} = ${eur(par.c)}.`,
      };
    }
  }
  // As frases do documento que falam de IVA, para ela ver ao escolher.
  const frasesDoIva = unidadesDeTexto
    .map((u) => ({ u, m: modoDoIvaNoTexto(normDe.get(u.id)!) }))
    .filter((x) => x.m !== null || /\b(?:iva|vat)\b/.test(normDe.get(x.u.id)!))
    .map((x) => ({ unidade: x.u.id, texto: textoDaUnidade(x.u), parece: x.m }));
  const modosDasFrases = new Set(
    frasesDoIva.map((f) => f.parece).filter((m): m is "sem" | "com" => m === "sem" || m === "com"),
  );
  const sugestaoDasFrases: "sem_iva" | "com_iva" | null =
    modosDasFrases.size === 1 ? ([...modosDasFrases][0] === "sem" ? "sem_iva" : "com_iva") : null;
  const discordancia =
    sugestaoDasContas !== null &&
    sugestaoDasFrases !== null &&
    sugestaoDasContas.modo !== sugestaoDasFrases;
  const valoresEmConflito = new Set<number>();

  if (soma !== null) {
    // O total a comparar: sem e com IVA (o modo é ela que o escolhe); vale o
    // que bater — só serve para avisar quando nenhum bate.
    const alvoSem = base ?? (bruto !== null ? baseDoBruto(bruto) : null);
    const alvoCom = bruto ?? (base !== null ? brutoDaBase(base) : null);
    const alvo =
      alvoSem !== null && soma === alvoSem
        ? alvoSem
        : alvoCom !== null && soma === alvoCom
          ? alvoCom
          : (base ?? bruto);

    if (alvo === null) {
      aviso({
        id: "conta:sem-total",
        campo: "orcamento.total",
        dinheiro: true,
        gravidade: "aviso",
        texto: `O documento não escreve um total. As linhas somam ${eur(soma)}.`,
      });
    } else if (round2(alvo) !== soma) {
      const dif = round2(alvo - soma);
      const quando =
        linhasSemValor > 0
          ? ` (e ${linhasSemValor === 1 ? "há uma linha" : `há ${linhasSemValor} linhas`} sem valor)`
          : "";
      aviso({
        id: "conta:soma",
        campo: "orcamento.total",
        dinheiro: true,
        gravidade: "erro",
        texto:
          dif > 0
            ? `O total do documento diz ${eur(alvo)}, as linhas somam ${eur(soma)}${quando} — falta uma linha de ${eur(dif)}?`
            : `O total do documento diz ${eur(alvo)}, as linhas somam ${eur(soma)}${quando} — há ${eur(-dif)} a mais nas linhas?`,
      });
    } else if (linhasSemValor > 0) {
      aviso({
        id: "conta:linhas-sem-valor",
        campo: "orcamento",
        dinheiro: true,
        gravidade: "aviso",
        texto: `As linhas com valor somam o total, mas ${linhasSemValor === 1 ? "uma linha não tem" : `${linhasSemValor} linhas não têm`} valor. Confirma que estão incluídas.`,
      });
    }
  }

  // ── (b) Cada valor em € do documento tem sítio ──
  // Um valor do documento está «usado» quando um campo o PRENDE nessa unidade
  // (o token inteiro, dentro da citação). Os «não usados» só valem na unidade
  // onde a citação deles está — e cada um é um aviso de dinheiro para ela
  // confirmar: um valor verdadeiro arrumado ali era um valor perdido.
  // Um total que o documento repete (no resumo e no fim) é a MESMA quantia:
  // se o valor é o de um total aceite, não há aviso nenhum.
  const totaisAceites = [o.totalSemIva.valor, o.totalComIva.valor, o.valorDoIva.valor]
    .filter((x): x is number => x !== null)
    .map(round2);
  const valores: ValorDoDocumento[] = [];
  const cobertosPorPares: { id: string; ini: number; fim: number }[] = [];
  for (const u of unidades) {
    const tabela = u.tipo === "linha-de-tabela" && tabelasComDinheiro.has(u.tabela);
    const n = normDe.get(u.id)!;
    for (const t of valoresEmEuros(u, n, tokensDaUnidade.get(u.id)!, tabela)) {
      const bate = (x: number) => t.valores.includes(x);
      const campo = ligacoes.find((c) => bate(c.valor) && c.unidades.includes(u.id));
      // A mesma quantia repetida — só se o documento não a contradiz (D).
      const repetido = !campo && totaisAceites.some((x) => bate(x) && !valoresEmConflito.has(x));
      // O outro lado de um par sem/com IVA da mesma unidade é a mesma quantia.
      const par = parDoToken.get(t);
      const doPar =
        !campo && !repetido && par !== undefined
          ? ligacoes.find((c) => c.valor === par && c.unidades.includes(u.id))
          : undefined;
      const nu =
        campo || repetido || doPar
          ? undefined
          : naoUsadosLigados.find((x) => bate(x.valor) && x.unidades.includes(u.id));
      const usado: ValorDoDocumento["usado"] =
        campo?.usado ?? doPar?.usado ?? (repetido ? "total" : nu ? "nao-usado" : null);
      // O valor que se mostra é o que está ESCRITO (com o espaço ambíguo, o texto tal e qual).
      const escrito = t.valores.length > 1 ? `«${t.texto}»` : eur(t.valor);
      const valor = campo?.valor ?? nu?.valor ?? t.valor;
      // O par sem/com IVA que se usou conta como texto colocado (mais a marca
      // de IVA dele), para o parágrafo não aparecer como «perdido».
      if (doPar) {
        const fimDoEuro = n.slice(t.fim).match(/^\s?(?:€|eur\b|euros?\b)?/)![0].length;
        const marca = marcasDoIva(n).marcas.find(
          (m) => m.ini >= t.fim && m.ini - (t.fim + fimDoEuro) <= 2,
        );
        cobertosPorPares.push({ id: u.id, ini: t.ini, fim: marca ? marca.fim : t.fim + fimDoEuro });
      }
      valores.push({
        unidade: u.id,
        valor,
        trecho: n.slice(Math.max(0, t.ini - 30), t.fim + 6).trim(),
        usado,
        ...(nu ? { motivo: nu.motivo } : {}),
      });
      if (nu) {
        aviso({
          id: `nao-usado:${u.id}:${Math.round(nu.valor * 100)}`,
          campo: "orcamento",
          dinheiro: true,
          gravidade: "aviso",
          texto: `O documento tem ${eur(nu.valor)} em «${curto(textoDaUnidade(u), 70)}» (${nomeDaParte(d, u.parte)}), que ficou FORA das linhas e do total: «${curto(nu.motivo, 60)}».`,
        });
      } else if (!usado) {
        aviso({
          id: `valor:${u.id}:${Math.round(t.valor * 100)}`,
          campo: "orcamento",
          dinheiro: true,
          gravidade: "erro",
          texto: `O documento tem ${escrito} em «${curto(textoDaUnidade(u), 70)}» (${nomeDaParte(d, u.parte)}) e esse valor não está em nenhuma linha nem total.`,
        });
      }
    }
  }

  // ── (d) As imagens ──
  const idsDasImagens = new Set(d.imagens.map((i) => i.id));
  const vistas = new Map<string, number>();
  leitura.imagens = leitura.imagens.filter((im) => {
    if (!idsDasImagens.has(im.id)) {
      aviso({
        id: `imagem:desconhecida:${im.id}`,
        campo: "imagens",
        dinheiro: false,
        gravidade: "aviso",
        texto: `A leitura fala de uma imagem «${im.id}» que não existe no documento — ignorada.`,
      });
      return false;
    }
    vistas.set(im.id, (vistas.get(im.id) ?? 0) + 1);
    return vistas.get(im.id) === 1;
  });
  for (const [id, n] of vistas) {
    if (n > 1) {
      aviso({
        id: `imagem:repetida:${id}`,
        campo: "imagens",
        dinheiro: false,
        gravidade: "aviso",
        texto: `A imagem ${id} tinha ${n} destinos; ficou o primeiro.`,
      });
    }
  }
  const tituloAntesDe = (imagemId: string): string | null => {
    const i = unidades.findIndex((u) => u.tipo === "imagem" && u.imagem === imagemId);
    for (let k = i; k >= 0; k--) {
      const u = unidades[k];
      if (
        u.tipo === "paragrafo" &&
        (u.papel === "titulo" || (u.nivel !== undefined && u.nivel <= 2))
      ) {
        return u.texto;
      }
      if (k < i && u.parte !== unidades[i].parte && d.formato === "pptx") break;
    }
    return null;
  };
  let capas = 0;
  for (const im of leitura.imagens) {
    if (im.destino === "capa" && ++capas > 1) {
      im.destino = "moodboard";
      aviso({
        id: `imagem:capa:${im.id}`,
        campo: "imagens",
        dinheiro: false,
        gravidade: "aviso",
        texto: `Havia mais do que uma capa; a ${im.id} passou para as inspirações.`,
      });
    }
    if (im.tema && !existe(im.tema)) {
      const t = tituloAntesDe(im.id);
      aviso({
        id: `imagem:tema:${im.id}`,
        campo: "imagens",
        dinheiro: false,
        gravidade: "aviso",
        texto: `O tema «${curto(im.tema, 40)}» da imagem ${im.id} não está escrito no documento; ficou ${t ? `«${curto(t, 40)}», o título de onde ela está` : "sem tema"}.`,
      });
      inventados++;
      im.tema = t;
    }
    if (im.capitulo && !existe(im.capitulo)) im.capitulo = null;
  }
  for (const im of d.imagens) {
    if (!vistas.has(im.id)) {
      const u = unidades.find((x) => x.tipo === "imagem" && x.imagem === im.id);
      aviso({
        id: `imagem:sem-destino:${im.id}`,
        campo: "imagens",
        dinheiro: false,
        gravidade: "aviso",
        texto: `A imagem ${im.id}${u ? ` (${nomeDaParte(d, u.parte)})` : ""} não tem destino: fica de fora até a escolheres.`,
      });
    }
  }

  // ── (e) Todo o parágrafo tem sítio ──
  const saidas: string[] = [];
  const meter = (s: string | null | undefined) => {
    if (s) saidas.push(s);
  };
  meter(leitura.cliente.nomes);
  meter(leitura.cliente.email);
  meter(leitura.cliente.telefone);
  meter(ev.local);
  for (const c of [
    ev.data,
    ev.tipo,
    ev.convidados,
    o.iva.taxa,
    o.totalSemIva,
    o.valorDoIva,
    o.totalComIva,
  ]) {
    meter(c.citacao);
  }
  for (const g of leitura.servicos) {
    meter(g.titulo);
    for (const it of g.itens) {
      meter(it.titulo);
      meter(it.descricao);
      for (const s of it.subitens) {
        meter(s.titulo);
        meter(s.descricao);
      }
    }
  }
  for (const l of o.linhas) {
    meter(l.descricao);
    meter(l.quantidade.citacao);
    meter(l.precoUnitario.citacao);
    meter(l.totalDaLinha.citacao);
  }
  for (const v of o.valoresNaoUsados) meter(v.citacao);
  for (const n of leitura.notas) meter(n.texto);
  for (const im of leitura.imagens) {
    meter(im.tema);
    meter(im.capitulo);
  }
  const segs = [...new Set(saidas.flatMap(segmentos))].filter((s) => s.length >= 2);
  const motivoDe = new Map(
    leitura.naoColocados.filter((x) => x.motivo.trim()).map((x) => [x.id, x.motivo]),
  );
  const naoColocados: Verificacao["naoColocados"] = [];
  for (const u of unidades) {
    if (u.tipo === "imagem") continue;
    const n = normDe.get(u.id)!;
    if (!n) continue;
    const coberto = new Uint8Array(n.length);
    for (const c of cobertosPorPares) if (c.id === u.id) coberto.fill(1, c.ini, c.fim);
    for (const s of segs) {
      if (s.includes(n)) {
        coberto.fill(1);
        break;
      }
      let i = n.indexOf(s);
      while (i >= 0) {
        coberto.fill(1, i, i + s.length);
        i = n.indexOf(s, i + 1);
      }
    }
    let total = 0;
    let feitos = 0;
    let resto = "";
    for (let i = 0; i < n.length; i++) {
      if (n[i] === " ") continue;
      total++;
      if (coberto[i]) feitos++;
      else resto += n[i];
    }
    // Colocado: quase todo coberto, ou o que sobra é só um rótulo curto sem
    // números («Total», «Local:», «Data:») ao lado do que foi copiado.
    const colocado =
      total === 0 ||
      feitos / total >= 0.9 ||
      (feitos > 0 && resto.length <= 12 && !/\d/.test(resto));
    if (colocado) continue;
    const motivo = motivoDe.get(u.id) ?? null;
    naoColocados.push({ id: u.id, texto: textoDaUnidade(u), parte: u.parte, motivo });
    if (!motivo) {
      aviso({
        id: `perdido:${u.id}`,
        campo: "documento",
        dinheiro: false,
        gravidade: "aviso",
        texto: `O texto «${curto(textoDaUnidade(u), 80)}» (${nomeDaParte(d, u.parte)}) não foi para nenhum campo da proposta nova.`,
      });
    }
  }

  return {
    leitura,
    avisos,
    valores,
    naoColocados,
    contas: {
      vatRate,
      somaDasLinhas: soma,
      linhasSemValor,
      modoDasLinhas,
      modoDoTotal,
      ivaPorEscolher,
      sugestaoDasContas,
      sugestaoDasFrases,
      discordancia,
      frasesDoIva,
      leituraDoIva: {
        linhas: entrada.orcamento.iva.valoresDasLinhas,
        total: entrada.orcamento.iva.valoresDoTotal,
      },
    },
    inventados,
  };
}
