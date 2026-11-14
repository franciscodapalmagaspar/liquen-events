import { parseMoneyText, detectVatMode, type VatMode } from "../proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS REGRAS QUE LÊEM UMA PROPOSTA ANTIGA — E O QUE CADA UMA NÃO SABE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Tudo aqui é determinístico: o mesmo documento dá sempre o mesmo resultado, e
 * cada regra devolve, além do valor, o quanto confia nele. A regra da casa é
 * «nada inventado»: o que não se lê com segurança fica marcado para ela
 * confirmar, ou fica em branco — nunca preenchido a adivinhar.
 *
 * O que estas regras NÃO sabem fazer, para ninguém ficar à espera:
 *  · nomes sem maiúscula, ou escritos só no meio de uma frase longa;
 *  · datas sem ano («12 de setembro») — ficam por confirmar;
 *  · locais que não começam por Quinta, Herdade, Monte, Palácio, Hotel… e não
 *    vêm a seguir a «Local:»;
 *  · se um total «sem nada escrito» inclui IVA — fica para ela escolher.
 */

export type Confianca = "alta" | "media" | "baixa" | "nada";

export interface Lido<T> {
  valor: T;
  confianca: Confianca;
}

export const semAcentos = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// ── NOMES ───────────────────────────────────────────────────────────────────

const MAI = "A-ZÁÀÂÃÉÊÍÓÔÕÚÇ";
const MIN = "a-záàâãéêíóôõúçü";
const NOME = `[${MAI}][${MIN}]+(?:-[${MAI}][${MIN}]+)?`;
const PESSOA = `${NOME}(?:\\s+(?:d[aeo]s?\\s+)?${NOME}){0,3}`;
const PAR_AMP = new RegExp(`(${PESSOA})\\s*(?:&|\\+)\\s*(${PESSOA})`, "gu");
const PAR_E = new RegExp(`(${PESSOA})\\s+e\\s+(${PESSOA})`, "gu");
const SO_PESSOA = new RegExp(`^${PESSOA}$`, "u");

/** Palavras com maiúscula que NÃO são nomes de pessoas numa proposta. */
const NAO_SAO_NOMES = new Set(
  (
    "a o as os de da do das dos e para com em no na " +
    "casamento casamentos proposta propostas orcamento decoracao floral florais flores flor cerimonia " +
    "copo agua jantar almoco cocktail mesa mesas igreja quinta herdade monte palacio hotel convento solar " +
    "casa paco vila capela mosteiro castelo restaurante liquen events eventos evento total iva valor valores " +
    "lisboa porto sintra cascais setubal algarve braga coimbra evora comporta alentejo douro minho madeira acores " +
    "noivos noiva noivo data local cliente clientes servicos servico entrada saida centro centros arco altar bar " +
    "buffet luz luzes iluminacao mobiliario tecidos velas candelabros sala salao jardim terraco inspiracao mood " +
    "board boards condicoes pagamento sinal contactos contacto obrigado obrigada rua avenida praca santa santo " +
    "sao nossa senhora janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro " +
    "segunda terca quarta sexta sabado domingo ramo bouquet papelaria convites sinaletica welcome ceremony " +
    "reception dinner wedding sr sra dr dra eng mesa-de-honra honra lounge photocall marcadores lugares bolo " +
    "pista danca boas vindas vindas portugal valor-total decor apresentacao indice notas observacoes"
  ).split(/\s+/),
);

/** Um nome que traz uma destas palavras é um SÍTIO, e não se aproveita. */
const SITIOS = new Set(
  "quinta herdade monte palacio hotel convento solar casa paco vila capela mosteiro castelo restaurante igreja rua avenida praca".split(
    " ",
  ),
);

function limparPessoa(p: string): string | null {
  const t = p.split(/\s+/).filter(Boolean);
  if (t.some((x) => SITIOS.has(semAcentos(x)))) return null;
  const ligacao = (x: string) => /^d[aeo]s?$/i.test(x);
  while (t.length && (NAO_SAO_NOMES.has(semAcentos(t[0])) || ligacao(t[0]))) t.shift();
  while (t.length && (NAO_SAO_NOMES.has(semAcentos(t[t.length - 1])) || ligacao(t[t.length - 1]))) {
    t.pop();
  }
  if (!t.length || t.some((x) => !ligacao(x) && NAO_SAO_NOMES.has(semAcentos(x)))) return null;
  return t.join(" ");
}

