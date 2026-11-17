import { describe, expect, it } from "vitest";
import { dinheiroDaProposta } from "./proposal-budget";
import {
  baseParaOEstudio,
  degrauDosAdicionais,
  precoDoPedidoParaBase,
} from "./preco-do-pedido";
import { resolveProposalMoney, type ProposalDoc } from "./proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O VALOR QUE ELA PÔS É O VALOR QUE FICA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, com os pontos de exclamação todos: «essa coisa do valor das
 * propostas crescer não pode acontecer!!! o valor enviado ou o valor que
 * colocámos ao fazer a proposta é o valor que fica até nós próprios alterarmos
 * por nós!!!»
 *
 * Isso não é um defeito para caçar — é uma INVARIANTE para garantir. E uma
 * invariante prova-se; não se procura.
 *
 * ── PORQUE É QUE ISTO PRECISA DE UM TESTE PRÓPRIO ─────────────────────────
 *
 * A avaria já foi fechada QUATRO vezes, em quatro sítios diferentes, e é
 * sempre a mesma: alguém escreve o «Preço final» do PEDIDO (serviços mais
 * adicionais) no campo do ESTÚDIO (só serviços). A gravação seguinte volta a
 * somar-lhe a deslocação, e a visita seguinte parte do número já inchado.
 * Medido numa proposta real: 3.000 → 3.140 → 3.280 → 3.420, com 140 € de
 * deslocação. Uma soma por cada vez que ela abriu a proposta.
 *
 * Cada uma das quatro foi encontrada em PRODUÇÃO, por ela, depois de o número
 * já ter saído num PDF para um casal. Um teste por sítio corrigido cobre os
 * caminhos que alguém se lembrou de desenhar; não cobre o quinto sítio.
 *
 * O que se prende aqui é outra coisa: as DUAS CONTAS do dinheiro desta casa
 * têm de dar o mesmo número, sempre, sobre qualquer documento. Não sobre o que
 * o ecrã faz — sobre o que as contas SÃO.
 *
 *   · `dinheiroDaProposta(doc).base` é o que o PDF diz ao casal que ele paga;
 *   · `precoDoPedidoParaBase(base, doc)` é o que o estúdio grava no pedido.
 *
 * São duas implementações da mesma frase — «serviços mais os adicionais que
 * contam» — escritas em ficheiros diferentes, por razões diferentes, e nada as
 * obrigava a concordar. Quando deixarem de concordar, o casal lê um número no
 * papel e a Líquen factura outro. É a queixa dela de 2.3, e a auditoria da casa
 * mediu-a: 86,10 € e 92,25 € com IVA em duas propostas já enviadas.
 *
 * ── E A VOLTA, QUE É A FRASE DELA AO PÉ DA LETRA ─────────────────────────
 *
 * Reabrir uma proposta enviada tem de mostrar EXACTAMENTE o número que ela
 * escreveu. Não «um número parecido», não «o mesmo a menos de um cêntimo»: o
 * mesmo. É a segunda metade de cada teste aqui em baixo.
 *
 * A grelha é o produto de tudo o que muda a conta — os dois modos de IVA, as
 * três leituras da marca dos adicionais (soma, não soma, e a marca em falta,
 * que é a avaria da auditoria), três taxas, cinco totais (incluindo os dois
 * números reais das propostas medidas) e cinco formas de escrever adicionais,
 * incluindo um sem número nenhum. São 450 documentos.
 */

const MODOS = ["acrescer", "incluido"] as const;
/** `undefined` é a marca EM FALTA — o estado que a auditoria encontrou em
 *  produção, e onde o dinheiro estava. Não se tira da grelha. */
