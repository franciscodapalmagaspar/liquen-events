import { describe, it, expect } from "vitest";
import {
  datasDaLinha,
  candidataPorPessoa,
  eCandidataATotal,
  eFinanceira,
  lerConvidados,
  lerData,
  lerEmail,
  lerLinhaDeDinheiro,
  lerLocal,
  lerModoDoIva,
  lerNomes,
  lerTipoDeEvento,
  taxasDoIvaEscritas,
} from "./heuristicas";

describe("os nomes", () => {
  it("«Ana & João» e «Ana e João», com a confiança de onde estão", () => {
    expect(lerNomes(["Casamento Ana & João"], [])).toEqual({
      valor: "Ana & João",
      confianca: "alta",
    });
    expect(lerNomes(["Proposta"], ["Para a Ana e o Rui"])).toBeNull();
    expect(lerNomes(["Casamento da Ana e João"], [])).toEqual({
      valor: "Ana & João",
      confianca: "media",
    });
    expect(lerNomes([], ["Noivos: Maria Silva e Pedro Costa"])).toEqual({
      valor: "Maria Silva & Pedro Costa",
      confianca: "alta",
    });
    expect(lerNomes([], ["Cliente: Joana Sousa"])).toEqual({
      valor: "Joana Sousa",
      confianca: "media",
    });
  });

  it("não confunde serviços com pessoas", () => {
    expect(
      lerNomes(["Decoração Floral e Cerimónia", "Copo de Água & Jantar"], ["Velas e Candelabros"]),
    ).toBeNull();
    expect(lerNomes(["Quinta da Serra & Monte Verde"], [])).toBeNull();
  });

  it("tira as palavras da casa que encostam ao nome", () => {
    expect(lerNomes(["Proposta Casamento Inês & Tomás Lisboa"], [])?.valor).toBe("Inês & Tomás");
  });
});

describe("o email", () => {
  it("o do cliente, sem os da Líquen", () => {
    expect(lerEmail("info@liquen-events.com — noiva: ana.teste@exemplo.pt")).toEqual({
      valor: "ana.teste@exemplo.pt",
      confianca: "media",
    });
    expect(lerEmail("geral@liquen-events.com")).toBeNull();
    expect(lerEmail("a@x.pt b@y.pt")?.confianca).toBe("baixa");
  });
});

describe("as datas", () => {
  it("por extenso, com números, e com ano de dois dígitos", () => {
    expect(datasDaLinha("Sábado, 12 de Setembro de 2026")).toEqual(["2026-09-12"]);
    expect(datasDaLinha("1º de março 2027")).toEqual(["2027-03-01"]);
    expect(datasDaLinha("3.07.2027")).toEqual(["2027-07-03"]);
    expect(datasDaLinha("03/07/27")).toEqual(["2027-07-03"]);
    expect(datasDaLinha("31/02/2026")).toEqual([]);
    expect(datasDaLinha("1.500,00 €")).toEqual([]);
  });

  it("o rótulo ganha; pagamentos e validades ficam de fora; várias = baixa", () => {
    expect(lerData([], ["Validade: 01/01/2026", "Data do casamento: 20/06/2026"])).toEqual({
      valor: { iso: "2026-06-20", outras: [] },
      confianca: "alta",
    });
    expect(lerData([], ["Proposta válida até 01/01/2026", "Evento a 20 de junho de 2026"])).toEqual(
      {
        valor: { iso: "2026-06-20", outras: [] },
        confianca: "media",
      },
    );
    const varias = lerData([], ["Visita a 2 de maio de 2026", "Casamento 20 de junho de 2026"]);
    expect(varias?.confianca).toBe("baixa");
    expect(varias?.valor.outras).toEqual(["2026-06-20"]);
    expect(lerData([], ["sem datas"])).toBeNull();
  });
});

