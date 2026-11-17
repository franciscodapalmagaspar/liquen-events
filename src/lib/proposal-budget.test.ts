import { describe, it, expect } from "vitest";
import {
  normalizarValor,
  precosDe,
  linhasDe,
  somaDosServicos,
  somaDosServicosEAdicionais,
  somaDosExtras,
  desalinhamento,
  sinalESaldo,
  asDuasFormas,
  adicionarLinha,
  removerLinha,
  definirItem,
  definirPreco,
  somaDosExtrasSemIva,
  totaisDaProposta,
} from "./proposal-budget";
import { escreverEn } from "./proposal-doc-bilingue";
import { round2 } from "./money";
import { resolveProposalMoney, type ProposalDoc } from "./proposal-doc";

/** As cinco linhas da proposta da Catarina, com preços plausíveis. */
const DOC = {
  budgetItems: [
    "Decoração Cerimónia",
    "Decoração Cocktail",
    "Seatting Plan e Decor Floral Seatting Plann",
    "Design Floral e Decoração Mesas",
    "Complementos dos Noivos",
  ],
  budgetAmounts: [900, 1200, 650, 3600, 525],
  budgetExtras: [],
  totalAmount: 6875,
} as unknown as ProposalDoc;

describe("normalizarValor", () => {
  /**
   * A REGRA QUE MAIS IMPORTA.
   *
   * "1.500" é mil e quinhentos, não um e meio. Sem esta distinção, escrever
   * um valor à portuguesa dava um total de 1,50 € — e a proposta saía com o
   * preço de um café, com um ar perfeitamente normal.
   */
  it("lê os milhares à portuguesa", () => {
    expect(normalizarValor("1.500")).toBe(1500);
    expect(normalizarValor("6.875")).toBe(6875);
    expect(normalizarValor("12.500")).toBe(12500);
  });

  it("aceita as formas todas que ela escreve", () => {
    expect(normalizarValor("1500")).toBe(1500);
    expect(normalizarValor("1 500 €")).toBe(1500);
    expect(normalizarValor("1.500,00 €")).toBe(1500);
    expect(normalizarValor("1.500,50")).toBe(1500.5);
    expect(normalizarValor("6875,00 € + IVA")).toBe(6875);
    expect(normalizarValor(3000)).toBe(3000);
  });

  it("um decimal com um ou dois dígitos continua a ser decimal", () => {
    // "1.5" não é mil e quinhentos.
    expect(normalizarValor("1.5")).toBe(1.5);
    expect(normalizarValor("1.50")).toBe(1.5);
  });

  it("devolve null quando não há número nenhum", () => {
    expect(normalizarValor("")).toBeNull();
    expect(normalizarValor("a definir")).toBeNull();
    expect(normalizarValor("€")).toBeNull();
    expect(normalizarValor(null)).toBeNull();
    expect(normalizarValor(undefined)).toBeNull();
  });

  it("apanha o espaço não separável de quem copia de uma folha de cálculo", () => {
    expect(normalizarValor("1 500 €")).toBe(1500);
  });
});

