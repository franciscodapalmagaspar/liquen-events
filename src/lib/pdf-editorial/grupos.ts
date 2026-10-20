/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS GRUPOS DE INSPIRAÇÃO — PELO NOME DO TEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O exemplo dela arruma os temas em quatro capítulos com separador próprio
 * (Cerimónia, Cocktail, Jantar, Complementos). O sistema não guarda o grupo de
 * cada tema, e ela escolheu, quando lhe pus a pergunta: «Pelo nome do tema».
 * Nenhum campo novo, nada para preencher: o grupo lê-se das palavras que ela já
 * escreve no título.
 *
 * O que não encaixa em nenhum vai para «Ambiente» — um tema chamado «Luzes» ou
 * «Lounge» continua a sair, com separador próprio, em vez de desaparecer.
 *
 * A ordem dos capítulos é a do dia do casamento, e é fixa: a cerimónia antes do
 * cocktail, o cocktail antes do jantar. Dentro de cada capítulo os temas ficam
 * pela ordem em que o documento os traz.
 */

export type Grupo = "cerimonia" | "cocktail" | "jantar" | "complementos" | "ambiente";

/** A ordem do dia. */
export const ORDEM_DOS_GRUPOS: readonly Grupo[] = [
  "cerimonia",
  "cocktail",
  "jantar",
  "complementos",
  "ambiente",
];

/**
 * As palavras de cada grupo, já sem acentos e em minúsculas.
 *
 * A ordem das regras conta: um tema chamado «Mesa da cerimónia» é da
 * cerimónia, não do jantar. Por isso a cerimónia é testada primeiro, e as
 * palavras genéricas («mesa», «centro») ficam para o fim.
 *
 * «seating» é do cocktail porque é lá que o exemplo dela o põe: o plano de
 * mesas é a primeira coisa que os convidados procuram quando saem do cocktail.
 * «bolo» é do jantar, também como no exemplo («Decor Floral Mesa Bolo»).
 */
const REGRAS: readonly (readonly [Grupo, readonly string[]])[] = [
  ["cerimonia", ["cerimonia", "altar", "corredor", "igreja", "ceremony", "aisle", "arco"]],
  [
    "complementos",
    ["complemento", "ramo", "lapela", "bouquet", "boutonniere", "convite", "noiva", "noivo"],
  ],
  ["cocktail", ["cocktail", "welcome", "boas-vindas", "aperitivo", "seating", "bar", "bistro"]],
  ["jantar", ["jantar", "dinner", "banquete", "bolo", "cake", "mesa", "table", "centro"]],
];

const semAcentos = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * A palavra inteira, no singular ou no plural — e não o princípio dela: «bar»
 * não pode apanhar «Vasos de barro», nem «mesa» apanhar «mesada».
 */
const eAPalavra = (p: string, chave: string) =>
  p === chave || p === `${chave}s` || p === `${chave}es`;

/** O grupo de um tema, lido do título (e do subtítulo, se o título não chegar). */
export function grupoDoTema(titulo: string, subtitulo = ""): Grupo {
  for (const texto of [titulo, subtitulo]) {
    const palavras = semAcentos(texto)
      .split(/[^a-z0-9-]+/)
      .filter(Boolean);
    for (const [grupo, chaves] of REGRAS) {
      if (palavras.some((p) => chaves.some((c) => eAPalavra(p, c)))) return grupo;
    }
  }
  return "ambiente";
}

/**
 * ── O TEMA É DAS MESAS? (a paleta e o ambiente) ─────────────────────────────
 *
 * Pedido dela a 20/10, pela colaboradora que faz as propostas: as cinco cores
 * da página «A paleta e o ambiente» saíam sobretudo da cerimónia (o primeiro
 * capítulo), e «muitas vezes as cores que se colocam na cerimónia não são as
 * cores depois do jantar… foca-te nas paletas de cor das mesas de jantar». As
 * mesas de buffet contam também — ela nomeou-as.
 *
 * É o grupo «jantar» do `grupoDoTema` (mesa, centro, jantar, banquete, bolo…),
 * mais qualquer tema com «buffet» que não seja da cerimónia — «Buffet do
 * cocktail» é uma mesa de buffet. Os capítulos do PDF NÃO mudam: isto só
 * escolhe de onde vêm as cores e as fotografias dessa página.
 */
const DAS_MESAS_SEMPRE = ["buffet", "bufete", "bufet"];

export function eDasMesas(titulo: string, subtitulo = ""): boolean {
  const grupo = grupoDoTema(titulo, subtitulo);
  if (grupo === "cerimonia") return false;
  const palavras = semAcentos(`${titulo} ${subtitulo}`)
    .split(/[^a-z0-9-]+/)
    .filter(Boolean);
  if (palavras.some((p) => DAS_MESAS_SEMPRE.some((c) => eAPalavra(p, c)))) return true;
  return grupo === "jantar";
}

/**
 * Agrupa itens pela ordem do dia, mantendo a ordem relativa de cada grupo.
 * Grupos vazios não aparecem.
 */
export function agrupar<T>(
  itens: readonly T[],
  grupoDe: (t: T) => Grupo,
): { grupo: Grupo; itens: T[] }[] {
  const por = new Map<Grupo, T[]>();
  for (const t of itens) {
    const g = grupoDe(t);
    const lista = por.get(g) ?? [];
    lista.push(t);
    por.set(g, lista);
  }
  return ORDEM_DOS_GRUPOS.filter((g) => por.has(g)).map((g) => ({ grupo: g, itens: por.get(g)! }));
}

/**
 * ── E QUANDO NÃO É UM CASAMENTO ─────────────────────────────────────────────
 *
 * Os quatro capítulos de cima são os do dia de um casamento. Numa proposta
 * para um restaurante no Halloween, «Bar» caía em «Cocktail» e «Arco de
 * abóboras» em «Cerimónia» — ela viu-o assim a 13/10, e escolheu: fora dos
 * casamentos, CADA MOOD BOARD É UM CAPÍTULO, com o título que lhe deram e pela
 * ordem em que os puseram. Os casamentos ficam como estavam.
 *
 * Um capítulo destes não tem `grupo`: o nome é o do próprio mood board, e a
 * `chave` («tema-3») é o que o distingue dos outros no plano das páginas.
 */
export interface Capitulo<T> {
  /** O que distingue o capítulo: o grupo do casamento, ou `tema-<n>`. */
  chave: string;
  /** O grupo do dia do casamento; `null` num capítulo que é um mood board só. */
  grupo: Grupo | null;
  itens: T[];
}

/** Os capítulos da inspiração — a regra que o PDF e o plano das páginas partilham. */
export function capitulos<T>(
  itens: readonly T[],
  temaDe: (t: T) => { title?: string; subtitulo?: string },
  casamento: boolean,
): Capitulo<T>[] {
  if (casamento) {
    return agrupar(itens, (t) => grupoDoTema(temaDe(t).title ?? "", temaDe(t).subtitulo ?? "")).map(
      (c) => ({ chave: c.grupo, grupo: c.grupo, itens: c.itens }),
    );
  }
  return itens.map((t, i) => ({ chave: `tema-${i + 1}`, grupo: null, itens: [t] }));
}
