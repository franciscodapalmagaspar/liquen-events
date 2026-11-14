import { describe, expect, it } from "vitest";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { deriveStage, faseDoPedido, type EventStage } from "./dossier";
import { propostaQueConta, totalAPagarDaProposta } from "./proposta-que-conta";
import type { Payment, Proposal, Quote } from "./types";
import { deriveRequestLifecycle } from "@/app/[lang]/(admin)/orcamento/admin/LifecycleStepper";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LISTA E O DOSSIÊ DÃO SEMPRE A MESMA FASE (auditoria de 14/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A lista (o `LifecycleStepper`) chamava a máquina de estados SEM proposta, e
 * o dossiê COM ela. No ramo sem proposta, uma linha de saldo recebida — de
 * 1 € — ou o recebido igual à ESTIMATIVA do formulário fechava o evento: a
 * lista dizia «Concluído» com dinheiro por receber.
 *
 * Aqui prende-se:
 *   · os dois cenários da auditoria;
 *   · a paridade: para a mesma proposta, o que a lista recebe
 *     (`/api/propostas?semDoc=1`) e o que o dossiê recebe
 *     (`evento/[id]/page.tsx`) dão a MESMA fase, sempre;
 *   · sem a lista leve (por chegar ou falhada), nunca «concluído».
 */

const HOJE = new Date("2026-07-18T09:00:00Z");
const PASSADO = "2026-07-01";

function pedido(over: Partial<Quote> = {}): Quote {
  return {
    id: "q1",
    submittedAt: "2026-01-01T10:00:00Z",
    status: "aceite",
    category: "particulares",
    eventType: "casamentos",
    eventName: "Casamento",
    date: PASSADO,
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
    name: "Ana",
    email: "ana@example.com",
    phone: "912345678",
    company: "",
    nif: "",
    acceptTerms: true,
    acceptMarketing: false,
    ...over,
  } as Quote;
}

/** A estimativa do formulário: 8 000 € com IVA. */
const ESTIMATIVA_8000 = {
  basePrice: 0,
  guestCost: 0,
  packageMultiplier: 1,
  locationSurcharge: 0,
  weekendSurcharge: 0,
  seasonSurcharge: 0,
  urgencySurcharge: 0,
  addonsCost: 0,
  subtotal: 6504.07,
  iva: 1495.93,
  total: 8000,
  rangeMin: 7000,
  rangeMax: 9000,
  isEstimate: true,
} as Quote["priceBreakdown"];

function proposta(over: Partial<Proposal> = {}): Proposal {
  return {
    id: "p1",
    quoteId: "q1",
    clientName: "Ana",
    clientEmail: "ana@example.com",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 24390.24,
    vat: 5609.76,
    total: 30000,
    status: "aceite",
    createdAt: "2026-02-01T10:00:00Z",
    sentAt: "2026-02-01T10:00:00Z",
    ...over,
  };
}

const pag = (id: string, kind: Payment["kind"], amount: number, paid = true): Payment => ({
  id,
  kind,
  amount,
  date: "2026-06-01",
  paid,
});

/** O que `/api/propostas?semDoc=1` devolve de uma proposta (`semDocumento`). */
function comoNaLista(p: Proposal) {
  const { doc, ...resto } = p;
  void doc;
  const aPagar = totalAPagarDaProposta(p);
  return { ...resto, totalAPagar: aPagar.total, subtotalAPagar: aPagar.subtotal };
}

/** O que `evento/[id]/page.tsx` dá ao dossiê. */
function comoNoDossie(p: Proposal) {
  return { ...p, ...totalAPagarDaProposta(p) };
}

function faseNaLista(q: Quote, propostas: Proposal[]): EventStage {
  const leve = propostaQueConta(propostas.map(comoNaLista));
  return faseDoPedido(q, leve, null, HOJE);
}

function faseNoDossie(q: Quote, propostas: Proposal[]): EventStage {
  const p = propostaQueConta(propostas);
  return faseDoPedido(q, p ? comoNoDossie(p) : null, null, HOJE);
}

describe("cenário (a): aceite por 30 000 €, estimativa de 8 000 €, 9 000 € pagos, evento passado", () => {
  const q = pedido({
    priceBreakdown: ESTIMATIVA_8000,
    payments: [pag("s", "sinal", 9000)],
  });
  const ps = [proposta()];

  it("a lista NÃO diz «Concluído» — diz o mesmo que o dossiê", () => {
    expect(faseNaLista(q, ps)).toBe("em_producao");
    expect(faseNoDossie(q, ps)).toBe("em_producao");
    const l = deriveRequestLifecycle(q, propostaQueConta(ps.map(comoNaLista)), HOJE);
    expect(l.allDone).toBe(false);
  });

  it("e com o saldo marcado como recebido, também não (9 000 € de 30 000 €)", () => {
    const q2 = pedido({
      priceBreakdown: ESTIMATIVA_8000,
      payments: [pag("s", "sinal", 4000), pag("f", "saldo", 5000)],
    });
    expect(faseNaLista(q2, ps)).not.toBe("concluido");
    expect(faseNaLista(q2, ps)).toBe(faseNoDossie(q2, ps));
  });

  it("fecha quando entram os 30 000 € ao cêntimo — e não com 29 999,99 €", () => {
    const quase = pedido({ payments: [pag("s", "sinal", 9000), pag("f", "saldo", 20999.99)] });
    const tudo = pedido({ payments: [pag("s", "sinal", 9000), pag("f", "saldo", 21000)] });
    expect(faseNaLista(quase, ps)).toBe("em_producao");
    expect(faseNaLista(tudo, ps)).toBe("concluido");
    expect(faseNoDossie(tudo, ps)).toBe("concluido");
  });
});

describe("cenário (b): 20 000 € + IVA, sinal pago e um saldo de 1 € recebido", () => {
  const pagamentos = [pag("s", "sinal", 7380), pag("f", "saldo", 1)];

  it("com a proposta (24 600 €), a lista não diz «Concluído»", () => {
    const q = pedido({ payments: pagamentos });
    const ps = [proposta({ total: 24600, subtotal: 20000, vat: 4600 })];
    expect(faseNaLista(q, ps)).toBe("em_producao");
    expect(faseNoDossie(q, ps)).toBe("em_producao");
  });

  it("sem proposta, com o «Preço final» de 20 000 € sem IVA, também não", () => {
    const q = pedido({ quotedPrice: 20000, payments: pagamentos });
    expect(faseNaLista(q, [])).toBe("em_producao");
    expect(faseNoDossie(q, [])).toBe("em_producao");
  });

  it("a linha de saldo só decide quando não há total NENHUM", () => {
    const semTotal = pedido({ payments: pagamentos });
    expect(faseNaLista(semTotal, [])).toBe("concluido");
  });
});

/**
 * Revisão de 14/11: sem proposta, a estimativa do formulário NÃO é o preço
 * aceite. O total da fase é o «Preço final»; sem ele, decide a linha de saldo.
 */
describe("sem proposta: o «Preço final» conta, a estimativa não", () => {
  const ESTIMATIVA_12300 = { ...ESTIMATIVA_8000, subtotal: 10000, iva: 2300, total: 12300 };

  it("estimativa de 12 300 €, sinal e saldo recebidos (10 000 €), evento passado → concluído", () => {
    const q = pedido({
      priceBreakdown: ESTIMATIVA_12300 as Quote["priceBreakdown"],
      payments: [pag("s", "sinal", 3000), pag("f", "saldo", 7000)],
    });
    expect(faseNaLista(q, [])).toBe("concluido");
    expect(faseNoDossie(q, [])).toBe("concluido");
  });

  it("Preço final de 10 000 € + IVA com 10 000 € recebidos → continua em produção", () => {
    const q = pedido({
      quotedPrice: 10000,
      payments: [pag("s", "sinal", 3000), pag("f", "saldo", 7000)],
    });
    expect(faseNaLista(q, [])).toBe("em_producao");
    expect(faseNoDossie(q, [])).toBe("em_producao");
  });

  it("sem saldo recebido, a estimativa paga não fecha nada", () => {
    const q = pedido({
      priceBreakdown: ESTIMATIVA_12300 as Quote["priceBreakdown"],
      payments: [pag("s", "sinal", 12300)],
    });
    expect(faseNaLista(q, [])).toBe("em_producao");
  });
});

describe("sem saber a proposta (a lista leve não chegou ou falhou), nunca «concluído»", () => {
  it("nem com tudo pago", () => {
    const q = pedido({ payments: [pag("s", "sinal", 9000), pag("f", "saldo", 21000)] });
    expect(faseDoPedido(q, undefined, null, HOJE)).toBe("em_producao");
    expect(deriveRequestLifecycle(q, undefined, HOJE).allDone).toBe(false);
  });
});

describe("paridade lista ↔ dossiê — a mesma função, a mesma proposta, o mesmo total", () => {
  /** Proposta com documento e extras, aceite na versão BASE (total a pagar < total). */
  function comExtras(versao: "base" | "extras" | undefined): Proposal {
    const doc = {
      budgetItems: ["Decoração", "Cocktail"],
      budgetAmounts: [8000, 4000],
      budgetOpcional: [false, true],
      totalAmount: 12000,
      totalVatMode: "acrescer",
      vatRate: 0.23,
    } as unknown as ProposalDoc;
    return proposta({
      doc,
      versaoEscolhida: versao,
      total: 14760,
      subtotal: 12000,
      vat: 2760,
    } as Partial<Proposal>);
  }

  it("a versão base cobra 9 840 €, e as duas vistas fecham juntas nesse número", () => {
    const ps = [comExtras("base")];
    expect(totalAPagarDaProposta(ps[0]).total).toBe(9840);
    const pago = pedido({ payments: [pag("s", "sinal", 2952), pag("f", "saldo", 6888)] });
    expect(faseNaLista(pago, ps)).toBe("concluido");
    expect(faseNoDossie(pago, ps)).toBe("concluido");
  });

  const cenarios: { nome: string; propostas: Proposal[] }[] = [
    { nome: "sem proposta", propostas: [] },
    { nome: "aceite 30 000 €", propostas: [proposta()] },
    { nome: "enviada", propostas: [proposta({ status: "enviada" })] },
    { nome: "rascunho só", propostas: [proposta({ status: "rascunho" })] },
    { nome: "recusada", propostas: [proposta({ status: "rejeitada" })] },
    {
      nome: "revisão nova depois da aceite",
      propostas: [proposta({ id: "p2", status: "enviada", total: 50000 }), proposta()],
    },
    { nome: "versão base", propostas: [comExtras("base")] },
    { nome: "versão com extras", propostas: [comExtras("extras")] },
    { nome: "sem versão", propostas: [comExtras(undefined)] },
    { nome: "proposta a zero", propostas: [proposta({ total: 0, subtotal: 0 })] },
  ];
  const pagamentos: Payment[][] = [
    [],
    [pag("s", "sinal", 1)],
    [pag("s", "sinal", 9000)],
    [pag("s", "sinal", 9000), pag("f", "saldo", 1)],
    [pag("s", "sinal", 2952), pag("f", "saldo", 6888)],
    [pag("s", "sinal", 9000), pag("f", "saldo", 21000)],
    [pag("x", "pagamento", 30000)],
    [pag("s", "sinal", 9000, false), pag("f", "saldo", 21000, false)],
  ];
  const pedidos: Partial<Quote>[] = [
    {},
    { status: "pendente" },
    { status: "cotado" },
    { status: "rejeitado" },
    { priceBreakdown: ESTIMATIVA_8000 },
    { quotedPrice: 20000 },
    { date: "2026-07-22" },
    { date: "2026-12-12" },
    { date: "" },
  ];

  for (const c of cenarios) {
    it(`${c.nome}: a lista e o dossiê concordam em todas as combinações`, () => {
      for (const pg of pagamentos) {
        for (const over of pedidos) {
          const q = pedido({ ...over, payments: pg });
          const naLista = faseNaLista(q, c.propostas);
          const noDossie = faseNoDossie(q, c.propostas);
          expect({ over, pg, naLista }).toEqual({ over, pg, naLista: noDossie });
          // E o dossiê continua a ser o `deriveStage` de sempre.
          const p = propostaQueConta(c.propostas);
          expect(noDossie).toBe(
            deriveStage({ quote: q, proposal: p ? comoNoDossie(p) : null, contract: null }, HOJE),
          );
        }
      }
    });
  }
});
