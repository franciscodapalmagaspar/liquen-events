import { describe, it, expect } from "vitest";
import { modoDoIvaNoTexto, numerosDe, verificar } from "./verificar";
import { preencher } from "./preencher";
import {
  documentoDeTeste,
  leituraCerta,
  leituraComIvaASeis,
  leituraComIvaIncluido,
  leituraSoDoOrcamento,
  propostaComIvaASeis,
  propostaComIvaIncluido,
} from "./fixtures.testkit";
import { docx } from "../fabricar.testkit";

const ids = (v: ReturnType<typeof verificar>) => v.avisos.map((a) => a.id);

describe("a verificação, com a leitura certa", () => {
  it("não inventa avisos: tudo bate, nada se perde (só o sinal fora das linhas, a confirmar)", () => {
    const v = verificar(documentoDeTeste(), leituraCerta());
    expect(v.avisos.map((a) => [a.id, a.dinheiro])).toEqual([["nao-usado:p10:52200", true]]);
    expect(v.inventados).toBe(0);
    expect(v.contas.somaDasLinhas).toBe(1740);
    expect(v.valores.every((x) => x.usado)).toBe(true);
  });
});

describe("(a) citações e textos inventados", () => {
  it("um total cuja citação não está no documento sai, com aviso de dinheiro", () => {
    const l = leituraCerta();
    l.orcamento.totalSemIva = { valor: 1740, citacao: "Total geral: 1.740,00 €" };
    const v = verificar(documentoDeTeste(), l);
    expect(v.leitura.orcamento.totalSemIva.valor).toBeNull();
    const a = v.avisos.find((x) => x.id === "inventado:orcamento.total")!;
    expect(a.dinheiro).toBe(true);
    expect(a.texto).toMatch(/não está no documento/);
    expect(v.inventados).toBeGreaterThan(0);
  });

  it("um valor que não está na sua citação sai (a citação existe, o número não)", () => {
    const l = leituraCerta();
    l.orcamento.linhas[0].totalDaLinha = {
      valor: 1250,
      citacao: "Decoração da cerimónia | 1.200,00 €",
    };
    const v = verificar(documentoDeTeste(), l);
    expect(v.leitura.orcamento.linhas[0].totalDaLinha.valor).toBeNull();
    expect(ids(v)).toContain("inventado:orcamento.linhas.0");
  });

  it("uma descrição reescrita pela IA não passa para a proposta", () => {
    const l = leituraCerta();
    l.servicos[0].itens[0].descricao = "arco lindíssimo com flores frescas";
    const v = verificar(documentoDeTeste(), l);
    expect(v.leitura.servicos[0].itens[0].descricao).toBeNull();
    expect(ids(v)).toContain("inventado:servicos.0.0.descricao");
  });

  it("um nome que não está no documento não preenche o cliente", () => {
    const l = leituraCerta();
    l.cliente.nomes = "Maria & José";
    const v = verificar(documentoDeTeste(), l);
    expect(v.leitura.cliente.nomes).toBeNull();
    expect(preencher(documentoDeTeste(), v).clientNames).toBe("");
  });

  it("a comparação é normalizada: maiúsculas, aspas e espaços não contam", () => {
    const l = leituraCerta();
    l.cliente.nomes = "ANA   TESTE & rui exemplo";
    expect(verificar(documentoDeTeste(), l).leitura.cliente.nomes).not.toBeNull();
  });
});

describe("(b) cada valor em € do documento tem sítio", () => {
  it("um valor que ninguém usou nem listou é um aviso de dinheiro", () => {
    const l = leituraCerta();
    l.orcamento.valoresNaoUsados = [];
    const v = verificar(documentoDeTeste(), l);
    const a = v.avisos.find((x) => x.id.startsWith("valor:"))!;
    expect(a.dinheiro).toBe(true);
    expect(a.texto).toMatch(/522,00\s€/);
    expect(a.texto).toMatch(/não está em nenhuma linha nem total/);
  });

  it("uma linha do orçamento que a leitura esqueceu é apanhada (valor e soma)", () => {
    const l = leituraCerta();
    l.orcamento.linhas = l.orcamento.linhas.slice(0, 1);
    const v = verificar(documentoDeTeste(), l);
    expect(ids(v)).toContain("conta:soma");
    expect(v.avisos.some((a) => a.id.startsWith("valor:") && /540,00/.test(a.texto))).toBe(true);
  });
});

