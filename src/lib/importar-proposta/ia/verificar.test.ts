import { describe, it, expect } from "vitest";
import { normalizar, numerosDe, plano, verificar } from "./verificar";
import { correccoesIniciais, montarDocumento, oQueFalta } from "../montar";
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
    // As linhas não dizem se têm IVA (só o total diz «+ IVA»): passam pela soma, a confirmar.
    // O IVA está provado pelas contas (1.740 + 400,20 = 2.140,20): sem aviso.
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

// ════════════════════════════════════════════════════════════════════════════
// REGRESSÕES DA TERCEIRA REVISÃO (14/11): O IVA DECIDE-O O DOCUMENTO
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// QUARTA REVISÃO (14/11): O TEXTO NUNCA DECIDE O IVA — SÓ AS CONTAS, OU ELA
// ════════════════════════════════════════════════════════════════════════════

/** Um orçamento simples (uma linha de 1.740 € e o total), mais as frases dadas. */
function orcamentoSimples(frases: string[], total = "Total: 1.740,00 €") {
  const d = documentoDeTeste(docx(["Decoração TESTE: 1.740,00 €", total, ...frases]));
  const l = leituraSoDoOrcamento();
  l.orcamento.linhas = [linhaCom("Decoração TESTE", 1740, "Decoração TESTE: 1.740,00 €")];
  l.orcamento.totalSemIva = { valor: 1740, citacao: total };
  l.naoColocados = frases.map((_, i) => ({ id: `p${i + 3}`, motivo: "frase do IVA" }));
  return { d, l };
}

/** Sem prova nas contas: nada passa, nada vem escolhido, e criar espera por ela. */
function porEscolher(d: Parameters<typeof verificar>[0], l: Parameters<typeof verificar>[1]) {
  const v = verificar(d, l);
  expect(v.contas.ivaPorEscolher).toBe(true);
  expect(v.contas.modoDasLinhas).toBe("desconhecido");
  expect(v.contas.modoDoTotal).toBe("desconhecido");
  const p = preencher(d, v);
  expect(p.ivaPorEscolher).toBe(true);
  expect(p.totalVatMode).toBeNull();
  expect(p.budgetAmounts.every((x) => x === null)).toBe(true);
  expect(oQueFalta(correccoesIniciais(p), p)).toContain(
    "escolher se os valores do documento têm IVA",
  );
  return { v, p };
}

describe("4.ª revisão, B1 — frases negadas (e as do sentido contrário) nunca decidem", () => {
  it.each([
    "Os valores não têm IVA incluído.",
    "Não está incluído o IVA.",
    "IVA incluído: não",
    "Prices not including VAT.",
    "Não acresce IVA.",
    "Os valores apresentados não incluem o IVA.",
    // As três do sentido contrário:
    "IVA incluído.",
    "Valores com IVA.",
    "Acresce IVA à taxa legal.",
  ])("«%s» → IVA por escolher, com a frase à vista", (frase) => {
    for (const lido of ["desconhecido", "com_iva", "sem_iva"] as const) {
      const { d, l } = orcamentoSimples([frase]);
      l.orcamento.iva.valoresDoTotal = {
        valor: lido,
        citacao: lido === "desconhecido" ? null : frase,
      };
      l.orcamento.iva.valoresDasLinhas = {
        valor: lido,
        citacao: lido === "desconhecido" ? null : frase,
      };
      const { v } = porEscolher(d, l);
      expect(v.contas.frasesDoIva.map((f) => f.texto)).toContain(frase);
      expect(v.contas.leituraDoIva.total.valor).toBe(lido);
    }
  });
});

describe("4.ª revisão, B2 — uma nota sobre OUTRA coisa não decide o orçamento", () => {
  it.each([
    "O catering é faturado com IVA incluído.",
    "A fatura com IVA é emitida no fim do evento.",
  ])("«%s»", (frase) => {
    const { d, l } = orcamentoSimples([frase]);
    porEscolher(d, l);
  });
});

