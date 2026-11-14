import { describe, it, expect } from "vitest";
import {
  splitThirtySeventy,
  eur,
  eur0,
  eurDocumento,
  milharesComPonto,
  round2,
  splitSinal,
  saldoAPartirDoSinal,
  montantesEmIngles,
  montanteNaLingua,
} from "./money";
import { winAnsiSafe } from "./pdf-text";

describe("round2", () => {
  it("arredonda aos cêntimos com o meio cêntimo a SUBIR, como manda a factura", () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
    expect(round2(2.675)).toBe(2.68);
    // Este era o caso que dava 1,00. Ver a nota em `money.ts`: 1,005 não existe
    // em vírgula flutuante e o que lá está arredonda mesmo para baixo. Um IVA
    // de 1,005 € facturado a 1,00 € é um cêntimo a menos entregue ao Estado.
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0)).toBe(0);
    expect(round2(100)).toBe(100);
  });

  it("nos negativos o meio cêntimo afasta-se do zero, como no simétrico", () => {
    // Uma margem de −1,005 € arredonda para −1,01, e não para −1,00. Sem isto,
    // `round2` não era simétrico e um prejuízo era sempre um cêntimo menor do
    // que o lucro equivalente.
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(-2.5)).toBe(-2.5);
    expect(round2(1_000_000.019)).toBe(1_000_000.02);
  });

  it("is idempotent on already-2dp values", () => {
    for (const n of [0.01, 0.99, 3750.55, 8749.99, 12500]) {
      expect(round2(round2(n))).toBe(round2(n));
    }
  });
});

describe("splitThirtySeventy", () => {
  const cases = [12500, 3000.01, 0, 999.99, 1, 100, 250.55, 7, 1_000_000, 33.33];

  it("sinal + saldo sums back exactly to the total (no floating dust)", () => {
    for (const total of cases) {
      const { sinal, saldo } = splitThirtySeventy(total);
      // Compare in integer cents to assert exact cent-level reconstruction.
      expect(Math.round((sinal + saldo) * 100)).toBe(Math.round(total * 100));
    }
  });

  it("both parts are rounded to whole cents", () => {
    for (const total of cases) {
      const { sinal, saldo } = splitThirtySeventy(total);
      expect(sinal).toBe(round2(sinal));
      expect(saldo).toBe(round2(saldo));
    }
  });

  it("sinal is ~30% of the total", () => {
    for (const total of cases) {
      const { sinal } = splitThirtySeventy(total);
      // Within half a cent of the exact 30% share.
      expect(Math.abs(sinal - total * 0.3)).toBeLessThanOrEqual(0.005);
    }
  });

  it("known exact splits", () => {
    expect(splitThirtySeventy(12500)).toEqual({ sinal: 3750, saldo: 8750 });
    expect(splitThirtySeventy(0)).toEqual({ sinal: 0, saldo: 0 });
    expect(splitThirtySeventy(1)).toEqual({ sinal: 0.3, saldo: 0.7 });
    // Odd cents: sinal rounds, saldo is the remainder so the sum is preserved.
    expect(splitThirtySeventy(999.99)).toEqual({ sinal: 300, saldo: 699.99 });
  });

  it("clamps negative totals to zero (matches original behaviour)", () => {
    expect(splitThirtySeventy(-50)).toEqual({ sinal: 0, saldo: 0 });
  });

  it("handles a huge (clamp-boundary) total without floating drift", () => {
    expect(splitThirtySeventy(100_000_000)).toEqual({ sinal: 30_000_000, saldo: 70_000_000 });
  });

  it("a sub-cent total can round the sinal to 0 (remainder falls entirely to saldo)", () => {
    // Documenta o comportamento nas bordas: 30% de 0,01 arredonda a 0,00.
    expect(splitThirtySeventy(0.01)).toEqual({ sinal: 0, saldo: 0.01 });
  });

  it("for INTEGER-euro totals, saldo == round2(sinal/3*7) — the auto-saldo derivation reconciles exactly", () => {
    // O auto-saldo (maybeAutoIssueSaldo) deriva o saldo do sinal faturado via
    // sinal/3*7 em vez do split. Para totais em euros inteiros (o que o pipeline
    // de propostas produz, Math.round), essa derivação coincide ao cêntimo com o
    // saldo do split — logo sinal+saldo fecham sempre o total acordado.
    for (let total = 1; total <= 3000; total += 7) {
      const { sinal, saldo } = splitThirtySeventy(total);
      expect(Math.round((sinal / 3) * 7 * 100) / 100).toBe(saldo);
      expect(Math.round((sinal + saldo) * 100)).toBe(total * 100);
    }
  });
});

