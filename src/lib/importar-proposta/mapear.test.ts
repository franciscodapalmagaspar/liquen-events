import { describe, it, expect } from "vitest";
import { extrairConteudo } from "./extrair";
import { mapearConteudo } from "./mapear";
import {
  corpoDoPedido,
  correccoesIniciais,
  escolherModoDoIva,
  montarDocumento,
  oQueFalta,
  totalEscrito,
} from "./montar";
import { docx, pptx } from "./fabricar.testkit";
import { eur } from "../money";
import { resolveProposalMoney, withProposalDefaults } from "../proposal-doc";

// Dados inventados. Nenhum documento verdadeiro de uma cliente entra aqui.
const PROPOSTA_WORD = docx([
  "Proposta de Decoração — Casamento",
  "Noivos: Beatriz Teste e Duarte Exemplo",
  "Data: 19 de setembro de 2026",
  "Local: Quinta do Ensaio, Sintra",
  "120 convidados",
  "Contacto: beatriz.teste@exemplo.pt · info@liquen-events.com",
  { img: "capa.jpeg" },
  { h: 1, t: "Decoração da Cerimónia" },
  { li: "Arco de flores: eucalipto e rosas brancas" },
  { li: "Passadeira de linho" },
  { li: "em tom cru", nivel: 1 },
  { img: "cer1.jpeg" },
  { img: "cer2.jpeg" },
  { h: 1, t: "Mesas dos Convidados" },
  "Centros de mesa baixos",
  "Velas em vidro",
  { img: "mesa1.jpeg" },
  { h: 1, t: "Orçamento" },
  {
    tabela: [
      ["Decoração da cerimónia", "1.200,00 €"],
      ["Mesas dos convidados", "1.800,00 €"],
      ["Total", "3.000,00 € + IVA"],
      ["Sinal de 30%", "900,00 €"],
    ],
  },
  { h: 1, t: "Condições" },
  "A proposta é válida até 01/01/2026. Os valores apresentados resultam de uma estimativa feita com base nas informações recebidas e podem variar.",
]);

describe("uma proposta em Word, inventada, de ponta a ponta", () => {
  const p = mapearConteudo(extrairConteudo(PROPOSTA_WORD));

  it("lê o evento", () => {
    expect(p.clientNames).toBe("Beatriz Teste & Duarte Exemplo");
    expect(p.email).toBe("beatriz.teste@exemplo.pt");
    expect(p.dataIso).toBe("2026-09-19");
    expect(p.location).toBe("Quinta do Ensaio, Sintra");
    expect(p.eventType).toBe("Casamento");
    expect(p.tipoDoPedido).toBe("casamentos");
    expect(p.guests).toBe(120);
    expect(p.confianca).toMatchObject({
      clientNames: "alta",
      eventDate: "alta",
      location: "alta",
      guests: "alta",
      total: "alta",
      // 6.ª revisão: o IVA é sempre ela que o escolhe, também sem IA.
      iva: "nada",
    });
  });

  it("os serviços, com os subpontos na descrição", () => {
    expect(p.serviceGroups).toEqual([
      {
        letter: "a)",
        title: "Decoração da Cerimónia",
        items: [
          { label: "Arco de flores", desc: "eucalipto e rosas brancas" },
          { label: "Passadeira de linho", desc: "em tom cru" },
        ],
      },
      {
        letter: "b)",
        title: "Mesas dos Convidados",
        items: [
          { label: "Centros de mesa baixos", desc: "" },
          { label: "Velas em vidro", desc: "" },
        ],
      },
    ]);
  });

  it("o orçamento: linhas e total — o sinal fica de fora, e o IVA por escolher mesmo com «+ IVA»", () => {
    expect(p.budgetItems).toEqual(["Decoração da cerimónia", "Mesas dos convidados"]);
    // Os valores ficam à espera da escolha dela (o «+ IVA» do texto é só uma sugestão).
    expect(p.budgetAmounts).toEqual([null, null]);
    expect(p.linhasEscritas).toEqual([1200, 1800]);
    expect(p.totalAmount).toBe(3000);
    expect(p.totalVatMode).toBeNull();
    expect(p.ivaPorEscolher).toBe(true);
  });

  it("as fotografias: capa e um mood board por secção", () => {
    expect(p.capa).toBe("word/media/capa.jpeg");
    expect(p.moodBoards).toEqual([
      { title: "Decoração da Cerimónia", images: ["word/media/cer1.jpeg", "word/media/cer2.jpeg"] },
      { title: "Mesas dos Convidados", images: ["word/media/mesa1.jpeg"] },
    ]);
    expect(p.fotos.map((f) => f.destino)).toEqual(["capa", "moodboard", "moodboard", "moodboard"]);
  });

  it("o texto corrido que não cabe vai para as notas internas", () => {
    expect(p.notasInternas).toMatch(/estimativa feita com base/);
  });

  it("e o documento do estúdio sai com o dinheiro que o motor de sempre lê", () => {
    const c0 = correccoesIniciais(p);
    expect(oQueFalta(c0, p)).toEqual(["escolher se os valores do documento têm IVA"]);
    const c = escolherModoDoIva(p, c0, "acrescer");
    expect(oQueFalta(c, p)).toEqual([]);
    const carregadas = new Map([
      ["word/media/capa.jpeg", "Q1/capa.jpg"],
      ["word/media/cer1.jpeg", "Q1/c1.jpg"],
      // cer2 e mesa1 ficaram de fora
    ]);
    const doc = montarDocumento(p, c, carregadas, "antiga.docx", new Date(2026, 10, 13));
    expect(doc.clientNames).toBe("Beatriz Teste & Duarte Exemplo");
    expect(doc.eventDate).toBe("19 de setembro de 2026");
    expect(doc.guests).toBe("120 pax");
    expect(doc.coverImages).toEqual(["Q1/capa.jpg", ""]);
    // O mood board sem fotografias carregadas SAI: nada aparece que ela não viu.
    expect(doc.moodBoards).toEqual([{ title: "Decoração da Cerimónia", images: ["Q1/c1.jpg"] }]);
    expect(doc.totalText).toBe(`${eur(3000)} + IVA`);
    expect(doc.totalAmount).toBe(3000);
    expect(doc.totalVatMode).toBe("acrescer");
    expect(doc.budgetAmounts).toEqual([1200, 1800]);
    expect(doc.ref).toMatch(/Beatriz Teste & Duarte Exemplo/);
    expect(doc.notasInternas).toMatch(/^Proposta importada de «antiga\.docx» a 13\/11\/2026\./);
    const money = resolveProposalMoney(withProposalDefaults(doc));
    expect(money.base).toBe(3000);
    expect(money.gross).toBe(3690);
  });

  it("o corpo do pedido vai pelo caminho de sempre, sem preço", () => {
    const corpo = corpoDoPedido(p, correccoesIniciais(p), "antiga.docx", new Date(2026, 10, 13));
    expect(corpo).toEqual({
      name: "Beatriz Teste & Duarte Exemplo",
      email: "beatriz.teste@exemplo.pt",
      date: "2026-09-19",
      location: "Quinta do Ensaio, Sintra",
      guests: 120,
      category: "particulares",
      eventType: "casamentos",
      notes: "Proposta antiga importada de «antiga.docx» a 13/11/2026.",
    });
  });
});