describe("4.ª revisão, 1 — o IVA aceite sem perguntar só com PROVA nas contas", () => {
  it("o formato «Subtotal / IVA (23%) / Total»: zero avisos, linhas sem IVA", () => {
    const d = documentoDeTeste(
      docx([
        "Flores TESTE: 1.000,00 €",
        "Velas TESTE: 740,00 €",
        "Subtotal: 1.740,00 €",
        "IVA (23%): 400,20 €",
        "Total: 2.140,20 €",
      ]),
    );
    const l = leituraSoDoOrcamento();
    l.orcamento.linhas = [
      linhaCom("Flores TESTE", 1000, "Flores TESTE: 1.000,00 €"),
      linhaCom("Velas TESTE", 740, "Velas TESTE: 740,00 €"),
    ];
    l.orcamento.totalSemIva = { valor: 1740, citacao: "Subtotal: 1.740,00 €" };
    l.orcamento.valorDoIva = { valor: 400.2, citacao: "IVA (23%): 400,20 €" };
    l.orcamento.totalComIva = { valor: 2140.2, citacao: "Total: 2.140,20 €" };
    const v = verificar(d, l);
    expect(v.avisos).toEqual([]);
    expect(v.contas.ivaPorEscolher).toBe(false);
    expect(v.contas.modoDasLinhas).toBe("sem_iva");
    const p = preencher(d, v);
    expect(p.budgetAmounts).toEqual([1000, 740]);
    expect(p.totalVatMode).toBe("acrescer");
  });

  it("«+ IVA (… com IVA)» ligados na mesma unidade: prova; as linhas com IVA também", () => {
    const d = documentoDeTeste(
      docx([
        "Flores TESTE: 25,00 €",
        "Velas TESTE: 25,00 €",
        "Total: 40,65 € + IVA (50,00 € com IVA)",
      ]),
    );
    const l = leituraSoDoOrcamento();
    l.orcamento.linhas = [
      linhaCom("Flores TESTE", 25, "Flores TESTE: 25,00 €"),
      linhaCom("Velas TESTE", 25, "Velas TESTE: 25,00 €"),
    ];
    l.orcamento.totalComIva = { valor: 50, citacao: "50,00 € com IVA" };
    const v = verificar(d, l);
    expect(v.contas.modoDasLinhas).toBe("com_iva");
    expect(preencher(d, v).budgetAmounts).toEqual([20.33, 20.32]);
  });

  it("M1 — dois serviços diferentes na mesma frase NÃO são um par", () => {
    const d = documentoDeTeste(
      docx(["Flores TESTE 1.000,00 € e velas TESTE 1.230,00 € com IVA", "Total: 1.000,00 €"]),
    );
    const l = leituraSoDoOrcamento();
    l.orcamento.linhas = [linhaCom("Flores TESTE", 1000, "Flores TESTE 1.000,00 €")];
    l.orcamento.totalSemIva = { valor: 1000, citacao: "Total: 1.000,00 €" };
    l.orcamento.valoresNaoUsados = [
      { valor: 1230, citacao: "velas TESTE 1.230,00 €", motivo: "x" },
    ];
    porEscolher(d, l);
  });

  it("um par ligado que NÃO bate pela taxa é aviso de dinheiro (aritmética)", () => {
    const d = documentoDeTeste(docx(["Total: 1.000,00 € + IVA (1.250,00 € com IVA)"]));
    const l = leituraSoDoOrcamento();
    l.orcamento.totalSemIva = { valor: 1000, citacao: "Total: 1.000,00 € + IVA" };
    l.orcamento.totalComIva = { valor: 1250, citacao: "1.250,00 € com IVA" };
    const v = verificar(d, l);
    expect(v.avisos.find((a) => a.id.startsWith("iva:par-nao-bate:"))?.dinheiro).toBe(true);
  });

  it("sem prova, ela escolhe — e a escolha converte as linhas (o cêntimo também)", () => {
    const d = documentoDeTeste(
      docx(["Flores TESTE: 25,00 €", "Velas TESTE: 25,00 €", "Total: 50,00 € (IVA incluído)"]),
    );
    const l = leituraSoDoOrcamento();
    l.orcamento.linhas = [
      linhaCom("Flores TESTE", 25, "Flores TESTE: 25,00 €"),
      linhaCom("Velas TESTE", 25, "Velas TESTE: 25,00 €"),
    ];
    l.orcamento.totalComIva = { valor: 50, citacao: "Total: 50,00 € (IVA incluído)" };
    const { p } = porEscolher(d, l);
    const c = { ...correccoesIniciais(p), totalVatMode: "incluido" as const };
    const doc = montarDocumento(p, c, new Map(), "t.docx");
    expect(doc.budgetAmounts).toEqual([20.33, 20.32]);
    expect(doc.totalAmount).toBe(50);
    expect(doc.totalVatMode).toBe("incluido");
  });
});

