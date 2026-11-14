import { describe, it, expect } from "vitest";
import { paidTotal, deriveStage, type DossierData, type EventStage } from "./dossier";
import type { Quote, Proposal, Payment } from "./types";

/**
 * ADVERSARIAL cobertura da máquina de estados `deriveStage`.
 *
 * Foco 1: coerência da fase quando os sinais chegam pelo PRÓPRIO `quote.status`
 * (não só por uma Proposal/Contract). O `deriveStage` já honra
 * `quote.status === "cotado"` e `"rejeitado"` como fallbacks sem objeto
 * proposta — mas faltava-lhe `"aceite"`, deixando um negócio ganho manualmente
 * (sem proposta nem contrato) a aparecer como `lead`, contradizendo o
 * `deriveRequestLifecycle` do stepper para o MESMO pedido.
 *
 * Foco 2: o dinheiro que fecha um evento. Houve aqui duas fontes — o registo de
 * pagamentos e o livro de facturas — e o `saldoPago` só olhava para o livro: um
 * evento já realizado e todo pago pelo caminho rápido (registo à mão, o que o
 * painel de Pagamentos sugere e o que faz subir o "Recebido") nunca chegava a
 * `concluido` e ficava `em_producao` para sempre. Hoje há uma fonte só — a
 * facturação saiu desta aplicação — e estes testes fixam-na: é o registo de
 * pagamentos que decide a fase, com todos os seus casos de fronteira.
 *
 * Todos os testes injectam um `today` fixo — nunca dependem do relógio real.
 */

const TODAY = new Date("2026-07-18T09:00:00Z");

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

function data(over: Partial<DossierData> = {}): DossierData {
  return {
    quote: makeQuote(),
    proposal: null,
    contract: null,
    ...over,
  };
}