describe("uma proposta em PowerPoint, inventada", () => {
  const p = mapearConteudo(
    extrairConteudo(
      pptx([
        {
          titulo: "Casamento Leonor & Vasco",
          texto: ["12.06.2027 · Herdade do Exemplo"],
          imagens: ["capa.jpg", "capa2.jpg"],
        },
        { titulo: "Inspiração", imagens: Array.from({ length: 12 }, (_, i) => `i${i}.jpg`) },
        { titulo: "Bar e Cocktail", marcadores: ["Bar de madeira", "Lounge com tapetes"] },
        { titulo: "Investimento", texto: ["Valor total 4.500 €"] },
      ]),
    ),
  );

  it("o nome, a data, o local pelo nome do sítio", () => {
    expect(p.clientNames).toBe("Leonor & Vasco");
    expect(p.dataIso).toBe("2027-06-12");
    expect(p.location).toBe("Herdade do Exemplo");
    expect(p.confianca.location).toBe("media");
  });

  it("parte um mood board com mais de 10 fotografias, e a 2.ª foto da capa vai para um board", () => {
    expect(p.capa).toBe("ppt/media/capa.jpg");
    expect(p.moodBoards.map((b) => [b.title, b.images.length])).toEqual([
      ["Casamento Leonor & Vasco", 1],
      ["Inspiração", 10],
      ["Inspiração (2)", 2],
    ]);
  });

  it("o total sem nada sobre IVA: não decide, avisa, e não deixa criar sem ela escolher", () => {
    expect(p.totalAmount).toBe(4500);
    expect(p.totalVatMode).toBeNull();
    expect(p.confianca.iva).toBe("nada");
    expect(p.ivaPorEscolher).toBe(true);
    const c = correccoesIniciais(p);
    expect(oQueFalta(c, p)).toEqual(["escolher se os valores do documento têm IVA"]);
    const escolhida = escolherModoDoIva(p, c, "incluido");
    expect(oQueFalta(escolhida, p)).toEqual([]);
    const doc = montarDocumento(p, escolhida, new Map(), "x.pptx");
    expect(doc.totalText).toBe(eur(4500));
    expect(doc.totalVatMode).toBe("incluido");
  });

  it("os serviços pelo título da secção", () => {
    expect(p.serviceGroups.map((g) => g.title)).toEqual(["Bar e Cocktail"]);
  });
});