describe("o dinheiro", () => {
  it("lê o valor com parseMoneyText e limpa o rótulo", () => {
    expect(lerLinhaDeDinheiro("Decoração da cerimónia ........ 1.200,00 €")).toMatchObject({
      rotulo: "Decoração da cerimónia",
      valor: 1200,
    });
    expect(lerLinhaDeDinheiro("Total: € 3 500 + IVA")).toMatchObject({
      rotulo: "Total",
      valor: 3500,
    });
    expect(lerLinhaDeDinheiro("Mesa de doces – 250 euros")).toMatchObject({
      rotulo: "Mesa de doces",
      valor: 250,
    });
    expect(lerLinhaDeDinheiro("150 convidados")).toBeNull();
  });

  it("as linhas financeiras: uma lista só, e nunca são serviços", () => {
    for (const r of [
      "Valor Total",
      "Subtotal",
      "IVA 23%",
      "VAT",
      "Sinal de 30%",
      "Líquido a pagar",
      "Montante a pagar",
      "Valor sem taxas",
      "Valor com taxas",
      "Base tributável",
      "Desconto",
      "Abatimento de 10%",
      "Restante",
      "Caução",
      "Reforço",
      "Valor remanescente",
      "Valor global",
      "Liquido",
      "Pagamento final",
      "2.ª prestação",
      "Adjudicação",
      "Valor sem IVA",
      "Valor com IVA",
      "Base tributável (s/ IVA)",
      "Base",
      "Líquido (s/ IVA)",
      "Valor líquido do sinal",
      "Total sem IVA",
    ]) {
      expect(eFinanceira(r), r).toBe(true);
    }
    for (const r of ["Arco floral", "Reserva do espaço", "Base de bolo em madeira", "Totó"]) {
      expect(eFinanceira(r), r).toBe(false);
    }
  });

  it("o total só sai de linhas financeiras com total, valor com/sem IVA, base ou líquido", () => {
    for (const r of [
      "Total",
      "Total com IVA",
      "Valor sem IVA",
      "Base",
      "Base tributável (s/ IVA)",
      "Líquido a pagar",
    ]) {
      expect(eCandidataATotal(r), r).toBe(true);
    }
    for (const r of ["Subtotal", "IVA (23%)", "Sinal", "Base de bolo", "Arco floral"]) {
      expect(eCandidataATotal(r), r).toBe(false);
    }
  });

  it("9.ª revisão: valor global/final/da proposta e montante total são candidatas", () => {
    for (const r of ["Valor global", "Valor final", "Valor da proposta", "Montante total"]) {
      expect(eCandidataATotal(r), r).toBe(true);
    }
  });

  it("9.ª revisão: uma linha de pagamento nunca é candidata, mesmo com «líquido» ou «valor»", () => {
    for (const r of [
      "Valor líquido do sinal",
      "Prestação total",
      "Adjudicação — valor total",
      "Pagamento líquido",
      "Restante (valor final)",
      "Reforço do valor global",
      "Caução total",
    ]) {
      expect(eFinanceira(r), r).toBe(true);
      expect(eCandidataATotal(r), r).toBe(false);
    }
  });

  it("9.ª revisão: as taxas de IVA escritas no documento", () => {
    expect(taxasDoIvaEscritas("IVA (6%): 6,00 €")).toEqual([0.06]);
    expect(taxasDoIvaEscritas("IVA à taxa de 13 %")).toEqual([0.13]);
    expect(taxasDoIvaEscritas("acresce 23% de IVA")).toEqual([0.23]);
    expect(taxasDoIvaEscritas("IVA 6%\nIVA (23%)")).toEqual([0.06, 0.23]);
    expect(taxasDoIvaEscritas("Total: 100 € + IVA")).toEqual([]);
  });

  it("o IVA: a linha do total manda; o resto só com confiança média; nada = não decide", () => {
    expect(lerModoDoIva("Total 3.000 € + IVA", "")).toEqual({
      valor: "acrescer",
      confianca: "alta",
    });
    expect(lerModoDoIva("Total 3.000 € (IVA incluído)", "")).toEqual({
      valor: "incluido",
      confianca: "alta",
    });
    expect(lerModoDoIva("Total 3.000 €", "Aos valores acrescem IVA à taxa legal")).toEqual({
      valor: "acrescer",
      confianca: "media",
    });
    expect(lerModoDoIva("Total 3.000 €", "Nada sobre impostos")).toBeNull();
    expect(lerModoDoIva("Total 3.000 €", "+ IVA aqui, com IVA ali")).toBeNull();
  });
});