describe("deriveStage — quote.status as a first-class won signal", () => {
  it("quote marked 'aceite' with NO proposal/contract is at least 'aceite', not 'lead'", () => {
    // Deal booked/won directly in the admin (offline booking): the store allows
    // pendente → aceite with no proposal row (see quotes-store 'illegal status
    // jump'). The dossier must
    // agree with the stepper's deriveRequestLifecycle (which counts status
    // 'aceite' as contract-accepted), instead of showing a won deal as a fresh lead.
    const d = data({ quote: makeQuote({ status: "aceite" }) });
    expect(deriveStage(d, TODAY)).toBe<EventStage>("aceite");
  });

  it("won quote with a paid sinal payment reaches 'em_producao'", () => {
    const d = data({
      quote: makeQuote({
        status: "aceite",
        payments: [{ id: "pay1", kind: "sinal", amount: 6000, date: "2026-02-10", paid: true }],
      }),
    });
    expect(deriveStage(d, TODAY)).toBe("em_producao");
  });

  it("won quote whose event is within 7 days reaches 'semana_evento'", () => {
    const d = data({ quote: makeQuote({ status: "aceite", date: "2026-07-22" }) });
    expect(deriveStage(d, TODAY)).toBe("semana_evento");
  });

  it("won quote, event passed, saldo paid → 'concluido'", () => {
    // 20 000 € + IVA (o «Preço final» é sem IVA): o casal paga 24 600 €.
    const d = data({
      quote: makeQuote({
        status: "aceite",
        date: "2026-07-01",
        quotedPrice: 20000,
        payments: [{ id: "p1", kind: "saldo", amount: 24600, date: "2026-06-10", paid: true }],
      }),
    });
    expect(deriveStage(d, TODAY)).toBe("concluido");
  });

  it("sem proposta mas com preço: uma linha de saldo recebida NÃO fecha o evento (14/11)", () => {
    // Auditoria de 14/11: bastava uma linha de saldo recebida — de 1 € — para
    // a lista dizer «Concluído» num casamento de 20 000 € + IVA.
    for (const saldo of [1, 20000, 24599.99]) {
      const d = data({
        quote: makeQuote({
          status: "aceite",
          date: "2026-07-01",
          quotedPrice: 20000,
          payments: [{ id: "p1", kind: "saldo", amount: saldo, date: "2026-06-10", paid: true }],
        }),
      });
      expect(deriveStage(d, TODAY)).not.toBe("concluido");
    }
  });

  it("a estimativa não prende um evento todo pago em produção — com a proposta à frente", () => {
    // Revisão de 13/11: a estimativa era 25.000 €, o casal aceitou 20.000 € e
    // pagou-os (sinal + saldo). Desde 14/11 a lista também dá a proposta
    // (`faseDoPedido`): é o total dela que manda, e fecha.
    const d = data({
      quote: makeQuote({
        status: "aceite",
        date: "2026-07-01",
        quotedPrice: 25000,
        payments: [
          { id: "s", kind: "sinal", amount: 6000, date: "2026-03-01", paid: true },
          { id: "f", kind: "saldo", amount: 14000, date: "2026-06-10", paid: true },
        ],
      }),
      proposal: { status: "aceite", total: 20000, subtotal: 16260.16, vatRate: 0.23 } as Proposal,
    });
    expect(deriveStage(d, TODAY)).toBe("concluido");
  });

  it("com a proposta à frente, um saldo pago só em parte não fecha o evento (nem por 1 cêntimo)", () => {
    const pagamentos = (saldo: number) => [
      { id: "s", kind: "sinal" as const, amount: 6000, date: "2026-03-01", paid: true },
      { id: "f", kind: "saldo" as const, amount: saldo, date: "2026-06-10", paid: true },
    ];
    const com = (saldo: number) =>
      data({
        quote: makeQuote({ status: "aceite", date: "2026-07-01", payments: pagamentos(saldo) }),
        proposal: makeProposal({ status: "aceite" }),
      });
    expect(deriveStage(com(13999.99), TODAY)).not.toBe("concluido");
    expect(deriveStage(com(14000), TODAY)).toBe("concluido");
  });

  it("rejeitado still wins even when the quote also carries 'aceite' history via proposal", () => {
    // Terminal 'perdido' precedence must not regress with the new won signal.
    const d = data({
      quote: makeQuote({ status: "rejeitado" }),
      proposal: makeProposal({ status: "aceite" }),
    });
    expect(deriveStage(d, TODAY)).toBe("perdido");
  });

  it("em_revisao (still triaging, no proposal) stays 'lead'", () => {
    // Guard the fix does not over-reach: only 'aceite' is a won signal.
    expect(deriveStage(data({ quote: makeQuote({ status: "em_revisao" }) }), TODAY)).toBe("lead");
  });
});

/**
 * Cenário-base das duas fontes: casamento ganho à mão (sem proposta), preço da
 * estimativa — `priceBreakdown.total` = 12 300 € COM IVA, a mesma base dos
 * pagamentos. Faseamento 30/70 → sinal 3 690 €, saldo 8 610 €.
 */
const CONTRACTED = 12300;
const SINAL = 3690;
const SALDO = 8610;

/** Linha do painel de Pagamentos já marcada como recebida. */
function paid(kind: Payment["kind"], amount: number, id = `pay-${kind}`): Payment {
  return { id, kind, amount, date: "2026-06-20", paid: true };
}

/** Evento ganho que JÁ aconteceu (TODAY = 18/07/2026). */
function pastEvent(over: Partial<Quote> = {}): Quote {
  return makeQuote({ status: "aceite", date: "2026-07-01", ...over });
}

