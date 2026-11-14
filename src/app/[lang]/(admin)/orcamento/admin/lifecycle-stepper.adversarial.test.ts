import { describe, it, expect } from "vitest";
import { deriveRequestLifecycle } from "./LifecycleStepper";
import { deriveStage } from "@/lib/orcamento/dossier";
import type { Quote, Payment } from "@/lib/orcamento/types";

/**
 * ADVERSARIAL cobertura de `deriveRequestLifecycle` (stepper do back office),
 * hoje uma PROJEÇÃO do `deriveStage` do Dossier — durante muito tempo foi uma
 * segunda derivação, com opinião própria sobre o mesmo casamento.
 *
 * Foco 1: paridade das fases ancoradas na data. `deriveStage` normaliza sempre a
 * porção da DATA (`quote.date.slice(0, 10)`) antes de ancorar ao fim do dia,
 * porque a rota manual/importação não proíbe um `quote.date` com componente
 * horária (ISO completo). O stepper concatenava `${quote.date}T23:59:59` sem
 * essa normalização, produzindo `NaN` e deixando um evento JÁ PASSADO preso uma
 * fase atrás — apesar de `countdownDays` (linha seguinte) já tratar ambos os
 * formatos. Resultado: contradição com `deriveStage` e com a própria doc do
 * componente ("data já passada → todas as fases concluídas").
 *
 * Foco 2: a data passada não paga as contas — ver o bloco homónimo mais abaixo.
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

/** Pagamento registado à mão (com IVA) e já marcado como recebido. */
function pago(kind: Payment["kind"], amount: number, id = `pay-${kind}`): Payment {
  return { id, kind, amount, date: "2026-06-20", paid: true };
}

/** O contratado deste casamento: `priceBreakdown.total` = 12 300 € (com IVA). */
const CONTRATADO = 12300;
const SINAL = 3690;
const SALDO = 8610;

describe("deriveRequestLifecycle — date-anchored parity with deriveStage", () => {
  it("plain yyyy-mm-dd past event is recognised as passed (baseline)", () => {
    // Evento passado E liquidado — é o que fecha o ciclo, não a data por si só.
    const q = makeQuote({
      status: "aceite",
      date: "2026-07-01",
      payments: [pago("sinal", SINAL), pago("saldo", SALDO)],
    });
    expect(deriveRequestLifecycle(q, null, TODAY)).toEqual({
      perdido: false,
      currentIndex: 4,
      allDone: true,
    });
  });

  it("full-ISO datetime past event is ALSO recognised as passed (regression)", () => {
    // Same event, same day, but `quote.date` carries a time component — allowed
    // by the manual/import route. `deriveStage` slices to the date part and
    // reports the event as passed; the stepper must not diverge by leaving a
    // long-past event stuck at an earlier phase.
    const q = makeQuote({
      status: "aceite",
      date: "2026-07-01T15:00:00",
      payments: [pago("sinal", SINAL), pago("saldo", SALDO)],
    });
    expect(deriveRequestLifecycle(q, null, TODAY)).toEqual({
      perdido: false,
      currentIndex: 4,
      allDone: true,
    });
  });

  it("full-ISO datetime event within the week reaches the evento phase (atual)", () => {
    // countdownDays already handles the datetime; guard the fix keeps the
    // not-yet-passed 'semana do evento' case (atual, not allDone) intact.
    const q = makeQuote({ status: "aceite", date: "2026-07-22T18:00:00" });
    expect(deriveRequestLifecycle(q, null, TODAY)).toEqual({
      perdido: false,
      currentIndex: 4,
      allDone: false,
    });
  });

  it("malformed date never marks the event passed nor crashes (safe)", () => {
    const q = makeQuote({ status: "aceite", date: "not-a-date" });
    expect(deriveRequestLifecycle(q, null, TODAY)).toEqual({
      perdido: false,
      currentIndex: 2,
      allDone: false,
    });
  });
});

/**
 * O DEFEITO: o passo do ciclo de vida dava o casamento por tratado assim que a
 * data ficava para trás — `if (eventPassed) return { allDone: true }` — sem
 * olhar para o dinheiro. O estúdio corria a lista de pedidos, via cinco bolas
 * verdes e um "Rever produção do evento" (a próxima ação que o `allDone`
 * escolhe) num casamento com 12 300 € por receber.
 *
 * A fase certa é a do Dossier (`deriveStage`), que só chega a `concluido` com o
 * evento passado E o saldo liquidado. Este bloco fixa a paridade entre os dois:
 * o stepper é uma VISTA de 5 passos da mesma máquina de estados, não uma segunda
 * opinião.
 */
