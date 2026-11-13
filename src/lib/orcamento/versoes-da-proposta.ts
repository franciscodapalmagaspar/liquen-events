import { type ProposalDoc } from "@/lib/proposal-doc";
import { dinheiroDaProposta, precosDe } from "@/lib/proposal-budget";
import { round2 } from "@/lib/money";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A VERSÃO BASE E A VERSÃO COM EXTRAS, NA MESMA PROPOSTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O casal pede "uma coisa mais simples e outra com tudo", e o que se fazia era
 * duas propostas. Duas propostas são dois documentos a divergir: corrige-se a
 * data numa e não na outra, sobe-se um preço numa e não na outra, e ao fim de
 * duas semanas ninguém sabe qual é a que vale.
 *
 * Aqui é UMA proposta com linhas assinaladas como extra. Tudo o resto — a data,
 * o local, os serviços, as condições — existe uma vez só, porque é uma vez só
 * que é verdade.
 *
 * ── UM NÚMERO ESCRITO, O OUTRO DERIVADO ────────────────────────────────────
 * O `totalAmount` continua a ser o único número escrito à mão, e continua a
 * querer dizer a proposta INTEIRA — é o que as facturas, o contrato e o dossier
 * já lêem, e mudar-lhe o significado era mexer no dinheiro de todo o sistema
 * por causa de um ecrã.
 *
 * A versão base é a subtracção: total menos os extras assinalados. Assim os
 * dois números não podem discordar, porque só há um a ser escrito. O caminho
 * contrário — dois totais escritos, um por versão — dava, no dia em que ela
 * corrigisse só um, uma proposta que se contradizia a si própria em PDF.
 *
 * ── SEM EXTRAS, NADA DISTO EXISTE ──────────────────────────────────────────
 * Uma proposta sem linhas assinaladas é exactamente a proposta de antes: sem
 * segundo total, sem legenda, sem uma palavra a mais no PDF. Isto só aparece
 * quando alguém o pediu ao assinalar uma linha.
 */

/** Qual das duas versões o cliente ficou. */
export type VersaoEscolhida = "base" | "extras";

/** As linhas assinaladas como extra, normalizadas ao tamanho das linhas. */
export function opcionaisDe(doc: Pick<ProposalDoc, "budgetItems" | "budgetOpcional">): boolean[] {
  const n = doc.budgetItems?.length ?? 0;
  const guardado = doc.budgetOpcional ?? [];
  // O mesmo cuidado dos outros arrays paralelos: um documento antigo não tem
  // este array, e um a que se acrescentou uma linha tem-no mais curto. Em
  // nenhum dos casos pode o índice 3 ler a marca da linha 4.
  return Array.from({ length: n }, (_, i) => guardado[i] === true);
}

/** Um par de números na mesma unidade — ver {@link Totais}. */
export interface TresValores {
  /** O que a proposta inteira vale. */
  comExtras: number;
  /** O que vale sem as linhas assinaladas. */
  base: number;
  /** Quanto valem os extras, somados. */
  extras: number;
}

export interface Totais extends TresValores {
  /**
   * ── OS TRÊS NÚMEROS DE CIMA SÃO SEM IVA ──────────────────────────────────
   *
   * E têm de ser: a subtracção que aqui se faz tira PREÇOS DE LINHA a um
   * total, e um preço de linha é sempre líquido — é um campo numérico, sem
   * IVA nenhum escrito ao lado. Enquanto o total entrava aqui em cru
   * (`doc.totalAmount`), a conta cruzava duas unidades sem dar por isso: em
   * modo «IVA incluído» esse campo é o BRUTO. Numa proposta de 10.000 € de
   * base (12.300 € guardados) com uma linha extra de 2.000 €, saía «sem os
   * extras: 10.300 €» onde o certo são 9.840 €. São 460 € oferecidos ao
   * casal, impressos no PDF, num número que ele vai usar para negociar.
   */
  /** Os mesmos três, COM IVA — o que o casal paga. */
  bruto: TresValores;
  /**
   * Os mesmos três na unidade em que o TOTAL da proposta está impresso: sem
   * IVA quando o documento diz «+ IVA», com IVA quando diz «IVA incluído».
   *
   * É este que os ecrãs e o PDF devem mostrar. Um número líquido impresso
   * debaixo de um total bruto são dois números que não se comparam, e quem os
   * lê não tem como saber disso.
   */
  comoOTotal: TresValores;
  /** Quantas linhas estão assinaladas. */
  linhasExtra: number;
  /**
   * Há extras assinalados SEM preço?
   *
   * Importa porque a subtracção fica a mentir: uma linha extra sem preço não
   * baixa a versão base, e a base sai igual ao total. Dizer isto é melhor do
   * que mostrar dois números iguais e deixar a pessoa a pensar que se enganou.
   */
  extrasSemPreco: number;
}

/** Os campos do documento de que esta conta precisa. */
type DocComTotais = Pick<ProposalDoc, "budgetItems" | "budgetAmounts" | "budgetOpcional"> &
  Partial<
    Pick<
      ProposalDoc,
      "totalAmount" | "totalVatMode" | "vatRate" | "totalText" | "totalEstimatedText"
    >
  >;