describe("o local, os convidados e o tipo", () => {
  it("o local com rótulo, ou pelo nome do sítio — a igreja fica atrás", () => {
    expect(lerLocal(["Local: Quinta do Exemplo, Sintra"])).toEqual({
      valor: "Quinta do Exemplo, Sintra",
      confianca: "alta",
    });
    expect(
      lerLocal(["Cerimónia na Igreja de Santa Teste", "Copo de água na Herdade da Experiência"]),
    ).toEqual({
      valor: "Herdade da Experiência",
      confianca: "media",
    });
    expect(lerLocal(["nada aqui"])).toBeNull();
  });

  it("os convidados", () => {
    expect(lerConvidados("Para 120 convidados")).toEqual({ valor: 120, confianca: "alta" });
    expect(lerConvidados("80 pax ou 100 pax")?.confianca).toBe("baixa");
    expect(lerConvidados("2 pessoas")).toBeNull();
  });

  it("o tipo de evento", () => {
    expect(lerTipoDeEvento("Proposta Casamento", "")?.valor.tipo).toBe("casamentos");
    expect(lerTipoDeEvento("Proposta", "o batizado do Tomás")).toEqual({
      valor: { rotulo: "Batizado", categoria: "particulares", tipo: "batizados" },
      confianca: "media",
    });
    expect(lerTipoDeEvento("Proposta", "flores")).toBeNull();
  });
});

describe("10.ª revisão — as sugestões das linhas, do total e da taxa", () => {
  it("reserva (só a da data, isolada ou «valor da»), liquidação, saldo e entrada não são serviço", () => {
    for (const r of [
      "Reserva da data",
      "Reserva",
      "Valor da reserva",
      "Liquidação",
      "Saldo",
      "Entrada",
    ]) {
      expect(eFinanceira(r), r).toBe(true);
    }
    for (const r of ["Reserva do espaço", "Reserva de mesa", "Flores (IVA 6%)", "Oferta: velas"]) {
      expect(eFinanceira(r), r).toBe(false);
    }
    // O IVA fora de parênteses continua a contar.
    expect(eFinanceira("IVA (23%)")).toBe(true);
    expect(eFinanceira("IVA")).toBe(true);
  });

  it("por pessoa: não é candidata; com a conta, a candidata é o último valor", () => {
    for (const r of [
      "Total por pessoa",
      "Total p/ pessoa",
      "Valor total /pax",
      "Total por convidado",
    ]) {
      expect(eCandidataATotal(r), r).toBe(false);
    }
    expect(candidataPorPessoa("Total por pessoa: 95 € × 120 = 11 400 €")).toEqual({
      rotulo: "Total por pessoa: 95 € × 120 = 11 400 €",
      valor: 11400,
    });
    expect(candidataPorPessoa("Total por pessoa: 95 €")).toBeNull();
  });

  it("a taxa só se sugere colada a «IVA», e nunca numa frase de sinal, adjudicação, desconto…", () => {
    expect(taxasDoIvaEscritas("IVA 6%")).toEqual([0.06]);
    expect(taxasDoIvaEscritas("IVA à taxa de 6%")).toEqual([0.06]);
    expect(taxasDoIvaEscritas("6% de IVA")).toEqual([0.06]);
    for (const t of [
      "30% de sinal, valores com IVA",
      "50% na adjudicação (IVA 6%)",
      "5% de desconto com IVA 13%",
      "Reserva: 20% de IVA",
      "Pagamento em prestações, IVA 6%",
      "Entrada de 10% — IVA 6%",
      "Valores com IVA. 30% de sinal",
      "Valores com IVA, 30% de sinal na adjudicação",
    ]) {
      expect(taxasDoIvaEscritas(t), t).toEqual([]);
    }
  });
});

describe("12.ª revisão — a reserva sem parênteses nem «de X%»", () => {
  it("«Reserva (30%)», «Reserva de 30%» e «Valor por pessoa» não são serviço", () => {
    for (const r of ["Reserva (30%)", "Reserva de 30%", "Reserva de 30 %", "Valor por pessoa"]) {
      expect(eFinanceira(r), r).toBe(true);
    }
    for (const r of ["Reserva do espaço", "Reserva de mesa (30 lugares)"]) {
      expect(eFinanceira(r), r).toBe(false);
    }
  });
});

describe("o email, em linear", () => {
  it("uma sequência longa sem «@» não é quadrática, e os emails são os mesmos", () => {
    const t = performance.now();
    expect(lerEmail("x".repeat(200_000))).toBeNull();
    expect(lerEmail(`${"x".repeat(50_000)} ana.teste@exemplo.pt`)?.valor).toBe(
      "ana.teste@exemplo.pt",
    );
    expect(performance.now() - t).toBeLessThan(500);
    expect(lerEmail("Contacto: ana.teste@exemplo.pt · info@liquen-events.com")?.valor).toBe(
      "ana.teste@exemplo.pt",
    );
  });
});
