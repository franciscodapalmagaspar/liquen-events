import type { ProposalDoc, SubpontoDoOrcamento } from "@/lib/proposal-doc";
import {
  adicionarLinha,
  dinheiroDaProposta,
  precosDe,
  somaDosExtrasSemIva,
} from "@/lib/proposal-budget";
import { opcionaisDe, totalDaVersaoAceite, type VersaoEscolhida } from "./versoes-da-proposta";
import { eur, round2, splitSinal } from "@/lib/money";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS ARTIGOS DA FATURAÇÃO — O QUE CADA EURO DA PROPOSTA É, NO MOLONI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (5/11): «na faturação preciso de artigos. Tenho um artigo que é para
 * materiais, outro para decoração floral, um para montagem e desmontagem, um
 * para transporte e outro de serviços no Moloni. O que era interessante era ter
 * estes artigos nas propostas». E a seguir: «quero mesmo também ligar ao
 * Moloni».
 *
 * O total sem IVA de cada proposta reparte-se por estes artigos — é
 * informação INTERNA: não sai no PDF nem na página do casal, e mudá-la não
 * mexe na versão que o cliente aceitou (`NUNCA_NO_PDF`).
 *
 * ── OS NOMES SÃO OS DO MOLONI, LETRA A LETRA ─────────────────────────────
 *
 * Ela: «os nomes das coisas têm que ser iguais». A ligação procura cada
 * artigo no Moloni pelo NOME (sem contar acentos nem maiúsculas) e põe no
 * rascunho o nome tal como está lá. Se um nome daqui não existir lá, nada é
 * criado e o botão diz qual — e os parecidos que encontrou.
 *
 * ── A REGRA DO DINHEIRO ──────────────────────────────────────────────────
 *
 * A repartição tem de dar EXACTAMENTE o total sem IVA da proposta aceite — é
 * esse que o cliente aceitou, e é dele que saem o sinal (30%) e o saldo (70%).
 * Se não der, não se adivinha nada: diz-se quanto falta (ou sobra), e não se
 * cria fatura nenhuma até fechar.
 */

/**
 * Os artigos do Moloni da Líquen, com o NOME e o CÓDIGO tal e qual estão lá
 * (capturas dela, 5/11 — «Pesquisa avançada de artigos»). A ligação procura-os
 * pelo CÓDIGO, que não tem acentos nem muda de grafia; o nome é o que se vê.
 *
 * Ela escolheu «os de decoração e eventos»: ficam de fora os de catering
 * (Bebidas, Coffeebreak, Almoço, Prestação de Serviço). E a montagem e
 * desmontagem fatura-se como «Serviço» (resposta dela, 5/11).
 */
export const ARTIGOS = [
  { id: "material", nome: "Material", ref: "EXE.11", ajuda: "" },
  { id: "flores", nome: "Flores e Elementos de Decoração", ref: "EXE.2", ajuda: "" },
  { id: "servico", nome: "Serviço", ref: "EXE.4", ajuda: "inclui montagem e desmontagem" },
  { id: "transporte", nome: "Transporte", ref: "EXE.5", ajuda: "" },
  { id: "alojamento", nome: "Alojamento", ref: "EXE.6", ajuda: "" },
  { id: "wedding-coordinator", nome: "Wedding Coordinator", ref: "EXE.10", ajuda: "" },
] as const;

export type ArtigoId = (typeof ARTIGOS)[number]["id"];

export function eArtigo(x: unknown): x is ArtigoId {
  return typeof x === "string" && ARTIGOS.some((a) => a.id === x);
}

export function nomeDoArtigo(id: ArtigoId): string {
  return ARTIGOS.find((a) => a.id === id)?.nome ?? id;
}

/** O código do artigo no Moloni (EXE.2…) — o que se escreve na pesquisa de lá. */
export function refDoArtigo(id: ArtigoId): string {
  return ARTIGOS.find((a) => a.id === id)?.ref ?? "";
}

/**
 * O valor como se escreve num campo de preço: «2535,00» — vírgula decimal, sem
 * separador de milhares nem «€», para colar sem ter de apagar nada.
 */
export function valorParaColar(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2).replace(".", ",");
}