describe("deriveRequestLifecycle — a data passada não paga as contas", () => {
  const dossier = (q: Quote) => ({ quote: q, proposal: null, contract: null, invoices: [] });

  it("casamento já realizado e SEM UM CÊNTIMO pago não fica todo verde", () => {
    const q = makeQuote({ status: "aceite", date: "2026-07-01" });
    const l = deriveRequestLifecycle(q, null, TODAY);
    expect(l.allDone).toBe(false);
    // Contrato aceite, nada recebido → o passo em aberto é o do dinheiro.
    expect(l).toEqual({ perdido: false, currentIndex: 2, allDone: false });
    expect(deriveStage(dossier(q), TODAY)).not.toBe("concluido");
  });

  it("casamento já realizado com só o SINAL pago não fica todo verde", () => {
    const q = makeQuote({
      status: "aceite",
      date: "2026-07-01",
      payments: [pago("sinal", SINAL)],
    });
    expect(deriveRequestLifecycle(q, null, TODAY)).toEqual({
      perdido: false,
      currentIndex: 3,
      allDone: false,
    });
    expect(deriveStage(dossier(q), TODAY)).toBe("em_producao");
  });

  it("casamento já realizado com uma linha de pagamento POR PAGAR não fica todo verde", () => {
    // O saldo está previsto no painel de Pagamentos mas ainda não entrou:
    // registar a intenção não é receber o dinheiro.
    const q = makeQuote({
      status: "aceite",
      date: "2026-07-01",
      payments: [
        pago("sinal", SINAL),
        { id: "pay-saldo", kind: "saldo", amount: SALDO, date: "2026-07-05", paid: false },
      ],
    });
    expect(deriveRequestLifecycle(q, null, TODAY).allDone).toBe(false);
  });

  it("casamento já realizado e INTEGRALMENTE pago fica todo verde", () => {
    const q = makeQuote({
      status: "aceite",
      date: "2026-07-01",
      payments: [pago("sinal", SINAL), pago("saldo", SALDO)],
    });
    expect(deriveRequestLifecycle(q, null, TODAY)).toEqual({
      perdido: false,
      currentIndex: 4,
      allDone: true,
    });
    expect(deriveStage(dossier(q), TODAY)).toBe("concluido");
  });

  it("pago o contratado sem rótulo 'saldo' (transferências avulsas) também fecha", () => {
    // Com um preço COMBINADO (o «Preço final», 10 000 € + IVA): a estimativa
    // do formulário não é um preço aceite e não fecha nada (revisão de 14/11).
    const q = makeQuote({
      status: "aceite",
      date: "2026-07-01",
      quotedPrice: 10000,
      payments: [pago("pagamento", 6150, "p1"), pago("pagamento", 6150, "p2")],
    });
    expect(pago("pagamento", 6150).amount * 2).toBe(CONTRATADO);
    expect(deriveRequestLifecycle(q, null, TODAY).allDone).toBe(true);
  });

  it("allDone é EXATAMENTE 'concluido' do Dossier, caso a caso", () => {
    // A paridade que interessa: uma única fonte de verdade sobre "em que ponto
    // está este casamento". Qualquer divergência aqui é o defeito a voltar.
    const casos: Quote[] = [
      makeQuote(),
      makeQuote({ status: "cotado" }),
      makeQuote({ status: "aceite" }),
      makeQuote({ status: "rejeitado", date: "2026-07-01" }),
      makeQuote({ status: "aceite", date: "2026-07-01" }),
      makeQuote({ status: "aceite", date: "2026-07-01", payments: [pago("sinal", SINAL)] }),
      makeQuote({
        status: "aceite",
        date: "2026-07-01",
        payments: [pago("sinal", SINAL), pago("saldo", SALDO)],
      }),
      makeQuote({ status: "aceite", date: "2026-07-22" }),
      makeQuote({ status: "aceite", date: "2026-07-22", payments: [pago("saldo", CONTRATADO)] }),
    ];
    for (const q of casos) {
      const l = deriveRequestLifecycle(q, null, TODAY);
      expect({ id: q.status + q.date, allDone: l.allDone }).toEqual({
        id: q.status + q.date,
        allDone: deriveStage(dossier(q), TODAY) === "concluido",
      });
    }
  });
});

/**
 * Os sinais que só o Quote traz (registo de atividade e nº de contrato) não se
 * podem perder ao unificar a derivação: eram eles que punham um pedido com
 * proposta enviada por e-mail, ou um contrato assinado à mão, no passo certo.
 */
describe("deriveRequestLifecycle — sinais que vivem no Quote", () => {
  it("proposta enviada registada no activityLog conta como proposta", () => {
    const q = makeQuote({
      activityLog: [
        {
          id: "a1",
          at: "2026-02-01T10:00:00Z",
          kind: "proposal_sent",
          summary: "Proposta enviada",
        },
      ],
    });
    expect(deriveRequestLifecycle(q, null, TODAY)).toEqual({
      perdido: false,
      currentIndex: 1,
      allDone: false,
    });
  });

  it("nº de contrato preenchido conta como contrato aceite", () => {
    const q = makeQuote({ contractRef: "2026-042" });
    expect(deriveRequestLifecycle(q, null, TODAY)).toEqual({
      perdido: false,
      currentIndex: 2,
      allDone: false,
    });
  });
});