describe("(c) as contas", () => {
  it("as linhas que não somam o total: «falta uma linha de 50 €?»", () => {
    const bytes = docx([
      { h: 1, t: "Orçamento" },
      "Decoração: 1.200,00 €",
      "Flores: 500,00 €",
      "Transporte: 50,00 €",
      "Total: 1.750,00 € + IVA",
    ]);
    const d = documentoDeTeste(bytes);
    const linha = (descricao: string, valor: number, citacao: string) => ({
      descricao,
      quantidade: { valor: null, citacao: null },
      precoUnitario: { valor: null, citacao: null },
      totalDaLinha: { valor, citacao },
      tipo: "normal" as const,
    });
    const l = leituraCerta();
    l.servicos = [];
    l.cliente.nomes = null;
    l.evento = {
      ...l.evento,
      data: { valor: null, citacao: null },
      local: null,
      tipo: { valor: null, citacao: null },
      convidados: { valor: null, citacao: null },
    };
    l.notas = [];
    l.imagens = [];
    l.naoColocados = [];
    l.orcamento.linhas = [
      linha("Decoração", 1200, "Decoração: 1.200,00 €"),
      linha("Flores", 500, "Flores: 500,00 €"),
    ];
    l.orcamento.totalSemIva = { valor: 1750, citacao: "Total: 1.750,00 € + IVA" };
    l.orcamento.valoresNaoUsados = [
      { valor: 50, citacao: "Transporte: 50,00 €", motivo: "deslocação" },
    ];
    const v = verificar(d, l);
    const a = v.avisos.find((x) => x.id === "conta:soma")!;
    expect(a.texto).toMatch(
      /diz 1750,00\s€, as linhas somam 1700,00\s€ — falta uma linha de 50,00\s€\?/,
    );
    expect(a.dinheiro).toBe(true);
  });

  it("quantidade × preço que não dá o total da linha", () => {
    const l = leituraCerta();
    l.orcamento.linhas[1].quantidade = { valor: 11, citacao: "Centros de mesa" };
    // 11 não está na citação → sai; com 12 certo, a conta bate. Testa-se a conta com uma citação verdadeira:
    l.orcamento.linhas[1].quantidade = { valor: 12, citacao: "12 x 45,00 €" };
    l.orcamento.linhas[1].totalDaLinha = { valor: 45, citacao: "12 x 45,00 €" };
    const v = verificar(documentoDeTeste(), l);
    expect(v.avisos.find((x) => x.id === "conta:linha:1")?.texto).toMatch(
      /12 × 45,00\s€ = 45,00\s€, mas 12 × 45,00\s€ são 540,00\s€/,
    );
  });

  it("o total sem IVA e o com IVA têm de bater pela taxa (regra da casa)", () => {
    const bytes = docx(["Total: 1.000,00 € + IVA", "Total com IVA: 1.250,00 €"]);
    const l = leituraCerta();
    Object.assign(l, { servicos: [], notas: [], imagens: [], naoColocados: [] });
    l.cliente.nomes = null;
    l.evento = {
      data: { valor: null, citacao: null },
      local: null,
      tipo: { valor: null, citacao: null },
      convidados: { valor: null, citacao: null },
      idioma: null,
    };
    l.orcamento.linhas = [];
    l.orcamento.valoresNaoUsados = [];
    l.orcamento.totalSemIva = { valor: 1000, citacao: "Total: 1.000,00 € + IVA" };
    l.orcamento.totalComIva = { valor: 1250, citacao: "Total com IVA: 1.250,00 €" };
    const v = verificar(documentoDeTeste(bytes), l);
    expect(v.avisos.find((x) => x.id === "conta:base-e-bruto")?.texto).toMatch(
      /não batem com o IVA a 23%/,
    );
    // Com 1.230 € bate.
    const bem = docx(["Total: 1.000,00 € + IVA", "Total com IVA: 1.230,00 €"]);
    l.orcamento.totalComIva = { valor: 1230, citacao: "Total com IVA: 1.230,00 €" };
    expect(verificar(documentoDeTeste(bem), l).avisos.map((a) => a.id)).not.toContain(
      "conta:base-e-bruto",
    );
  });
});

