import { describe, it, expect } from "vitest";
import {
  contractedAmounts,
  effectiveVatRate,
  computeEventMetrics,
  deriveStage,
  type DossierData,
} from "./dossier";
import type { Quote, Payment, Proposal } from "./types";

/**
 * The contracted value the client actually pays is GROSS (com IVA), while the
 * "Preço final (sem IVA)" field (`quotedPrice`) is NET. Payments are
 * gross, so "em falta" must compare gross with gross. These tests pin the
 * net/IVA/gross decomposition and the effective-rate derivation.
 *
 * O `metrics.contracted` deixou de ser a exceção: era o último sítio a devolver
 * o `quotedPrice` líquido em cru e a confrontá-lo com dinheiro que traz IVA. Hoje
 * as três fontes do total contratado saem na mesma unidade — ver o bloco final,
 * com o caso real e os números.
 */

function makeQuote(over: Partial<Quote> = {}): Quote {
  return {
    id: "q1",
    submittedAt: "2026-01-01T10:00:00Z",
    status: "aceite",
    category: "particulares",
    eventType: "casamentos",
    eventName: "Evento teste",
    date: "2026-09-12",
    endDate: "",
    location: "Lisboa",
    locationType: "lisboa",
    guests: 80,
    duration: 6,
    isMultiDay: false,
    packageTier: "completo",
    addons: [],
    budgetRange: "15k_30k",
    urgency: "standard",
    notes: "",
    referralSource: "",
    name: "Ana Cliente",
    email: "ana@example.com",
    phone: "912345678",
    company: "",
    nif: "",
    acceptTerms: true,
    acceptMarketing: false,
    priceBreakdown: {
      basePrice: 0,
      guestCost: 0,
      packageMultiplier: 1,
      locationSurcharge: 0,
      weekendSurcharge: 0,
      seasonSurcharge: 0,
      urgencySurcharge: 0,
      addonsCost: 0,
      subtotal: 10000,
      iva: 2300,
      total: 12300,
      rangeMin: 12000,
      rangeMax: 13000,
      isEstimate: false,
    },
    ...over,
  };
}

describe("effectiveVatRate", () => {
  it("derives the rate from the breakdown (iva / subtotal)", () => {
    expect(effectiveVatRate(makeQuote())).toBeCloseTo(0.23, 10);
  });
  it("falls back to 23% when there is no usable breakdown", () => {
    expect(effectiveVatRate(makeQuote({ priceBreakdown: undefined as never }))).toBe(0.23);
  });
});

