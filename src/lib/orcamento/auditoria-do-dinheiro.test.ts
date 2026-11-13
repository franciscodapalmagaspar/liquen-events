import { describe, expect, it } from "vitest";
import type { Payment, Proposal, Quote } from "./types";
import {
  cobrancaDoPedido,
  comORecebido,
  comPagamentoRecebido,
  previsaoDeEntradas,
  quadroDeCobrancas,
  type PropostaParaCobrar,
} from "./cobrancas";
import { conferenciaDoMoloni, faturacaoPorArtigo } from "./artigos-de-faturacao";
import { deriveStage, estaTudoPago } from "./dossier";
import { pctDoSinalDe, propostaParaCobrar, propostaQueContaDoPedido } from "./proposta-que-conta";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A AUDITORIA DO DINHEIRO (13/11) — UM TESTE POR ACHADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada teste diz o número do achado. Todos foram vistos a falhar com o código
 * de antes e a passar com a correcção.
 */

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

const linha = (
  id: string,
  kind: Payment["kind"],
  amount: number,
  date: string,
  paid: boolean,
): Payment => ({ id, kind, amount, date, paid });

describe("auditoria do dinheiro de 13/11", () => {
  it("n.º 1 — versão base: as Cobranças cobram o mesmo total que o Moloni fatura, e o «Em falta» chega a zero", () => {
    const doc = {
      budgetItems: ["Decoração", "Arco extra"],
      budgetAmounts: [1000, 200],
      budgetArtigos: ["flores", "flores"],
      budgetOpcional: [false, true],
      totalAmount: 1200,
      totalVatMode: "acrescer",
      vatRate: 0.23,
    };
    const aceite = {
      id: "p1",
      quoteId: "a",
      status: "aceite",
      // O que ficou gravado ao enviar: a proposta INTEIRA (1.200 € + IVA).
      total: 1476,
      subtotal: 1200,
      vatRate: 0.23,
      versaoEscolhida: "base",
      doc,
    } as unknown as Proposal;
    const doMoloni = faturacaoPorArtigo(doc as never, "base").bruto;
    expect(doMoloni).toBe(1230);

    const c = cobrancaDoPedido(
      pedido("a", {}, [
        linha("s", "sinal", 369, "2026-10-01", true),
        linha("r", "saldo", 861, "2026-10-20", true),
      ]),
      [propostaParaCobrar(aceite)],
      HOJE,
    );
    expect(c.total).toBe(doMoloni);
    expect(c.emFalta).toBe(0);
    expect(c.fase).toBe("pago");
  });

  it("n.º 2 — o cartão do Moloni diz o total que o Moloni vai calcular, e avisa do cêntimo; e 1 cêntimo por receber NÃO é «tudo recebido»", () => {
    const doc = {
      budgetItems: ["A", "B"],
      budgetAmounts: [1000.05, 333.33],
      budgetArtigos: ["flores", "material"],
      totalAmount: 1333.38,
      totalVatMode: "acrescer",
      vatRate: 0.23,
    };
    const f = faturacaoPorArtigo(doc as never);
    expect(f.fecha).toBe(true);
    // O PDF e os Pagamentos dizem 492,02 € de sinal (30% do total com IVA); o
    // Moloni, com 30% de cada artigo sem IVA e o IVA linha a linha, fatura
    // 492,01 €.
    expect(conferenciaDoMoloni(f, "sinal", 30)).toEqual({
      noMoloni: 492.01,
      naProposta: 492.02,
      diferenca: -0.01,
    });
    // Ela regista o sinal do Moloni e o saldo da proposta: falta 1 cêntimo, e
    // NÃO está pago — pedido de 13/11, «não quero que falte nada. 0,0 €».
    expect(estaTudoPago(f.bruto, 492.01 + 1148.04)).toBe(false);
    // Ao cêntimo, está.
    expect(estaTudoPago(f.bruto, 492.02 + 1148.04)).toBe(true);
    // E a vírgula flutuante não inventa um cêntimo em falta.
    expect(estaTudoPago(0.3, 0.1 + 0.2)).toBe(true);
  });

  it("n.º 4 — registar o sinal no painel passa a linha PREVISTA a recebida, em vez de a deixar por receber ao lado", () => {
    const lista = comPagamentoRecebido([linha("s", "sinal", 369, "2026-11-01", false)], {
      kind: "sinal",
      valor: 369,
      dia: HOJE,
      novoId: "novo",
      emFalta: 369,
    });
    expect(lista).toEqual([linha("s", "sinal", 369, HOJE, true)]);
  });

  it("n.º 5 —um saldo pago só em PARTE não dá o evento por concluído (o mesmo critério do painel e do quadro)", () => {
    const d = {
      quote: pedido("a", { date: "2026-07-01" }, [
        linha("s", "sinal", 6000, "2026-02-10", true),
        linha("r", "saldo", 1000, "2026-06-01", true),
      ]),
      proposal: { status: "aceite", total: 20000, subtotal: 16260.16, vatRate: 0.23 } as Proposal,
      contract: null,
    };
    expect(deriveStage(d as never, new Date("2026-07-20T12:00:00Z"))).not.toBe("concluido");
  });

  it("n.º 6 — sem linha de saldo gerada, um casamento a três semanas não nasce com o saldo «em atraso»", () => {
    // Sinal pago hoje; casamento a 26/11. Um mês antes do evento seria 26/10 —
    // antes do próprio sinal. Como no «Ganho» (`prazoDoSaldo`), o saldo nunca
    // vence antes do dia do sinal.
    const c = cobrancaDoPedido(
      pedido("a", { date: "2026-11-26" }, [linha("s", "sinal", 369, HOJE, true)]),
      [],
      HOJE,
    );
    expect(c.fase).toBe("saldo");
    expect(c.proximo?.prazo).toBe(HOJE);
    expect(c.atraso).toBe(false);
  });

  it("n.º 8 — receber o sinal todo numa linha prevista com um valor antigo não deixa um sinal fantasma por receber", () => {
    // A linha prevista foi gerada com 400 € (outro total); o sinal que falta são 369 €.
    const q = pedido("a", {}, [linha("s", "sinal", 400, "2026-11-01", false)]);
    const c = cobrancaDoPedido(q, [], HOJE);
    expect(c.proximo).toMatchObject({ tipo: "sinal", valor: 369 });
    const lista = comORecebido(q, c, { valor: 369, dia: HOJE, novoId: "novo" });
    expect(lista.filter((p) => !p.paid)).toEqual([]);
  });

  it("n.º 9 — sem proposta aceite, o quadro usa a MESMA percentagem do sinal que o painel de Pagamentos", () => {
    const enviada: PropostaParaCobrar = {
      quoteId: "a",
      status: "enviada",
      total: 1230,
      pctSinal: 50,
    };
    const doPainel = pctDoSinalDe(propostaQueContaDoPedido([enviada], "a"));
    const c = cobrancaDoPedido(pedido("a"), [enviada], HOJE);
    expect(doPainel).toBe(50);
    expect(c.pctSinal).toBe(doPainel);
    expect(c.sinal).toBe(615);
  });

  it("n.º 10 — a previsão põe o saldo no mês da linha prevista, e não no que a regra daria", () => {
    // Evento a 12/06/2027: a regra daria 12/05/2027 (fora da janela de seis
    // meses). Ela pôs a linha do saldo a 1/03/2027.
    const q = pedido("a", {}, [linha("r", "saldo", 861, "2027-03-01", false)]);
    const quadro = quadroDeCobrancas([q], [], HOJE);
    const marco = previsaoDeEntradas(quadro, HOJE).find((m) => m.mes === "2027-03");
    expect(marco?.valor).toBe(861);
  });

  it("n.º 11 — o «Tudo pago» não soma nada ao «Por receber»; e 30 cêntimos em falta não são «Tudo pago»", () => {
    // 1.000 € + IVA = 1.230 €. Pago ao cêntimo: «Tudo pago», nada por receber.
    const pago = pedido("a", {}, [linha("s", "sinal", 1230, "2026-10-01", true)]);
    const quadro = quadroDeCobrancas([pago], [], HOJE);
    expect(quadro.pago).toHaveLength(1);
    expect(quadro.porReceber).toBe(0);
    // Faltam 0,30 €: não há folga (pedido de 13/11, «0,0 €»).
    const falta = pedido("b", {}, [linha("s", "sinal", 1229.7, "2026-10-01", true)]);
    const outro = quadroDeCobrancas([falta], [], HOJE);
    expect(outro.pago).toHaveLength(0);
    expect(outro.porReceber).toBeCloseTo(0.3, 2);
  });
});
