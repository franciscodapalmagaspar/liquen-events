import { describe, expect, it } from "vitest";
import type { Payment, Quote } from "./types";
import {
  cobrancaDoPedido,
  comORecebido,
  diasDesdeOLembrete,
  mesCurto,
  precisaDeMim,
  previsaoDeEntradas,
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

  it("o valor sai como no PDF que o cliente tem («1.500,00 €»), sem espaço nos milhares", () => {
    const c = cobrancaDoPedido(
      pedido("a", {}, [{ id: "x", kind: "sinal", amount: 1500, date: "2026-11-20", paid: false }]),
      [aceite("a", 5000)],
      HOJE,
    );
    const m = mensagemDeLembrete(c, HOJE)!;
    expect(m).toContain("1.500,00");
    expect(m).not.toMatch(/1[\u00a0\u202f ]500/);
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

describe("o fluxo de trabalho", () => {
  it("«precisa de mim»: em atraso ou a vencer nos próximos sete dias", () => {
    const p = [aceite("a", 1000)];
    const linha = (date: string): Payment => ({
      id: "x",
      kind: "sinal",
      amount: 300,
      date,
      paid: false,
    });
    expect(precisaDeMim(cobrancaDoPedido(pedido("a", {}, [linha("2026-11-01")]), p, HOJE))).toBe(
      true,
    );
    expect(precisaDeMim(cobrancaDoPedido(pedido("a", {}, [linha("2026-11-12")]), p, HOJE))).toBe(
      true,
    );
    expect(precisaDeMim(cobrancaDoPedido(pedido("a", {}, [linha("2026-12-20")]), p, HOJE))).toBe(
      false,
    );
    expect(precisaDeMim(cobrancaDoPedido(pedido("a", {}, [pago(1000)]), p, HOJE))).toBe(false);
  });

  it("o último lembrete conta-se pelo histórico, e só os de pagamento", () => {
    const q = pedido("a", {
      activityLog: [
        {
          id: "1",
          at: "2026-10-20T10:00:00Z",
          kind: "message_sent",
          summary: "Lembrete de pagamento preparado (copiado): sinal",
        },
        {
          id: "2",
          at: "2026-11-03T10:00:00Z",
          kind: "message_sent",
          summary: "Email enviado ao cliente",
        },
        {
          id: "3",
          at: "2026-11-02T09:00:00Z",
          kind: "message_sent",
          summary: "Lembrete de pagamento preparado (WhatsApp): saldo",
        },
      ],
    } as Partial<Quote>);
    expect(diasDesdeOLembrete(q, HOJE)).toBe(3);
    expect(diasDesdeOLembrete(pedido("b"), HOJE)).toBeNull();
  });

  it("«Recebido» passa a prevista a recebida — não deixa uma órfã ao lado", () => {
    const prevista: Payment = {
      id: "s1",
      kind: "sinal",
      amount: 300,
      date: "2026-11-01",
      paid: false,
    };
    const q = pedido("a", {}, [prevista]);
    const c = cobrancaDoPedido(q, [aceite("a", 1000)], HOJE);
    const lista = comORecebido(q, c, { valor: 300, dia: HOJE, meio: "MB Way", novoId: "n" });
    expect(lista).toEqual([{ ...prevista, amount: 300, date: HOJE, paid: true, note: "MB Way" }]);
  });

  it("se entrou só uma parte, o resto continua previsto com o mesmo prazo", () => {
    const prevista: Payment = {
      id: "s1",
      kind: "sinal",
      amount: 300,
      date: "2026-11-20",
      paid: false,
    };
    const q = pedido("a", {}, [prevista]);
    const c = cobrancaDoPedido(q, [aceite("a", 1000)], HOJE);
    const lista = comORecebido(q, c, { valor: 100, dia: HOJE, novoId: "n" });
    expect(lista).toEqual([
      { ...prevista, amount: 100, date: HOJE, paid: true },
      { ...prevista, id: "n", amount: 200 },
    ]);
  });

  it("sem prevista, acrescenta uma linha recebida do tipo certo", () => {
    const q = pedido("a", {}, [pago(300)]);
    const c = cobrancaDoPedido(q, [aceite("a", 1000)], HOJE);
    const lista = comORecebido(q, c, { valor: 700, dia: HOJE, novoId: "n" });
    expect(lista).toHaveLength(2);
    expect(lista[1]).toEqual({ id: "n", kind: "saldo", amount: 700, date: HOJE, paid: true });
  });

  it("a previsão: o atrasado conta já, o saldo entra no mês do seu prazo", () => {
    const quadro = quadroDeCobrancas(
      [
        pedido("a", { date: "2027-02-20" }, [
          { id: "x", kind: "sinal", amount: 300, date: "2026-10-01", paid: false },
        ]),
      ],
      [aceite("a", 1000)],
      HOJE,
    );
    const p = previsaoDeEntradas(quadro, HOJE, 4);
    expect(p.map((m) => m.mes)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(p[0].valor).toBe(300); // o sinal em atraso
    expect(p[2].valor).toBe(700); // o saldo: um mês antes de 20/02
    expect(mesCurto("2027-01", HOJE)).toBe("jan 2027");
    expect(mesCurto("2026-12", HOJE)).toBe("dez");
  });
});