/**
 * O artigo que o NOME de uma linha sugere — ou `null` quando não é claro.
 *
 * Para poupar trabalho (ela, 5/11: «é para nos poupar trabalho»): o botão
 * «Sugerir pelos nomes» preenche só as linhas SEM artigo, e ela confirma de
 * relance. Conservador de propósito: uma palavra que não diz claramente o que
 * é fica por escolher, em vez de adivinhada. A ordem conta — «transporte de
 * flores» é transporte, não decoração floral.
 */
const PISTAS: [ArtigoId, RegExp][] = [
  ["transporte", /\b(transporte|deslocac|viagem|portes\b|km\b)/],
  ["alojamento", /\b(alojamento|hotel|estadia|dormida)/],
  ["wedding-coordinator", /\b(wedding coordinator|wedding planner|coordenac|coordinator)/],
  ["servico", /\b(montagem|desmontagem|montar|desmontar|instalac|servico|servicos|equipa|staff)/],
  [
    "flores",
    /\b(flor|flores|floral|florais|bouquet|ramo|arranjo|centros? de mesa|arco|decor|decorac)/,
  ],
  [
    "material",
    /\b(material|materiais|aluguer|mobiliario|tecido|tecidos|loica|velas|vidro|estrutura)/,
  ],
];

export function artigoSugerido(nome: string): ArtigoId | null {
  const t = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const [artigo, re] of PISTAS) if (re.test(t)) return artigo;
  return null;
}

export interface ParcelaDoArtigo {
  artigo: ArtigoId;
  nome: string;
  /** Sem IVA. */
  valor: number;
}

export interface Faturacao {
  /** A repartição dá exactamente o total sem IVA (e não está vazia). */
  fecha: boolean;
  /** Porque é que não fecha, em palavras que se lêem. Vazio quando fecha. */
  porqueNaoFecha: string[];
  /** O total sem IVA da proposta (da versão aceite). */
  base: number;
  /** O total com IVA. */
  bruto: number;
  vatRate: number;
  /** O que já está repartido, somado. */
  repartido: number;
  /** `base - repartido`: positivo falta repartir, negativo repartiu-se a mais. */
  falta: number;
  /** Por artigo, pela ordem de {@link ARTIGOS}, só os que têm valor. */
  artigos: ParcelaDoArtigo[];
  /**
   * De onde vêm os valores: das LINHAS da proposta (preço e artigo de cada
   * uma — o caminho de todas as propostas novas), ou da repartição feita à mão
   * (as propostas antigas, que não têm preço por linha).
   */
  modo: "linhas" | "manual";
  /** As linhas que entram, com o valor sem IVA e o artigo. */
  linhas: LinhaFaturavel[];
}

/** Uma linha do orçamento (ou um valor adicional) vista pela faturação. */
export interface LinhaFaturavel {
  origem: "linha" | "adicional" | "subponto";
  /** A posição em `budgetItems` ou em `budgetExtras`. */
  indice: number;
  /** Num subponto, a posição dele dentro da linha `indice`. */
  sub?: number;
  nome: string;
  /** Sem IVA. `null` quando a linha não tem preço. */
  valor: number | null;
  artigo: ArtigoId | null;
}

export type DocParaFaturar = Pick<
  ProposalDoc,
  | "budgetItems"
  | "budgetAmounts"
  | "budgetOpcional"
  | "budgetExtras"
  | "budgetExtrasSomam"
  | "budgetArtigos"
  | "budgetSubpontos"
  | "repartoPorArtigo"
  | "totalAmount"
  | "totalVatMode"
  | "vatRate"
  | "totalText"
  | "totalEstimatedText"
>;

/**
 * O total sem IVA (e com IVA) da versão que conta. Vive em
 * `versoes-da-proposta.ts` (`totalDaVersaoAceite`) para os Pagamentos, as
 * Cobranças e o «Gerar» lerem a MESMA conta que a faturação.
 */
const totalDaVersao = (doc: DocParaFaturar, versao?: VersaoEscolhida) =>
  totalDaVersaoAceite(doc, versao);

/** A repartição guardada, limpa: só artigos conhecidos, só números ≥ 0. */
export function repartoDe(
  doc: Pick<ProposalDoc, "repartoPorArtigo">,
): Partial<Record<ArtigoId, number>> {
  const out: Partial<Record<ArtigoId, number>> = {};
  for (const a of ARTIGOS) {
    const v = doc.repartoPorArtigo?.[a.id];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[a.id] = round2(v);
  }
  return out;
}

