/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA SÓ ORDEM PARA O DOCUMENTO INTEIRO — A REGRA, NUM SÍTIO SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O QUE ELA VIU ─────────────────────────────────────────────────────────
 * Palavras dela, sobre a proposta da Tara e do Marty: na lista de Serviços a
 * ordem é Cerimónia → Complementos → Cocktail → Jantar; no Orçamento é
 * Cerimónia → Cocktail → Jantar → Complementos. As mesmas quatro rubricas, o
 * mesmo documento, duas ordens. Reportado uma vez, e continuou.
 *
 * ── PORQUE É QUE CONTINUOU ────────────────────────────────────────────────
 * A regra existia, e funcionava — mas vivia dentro de `proposal-doc-pdf.ts`,
 * que é `server-only`. O estúdio não a podia importar, e por isso o editor
 * mostrava a ordem em que ela escreveu enquanto o PDF imprimia outra. A
 * correcção estava aplicada ao documento que sai e não ao ecrã onde ela
 * trabalha, que é exactamente o sítio onde a divergência se vê.
 *
 * Este ficheiro é a mesma regra, sem `server-only`, para os dois lados a
 * lerem. Não sabe nada de PDF nem de React: recebe listas e devolve índices.
 *
 * ── A FONTE DA ORDEM É A LISTA DE SERVIÇOS ────────────────────────────────
 * É a primeira página que o casal lê. O orçamento e os mood boards saem por
 * essa ordem, com três travas — sem correspondência não se mexe, na dúvida não
 * se mexe, e o que se mexe é dito.
 *
 * ── E QUANDO ELA ARRASTA ──────────────────────────────────────────────────
 * A partir do momento em que ela arruma os mood boards ou as linhas do
 * orçamento à mão, a ordem escrita passa a valer sozinha ({@link ORDEM_EXPLICITA}
 * no documento) e nada aqui lhe volta a tocar. Uma sugestão que continuasse a
 * reordenar por cima do arrasto dela seria um editor que desfaz o que se acaba
 * de fazer.
 */

import type { ProposalDoc, ServiceGroup } from "./proposal-doc";

/**
 * Palavras que não distinguem uma rubrica de outra.
 *
 * Saem todas da folha dela: o mesmo capítulo aparece como «Decor Cerimónia» na
 * lista de serviços, «Decoração Cerimónia» no título do mood board e
 * «Cerimónia» no quadro do orçamento. Sem as tirar, três nomes do mesmo sítio
 * não casavam entre si e a ordem não se aplicava a nada.
 */
const PALAVRAS_SEM_PESO = new Set([
  "decor",
  "decoracao",
  "decoracoes",
  "design",
  "floral",
  "florais",
  "flor",
  "flores",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "a",
  "o",
  "as",
  "os",
  "com",
  "para",
  "em",
  "no",
  "na",
]);

/** O nome de uma rubrica reduzido ao que a distingue: sem acentos, sem
 *  maiúsculas, sem pontuação e sem {@link PALAVRAS_SEM_PESO}. */
export function chaveDeRubrica(texto: string): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !PALAVRAS_SEM_PESO.has(t))
    .join(" ");
}

/**
 * A ordem do documento: cada rubrica dos Serviços com o lugar que ocupa.
 *
 * Lê os títulos dos grupos E os rótulos dos itens, pela ordem em que estão
 * escritos — porque nas folhas dela o capítulo tanto é um grupo («Decoração
 * Cerimónia», com os serviços por baixo) como um item de uma lista corrida.
 * O primeiro sítio onde um nome aparece é o que vale.
 */
export function ordemDosCapitulos(
  doc: Pick<ProposalDoc, "serviceGroups"> | { serviceGroups?: readonly ServiceGroup[] },
): Map<string, number> {
  const ordem = new Map<string, number>();
  let lugar = 0;
  for (const g of doc.serviceGroups ?? []) {
    for (const rotulo of [g.title, ...(g.items ?? []).map((it) => it.label)]) {
      const chave = chaveDeRubrica(rotulo ?? "");
      lugar++;
      if (chave && !ordem.has(chave)) ordem.set(chave, lugar);
    }
  }
  return ordem;
}

/**
 * O lugar de um nome na ordem do documento, ou `undefined` quando não há
 * correspondência SEGURA.
 *
 * Casa por igualdade da chave e, não havendo, por CONTENÇÃO — «Complementos»
 * casa com «Complementos dos Noivos», porque um dos nomes é o outro com mais
 * detalhe. Duas correspondências igualmente boas em lugares diferentes contam
 * como nenhuma: mover uma linha do orçamento por um palpite é pior do que a
 * deixar onde ela a escreveu.
 */
export function lugarNaOrdem(rotulo: string, ordem: Map<string, number>): number | undefined {
  const chave = chaveDeRubrica(rotulo);
  if (!chave) return undefined;
  const exacta = ordem.get(chave);
  if (exacta !== undefined) return exacta;
  const meus = new Set(chave.split(" "));
  let melhor: { lugar: number; comuns: number } | undefined;
  let empatado = false;
  for (const [candidata, lugar] of ordem) {
    const seus = candidata.split(" ");
    const contida = seus.every((t) => meus.has(t)) || [...meus].every((t) => seus.includes(t));
    if (!contida) continue;
    const comuns = seus.filter((t) => meus.has(t)).length;
    if (!melhor || comuns > melhor.comuns) {
      melhor = { lugar, comuns };
      empatado = false;
    } else if (comuns === melhor.comuns && lugar !== melhor.lugar) {
      empatado = true;
    }
  }
  return melhor && !empatado ? melhor.lugar : undefined;
}