/**
 * Os dois totais, a partir da BASE da proposta e das linhas assinaladas.
 *
 * ── O QUE O SEGUNDO ARGUMENTO TEM DE SER ───────────────────────────────────
 * A BASE TRIBUTÁVEL, sem IVA — nunca o `doc.totalAmount` cru, que só é a base
 * em modo «acrescer». Por omissão é lida do próprio documento, e essa é a
 * forma de o chamar que não pode estar errada: `totaisDasVersoes(doc)`. Quem
 * já tem o dinheiro resolvido à mão passa `resolveProposalMoney(doc).base`, o
 * mesmo número por outro caminho.
 *
 * A base por omissão sai de `dinheiroDaProposta`, e não de
 * `resolveProposalMoney`: quando os valores adicionais SOMAM ao valor escrito
 * (`budgetExtrasSomam`), a base efectiva traz a deslocação lá dentro. Com a
 * leitura crua, o bloco «sem os extras assinalados» saía impresso abaixo do
 * quadro grande do MESMO PDF — medido, 1.550 € de diferença numa proposta com
 * uma deslocação desse valor. Dois totais no mesmo documento a discordarem é
 * precisamente o defeito que este ficheiro foi escrito para não deixar
 * acontecer.
 *
 * `null` quando não há extras nenhuns — e nesse caso não há duas versões, há
 * uma proposta como as de sempre.
 */
export function totaisDasVersoes(
  doc: DocComTotais,
  baseSemIva: number = dinheiroDaProposta(doc).base,
): Totais | null {
  const marcas = opcionaisDe(doc);
  const linhasExtra = marcas.filter(Boolean).length;
  if (linhasExtra === 0) return null;

  const precos = precosDe(doc);
  let extras = 0;
  let extrasSemPreco = 0;
  marcas.forEach((extra, i) => {
    if (!extra) return;
    const p = precos[i];
    if (p === null) extrasSemPreco += 1;
    else extras += p;
  });
  extras = round2(extras);

  const comExtras = round2(baseSemIva || 0);
  // A base nunca desce abaixo de zero: extras somados a mais do que o total é
  // um engano de quem escreveu, e um total negativo em PDF seria pior do que o
  // engano. O aviso de desalinhamento (proposal-budget) já apanha o caso.
  const base = Math.max(0, round2(comExtras - extras));

  // ── A leitura COM IVA ────────────────────────────────────────────────────
  // O bruto da proposta inteira NÃO se recalcula: é o mesmo que a factura, o
  // contrato e o dossier lêem. Só os extras são convertidos, e a versão base
  // sai por SUBTRACÇÃO — assim os três brutos fecham entre si ao cêntimo, tal
  // como o sinal e o saldo fecham o total. Multiplicar as três parcelas cada
  // uma por sua conta deixava um cêntimo a sobrar de vez em quando, e um
  // cêntimo a sobrar num quadro de orçamento é uma pergunta ao telefone.
  // O mesmo dinheiro efectivo que a base acima: com os adicionais a somarem,
  // o bruto da proposta inteira já os traz, e é esse que a factura, o contrato
  // e o dossier lêem.
  const dinheiro = dinheiroDaProposta(doc);
  const brutoComExtras = dinheiro.gross;
  const brutoExtras = round2(extras * (1 + dinheiro.vatRate));
  const brutoBase = Math.max(0, round2(brutoComExtras - brutoExtras));
  const bruto: TresValores = {
    comExtras: brutoComExtras,
    base: brutoBase,
    extras: brutoExtras,
  };

  const semIva: TresValores = { comExtras, base, extras };
  return {
    ...semIva,
    bruto,
    comoOTotal: dinheiro.mode === "acrescer" ? semIva : bruto,
    linhasExtra,
    extrasSemPreco,
  };
}

/**
 * As linhas assinaladas, pelo nome — para o PDF poder listá-las e o estúdio
 * poder dizer o que sai na versão base.
 */
export function nomesDosExtras(doc: Pick<ProposalDoc, "budgetItems" | "budgetOpcional">): string[] {
  const marcas = opcionaisDe(doc);
  return (doc.budgetItems ?? [])
    .map((item, i) => (marcas[i] ? (item ?? "").trim() : ""))
    .filter(Boolean);
}

/** Liga/desliga a marca de extra numa linha, sem tocar em mais nada. */
export function marcarExtra<T extends Pick<ProposalDoc, "budgetItems" | "budgetOpcional">>(
  doc: T,
  i: number,
  extra: boolean,
): T {
  return { ...doc, budgetOpcional: opcionaisDe(doc).map((v, j) => (j === i ? extra : v)) };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TOTAL DA PROPOSTA ACEITE, PELA VERSÃO QUE O CASAL ESCOLHEU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Auditoria do dinheiro (13/11, n.º 1): o casal ficou com a versão BASE, e o
 * Moloni faturava a base — mas os Pagamentos, o quadro das Cobranças, as linhas
 * de sinal e saldo do «Gerar» e o resumo diário cobravam o total COM os extras.
 * O «Em falta» nunca chegava a zero.
 *
 * Esta é a conta que a faturação já fazia (era o `totalDaVersao` de
 * `artigos-de-faturacao.ts`), mudada para aqui para TODOS a lerem: sem versão
 * escolhida, ou com «extras», é a proposta inteira (`dinheiroDaProposta`); com
 * «base», é a versão base de {@link totaisDasVersoes}. Não há regra nova — só
 * um sítio.
 */
export function totalDaVersaoAceite(
  doc: Parameters<typeof dinheiroDaProposta>[0] & DocComTotais,
  versao?: VersaoEscolhida | null,
) {
  const dinheiro = dinheiroDaProposta(doc);
  const versoes = versao === "base" ? totaisDasVersoes(doc, dinheiro.base) : null;
  return {
    /** Sem IVA. */
    base: versoes ? versoes.base : dinheiro.base,
    /** Com IVA — o que o casal paga. */
    bruto: versoes ? versoes.bruto.base : dinheiro.gross,
    vatRate: dinheiro.vatRate,
    mode: dinheiro.mode,
    versoes,
  };
}
