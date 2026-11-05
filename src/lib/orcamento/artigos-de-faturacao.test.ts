import { describe, expect, it } from "vitest";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { seloDoConteudo } from "@/lib/proposta-versao";
import {
  artigoSugerido,
  definirArtigoDaLinha,
  definirArtigoDoAdicional,
  definirReparto,
  docDaFaturacao,
  faturacaoPorArtigo,
  faltasDaFaturacao,
  parcelasDaFatura,
  refDoArtigo,
  repartoDe,
  sugestaoDeReparto,
  textoDaFatura,
  valorParaColar,
  type DocParaFaturar,
} from "./artigos-de-faturacao";

/**
 * Como as propostas ACEITES estão de facto (medido a 5/11, só leitura): sem
 * preço por linha, um total escrito, e uma deslocação como valor adicional.
 */
function doc(extra: Partial<DocParaFaturar> = {}): DocParaFaturar {
  return {
    budgetItems: ["Decor Cerimónia", "Centros de mesa"],
    budgetAmounts: [null, null],
    budgetExtras: [{ label: "Deslocação da equipa Líquen", valueText: "1.550,00 € + IVA" }],
    budgetExtrasSomam: true,
    totalAmount: 8450,
    totalVatMode: "acrescer",
    vatRate: 0.23,
    ...extra,
  } as DocParaFaturar;
}

const soma = (p: { valor: number }[]) => Math.round(p.reduce((s, x) => s + x.valor, 0) * 100) / 100;

describe("faturacaoPorArtigo — o total repartido pelos artigos", () => {
  it("sem repartição, diz que falta repartir — e não fatura", () => {
    const f = faturacaoPorArtigo(doc());
    expect(f.base).toBe(10000); // 8.450 escritos + 1.550 da deslocação, que somam
    expect(f.fecha).toBe(false);
    expect(f.porqueNaoFecha).toEqual(["O total ainda não está repartido pelos artigos."]);
  });

  it("fecha quando a repartição dá o total sem IVA, ao cêntimo", () => {
    const f = faturacaoPorArtigo(doc({ repartoPorArtigo: { flores: 8450, transporte: 1550 } }));
    expect(f.fecha).toBe(true);
    expect(f.bruto).toBe(12300);
    expect(f.artigos).toEqual([
      { artigo: "flores", nome: "Flores e Elementos de Decoração", valor: 8450 },
      { artigo: "transporte", nome: "Transporte", valor: 1550 },
    ]);
  });

  it("diz quanto falta e quanto sobra", () => {
    expect(
      faturacaoPorArtigo(doc({ repartoPorArtigo: { transporte: 1550 } })).porqueNaoFecha[0],
    ).toMatch(/Falta repartir 8\s?450,00\s€/);
    expect(
      faturacaoPorArtigo(doc({ repartoPorArtigo: { transporte: 1550, material: 9000 } }))
        .porqueNaoFecha[0],
    ).toMatch(/Repartiu-se 550,00\s€ a mais/);
  });

  it("na versão base, o total é o da base — os extras não foram contratados", () => {
    const d = doc({
      budgetItems: ["Decor", "Arco extra"],
      budgetAmounts: [null, 800],
      budgetOpcional: [false, true],
      repartoPorArtigo: { flores: 7650, transporte: 1550 },
    });
    expect(faturacaoPorArtigo(d).fecha).toBe(false); // a proposta inteira são 10.000
    expect(faturacaoPorArtigo(d, "base").fecha).toBe(true); // a base são 9.200
  });

  it("valores lixo na repartição não contam (negativos, texto, artigos que não existem)", () => {
    const r = repartoDe({
      repartoPorArtigo: {
        material: -5,
        servico: Number.NaN,
        transporte: 10.005,
        inventado: 3,
      } as never,
    });
    expect(r).toEqual({ transporte: 10.01 });
  });
});

describe("sugestaoDeReparto", () => {
  it("põe a deslocação em Transporte e deixa o resto para ela", () => {
    expect(sugestaoDeReparto(doc())).toEqual({ transporte: 1550 });
  });

  it("um adicional «IVA incluído» entra pela base", () => {
    const d = doc({
      budgetExtras: [{ label: "Deslocação", valueText: "1.906,50 € IVA incluído" }],
    });
    expect(sugestaoDeReparto(d)).toEqual({ transporte: 1550 });
  });

  it("linhas com preço e nome claro também entram", () => {
    const d = doc({ budgetAmounts: [6000, 2450] });
    expect(sugestaoDeReparto(d)).toEqual({ flores: 8450, transporte: 1550 });
  });

  it("nunca sugere mais do que o total", () => {
    const d = doc({ budgetAmounts: [60000, null] });
    expect(sugestaoDeReparto(d)).toEqual({});
  });
});