/**
 * Os índices de `itens` pela ordem do documento.
 *
 * Quem não casa HERDA o lugar de quem vem antes — é isso que mantém colado o
 * que ela escreveu junto: o mood board «Corredor Nupcial», que não é uma
 * rubrica do orçamento, viaja com a «Cerimónia» a que pertence em vez de ir
 * parar ao fim do documento. A ordenação é estável, portanto empates ficam
 * pela ordem escrita, e sem correspondência nenhuma devolve a ordem de sempre.
 */
export function porOrdemDosCapitulos<T>(
  itens: readonly T[],
  rotuloDe: (item: T) => string,
  ordem: Map<string, number>,
): number[] {
  const comoEstao = itens.map((_, i) => i);
  if (ordem.size === 0 || itens.length < 2) return comoEstao;
  let herdado = -1;
  const lugares = itens.map((item, i) => {
    const lugar = lugarNaOrdem(rotuloDe(item), ordem);
    if (lugar !== undefined) herdado = lugar;
    return { i, lugar: herdado };
  });
  return lugares.sort((a, b) => a.lugar - b.lugar || a.i - b.i).map((l) => l.i);
}

/** Uma permutação que não mexe em nada. */
export function eAOrdemEscrita(indices: readonly number[]): boolean {
  return indices.every((idx, i) => idx === i);
}

/** Aplica uma permutação de índices a um array — o mesmo array quando a
 *  permutação é a identidade, para quem compara por identidade não re-renderizar. */
export function aplicarOrdem<T>(itens: readonly T[], indices: readonly number[]): T[] {
  return indices.map((i) => itens[i]);
}

/**
 * A ordem por que o documento SAI, para uma lista qualquer que siga os
 * capítulos (orçamento, mood boards).
 *
 * Um só sítio a decidir, e a decisão inclui o «não decidir»: com
 * {@link temOrdemExplicita} a devolver `true`, a resposta é a ordem escrita e
 * mais nada. O estúdio e o gerador chamam isto, e é por isso que o que ela vê
 * no editor é o que sai impresso.
 */
export function ordemDeSaida<T>(
  doc: Pick<ProposalDoc, "serviceGroups" | "ordemExplicita">,
  itens: readonly T[],
  rotuloDe: (item: T) => string,
): number[] {
  if (temOrdemExplicita(doc)) return itens.map((_, i) => i);
  return porOrdemDosCapitulos(itens, rotuloDe, ordemDosCapitulos(doc));
}

/**
 * O valor do campo que desliga a sugestão — ver {@link ProposalDoc.ordemExplicita}.
 *
 * É uma constante e não um `true` à letra porque quem o escreve (o editor,
 * quando ela arrasta) e quem o lê (o gerador) estão em lados opostos da
 * aplicação.
 */
export const ORDEM_EXPLICITA = "arrumada-a-mao" as const;

/** A ordem escrita neste documento vale sozinha? */
export function temOrdemExplicita(doc: Pick<ProposalDoc, "ordemExplicita">): boolean {
  return doc.ordemExplicita === ORDEM_EXPLICITA;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TIRAR A LINHA TIRA O MOOD BOARD DELA (pedido de 12/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Sim, tirar a linha tem de tirar o mood board sozinho.» Os noivos não
 * quiseram cocktail; ela tirou a linha «Coctail» dos Serviços e o mood board
 * «Decor Cocktail» continuou no PDF.
 *
 * Casar a linha com o mood board usa a mesma chave da ordem do documento
 * ({@link chaveDeRubrica}: sem «decor», «decoração», «floral»…), por
 * igualdade ou contenção, e tolera UMA letra trocada ou em falta nas palavras
 * com cinco letras ou mais — porque nas folhas dela «Coctail» e «Seatting» são
 * o «Cocktail» e o «Seating». As travas: uma chave vazia não casa com nada, e
 * um mood board que ainda case com uma linha que FICA não sai.
 */
function quaseIguais(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  // Distância de edição ≤ 1 (uma troca, uma a mais ou uma a menos).
  let i = 0;
  let j = 0;
  let diferencas = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++diferencas > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return diferencas + (a.length - i) + (b.length - j) <= 1;
}

/** Duas rubricas falam do mesmo capítulo? (ver o bloco acima) */
export function mesmaRubrica(a: string, b: string): boolean {
  const ta = chaveDeRubrica(a).split(" ").filter(Boolean);
  const tb = chaveDeRubrica(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return false;
  const [curta, longa] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return curta.every((t) => longa.some((u) => quaseIguais(t, u)));
}

/**
 * Os mood boards que saem com as rubricas `tiradas`: os que casam com uma
 * delas e com nenhuma das que `ficam`. Devolve os índices em `boards`.
 */
export function temasQueSaemComAsLinhas(
  tiradas: readonly string[],
  ficam: readonly string[],
  boards: readonly { title?: string }[],
): number[] {
  const tiradasComNome = tiradas.filter((r) => chaveDeRubrica(r));
  if (!tiradasComNome.length) return [];
  const saem: number[] = [];
  boards.forEach((b, bi) => {
    const titulo = b.title ?? "";
    if (!tiradasComNome.some((r) => mesmaRubrica(r, titulo))) return;
    if (ficam.some((r) => mesmaRubrica(r, titulo))) return;
    saem.push(bi);
  });
  return saem;
}

/** Todas as rubricas dos Serviços (títulos dos grupos e rótulos das linhas). */
export function rubricasDosServicos(groups: readonly ServiceGroup[]): string[] {
  return groups.flatMap((g) => [g.title ?? "", ...(g.items ?? []).map((it) => it.label ?? "")]);
}
