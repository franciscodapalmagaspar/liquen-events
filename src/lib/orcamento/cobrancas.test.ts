import { describe, expect, it } from "vitest";
import type { Payment, Quote } from "./types";
import {
  cobrancaDoPedido,
  mensagemDeLembrete,
  prazoDoSaldo,
  quadroDeCobrancas,
  type PropostaParaCobrar,
} from "./cobrancas";

const HOJE = "2026-11-05";

function pedido(id: string, extra: Partial<Quote> = {}, payments: Payment[] = []): Quote {
  return {
    id,
    name: `TESTE ${id}`,
    status: "aceite",
    date: "2027-06-12",
    quotedPrice: 1000,
    payments,
    ...extra,
  } as unknown as Quote;
}

const aceite = (quoteId: string, total: number, pctSinal = 30): PropostaParaCobrar => ({
  quoteId,
  status: "aceite",
  total,
  subtotal: total / 1.23,
  pctSinal,
});

const pago = (amount: number, kind: Payment["kind"] = "sinal"): Payment => ({
  id: `p-${amount}-${kind}`,
  kind,
  amount,
  date: "2026-10-01",
  paid: true,
});

describe("cobrancaDoPedido", () => {
  it("o total é o da proposta ACEITE — nunca o «Preço final» estragado do pedido", () => {
    // O caso de 5/11: aceite por 5.317,29 €, «Preço final» gravado como 4,323 €.
    const c = cobrancaDoPedido(pedido("a", { quotedPrice: 4.323 }), [aceite("a", 5317.29)], HOJE);
    expect(c.total).toBe(5317.29);
    expect(c.daPropostaAceite).toBe(true);
    expect(c.fase).toBe("sinal");
    expect(c.proximo).toMatchObject({ tipo: "sinal", valor: 1595.19 });
  });

  it("uma revisão por aceitar não passa à frente da aceite", () => {
    const c = cobrancaDoPedido(
      pedido("a"),
      [{ quoteId: "a", status: "enviada", total: 9071.25 }, aceite("a", 5317.29)],
      HOJE,
    );
    expect(c.total).toBe(5317.29);
  });

  it("sem proposta aceite (Ganho à mão), conta o «Preço final» + IVA", () => {
    const c = cobrancaDoPedido(pedido("b"), [], HOJE);
    expect(c.total).toBe(1230);
    expect(c.daPropostaAceite).toBe(false);
  });

  it("as fases: sinal → saldo → pago, pelo dinheiro recebido", () => {
    const p = [aceite("c", 1000)];
    expect(cobrancaDoPedido(pedido("c"), p, HOJE).fase).toBe("sinal");
    expect(cobrancaDoPedido(pedido("c", {}, [pago(300)]), p, HOJE).fase).toBe("saldo");
    expect(cobrancaDoPedido(pedido("c", {}, [pago(300), pago(700, "saldo")]), p, HOJE).fase).toBe(
      "pago",
    );
  });

  it("o saldo vence um mês antes do evento, ou na data da linha prevista", () => {
    const p = [aceite("d", 1000)];
    const semLinha = cobrancaDoPedido(pedido("d", {}, [pago(300)]), p, HOJE);
    expect(semLinha.proximo).toMatchObject({ tipo: "saldo", valor: 700, prazo: "2027-05-12" });
    const comLinha = cobrancaDoPedido(
      pedido("d", {}, [
        pago(300),
        { id: "s", kind: "saldo", amount: 700, date: "2027-04-01", paid: false },
      ]),
      p,
      HOJE,
    );
    expect(comLinha.proximo?.prazo).toBe("2027-04-01");
  });

  it("um prazo que passou é atraso, com os dias contados", () => {
    const c = cobrancaDoPedido(
      pedido("e", {}, [{ id: "x", kind: "sinal", amount: 300, date: "2026-11-01", paid: false }]),
      [aceite("e", 1000)],
      HOJE,
    );
    expect(c.atraso).toBe(true);
    expect(c.diasParaOPrazo).toBe(-4);
  });
});

describe("quadroDeCobrancas", () => {
  it("só entram os aceites não arquivados, e os atrasados vêm à cabeça", () => {
    const quotes = [
      pedido("a"),
      pedido("b", {}, [{ id: "x", kind: "sinal", amount: 300, date: "2026-10-01", paid: false }]),
      pedido("c", { status: "cotado" }),
      pedido("d", { archived: true }),
      pedido("e", {}, [pago(1230)]),
    ];
    const q = quadroDeCobrancas(quotes, [], HOJE);
    expect(q.sinal.map((c) => c.quoteId)).toEqual(["b", "a"]);
    expect(q.pago.map((c) => c.quoteId)).toEqual(["e"]);
    expect(q.saldo).toEqual([]);
    expect(q.emAtraso).toEqual({ valor: 369, clientes: 1 });
    expect(q.recebido).toBe(1230);
    expect(q.porReceber).toBe(2460);
  });
});

describe("mensagemDeLembrete", () => {
  it("diz o pagamento, o valor e o prazo — e não inventa IBAN nenhum", () => {
    const c = cobrancaDoPedido(
      pedido("a", {}, [{ id: "x", kind: "sinal", amount: 300, date: "2026-11-20", paid: false }]),
      [aceite("a", 1000)],
      HOJE,
    );
    const m = mensagemDeLembrete(c, HOJE)!;
    expect(m).toContain("o sinal de 30%");
    expect(m).toContain("300");
    expect(m).toContain("20 de novembro");
    expect(m).not.toMatch(/IBAN|PT50/);
  });

  it("nada para lembrar a quem já pagou tudo", () => {
    const c = cobrancaDoPedido(pedido("a", {}, [pago(1000)]), [aceite("a", 1000)], HOJE);
    expect(mensagemDeLembrete(c, HOJE)).toBeNull();
  });
});

describe("prazoDoSaldo (mudou de casa, a regra é a mesma)", () => {
  it("um mês antes, encostado ao fim do mês e nunca antes do sinal", () => {
    expect(prazoDoSaldo("2027-06-12", "2026-10-08")).toBe("2027-05-12");
    expect(prazoDoSaldo("2027-03-31", "2026-10-08")).toBe("2027-02-28");
    expect(prazoDoSaldo("2026-10-29", "2026-10-08")).toBe("2026-10-08");
  });
});