describe("4.ª revisão, I1 — números ambíguos", () => {
  it("sem números claros, «1.200» leva aviso com as duas leituras", () => {
    const d = documentoDeTeste(docx(["Decoração TESTE: 1.200 €", "Total: 1.200 € + IVA"]));
    const l = leituraSoDoOrcamento();
    l.orcamento.linhas = [linhaCom("Decoração TESTE", 1200, "Decoração TESTE: 1.200 €")];
    const v = verificar(d, l);
    const a = v.avisos.find((x) => x.id.startsWith("numero:ambiguo"))!;
    expect(a.dinheiro).toBe(true);
    expect(a.texto).toMatch(/1200,00\s€ como 1,20\s€/);
    // A leitura decimal também nunca passa calada.
    l.orcamento.linhas[0].totalDaLinha.valor = 1.2;
    expect(verificar(d, l).avisos.some((x) => x.id.startsWith("numero:ambiguo"))).toBe(true);
  });

  it("com números claros portugueses no documento, «1.200» é 1 200 — e 1,2 não está lá", () => {
    const d = documentoDeTeste(
      docx(["Velas TESTE: 45,00 €", "Decoração TESTE: 1.200 €", "Total: 1.245,00 €"]),
    );
    const l = leituraSoDoOrcamento();
    l.orcamento.linhas = [
      linhaCom("Velas TESTE", 45, "Velas TESTE: 45,00 €"),
      linhaCom("Decoração TESTE", 1200, "Decoração TESTE: 1.200 €"),
    ];
    l.orcamento.totalSemIva = { valor: 1245, citacao: "Total: 1.245,00 €" };
    const v = verificar(d, l);
    expect(v.avisos.some((x) => x.id.startsWith("numero:ambiguo"))).toBe(false);
    l.orcamento.linhas[1].totalDaLinha.valor = 1.2;
    expect(verificar(d, l).leitura.orcamento.linhas[1].totalDaLinha.valor).toBeNull();
  });
});

describe("4.ª revisão, M4 — os sinais", () => {
  it.each([
    ["Bouquet TESTE — 180 €", 180],
    ["Bouquet TESTE - 180 €", 180],
    ["1.ª prestação (1.475,00 €)", 1475],
    ["Desconto TESTE: -100,00 €", -100],
    ["Desconto TESTE: − 100 €", -100],
    ["Desconto TESTE (100,00 €)", -100],
    ["Oferta TESTE: 50,00 €", -50],
  ])("«%s» → %s", (t, v) => {
    expect(numerosDe(t)).toContain(v);
    if (v > 0) expect(numerosDe(t)).not.toContain(-v);
  });

  it("B′ — «Bouquet — 180 €» é uma linha de 180 €, sem aviso de desconto", () => {
    const d = documentoDeTeste(docx(["Bouquet TESTE — 180,00 €", "Total: 180,00 €"]));
    const l = leituraSoDoOrcamento();
    l.orcamento.linhas = [linhaCom("Bouquet TESTE", 180, "Bouquet TESTE — 180,00 €")];
    l.orcamento.totalSemIva = { valor: 180, citacao: "Total: 180,00 €" };
    const v = verificar(d, l);
    expect(
      v.avisos.filter((a) => a.id.startsWith("desconto:") || a.id.startsWith("valor:")),
    ).toEqual([]);
  });

  it("um desconto verifica-se com sinal, e não passa (aviso para o pôr à mão)", () => {
    const d = documentoDeTeste(
      docx(["Decoração TESTE: 1.000,00 €", "Desconto TESTE: -100,00 €", "Total: 900,00 €"]),
    );
    const l = leituraSoDoOrcamento();
    l.orcamento.linhas = [
      linhaCom("Decoração TESTE", 1000, "Decoração TESTE: 1.000,00 €"),
      linhaCom("Desconto TESTE", -100, "Desconto TESTE: -100,00 €"),
    ];
    l.orcamento.totalSemIva = { valor: 900, citacao: "Total: 900,00 €" };
    const v = verificar(d, l);
    expect(v.avisos.map((a) => a.id)).toEqual(["desconto:1"]);
    const p = preencher(d, v);
    const doc = montarDocumento(
      p,
      { ...correccoesIniciais(p), totalVatMode: "acrescer" },
      new Map(),
      "t",
    );
    expect(doc.budgetAmounts).toEqual([1000, null]);
  });
});