describe("round2 — o modo de arredondamento é o comercial: meio cêntimo afasta-se do zero", () => {
  it("um .xx5 exactamente representável sobe (meio para cima, não «meio para o par»)", () => {
    // 0,125 é exactamente representável. O arredondamento bancário (half-even)
    // daria 0,12; a regra comercial, que é a da factura, dá 0,13.
    expect(round2(0.125)).toBe(0.13);
    expect(round2(2.5)).toBe(2.5); // já tem duas casas, não muda
  });

  it("o simétrico arredonda para o simétrico", () => {
    // Era −0,12 contra +0,13: o `Math.round` puxa os meios negativos para o
    // +Infinito. As facturas não são negativas, mas as MARGENS são, e uma
    // margem de −0,125 € valia um cêntimo a menos do que o lucro de +0,125 €.
    expect(round2(-0.125)).toBe(-0.13);
    expect(round2(0.125)).toBe(0.13);
  });

  it("um .xx5 que NÃO é exactamente representável sobe na mesma", () => {
    // 0,145 × 100 é 14,499999999999998 em vírgula flutuante e arredondava para
    // 0,14. Em decimal é meio cêntimo e sobe. Era este o caso que fazia o IVA
    // de certas bases sair um cêntimo abaixo do que a factura diz.
    expect(round2(0.145)).toBe(0.15);
  });

  it("propagates non-finite inputs (NaN/Infinity) unguarded — unlike eur()", () => {
    // NEEDS DECISION: eur()/eur0() coerce falsy/NaN→0, but round2/splitThirtySeventy
    // do not. No reachable caller feeds non-finite (routes clamp via num()), so this
    // is pinned as current behaviour, not asserted-desirable.
    expect(Number.isNaN(round2(NaN))).toBe(true);
    expect(round2(Infinity)).toBe(Infinity);
  });
});

describe("splitThirtySeventy — adversarial reconciliation (integer cents, ruthless)", () => {
  it("sinal + saldo reconciles to the LAST CENT for EVERY cent-aligned total in a dense sweep", () => {
    // 0,00 .. 5.000,00 € in 1-cent steps: the split must always reconstruct the total
    // exactly (no floating dust, no off-by-one cent). Aggregate then assert once so
    // the 500k-iteration sweep isn't drowned in per-iteration expect() overhead.
    const bad: Array<[number, number, number]> = [];
    for (let cents = 0; cents <= 500_000; cents++) {
      const total = cents / 100;
      const { sinal, saldo } = splitThirtySeventy(total);
      if (
        Math.round((sinal + saldo) * 100) !== cents ||
        sinal !== round2(sinal) ||
        saldo !== round2(saldo) ||
        sinal < 0 ||
        saldo < 0
      ) {
        bad.push([total, sinal, saldo]);
      }
    }
    expect(bad).toEqual([]);
  });

  it("reconciles at and around the route's 100.000.000 € cap (huge magnitudes, no drift)", () => {
    for (const total of [
      99_999_999.99, 100_000_000, 100_000_000.01, 88_888_888.88, 66_666_666.67, 33_333_333.33,
    ]) {
      const { sinal, saldo } = splitThirtySeventy(total);
      expect(Math.round((sinal + saldo) * 100)).toBe(Math.round(total * 100));
    }
    expect(splitThirtySeventy(100_000_000)).toEqual({ sinal: 30_000_000, saldo: 70_000_000 });
  });

  it("odd-cent totals push the residue entirely into saldo (sinal never over-collects)", () => {
    // sinal is half-up 30%; saldo is the remainder, so sinal is never MORE than the
    // 30% share by more than half a cent and the client is never over-charged the sinal.
    for (let cents = 0; cents <= 20_000; cents++) {
      const total = cents / 100;
      const { sinal } = splitThirtySeventy(total);
      expect(sinal - total * 0.3).toBeLessThanOrEqual(0.005 + 1e-9);
    }
  });

  it("non-finite totals: NaN→{NaN,NaN}, Infinity→{Infinity,NaN} (pinned; no reachable caller)", () => {
    const nan = splitThirtySeventy(NaN);
    expect(Number.isNaN(nan.sinal)).toBe(true);
    expect(Number.isNaN(nan.saldo)).toBe(true);
    const inf = splitThirtySeventy(Infinity);
    expect(inf.sinal).toBe(Infinity);
    expect(Number.isNaN(inf.saldo)).toBe(true);
  });
});