/**
 * ── PORQUE É QUE SE REPARTE O TOTAL, E NÃO LINHA A LINHA ─────────────────
 *
 * A primeira ideia foi um artigo por linha do orçamento. Medido nas propostas
 * ACEITES a 5/11 (só leitura): nenhuma tem preço por linha — o dinheiro está no
 * total escrito à mão, e três nem têm linhas. Linha a linha nunca fecharia.
 * Repartir o total por cinco artigos é o que elas já fazem de cabeça quando
 * faturam, e fecha sempre que se queira.
 */
export function faturacaoPorArtigo(doc: DocParaFaturar, versao?: VersaoEscolhida): Faturacao {
  const t = totalDaVersao(doc, versao);
  const linhas = linhasDaFaturacao(doc, versao);
  const porqueNaoFecha: string[] = [];

  // ── MODO «LINHAS»: tudo vem da proposta ──────────────────────────────────
  // Quando todas as linhas têm preço e a soma dá o total, os valores por
  // artigo saem feitos — não há contas nenhumas a fazer na faturação.
  const todasComPreco = linhas.length > 0 && linhas.every((l) => l.valor !== null);
  const somaDasLinhas = round2(linhas.reduce((s, l) => s + (l.valor ?? 0), 0));
  if (todasComPreco && t.base > 0 && Math.abs(somaDasLinhas - t.base) <= 0.01) {
    const porArtigo = new Map<ArtigoId, number>();
    for (const l of linhas) {
      if (l.artigo) porArtigo.set(l.artigo, (porArtigo.get(l.artigo) ?? 0) + (l.valor ?? 0));
    }
    const semArtigo = linhas.filter((l) => !l.artigo && (l.valor ?? 0) !== 0);
    if (semArtigo.length > 0)
      porqueNaoFecha.push(frasePorFalta(semArtigo, "não tem artigo", "não têm artigo"));
    const artigos = ARTIGOS.filter((a) => (porArtigo.get(a.id) ?? 0) > 0).map((a) => ({
      artigo: a.id,
      nome: a.nome,
      valor: round2(porArtigo.get(a.id)!),
    }));
    const repartido = round2(artigos.reduce((s, a) => s + a.valor, 0));
    return {
      fecha: porqueNaoFecha.length === 0,
      porqueNaoFecha,
      base: t.base,
      bruto: t.bruto,
      vatRate: t.vatRate,
      repartido,
      falta: round2(t.base - repartido),
      artigos,
      modo: "linhas",
      linhas,
    };
  }

  // ── MODO «MANUAL»: as propostas antigas, sem preço por linha ─────────────
  const reparto = repartoDe(doc);
  const artigos = ARTIGOS.filter((a) => (reparto[a.id] ?? 0) > 0).map((a) => ({
    artigo: a.id,
    nome: a.nome,
    valor: reparto[a.id]!,
  }));
  const repartido = round2(artigos.reduce((s, a) => s + a.valor, 0));
  const falta = round2(t.base - repartido);
  if (t.base <= 0) porqueNaoFecha.push("A proposta ainda não tem total.");
  else if (artigos.length === 0)
    porqueNaoFecha.push("O total ainda não está repartido pelos artigos.");
  else if (Math.abs(falta) > 0.005)
    porqueNaoFecha.push(
      falta > 0
        ? `Falta repartir ${eur(falta)}.`
        : `Repartiu-se ${eur(-falta)} a mais do que o total.`,
    );
  return {
    fecha: porqueNaoFecha.length === 0,
    porqueNaoFecha,
    base: t.base,
    bruto: t.bruto,
    vatRate: t.vatRate,
    repartido,
    falta,
    artigos,
    modo: "manual",
    linhas,
  };
}

function frasePorFalta(ls: LinhaFaturavel[], um: string, varios: string): string {
  const nomes = ls
    .slice(0, 3)
    .map((l) => `«${l.nome}»`)
    .join(", ");
  return ls.length === 1
    ? `${nomes} ${um}.`
    : `${ls.length} linhas ${varios}: ${nomes}${ls.length > 3 ? "…" : ""}.`;
}

