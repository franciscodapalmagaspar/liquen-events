import { describe, it, expect } from "vitest";
import {
  datasDaLinha,
  escolherTotal,
  lerConvidados,
  lerData,
  lerEmail,
  lerLinhaDeDinheiro,
  lerLocal,
  lerModoDoIva,
  lerNomes,
  lerTipoDeEvento,
  tipoDaLinha,
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

  it("distingue total, IVA, pagamentos e linhas", () => {
    expect(tipoDaLinha("Valor Total")).toBe("total");
    expect(tipoDaLinha("Subtotal")).toBe("pagamento");
    expect(tipoDaLinha("IVA 23%")).toBe("iva");
    expect(tipoDaLinha("Sinal de 30%")).toBe("pagamento");
    expect(tipoDaLinha("Arco floral")).toBe("item");
  });

  it("de vários totais, o sem IVA; sem regra, o último com confiança baixa", () => {
    const a = { rotulo: "Total", valor: 3000, linha: "Total 3.000 € + IVA" };
    const b = { rotulo: "Total com IVA", valor: 3690, linha: "Total com IVA 3.690 €" };
    expect(escolherTotal([a, b])).toEqual({ valor: a, confianca: "media" });
    const c = { rotulo: "Total A", valor: 1, linha: "x" };
    const d = { rotulo: "Total B", valor: 2, linha: "y" };
    expect(escolherTotal([c, d])).toEqual({ valor: d, confianca: "baixa" });
    expect(escolherTotal([])).toBeNull();
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
