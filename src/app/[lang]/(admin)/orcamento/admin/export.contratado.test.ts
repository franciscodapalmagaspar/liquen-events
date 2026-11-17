// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { printEventDossier, printRunSheet } from "./export";
import { dateStamp } from "./exportar-em-csv";
import { eur0 } from "@/lib/money";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O VALOR CONTRATADO NÃO PODE VIR ORA COM IVA ORA SEM ELE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O guião do dia e o dossier liam `quotedPrice ?? priceBreakdown.total`. Os
 * dois campos existem, os dois são "o valor do evento" — e não estão na mesma
 * unidade: o `quotedPrice` é o campo "Preço final (sem IVA)" do ecrã e o
 * `priceBreakdown.total` já traz IVA. O papel que se imprime e se dá à equipa
 * punha os dois debaixo do mesmo rótulo, ao lado de pagamentos que são sempre
 * com IVA.
 *
 * Num casamento fechado por 20.000 € + IVA, o dossier dizia "Valor contratado
 * 20.000 €" e "Por receber" contava parcelas de 24.600 € — 4.600 € que
 * pareciam não ter de onde vir. Um evento sem preço manual, com a mesma folha,
 * mostrava o bruto. A cascata canónica é `contractedAmounts`, que decompõe as
 * três parcelas a partir da mesma fonte.
 */

/** Janela de impressão falsa: guarda o HTML que lá foi escrito. */
function janelaFalsa() {
  const pedacos: string[] = [];
  const win = {
    document: {
      write: (s: string) => pedacos.push(s),
      close: () => {},
    },
  } as unknown as Window;
  vi.spyOn(window, "open").mockReturnValue(win);
  return { html: () => pedacos.join("") };
}

const IVA23 = {
  basePrice: 0,
  guestCost: 0,
  packageMultiplier: 1,
  locationSurcharge: 0,
  weekendSurcharge: 0,
  seasonSurcharge: 0,
  urgencySurcharge: 0,
  addonsCost: 0,
  subtotal: 10_000,
  iva: 2_300,
  total: 12_300,
  rangeMin: 0,
  rangeMax: 0,
  isEstimate: false,
};

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "LIQ-1",
    name: "Ana Ribeiro",
    email: "ana@exemplo.pt",
    phone: "910000000",
    company: "",
    guests: 80,
    status: "aceite",
    submittedAt: "2026-01-10T10:00:00.000Z",
    date: "2026-08-20",
    priceBreakdown: IVA23,
    ...over,
  }) as unknown as Quote;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.TZ;
});

describe("printRunSheet — o contratado é o mesmo dinheiro que os pagamentos", () => {
  it("um preço manual (sem IVA) é mostrado com IVA, como as parcelas ao lado", () => {
    const j = janelaFalsa();
    // 20.000 € de base a 23% = 24.600 € a receber, que é o que as duas
    // parcelas de pagamento somam.
    printRunSheet(
      pedido({
        quotedPrice: 20_000,
        payments: [
          { id: "p1", kind: "sinal", amount: 7_380, paid: true },
          { id: "p2", kind: "saldo", amount: 17_220, paid: false },
        ],
      } as Partial<Quote>),
    );

    const html = j.html();
    expect(html).toContain(eur0(24_600));
    expect(html).not.toContain(eur0(20_000));
  });

  it("sem preço manual, a estimativa (já com IVA) fica intacta", () => {
    const j = janelaFalsa();
    printRunSheet(pedido());

    expect(j.html()).toContain(eur0(12_300));
  });

  it("o rótulo diz em que base está o número", () => {
    const j = janelaFalsa();
    printRunSheet(pedido({ quotedPrice: 20_000 } as Partial<Quote>));

    expect(j.html()).toContain("Contratado (c/ IVA)");
  });
});

describe("printEventDossier — contratado e margem em bases declaradas", () => {
  it("o valor contratado de um preço manual leva IVA", () => {
    const j = janelaFalsa();
    printEventDossier(pedido({ quotedPrice: 20_000 } as Partial<Quote>));

    const html = j.html();
    expect(html).toContain("Valor contratado (c/ IVA)");
    expect(html).toContain(eur0(24_600));
  });

  it("a margem compara líquido com líquido, como o resto do cockpit", () => {
    const j = janelaFalsa();
    // 20.000 € líquidos de receita contra 12.300 € de custos COM IVA
    // (10.000 € líquidos): a margem verdadeira são 10.000 €.
    printEventDossier(
      pedido({
        quotedPrice: 20_000,
        eventSuppliers: [
          {
            id: "f1",
            name: "Floristas",
            category: "Flores",
            estimatedCost: 12_300,
            status: "confirmado",
          },
        ],
      } as Partial<Quote>),
    );

    const html = j.html();
    expect(html).toContain("Margem estimada (s/ IVA)");
    expect(html).toContain(eur0(10_000));
    // Nem o líquido-contra-bruto de antes (7.700 €) nem o bruto-contra-bruto
    // (12.300 €, que seria a margem inflacionada em 23%).
    expect(html).not.toContain(eur0(7_700));
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DIA NO NOME DO FICHEIRO É O DIA DE QUEM CARREGA NO BOTÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `toISOString()` é UTC. Em Portugal, no Verão (UTC+1), quem exporta à meia-
 * noite e um quarto leva para casa um `clientes-2026-08-12.csv` gerado no dia
 * 13 — e no dia seguinte tem dois ficheiros com a mesma data e conteúdos
 * diferentes. A conta faz-se no calendário local, como o `todayKey` do painel.
 */
describe("dateStamp — o carimbo é o dia civil local", () => {
  it("depois da meia-noite de Verão em Lisboa carimba o dia novo", () => {
    process.env.TZ = "Europe/Lisbon";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T23:15:00.000Z")); // 13/08, 00:15 local

    expect(dateStamp()).toBe("2026-08-13");
  });

  it("a meio do dia continua a dar o mesmo que o UTC", () => {
    process.env.TZ = "Europe/Lisbon";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));

    expect(dateStamp()).toBe("2026-08-13");
  });
});