describe("somaDosServicos", () => {
  it("soma as linhas", () => {
    expect(somaDosServicos(DOC)).toBe(6875);
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * OS VALORES ADICIONAIS NÃO ENTRAM NA SOMA DOS SERVIÇOS
   * ════════════════════════════════════════════════════════════════════════
   *
   * A regra dela, e é textual: «os valores adicionais não entram na soma de
   * comparação com o total dos serviços». Entravam — e um «896,00 €» de
   * deslocação enchia a linha «Soma das linhas» de um número que não é a soma
   * de linha nenhuma.
   */
  it("os adicionais não entram — a soma é a mesma com eles e sem eles", () => {
    const comExtras = {
      ...DOC,
      budgetExtras: [
        { label: "Deslocação da equipa Líquen", valueText: "896,00 €" },
        { label: "Wedding Coordinator", valueText: "a definir" },
      ],
    } as unknown as ProposalDoc;
    expect(somaDosServicos(comExtras)).toBe(6875);
  });

  /**
   * SEM ISTO, O AVISO TOCAVA SEMPRE.
   *
   * Uma proposta ainda por orçamentar tem zero preços. Se a soma desse 0, o
   * aviso de desalinhamento aparecia em todas as propostas desde o primeiro
   * segundo — e um aviso que toca sempre deixa de ser lido.
   */
  it("sem preços nenhuns não soma zero: não soma nada", () => {
    const semPrecos = { ...DOC, budgetAmounts: [] } as unknown as ProposalDoc;
    expect(somaDosServicos(semPrecos)).toBeNull();
  });

  /**
   * O CASO EXACTO QUE ELA VIU, DO LADO DA SOMA.
   *
   * Quatro serviços sem preço e uma deslocação de 75,00 €. A soma antiga dizia
   * 75,00 € — e o aviso comparava-a com os 2.460 € do total, acusando 2.385 €
   * de erro numa proposta que estava certa. Um adicional legível já não faz
   * soma nenhuma: sem serviços com preço, não há soma.
   */
  it("um adicional legível não faz soma nenhuma se nenhum serviço tiver preço", () => {
    const soDeslocacao = {
      budgetItems: ["Cerimónia", "Cocktail", "Jantar", "Complementos"],
      budgetAmounts: [null, null, null, null],
      budgetExtras: [{ label: "Deslocação da equipa Líquen", valueText: "75,00 €" }],
      totalAmount: 2460,
    } as unknown as ProposalDoc;
    expect(somaDosServicos(soDeslocacao)).toBeNull();
  });

  it("uma linha a zero é um preço, e conta", () => {
    // Zero é uma resposta ("oferta"), não a ausência de resposta.
    const comZero = {
      ...DOC,
      budgetAmounts: [0, null, null, null, null],
    } as unknown as ProposalDoc;
    expect(somaDosServicos(comZero)).toBe(0);
  });

  it("não devolve o lixo da vírgula flutuante", () => {
    const doc = {
      budgetItems: ["a", "b", "c"],
      budgetAmounts: [1083.33, 1083.33, 1083.34],
    } as unknown as ProposalDoc;
    expect(somaDosServicos(doc)).toBe(3250);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A OUTRA PERGUNTA: QUE NÚMERO DEVIA ESTAR NO CAMPO DO TOTAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O campo do total é o preço final do pedido — dele saem a factura, o sinal e o
 * saldo —, e mexer num adicional já o mexe. Por isso ESTA soma leva os
 * adicionais, e é ela que o botão «Usar X» oferece.
 */
describe("somaDosServicosEAdicionais", () => {
  it("sem adicionais é a soma dos serviços", () => {
    expect(somaDosServicosEAdicionais(DOC)).toBe(6875);
  });

  it("o adicional entra na mesma unidade das linhas: base", () => {
    /**
     * O DOC não declara modo de IVA nenhum, e um documento calado lê-se com o
     * IVA INCLUÍDO — é a regra de `detectVatMode`, e é a leitura que o casal
     * faz de um «896,00 €» impresso sem mais nada ao lado. Logo esses 896 € são
     * o que ele PAGA, e valem 728,46 € de base. As linhas são todas base
     * (campos numéricos, sem IVA escrito ao lado), e o campo do total também.
     */
    const comExtras = {
      ...DOC,
      budgetExtras: [
        { label: "Deslocação da equipa Líquen", valueText: "896,00 €" },
        { label: "Wedding Coordinator", valueText: "a definir" },
      ],
    } as unknown as ProposalDoc;
    // O "a definir" não conta — não é um número.
    expect(somaDosServicosEAdicionais(comExtras)).toBe(7603.46); // 6875 + 896/1,23
  });

  it("num documento que diz «+ IVA», o mesmo adicional entra inteiro", () => {
    const acresce = {
      ...DOC,
      totalVatMode: "acrescer",
      budgetExtras: [{ label: "Deslocação da equipa Líquen", valueText: "896,00 €" }],
    } as unknown as ProposalDoc;
    expect(somaDosServicosEAdicionais(acresce)).toBe(7771);
  });

  it("e o que a própria linha declara ganha ao modo do documento", () => {
    // «896,00 € + IVA» é base, esteja o documento no modo que estiver. É a
    // intenção de quem a escreveu, e está impressa no PDF ao lado do valor.
    const linhaDiz = {
      ...DOC,
      budgetExtras: [{ label: "Deslocação da equipa Líquen", valueText: "896,00 € + IVA" }],
    } as unknown as ProposalDoc;
    expect(somaDosServicosEAdicionais(linhaDiz)).toBe(7771);
  });

  it("sem serviços com preço não há total nenhum a sugerir", () => {
    const soDeslocacao = {
      budgetItems: ["a", "b"],
      budgetAmounts: [null, null],
      budgetExtras: [{ label: "Deslocação", valueText: "75,00 €" }],
    } as unknown as ProposalDoc;
    expect(somaDosServicosEAdicionais(soDeslocacao)).toBeNull();
  });
});

describe("desalinhamento", () => {
  it("cala-se quando o total bate certo", () => {
    expect(desalinhamento(DOC, 6875)).toBeNull();
  });

  it("avisa quando o total foi escrito à mão e já não bate", () => {
    // É exactamente o caso que ela descreveu: alterar um item e esquecer o total.
    const d = desalinhamento(DOC, 7500);
    expect(d).toEqual({ soma: 6875, total: 7500, diferenca: 625, sugerido: 6875 });
  });

  it("cala-se quando ainda não há preços", () => {
    const semPrecos = { ...DOC, budgetAmounts: [] } as unknown as ProposalDoc;
    expect(desalinhamento(semPrecos, 6875)).toBeNull();
  });

  it("um cêntimo de diferença não é um aviso", () => {
    // A soma é feita em vírgula flutuante e o total foi escrito por uma pessoa.
    expect(desalinhamento(DOC, 6875.01)).toBeNull();
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O CASO QUE ELA ABRIU — E QUE NÃO PODE VOLTAR A ACENDER
   * ════════════════════════════════════════════════════════════════════════
   *
   * Quatro serviços por orçamentar (o «900» a cinzento é o placeholder do
   * campo, não um preço), uma deslocação de 75,00 €, total escrito 2.460,00 €.
   * O aviso dizia «o total está escrito à mão e difere da soma das linhas em
   * 2.385,00 €» — estava a comparar 2.460 € com 75 €.
   */
  it("quatro serviços sem preço + deslocação de 75 € + total 2460 € = nenhum aviso", () => {
    const oCasoDela = {
      budgetItems: [
        "Decoração Cerimónia",
        "Decoração Cocktail",
        "Design Floral e Decoração Mesas",
        "Complementos dos Noivos",
      ],
      budgetAmounts: [null, null, null, null],
      budgetExtras: [{ label: "Deslocação da equipa Líquen", valueText: "75,00 €" }],
      totalAmount: 2460,
    } as unknown as ProposalDoc;
    expect(desalinhamento(oCasoDela, 2000)).toBeNull();
    // E em nenhuma leitura do total: bruta, base, ou o número cru escrito.
    for (const total of [0, 75, 2000, 2460, 3025.8]) {
      expect(desalinhamento(oCasoDela, total)).toBeNull();
    }
  });

  /**
   * O AVISO FALSO QUE SE TROCARIA PELO OUTRO, SE SÓ A SOMA PERDESSE OS
   * ADICIONAIS.
   *
   * O total escrito já traz os adicionais lá dentro (mexer num adicional mexe
   * no total — ver `definirExtras` no estúdio). Serviços a 2.385 € e uma
   * deslocação de 75 € dão um total de 2.460 €: comparar 2.460 com 2.385
   * acusaria 75,00 € de erro — um aviso falso novo, em TODAS as propostas com
   * deslocação. Tira-se o mesmo dos dois lados, e o aviso cala-se.
   */
  it("uma proposta certa COM adicionais não acende o aviso", () => {
    const comDeslocacao = {
      budgetItems: ["Cerimónia", "Jantar"],
      budgetAmounts: [1385, 1000],
      // «+ IVA» ⇒ os 75 são base, e o total de base é 2.385 + 75.
      budgetExtras: [{ label: "Deslocação", valueText: "75,00 € + IVA" }],
      totalVatMode: "acrescer",
      totalAmount: 2460,
    } as unknown as ProposalDoc;
    expect(desalinhamento(comDeslocacao, 2460)).toBeNull();
  });

  /**
   * E o que o botão «Usar X» escreve no campo do total TEM de levar os
   * adicionais: escrever lá a soma dos serviços apagava a deslocação do preço
   * final, e com ela do sinal e da factura.
   */
  it("o total sugerido leva os adicionais; a soma mostrada, não", () => {
    const torto = {
      budgetItems: ["Cerimónia", "Jantar"],
      budgetAmounts: [1385, 1000],
      budgetExtras: [{ label: "Deslocação", valueText: "75,00 € + IVA" }],
      totalVatMode: "acrescer",
      totalAmount: 3000,
    } as unknown as ProposalDoc;
    const d = desalinhamento(torto, 3000);
    expect(d).toEqual({
      // O que se MOSTRA como «soma das linhas»: só os serviços.
      soma: 2385,
      // A parte do total que cabe aos serviços — o mesmo número que o PDF
      // imprime na linha «Valor Total».
      total: 2925,
      diferenca: 540,
      // O que o botão escreve no campo: serviços + adicionais.
      sugerido: 2460,
    });
    // Escrever o sugerido cala o aviso.
    expect(desalinhamento(torto, d!.sugerido)).toBeNull();
  });
});

describe("sinalESaldo", () => {
  it("30% e 70%, como nas condições dela", () => {
    expect(sinalESaldo(6875, 30)).toEqual({ sinal: 2062.5, saldo: 4812.5 });
  });

  /**
   * As duas parcelas TÊM de somar o total.
   *
   * Se fossem calculadas cada uma por si, o arredondamento comia um cêntimo e
   * a factura deixava de fechar — que é uma conversa com o contabilista.
   */
  it("as duas parcelas somam sempre o total, mesmo com arredondamento", () => {
    for (const total of [6875, 3333.33, 1000.01, 7771, 0.05]) {
      for (const pct of [30, 33, 50, 70]) {
        const { sinal, saldo } = sinalESaldo(total, pct);
        expect(Math.round((sinal + saldo) * 100) / 100).toBe(Math.round(total * 100) / 100);
      }
    }
  });

  it("uma percentagem impossível fica dentro dos limites", () => {
    expect(sinalESaldo(1000, 150).sinal).toBe(1000);
    expect(sinalESaldo(1000, -20).sinal).toBe(0);
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O SINAL E O SALDO FECHAM O TOTAL — EM TODAS AS PERCENTAGENS, NÃO SÓ 30%
   * ════════════════════════════════════════════════════════════════════════
   *
   * Os 30% da casa são só o valor por omissão: a percentagem é configurável no
   * documento (`depositPercentOf`) e o sinal que o estúdio mostra é o sinal que
   * a factura emite. Uma percentagem qualquer que deixasse um cêntimo entre as
   * parcelas seria uma factura que não fecha — e ninguém dava por ela até um
   * cliente perguntar.
   *
   * Varrimento medido: 15 totais × 201 percentagens (0 a 100 de meio em meio) =
   * 3.015 combinações, zero cêntimos perdidos ou inventados.
   */
  it("nenhum cêntimo se perde nem se inventa, em nenhuma percentagem", () => {
    const totais = [
      0, 0.01, 0.02, 0.03, 0.05, 1, 7.77, 1999.99, 2460, 2461, 3333.33, 6875, 7771, 12_345.67,
      99_999_999.99,
    ];
    const falhas: string[] = [];
    for (const total of totais) {
      for (let pct = 0; pct <= 100; pct += 0.5) {
        const { sinal, saldo } = sinalESaldo(total, pct);
        // As parcelas são cêntimos inteiros...
        if (sinal !== round2(sinal) || saldo !== round2(saldo)) {
          falhas.push(`${total} @ ${pct}%: parcelas com mais de duas casas (${sinal}/${saldo})`);
        }
        // ...e somam EXACTAMENTE o total, sem tolerância nenhuma.
        if (round2(sinal + saldo) !== round2(total)) {
          falhas.push(`${total} @ ${pct}%: ${sinal} + ${saldo} ≠ ${total}`);
        }
        // Nenhuma das duas é negativa: uma factura de valor negativo não existe.
        if (sinal < 0 || saldo < 0) falhas.push(`${total} @ ${pct}%: parcela negativa`);
      }
    }
    expect(falhas).toEqual([]);
  });

  it("um cêntimo dividido a meio dá tudo a uma das parcelas, e nada se perde", () => {
    // 0,005 € não existe. Com o meio cêntimo a subir, o sinal fica com o
    // cêntimo inteiro e o saldo com zero — e as duas continuam a somar 0,01 €.
    expect(sinalESaldo(0.01, 50)).toEqual({ sinal: 0.01, saldo: 0 });
    expect(sinalESaldo(0.01, 30)).toEqual({ sinal: 0, saldo: 0.01 });
    expect(sinalESaldo(0, 30)).toEqual({ sinal: 0, saldo: 0 });
  });
});

describe("asDuasFormas", () => {
  it("mostra o mesmo número lido das duas maneiras", () => {
    const r = asDuasFormas(6875, 0.23);
    // "+ IVA": o cliente paga 8456,25 €.
    expect(r.acrescer).toEqual({ base: 6875, iva: 1581.25, total: 8456.25 });
    // "IVA incluído": o cliente paga 6875 €, dos quais 1285,37 € são IVA.
    expect(r.incluido.total).toBe(6875);
    expect(r.incluido.base).toBe(5589.43);
    expect(r.incluido.iva).toBe(1285.57);
  });

  it("em «incluído», a base mais o IVA dão o total", () => {
    const { incluido } = asDuasFormas(6875, 0.23);
    expect(Math.round((incluido.base + incluido.iva) * 100) / 100).toBe(incluido.total);
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O IVA AO CÊNTIMO, EM VALORES QUE NÃO SÃO REDONDOS
   * ════════════════════════════════════════════════════════════════════════
   *
   * A caixa de comparação diz «base 2.000,00 € · IVA 460,00 € · o cliente paga
   * 2.460,00 €», e bate certo — mas 2.460 / 1,23 = 2.000 exacto é uma
   * coincidência rara. Estes são os vizinhos: um euro ao lado, um valor com
   * cêntimos periódicos, e um cêntimo abaixo dos dois mil.
   */
  it("2461, 3333,33 e 1999,99 fecham ao cêntimo nos dois modos", () => {
    // 2.461 €: em «incluído» a base já não é redonda — 2.000,81 €.
    expect(asDuasFormas(2461, 0.23)).toEqual({
      acrescer: { base: 2461, iva: 566.03, total: 3027.03 },
      incluido: { base: 2000.81, iva: 460.19, total: 2461 },
    });
    // 3.333,33 €: o IVA de 766,6659 arredonda para cima e o total dá 4.100 €
    // certos — o cêntimo que faltava veio do arredondamento, não do nada.
    expect(asDuasFormas(3333.33, 0.23)).toEqual({
      acrescer: { base: 3333.33, iva: 766.67, total: 4100 },
      incluido: { base: 2710.02, iva: 623.31, total: 3333.33 },
    });
    // 1.999,99 €: um cêntimo abaixo do caso «bonito», e o IVA que «acresce» dá
    // os mesmos 460,00 € — 1.999,99 × 0,23 = 459,9977.
    expect(asDuasFormas(1999.99, 0.23)).toEqual({
      acrescer: { base: 1999.99, iva: 460, total: 2459.99 },
      incluido: { base: 1626.01, iva: 373.98, total: 1999.99 },
    });
    // E o caso que ela viu, para ficar pinado: 2.460 lido «com IVA» é mesmo
    // 2.000 de base e 460 de IVA.
    expect(asDuasFormas(2460, 0.23).incluido).toEqual({ base: 2000, iva: 460, total: 2460 });
  });

  /**
   * A BATERIA. As três parcelas TÊM de fechar, nos dois modos e em todas as
   * taxas — sem cêntimos perdidos nem inventados.
   *
   * Varrimento medido: 21 valores × 5 taxas = 105 combinações × 2 modos.
   */
  it("base + IVA = total, sempre, nos dois modos e em todas as taxas", () => {
    const valores = [
      0, 0.01, 0.02, 0.03, 1, 1.01, 7.775, 8.615, 99.99, 1000, 1999.99, 2000, 2460, 2461, 3333.33,
      6875, 7771, 12_345.67, 999_999.99, 12_345_678.91, 99_999_999.99,
    ];
    const taxas = [0, 0.06, 0.13, 0.23, 1];
    const falhas: string[] = [];
    for (const v of valores) {
      for (const taxa of taxas) {
        const r = asDuasFormas(v, taxa);
        for (const [nome, m] of Object.entries(r)) {
          if (round2(m.base + m.iva) !== m.total) {
            falhas.push(`${v} @ ${taxa}: ${nome} ${m.base} + ${m.iva} ≠ ${m.total}`);
          }
          // Cêntimos inteiros nas três, e nada negativo.
          if (m.base !== round2(m.base) || m.iva !== round2(m.iva) || m.total !== round2(m.total)) {
            falhas.push(`${v} @ ${taxa}: ${nome} tem mais de duas casas`);
          }
          if (m.iva < 0) falhas.push(`${v} @ ${taxa}: ${nome} com IVA negativo`);
        }
        // O número escrito é sempre uma das três: a base em «acresce», o total
        // em «incluído». É o que a caixa promete a quem a lê.
        if (r.acrescer.base !== round2(v) || r.incluido.total !== round2(v)) {
          falhas.push(`${v} @ ${taxa}: o número escrito desapareceu do quadro`);
        }
        // Taxa 0 é IVA nenhum, e não uma leitura diferente do mesmo número.
        if (taxa === 0 && (r.acrescer.iva !== 0 || r.incluido.iva !== 0)) {
          falhas.push(`${v} @ 0%: inventou IVA`);
        }
      }
    }
    expect(falhas).toEqual([]);
  });

  /**
   * O MEIO CÊNTIMO CONTINUA A SUBIR — E NENHUM CAMINHO NOVO O CONTORNA.
   *
   * `round2` já foi corrigido uma vez por causa disto: `Math.round(1.005*100)`
   * dá 100, porque 1,005 é 1,00499999999999989 em vírgula flutuante. Um IVA de
   * 1,005 € facturado a 1,00 € é um cêntimo a menos entregue ao Estado.
   *
   * O quadro arredonda o valor escrito ANTES de o multiplicar, e não depois: um
   * total com mais de dois decimais mostrava um IVA que não era o da base
   * mostrada ao lado (medido: `round2(x·0,23)` e `round2(round2(x)·0,23)`
   * divergem em 11.500 de 200.000 valores). Um valor em euros tem cêntimos e
   * mais nada.
   */
  it("o quadro arredonda o valor escrito antes de o multiplicar", () => {
    // 1,005 € escrito é 1,01 € de base — e o IVA é o de 1,01, não o de 1,005.
    const r = asDuasFormas(1.005, 0.23);
    expect(r.acrescer.base).toBe(1.01);
    expect(r.acrescer.iva).toBe(round2(1.01 * 0.23));
    expect(round2(r.acrescer.base + r.acrescer.iva)).toBe(r.acrescer.total);
    // E o meio cêntimo do próprio IVA sobe: 4,37 × 0,23 = 1,0051.
    expect(asDuasFormas(4.37, 0.23).acrescer.iva).toBe(1.01);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * O QUE ALIMENTA O QUADRO: O TOTAL ESCRITO À MÃO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `asDuasFormas` recebe `money.base`, e essa base vem de `resolveProposalMoney`
 * a ler o que ela escreveu. Se a leitura já vier com cêntimos a mais ou a
 * menos, o quadro fecha em si e mente na mesma.
 */
describe("o total escrito à mão chega ao quadro sem perder cêntimos", () => {
  it("um total que não é um número não vira um número inventado", () => {
    // «a combinar», «sob consulta», um campo vazio: não há valor nenhum, e a
    // leitura tem de dar zero — nunca NaN, que se propaga por tudo em silêncio
    // e sai impresso como «NaN €».
    for (const texto of ["a combinar", "sob consulta", "", "€", "—"]) {
      const m = resolveProposalMoney({ totalText: texto } as ProposalDoc);
      expect(m.base).toBe(0);
      expect(m.vat).toBe(0);
      expect(m.gross).toBe(0);
      expect(Number.isNaN(m.base)).toBe(false);
    }
    // E o quadro de comparação sobre esse zero é três zeros, não um erro.
    expect(asDuasFormas(0, 0.23)).toEqual({
      acrescer: { base: 0, iva: 0, total: 0 },
      incluido: { base: 0, iva: 0, total: 0 },
    });
  });

  it("base, IVA e bruto fecham em todas as taxas e nos dois modos", () => {
    const valores = [0.01, 1999.99, 2460, 2461, 3333.33, 6875, 99_999_999.99];
    const falhas: string[] = [];
    for (const totalAmount of valores) {
      for (const totalVatMode of ["acrescer", "incluido"] as const) {
        for (const vatRate of [0, 0.06, 0.13, 0.23]) {
          const m = resolveProposalMoney({
            totalAmount,
            totalVatMode,
            vatRate,
          } as ProposalDoc);
          if (round2(m.base + m.vat) !== m.gross) {
            falhas.push(
              `${totalAmount} ${totalVatMode} @${vatRate}: ${m.base}+${m.vat}≠${m.gross}`,
            );
          }
          // O sinal e o saldo saem do BRUTO, e têm de o fechar ao cêntimo.
          const { sinal, saldo } = sinalESaldo(m.gross, 30);
          if (round2(sinal + saldo) !== m.gross) {
            falhas.push(`${totalAmount} ${totalVatMode} @${vatRate}: sinal+saldo ≠ bruto`);
          }
        }
      }
    }
    expect(falhas).toEqual([]);
  });
});

describe("linhas e preços andam sempre a par", () => {
  /**
   * O RISCO CONHECIDO DESTE DESENHO.
   *
   * Os preços são um array paralelo ao das linhas. Se uma remoção mexer num e
   * não no outro, os preços deslizam todos uma posição — e a proposta fica com
   * o preço da cerimónia no ramo da noiva, sem nada a assinalar. Estes testes
   * são o que impede isso.
   */
  it("remover uma linha leva o preço dela, e só o dela", () => {
    const d = removerLinha(DOC, 1); // fora "Decoração Cocktail" (1200)
    expect(d.budgetItems).toHaveLength(4);
    expect(d.budgetAmounts).toEqual([900, 650, 3600, 525]);
    expect(linhasDe(d).map((l) => l.preco)).toEqual([900, 650, 3600, 525]);
    expect(somaDosServicos(d)).toBe(5675);
  });

  it("acrescentar uma linha acrescenta um preço vazio", () => {
    const d = adicionarLinha(DOC, "Tecidos suspensos");
    expect(d.budgetItems).toHaveLength(6);
    expect(d.budgetAmounts).toHaveLength(6);
    expect(d.budgetAmounts?.[5]).toBeNull();
    // Uma linha sem preço não muda a soma.
    expect(somaDosServicos(d)).toBe(6875);
  });

  it("mudar o nome de uma linha não mexe no preço", () => {
    const d = definirItem(DOC, 0, "Decor Cerimónia");
    expect(d.budgetAmounts).toEqual([900, 1200, 650, 3600, 525]);
  });

  it("um documento antigo, sem preços nenhuns, não rebenta", () => {
    // Todas as propostas já gravadas estão neste estado.
    const antigo = { budgetItems: ["a", "b"] } as unknown as ProposalDoc;
    expect(precosDe(antigo)).toEqual([null, null]);
    expect(somaDosServicos(antigo)).toBeNull();
    const d = definirPreco(antigo, 1, 500);
    expect(d.budgetAmounts).toEqual([null, 500]);
    expect(somaDosServicos(d)).toBe(500);
  });

  it("um array de preços mais curto do que as linhas normaliza-se", () => {
    // Não devia acontecer — mas se acontecer, perde-se um preço em vez de
    // partir a leitura.
    const torto = { budgetItems: ["a", "b", "c"], budgetAmounts: [10] } as unknown as ProposalDoc;
    expect(precosDe(torto)).toEqual([10, null, null]);
  });

  it("um array de preços mais longo do que as linhas é cortado", () => {
    const torto = {
      budgetItems: ["a"],
      budgetAmounts: [10, 20, 30],
    } as unknown as ProposalDoc;
    expect(precosDe(torto)).toEqual([10]);
    expect(somaDosServicos(torto)).toBe(10);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * E A RUBRICA INGLESA ANDA A PAR COM A RUBRICA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `budgetItemsEn` é mais um array paralelo, e o defeito que ele pode ter é o
 * mesmo que os custos e as marcas de extra já tiveram: apagar a linha 2 de
 * cinco sem lhe mexer põe a tradução da linha 3 na linha 2. Não dá erro
 * nenhum — dá a rubrica errada traduzida no PDF de um cliente que não lê a
 * versão portuguesa e não tem como desconfiar.
 *
 * A defesa é não escrever código novo para isto: o campo entra no `PARALELOS`,
 * que é onde a disciplina já vive. Estes testes são o cinto por cima dos
 * suspensórios.
 */
describe("as traduções das rubricas viajam com as rubricas", () => {
  const BILINGUE = {
    budgetItems: ["Cerimónia", "Cocktail", "Jantar", "Complementos"],
    budgetAmounts: [900, 1200, 650, 3600],
    budgetItemsEn: ["Ceremony", "Cocktail", "Dinner", "Extras"],
  } as unknown as ProposalDoc;

  it("remover uma linha leva a tradução dela, e só a dela", () => {
    const d = removerLinha(BILINGUE, 1);
    expect(d.budgetItems).toEqual(["Cerimónia", "Jantar", "Complementos"]);
    expect(d.budgetItemsEn).toEqual(["Ceremony", "Dinner", "Extras"]);
  });

  it("acrescentar uma linha acrescenta uma tradução POR ESCREVER, não uma vazia", () => {
    // `null` e não `""`: «ainda não foi traduzida» tem de continuar a
    // distinguir-se de «foi decidido que fica igual».
    const d = adicionarLinha(BILINGUE, "Tecidos");
    expect(d.budgetItemsEn).toEqual(["Ceremony", "Cocktail", "Dinner", "Extras", null]);
  });

  it("um documento sem traduções nenhumas não ganha um array de nulls", () => {
    // O documento tem de continuar a serializar exactamente como serializava —
    // é o que impede o rascunho de «mudar sozinho».
    const semIngles = { budgetItems: ["a", "b"], budgetAmounts: [1, 2] } as unknown as ProposalDoc;
    expect(removerLinha(semIngles, 0).budgetItemsEn).toBeUndefined();
    expect(adicionarLinha(semIngles).budgetItemsEn).toBeUndefined();
  });

  it("PROPRIEDADE: inserções e remoções ao calhas nunca separam a rubrica da tradução", () => {
    // O par (rubrica, tradução) é escrito de propósito com o mesmo número dos
    // dois lados, para se poder afirmar a correspondência sem depender de um
    // dicionário.
    let doc = {
      budgetItems: [],
      budgetAmounts: [],
      budgetItemsEn: [],
    } as unknown as ProposalDoc;
    let proximo = 0;
    // Uma sequência FIXA de gestos: um teste que falha só de vez em quando é um
    // teste que se aprende a ignorar. Cobre inserir no fim, remover no meio, no
    // princípio e no fim, e voltar a crescer por cima dos buracos.
    const gestos: Array<["+" | "-", number]> = [
      ["+", 0],
      ["+", 0],
      ["+", 0],
      ["-", 1],
      ["+", 0],
      ["+", 0],
      ["-", 0],
      ["-", 2],
      ["+", 0],
      ["+", 0],
      ["-", 3],
      ["+", 0],
    ];
    for (const [gesto, i] of gestos) {
      if (gesto === "+") {
        const n = proximo++;
        doc = adicionarLinha(doc, `Rubrica ${n}`);
        doc = escreverEn(
          doc,
          { tipo: "linhaDeOrcamento", i: doc.budgetItems.length - 1 },
          `Item ${n}`,
        );
      } else if (i < doc.budgetItems.length) {
        doc = removerLinha(doc, i);
      }
      // O invariante, verificado a CADA gesto: a rubrica `n` tem a tradução `n`.
      expect(doc.budgetItemsEn).toHaveLength(doc.budgetItems.length);
      doc.budgetItems.forEach((item, j) => {
        expect(doc.budgetItemsEn?.[j]).toBe(item.replace("Rubrica", "Item"));
      });
    }
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS VALORES ADICIONAIS VALEM DINHEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A deslocação da equipa, o wedding coordinator, os tecidos. São escritos como
 * TEXTO na proposta («896,00 €», «895,00 € + IVA», «a definir») porque é assim
 * que aparecem nas propostas verdadeiras — e é o estúdio que os soma ao total,
 * que é o mesmo número de onde saem o sinal de 30% e a factura.
 *
 * Ler mal um destes textos é dinheiro a menos ou a mais numa factura.
 */
describe("somaDosExtras", () => {
  it("soma o que consegue ler", () => {
    expect(
      somaDosExtras([
        { label: "Deslocação da equipa Líquen", valueText: "1.550,00 €" },
        { label: "Wedding Coordinator", valueText: "895,00 € + IVA" },
      ]),
    ).toBe(2445);
  });

  it("o que não tem número não conta — e não estraga a soma", () => {
    expect(
      somaDosExtras([
        { label: "Deslocação", valueText: "1.550,00 €" },
        { label: "Mobiliário", valueText: "a definir" },
        { label: "Tecidos", valueText: "" },
      ]),
    ).toBe(1550);
  });

  it("sem extras nenhuns é zero, para poder somar-se sempre", () => {
    expect(somaDosExtras([])).toBe(0);
    expect(somaDosExtras(undefined)).toBe(0);
  });

  it("«1.500» é mil e quinhentos, e não um e meio", () => {
    // A mesma regra do resto do ficheiro: sem ela, uma deslocação de 1.500 €
    // entrava na factura como 1,50 €.
    expect(somaDosExtras([{ label: "Deslocação", valueText: "1.500" }])).toBe(1500);
  });

  it("arredonda ao cêntimo — somar floats dá 0,30000000000000004", () => {
    expect(
      somaDosExtras([
        { label: "a", valueText: "0,10" },
        { label: "b", valueText: "0,20" },
      ]),
    ).toBe(0.3);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O «+ IVA» QUE A LINHA DECLARA TEM DE CONTAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O campo a que isto se soma é a BASE («Preço final (sem IVA)»), e é dele que
 * saem a factura, o sinal e o saldo. Somar «895,00 €» e «895,00 € + IVA» da
 * mesma maneira faz a linha e o total dizerem números diferentes sobre a mesma
 * coisa, no mesmo documento que vai para o casal.
 */
describe("somaDosExtrasSemIva", () => {
  const IVA = { mode: "incluido" as const, vatRate: 0.23 };
  const SEM = { mode: "acrescer" as const, vatRate: 0.23 };

  it("«+ IVA» é líquido e entra tal e qual, em qualquer documento", () => {
    const linha = [{ label: "Coordenação", valueText: "895,00 € + IVA" }];
    expect(somaDosExtrasSemIva(linha, IVA)).toBe(895);
    expect(somaDosExtrasSemIva(linha, SEM)).toBe(895);
  });

  it("uma linha calada num documento COM IVA é bruta, e converte-se", () => {
    // 895 / 1,23 = 727,64 de base. Somar 895 punha no total mais 1.101 do que
    // o casal vai pagar, quando a linha lhe prometeu 895.
    expect(somaDosExtrasSemIva([{ label: "Deslocação", valueText: "895,00 €" }], IVA)).toBe(727.64);
  });

  it("uma linha calada num documento SEM IVA é líquida", () => {
    expect(somaDosExtrasSemIva([{ label: "Deslocação", valueText: "895,00 €" }], SEM)).toBe(895);
  });

  it("«IVA incluído» escrito na linha ganha ao modo do documento", () => {
    const linha = [{ label: "Tecidos", valueText: "1.230,00 € (IVA incluído)" }];
    expect(somaDosExtrasSemIva(linha, SEM)).toBe(1000);
  });

  it("sem contexto nenhum, líquido — é o comportamento de sempre", () => {
    expect(somaDosExtrasSemIva([{ label: "X", valueText: "1.550,00 €" }])).toBe(1550);
  });

  it("«a definir» não conta e não estraga a soma das outras", () => {
    expect(
      somaDosExtrasSemIva(
        [
          { label: "Deslocação", valueText: "a definir" },
          { label: "Coordenação", valueText: "1.500,00 € + IVA" },
        ],
        IVA,
      ),
    ).toBe(1500);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS SEIS NÚMEROS DO BLOCO DE TOTAIS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estes testes são a rede da dupla conversão. O caso da Tara e do Marty está
 * aqui com os números exactos do PDF que foi para a cliente — é o único caso
 * deste ficheiro que se pode conferir contra papel impresso.
 */
describe("totaisDaProposta — o bloco que tem de fechar", () => {
  const doc = (over: Partial<ProposalDoc> = {}) =>
    ({
      budgetItems: ["Decoração Cerimónia", "Decoração Copo d'Água"],
      budgetAmounts: [],
      budgetExtras: [],
      ...over,
    }) as Parameters<typeof totaisDaProposta>[0];

  /**
   * ── O CASO MEDIDO ─────────────────────────────────────────────────────────
   * Total 2.460,00 € de base, IVA incluído no valor guardado (3.025,80 €), uma
   * deslocação de 75,00 €. O gerador imprimia 2.950,79 € — (3.025,80 − 75) ÷
   * 1,23 × 1,23, com um arredondamento pelo meio — quando 3.025,80 − 75,00 =
   * 2.950,80. O cêntimo perdido fazia o documento não fechar.
   */
  it("Tara e Marty: uma conversão só, e as três somas ao cêntimo", () => {
    const t = totaisDaProposta(
      doc({
        totalAmount: 3025.8,
        totalVatMode: "incluido",
        budgetExtras: [{ label: "Deslocação da Equipa Líquen", valueText: "75,00 €" }],
      }),
      30,
    );
    expect(t.total).toBe(2460);
    expect(t.adicionais).toBe(60.98); // 75 ÷ 1,23
    expect(t.servicos).toBe(2399.02);
    expect(round2(t.servicos + t.adicionais)).toBe(t.total);
    expect(t.iva).toBe(565.8);
    expect(t.aPagar).toBe(3025.8);
    expect(round2(t.total + t.iva)).toBe(t.aPagar);
    expect(t.sinal).toBe(907.74);
    expect(t.saldo).toBe(2118.06);
    expect(round2(t.sinal + t.saldo)).toBe(t.aPagar);
    expect(t.fecha).toBe(true);
  });

  it("os mesmos serviços, o mesmo total a pagar, nos dois modos de IVA", () => {
    // A mesma proposta escrita das duas maneiras: base 2.460 em «acresce» e
    // 3.025,80 em «IVA incluído». O que o casal transfere é o mesmo número, e
    // as duas leituras têm de o dizer.
    const acresce = totaisDaProposta(
      doc({
        totalAmount: 2460,
        totalVatMode: "acrescer",
        budgetExtras: [{ label: "Deslocação", valueText: "75,00 € + IVA" }],
      }),
      30,
    );
    const incluido = totaisDaProposta(
      doc({
        totalAmount: 3025.8,
        totalVatMode: "incluido",
        budgetExtras: [{ label: "Deslocação", valueText: "92,25 €" }], // 75 × 1,23
      }),
      30,
    );
    expect(acresce.aPagar).toBe(incluido.aPagar);
    expect(acresce.total).toBe(incluido.total);
    expect(acresce.adicionais).toBe(incluido.adicionais);
    expect(acresce.servicos).toBe(incluido.servicos);
    expect(acresce.sinal).toBe(incluido.sinal);
  });

  it("a percentagem do sinal é a que lhe for dada, e o saldo é o resto", () => {
    const t = totaisDaProposta(doc({ totalAmount: 10000, totalVatMode: "acrescer" }), 50);
    expect(t.aPagar).toBe(12300);
    expect(t.percentagemSinal).toBe(50);
    expect(t.sinal).toBe(6150);
    expect(t.saldo).toBe(6150);
  });

  it("sem valores adicionais, o subtotal é o total", () => {
    const t = totaisDaProposta(doc({ totalAmount: 7890, totalVatMode: "acrescer" }), 30);
    expect(t.adicionais).toBe(0);
    expect(t.servicos).toBe(7890);
    expect(t.total).toBe(7890);
    expect(t.fecha).toBe(true);
  });

  /**
   * ── QUANDO O TOTAL FICOU POR ACTUALIZAR ──────────────────────────────────
   *
   * Havia aqui um `Math.max(0, …)` que punha o subtotal a zero e deixava a
   * folha a dizer «0,00 € + 1.550,00 € = 1.000,00 €». O número estranho passa a
   * ver-se, e quem gera a proposta é AVISADO — não bloqueado: uma proposta que
   * não sai é pior do que uma proposta com um aviso.
   */
  it("adicionais maiores do que o total: sai negativo, fecha, e avisa", () => {
    const t = totaisDaProposta(
      doc({
        totalAmount: 1000,
        totalVatMode: "acrescer",
        budgetExtras: [{ label: "Deslocação", valueText: "1.550,00 € + IVA" }],
      }),
      30,
    );
    expect(t.servicos).toBe(-550);
    expect(round2(t.servicos + t.adicionais)).toBe(t.total);
    expect(t.fecha).toBe(false);
    expect(t.porQueNaoFecha.join(" ")).toMatch(/negativo/);
  });

  it("uma taxa reduzida atravessa o bloco inteiro", () => {
    const t = totaisDaProposta(
      doc({ totalAmount: 10000, totalVatMode: "acrescer", vatRate: 0.06 }),
      30,
    );
    expect(t.taxa).toBe(0.06);
    expect(t.iva).toBe(600);
    expect(t.aPagar).toBe(10600);
    expect(round2(t.sinal + t.saldo)).toBe(t.aPagar);
    expect(t.fecha).toBe(true);
  });

  /**
   * A rede da regra: NUNCA ARREDONDAR DUAS VEZES. Duzentos mil documentos com
   * cêntimos por todo o lado, e nenhum pode deixar de fechar.
   */
  it("com cêntimos por todo o lado, as três somas fecham sempre", () => {
    for (let i = 0; i < 20000; i += 1) {
      const base = round2(500 + (i % 4517) + (i % 97) / 100);
      const extra = round2((i % 313) + (i % 89) / 100);
      const modo = i % 2 === 0 ? "acrescer" : "incluido";
      const t = totaisDaProposta(
        doc({
          totalAmount: base,
          totalVatMode: modo,
          budgetExtras: [{ label: "Deslocação", valueText: `${extra}` }],
        }),
        (i % 98) + 1,
      );
      expect(round2(t.servicos + t.adicionais), `${i}`).toBe(t.total);
      expect(round2(t.total + t.iva), `${i}`).toBe(t.aPagar);
      expect(round2(t.sinal + t.saldo), `${i}`).toBe(t.aPagar);
    }
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A BASE DO SINAL É O TOTAL COM IVA — DECISÃO DELA, 12/08/2026
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A pergunta esteve em aberto e tinha duas respostas defensáveis: 30% da base
 * (738,00 €) ou 30% do que o casal transfere (907,74 €). Ficou a segunda.
 *
 * Não é uma preferência de escrita: é o número que sai numa factura com um
 * número fiscal gasto. Enquanto foi tácito, era o género de coisa que alguém
 * «arruma» a olhar só para uma das folhas — e nesse dia o documento assinado e
 * a factura emitida passam a discordar em 169,74 €.
 *
 * Este teste prende a decisão nos dois sítios onde ela vive, e verifica que são
 * o MESMO número: o bloco de totais (que o estúdio mostra e o PDF imprime) e o
 * caminho da facturação (`splitSinal` sobre `Proposal.total`, que é o bruto
 * gravado por `/api/orcamento/[id]/proposta-doc`).
 */
describe("o sinal é calculado sobre o total COM IVA", () => {
  const proposta = {
    budgetItems: ["Decoração Cerimónia"],
    budgetAmounts: [],
    budgetExtras: [],
    totalAmount: 2460,
    totalVatMode: "acrescer",
  } as unknown as ProposalDoc;

  it("30% de 3.025,80 € e não de 2.460,00 €", () => {
    const t = totaisDaProposta(proposta, 30);
    expect(t.total).toBe(2460); // a base
    expect(t.aPagar).toBe(3025.8); // o que o casal transfere
    expect(t.sinal).toBe(907.74);
    // A outra leitura, a que ficou de fora, escrita para não voltar por
    // distracção: 30% da base seriam 738,00 €.
    expect(t.sinal).not.toBe(738);
    expect(round2(t.total * 0.3)).toBe(738);
  });

  it("o sinal do documento é, ao cêntimo, o que a facturação emite", () => {
    // `Proposal.total` é `resolveProposalMoney(doc).gross` — ver
    // `src/lib/orcamento/envio/a-proposta-que-se-grava.ts`. As rotas de
    // facturação fazem `splitSinal(proposal.total, pct)`.
    for (const [totalAmount, modo] of [
      [2460, "acrescer"],
      [3025.8, "incluido"],
      [7890.55, "acrescer"],
      [12_345.67, "incluido"],
    ] as const) {
      for (const pct of [20, 30, 40, 50]) {
        const doc = { ...proposta, totalAmount, totalVatMode: modo } as ProposalDoc;
        const totalGravado = resolveProposalMoney(doc).gross;
        expect(sinalESaldo(totalGravado, pct)).toEqual({
          sinal: totaisDaProposta(doc, pct).sinal,
          saldo: totaisDaProposta(doc, pct).saldo,
        });
      }
    }
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COLUNA DE PREÇOS DO MODELO ORGANIZAÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O caso está medido, e é o de uma proposta gerada a sério: quatro rubricas,
 * duas com preço e duas sem, por baixo de um total escrito à mão.
 *
 *     Coordenação e planeamento integral    6.500,00 €
 *     Coordenação no dia do evento          1.850,00 € + IVA (a confirmar)
 *     Gestão de fornecedores e contratos    —
 *     Assessoria de imagem e papelaria
 *     TOTAL (sem IVA)                      12.500,00 €
 *
 * 6.500 + 1.850 = 8.350. O total impresso são 12.500: 4.150 € que a coluna não
 * explica a quem a somar. Enquanto `budgetRows` foi lido NUM SÍTIO SÓ — a
 * desenhar —, nada comparava as duas coisas, e esta proposta saiu.
 */
describe("as linhas de Organização somam o que o quadro fecha — ou dizem porque não", () => {
  /** A proposta do relatório, à letra. */
  const organizacao = (over: Partial<ProposalDoc> = {}) =>
    ({
      budgetItems: [],
      budgetAmounts: [],
      budgetExtras: [],
      budgetRows: [
        { item: "Coordenação e planeamento integral", price: "6.500,00 €" },
        { item: "Coordenação no dia do evento", price: "1.850,00 € + IVA (a confirmar)" },
        { item: "Gestão de fornecedores e contratos", price: "[Valor]" },
        { item: "Assessoria de imagem e papelaria", price: "" },
      ],
      totalAmount: 12500,
      totalVatMode: "acrescer",
      ...over,
    }) as Parameters<typeof totaisDaProposta>[0];

  it("6.500 + 1.850 por baixo de um TOTAL de 12.500 não fecha, e diz os três números", () => {
    const t = totaisDaProposta(organizacao(), 30);
    expect(t.fecha, "a proposta do relatório passou sem aviso nenhum").toBe(false);
    const porque = t.porQueNaoFecha.join(" · ");
    expect(porque, "a soma das linhas impressas").toContain("8350");
    expect(porque, "o total que o quadro fecha").toContain("12500");
    expect(porque, "a diferença que o casal encontra ao somar a coluna").toContain("4150");
    // As duas rubricas por orçamentar são a explicação que falta no papel — e
    // é isso que distingue este aviso de «alguém enganou-se numa conta».
    expect(porque, "as rubricas sem preço").toMatch(/2 rubricas sem preço/);
  });

  it("e não muda um único número impresso", () => {
    // A regra da casa: uma verificação que altere um valor é pior do que não
    // existir. Os seis números do bloco são os mesmos com e sem as linhas.
    const com = totaisDaProposta(organizacao(), 30);
    const sem = totaisDaProposta(organizacao({ budgetRows: [] }), 30);
    for (const campo of [
      "servicos",
      "adicionais",
      "total",
      "iva",
      "aPagar",
      "sinal",
      "saldo",
    ] as const) {
      expect(com[campo], `o ${campo} mudou por causa da verificação`).toBe(sem[campo]);
    }
    expect(sem.fecha, "uma proposta sem linhas não tem coluna para desalinhar").toBe(true);
  });

  it("quando a coluna FECHA, cala-se — é o caso normal", () => {
    // 7.890 + 2.500 = 10.390, que é o total. É a proposta de Organização dos
    // testes do gerador, e nenhuma proposta certa pode acender um aviso.
    const t = totaisDaProposta(
      organizacao({
        budgetRows: [
          { item: "Planeamento integral", price: "7890,00 €" },
          { item: "Coordenação no dia", price: "2.500,00 €" },
        ],
        totalAmount: 10390,
      }),
      30,
    );
    expect(t.porQueNaoFecha).toEqual([]);
    expect(t.fecha).toBe(true);
  });

  it("uma coluna INTEIRAMENTE sem preços não é um desalinhamento", () => {
    // É a folha de sempre: as rubricas por nome e a coluna em branco (é assim
    // que a proposta feita à mão sai, e é assim que o modelo Decoração sai
    // todos os dias). Sem nenhum número impresso não há soma que contradiga o
    // total — e um aviso que dispara em condições normais aprende-se a ignorar.
    const t = totaisDaProposta(
      organizacao({
        budgetRows: [
          { item: "Coordenação e planeamento integral", price: "" },
          { item: "Gestão de fornecedores", price: "[Valor]" },
        ],
      }),
      30,
    );
    expect(t.porQueNaoFecha).toEqual([]);
  });

  it("sem total escrito não há nada com que comparar", () => {
    // Uma proposta a meio: as rubricas já têm preço e o total ainda é
    // «[Valor Total]». O papel não imprime total nenhum, portanto não há
    // contradição nenhuma para apontar.
    const t = totaisDaProposta(
      organizacao({
        totalAmount: undefined,
        totalVatMode: undefined,
        totalEstimatedText: "[Valor Total]",
      }),
      30,
    );
    expect(t.porQueNaoFecha).toEqual([]);
  });

  it("o «+ IVA» de uma linha lê-se como o resto do dinheiro escrito à mão", () => {
    // A mesma regra dos valores adicionais (`somaDosExtrasSemIva`): o que a
    // linha DIZ ganha, e uma linha calada segue o modo do documento. Aqui o
    // documento lê-se COM IVA, portanto «6.150,00 €» calado vale 5.000 de base
    // e a linha que diz «+ IVA» vale os 3.350 que escreve — 8.350 ao todo, que
    // é o total. Se a leitura fosse crua, esta proposta certa acusava 1.150 €.
    const t = totaisDaProposta(
      organizacao({
        budgetRows: [
          { item: "Planeamento", price: "6.150,00 €" },
          { item: "Coordenação", price: "3.350,00 € + IVA" },
        ],
        totalAmount: 10270.5, // 8.350 × 1,23
        totalVatMode: "incluido",
      }),
      30,
    );
    expect(t.total).toBe(8350);
    expect(t.porQueNaoFecha).toEqual([]);
  });

  it("os adicionais saem dos dois lados, como em `desalinhamento`", () => {
    // A deslocação é impressa POR BAIXO do subtotal, não dentro da coluna: se
    // só um dos lados a perdesse, uma proposta certa acusava a deslocação
    // inteira de diferença. O que se compara é a coluna com o SUBTOTAL.
    const t = totaisDaProposta(
      organizacao({
        budgetRows: [{ item: "Planeamento integral", price: "8.350,00 €" }],
        budgetExtras: [{ label: "Deslocação da equipa", valueText: "500,00 €" }],
        totalAmount: 8850,
      }),
      30,
    );
    expect(t.servicos).toBe(8350);
    expect(t.adicionais).toBe(500);
    expect(t.porQueNaoFecha).toEqual([]);
  });

  it("o modelo Decoração continua a não ter coluna nenhuma para verificar", () => {
    // `budgetRows` é só do modelo de Organização. Uma proposta de Decoração com
    // preços por linha INTERNOS (`budgetAmounts`) não imprime número nenhum na
    // coluna, e o aviso dela já existe e é outro (`desalinhamento`).
    const t = totaisDaProposta(
      {
        budgetItems: ["Decoração Cerimónia", "Decoração Jantar"],
        budgetAmounts: [1000, 2000],
        budgetExtras: [],
        totalAmount: 12500,
        totalVatMode: "acrescer",
      } as Parameters<typeof totaisDaProposta>[0],
      30,
    );
    expect(t.porQueNaoFecha).toEqual([]);
  });
});