describe("o que não se lê fica marcado, não adivinhado", () => {
  it("um documento sem nada reconhecível", () => {
    const p = mapearConteudo(extrairConteudo(docx(["Olá.", "Até breve."])));
    expect(p.clientNames).toBe("");
    expect(p.dataIso).toBe("");
    expect(p.totalAmount).toBeNull();
    expect(Object.values(p.confianca).every((v) => v === "nada")).toBe(true);
    expect(p.avisos).toEqual(
      expect.arrayContaining([
        "Não encontrei o nome do casal ou do cliente. Escreve-o.",
        "Não encontrei a data do evento.",
      ]),
    );
    expect(oQueFalta(correccoesIniciais(p))).toEqual(["o nome do cliente"]);
  });

  it("sem linha de total, diz a soma e não a usa", () => {
    const p = mapearConteudo(
      extrairConteudo(docx([{ h: 1, t: "Orçamento" }, "Flores 500 €", "Velas 250 €"])),
    );
    expect(p.totalAmount).toBeNull();
    expect(p.somaDasLinhas).toBe(750);
    expect(p.avisos.join(" ")).toMatch(/somam 750,00/);
    // E os valores das linhas não passam: não se sabe se têm IVA.
    expect(p.budgetAmounts).toEqual([null, null]);
  });

  it("o total que ela escreve lê-se como o resto da casa", () => {
    expect(totalEscrito("3.200,50")).toBe(3200.5);
    expect(totalEscrito("")).toBeNull();
    expect(totalEscrito("abc")).toBeNull();
  });
});

describe("6.ª revisão — sem IA, o IVA e as linhas pelas mesmas regras da leitura", () => {
  const p = mapearConteudo(
    extrairConteudo(
      docx([
        "Noivos: Teste & Exemplo",
        { h: 1, t: "Orçamento" },
        {
          tabela: [
            ["Flores TESTE", "25,00 €"],
            ["Velas TESTE", "25,00 €"],
            ["Toalhas TESTE", "10,00 €"],
            ["Subtotal", "60,00 €"],
            ["Base", "40,65 €"],
            ["IVA (23%)", "9,35 €"],
            ["Total", "50,00 €"],
            ["Sinal", "15,00 €"],
            ["Prestação", "35,00 €"],
          ],
        },
      ]),
    ),
  );

  it("Base, Subtotal, IVA, Total, Sinal e Prestação nunca são linhas do orçamento", () => {
    expect(p.budgetItems).toEqual(["Flores TESTE", "Velas TESTE", "Toalhas TESTE"]);
    expect(p.linhasEscritas).toEqual([25, 25, 10]);
  });

  it("e o IVA fica por escolher, com os valores à espera da escolha", () => {
    expect(p.ivaPorEscolher).toBe(true);
    expect(p.totalVatMode).toBeNull();
    expect(p.budgetAmounts).toEqual([null, null, null]);
    const c = correccoesIniciais(p);
    expect(oQueFalta(c, p)).toContain("escolher se os valores do documento têm IVA");
  });
});

describe("6.ª revisão — sem IA, a base do total como a leitura a dá", () => {
  const ler = (frases: Parameters<typeof docx>[0]) => mapearConteudo(extrairConteudo(docx(frases)));

  it("«Base: 40,65 €» é o total sem IVA; o «Total: 50 €» o com IVA", () => {
    const p = ler([
      "Flores TESTE: 25,00 €",
      "Velas TESTE: 25,00 €",
      "Total: 50,00 €",
      "Base: 40,65 €",
    ]);
    expect(p.totaisEscritos).toEqual({ sem: 40.65, com: 50 });
    expect(p.totalAmount).toBe(40.65);
  });

  it("um «Subtotal» só é a base quando ele + IVA dá o total", () => {
    const c = ler([
      "Flores TESTE: 1.000,00 €",
      "Velas TESTE: 740,00 €",
      "Subtotal: 1.740,00 €",
      "IVA (23%): 400,20 €",
      "Total: 2.140,20 €",
    ]);
    expect(c.totaisEscritos).toEqual({ sem: 1740, com: 2140.2 });
    // Um subtotal antes de um desconto não é a base.
    const d = ler([
      "Flores TESTE: 1.000,00 €",
      "Subtotal: 1.000,00 €",
      "Desconto: 100,00 €",
      "Total: 900,00 €",
    ]);
    expect(d.totaisEscritos).toEqual({ sem: 900, com: 900 });
    // Nem um subtotal antes de mais uma linha.
    const e = ler([
      "Flores TESTE: 1.000,00 €",
      "Subtotal: 1.000,00 €",
      "Transporte TESTE: 100,00 €",
      "Total: 1.100,00 €",
    ]);
    expect(e.totaisEscritos).toEqual({ sem: 1100, com: 1100 });
  });

  it("uma «Base» maior do que o total não é a base dele", () => {
    const p = ler(["Flores TESTE: 50,00 €", "Total: 50,00 €", "Base: 60,00 €"]);
    expect(p.totaisEscritos).toEqual({ sem: 50, com: 50 });
  });
});