const MARCAS = [true, false, undefined] as const;
const TAXAS = [0.23, 0.06, 0];
/** 10.778,74 e 8.123,45 são de propostas reais desta casa. */
const TOTAIS = [0, 100, 3000, 8123.45, 10778.74];
const ADICIONAIS: string[][] = [
  [],
  ["140,00 €"], // a deslocação do caso dela
  ["70,00 €", "825,55 €"], // duas linhas, uma com cêntimos
  ["a definir"], // sem número: não conta para lado nenhum
  ["895,00 € + IVA"], // a deslocação real de 10.778,74 €, com o modo na linha
];

interface Caso {
  nome: string;
  doc: ProposalDoc;
}

function grelha(): Caso[] {
  const casos: Caso[] = [];
  for (const modo of MODOS)
    for (const somam of MARCAS)
      for (const taxa of TAXAS)
        for (const total of TOTAIS)
          for (const extras of ADICIONAIS)
            casos.push({
              nome: `${modo} · marca ${String(somam)} · IVA ${taxa} · ${total} · [${extras}]`,
              doc: {
                totalAmount: total,
                totalVatMode: modo,
                vatRate: taxa,
                budgetExtras: extras.map((valueText, i) => ({
                  label: `adicional ${i}`,
                  valueText,
                })),
                budgetExtrasSomam: somam,
              } as unknown as ProposalDoc,
            });
  return casos;
}

const CASOS = grelha();