/**
 * As linhas que entram na faturação: as do orçamento (sem as extra, na versão
 * base) e os valores adicionais que têm um número. Uma linha sem nome e sem
 * preço não é nada — o PDF também não a imprime. Um adicional sem número («a
 * definir», «oferta») não entra: o total também não o soma.
 */
export function linhasDaFaturacao(doc: DocParaFaturar, versao?: VersaoEscolhida): LinhaFaturavel[] {
  const t = totalDaVersao(doc, versao);
  const precos = precosDe(doc);
  const extra = opcionaisDe(doc);
  const artigos = artigosDasLinhas(doc);
  const subpontos = subpontosDe(doc);
  const out: LinhaFaturavel[] = [];
  (doc.budgetItems ?? []).forEach((item, i) => {
    const nome = (item ?? "").trim();
    if (!nome && precos[i] === null && subpontos[i].length === 0) return;
    if (t.versoes && extra[i]) return;
    // Com subpontos, fatura-se cada subponto no seu artigo (6/11); a linha
    // vale a soma deles e não leva artigo próprio.
    if (subpontos[i].length > 0) {
      out.push(...linhasDosSubpontos(nome || `Linha ${i + 1}`, i, subpontos[i]));
      return;
    }
    out.push({
      origem: "linha",
      indice: i,
      nome: nome || `Linha ${i + 1}`,
      valor: precos[i],
      artigo: artigos[i],
    });
  });
  (doc.budgetExtras ?? []).forEach((e, i) => {
    if (!/\d/.test(e?.valueText ?? "")) return;
    out.push({
      origem: "adicional",
      indice: i,
      nome: (e?.label ?? "").trim() || `Valor adicional ${i + 1}`,
      valor: somaDosExtrasSemIva([e], { mode: t.mode, vatRate: t.vatRate }),
      artigo: eArtigo(e?.artigo) ? e.artigo : null,
    });
  });
  return out;
}

/** O artigo de cada linha do orçamento, ao tamanho das linhas. */
export function artigosDasLinhas(
  doc: Pick<ProposalDoc, "budgetItems" | "budgetArtigos">,
): (ArtigoId | null)[] {
  const n = doc.budgetItems?.length ?? 0;
  const guardado = doc.budgetArtigos ?? [];
  return Array.from({ length: n }, (_, i) => (eArtigo(guardado[i]) ? guardado[i] : null));
}

/** O artigo de um valor adicional, ou `null`. */
export function artigoDoAdicional(e: unknown): ArtigoId | null {
  const a = e && typeof e === "object" ? (e as { artigo?: unknown }).artigo : undefined;
  return eArtigo(a) ? a : null;
}

/** Escolhe (ou tira) o artigo de uma linha, sem tocar em mais nada. */
export function definirArtigoDaLinha<T extends Pick<ProposalDoc, "budgetItems" | "budgetArtigos">>(
  doc: T,
  i: number,
  artigo: ArtigoId | null,
): T {
  return { ...doc, budgetArtigos: artigosDasLinhas(doc).map((v, j) => (j === i ? artigo : v)) };
}

