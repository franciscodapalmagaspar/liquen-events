import { describe, it, expect } from "vitest";
import { extrairConteudo } from "./extrair";
import { mapearConteudo } from "./mapear";
import {
  corpoDoPedido,
  avisoDaSomaUsada,
  avisosDoEcra,
  avisosDosDescontos,
  comServicosPostos,
  correccoesIniciais,
  escolherModoDoIva,
  escolherTotalDoDocumento,
  montarDocumento,
  somaDosServicos,
  usarASoma,
  valoresQueVaoSerGravados,
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

describe("8.ª revisão — linhas financeiras, uma lista só, e o total só delas", () => {
  const ler = (frases: Parameters<typeof docx>[0]) => mapearConteudo(extrairConteudo(docx(frases)));
  const financeiras = (p: ReturnType<typeof ler>) =>
    (p.valoresFinanceiros ?? []).map((v) => `${v.rotulo} ${v.valor}`);

  it("«Líquido a pagar 1.230» sem Total: é o total, e não é um serviço", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Transporte TESTE: 230,00 €",
      "Líquido a pagar: 1.230,00 €",
    ]);
    expect(p.budgetItems).toEqual(["Flores TESTE", "Transporte TESTE"]);
    expect(financeiras(p)).toEqual(["Líquido a pagar 1230"]);
    expect(p.totaisEscritos).toEqual({ sem: 1230, com: 1230 });
  });

  it("Base, Valor sem IVA, IVA, Valor com IVA e Total juntos: um par, e o modo escolhe o lado", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Base: 1.000,00 €",
      "Valor sem IVA: 1.000,00 €",
      "IVA (23%): 230,00 €",
      "Valor com IVA: 1.230,00 €",
      "Total: 1.230,00 €",
    ]);
    expect(p.budgetItems).toEqual(["Flores TESTE"]);
    expect(financeiras(p)).toHaveLength(5);
    expect(p.totaisEscritos).toEqual({ sem: 1000, com: 1230 });
    expect(escolherModoDoIva(p, correccoesIniciais(p), "acrescer").total).toBe("1000,00");
    expect(escolherModoDoIva(p, correccoesIniciais(p), "incluido").total).toBe("1230,00");
  });

  it("«Base tributável (s/ IVA)» e «Líquido (s/ IVA)» são financeiras e fazem o par", () => {
    for (const rotulo of ["Base tributável (s/ IVA)", "Líquido (s/ IVA)"]) {
      const p = ler(["Flores TESTE: 1.000,00 €", `${rotulo}: 1.000,00 €`, "Total: 1.230,00 €"]);
      expect(p.budgetItems, rotulo).toEqual(["Flores TESTE"]);
      expect(p.totaisEscritos, rotulo).toEqual({ sem: 1000, com: 1230 });
    }
  });

  it("«Valor líquido 1.000 / Total 1.000»: um total só", () => {
    const p = ler(["Flores TESTE: 1.000,00 €", "Valor líquido: 1.000,00 €", "Total: 1.000,00 €"]);
    expect(p.budgetItems).toEqual(["Flores TESTE"]);
    expect(p.totaisEscritos).toEqual({ sem: 1000, com: 1000 });
    expect(p.totalPorEscolher).toBeUndefined();
  });

  it("«Total sem IVA 1.000 / Total com IVA 1.230», sem linhas, nos dois modos", () => {
    const p = ler(["Total sem IVA: 1.000,00 €", "Total com IVA: 1.230,00 €"]);
    expect(p.budgetItems).toEqual([]);
    expect(p.ivaPorEscolher).toBe(true);
    const sem = escolherModoDoIva(p, correccoesIniciais(p), "acrescer");
    expect(valoresQueVaoSerGravados(p, sem)).toMatchObject({
      totalAmount: 1000,
      totalVatMode: "acrescer",
    });
    const com = escolherModoDoIva(p, correccoesIniciais(p), "incluido");
    expect(valoresQueVaoSerGravados(p, com)).toMatchObject({
      totalAmount: 1230,
      totalVatMode: "incluido",
    });
  });

  it("4b: «Reserva do espaço 230» é um serviço, mesmo quando 1.000 × 1,23 dá o total", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Reserva do espaço TESTE: 230,00 €",
      "Total: 1.230,00 €",
    ]);
    expect(p.budgetItems).toEqual(["Flores TESTE", "Reserva do espaço TESTE"]);
    expect(p.totaisEscritos).toEqual({ sem: 1230, com: 1230 });
  });

  it("«Base de bolo 80 / Total 1.080»: a base de bolo é um serviço", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Base de bolo em madeira TESTE: 80,00 €",
      "Total: 1.080,00 €",
    ]);
    expect(p.budgetItems).toEqual(["Flores TESTE", "Base de bolo em madeira TESTE"]);
    expect(p.totaisEscritos).toEqual({ sem: 1080, com: 1080 });
  });

  it("«Valor líquido do sinal» é financeira (nunca um serviço)", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Total: 1.000,00 €",
      "Valor líquido do sinal: 300,00 €",
    ]);
    expect(p.budgetItems).toEqual(["Flores TESTE"]);
    expect(financeiras(p)).toContain("Valor líquido do sinal 300");
  });

  it("um documento simples: zero avisos, e nenhum depois de ela escolher o IVA", () => {
    const p = ler([
      "Casamento Ana Teste & Rui Exemplo",
      "Data: 4 de julho de 2027",
      { h: 1, t: "Cerimónia" },
      { li: "Arco de flores" },
      { h: 1, t: "Orçamento" },
      "Flores TESTE: 500,00 €",
      "Velas TESTE: 250,00 €",
      "Total: 750,00 €",
    ]);
    expect(p.avisos).toEqual([]);
    const c = escolherModoDoIva(p, correccoesIniciais(p), "acrescer");
    expect(avisosDoEcra(p, c)).toEqual([]);
    expect(oQueFalta(c, p)).toEqual([]);
  });

  it("vários totais sem par: ela escolhe o total (nada pré-escolhido), e só depois pode criar", () => {
    const p = ler(["Flores TESTE: 1.000,00 €", "Total: 1.000,00 €", "Valor com IVA: 1.300,00 €"]);
    expect(p.totalPorEscolher).toBe(true);
    expect(p.totaisDoDocumento).toEqual([1000, 1300]);
    expect(p.totalAmount).toBeNull();
    expect(p.avisos.join(" ")).not.toMatch(/várias linhas de total|Escolhi/);
    const c = escolherModoDoIva(p, correccoesIniciais(p), "acrescer");
    expect(c.total).toBe("");
    expect(oQueFalta(c, p)).toContain("escolher o total do documento");
    const escolhido = escolherTotalDoDocumento(p, c, 1300);
    expect(oQueFalta(escolhido, p)).not.toContain("escolher o total do documento");
    // Mudar o IVA depois não troca o total que ela escolheu.
    expect(escolherModoDoIva(p, escolhido, "incluido").total).toBe("1300,00");
  });

  it("o Subtotal nunca substitui o total: fica só na lista", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Sub-total: 1.000,00 €",
      "Transporte TESTE: 100,00 €",
      "Total: 1.100,00 €",
    ]);
    expect(p.totaisEscritos).toEqual({ sem: 1100, com: 1100 });
    expect(p.totalPorEscolher).toBeUndefined();
    expect(financeiras(p)).toContain("Sub-total 1000");
  });

  it("dois pares pela taxa: nenhum é escolhido por ela — escolhe o total", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Base: 1.000,00 €",
      "Total: 1.230,00 €",
      "Total com IVA: 1.512,90 €",
    ]);
    expect(p.totalPorEscolher).toBe(true);
    expect(p.totaisEscritos).toBeUndefined();
  });

  it("«Usar a soma das linhas» soma só os serviços; com outro total no documento, aviso de dinheiro", () => {
    const p = ler([
      "Flores TESTE: 500,00 €",
      "Velas TESTE: 250,00 €",
      "Sinal: 225,00 €",
      "Total: 800,00 €",
      "Valor com IVA: 1.100,00 €",
    ]);
    const c = usarASoma(p, correccoesIniciais(p));
    expect(c.total).toBe("750,00");
    const a = avisoDaSomaUsada(p, c)!;
    expect(a.dinheiro).toBe(true);
    expect(a.texto).toMatch(/Usaste a soma das linhas \(750,00\s€\)/);
    // Sem total no documento, a soma não tem com que discordar.
    const s = ler(["Flores TESTE: 500,00 €", "Velas TESTE: 250,00 €"]);
    expect(avisoDaSomaUsada(s, usarASoma(s, correccoesIniciais(s)))).toBeNull();
  });

  it("«pôr como serviço»: a linha financeira passa às linhas, e grava-se com elas", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Pagamento do transporte: 230,00 €",
      "Total: 1.230,00 €",
    ]);
    expect(p.budgetItems).toEqual(["Flores TESTE"]);
    const i = p.valoresFinanceiros!.findIndex((v) => v.rotulo === "Pagamento do transporte");
    const c = escolherModoDoIva(p, { ...correccoesIniciais(p), servicosPostos: [i] }, "acrescer");
    expect(comServicosPostos(p, c).budgetItems).toEqual([
      "Flores TESTE",
      "Pagamento do transporte",
    ]);
    expect(somaDosServicos(p, c)).toBe(1230);
    expect(valoresQueVaoSerGravados(p, c).budgetAmounts).toEqual([1000, 230]);
    const doc = montarDocumento(p, c, new Map(), "x.docx");
    expect(doc.budgetItems).toEqual(["Flores TESTE", "Pagamento do transporte"]);
    expect(doc.budgetAmounts).toEqual([1000, 230]);
  });
});