describe("definirReparto", () => {
  it("escreve, arredonda ao cêntimo, e 0 ou vazio tira o artigo", () => {
    let d = definirReparto(doc(), "material", 1000.004);
    expect(d.repartoPorArtigo).toEqual({ material: 1000 });
    d = definirReparto(d, "material", 0);
    expect(d.repartoPorArtigo).toEqual({});
    d = definirReparto(d, "servico", null);
    expect(d.repartoPorArtigo).toEqual({});
  });
});

describe("parcelasDaFatura (30/70)", () => {
  it("o sinal e o saldo somam o total ao cêntimo, artigo a artigo", () => {
    const f = faturacaoPorArtigo(doc({ repartoPorArtigo: { flores: 8450, transporte: 1550 } }));
    const sinal = parcelasDaFatura(f, "sinal", 30);
    const saldo = parcelasDaFatura(f, "saldo", 30);
    expect(soma(sinal)).toBe(3000);
    expect(soma(saldo)).toBe(7000);
    expect(sinal).toEqual([
      { artigo: "flores", nome: "Flores e Elementos de Decoração", valor: 2535 },
      { artigo: "transporte", nome: "Transporte", valor: 465 },
    ]);
  });

  it("o cêntimo do arredondamento não se perde", () => {
    const f = {
      base: 100,
      artigos: [
        { artigo: "material" as const, nome: "Material", valor: 33.33 },
        { artigo: "servico" as const, nome: "Serviço", valor: 33.33 },
        { artigo: "transporte" as const, nome: "Transporte", valor: 33.34 },
      ],
    };
    expect(soma(parcelasDaFatura(f, "sinal", 30))).toBe(30);
    expect(soma(parcelasDaFatura(f, "saldo", 30))).toBe(70);
  });

  it("o texto a copiar diz os valores sem IVA e o total", () => {
    const f = faturacaoPorArtigo(doc({ repartoPorArtigo: { flores: 8450, transporte: 1550 } }));
    const t = textoDaFatura(parcelasDaFatura(f, "sinal", 30), "sinal", 30, 0.23);
    expect(t).toMatch(/^Sinal \(30%\)/);
    expect(t).toMatch(/Flores e Elementos de Decoração: 2\s?535,00\s€/);
    expect(t).toMatch(/Total sem IVA: 3\s?000,00\s€/);
  });
});

describe("a repartição é interna", () => {
  it("repartir depois do aceite não muda o selo da versão", () => {
    const sem = doc() as unknown as ProposalDoc;
    const com = definirReparto(sem, "transporte", 1550);
    expect(seloDoConteudo({ doc: com, total: 12300 })).toBe(
      seloDoConteudo({ doc: sem, total: 12300 }),
    );
  });

  it("o cartão só recebe os campos do dinheiro", () => {
    const d = docDaFaturacao({ ...doc(), notasInternas: "x", ref: "PO" } as unknown as ProposalDoc);
    expect(d).not.toHaveProperty("notasInternas");
    expect(d).not.toHaveProperty("ref");
    expect(d).toHaveProperty("totalAmount", 8450);
  });
});

describe("artigoSugerido", () => {
  it("sugere pelo nome, e cala-se quando não é claro", () => {
    expect(artigoSugerido("Decor Cerimónia")).toBe("flores");
    expect(artigoSugerido("Centros de mesa")).toBe("flores");
    expect(artigoSugerido("Deslocação da equipa Líquen")).toBe("transporte");
    expect(artigoSugerido("Transporte de flores")).toBe("transporte");
    expect(artigoSugerido("Montagem e desmontagem")).toBe("servico");
    expect(artigoSugerido("Aluguer de mobiliário")).toBe("material");
    expect(artigoSugerido("Wedding Coordinator")).toBe("wedding-coordinator");
    expect(artigoSugerido("Alojamento da equipa")).toBe("alojamento");
    expect(artigoSugerido("Opção B")).toBeNull();
  });
});