describe("(d) as imagens", () => {
  it("uma imagem sem destino é avisada", () => {
    const l = leituraCerta();
    l.imagens = l.imagens.slice(0, 1);
    const v = verificar(documentoDeTeste(), l);
    expect(ids(v)).toContain("imagem:sem-destino:im2");
  });

  it("um tema inventado é trocado pelo título de onde a imagem está", () => {
    const l = leituraCerta();
    l.imagens[1].tema = "Romântico e campestre";
    const v = verificar(documentoDeTeste(), l);
    expect(v.leitura.imagens[1].tema).toBe("Decoração da Cerimónia");
  });
});

describe("(e) nenhum parágrafo se perde", () => {
  it("um parágrafo que não foi para lado nenhum nem foi listado é avisado", () => {
    const l = leituraCerta();
    l.notas = l.notas.filter((n) => n.tipo !== "validade");
    const v = verificar(documentoDeTeste(), l);
    const a = v.avisos.find((x) => x.id.startsWith("perdido:"))!;
    expect(a.texto).toMatch(/Validade da proposta: 30 dias/);
    expect(v.naoColocados.map((x) => x.texto)).toContain("Validade da proposta: 30 dias.");
  });

  it("listado em «não colocados» com motivo: sem aviso, mas vai para as notas internas", () => {
    const l = leituraCerta();
    l.notas = l.notas.filter((n) => n.tipo !== "validade");
    const d = documentoDeTeste();
    const id = d.unidades.find((u) => u.tipo === "paragrafo" && u.texto.startsWith("Validade"))!.id;
    l.naoColocados.push({ id, motivo: "condição antiga" });
    const v = verificar(d, l);
    expect(ids(v).some((x) => x.startsWith("perdido:"))).toBe(false);
    expect(preencher(d, v).notasInternas).toMatch(/Validade da proposta/);
  });
});