function parNaLinha(linha: string, re: RegExp): string | null {
  re.lastIndex = 0;
  for (const m of linha.matchAll(re)) {
    const a = limparPessoa(m[1]);
    const b = limparPessoa(m[2]);
    if (a && b && semAcentos(a) !== semAcentos(b)) return `${a} & ${b}`;
  }
  return null;
}

const ROTULO_DO_CLIENTE =
  /^\s*(?:noivos?|noiva e noivo|cliente|clientes|casal|nomes?|para)\s*[:\-–—]\s*(.+)$/i;

/**
 * O nome do casal (ou do cliente).
 *
 * @param titulos os títulos das secções, pela ordem (a capa primeiro).
 * @param linhas  todas as linhas do documento, pela ordem.
 */
export function lerNomes(
  titulos: readonly string[],
  linhas: readonly string[],
): Lido<string> | null {
  for (const l of linhas) {
    const m = ROTULO_DO_CLIENTE.exec(l);
    if (!m) continue;
    const par = parNaLinha(m[1], PAR_AMP) ?? parNaLinha(m[1], PAR_E);
    if (par) return { valor: par, confianca: "alta" };
    const so = limparPessoa(m[1].trim());
    if (so && SO_PESSOA.test(so)) return { valor: so, confianca: "media" };
  }
  const inicio = [...titulos.slice(0, 3), ...linhas.slice(0, 12)];
  for (const l of inicio) {
    const par = parNaLinha(l, PAR_AMP);
    if (par) return { valor: par, confianca: "alta" };
  }
  for (const l of inicio) {
    const par = parNaLinha(l, PAR_E);
    if (par) return { valor: par, confianca: "media" };
  }
  for (const l of linhas.slice(0, 40)) {
    const par = parNaLinha(l, PAR_AMP);
    if (par) return { valor: par, confianca: "media" };
  }
  for (const l of [...titulos, ...linhas]) {
    const par = parNaLinha(l, PAR_E);
    if (par) return { valor: par, confianca: "baixa" };
  }
  return null;
}

// ── EMAIL ───────────────────────────────────────────────────────────────────

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** O email do cliente: os da casa (Líquen) ficam de fora. */
export function lerEmail(texto: string): Lido<string> | null {
  const vistos = [...new Set((texto.match(EMAIL) ?? []).map((e) => e.toLowerCase()))].filter(
    (e) => !/liquen/.test(e),
  );
  if (!vistos.length) return null;
  return { valor: vistos[0], confianca: vistos.length === 1 ? "media" : "baixa" };
}

// ── DATAS ───────────────────────────────────────────────────────────────────

const MESES = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const DATA_EXTENSO =
  /\b(\d{1,2})\s*(?:º|ª|o)?\s*(?:de\s+)?(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:de\s+|,\s*)?(\d{4})\b/gi;
const DATA_NUMEROS = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/g;

const NAO_E_O_DIA_DO_EVENTO =
  /valid|pagamento|sinal|liquida|emiti|emiss|enviad|at[eé] ao dia|at[eé] dia|prazo|fa[ck]tura|transfer|nascid|actualizad|atualizad/i;
const ROTULO_DA_DATA =
  /\b(?:data|dia)\b(?:\s+d[oa])?(?:\s+(?:evento|casamento|festa|cerim[oó]nia))?\s*[:\-–—]/i;

export interface DataLida {
  iso: string;
  /** As outras datas encontradas, para o aviso as poder nomear. */
  outras: string[];
}