describe("eur / eur0 formatters", () => {
  // Intl uses a narrow no-break space (U+202F/U+00A0) before the € symbol;
  // normalise whitespace so the assertions aren't brittle.
  const norm = (s: string) => s.replace(/\s/g, " ");

  // Grouping separator is optional: some (small-ICU) Node builds omit it.
  it("eur formats with two decimals (pt-PT)", () => {
    expect(norm(eur(1234.5))).toBe("1 234,50 €");
    expect(norm(eur(0))).toMatch(/^0,00\s€$/);
  });

  it("eur0 formats with no decimals (pt-PT)", () => {
    expect(norm(eur0(1234.5))).toBe("1 235 €");
    expect(norm(eur0(3000))).toBe("3 000 €");
  });

  /**
   * A decisão de 14/11 (auditoria visual, n.º 18): no back office os milhares
   * levam SEMPRE o espaço — «15 129 €» e «3690 €» na mesma fila eram dois
   * formatos do mesmo formatador. E o espaço é UM só: o inquebrável (U+00A0)
   * que o `Intl` já punha nos números grandes.
   */
  it("os milhares agrupam sempre, com o mesmo espaço inquebrável dos números grandes", () => {
    expect(eur0(1000)).toBe("1\u00A0000\u00A0€");
    expect(eur0(3690)).toBe("3\u00A0690\u00A0€");
    expect(eur0(999)).toBe("999\u00A0€");
    expect(eur0(15129)).toBe("15\u00A0129\u00A0€");
    expect(eur(3690)).toBe("3\u00A0690,00\u00A0€");
    // O separador dos quatro dígitos é o mesmo carácter que o dos cinco.
    expect(eur0(3690)[1]).toBe(eur0(15129)[2]);
  });

  it("o que o cliente lê NÃO muda: o PDF e a proposta online continuam com o ponto", () => {
    // `eurDocumento` é o dinheiro que o gerador escreve…
    expect(eurDocumento(3690)).toBe("3.690,00\u00A0€");
    expect(eurDocumento(999)).toBe("999,00\u00A0€");
    // … e o `milharesComPonto` é por onde passam os textos que ela escreveu
    // com o `eur` (deslocação, «+ IVA»): o agrupado de agora e o colado de
    // antes dão exactamente o mesmo na folha.
    expect(milharesComPonto(`${eur(3690)} + IVA`)).toBe("3.690,00\u00A0€ + IVA");
    expect(milharesComPonto(`${eur(3690)} + IVA`)).toBe(milharesComPonto("3690,00\u00A0€ + IVA"));
    expect(milharesComPonto(eur(15129.4))).toBe("15.129,40\u00A0€");
  });

  it("both coerce falsy/NaN to 0", () => {
    expect(norm(eur(NaN))).toMatch(/^0,00\s€$/);
    expect(norm(eur0(NaN))).toMatch(/^0\s€$/);
  });
});

