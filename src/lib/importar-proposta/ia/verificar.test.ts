import { describe, it, expect } from "vitest";
import { verificar } from "./verificar";
import { preencher } from "./preencher";
import { documentoDeTeste, leituraCerta } from "./fixtures.testkit";
import { docx } from "../fabricar.testkit";

const ids = (v: ReturnType<typeof verificar>) => v.avisos.map((a) => a.id);

describe("a verificação, com a leitura certa", () => {
  it("não inventa avisos: tudo bate, nada se perde", () => {
    const v = verificar(documentoDeTeste(), leituraCerta());
    expect(v.avisos).toEqual([]);
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