function isoValido(a: number, m: number, d: number): string | null {
  if (a < 2010 || a > 2045 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Todas as datas de uma linha, já em yyyy-mm-dd. */
export function datasDaLinha(linha: string): string[] {
  const out: string[] = [];
  for (const m of linha.matchAll(DATA_EXTENSO)) {
    const iso = isoValido(Number(m[3]), MESES.indexOf(semAcentos(m[2])) + 1, Number(m[1]));
    if (iso) out.push(iso);
  }
  for (const m of linha.matchAll(DATA_NUMEROS)) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const iso = isoValido(ano, Number(m[2]), Number(m[1]));
    if (iso) out.push(iso);
  }
  return out;
}

/** O dia do evento. */
export function lerData(
  titulos: readonly string[],
  linhas: readonly string[],
): Lido<DataLida> | null {
  // 1. Com rótulo («Data:», «Data do casamento –»).
  for (const l of linhas) {
    if (!ROTULO_DA_DATA.test(l) || NAO_E_O_DIA_DO_EVENTO.test(semAcentos(l))) continue;
    const d = datasDaLinha(l);
    if (d.length) return { valor: { iso: d[0], outras: [] }, confianca: "alta" };
  }
  // 2. No título da capa.
  for (const t of titulos.slice(0, 2)) {
    const d = datasDaLinha(t);
    if (d.length) return { valor: { iso: d[0], outras: [] }, confianca: "alta" };
  }
  // 3. As que sobram, tirando as de pagamentos e validades.
  const todas: string[] = [];
  for (const l of [...titulos, ...linhas]) {
    if (NAO_E_O_DIA_DO_EVENTO.test(semAcentos(l))) continue;
    for (const d of datasDaLinha(l)) if (!todas.includes(d)) todas.push(d);
  }
  if (!todas.length) return null;
  return {
    valor: { iso: todas[0], outras: todas.slice(1) },
    confianca: todas.length === 1 ? "media" : "baixa",
  };
}

// ── DINHEIRO ────────────────────────────────────────────────────────────────

const NUMERO = String.raw`\d{1,3}(?:[.\s\u00a0]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const VALOR = new RegExp(String.raw`(?:€\s*(${NUMERO}))|(?:(${NUMERO})\s*(?:€|eur(?:os)?\b))`, "i");

export interface LinhaDeDinheiro {
  rotulo: string;
  valor: number;
  /** A linha inteira, como estava escrita. */
  linha: string;
}

/** Uma linha com um valor em euros → o rótulo e o valor. `null` se não tem. */
export function lerLinhaDeDinheiro(linha: string): LinhaDeDinheiro | null {
  const m = VALOR.exec(linha);
  if (!m) return null;
  const valor = parseMoneyText(m[1] ?? m[2]);
  if (!(valor > 0)) return null;
  const rotulo = linha
    .replace(m[0], " ")
    .replace(/\(?\s*(?:\+|mais)\s*iva\s*\)?/gi, " ")
    .replace(/\.{2,}|…+|_{2,}/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s:\-–—|•·*]+|[\s:\-–—|•·*(]+$/g, "")
    .trim();
  return { rotulo, valor, linha };
}

/**
 * ── AS LINHAS QUE NÃO SÃO SERVIÇO: UMA LISTA SÓ ───────────────────────────
 * Uma linha cujo rótulo tenha QUALQUER uma destas palavras vem marcada como
 * «não é serviço» na conferência — só como SUGESTÃO: cada linha tem o seu
 * interruptor, e ela decide (`ImportarProposta`, `propostaConferida`).
 * As do IVA (`PALAVRAS_DO_IVA`) só contam FORA de parênteses: «Flores (IVA
 * 6%)» é um serviço.
 */
export const PALAVRAS_FINANCEIRAS: readonly RegExp[] = [
  /\btotal/, // total, totais
  /sub-?\s?total/,
  /liquido/, // líquido, sem acentos
  /liquidac/, // liquidação
  /\ba pagar\b/,
  /pagamento/,
  /prestac/, // prestação, prestações
  /\bsinal\b/,
  /adjudica/, // adjudicação
  /\bvalor sem\b/,
  /\bvalor com\b/,
  /base tributavel/,
  /^base$/, // exatamente «Base» — nunca «Base de bolo»
  /desconto/,
  /abatimento/,
  /restante/,
  /caucao/, // caução
  /reforco/, // reforço
  /remanescente/,
  /\bsaldo\b/,
  /\bentrada\b/,
  /\bvalor global\b/,
  /\bvalor final\b/,
  /\bvalor da proposta\b/,
];

/**
 * A reserva: «Reserva do espaço» e «Reserva de mesa» são serviços; só estas
 * não. Testam-se no nome SEM parênteses e sem «de X%» — «Reserva (30%)» e
 * «Reserva de 30%» são a reserva da data.
 */
export const PALAVRAS_DA_RESERVA: readonly RegExp[] = [
  /^reserva$/,
  /reserva da data/,
  /valor da reserva/,
];

/** As palavras do IVA: só contam no rótulo SEM o que está entre parênteses. */
export const PALAVRAS_DO_IVA: readonly RegExp[] = [/\biva\b/, /\bvat\b/];

const limpo = (rotulo: string) => semAcentos(rotulo).replace(/\s+/g, " ").trim();

/** Um desconto ou um abatimento: um aviso de dinheiro («põe à mão»). */
export function eDesconto(rotulo: string): boolean {
  return /desconto|abatimento/.test(semAcentos(rotulo));
}

/** «Oferta»: um serviço com valor 0. */
export function eOferta(rotulo: string): boolean {
  return /\boferta\b/.test(semAcentos(rotulo));
}

/** «Opcional»: um serviço opcional (`budgetOpcional`). */
export function eOpcional(rotulo: string): boolean {
  return /opcional/.test(semAcentos(rotulo));
}

/** O rótulo (já sem o «:» e sem o valor, `lerLinhaDeDinheiro`) não é de um serviço. */
export function eFinanceira(rotulo: string): boolean {
  const r = limpo(rotulo);
  const semParenteses = r
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const nucleo = semParenteses
    .replace(/\bde\s+\d+(?:[.,]\d+)?\s*%/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    PALAVRAS_FINANCEIRAS.some((p) => p.test(r)) ||
    PALAVRAS_DO_IVA.some((p) => p.test(semParenteses)) ||
    PALAVRAS_DA_RESERVA.some((p) => p.test(nucleo)) ||
    // «Valor por pessoa»: um preço unitário, não um serviço.
    (/^valor\b/.test(r) && ePorPessoa(r))
  );
}

/** «Total por pessoa», «p/ pessoa», «/pax», «por convidado». */
export function ePorPessoa(texto: string): boolean {
  return /por pessoa|p\/\s*pessoa|\/\s*pax\b|por convidado/.test(semAcentos(texto));
}

/**
 * Uma linha que pode ser o total: o rótulo tem «total», «valor com/sem IVA»,
 * «valor global/final/da proposta», «montante total», «base» ou «líquido».
 * NUNCA o «Subtotal», nem uma linha de um pagamento, nem um valor por pessoa
 * (esse trata-se à parte: `candidataPorPessoa`).
 */
export function eCandidataATotal(rotulo: string): boolean {
  const r = limpo(rotulo);
  if (!eFinanceira(rotulo) || /sub-?\s?total/.test(r)) return false;
  if (/\bsinal\b|prestac|adjudica|pagamento|restante|reforco|caucao/.test(r)) return false;
  if (ePorPessoa(r)) return false;
  return /\btotal|\bvalor (?:com|sem) iva\b|\bvalor (?:global|final|da proposta)\b|\bbase\b|liquido/.test(
    r,
  );
}

const VALOR_GLOBAL = new RegExp(VALOR.source, "gi");

/**
 * «Total por pessoa: 95 € × 120 = 11 400 €»: o valor por pessoa não é o
 * total, mas a conta que dá o total é — a candidata é o ÚLTIMO valor, com a
 * linha inteira por rótulo. Com um só valor (o por pessoa), não há candidata.
 */
export function candidataPorPessoa(linha: string): { rotulo: string; valor: number } | null {
  if (!ePorPessoa(linha) || !/\btotal/.test(semAcentos(linha))) return null;
  const valores = [...linha.matchAll(VALOR_GLOBAL)].map((m) => parseMoneyText(m[1] ?? m[2]));
  if (valores.length < 2) return null;
  const valor = valores[valores.length - 1];
  return valor > 0 ? { rotulo: linha.replace(/\s+/g, " ").trim(), valor } : null;
}

/** A linha é sobre o IVA (o valor do imposto): «IVA (23%)», «IVA». */
export function eLinhaDoIva(rotulo: string): boolean {
  const r = limpo(rotulo);
  return (
    /^(?:o\s+)?(?:valor\s+do\s+)?iva\b/.test(r) && !/\btotal|\bvalor com\b|\bvalor sem\b/.test(r)
  );
}

/** Uma candidata ao total, como ela a vê na conferência. */
export interface CandidataAoTotal {
  id: string;
  /** O rótulo inteiro (ou a conta, numa derivada). */
  rotulo: string;
  valor: number;
  /** Tirada de um trio («3 000 € = Total 3 690 € − IVA 690 €»), não escrita. */
  derivada?: boolean;
  /** O lado do IVA que o rótulo sugere: «sem» (base, sem IVA, líquido) ou «com». */
  lado?: "sem" | "com";
}

/** O lado que o rótulo de um total sugere (só para ordenar e derivar). */
export function ladoDoTotal(rotulo: string): "sem" | "com" | undefined {
  const r = semAcentos(rotulo);
  if (/\bsem iva|s\/\s*iva|\bbase\b|liquido|\+\s*iva/.test(r)) return "sem";
  if (/\bcom iva|c\/\s*iva|iva inclu/.test(r)) return "com";
  return undefined;
}

/**
 * As candidatas tiradas de um trio: com o valor do IVA escrito, um total
 * «com» (ou sem lado) dá a base (T − IVA) e uma base dá o total (B + IVA),
 * quando esse valor não está já na lista. Só SUGESTÕES: ela escolhe.
 */
export function candidatasDerivadas(
  lidas: readonly CandidataAoTotal[],
  ivas: readonly { rotulo: string; valor: number }[],
  euros: (n: number) => string,
): CandidataAoTotal[] {
  const out: CandidataAoTotal[] = [];
  const ja = new Set(lidas.map((c) => Math.round(c.valor * 100)));
  for (const iva of ivas) {
    for (const c of lidas) {
      const sem = c.lado === "sem";
      const v = Math.round((sem ? c.valor + iva.valor : c.valor - iva.valor) * 100) / 100;
      if (!(v > 0) || ja.has(Math.round(v * 100))) continue;
      ja.add(Math.round(v * 100));
      out.push({
        id: `d${out.length}`,
        rotulo: `${euros(v)} = ${c.rotulo} ${euros(c.valor)} ${sem ? "+" : "−"} ${iva.rotulo} ${euros(iva.valor)}`,
        valor: v,
        derivada: true,
        lado: sem ? "com" : "sem",
      });
    }
  }
  return out;
}

/**
 * A taxa de IVA escrita no documento, SÓ quando o número com «%» está colado
 * a «IVA» («IVA 6%», «IVA (6%)», «IVA à taxa de 6%», «6% de IVA») e a frase
 * não fala de sinal, adjudicação, desconto, reserva, pagamento, prestação ou
 * entrada. Em fração e sem repetidas. É uma SUGESTÃO para o campo da taxa.
 */
export function taxasDoIvaEscritas(texto: string): number[] {
  const taxas = new Set<number>();
  const N = String.raw`(\d{1,2}(?:[.,]\d{1,2})?)\s*%`;
  const E = [
    new RegExp(String.raw`\biva\s*\(?\s*${N}`, "g"),
    new RegExp(String.raw`\biva\s+a\s+taxa\s+de\s+${N}`, "g"),
    new RegExp(String.raw`${N}\s*de\s+iva\b`, "g"),
  ];
  // As frases: um ponto seguido de um algarismo é uma casa decimal, não o fim.
  for (const frase of semAcentos(texto).split(/[\n;!?]|\.(?!\d)/)) {
    if (/sinal|adjudica|desconto|reserva|pagamento|prestac|entrada/.test(frase)) continue;
    for (const e of E) {
      for (const m of frase.matchAll(e)) {
        const n = Number(m[1].replace(",", "."));
        if (n > 0 && n < 100) taxas.add(Math.round(n * 100) / 10000);
      }
    }
  }
  return [...taxas];
}

const DIZ_QUE_ACRESCE =
  /\+\s*iva|mais\s+iva|acresce[m]?\s+(?:de\s+|o\s+)?iva|iva\s+(?:à|a)\s+taxa|sem\s+iva|s\/\s*iva|iva\s+n[aã]o\s+inclu|n[aã]o\s+inclu\w*\s+(?:o\s+)?iva/i;
const DIZ_QUE_INCLUI = /com\s+iva|iva\s+inclu[ií]d|inclui\s+(?:o\s+)?iva|c\/\s*iva|iva\s+incl\b/i;

/**
 * O total inclui IVA ou acresce IVA?
 *
 * A linha do total manda, com o `detectVatMode` de sempre. Sem nada nela, o
 * resto do documento — e aí só com confiança média. Sem nada em lado nenhum,
 * ou com as duas coisas escritas, NÃO se decide: `null`, e ela escolhe.
 */
export function lerModoDoIva(linhaDoTotal: string, textoTodo: string): Lido<VatMode> | null {
  if (detectVatMode(linhaDoTotal) === "acrescer" || DIZ_QUE_ACRESCE.test(linhaDoTotal)) {
    return { valor: "acrescer", confianca: "alta" };
  }
  if (DIZ_QUE_INCLUI.test(linhaDoTotal)) return { valor: "incluido", confianca: "alta" };
  const acresce = DIZ_QUE_ACRESCE.test(textoTodo);
  const inclui = DIZ_QUE_INCLUI.test(textoTodo);
  if (acresce && !inclui) return { valor: "acrescer", confianca: "media" };
  if (inclui && !acresce) return { valor: "incluido", confianca: "media" };
  return null;
}

// ── LOCAL, CONVIDADOS, TIPO ─────────────────────────────────────────────────

const ROTULO_DO_LOCAL =
  /^\s*(?:local(?:\s+do\s+(?:evento|casamento))?|espa[cç]o|onde)\s*[:\-–—]\s*(.{3,120})$/i;
const PALAVRA = `[${MAI}][\\w${MIN}'’-]+`;
const LUGAR = new RegExp(
  `\\b(?:Quinta|Herdade|Monte|Pal[aá]cio|Hotel|Convento|Solar|Pa[cç]o|Mosteiro|Castelo|Casa|Vila|Restaurante|Igreja|Capela)\\s+(?:(?:d[aeo]s?|de)\\s+)?${PALAVRA}(?:\\s+(?:(?:d[aeo]s?|de)\\s+)?${PALAVRA}){0,3}`,
  "gu",
);

export function lerLocal(linhas: readonly string[]): Lido<string> | null {
  for (const l of linhas) {
    const m = ROTULO_DO_LOCAL.exec(l);
    if (m) return { valor: m[1].trim().replace(/[.;]$/, ""), confianca: "alta" };
  }
  const vistos: string[] = [];
  for (const l of linhas) {
    for (const m of l.matchAll(LUGAR)) {
      const v = m[0].trim();
      if (!vistos.some((x) => semAcentos(x) === semAcentos(v))) vistos.push(v);
    }
  }
  if (!vistos.length) return null;
  // Uma igreja é o sítio da cerimónia, não o do copo-d'água — fica atrás.
  const fora = vistos.filter((v) => !/^(Igreja|Capela)/.test(v));
  const escolhido = fora[0] ?? vistos[0];
  const confianca: Confianca = fora.length === 1 ? "media" : "baixa";
  return { valor: escolhido, confianca };
}

export function lerConvidados(texto: string): Lido<number> | null {
  const vistos = new Set<number>();
  for (const m of texto.matchAll(/\b(\d{2,4})\s*(?:convidados|pessoas|pax|guests)\b/gi)) {
    const n = Number(m[1]);
    if (n >= 10 && n <= 3000) vistos.add(n);
  }
  if (!vistos.size) return null;
  const [primeiro] = vistos;
  return { valor: primeiro, confianca: vistos.size === 1 ? "alta" : "baixa" };
}

export interface TipoLido {
  /** Como o estúdio o escreve («Casamento»). */
  rotulo: string;
  categoria: "particulares" | "empresas";
  /** O id do formulário de pedidos (`EVENT_TYPES_BY_CATEGORY`), ou `null`. */
  tipo: string | null;
}

const TIPOS: { re: RegExp; tipo: TipoLido }[] = [
  {
    re: /casament|noivos|noiva|copo d.agua|wedding|matrimon/,
    tipo: { rotulo: "Casamento", categoria: "particulares", tipo: "casamentos" },
  },
  {
    re: /batizado|baptizado|comunh/,
    tipo: { rotulo: "Batizado", categoria: "particulares", tipo: "batizados" },
  },
  {
    re: /aniversario/,
    tipo: { rotulo: "Aniversário", categoria: "particulares", tipo: "aniversarios" },
  },
  {
    re: /jantar de empresa|jantar corporativo|festa de natal|evento corporativo/,
    tipo: { rotulo: "Jantar de empresa", categoria: "empresas", tipo: "jantares_empresa" },
  },
  {
    re: /\bgala\b/,
    tipo: { rotulo: "Jantar de gala", categoria: "particulares", tipo: "jantares_gala" },
  },
  {
    re: /conferencia|congresso/,
    tipo: { rotulo: "Evento corporativo", categoria: "empresas", tipo: "conferencias" },
  },
  {
    re: /lancamento/,
    tipo: { rotulo: "Evento corporativo", categoria: "empresas", tipo: "lancamentos" },
  },
];

export function lerTipoDeEvento(inicio: string, todo: string): Lido<TipoLido> | null {
  const a = semAcentos(inicio);
  for (const t of TIPOS) if (t.re.test(a)) return { valor: t.tipo, confianca: "alta" };
  const b = semAcentos(todo);
  for (const t of TIPOS) if (t.re.test(b)) return { valor: t.tipo, confianca: "media" };
  return null;
}
