import { describe, it, expect } from "vitest";
import { extrairConteudo } from "./extrair";
import { mapearConteudo } from "./mapear";
import {
  corpoDoPedido,
  avisoDaSomaUsada,
  avisosDoEcra,
  avisosDosDescontos,
  avisoDaSomaGravada,
  candidatasOrdenadas,
  correccoesIniciais,
  escolherModoDoIva,
  escolherTotal,
  propostaConferida,
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
      // 10.ª revisão: o total é sempre ela que o escolhe — nunca «alta».
      total: "media",
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
    // O total: uma candidata, e nada escolhido (10.ª revisão).
    expect(p.candidatasAoTotal?.map((x) => x.valor)).toEqual([3000]);
    expect(correccoesIniciais(p).total).toBe("");
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
    expect(oQueFalta(c0, p)).toEqual([
      "escolher o total",
      "escolher se os valores do documento têm IVA",
    ]);
    const c = escolherTotal(p, escolherModoDoIva(p, c0, "acrescer"), p.candidatasAoTotal![0].id);
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
    expect(p.candidatasAoTotal?.map((x) => x.valor)).toEqual([4500]);
    expect(p.totalVatMode).toBeNull();
    expect(p.confianca.iva).toBe("nada");
    expect(p.ivaPorEscolher).toBe(true);
    const c = correccoesIniciais(p);
    expect(oQueFalta(c, p)).toEqual([
      "escolher o total",
      "escolher se os valores do documento têm IVA",
    ]);
    const escolhida = escolherTotal(
      p,
      escolherModoDoIva(p, c, "incluido"),
      p.candidatasAoTotal![0].id,
    );
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

describe("10.ª revisão — as heurísticas só sugerem; o dinheiro confirma-o ela", () => {
  const ler = (frases: Parameters<typeof docx>[0]) => mapearConteudo(extrairConteudo(docx(frases)));
  const naoServicos = (p: ReturnType<typeof ler>) =>
    (p.linhasDoDocumento ?? []).filter((l) => !l.servico).map((l) => l.rotulo);
  const totais = (p: ReturnType<typeof ler>) =>
    (p.candidatasAoTotal ?? []).map((x) => [x.rotulo, x.valor]);
  /** O que ela faz: escolhe o IVA e a candidata com este valor. */
  const conferir = (p: ReturnType<typeof ler>, modo: "acrescer" | "incluido", valor: number) => {
    const c = escolherModoDoIva(p, { ...correccoesIniciais(p), clientNames: "Ana" }, modo);
    const x = p.candidatasAoTotal!.find((y) => y.valor === valor)!;
    return escolherTotal(p, c, x.id);
  };

  // ── A: o total, sempre confirmado ──
  it("A: um par pela taxa não deita fora as outras candidatas («Valor final», «Total do evento»)", () => {
    const p = ler([
      "Flores TESTE: 10.000,00 €",
      "Total sem IVA: 10.000,00 €",
      "Total com IVA: 12.300,00 €",
      "Valor final: 11.500,00 €",
      "Total do evento: 11.000,00 €",
    ]);
    expect(totais(p).map((x) => x[1])).toEqual([10000, 12300, 11500, 11000]);
    const c = escolherModoDoIva(p, correccoesIniciais(p), "acrescer");
    const lista = candidatasOrdenadas(p, c);
    // O par e o IVA ORDENAM e marcam; nada vem escolhido, e todas ficam.
    expect(lista.map((x) => [x.valor, x.sugerida])).toEqual([
      [10000, true],
      [12300, false],
      [11500, false],
      [11000, false],
    ]);
    expect(c.total).toBe("");
    expect(oQueFalta(c, p)).toContain("escolher o total");
    // Ela escolhe o «Valor final» — vale o dela.
    const dela = escolherTotal(p, c, lista[2].id);
    expect(valoresQueVaoSerGravados(p, dela).totalAmount).toBe(11500);
  });

  it("A: nem com uma só candidata o total vem escolhido", () => {
    const p = ler(["Flores TESTE: 500,00 €", "Total: 500,00 €"]);
    expect(totais(p)).toEqual([["Total", 500]]);
    const c = escolherModoDoIva(p, correccoesIniciais(p), "acrescer");
    expect(c.total).toBe("");
    expect(oQueFalta(c, p)).toContain("escolher o total");
  });

  it("«Total por pessoa: 95 € × 120 = 11 400 €»: a candidata é 11 400, com a linha inteira", () => {
    const p = ler([
      "Jantar TESTE: 11.400,00 €",
      "Total por pessoa: 95 € × 120 = 11 400 €",
      "Total p/ pessoa: 95,00 €",
      "Valor /pax: 95,00 €",
      "Total por convidado: 95,00 €",
    ]);
    expect(totais(p)).toEqual([["Total por pessoa: 95 € × 120 = 11 400 €", 11400]]);
  });

  it("S4: «3 000 = 3 690 − 690», com «sem IVA», sem nenhum aviso", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Velas TESTE: 2.000,00 €",
      "IVA (23%): 690,00 €",
      "Total: 3.690,00 €",
    ]);
    expect(totais(p)).toEqual([
      ["Total", 3690],
      [`${eur(3000)} = Total ${eur(3690)} − IVA (23%) ${eur(690)}`, 3000],
    ]);
    const c = conferir(p, "acrescer", 3000);
    expect(oQueFalta(c, p)).toEqual([]);
    expect(avisosDoEcra(p, c)).toEqual([]);
    expect(valoresQueVaoSerGravados(p, c)).toEqual({
      budgetAmounts: [1000, 2000],
      totalAmount: 3000,
      totalVatMode: "acrescer",
    });
  });

  // ── B e C: a taxa — um campo, 23 % por omissão; a do documento é só sugestão ──
  it("B: «IVA (6%)» sugere 6 % no campo; ela confirma-a ou corrige-a", () => {
    const p = ler(["Livros TESTE: 100,00 €", "IVA (6%): 6,00 €", "Total: 106,00 €"]);
    expect(p.taxaSugerida).toBe(0.06);
    const c = conferir(p, "acrescer", 100 + 6);
    expect(c.taxa).toBe("6");
    expect(oQueFalta(c, p)).toEqual(["confirmar a taxa do IVA (o documento sugere 6%)"]);
    expect(oQueFalta({ ...c, taxaConfirmada: true }, p)).toEqual([]);
    // Corrigir é escrever no campo: vale o dela.
    const corrigida = { ...c, taxa: "23", taxaConfirmada: true };
    expect(montarDocumento(p, corrigida, new Map(), "x.docx").vatRate).toBeUndefined();
    expect(montarDocumento(p, { ...c, taxaConfirmada: true }, new Map(), "x.docx").vatRate).toBe(
      0.06,
    );
  });

  it("C: a taxa NÃO se lê de «30% de sinal», «50% na adjudicação» nem «5% de desconto»", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Total: 1.000,00 € + IVA",
      "Pagamento: 30% de sinal na reserva, IVA incluído no restante.",
      "50% na adjudicação (IVA 6% sobre o sinal).",
      "Oferecemos 5% de desconto, com IVA 13%.",
    ]);
    expect(p.taxaSugerida).toBeUndefined();
    expect(correccoesIniciais(p).taxa).toBe("23");
  });

  // ── C: as linhas, cada uma com o seu interruptor ──
  it("reserva da data, reserva, valor da reserva, liquidação, saldo e entrada: não são serviço", () => {
    const p = ler([
      "Reserva do espaço TESTE: 500,00 €",
      "Reserva de mesa TESTE: 50,00 €",
      "Reserva da data: 300,00 €",
      "Reserva: 300,00 €",
      "Valor da reserva: 300,00 €",
      "Liquidação: 700,00 €",
      "Saldo: 700,00 €",
      "Entrada: 200,00 €",
      "Total: 550,00 €",
    ]);
    expect(p.budgetItems).toEqual(["Reserva do espaço TESTE", "Reserva de mesa TESTE"]);
    expect(naoServicos(p)).toEqual([
      "Reserva da data",
      "Reserva",
      "Valor da reserva",
      "Liquidação",
      "Saldo",
      "Entrada",
      "Total",
    ]);
  });

  it("«Oferta» é serviço a 0 €, e «Opcional» é opcional", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Oferta: centros de mesa TESTE 80,00 €",
      "Bar de gin TESTE (opcional): 300,00 €",
      "Total: 1.000,00 €",
    ]);
    expect(p.budgetItems).toEqual([
      "Flores TESTE",
      "Oferta: centros de mesa TESTE",
      "Bar de gin TESTE (opcional)",
    ]);
    expect(p.linhasEscritas).toEqual([1000, 0, 300]);
    expect(p.budgetOpcional).toEqual([false, false, true]);
    expect(p.linhasNormais).toEqual([true, true, false]);
    const c = conferir(p, "acrescer", 1000);
    expect(avisosDoEcra(p, c)).toEqual([]); // Uma oferta é serviço mesmo com uma palavra de dinheiro no rótulo.
    const q = ler(["Oferta (valor com IVA): 50,00 €", "Total: 0,00 €"]);
    expect(q.budgetItems).toEqual(["Oferta (valor com IVA)"]);
    expect(q.linhasEscritas).toEqual([0]);
  });

  it("«Flores (IVA 6%)» é um serviço: o IVA entre parênteses não o tira", () => {
    const p = ler(["Flores (IVA 6%): 500,00 €", "IVA (23%): 100,00 €", "Total: 600,00 €"]);
    expect(p.budgetItems).toEqual(["Flores (IVA 6%)"]);
    expect(naoServicos(p)).toEqual(["IVA (23%)", "Total"]);
  });

  it("o interruptor dela manda nas linhas que se gravam", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Pagamento do transporte: 230,00 €",
      "Total: 1.230,00 €",
    ]);
    const transporte = p.linhasDoDocumento!.find((l) => l.rotulo === "Pagamento do transporte")!;
    expect(transporte.servico).toBe(false);
    // F: o aviso da soma sugere o interruptor da linha suspeita.
    const c = conferir(p, "acrescer", 1230);
    expect(avisoDaSomaGravada(p, c)?.texto).toMatch(
      /Talvez «Pagamento do transporte» seja um serviço/,
    );
    const dela = { ...c, servicoDaLinha: { [transporte.chave]: true } };
    expect(propostaConferida(p, dela).budgetItems).toEqual([
      "Flores TESTE",
      "Pagamento do transporte",
    ]);
    expect(valoresQueVaoSerGravados(p, dela).budgetAmounts).toEqual([1000, 230]);
    expect(avisoDaSomaGravada(p, dela)).toBeNull();
    const doc = montarDocumento(p, dela, new Map(), "x.docx");
    expect(doc.budgetItems).toEqual(["Flores TESTE", "Pagamento do transporte"]);
    // E ao contrário: uma linha a mais, sugere que não é serviço.
    const q = ler(["Flores TESTE: 1.000,00 €", "Velas TESTE: 230,00 €", "Total: 1.000,00 €"]);
    expect(avisoDaSomaGravada(q, conferir(q, "acrescer", 1000))?.texto).toMatch(
      /Talvez «Velas TESTE» não seja um serviço/,
    );
  });

  // ── O que as rondas anteriores pediram, e continua a valer ──
  it("as linhas que já não eram serviço continuam fora, pré-postas", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Base de bolo em madeira TESTE: 80,00 €",
      "Reserva do espaço TESTE: 230,00 €",
      "Base: 1.000,00 €",
      "Valor sem IVA: 1.000,00 €",
      "Base tributável (s/ IVA): 1.000,00 €",
      "Líquido (s/ IVA): 1.000,00 €",
      "IVA (23%): 230,00 €",
      "Valor com IVA: 1.230,00 €",
      "Líquido a pagar: 1.230,00 €",
      "Valor líquido do sinal: 300,00 €",
      "Sub-total: 1.000,00 €",
      "Desconto: 100,00 €",
      "Total: 1.230,00 €",
    ]);
    expect(p.budgetItems).toEqual([
      "Flores TESTE",
      "Base de bolo em madeira TESTE",
      "Reserva do espaço TESTE",
    ]);
    // O sinal e o subtotal não são candidatas; o desconto é aviso de dinheiro.
    expect(totais(p).map((x) => x[0])).not.toContain("Valor líquido do sinal");
    expect(totais(p).map((x) => x[0])).not.toContain("Sub-total");
    expect(avisosDosDescontos(p).map((a) => a.texto)).toEqual([
      "«Desconto»: desconto de 100,00\u00a0€ — põe à mão no Fazer proposta.",
    ]);
  });

  it("«Valor global» é candidata ao total", () => {
    const p = ler(["Flores TESTE: 1.500,00 €", "Valor global: 1.500,00 €"]);
    expect(totais(p)).toEqual([["Valor global", 1500]]);
  });

  it("um documento simples: zero avisos, e só o total e o IVA para escolher", () => {
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
    const c = escolherTotal(
      p,
      escolherModoDoIva(p, correccoesIniciais(p), "acrescer"),
      p.candidatasAoTotal![0].id,
    );
    expect(avisosDoEcra(p, c)).toEqual([]);
    expect(oQueFalta(c, p)).toEqual([]);
  });

  it("«Usar a soma das linhas» soma só os serviços; com outro total no documento, aviso de dinheiro", () => {
    const p = ler([
      "Flores TESTE: 500,00 €",
      "Velas TESTE: 250,00 €",
      "Sinal: 225,00 €",
      "Total: 800,00 €",
    ]);
    const c = usarASoma(p, correccoesIniciais(p));
    expect(c.total).toBe("750,00");
    expect(oQueFalta(c, p)).not.toContain("escolher o total");
    expect(avisoDaSomaUsada(p, c)?.texto).toMatch(/Usaste a soma das linhas \(750,00\s€\)/);
    const s = ler(["Flores TESTE: 500,00 €", "Velas TESTE: 250,00 €"]);
    expect(avisoDaSomaUsada(s, usarASoma(s, correccoesIniciais(s)))).toBeNull();
    expect(somaDosServicos(p, c)).toBe(750);
  });
});