describe("contractedAmounts", () => {
  it("treats quotedPrice as NET and derives the gross the client pays", () => {
    const q = makeQuote({ quotedPrice: 5000, priceBreakdown: undefined as never });
    const a = contractedAmounts(q);
    expect(a.net).toBe(5000);
    expect(a.gross).toBe(6150); // 5000 * 1.23
    expect(a.iva).toBe(1150);
    expect(a.net + a.iva).toBe(a.gross);
  });

  it("uses the breakdown's own rate for a manual price when present", () => {
    // subtotal 20000 / iva 1200 → 6% effective rate.
    const q = makeQuote({
      quotedPrice: 1000,
      priceBreakdown: { ...makeQuote().priceBreakdown, subtotal: 20000, iva: 1200, total: 21200 },
    });
    const a = contractedAmounts(q);
    expect(a.net).toBe(1000);
    expect(a.gross).toBe(1060); // 1000 * 1.06
  });

  it("reads the three parcels straight from a proposal (already gross-aware)", () => {
    const q = makeQuote({ quotedPrice: 5000 });
    const proposal = { total: 9840, subtotal: 8000, vat: 1840, vatRate: 0.23 } as never;
    const a = contractedAmounts(q, proposal);
    expect(a).toEqual({ net: 8000, iva: 1840, gross: 9840 });
  });

  it("falls back to the priceBreakdown when there is no quotedPrice/proposal", () => {
    const a = contractedAmounts(makeQuote({ quotedPrice: undefined }));
    expect(a).toEqual({ net: 10000, iva: 2300, gross: 12300 });
  });

  it("is all-zero for an empty event (no NaN)", () => {
    const a = contractedAmounts(
      makeQuote({ quotedPrice: undefined, priceBreakdown: undefined as never }),
    );
    expect(a).toEqual({ net: 0, iva: 0, gross: 0 });
    for (const v of [a.net, a.iva, a.gross]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("computeEventMetrics — additive gross fields", () => {
  it("expõe a decomposição com IVA e `contracted` na MESMA base (com IVA)", () => {
    const d: DossierData = {
      quote: makeQuote({ quotedPrice: 5000, priceBreakdown: undefined as never }),
      proposal: null,
      contract: null,
    };
    const m = computeEventMetrics(d, new Date("2026-07-18T09:00:00Z"));
    // `contracted` deixou de ser o `quotedPrice` em bruto (sem IVA): era a única
    // métrica que continuava a comparar-se com pagamentos com IVA. Hoje é
    // o valor que o cliente paga — o mesmo que `contractedGross`.
    expect(m.contracted).toBe(6150);
    expect(m.contracted).toBe(m.contractedGross);
    expect(m.contractedNet).toBe(5000);
    expect(m.contractedGross).toBe(6150);
    expect(m.contractedIva).toBe(1150);
  });
});

/**
 * O CASO REAL, com números: casamento fechado por 20 000 € + IVA — os noivos
 * pagam 24 600 €. O mesmo casamento pode ter o total contratado gravado em
 * qualquer um dos TRÊS sítios que o `contractedTotal` consulta (proposta >
 * preço cotado > estimativa), consoante o caminho por onde o negócio passou:
 *
 *   • proposta  → `proposal.total` = 24 600 € (BRUTO, de propósito: é dele que
 *                 sai o sinal de 30%);
 *   • preço cotado → `quote.quotedPrice` = 20 000 € (LÍQUIDO — o campo chama-se
 *                 "Preço final (sem IVA)" no ecrã);
 *   • estimativa → `priceBreakdown.total` = 24 600 € (BRUTO).
 *
 * Os três descrevem o MESMO dinheiro, mas o ramo do meio vinha ~23% abaixo. Como
 * o total contratado é comparado com os pagamentos (sempre com IVA), o
 * limiar de "está pago" caía para os 20 000 € líquidos: bastavam 20 000 € para o
 * casamento aparecer concluído com 4 600 € por receber.
 */
describe("contractedTotal — os três ramos na MESMA unidade (com IVA)", () => {
  // Evento a 12/09/2026 (data por omissão da `makeQuote`), já passado.
  const DEPOIS_DO_EVENTO = new Date("2026-10-01T09:00:00Z");
  const LIQUIDO = 20000;
  const BRUTO = 24600; // 20 000 × 1,23

  const proposta: Proposal = {
    id: "p1",
    quoteId: "q1",
    clientName: "Ana Cliente",
    clientEmail: "ana@example.com",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: LIQUIDO,
    vat: 4600,
    total: BRUTO,
    status: "aceite",
    createdAt: "2026-02-01T10:00:00Z",
    sentAt: "2026-02-01T10:00:00Z",
  };

  type Fonte = "proposta" | "preco_cotado" | "estimativa";

  /** O mesmo casamento, com o total contratado a chegar por cada uma das fontes. */
  function casamento(fonte: Fonte, payments: Payment[] = []): DossierData {
    const base = makeQuote({ status: "aceite", payments });
    if (fonte === "proposta") {
      // A rota da proposta grava o `quotedPrice` LÍQUIDO ao lado da proposta.
      return {
        quote: { ...base, quotedPrice: LIQUIDO },
        proposal: proposta,
        contract: null,
      };
    }
    if (fonte === "preco_cotado") {
      return {
        quote: { ...base, quotedPrice: LIQUIDO },
        proposal: null,
        contract: null,
      };
    }
    return {
      quote: {
        ...base,
        quotedPrice: undefined,
        priceBreakdown: { ...base.priceBreakdown, subtotal: LIQUIDO, iva: 4600, total: BRUTO },
      },
      proposal: null,
      contract: null,
    };
  }

  const FONTES: Fonte[] = ["proposta", "preco_cotado", "estimativa"];

  /** Dinheiro registado à mão (com IVA, como todos os pagamentos). */
  function pago(kind: Payment["kind"], amount: number, id = `pay-${kind}`): Payment {
    return { id, kind, amount, date: "2026-08-20", paid: true };
  }

  it.each(FONTES)("fonte %s: o total contratado é o valor COM IVA (24 600 €)", (fonte) => {
    const m = computeEventMetrics(casamento(fonte), DEPOIS_DO_EVENTO);
    expect(m.contracted).toBe(BRUTO);
    expect(m.contracted).toBe(m.contractedGross);
    expect(m.contractedNet).toBe(LIQUIDO);
  });

  it.each(FONTES)(
    "fonte %s: pagos 20 000 € (o valor SEM IVA), faltam 4 600 € → NÃO está concluído",
    (fonte) => {
      // Sinal + transferência avulsa somam os 20 000 € líquidos. Nenhuma linha é
      // rotulada "saldo", por isso a fase só pode vir da regra de cobertura
      // (contratado coberto) — exatamente onde o desalinhamento de unidades doía.
      const d = casamento(fonte, [pago("sinal", 7380), pago("pagamento", 12620, "pay-2")]);
      expect(deriveStage(d, DEPOIS_DO_EVENTO)).not.toBe("concluido");
      expect(deriveStage(d, DEPOIS_DO_EVENTO)).toBe("em_producao");
    },
  );

  it.each(FONTES)("fonte %s: pagos os 24 600 € → concluído", (fonte) => {
    const d = casamento(fonte, [pago("sinal", 7380), pago("pagamento", 17220, "pay-2")]);
    expect(deriveStage(d, DEPOIS_DO_EVENTO)).toBe("concluido");
  });

  it("a percentagem recebida compara com IVA dos dois lados (nunca 123%)", () => {
    const d = casamento("preco_cotado", [pago("pagamento", BRUTO)]);
    const m = computeEventMetrics(d, DEPOIS_DO_EVENTO);
    expect(m.paid).toBe(BRUTO);
    expect(m.pctPaid).toBe(1); // antes: 24 600 / 20 000 = 1,23
  });

  it("a margem confronta receita e custos ambos SEM IVA", () => {
    /**
     * ════════════════════════════════════════════════════════════════════════
     * DUAS UNIDADES IGUAIS NÃO SÃO A UNIDADE CERTA
     * ════════════════════════════════════════════════════════════════════════
     *
     * Este teste dizia 6.600 €, que é `24.600 − 18.000`: receita bruta menos
     * custos brutos. As duas parcelas estavam na mesma unidade — o que parece
     * bastar, e não basta. O IVA não é receita nem é custo: entra do cliente e
     * sai para o Estado, e o IVA suportado nos fornecedores é dedutível. A
     * diferença entre dois brutos é a margem verdadeira multiplicada por 1,23.
     *
     * Os números deste casamento: 20.000 € de base, 24.600 € facturados,
     * 18.000 € de custo com IVA (14.634,15 € de custo real). A margem são
     * 5.365,85 € e não 6.600 €. Os 1.234,15 € de diferença são IVA que passa
     * pela conta da Líquen e não fica lá — e era com eles em cima da mesa que
     * se decidia se valia a pena baixar um preço.
     *
     * É também o número que o painel de custos do evento (EventCosts) já
     * mostrava: os dois ecrãs diziam margens diferentes sobre o mesmo
     * casamento, e o quadro de rentabilidade era o que estava errado.
     */
    const d = casamento("preco_cotado");
    d.quote = {
      ...d.quote,
      eventSuppliers: [
        { id: "s1", name: "Catering", category: "Catering", estimatedCost: 18000, status: "pago" },
      ],
    };
    const m = computeEventMetrics(d, DEPOIS_DO_EVENTO);
    // O custo continua a ser mostrado como foi registado — com IVA.
    expect(m.supplierCosts).toBe(18000);
    expect(m.supplierCostsNet).toBe(14634.15);
    expect(m.margin).toBe(5365.85);
    // E a margem fecha com as duas parcelas líquidas, ao cêntimo.
    expect(m.contractedNet - m.supplierCostsNet).toBeCloseTo(m.margin, 10);
  });
});