describe("a repartição não invalida o PDF guardado", () => {
  it("a chave do PDF é a mesma com e sem repartição", async () => {
    const { chaveDoPdf } = await import("@/lib/proposal-pdf-chave");
    const sem = doc() as unknown as ProposalDoc;
    const com = definirReparto(sem, "transporte", 1550) as unknown as ProposalDoc;
    expect(chaveDoPdf(com, "pt")).toBe(chaveDoPdf(sem, "pt"));
    // Mas uma mudança no que se desenha muda a chave.
    expect(chaveDoPdf({ ...sem, totalAmount: 1 } as ProposalDoc, "pt")).not.toBe(
      chaveDoPdf(sem, "pt"),
    );
  });
});

describe("modo linhas — o preço e o artigo de cada linha, postos na proposta", () => {
  const comLinhas = (extra: Partial<DocParaFaturar> = {}) =>
    doc({
      budgetAmounts: [6000, 2450],
      budgetArtigos: ["flores", "flores"],
      budgetExtras: [
        {
          label: "Deslocação da equipa Líquen",
          valueText: "1.550,00 € + IVA",
          artigo: "transporte",
        },
      ],
      ...extra,
    } as Partial<DocParaFaturar>);

  it("com tudo preenchido, fecha sem repartir nada à mão", () => {
    const f = faturacaoPorArtigo(comLinhas());
    expect(f.modo).toBe("linhas");
    expect(f.fecha).toBe(true);
    expect(f.artigos).toEqual([
      { artigo: "flores", nome: "Flores e Elementos de Decoração", valor: 8450 },
      { artigo: "transporte", nome: "Transporte", valor: 1550 },
    ]);
    expect(soma(parcelasDaFatura(f, "sinal", 30))).toBe(3000);
  });

  it("uma linha sem artigo não deixa faturar, e diz qual", () => {
    const f = faturacaoPorArtigo(comLinhas({ budgetArtigos: ["flores", null] } as never));
    expect(f.fecha).toBe(false);
    expect(f.porqueNaoFecha.join(" ")).toMatch(/Centros de mesa/);
  });

  it("o que falta para enviar: preços e artigos, linha a linha", () => {
    expect(faltasDaFaturacao(doc()).semPreco.map((l) => l.nome)).toEqual([
      "Decor Cerimónia",
      "Centros de mesa",
    ]);
    const so = faltasDaFaturacao(comLinhas({ budgetArtigos: [null, "flores"] } as never));
    expect(so.semPreco).toEqual([]);
    expect(so.semArtigo.length).toBe(1);
  });

  it("os setters escrevem o artigo sem tocar no resto", () => {
    const d = definirArtigoDaLinha(doc() as never, 1, "material") as DocParaFaturar;
    expect(d.budgetArtigos).toEqual([null, "material"]);
    expect(d.budgetItems).toEqual(["Decor Cerimónia", "Centros de mesa"]);
    const e = definirArtigoDoAdicional(doc() as never, 0, "transporte") as DocParaFaturar;
    expect((e.budgetExtras![0] as { artigo?: string }).artigo).toBe("transporte");
  });
});

describe("passar ao Moloni à mão", () => {
  it("o código é o do Moloni, e o valor cola-se sem apagar nada", () => {
    expect(refDoArtigo("flores")).toBe("EXE.2");
    expect(refDoArtigo("servico")).toBe("EXE.4");
    expect(valorParaColar(2535)).toBe("2535,00");
    expect(valorParaColar(1234.5)).toBe("1234,50");
    expect(valorParaColar(0.1 + 0.2)).toBe("0,30");
  });

  it("«Copiar tudo» leva o cliente, o NIF e o código de cada artigo", () => {
    const f = faturacaoPorArtigo(doc({ repartoPorArtigo: { flores: 8450, transporte: 1550 } }));
    const t = textoDaFatura(parcelasDaFatura(f, "saldo", 30), "saldo", 30, 0.23, {
      nome: "Exemplo Lda",
      nif: "123 456 789",
    });
    expect(t.split("\n")[0]).toBe("Cliente: Exemplo Lda · NIF 123456789");
    expect(t).toMatch(/EXE\.2 · Flores e Elementos de Decoração: 5\s?915,00\s€/);
    expect(t).toMatch(/EXE\.5 · Transporte: 1\s?085,00\s€/);
    expect(t).toMatch(/Total sem IVA: 7\s?000,00\s€/);
  });
});
