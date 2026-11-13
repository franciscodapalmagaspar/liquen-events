import { describe, it, expect } from "vitest";
import {
  deriveStage,
  computeEventMetrics,
  paidTotal,
  nextAction,
  countdownDays,
  type DossierData,
  type EventStage,
} from "./dossier";
import type { Quote, Proposal, Payment, EventSupplier, Guest } from "./types";

/**
 * O modelo de domínio do Dossier é puro, por isso ganha cobertura exaustiva: a
 * máquina de estados `deriveStage` (toda a tabela, lead → concluído + perdido)
 * e as métricas com IVA, que assentam todas no registo de pagamentos.
 * Todos os testes injectam um `today` fixo — nunca dependem do relógio real.
 */

// "Hoje" fixo para todos os testes de contagem/fase.
const TODAY = new Date("2026-07-18T09:00:00Z");

/** Quote mínima válida; os testes sobrepõem só os campos relevantes. */
function makeQuote(over: Partial<Quote> = {}): Quote {
  return {
    id: "q1",
    submittedAt: "2026-01-01T10:00:00Z",
    status: "pendente",
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

function makeProposal(over: Partial<Proposal> = {}): Proposal {
  return {
    id: "p1",
    quoteId: "q1",
    clientName: "Ana Cliente",
    clientEmail: "ana@example.com",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 16260,
    vat: 3740,
    total: 20000,
    status: "enviada",
    createdAt: "2026-02-01T10:00:00Z",
    sentAt: "2026-02-01T10:00:00Z",
    ...over,
  };
}

/** Linha de pagamento RECEBIDA; os testes sobrepõem só o que importa. */
function pago(over: Partial<Payment> = {}): Payment {
  return {
    id: "pay1",
    kind: "sinal",
    amount: 6000,
    date: "2026-02-10",
    paid: true,
    ...over,
  };
}

function data(over: Partial<DossierData> = {}): DossierData {
  return {
    quote: makeQuote(),
    proposal: null,
    contract: null,
    ...over,
  };
}

describe("countdownDays", () => {
  it("is 0 on the event day, positive before, negative after, null when no date", () => {
    expect(countdownDays("2026-07-18", TODAY)).toBe(0);
    expect(countdownDays("2026-07-25", TODAY)).toBe(7);
    expect(countdownDays("2026-07-10", TODAY)).toBe(-8);
    expect(countdownDays(undefined, TODAY)).toBeNull();
    expect(countdownDays("lixo", TODAY)).toBeNull();
  });
});

describe("deriveStage", () => {
  const paidSinalPayment: Payment = {
    id: "pay1",
    kind: "sinal",
    amount: 6000,
    date: "2026-02-10",
    paid: true,
  };

  it("lead: fresh quote, no proposal", () => {
    expect(deriveStage(data(), TODAY)).toBe<EventStage>("lead");
  });

  it("proposta_enviada: proposal sent (not draft)", () => {
    expect(deriveStage(data({ proposal: makeProposal({ status: "enviada" }) }), TODAY)).toBe(
      "proposta_enviada",
    );
  });

  it("proposta_enviada: quote marked cotado even without a proposal row", () => {
    expect(deriveStage(data({ quote: makeQuote({ status: "cotado" }) }), TODAY)).toBe(
      "proposta_enviada",
    );
  });

  it("aceite: proposal accepted, no sinal yet", () => {
    expect(deriveStage(data({ proposal: makeProposal({ status: "aceite" }) }), TODAY)).toBe(
      "aceite",
    );
  });

  it("aceite: contract acceptedAt set counts as accepted", () => {
    const d = data({
      proposal: makeProposal({ status: "enviada" }),
      contract: { status: "aceite", acceptedAt: "2026-03-01T12:00:00Z" },
    });
    expect(deriveStage(d, TODAY)).toBe("aceite");
  });

  it("sinal_pago: informal sinal payment paid, but not accepted", () => {
    const d = data({ quote: makeQuote({ payments: [paidSinalPayment] }) });
    expect(deriveStage(d, TODAY)).toBe("sinal_pago");
  });

  it("em_producao: accepted AND sinal paid", () => {
    const d = data({
      quote: makeQuote({ payments: [pago({ kind: "sinal" })] }),
      proposal: makeProposal({ status: "aceite" }),
    });
    expect(deriveStage(d, TODAY)).toBe("em_producao");
  });

  it("semana_evento: accepted, event within 7 days, not passed", () => {
    const d = data({
      quote: makeQuote({ date: "2026-07-22", payments: [paidSinalPayment] }),
      proposal: makeProposal({ status: "aceite" }),
    });
    expect(deriveStage(d, TODAY)).toBe("semana_evento");
  });

  it("concluido: event passed AND saldo paid", () => {
    const d = data({
      quote: makeQuote({
        date: "2026-07-01",
        payments: [pago(), pago({ id: "pay2", kind: "saldo", amount: 14000 })],
      }),
      proposal: makeProposal({ status: "aceite", total: 20000 }),
    });
    expect(deriveStage(d, TODAY)).toBe("concluido");
  });

  it("concluido: event passed even when the date carries a time component", () => {
    // `quote.date` normally is "yyyy-mm-dd", but the manual/import routes don't
    // forbid a full ISO datetime. End-of-day semantics must still apply so a past
    // event reaches concluido (regression: `${date}T23:59:59` on a datetime → NaN
    // → eventPassed=false → stuck one stage back).
    const d = data({
      quote: makeQuote({
        date: "2026-07-01T18:30:00Z",
        payments: [pago(), pago({ id: "pay2", kind: "saldo", amount: 14000 })],
      }),
      proposal: makeProposal({ status: "aceite", total: 20000 }),
    });
    expect(deriveStage(d, TODAY)).toBe("concluido");
  });

  it("concluido: rede de segurança — contratado coberto sem nenhuma linha «saldo»", () => {
    // Ninguém rotulou a última parcela como saldo: são duas linhas «pagamento».
    // O evento passou e o contratado está inteiro na mão — tem de fechar, senão
    // o casamento fica preso em `em_producao` e acumula no quadro para sempre.
    const d = data({
      quote: makeQuote({
        date: "2026-07-01",
        payments: [
          pago({ kind: "pagamento", amount: 6000 }),
          pago({ id: "pay2", kind: "pagamento", amount: 14000 }),
        ],
      }),
      proposal: makeProposal({ status: "aceite", total: 20000 }),
    });
    expect(deriveStage(d, TODAY)).toBe("concluido");
  });

  it("perdido: quote rejeitado wins over everything", () => {
    const d = data({
      quote: makeQuote({ status: "rejeitado", payments: [paidSinalPayment] }),
      proposal: makeProposal({ status: "aceite" }),
    });
    expect(deriveStage(d, TODAY)).toBe("perdido");
  });

  it("perdido: proposal rejeitada", () => {
    expect(deriveStage(data({ proposal: makeProposal({ status: "rejeitada" }) }), TODAY)).toBe(
      "perdido",
    );
  });

  it("event passed but saldo NOT paid does not reach concluido", () => {
    const d = data({
      quote: makeQuote({ date: "2026-07-01", payments: [paidSinalPayment] }),
      proposal: makeProposal({ status: "aceite" }),
    });
    // Accepted + sinal paid, event passed but unpaid saldo → still em_producao.
    expect(deriveStage(d, TODAY)).toBe("em_producao");
  });

  it("accepted + sinal paid but no event date → em_producao (dateless quote)", () => {
    // Sem `quote.date`: eventPassed=false e countdownDays=null, por isso a semana
    // do evento nunca dispara e a fase assenta em em_producao.
    const d = data({
      quote: makeQuote({ date: "", payments: [pago({ kind: "sinal" })] }),
      proposal: makeProposal({ status: "aceite" }),
    });
    expect(deriveStage(d, TODAY)).toBe("em_producao");
  });

  it("day-of afternoon stays 'today' (semana_evento), NOT concluido", () => {
    // Tarde do próprio dia do evento: o contador ainda diz 0, por isso o evento
    // NÃO passou. Âncora a meio-dia disparava concluido cedo demais; a de fim do
    // dia mantém-no na semana do evento até à meia-noite seguinte.
    const afternoon = new Date("2026-07-18T15:00:00Z");
    const d = data({
      quote: makeQuote({ date: "2026-07-18", payments: [pago({ kind: "saldo", amount: 14000 })] }),
      proposal: makeProposal({ status: "aceite", total: 20000 }),
    });
    expect(countdownDays("2026-07-18", afternoon)).toBe(0);
    expect(deriveStage(d, afternoon)).toBe("semana_evento");
  });
});

describe("computeEventMetrics", () => {
  const suppliers: EventSupplier[] = [
    {
      id: "s1",
      name: "Catering",
      category: "catering",
      estimatedCost: 4000,
      actualCost: 4200,
      status: "confirmado",
    },
    { id: "s2", name: "Flores", category: "decor", estimatedCost: 1500, status: "contactado" },
  ];
  const guests: Guest[] = [
    { id: "g1", name: "Família A", party: 4, rsvp: "confirmado" },
    { id: "g2", name: "Família B", party: 3, rsvp: "pendente" },
    { id: "g3", name: "Amigo C", party: 2, rsvp: "confirmado" },
  ];

  it("computes contracted, paid, margin, rsvp and countdown with IVA", () => {
    const d = data({
      quote: makeQuote({
        date: "2026-07-25",
        eventSuppliers: suppliers,
        guestList: guests,
        // Sinal recebido; saldo registado mas ainda POR receber — só o primeiro
        // conta para o «Recebido» e para a percentagem.
        payments: [
          pago({ kind: "sinal", amount: 6000 }),
          pago({ id: "pay2", kind: "saldo", amount: 14000, paid: false }),
        ],
      }),
      proposal: makeProposal({ total: 20000 }),
    });
    const m = computeEventMetrics(d, TODAY);
    expect(m.contracted).toBe(20000);
    expect(m.paid).toBe(6000);
    expect(m.pctPaid).toBeCloseTo(0.3, 5);
    expect(m.supplierCosts).toBe(4200 + 1500); // actualCost ?? estimatedCost
    // A margem corre em LÍQUIDO dos dois lados: a proposta de 20.000 € brutos
    // vale 16.260,16 € de base, e os 5.700 € de custo com IVA são 4.634,15 € de
    // custo real. O IVA entra do cliente e sai para o Estado — não é receita
    // nem é custo (ver a nota em `EventMetrics.margin`).
    expect(m.contractedNet).toBe(16260); // o `subtotal` que a proposta gravou
    expect(m.supplierCostsNet).toBe(4634.1);
    expect(m.margin).toBe(11625.9);
    expect(m.countdownDays).toBe(7);
    expect(m.rsvpConfirmed).toBe(6);
    expect(m.rsvpTotal).toBe(9);
  });

  it("treats a supplier with neither actual nor estimated cost as 0, and counts party-less/zero guests safely", () => {
    const d = data({
      quote: makeQuote({
        eventSuppliers: [
          {
            id: "s0",
            name: "Sem custo",
            category: "outro",
            estimatedCost: 0,
            status: "contactado",
          },
        ],
        guestList: [
          { id: "g0", name: "Sem party", party: 0, rsvp: "confirmado" },
          { id: "g1", name: "Confirmado", party: 2, rsvp: "confirmado" },
        ],
        priceBreakdown: undefined as never,
        quotedPrice: 5000,
      }),
    });
    const m = computeEventMetrics(d, TODAY);
    expect(m.supplierCosts).toBe(0);
    // 5 000 € é o "Preço final (sem IVA)". O valor CONTRATADO é o que o cliente
    // paga (6 150 €), porque é com os pagamentos que ele se compara; a MARGEM é
    // sobre o líquido, e sem custos nenhuns é o preço todo.
    expect(m.contracted).toBe(6150);
    expect(m.margin).toBe(5000);
    expect(m.rsvpTotal).toBe(2); // 0 + 2
    expect(m.rsvpConfirmed).toBe(2); // party 0 contributes nothing
  });

  it("pctPaid é 0 quando não há nada contratado — nunca uma divisão por zero", () => {
    const d = data({
      quote: makeQuote({
        quotedPrice: undefined,
        priceBreakdown: undefined as never,
        payments: [pago({ amount: 999 })],
      }),
    });
    const m = computeEventMetrics(d, TODAY);
    expect(m.contracted).toBe(0);
    expect(m.paid).toBe(999);
    expect(m.pctPaid).toBe(0);
  });

  it("pagamentos POR receber não contam para o recebido", () => {
    const d = data({
      quote: makeQuote({
        payments: [
          pago({ kind: "sinal", amount: 3690 }),
          pago({ id: "pay2", kind: "saldo", amount: 8610, paid: false }),
        ],
      }),
    });
    const m = computeEventMetrics(d, TODAY);
    expect(m.contracted).toBe(12300);
    expect(m.paid).toBe(3690);
    expect(m.pctPaid).toBeCloseTo(0.3, 5);
  });

  it("falls back quotedPrice → priceBreakdown.total when no proposal, sempre com IVA", () => {
    // O `quotedPrice` é líquido ("Preço final (sem IVA)") e o `priceBreakdown.total`
    // é bruto: o contratado converte o primeiro à taxa efetiva para os dois ramos
    // saírem na MESMA unidade (com IVA) — é com ela que se comparam os pagamentos.
    expect(
      computeEventMetrics(data({ quote: makeQuote({ quotedPrice: 15000 }) }), TODAY).contracted,
    ).toBe(18450); // 15 000 × 1,23
    expect(computeEventMetrics(data(), TODAY).contracted).toBe(12300); // priceBreakdown.total
  });
});

describe("paidTotal — o «Recebido» de um evento", () => {
  /**
   * Esta era a suite do `reconcileFinance`, que confrontava o registo de
   * pagamentos com o livro de facturas. O livro saiu com a facturação e a
   * reconciliação com ele (ver a nota em `dossier.ts`); o que ficou a valer, e
   * que aqueles testes cobriam pelo lado do registo, é ESTA conta — a que
   * alimenta o «Recebido» do painel de Pagamentos, o «% Recebido» do dossiê e
   * o «Recebido» da Visão Geral.
   */
  it("soma as linhas dadas por recebidas e ignora as que não estão", () => {
    const d = data({
      quote: makeQuote({
        payments: [
          pago({ id: "p1", kind: "sinal", amount: 6000 }),
          pago({ id: "p2", kind: "saldo", amount: 14000, paid: false }),
        ],
      }),
    });
    expect(paidTotal(d.quote)).toBe(6000);
  });

  it("é 0 sem pagamentos nenhuns (e sem o campo sequer)", () => {
    expect(paidTotal(makeQuote())).toBe(0);
    expect(paidTotal(makeQuote({ payments: [] }))).toBe(0);
  });

  it("arredonda aos cêntimos — um desvio de vírgula flutuante não deixa um evento aquém do total", () => {
    const q = makeQuote({
      payments: [pago({ id: "p1", amount: 0.1 }), pago({ id: "p2", amount: 0.2 })],
    });
    // 0.1 + 0.2 === 0.30000000000000004 em vírgula flutuante.
    expect(paidTotal(q)).toBe(0.3);
  });

  it("conta todas as espécies — sinal, saldo e avulso", () => {
    const q = makeQuote({
      payments: [
        pago({ id: "p1", kind: "sinal", amount: 3690 }),
        pago({ id: "p2", kind: "pagamento", amount: 1000 }),
        pago({ id: "p3", kind: "saldo", amount: 7610 }),
      ],
    });
    expect(paidTotal(q)).toBe(12300);
  });
});

describe("nextAction", () => {
  it("maps each stage to a sensible kind", () => {
    expect(nextAction("lead", data()).kind).toBe("proposta");
    // Era «portal»; o portal saiu (achado n.º 37). Acompanhar é na comunicação.
    expect(nextAction("proposta_enviada", data()).kind).toBe("proposta");
    expect(nextAction("aceite", data()).kind).toBe("sinal");
    expect(nextAction("sinal_pago", data()).kind).toBe("producao");
    expect(nextAction("em_producao", data()).kind).toBe("producao");
    expect(nextAction("concluido", data()).kind).toBe("arquivar");
    expect(nextAction("perdido", data()).kind).toBe("none");
  });

  it("semana_evento distingue saldo por receber (saldo) de tudo recebido (runsheet)", () => {
    const unpaid = data({ proposal: makeProposal({ total: 20000 }) });
    expect(nextAction("semana_evento", unpaid).kind).toBe("saldo");

    const liquidado = data({
      quote: makeQuote({ payments: [pago({ kind: "saldo", amount: 20000 })] }),
      proposal: makeProposal({ total: 20000 }),
    });
    expect(nextAction("semana_evento", liquidado).kind).toBe("runsheet");
  });

  /**
   * NÃO PEDIR DINHEIRO QUE JÁ ESTÁ NA CONTA.
   *
   * O erro histórico: a próxima acção olhava só para o livro de facturas, e num
   * casamento de 12.300 € integralmente recebido e registado o cabeçalho
   * mandava, na semana do evento, «Liquidar o saldo (70%)» — 8.610 € pedidos a
   * um casal que já os tinha transferido. A fase e a frase têm de sair da mesma
   * conta, que hoje é uma só.
   */
  it("semana_evento: o saldo recebido e registado já não pede para liquidar o saldo", () => {
    const liquidado = data({
      quote: makeQuote({
        date: "2026-07-22", // quatro dias depois do TODAY
        payments: [
          { id: "p1", kind: "sinal", amount: 3690, date: "2026-03-01", paid: true },
          { id: "p2", kind: "saldo", amount: 8610, date: "2026-07-10", paid: true },
        ],
      }),
      contract: { status: "aceite", acceptedAt: "2026-03-01T10:00:00Z" },
    });
    // O contratado (com IVA) do `priceBreakdown` são 12.300 €, e é isso que
    // está registado como recebido.
    expect(deriveStage(liquidado, TODAY)).toBe("semana_evento");
    expect(nextAction("semana_evento", liquidado).kind).toBe("runsheet");
  });
});