describe("eurDocumento — o dinheiro como o CLIENTE o lê", () => {
  /**
   * Os seis valores que apanham o defeito e a sua fronteira.
   *
   * O `eur` partilhado herda a regra do `Intl` de pt-PT, que só agrupa a partir
   * de CINCO dígitos: 4 600 e 7 890 saíam sem separador nenhum, ao lado de
   * 24 600 que saía com um espaço inquebrável. Na mesma coluna da factura, e
   * entre o PDF da proposta e o email que o transporta.
   *
   * O 999 está aqui para a regra não passar a ser «mete lá um ponto»: três
   * dígitos NÃO levam separador em português nenhum.
   *
   * ── E O ESPAÇO ANTES DO «€» ESCREVE-SE \u00A0, NÃO À LETRA ─────────────
   * É um espaço INQUEBRÁVEL, e num ficheiro de texto é indistinguível de um
   * espaço normal a olho nu. Escrito à letra, uma expectativa com o espaço
   * errado passava a documentar exactamente o contrário do que se quer.
   */
  const EURO = "\u00A0€";

  it("agrupa os milhares com PONTO a partir de quatro dígitos", () => {
    expect(eurDocumento(4600)).toBe(`4.600,00${EURO}`);
    expect(eurDocumento(24600)).toBe(`24.600,00${EURO}`);
    expect(eurDocumento(7890)).toBe(`7.890,00${EURO}`);
    expect(eurDocumento(1234567)).toBe(`1.234.567,00${EURO}`);
  });

  it("três dígitos não levam separador", () => {
    expect(eurDocumento(999)).toBe(`999,00${EURO}`);
  });

  it("os cêntimos ficam com a vírgula do português", () => {
    expect(eurDocumento(1234.56)).toBe(`1.234,56${EURO}`);
    expect(eurDocumento(24600.75)).toBe(`24.600,75${EURO}`);
  });

  /**
   * O ESPAÇO ANTES DO «€» É INQUEBRÁVEL, E TEM DE CONTINUAR A SER.
   *
   * É o que impede o símbolo de cair sozinho para a linha seguinte num email
   * estreito. Só o separador de MILHARES vira ponto; o do símbolo fica.
   */
  it("mantém o espaço inquebrável antes do símbolo e não põe pontos a mais", () => {
    expect(eurDocumento(24600)).toContain(EURO);
    // Um espaço NORMAL antes do «€» seria o mesmo defeito ao contrário.
    expect(eurDocumento(24600)).not.toContain(" €");
    expect(eurDocumento(24600).match(/\./g)).toHaveLength(1);
    expect(eurDocumento(999)).not.toContain(".");
    // E não pode sobrar espaço inquebrável nenhum onde já está o ponto.
    expect(eurDocumento(1234567).match(/\u00A0/g)).toHaveLength(1);
  });

  it("coage o que não é número a zero, como o `eur`", () => {
    expect(eurDocumento(NaN)).toBe(`0,00${EURO}`);
    expect(eurDocumento(0)).toBe(`0,00${EURO}`);
  });

  /**
   * Só caracteres que as fontes-PADRÃO do pdf-lib sabem codificar.
   *
   * A factura e a proposta antiga desenham-se em Helvetica/WinAnsi, e o
   * `drawText` LANÇA no que essa codificação não tem. O ponto é ASCII, o
   * espaço inquebrável é 0xA0 (Latin-1) e o «€» é 0x80 no CP1252 — os três
   * passam. Um separador «bonito» (U+2009, U+202F) rebentava o PDF.
   */
  it("escreve-se todo em WinAnsi — o PDF da factura desenha-o sem lançar", () => {
    for (const n of [4600, 24600, 7890, 999, 1234567, 1234.56]) {
      expect(winAnsiSafe(eurDocumento(n))).toBe(eurDocumento(n));
    }
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * O VALOR QUE NÃO É NOSSO — o «Valor Total» que ELA escreve à mão
 * ══════════════════════════════════════════════════════════════════════════
 *
 * O quadro do orçamento tem duas origens de dinheiro na mesma folha: as linhas
 * que NÓS calculamos (e formatamos com o `eurDocumento`) e o «Valor Total», que
 * é TEXTO — escrito à mão por ela, ou gerado pelo estúdio a partir do preço do
 * pedido, e guardado tal e qual no documento.
 *
 * Esse texto não passa por formatador nenhum na altura de desenhar: passa pelo
 * `milharesComPonto`, que só sabia trocar o espaço inquebrável do `Intl` pelo
 * ponto. Ora o `Intl` NÃO PÕE espaço nenhum abaixo de cinco dígitos — logo um
 * total de 7 890 € gravado como «7890,00 €» chegava ao PDF exactamente assim,
 * por cima de linhas que diziam «7.890,00 €». O mesmo quadro, duas pontuações.
 *
 * Corrige-se AQUI, no desenho, e não em quem grava: as propostas já guardadas
 * têm o texto antigo lá dentro, e um casal que reabra a sua proposta de janeiro
 * tem de a ver bem escrita sem que ninguém volte a gravá-la.
 *
 * O reconhecimento é pelo «€», e é isso que o torna seguro: um ano, um número
 * de telefone ou uma referência de documento não têm um símbolo de euro colado
 * a seguir. O que não parece dinheiro não é tocado.
 */
describe("milharesComPonto — o dinheiro que vem escrito à mão", () => {
  const EURO = "\u00A0€";

  it("põe ponto num montante escrito sem separador nenhum", () => {
    expect(milharesComPonto(`7890,00${EURO}`)).toBe(`7.890,00${EURO}`);
    expect(milharesComPonto(`4600,00${EURO}`)).toBe(`4.600,00${EURO}`);
    expect(milharesComPonto(`1234567,00${EURO}`)).toBe(`1.234.567,00${EURO}`);
  });

  it("continua a trocar o espaço inquebrável do Intl pelo ponto", () => {
    expect(milharesComPonto(`24\u00A0600,00${EURO}`)).toBe(`24.600,00${EURO}`);
    expect(milharesComPonto(`1\u00A0234\u00A0567,00${EURO}`)).toBe(`1.234.567,00${EURO}`);
  });

  it("não mexe no que já está bem escrito", () => {
    expect(milharesComPonto(`12.300,00${EURO}`)).toBe(`12.300,00${EURO}`);
    expect(milharesComPonto(`999,00${EURO}`)).toBe(`999,00${EURO}`);
    expect(milharesComPonto(`0,00${EURO}`)).toBe(`0,00${EURO}`);
  });

  it("respeita o resto da frase dela — o «+ IVA», o espaço normal, o sem cêntimos", () => {
    expect(milharesComPonto("8456,25 € + IVA")).toBe("8.456,25 € + IVA");
    expect(milharesComPonto("2500 €")).toBe("2.500 €");
    expect(milharesComPonto("a definir")).toBe("a definir");
    expect(milharesComPonto("Sob consulta")).toBe("Sob consulta");
  });

  /**
   * O QUE NÃO TEM «€» AO LADO NÃO É DINHEIRO.
   *
   * Sem esta âncora, a regra «quatro dígitos seguidos levam ponto» estragava
   * anos («2026» → «2.026»), números de documento e contagens de convidados —
   * e o `milharesComPonto` corre sobre TEXTO DELA, não sobre um número nosso.
   */
  it("não toca em números que não são dinheiro", () => {
    expect(milharesComPonto("Válido até 2026")).toBe("Válido até 2026");
    expect(milharesComPonto("FT 2026/0007")).toBe("FT 2026/0007");
    expect(milharesComPonto("1500 convidados")).toBe("1500 convidados");
    expect(milharesComPonto("+351 919 259 820")).toBe("+351 919 259 820");
  });
});
describe("sinal com percentagem configurável", () => {
  /**
   * A GENERALIZAÇÃO NÃO PODE MUDAR O QUE JÁ ESTÁ FACTURADO.
   *
   * Todas as propostas existentes são 30/70. Se `splitSinal(total, 30)` desse
   * um cêntimo diferente de `splitThirtySeventy(total)`, uma reemissão de
   * saldo passava a fechar noutro número — e isso é uma correcção fiscal, não
   * uma melhoria de interface.
   */
  it("com 30% dá exactamente o mesmo que dava antes", () => {
    for (const total of [0, 0.01, 1000, 1000.01, 6875, 8456.25, 12500.33]) {
      expect(splitSinal(total, 30)).toEqual(splitThirtySeventy(total));
    }
  });

  it("as duas parcelas fecham sempre o total", () => {
    for (const total of [6875, 3333.33, 1000.01, 0.05, 99999.99]) {
      for (const pct of [10, 30, 40, 50, 70, 99]) {
        const { sinal, saldo } = splitSinal(total, pct);
        expect(round2(sinal + saldo)).toBe(round2(Math.max(0, total)));
      }
    }
  });

  it("uma percentagem impossível fica dentro dos limites", () => {
    expect(splitSinal(1000, 150).sinal).toBe(1000);
    expect(splitSinal(1000, -20).sinal).toBe(0);
  });

  describe("saldoAPartirDoSinal", () => {
    it("com 30% é o mesmo que o `sinal / 3 × 7` que estava escrito à mão", () => {
      for (const sinal of [300, 2062.5, 1500, 0]) {
        expect(saldoAPartirDoSinal(sinal, 30)).toBe(round2((sinal / 3) * 7));
      }
    });

    it("acompanha a percentagem", () => {
      // 40% de 10.000 são 4.000; o saldo tem de ser 6.000.
      expect(saldoAPartirDoSinal(4000, 40)).toBe(6000);
      expect(saldoAPartirDoSinal(5000, 50)).toBe(5000);
    });

    it("uma percentagem de zero não faz uma divisão por zero", () => {
      // Não devia acontecer (o esquema limita), mas um Infinity numa factura
      // seria muito pior do que um número grande.
      expect(Number.isFinite(saldoAPartirDoSinal(1000, 0))).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
/**
 * O DINHEIRO NA FOLHA INGLESA — «4.600,00 €» → «€4,600.00»
 *
 * A decisão é da dona da casa: numa proposta inglesa o valor escreve-se à
 * inglesa, com o símbolo à frente. O que torna isto delicado não é o formato —
 * é que METADE do dinheiro desta folha é texto escrito por ela («Valor Total»,
 * os adicionais, o preço estimado do modelo de Organização) e a outra metade
 * são contas nossas. Converter só as contas dava «€4,600.00» e «4.600,00 €» na
 * mesma coluna do mesmo quadro, que é pior do que não converter nada.
 *
 * Por isso a conversão trabalha sobre TEXTO JÁ ESCRITO, e reconhece um
 * montante pelo símbolo de moeda colado a ele — a mesma regra de segurança do
 * `milharesComPonto`: um ano, um número de documento ou uma contagem de
 * convidados não têm um «€» atrás, e não são tocados.
 */
describe("os montantes na folha inglesa", () => {
  it("põe o símbolo à frente e troca a pontuação", () => {
    expect(montantesEmIngles("4.600,00 €")).toBe("€4,600.00");
    expect(montantesEmIngles("150,00 €")).toBe("€150.00");
    expect(montantesEmIngles("24.600,00 €")).toBe("€24,600.00");
  });

  it("agrupa os milhares que o português não agrupou", () => {
    // O `Intl` de pt-PT não põe separador abaixo de cinco dígitos: um total nos
    // milhares baixos chega aqui como «4600,00 €».
    expect(montantesEmIngles("4600,00 €")).toBe("€4,600.00");
    expect(montantesEmIngles("999,00 €")).toBe("€999.00");
    expect(montantesEmIngles("1234567,89 €")).toBe("€1,234,567.89");
  });

  it("o espaço inquebrável que o Intl mete nos milhares também conta", () => {
    expect(montantesEmIngles("24 600,00 €")).toBe("€24,600.00");
  });

  it("um montante sem cêntimos fica com os cêntimos que uma folha de dinheiro tem", () => {
    expect(montantesEmIngles("2500 €")).toBe("€2,500.00");
  });

  it("o menos fica antes do símbolo, como em inglês", () => {
    expect(montantesEmIngles("-150,00 €")).toBe("-€150.00");
  });

  it("converte todos os montantes de uma frase, não só o primeiro", () => {
    expect(montantesEmIngles("Travel (150,00 €) and styling (1.200,00 €)")).toBe(
      "Travel (€150.00) and styling (€1,200.00)",
    );
  });

  it("a vírgula decimal de uma percentagem passa a ponto", () => {
    // «VAT (23,5%)» numa folha inglesa é a vírgula portuguesa a aparecer onde
    // um leitor inglês lê um separador de milhares.
    expect(montantesEmIngles("VAT (23,5%)")).toBe("VAT (23.5%)");
    expect(montantesEmIngles("VAT (23%)")).toBe("VAT (23%)");
  });

  it("o que NÃO é dinheiro não é tocado", () => {
    // Sem símbolo de moeda colado, não há conversão: é isto que impede um ano,
    // uma referência ou uma contagem de mudarem de forma.
    for (const intacto of [
      "LIQ-2026-0007",
      "150 guests",
      "11 October 2026",
      "4.600",
      "Quinta do Lago",
      "—",
      "",
    ]) {
      expect(montantesEmIngles(intacto)).toBe(intacto);
    }
  });

  it("outra moeda mantém o seu símbolo, à frente na mesma", () => {
    // Uma proposta antiga podia estar gravada noutra moeda (`Proposal.currency`).
    expect(montantesEmIngles("1.200,00 $")).toBe("$1,200.00");
  });

  it("em português não se toca em nada", () => {
    expect(montanteNaLingua("4.600,00 €", "pt")).toBe("4.600,00 €");
    expect(montanteNaLingua("4.600,00 €", "en")).toBe("€4,600.00");
  });

  it("passar duas vezes pela conversão dá o mesmo", () => {
    // O desenho do PDF passa por aqui em sítios encadeados; converter um valor
    // já convertido não o pode estragar.
    const uma = montantesEmIngles("4.600,00 €");
    expect(montantesEmIngles(uma)).toBe(uma);
  });
});