describe("4.ª revisão, M3 — o texto plano não tem espaços repetidos", () => {
  it("células vazias não deixam dois espaços", () => {
    expect(normalizar("Flores |  | 250,00 €")).toBe("flores 250,00 €");
    expect(plano("a |  | b").texto).toBe("a b");
  });
});

describe("as rondas anteriores, que continuam certas", () => {
  it("IVA incluído com prova: passa como incluído, e o cêntimo reparte-se", () => {
    const v = verificar(documentoDeTeste(propostaComIvaIncluido()), leituraComIvaIncluido());
    expect(v.avisos).toEqual([]);
    expect(v.contas.modoDasLinhas).toBe("com_iva");
  });

  it("um total repetido (com prova) é a mesma quantia", () => {
    const d = documentoDeTeste(
      docx([
        "Resumo: 1.740,00 €",
        "Decoração TESTE: 1.740,00 €",
        "Subtotal: 1.740,00 €",
        "IVA (23%): 400,20 €",
        "Total: 2.140,20 €",
      ]),
    );
    const l = leituraSoDoOrcamento();
    l.naoColocados = [{ id: "p1", motivo: "resumo" }];
    l.orcamento.linhas = [linhaCom("Decoração TESTE", 1740, "Decoração TESTE: 1.740,00 €")];
    l.orcamento.totalSemIva = { valor: 1740, citacao: "Subtotal: 1.740,00 €" };
    l.orcamento.valorDoIva = { valor: 400.2, citacao: "IVA (23%): 400,20 €" };
    l.orcamento.totalComIva = { valor: 2140.2, citacao: "Total: 2.140,20 €" };
    expect(verificar(d, l).avisos).toEqual([]);
  });

  it("uma proposta em inglês com números portugueses não tem falsos «inventados»", () => {
    const d = documentoDeTeste(docx(["Decoration TEST: 1.740,00 €", "Total: 1.740,00 € + VAT"]));
    const l = leituraSoDoOrcamento();
    l.evento.idioma = "en";
    l.orcamento.linhas = [linhaCom("Decoration TEST", 1740, "Decoration TEST: 1.740,00 €")];
    l.orcamento.totalSemIva = { valor: 1740, citacao: "Total: 1.740,00 € + VAT" };
    expect(verificar(d, l).inventados).toBe(0);
  });

  it("uma portuguesa com um preço à Excel («45.00 €») também não", () => {
    const d = documentoDeTeste(
      docx(["Velas TESTE: 45.00 €", "Flores TESTE: 1.200,00 €", "Total: 1.245,00 €"]),
    );
    const l = leituraSoDoOrcamento();
    l.orcamento.linhas = [
      linhaCom("Velas TESTE", 45, "Velas TESTE: 45.00 €"),
      linhaCom("Flores TESTE", 1200, "Flores TESTE: 1.200,00 €"),
    ];
    l.orcamento.totalSemIva = { valor: 1245, citacao: "Total: 1.245,00 €" };
    const v = verificar(d, l);
    expect(v.inventados).toBe(0);
    expect(v.avisos.some((a) => a.id.startsWith("valor:"))).toBe(false);
  });

  it("células coladas: «1 | 250,00 €» nunca é 1 250", () => {
    expect(numerosDe("Mesas TESTE | 1 | 250,00 €")).not.toContain(1250);
  });

  it("os números decidem-se pelo próprio número", () => {
    expect(numerosDe("1.000,00 €")).toEqual([1000]);
    expect(numerosDe("1,740.00 €")).toEqual([1740]);
    expect(numerosDe("45.00 €")).toEqual([45]);
    expect(numerosDe("1.200 €")).toEqual([1200, 1.2]);
  });
});