describe("9.ª revisão — descontos, totais com outros nomes, e a taxa escrita", () => {
  const ler = (frases: Parameters<typeof docx>[0]) => mapearConteudo(extrairConteudo(docx(frases)));

  it("desconto, abatimento, restante, caução, reforço e remanescente não são serviços", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Reserva do espaço TESTE: 230,00 €",
      "Desconto: 100,00 €",
      "Abatimento: 30,00 €",
      "Restante: 500,00 €",
      "Caução: 200,00 €",
      "Reforço: 50,00 €",
      "Valor remanescente: 400,00 €",
      "Total: 1.100,00 €",
    ]);
    expect(p.budgetItems).toEqual(["Flores TESTE", "Reserva do espaço TESTE"]);
    expect(p.totaisEscritos).toEqual({ sem: 1100, com: 1100 });
    const descontos = avisosDosDescontos(p);
    expect(descontos.map((a) => a.texto)).toEqual([
      "«Desconto»: desconto de 100,00\u00a0€ — põe à mão no Fazer proposta.",
      "«Abatimento»: desconto de 30,00\u00a0€ — põe à mão no Fazer proposta.",
    ]);
    expect(descontos.every((a) => a.dinheiro)).toBe(true);
    expect(avisosDoEcra(p, correccoesIniciais(p)).map((a) => a.id)).toEqual(
      descontos.map((a) => a.id),
    );
  });

  it("«Valor global» é o total", () => {
    const p = ler(["Flores TESTE: 1.500,00 €", "Valor global: 1.500,00 €"]);
    expect(p.budgetItems).toEqual(["Flores TESTE"]);
    expect(p.totaisEscritos).toEqual({ sem: 1500, com: 1500 });
  });

  it("o sinal com «valor líquido» não compete com o total", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Total: 1.000,00 €",
      "Valor líquido do sinal: 300,00 €",
    ]);
    expect(p.totalPorEscolher).toBeUndefined();
    expect(p.totaisEscritos).toEqual({ sem: 1000, com: 1000 });
  });

  it("a prova do par usa a taxa escrita (6 %); com duas taxas, não há prova", () => {
    const seis = ler([
      "Livros TESTE: 100,00 €",
      "Total: 100,00 €",
      "IVA (6%): 6,00 €",
      "Total com IVA: 106,00 €",
    ]);
    expect(seis.totaisEscritos).toEqual({ sem: 100, com: 106 });
    const duas = ler([
      "Flores TESTE: 1.000,00 €",
      "Total: 1.000,00 €",
      "IVA (23%): 230,00 €",
      "Livros com IVA a 6%",
      "Total com IVA: 1.230,00 €",
    ]);
    expect(duas.totalPorEscolher).toBe(true);
    // Sem taxa escrita, 23 %.
    const nenhuma = ler([
      "Flores TESTE: 1.000,00 €",
      "Total: 1.000,00 €",
      "Total com IVA: 1.230,00 €",
    ]);
    expect(nenhuma.totaisEscritos).toEqual({ sem: 1000, com: 1230 });
  });
});