describe("o valor que ela põe é o valor que fica", () => {
  it("a grelha cobre mesmo o que diz que cobre", () => {
    expect(CASOS).toHaveLength(
      MODOS.length * MARCAS.length * TAXAS.length * TOTAIS.length * ADICIONAIS.length,
    );
  });

  /**
   * ── E A GRELHA MEDE MESMO ALGUMA COISA ──────────────────────────────────
   *
   * Esta guarda não é zelo: a primeira escrita desta grelha punha o valor do
   * adicional num campo chamado `value`, e o campo chama-se `valueText`. Os
   * 450 documentos ficaram todos com adicionais de ZERO — o degrau nunca
   * existiu, as duas contas concordavam por não terem nada para discordar, e
   * as três provas de cima passaram todas a verde sem tocar na avaria.
   *
   * Uma varredura que não prova que varre alguma coisa é uma varredura que
   * mente. Esta conta os casos em que há mesmo um degrau — é o degrau que faz
   * o valor crescer, e sem ele não há nada a garantir.
   *
   * O número é exacto e não uma fracção, para que mexer na grelha sem pensar
   * dê erro em vez de passar em silêncio: só a marca `true` soma (as outras
   * duas leituras dão degrau zero, e é de propósito — ver a auditoria em
   * `valores-inflacionados`), e das cinco formas de adicionais só três têm
   * número. Os restantes 360 casos são degrau zero por direito, e a invariante
   * vale neles à mesma; o que não podem é ser TODOS.
   */
  it("e os adicionais contam mesmo em 90 dos 450", () => {
    const comDegrau = CASOS.filter(({ doc }) => degrauDosAdicionais(doc) > 0);
    const marcasQueSomam = 1;
    const formasComNumero = 3;
    expect(
      comDegrau.length,
      "a grelha deixou de medir a avaria: sem degrau não há valor que cresça",
    ).toBe(MODOS.length * marcasQueSomam * TAXAS.length * TOTAIS.length * formasComNumero);
  });

  /**
   * O que o casal lê no PDF e o que fica gravado no pedido são o MESMO número.
   * Se um dia deixarem de ser, é aqui que se sabe — e não numa chamada dela
   * três semanas depois de o PDF ter saído.
   */
  it("o que o PDF diz ao casal é o que fica gravado no pedido", () => {
    const fora: string[] = [];
    for (const { nome, doc } of CASOS) {
      const noPapel = dinheiroDaProposta(doc).base;
      const noPedido = precoDoPedidoParaBase(resolveProposalMoney(doc).base, doc);
      if (Math.abs(noPapel - noPedido) > 0.005) {
        fora.push(`${nome}: o papel diz ${noPapel} e o pedido guarda ${noPedido}`);
      }
    }
    expect(fora, "o papel e o pedido deixaram de dizer o mesmo").toEqual([]);
  });

  /**
   * E a volta: reabrir devolve ao campo o número DELA, ao cêntimo.
   *
   * `null` é a resposta legítima quando a conta não dá — o preço do pedido é
   * menor do que os adicionais escritos, e a razão de não ser zero está no
   * cabeçalho de `baseParaOEstudio`. Aqui não pode acontecer, porque o preço
   * de que se parte é o que a ida acabou de produzir: nunca é menor do que os
   * adicionais que lhe foram somados.
   */
  it("reabrir devolve ao campo o número dela, ao cêntimo", () => {
    const fora: string[] = [];
    for (const { nome, doc } of CASOS) {
      const escrito = resolveProposalMoney(doc).base;
      if (!(escrito > 0)) continue;
      const noPedido = precoDoPedidoParaBase(escrito, doc);
      const devolta = baseParaOEstudio(noPedido, doc);
      if (devolta == null) {
        fora.push(`${nome}: reabrir não devolveu número nenhum (${escrito} → ${noPedido} → null)`);
      } else if (Math.abs(devolta - escrito) > 0.005) {
        fora.push(`${nome}: ela escreveu ${escrito} e reabrir mostra ${devolta}`);
      }
    }
    expect(fora, "reabrir deixou de mostrar o número dela").toEqual([]);
  });

  /**
   * ── E DEZ VISITAS, SOBRE A GRELHA INTEIRA ──────────────────────────────
   *
   * O `preco-do-pedido.test.ts` já faz dez aberturas sobre UM caso. Esta faz
   * as dez sobre os 450 — porque a escalada dela não foi um erro de conta, foi
   * um cêntimo de arredondamento a repetir-se, e um cêntimo só se vê ao fim de
   * algumas voltas.
   */
  it("dez visitas seguidas não deslocam um cêntimo, em nenhum dos 450 casos", () => {
    const fora: string[] = [];
    for (const { nome, doc } of CASOS) {
      const escrito = resolveProposalMoney(doc).base;
      if (!(escrito > 0)) continue;
      const primeiro = precoDoPedidoParaBase(escrito, doc);
      let noPedido = primeiro;
      for (let visita = 1; visita <= 10; visita += 1) {
        const noEcra = baseParaOEstudio(noPedido, doc);
        if (noEcra == null) {
          fora.push(`${nome}: a visita ${visita} deixou de ter número`);
          break;
        }
        noPedido = precoDoPedidoParaBase(noEcra, doc);
        if (noPedido !== primeiro) {
          fora.push(`${nome}: à visita ${visita} o pedido passou de ${primeiro} a ${noPedido}`);
          break;
        }
      }
    }
    expect(fora, "o valor voltou a crescer sozinho entre visitas").toEqual([]);
  });

  /**
   * O CONTROLO NEGATIVO, escrito à mão e não gerado: se as duas contas
   * deixarem de concordar, os testes de cima TÊM de o dizer. Sem isto, uma
   * grelha que passasse por não estar a comparar nada passaria na mesma.
   */
  it("e uma conta errada é mesmo apanhada", () => {
    const doc = {
      totalAmount: 3000,
      totalVatMode: "acrescer",
      vatRate: 0.23,
      budgetExtras: [{ label: "Deslocação da equipa", valueText: "140,00 €" }],
      budgetExtrasSomam: true,
    } as unknown as ProposalDoc;
    // A avaria dela, reproduzida: o preço do pedido escrito em cru no campo do
    // estúdio, sem lhe tirar os adicionais.
    const emCru = precoDoPedidoParaBase(3140, doc);
    expect(emCru, "a soma a mais deixou de acontecer — o caso dela mudou de forma").toBe(3280);
    // E a conversão certa, ao lado, sobre o mesmo número.
    expect(baseParaOEstudio(3140, doc)).toBe(3000);
    expect(precoDoPedidoParaBase(3000, doc)).toBe(3140);
  });
});