describe("deriveStage — o saldo que fecha o evento", () => {
  it("sinal + saldo registados e marcados recebidos → concluido", () => {
    // O DEFEITO histórico. Registar o dinheiro é o caminho rápido (e o que o
    // painel de Pagamentos sugere: "Já pago" vem ligado). Enquanto isto olhou
    // só para o livro de facturas, o casamento já realizado e integralmente
    // pago ficava eternamente `em_producao` e acumulava no quadro, ano após ano.
    const d = data({
      quote: pastEvent({ payments: [paid("sinal", SINAL), paid("saldo", SALDO)] }),
    });
    expect(deriveStage(d, TODAY)).toBe<EventStage>("concluido");
  });

  it("sem linha rotulada 'saldo': entradas avulsas que cobrem o total → concluido", () => {
    // Nem toda a gente usa o rótulo "Saldo final": duas transferências avulsas
    // que cobrem o contratado valem tanto como uma linha de saldo recebida.
    const d = data({
      quote: pastEvent({
        payments: [
          paid("pagamento", 6150, "pay-1"),
          { id: "pay-2", kind: "pagamento", amount: 6150, date: "2026-07-02", paid: true },
        ],
      }),
    });
    expect(deriveStage(d, TODAY)).toBe("concluido");
  });

  it("pago a MEIO (só o sinal) → fica em_producao, não concluido", () => {
    const d = data({ quote: pastEvent({ payments: [paid("sinal", SINAL)] }) });
    expect(deriveStage(d, TODAY)).toBe("em_producao");
  });

  it("saldo registado mas NÃO marcado como pago → não concluido", () => {
    const d = data({
      quote: pastEvent({
        payments: [
          paid("sinal", SINAL),
          { id: "pay-saldo", kind: "saldo", amount: SALDO, date: "2026-07-05", paid: false },
        ],
      }),
    });
    expect(deriveStage(d, TODAY)).toBe("em_producao");
  });

  it("saldo 'pago' de valor ZERO não conclui nada (mesma guarda do sinal)", () => {
    const d = data({ quote: pastEvent({ payments: [paid("saldo", 0)] }) });
    expect(deriveStage(d, TODAY)).toBe("aceite");
  });

  it("EVENTO FUTURO todo pago NUNCA aparece como concluido", () => {
    // A guarda que importa: dinheiro recebido adiantado não faz o casamento
    // acontecer. Data distante → em_producao; dentro da semana → semana_evento.
    const payments = [paid("sinal", SINAL), paid("saldo", SALDO)];
    const distante = data({
      quote: makeQuote({ status: "aceite", date: "2026-09-12", payments }),
    });
    expect(deriveStage(distante, TODAY)).toBe("em_producao");

    const estaSemana = data({
      quote: makeQuote({ status: "aceite", date: "2026-07-22", payments }),
    });
    expect(deriveStage(estaSemana, TODAY)).toBe("semana_evento");

    // Tarde do próprio dia do evento: ainda é "hoje", ainda não passou.
    const hoje = data({
      quote: makeQuote({ status: "aceite", date: "2026-07-18", payments }),
    });
    expect(deriveStage(hoje, new Date("2026-07-18T15:00:00Z"))).toBe("semana_evento");
  });

  it("perdido continua a ganhar a tudo, mesmo com o saldo recebido", () => {
    const d = data({
      quote: pastEvent({ status: "rejeitado", payments: [paid("saldo", SALDO)] }),
    });
    expect(deriveStage(d, TODAY)).toBe("perdido");
  });
});

describe("paidTotal — o que conta como dinheiro recebido", () => {
  it("soma as espécies todas: sinal + saldo fecham o contratado", () => {
    const d = data({
      quote: makeQuote({ payments: [paid("sinal", SINAL), paid("saldo", SALDO)] }),
    });
    expect(paidTotal(d.quote)).toBe(CONTRACTED);
  });

  it("só conta o que está marcado como recebido — as linhas por pagar valem 0", () => {
    const d = data({
      quote: makeQuote({
        payments: [
          { id: "p1", kind: "saldo", amount: SALDO, date: "2026-07-05", paid: false },
          { id: "p2", kind: "sinal", amount: SINAL, date: "2026-03-01", paid: false },
        ],
      }),
    });
    expect(paidTotal(d.quote)).toBe(0);
  });

  it("um pagamento avulso conta tanto como um rotulado", () => {
    const d = data({
      quote: makeQuote({ payments: [paid("pagamento", CONTRACTED, "pay-avulso")] }),
    });
    expect(paidTotal(d.quote)).toBe(CONTRACTED);
  });
});