describe("12.ª revisão — a conferência no browser", () => {
  const ler = (frases: Parameters<typeof docx>[0]) => mapearConteudo(extrairConteudo(docx(frases)));
  const conferir = (p: ReturnType<typeof ler>, modo: "acrescer" | "incluido", valor: number) => {
    const c = escolherModoDoIva(p, { ...correccoesIniciais(p), clientNames: "Ana" }, modo);
    const x = p.candidatasAoTotal!.find((y) => y.valor === valor)!;
    return escolherTotal(p, c, x.id);
  };

  it("2: uma taxa que não se lê nunca cai em silêncio para 23 %", () => {
    const p = ler(["Flores TESTE: 123,00 €", "Total: 123,00 €"]);
    const c = conferir(p, "incluido", 123);
    expect(oQueFalta(c, p)).toEqual([]);
    for (const taxa of ["50", "abc", "", "-5"]) {
      const m = { ...c, taxa, taxaConfirmada: true };
      expect(oQueFalta(m, p), taxa).toContain("uma taxa entre 0 e 30%");
      // Nada se converte com uma taxa inventada.
      expect(valoresQueVaoSerGravados(p, m).budgetAmounts, taxa).toEqual([null]);
      expect(() => montarDocumento(p, m, new Map(), "x.docx"), taxa).toThrow(/taxa do IVA/);
    }
    // A gravada é a que está no campo.
    const treze = { ...c, taxa: "13", taxaConfirmada: true };
    expect(montarDocumento(p, treze, new Map(), "x.docx").vatRate).toBe(0.13);
    expect(valoresQueVaoSerGravados(p, treze).budgetAmounts).toEqual([108.85]);
  });

  it("2: o documento sugere 6 % e ela apaga o campo — pede uma taxa", () => {
    const p = ler(["Livros TESTE: 106,00 €", "IVA (6%): 6,00 €", "Total: 106,00 €"]);
    const c = { ...conferir(p, "incluido", 106), taxa: "", taxaConfirmada: true };
    expect(oQueFalta(c, p)).toEqual(["uma taxa entre 0 e 30%"]);
  });

  it("3: sem valores, a sugestão da taxa não trava o criar", () => {
    const p = ler(["Casamento Ana Teste & Rui Exemplo", "Os preços levam IVA (6%)."]);
    expect(p.taxaSugerida).toBe(0.06);
    expect(p.ivaPorEscolher).toBeFalsy();
    expect(oQueFalta(correccoesIniciais(p), p)).toEqual([]);
  });

  it("4: um desconto nunca passa a serviço, nem a +200 €", () => {
    const p = ler(["Flores TESTE: 1.000,00 €", "Desconto: 200,00 €", "Total: 800,00 €"]);
    const d = p.linhasDoDocumento!.find((l) => l.desconto)!;
    const c = { ...conferir(p, "acrescer", 800), servicoDaLinha: { [d.chave]: true } };
    expect(propostaConferida(p, c).budgetItems).toEqual(["Flores TESTE"]);
    expect(valoresQueVaoSerGravados(p, c).budgetAmounts).toEqual([1000]);
    expect(avisosDosDescontos(p, c)).toHaveLength(1);
  });

  it("5: «Reserva (30%)», «Reserva de 30%» e «Valor por pessoa» não são serviço", () => {
    const p = ler([
      "Flores TESTE: 1.000,00 €",
      "Reserva (30%): 300,00 €",
      "Reserva de 30%: 300,00 €",
      "Valor por pessoa: 95,00 €",
      "Reserva do espaço TESTE: 200,00 €",
      "Total: 1.200,00 €",
    ]);
    expect(p.budgetItems).toEqual(["Flores TESTE", "Reserva do espaço TESTE"]);
  });

  it("5: a linha «Total por pessoa: 95 € × 120 = 11 400 €» mostra-se inteira", () => {
    const p = ler(["Jantar TESTE: 11.400,00 €", "Total por pessoa: 95 € × 120 = 11 400 €"]);
    const l = p.linhasDoDocumento!.find((x) => !x.servico)!;
    expect(l.rotulo).toBe("Total por pessoa: 95 € × 120 = 11 400 €");
    expect(l.valor).toBe(11400);
  });

  it("6: «-3000» em «outro valor» é um erro, nunca 3000", () => {
    const p = ler(["Flores TESTE: 3.000,00 €", "Total: 3.000,00 €"]);
    const c = { ...escolherTotal(p, conferir(p, "acrescer", 3000), "outro"), total: "-3000" };
    expect(oQueFalta(c, p)).toContain("o total não pode ser negativo");
    expect(valoresQueVaoSerGravados(p, c).totalAmount).toBeNull();
    for (const t of ["-3000", "− 3.000,00", "(3000)"]) expect(totalEscrito(t), t).toBeNull();
  });
});