describe("(f) a data", () => {
  it("uma data que não existe sai", () => {
    const l = leituraCerta();
    l.evento.data = { valor: "2027-02-30", citacao: "Data: 12 de junho de 2027" };
    const v = verificar(documentoDeTeste(), l);
    expect(v.leitura.evento.data.valor).toBeNull();
    expect(v.avisos.find((x) => x.id === "inventado:evento.data")?.texto).toMatch(
      /não é uma data válida/,
    );
  });

  it("uma data que não é a da citação sai", () => {
    const l = leituraCerta();
    l.evento.data = { valor: "2027-06-13", citacao: "Data: 12 de junho de 2027" };
    expect(verificar(documentoDeTeste(), l).leitura.evento.data.valor).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// REGRESSÕES DA REVISÃO INDEPENDENTE (14/11)
// ════════════════════════════════════════════════════════════════════════════

describe("achado 1 — o IVA cobrado duas vezes", () => {
  const bytes = () =>
    docx([
      { h: 1, t: "Orçamento" },
      "Decoração TESTE: 1.740,00 €",
      "Total 1.740,00 € (IVA incluído)",
    ]);
  const leituraErrada = () => {
    const l = leituraSoDoOrcamento();
    l.naoColocados = [{ id: "p1", motivo: "título" }];
    l.orcamento.linhas = [
      {
        descricao: "Decoração TESTE",
        quantidade: { valor: null, citacao: null },
        precoUnitario: { valor: null, citacao: null },
        totalDaLinha: { valor: 1740, citacao: "Decoração TESTE: 1.740,00 €" },
        tipo: "normal",
      },
    ];
    // A leitura diz SEM IVA onde o documento diz «IVA incluído».
    l.orcamento.totalSemIva = { valor: 1740, citacao: "Total 1.740,00 € (IVA incluído)" };
    l.orcamento.iva.valoresDasLinhas = { valor: "sem_iva", citacao: "Total 1.740,00 €" };
    l.orcamento.iva.valoresDoTotal = { valor: "sem_iva", citacao: null };
    return l;
  };

  it("apanha a contradição, com aviso de dinheiro, e o IVA fica por escolher", () => {
    const d = documentoDeTeste(bytes());
    const v = verificar(d, leituraErrada());
    const a = v.avisos.find((x) => x.id === "iva:contradicao:orcamento.total")!;
    expect(a.dinheiro).toBe(true);
    expect(a.texto).toMatch(/cobrado duas vezes/);
    expect(v.contas.modoDoTotal).toBe("desconhecido");
    const p = preencher(d, v);
    expect(p.totalVatMode).toBeNull();
    // E sem modo, o estúdio não pode somar IVA por cima: o ecrã obriga a escolher.
  });

  it("o modo sem citação que o diga não vale (e é um aviso de dinheiro)", () => {
    const d = documentoDeTeste(bytes());
    const v = verificar(d, leituraErrada());
    expect(v.avisos.find((x) => x.id === "iva:sem-citacao:orcamento")?.dinheiro).toBe(true);
    expect(v.contas.modoDasLinhas).toBe("desconhecido");
    expect(preencher(d, v).budgetAmounts).toEqual([null]);
  });

  it("com IVA incluído bem lido, passa como «incluído» e sem avisos", () => {
    const v = verificar(documentoDeTeste(propostaComIvaIncluido()), leituraComIvaIncluido());
    expect(v.avisos).toEqual([]);
    expect(v.contas.modoDoTotal).toBe("com_iva");
  });
});

describe("achado 2 — a taxa de IVA tem de ter «%» e «IVA»", () => {
  it("12 tirado de «Data: 12 de junho de 2027» não é uma taxa", () => {
    const l = leituraCerta();
    l.orcamento.iva.taxa = { valor: 12, citacao: "Data: 12 de junho de 2027" };
    const v = verificar(documentoDeTeste(), l);
    expect(v.contas.vatRate).toBe(0.23);
    expect(v.avisos.find((x) => x.id === "inventado:orcamento.iva")?.dinheiro).toBe(true);
  });

  it("«30%» sem a palavra IVA (o sinal) também não", () => {
    const l = leituraCerta();
    l.orcamento.iva.taxa = { valor: 30, citacao: "Sinal de 30%" };
    expect(verificar(documentoDeTeste(), l).contas.vatRate).toBe(0.23);
  });

  it("6% escrito ao lado de IVA vale — e é sempre aviso de dinheiro", () => {
    const v = verificar(documentoDeTeste(propostaComIvaASeis()), leituraComIvaASeis());
    expect(v.contas.vatRate).toBe(0.06);
    expect(v.avisos.map((a) => [a.id, a.dinheiro])).toEqual([["iva:taxa-diferente", true]]);
  });
});

describe("achado 3 — as citações são contíguas numa unidade, e os números inteiros", () => {
  it("740 não está dentro de «1.740,00 €»", () => {
    const l = leituraCerta();
    l.orcamento.totalSemIva = { valor: 740, citacao: "740,00 € + IVA" };
    const v = verificar(documentoDeTeste(), l);
    expect(v.leitura.orcamento.totalSemIva.valor).toBeNull();
  });

  it("250 não está dentro de «1 250,00 €» (milhares com espaço)", () => {
    const d = documentoDeTeste(docx(["Flores TESTE: 1 250,00 €"]));
    const l = leituraSoDoOrcamento();
    l.orcamento.linhas = [
      {
        descricao: "Flores TESTE",
        quantidade: { valor: null, citacao: null },
        precoUnitario: { valor: null, citacao: null },
        totalDaLinha: { valor: 250, citacao: "250,00 €" },
        tipo: "normal",
      },
    ];
    expect(verificar(d, l).leitura.orcamento.linhas[0].totalDaLinha.valor).toBeNull();
    l.orcamento.linhas[0].totalDaLinha = { valor: 1250, citacao: "1 250,00 €" };
    expect(verificar(d, l).leitura.orcamento.linhas[0].totalDaLinha.valor).toBe(1250);
  });

  it("«Total\n7» não passa por o 7 estar em «2027» noutra linha", () => {
    const l = leituraCerta();
    l.orcamento.totalSemIva = { valor: 7, citacao: "Total\n7" };
    expect(verificar(documentoDeTeste(), l).leitura.orcamento.totalSemIva.valor).toBeNull();
  });

  it("uma citação que salta de um parágrafo para o seguinte não vale (texto)", () => {
    const l = leituraCerta();
    l.evento.tipo = { valor: "Casamento", citacao: "Casamento Ana Teste" };
    expect(verificar(documentoDeTeste(), l).leitura.evento.tipo.valor).toBeNull();
  });

  it("uma citação que salta de uma unidade para a seguinte não vale", () => {
    const l = leituraCerta();
    l.evento.convidados = { valor: 120, citacao: "Local: Quinta do Teste, Sintra 120 convidados" };
    expect(verificar(documentoDeTeste(), l).leitura.evento.convidados.valor).toBeNull();
  });
});

describe("achado 4 — valores verdadeiros arrumados em «não usados»", () => {
  it("baixar a linha para 200 e o total para 740, e esconder 1200 e 1740: apanhado", () => {
    const l = leituraCerta();
    l.orcamento.linhas = l.orcamento.linhas.slice(0, 1);
    l.orcamento.linhas[0].totalDaLinha = { valor: 200, citacao: "200,00 €" };
    l.orcamento.totalSemIva = { valor: 740, citacao: "740,00 € + IVA" };
    l.orcamento.valoresNaoUsados.push(
      { valor: 1200, citacao: "1.200,00 €", motivo: "outro" },
      { valor: 1740, citacao: "1.740,00 €", motivo: "outro" },
    );
    const v = verificar(documentoDeTeste(), l);
    expect(v.leitura.orcamento.linhas[0].totalDaLinha.valor).toBeNull();
    expect(v.leitura.orcamento.totalSemIva.valor).toBeNull();
    const naoUsados = v.avisos.filter((a) => a.id.startsWith("nao-usado:"));
    expect(naoUsados.map((a) => a.id).sort()).toEqual(
      ["nao-usado:l2:120000", "nao-usado:l4:174000", "nao-usado:p10:52200"].sort(),
    );
    expect(naoUsados.every((a) => a.dinheiro)).toBe(true);
  });

  it("um «não usado» só vale na unidade da sua citação (sem ir buscar a outra)", () => {
    const d = documentoDeTeste(docx(["Sinal de 30%: 522,00 €", "Reforço TESTE: 522,00 €"]));
    const l = leituraSoDoOrcamento();
    l.orcamento.valoresNaoUsados = [
      { valor: 522, citacao: "Sinal de 30%: 522,00 €", motivo: "sinal" },
    ];
    const v = verificar(d, l);
    expect(v.avisos.map((a) => a.id)).toContain("valor:p2:52200");
  });
});

describe("achado 8 — o aviso das linhas sem modo diz a verdade", () => {
  it("diz que os valores NÃO passam, e não passam", () => {
    const l = leituraCerta();
    l.orcamento.iva.valoresDasLinhas = { valor: "desconhecido", citacao: null };
    const d = documentoDeTeste();
    const v = verificar(d, l);
    expect(v.avisos.find((a) => a.id === "iva:linhas")?.texto).toMatch(/NÃO passam/);
    expect(preencher(d, v).budgetAmounts).toEqual([null, null]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// REGRESSÕES DA SEGUNDA REVISÃO (14/11)
// ════════════════════════════════════════════════════════════════════════════

const linhaCom = (descricao: string, valor: number, citacao: string, qtd?: [number, string]) => ({
  descricao,
  quantidade: qtd ? { valor: qtd[0], citacao: qtd[1] } : { valor: null, citacao: null },
  precoUnitario: { valor: null, citacao: null },
  totalDaLinha: { valor, citacao },
  tipo: "normal" as const,
});

describe("2.ª revisão, BLOQUEANTE — a negação do IVA lê-se primeiro", () => {
  it.each([
    ["Total: 1.230,00 € (não inclui IVA)", "sem"],
    ["Os valores apresentados não incluem o IVA", "sem"],
    ["IVA não incluído", "sem"],
    ["Valores excl. IVA", "sem"],
    ["Preço sem IVA", "sem"],
    ["1.000,00 € + IVA", "sem"],
    ["acresce IVA à taxa legal", "sem"],
    ["IVA incluído", "com"],
    ["Total c/ IVA: 1.230,00 €", "com"],
    ["Os valores incluem o IVA", "com"],
    ["IVA à taxa legal em vigor", null],
    ["Isento de IVA (art. 9.º)", "isento"],
    ["1.000,00 € + IVA (1.230,00 € com IVA)", "ambos"],
  ])("«%s» → %s", (frase, esperado) => {
    expect(modoDoIvaNoTexto(frase)).toBe(esperado);
  });

  it("«(não inclui IVA)» lido como COM IVA: apanhado, e a linha NÃO passa a 1.000 €", () => {
    const d = documentoDeTeste(
      docx([
        { h: 1, t: "Orçamento" },
        "Decoração TESTE: 1.230,00 €",
        "Total: 1.230,00 € (não inclui IVA)",
      ]),
    );
    const l = leituraSoDoOrcamento();
    l.naoColocados = [{ id: "p1", motivo: "título" }];
    l.orcamento.linhas = [linhaCom("Decoração TESTE", 1230, "Decoração TESTE: 1.230,00 €")];
    l.orcamento.totalComIva = { valor: 1230, citacao: "Total: 1.230,00 € (não inclui IVA)" };
    l.orcamento.iva.valoresDasLinhas = { valor: "com_iva", citacao: "não inclui IVA" };
    l.orcamento.iva.valoresDoTotal = { valor: "com_iva", citacao: "1.230,00 € (não inclui IVA)" };
    const v = verificar(d, l);
    const dinheiro = v.avisos.filter((a) => a.dinheiro).map((a) => a.id);
    expect(dinheiro).toEqual(
      expect.arrayContaining(["iva:contradicao:orcamento.total", "iva:sem-citacao:orcamento"]),
    );
    const p = preencher(d, v);
    expect(p.budgetAmounts).toEqual([null]);
    expect(p.totalVatMode).toBeNull();
  });

  it("uma unidade que diz as duas coisas é sempre contradição", () => {
    const d = documentoDeTeste(docx(["Total: 1.000,00 € + IVA (1.230,00 € com IVA)"]));
    const l = leituraSoDoOrcamento();
    l.orcamento.totalSemIva = { valor: 1000, citacao: "Total: 1.000,00 € + IVA" };
    l.orcamento.totalComIva = { valor: 1230, citacao: "1.230,00 € com IVA" };
    const v = verificar(d, l);
    expect(v.avisos.find((a) => a.id === "iva:contradicao:orcamento.total")?.dinheiro).toBe(true);
  });

  it("«isento de IVA» é um caso próprio, com aviso de dinheiro", () => {
    const d = documentoDeTeste(docx(["Total: 500,00 € (isento de IVA)"]));
    const l = leituraSoDoOrcamento();
    l.orcamento.totalComIva = { valor: 500, citacao: "Total: 500,00 € (isento de IVA)" };
    l.orcamento.iva.valoresDoTotal = { valor: "com_iva", citacao: "isento de IVA" };
    const v = verificar(d, l);
    expect(v.avisos.find((a) => a.id === "iva:isento:orcamento.total")?.dinheiro).toBe(true);
    expect(preencher(d, v).totalVatMode).toBeNull();
  });
});

describe("2.ª revisão, 3 — descontos negativos", () => {
  it.each([
    ["Desconto: -100,00 €", -100],
    ["Desconto: − 100 €", -100],
    ["Desconto (100,00 €)", -100],
    ["Data: 12-06-2027", 6],
  ])("«%s» lê-se com sinal (%s)", (t, v) => {
    expect(numerosDe(t)).toContain(v);
  });

  it("um desconto verifica-se COM o sinal, soma certo, e não passa — com aviso claro", () => {
    const d = documentoDeTeste(
      docx(["Decoração TESTE: 1.000,00 €", "Desconto TESTE: -100,00 €", "Total: 900,00 € + IVA"]),
    );
    const l = leituraSoDoOrcamento();
    l.orcamento.linhas = [
      linhaCom("Decoração TESTE", 1000, "Decoração TESTE: 1.000,00 €"),
      linhaCom("Desconto TESTE", -100, "Desconto TESTE: -100,00 €"),
    ];
    l.orcamento.totalSemIva = { valor: 900, citacao: "Total: 900,00 € + IVA" };
    l.orcamento.iva.valoresDasLinhas = { valor: "sem_iva", citacao: "900,00 € + IVA" };
    l.orcamento.iva.valoresDoTotal = { valor: "sem_iva", citacao: "900,00 € + IVA" };
    const v = verificar(d, l);
    expect(v.avisos.map((a) => a.id)).toEqual(["desconto:1"]);
    expect(v.avisos[0].texto).toMatch(/desconto de 100,00\s€.*põe o desconto à mão/);
    expect(preencher(d, v).budgetAmounts).toEqual([1000, null]);
    // Sem o sinal na citação, o −100 não está lá.
    l.orcamento.linhas[1].totalDaLinha.citacao = "100,00 €";
    expect(verificar(d, l).leitura.orcamento.linhas[1].totalDaLinha.valor).toBeNull();
  });

  it("com IVA incluído e um desconto, a repartição do cêntimo não parte", () => {
    const d = documentoDeTeste(
      docx([
        "Flores TESTE: 25,00 €",
        "Velas TESTE: 25,00 €",
        "Desconto TESTE: -5,00 €",
        "Total: 45,00 € (IVA incluído)",
      ]),
    );
    const l = leituraSoDoOrcamento();
    l.orcamento.linhas = [
      linhaCom("Flores TESTE", 25, "Flores TESTE: 25,00 €"),
      linhaCom("Velas TESTE", 25, "Velas TESTE: 25,00 €"),
      linhaCom("Desconto TESTE", -5, "Desconto TESTE: -5,00 €"),
    ];
    l.orcamento.totalComIva = { valor: 45, citacao: "Total: 45,00 € (IVA incluído)" };
    l.orcamento.iva.valoresDasLinhas = { valor: "com_iva", citacao: "IVA incluído" };
    l.orcamento.iva.valoresDoTotal = { valor: "com_iva", citacao: "IVA incluído" };
    const p = preencher(d, verificar(d, l));
    expect(p.budgetAmounts).toEqual([20.33, 20.32, null]);
  });
});

describe("2.ª revisão, 4 — o espaço de milhar não engole a quantidade", () => {
  const d = () => documentoDeTeste(docx(["Mesas TESTE 2 120,00 €"]));
  it("2 mesas a 120 €: aceite quando a linha diz quantidade 2", () => {
    const l = leituraSoDoOrcamento();
    l.orcamento.linhas = [linhaCom("Mesas TESTE", 120, "2 120,00 €", [2, "2 120,00 €"])];
    const v = verificar(d(), l);
    expect(v.leitura.orcamento.linhas[0].totalDaLinha.valor).toBe(120);
    expect(v.leitura.orcamento.linhas[0].quantidade.valor).toBe(2);
    expect(v.avisos.some((a) => a.id.startsWith("valor:"))).toBe(false);
  });

  it("e 2 120 € também (o número inteiro)", () => {
    const l = leituraSoDoOrcamento();
    l.orcamento.linhas = [linhaCom("Mesas TESTE", 2120, "2 120,00 €")];
    expect(verificar(d(), l).leitura.orcamento.linhas[0].totalDaLinha.valor).toBe(2120);
  });

  it("o aviso de um valor sem sítio mostra o que está escrito, nunca um número que lá não está", () => {
    const v = verificar(d(), leituraSoDoOrcamento());
    const a = v.avisos.find((x) => x.id.startsWith("valor:"))!;
    expect(a.texto).toMatch(/tem «2 120,00» em/);
  });
});

describe("2.ª revisão, 5 — propostas em inglês", () => {
  const d = () => documentoDeTeste(docx(["Decoration TEST: €1,740.00", "Total: €1,740.00 + VAT"]));
  const l = () => {
    const x = leituraSoDoOrcamento();
    x.orcamento.linhas = [linhaCom("Decoration TEST", 1740, "Decoration TEST: €1,740.00")];
    x.orcamento.totalSemIva = { valor: 1740, citacao: "Total: €1,740.00 + VAT" };
    x.orcamento.iva.valoresDasLinhas = { valor: "sem_iva", citacao: "€1,740.00 + VAT" };
    x.orcamento.iva.valoresDoTotal = { valor: "sem_iva", citacao: "€1,740.00 + VAT" };
    return x;
  };
  it("com idioma «en» os números lêem-se à inglesa, e pede-se para confirmar", () => {
    const x = l();
    x.evento.idioma = "en";
    const v = verificar(d(), x);
    expect(v.inventados).toBe(0);
    expect(v.leitura.orcamento.totalSemIva.valor).toBe(1740);
    expect(v.avisos.map((a) => a.id)).toEqual(["numeros:ingles"]);
  });
  it("mesmo sem o idioma, números à inglesa não passam por inventados", () => {
    const v = verificar(d(), l());
    expect(v.inventados).toBe(0);
    expect(v.avisos.find((a) => a.id === "numeros:ingles")?.dinheiro).toBe(true);
  });
});

describe("2.ª revisão, 8 — textos montados de bocados", () => {
  it("uma descrição com linhas de sítios não seguidos não passa", () => {
    const l = leituraCerta();
    l.servicos[0].itens[0].descricao =
      "arco em ferro com flores da época\nValidade da proposta: 30 dias.";
    expect(verificar(documentoDeTeste(), l).leitura.servicos[0].itens[0].descricao).toBeNull();
  });
  it("linhas em parágrafos SEGUIDOS passam", () => {
    const l = leituraCerta();
    l.servicos[0].itens[0].descricao = "Quinta do Teste, Sintra\n120 convidados";
    expect(verificar(documentoDeTeste(), l).leitura.servicos[0].itens[0].descricao).not.toBeNull();
  });
  it("um nome de 1–2 letras não é um nome", () => {
    const l = leituraCerta();
    l.cliente.nomes = "Ru";
    expect(verificar(documentoDeTeste(), l).leitura.cliente.nomes).toBeNull();
  });
});

describe("2.ª revisão, 10 — um total repetido é a mesma quantia", () => {
  it("o total escrito duas vezes não dá «valor:» nem «ficou FORA»", () => {
    const d = documentoDeTeste(
      docx(["Resumo: 1.740,00 € + IVA", "Decoração TESTE: 1.740,00 €", "Total: 1.740,00 € + IVA"]),
    );
    const l = leituraSoDoOrcamento();
    l.orcamento.linhas = [linhaCom("Decoração TESTE", 1740, "Decoração TESTE: 1.740,00 €")];
    l.orcamento.totalSemIva = { valor: 1740, citacao: "Total: 1.740,00 € + IVA" };
    l.orcamento.iva.valoresDasLinhas = { valor: "sem_iva", citacao: "1.740,00 € + IVA" };
    l.orcamento.iva.valoresDoTotal = { valor: "sem_iva", citacao: "1.740,00 € + IVA" };
    l.orcamento.valoresNaoUsados = [
      { valor: 1740, citacao: "Resumo: 1.740,00 € + IVA", motivo: "resumo" },
    ];
    const v = verificar(d, l);
    expect(v.avisos).toEqual([]);
  });
});