/** Para comparar nomes: sem acentos, sem maiúsculas, sem espaços a mais. */
function chaveDoNome(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Os serviços da proposta (os títulos dos grupos do passo «Serviços») que
 * ainda não têm linha no orçamento. Ela (5/11): «serviço tal, valor tal,
 * serviço tal, valor tal» — os serviços já estão escritos; o que falta é o
 * valor à frente de cada um.
 */
export function servicosForaDoOrcamento(
  doc: Pick<ProposalDoc, "serviceGroups" | "budgetItems">,
): string[] {
  const ja = new Set((doc.budgetItems ?? []).map((i) => chaveDoNome(i ?? "")));
  const vistos = new Set<string>();
  const fora: string[] = [];
  for (const g of doc.serviceGroups ?? []) {
    const titulo = (g?.title ?? "").trim();
    const k = chaveDoNome(titulo);
    if (!k || ja.has(k) || vistos.has(k)) continue;
    vistos.add(k);
    fora.push(titulo);
  }
  return fora;
}

/**
 * Põe no orçamento uma linha por cada serviço que lá falta, com o artigo do
 * Moloni que o nome sugere (e nenhum quando não é claro). O preço fica por
 * escrever — é o único gesto que sobra.
 */
export function trazerServicosParaOOrcamento<
  T extends Parameters<typeof adicionarLinha>[0] &
    Pick<ProposalDoc, "serviceGroups" | "budgetArtigos" | "budgetSubpontos">,
>(doc: T): T {
  let d = doc;
  const grupos = doc.serviceGroups ?? [];
  for (const nome of servicosForaDoOrcamento(doc)) {
    d = adicionarLinha(d, nome);
    const i = (d.budgetItems?.length ?? 1) - 1;
    // Os subpontos do serviço vêm com ele (6/11): cada um com o artigo que o
    // nome sugere (ou o do serviço, quando o do subponto não é claro).
    const grupo = grupos.find((g) => chaveDoNome(g?.title ?? "") === chaveDoNome(nome));
    const itens = (grupo?.items ?? [])
      .map((it) => (it?.label ?? "").trim())
      .filter((l) => l.length > 0);
    if (itens.length > 0) {
      d = definirSubpontos(
        d,
        i,
        itens.map((label) => ({
          nome: label,
          valor: null,
          artigo: artigoSugerido(label) ?? artigoSugerido(nome),
        })),
      );
    } else {
      d = definirArtigoDaLinha(d, i, artigoSugerido(nome));
    }
  }
  return d;
}

/**
 * O artigo de uma linha que ainda não tem nenhum, pelo nome dela. Nunca troca
 * um artigo já escolhido.
 */
export function sugerirArtigoDaLinha<T extends Pick<ProposalDoc, "budgetItems" | "budgetArtigos">>(
  doc: T,
  i: number,
): T {
  if (artigosDasLinhas(doc)[i]) return doc;
  const sugerido = artigoSugerido((doc.budgetItems ?? [])[i] ?? "");
  return sugerido ? definirArtigoDaLinha(doc, i, sugerido) : doc;
}

/** Escolhe (ou tira) o artigo de um valor adicional. */
export function definirArtigoDoAdicional<T extends Pick<ProposalDoc, "budgetExtras">>(
  doc: T,
  i: number,
  artigo: ArtigoId | null,
): T {
  return {
    ...doc,
    budgetExtras: (doc.budgetExtras ?? []).map((e, j) => {
      if (j !== i) return e;
      const { artigo: _antes, ...resto } = e;
      void _antes;
      return artigo ? { ...resto, artigo } : resto;
    }),
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE FALTA NA PROPOSTA PARA A FATURAÇÃO SAIR FEITA — E TRAVA O ENVIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (5/11): «é importante nas propostas dizer lá que é obrigatório … não
 * deixar enviar as propostas sem estabelecer um valor para cada coisa na
 * proposta, não para mostrar ao cliente, mas sim para depois no Moloni estar
 * tudo registado.»
 *
 * Todas as linhas (as extra também — podem ser escolhidas) com preço, todas com
 * artigo, e os adicionais com número também com artigo. A soma com o total é
 * o `desalinhamento`, que já existia em `proposal-progress.ts`.
 */
export function faltasDaFaturacao(
  doc: Pick<
    ProposalDoc,
    "budgetItems" | "budgetAmounts" | "budgetArtigos" | "budgetExtras" | "budgetSubpontos"
  >,
): { semPreco: LinhaFaturavel[]; semArtigo: LinhaFaturavel[] } {
  const precos = precosDe(doc);
  const artigos = artigosDasLinhas(doc);
  const subpontos = subpontosDe(doc);
  const linhas: LinhaFaturavel[] = [];
  (doc.budgetItems ?? []).forEach((item, i) => {
    const nome = (item ?? "").trim();
    if (!nome && precos[i] === null && subpontos[i].length === 0) return;
    if (subpontos[i].length > 0) {
      linhas.push(...linhasDosSubpontos(nome || `Linha ${i + 1}`, i, subpontos[i]));
      return;
    }
    linhas.push({
      origem: "linha",
      indice: i,
      nome: nome || `Linha ${i + 1}`,
      valor: precos[i],
      artigo: artigos[i],
    });
  });
  (doc.budgetExtras ?? []).forEach((e, i) => {
    if (!/\d/.test(e?.valueText ?? "")) return;
    linhas.push({
      origem: "adicional",
      indice: i,
      nome: (e?.label ?? "").trim() || `Valor adicional ${i + 1}`,
      valor: 0,
      artigo: eArtigo(e?.artigo) ? e.artigo : null,
    });
  });
  return {
    semPreco: linhas.filter((l) => l.valor === null),
    semArtigo: linhas.filter((l) => !l.artigo),
  };
}

export { frasePorFalta };

/**
 * Uma repartição SUGERIDA, para ela confirmar: o que os nomes dizem com
 * clareza (a deslocação é Transporte; uma linha com preço chamada «Montagem» é
 * Serviço), e nada mais. O resto fica por repartir — é ela que
 * diz onde, com «Pôr o resto em…».
 */
export function sugestaoDeReparto(
  doc: DocParaFaturar,
  versao?: VersaoEscolhida,
): Partial<Record<ArtigoId, number>> {
  const t = totalDaVersao(doc, versao);
  const out: Partial<Record<ArtigoId, number>> = {};
  const somar = (a: ArtigoId, v: number) => {
    out[a] = round2((out[a] ?? 0) + v);
  };
  const extra = opcionaisDe(doc);
  const precos = precosDe(doc);
  (doc.budgetItems ?? []).forEach((item, i) => {
    const v = precos[i];
    if (v === null || v <= 0) return;
    if (t.versoes && extra[i]) return;
    const a = artigoSugerido(item ?? "");
    if (a) somar(a, v);
  });
  for (const e of doc.budgetExtras ?? []) {
    if (!/\d/.test(e?.valueText ?? "")) continue;
    const v = somaDosExtrasSemIva([e], { mode: t.mode, vatRate: t.vatRate });
    const a = artigoSugerido(e?.label ?? "");
    if (a && v > 0) somar(a, v);
  }
  // Nunca sugerir mais do que o total.
  const soma = Object.values(out).reduce((s, v) => s + (v ?? 0), 0);
  return soma <= t.base + 0.005 ? out : {};
}

/** Escreve o valor de um artigo (0 ou vazio tira-o). */
export function definirReparto<T extends Pick<ProposalDoc, "repartoPorArtigo">>(
  doc: T,
  artigo: ArtigoId,
  valor: number | null,
): T {
  const r = { ...repartoDe(doc) };
  if (valor === null || !(valor > 0)) delete r[artigo];
  else r[artigo] = round2(valor);
  return { ...doc, repartoPorArtigo: r };
}

export type FaseDaFatura = "sinal" | "saldo";

/**
 * As parcelas de UMA fatura (sinal ou saldo), por artigo, sem IVA.
 *
 * O sinal é `pct`% do total sem IVA, arredondado ao cêntimo; o saldo é o resto.
 * Cada artigo leva a sua parte, e o cêntimo que o arredondamento deixa cai no
 * artigo de maior valor — assim as parcelas somam SEMPRE o sinal (e o saldo)
 * exactos, e sinal + saldo somam o total.
 */
export function parcelasDaFatura(
  f: Pick<Faturacao, "base" | "artigos">,
  fase: FaseDaFatura,
  pct: number,
): ParcelaDoArtigo[] {
  const sinal = round2((f.base * pct) / 100);
  const alvo = fase === "sinal" ? sinal : round2(f.base - sinal);
  if (f.artigos.length === 0) return [];
  const partes = f.artigos.map((a) => ({
    ...a,
    valor:
      fase === "sinal"
        ? round2((a.valor * pct) / 100)
        : round2(a.valor - round2((a.valor * pct) / 100)),
  }));
  const diferenca = round2(alvo - partes.reduce((s, p) => s + p.valor, 0));
  if (diferenca !== 0) {
    const maior = partes.reduce((m, p, i) => (p.valor > partes[m].valor ? i : m), 0);
    partes[maior] = { ...partes[maior], valor: round2(partes[maior].valor + diferenca) };
  }
  return partes.filter((p) => p.valor !== 0);
}

/**
 * O total COM IVA que o Moloni vai calcular para estas parcelas: ele soma o IVA
 * LINHA A LINHA (cada artigo leva o seu IVA arredondado ao cêntimo), e não sobre
 * o total. Por isso pode sair 1 cêntimo (ou 2) longe do sinal e do saldo que o
 * PDF e os Pagamentos mostram, que dividem o total com IVA (`splitSinal`).
 *
 * Auditoria do dinheiro (13/11, n.º 2): a regra não muda — é só dizer, no
 * cartão, o número que o Moloni vai mostrar, e avisar quando não é o mesmo.
 */
export function totalComIvaNoMoloni(partes: readonly ParcelaDoArtigo[], vatRate: number): number {
  return round2(partes.reduce((s, p) => s + p.valor + round2(p.valor * vatRate), 0));
}

/**
 * O que o Moloni vai faturar nesta fase, com IVA, ao lado do que a proposta (o
 * PDF, os Pagamentos) diz para a mesma fase. `diferenca` é Moloni − proposta.
 */
export function conferenciaDoMoloni(
  f: Pick<Faturacao, "base" | "bruto" | "artigos" | "vatRate">,
  fase: FaseDaFatura,
  pct: number,
): { noMoloni: number; naProposta: number; diferenca: number } {
  const noMoloni = totalComIvaNoMoloni(parcelasDaFatura(f, fase, pct), f.vatRate);
  const naProposta = splitSinal(f.bruto, pct)[fase];
  return { noMoloni, naProposta, diferenca: round2(noMoloni - naProposta) };
}

/**
 * Euros para COLAR no Moloni: sem separador de milhares (um espaço inquebrável
 * no meio do número pode não ser aceite no campo do preço). Só este texto.
 */
const eurParaColar = (n: number): string =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(n || 0);

/** O texto a copiar para o Moloni à mão, quando a ligação não está feita. */
export function textoDaFatura(
  partes: ParcelaDoArtigo[],
  fase: FaseDaFatura,
  pct: number,
  vatRate: number,
  cliente?: { nome?: string; nif?: string },
): string {
  const titulo = fase === "sinal" ? `Sinal (${pct}%)` : `Saldo (${100 - pct}%)`;
  const total = round2(partes.reduce((s, p) => s + p.valor, 0));
  const nome = cliente?.nome?.trim();
  const nif = cliente?.nif?.replace(/\s/g, "");
  const quem = [nome, nif ? `NIF ${nif}` : ""].filter(Boolean).join(" · ");
  return [
    ...(quem ? [`Cliente: ${quem}`] : []),
    `${titulo} — valores sem IVA (IVA ${Math.round(vatRate * 100)}%):`,
    ...partes.map((p) => `${refDoArtigo(p.artigo)} · ${p.nome}: ${eurParaColar(p.valor)}`),
    `Total sem IVA: ${eurParaColar(total)}`,
    // Para conferir no Moloni de um relance (ele calcula o IVA linha a linha:
    // pode diferir 1 cêntimo).
    `Total com IVA: ${eurParaColar(totalComIvaNoMoloni(partes, vatRate))}`,
  ].join("\n");
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS SUBPONTOS DE CADA LINHA — SÓ PARA NÓS (6/11)
 * ════════════════════════════════════════════════════════════════════════════
 * Ela: «quando eu metesse a linha A, tivessem os subtítulos também lá, para
 * eu colocar o custo para cada coisa». E escolheu que fiquem SÓ PARA NÓS: o
 * PDF continua a mostrar a linha como sempre mostrou.
 */

/** Os subpontos de cada linha, ao tamanho das linhas, já limpos (`[]` = sem). */
export function subpontosDe(
  doc: Pick<ProposalDoc, "budgetItems" | "budgetSubpontos">,
): SubpontoDoOrcamento[][] {
  const n = doc.budgetItems?.length ?? 0;
  const guardados = Array.isArray(doc.budgetSubpontos) ? doc.budgetSubpontos : [];
  return Array.from({ length: n }, (_, i) => {
    const lista = guardados[i];
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((x): x is SubpontoDoOrcamento => !!x && typeof x === "object")
      .map((x) => ({
        nome: typeof x.nome === "string" ? x.nome : "",
        valor:
          typeof x.valor === "number" && Number.isFinite(x.valor) && x.valor >= 0
            ? round2(x.valor)
            : null,
        artigo: eArtigo(x.artigo) ? x.artigo : null,
      }));
  });
}

/** A soma dos subpontos com valor, ou `null` quando nenhum tem. */
export function somaDosSubpontos(subs: SubpontoDoOrcamento[]): number | null {
  const valores = subs.map((s) => s.valor).filter((v): v is number => v !== null);
  return valores.length ? round2(valores.reduce((a, b) => a + b, 0)) : null;
}

/**
 * Escreve os subpontos de uma linha — e o preço da linha passa a ser a soma
 * deles, para o total, o PDF e o sinal continuarem a ler o mesmo número.
 */
export function definirSubpontos<
  T extends Pick<ProposalDoc, "budgetItems" | "budgetAmounts" | "budgetSubpontos">,
>(doc: T, i: number, subs: SubpontoDoOrcamento[]): T {
  const todos = subpontosDe(doc);
  if (i < 0 || i >= todos.length) return doc;
  todos[i] = subs;
  const precos = precosDe(doc);
  if (subs.length > 0) precos[i] = somaDosSubpontos(subs);
  return {
    ...doc,
    budgetSubpontos: todos.map((l) => (l.length ? l : null)),
    budgetAmounts: precos,
  };
}

function linhasDosSubpontos(
  nomeDaLinha: string,
  i: number,
  subs: SubpontoDoOrcamento[],
): LinhaFaturavel[] {
  const out: LinhaFaturavel[] = [];
  subs.forEach((s, j) => {
    const nome = s.nome.trim();
    if (!nome && s.valor === null) return;
    out.push({
      origem: "subponto",
      indice: i,
      sub: j,
      nome: `${nomeDaLinha} — ${nome || `subponto ${j + 1}`}`,
      valor: s.valor,
      artigo: eArtigo(s.artigo) ? s.artigo : null,
    });
  });
  return out;
}

/**
 * A proposta ACEITE, com o preço e o artigo de cada serviço que ela pôs depois
 * no estúdio (6/11).
 *
 * Uma proposta aceite antes de haver preço por linha — ou aceite e só depois
 * preenchida no estúdio — tem os valores no rascunho do estúdio e não no
 * documento aceite. Usam-se as linhas do estúdio SÓ quando o dinheiro é o
 * mesmo: a base sem IVA igual ao cêntimo e a faturação a fechar. Senão fica a
 * aceite tal como está, e o cartão diz o que falta.
 */
export function aceiteComLinhasDoEstudio(
  aceite: DocParaFaturar,
  estudio: DocParaFaturar | null | undefined,
  versao?: VersaoEscolhida,
): { doc: DocParaFaturar; doEstudio: boolean } {
  if (!estudio || faturacaoPorArtigo(aceite, versao).fecha)
    return { doc: aceite, doEstudio: false };
  const junto = {
    ...aceite,
    budgetItems: estudio.budgetItems,
    budgetAmounts: estudio.budgetAmounts,
    budgetArtigos: estudio.budgetArtigos,
    budgetSubpontos: estudio.budgetSubpontos,
    budgetOpcional: estudio.budgetOpcional,
    budgetExtras: estudio.budgetExtras,
  } as DocParaFaturar;
  const igual =
    Math.abs(
      dinheiroDaProposta(junto as ProposalDoc).base -
        dinheiroDaProposta(aceite as ProposalDoc).base,
    ) < 0.005;
  return igual && faturacaoPorArtigo(junto, versao).fecha
    ? { doc: junto, doEstudio: true }
    : { doc: aceite, doEstudio: false };
}

/** Os campos do documento que a faturação lê — e só esses. */
const CAMPOS_DA_FATURACAO = [
  "budgetItems",
  "budgetArtigos",
  "budgetSubpontos",
  "budgetAmounts",
  "repartoPorArtigo",
  "budgetOpcional",
  "budgetExtras",
  "budgetExtrasSomam",
  "totalAmount",
  "totalVatMode",
  "vatRate",
  "totalText",
  "totalEstimatedText",
  "depositPercent",
] as const;

export function docDaFaturacao(
  doc: ProposalDoc,
): DocParaFaturar & Pick<ProposalDoc, "depositPercent"> {
  const out: Record<string, unknown> = {};
  for (const k of CAMPOS_DA_FATURACAO) if (doc[k] !== undefined) out[k] = doc[k];
  return out as DocParaFaturar & Pick<ProposalDoc, "depositPercent">;
}
