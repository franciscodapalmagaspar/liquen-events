import { describe, it, expect, vi, beforeEach } from "vitest";

const leituras = vi.hoisted(() => [] as string[]);
const falha = vi.hoisted(() => ({
  contratos: false,
  faturas: false,
  nContratos: 1,
  moloni: undefined as unknown,
}));
vi.mock("./quotes-store", () => ({
  getQuote: async (q: string) => {
    leituras.push(`pedido:${q}`);
    return { id: q, faturasMoloni: falha.moloni };
  },
}));
vi.mock("./contracts-store", () => ({
  listContractsForQuote: async (q: string) => {
    if (falha.contratos) throw new Error("contratos em baixo");
    leituras.push(`contratos:${q}`);
    return Array.from({ length: falha.nContratos }, () => ({}));
  },
}));
vi.mock("./invoices-store", () => ({
  listInvoicesForQuote: async (q: string) => {
    if (falha.faturas) throw new Error("faturas em baixo");
    leituras.push(`faturas:${q}`);
    return [];
  },
}));
vi.mock("./proposals-store", () => ({
  listProposalsForQuote: async (q: string) => (leituras.push(`propostas:${q}`), [{}, {}]),
}));
vi.mock("./tasks-store", () => ({
  listTasksForQuote: async (q: string) => (leituras.push(`tarefas:${q}`), []),
}));

const {
  ligacoesDoPedido,
  registoFiscal,
  oQueAindaPrende,
  propostasQueSairamSemResposta,
  registoFiscalDoPedido,
  NaoSeiSeHaRegistoFiscal,
} = await import("./o-que-prende-o-pedido");

const nada = { contratos: 0, faturas: 0, propostas: 0, tarefas: 0 };

beforeEach(() => {
  falha.contratos = false;
  falha.faturas = false;
  falha.moloni = undefined;
  falha.nContratos = 1;
});

describe("o que prende o pedido", () => {
  it("lê as quatro ligações do pedido, todas pelo id dele", async () => {
    expect(await ligacoesDoPedido("q1")).toEqual({
      contratos: 1,
      faturas: 0,
      propostas: 2,
      tarefas: 0,
    });
    expect(leituras.sort()).toEqual([
      "contratos:q1",
      "faturas:q1",
      "pedido:q1",
      "propostas:q1",
      "tarefas:q1",
    ]);
  });

  it("contrato e fatura são registos fiscais: recusam", () => {
    expect(registoFiscal(nada)).toBeNull();
    expect(registoFiscal({ ...nada, contratos: 1 })).toBe("tem-contrato");
    expect(registoFiscal({ ...nada, faturas: 1 })).toBe("tem-fatura");
    const soNaoFiscais = { ...nada, propostas: 3, tarefas: 1 };
    expect(registoFiscal(soNaoFiscais)).toBeNull();
  });

  it("no fim, qualquer ligação prende — e diz-se qual", () => {
    expect(oQueAindaPrende(nada)).toEqual([]);
    expect(oQueAindaPrende({ contratos: 1, faturas: 1, propostas: 2, tarefas: 3 })).toEqual([
      "nasceu um contrato neste pedido enquanto se apagava",
      "nasceu uma fatura neste pedido enquanto se apagava",
      "ficaram 2 proposta(s) neste pedido",
      "apareceram 3 tarefa(s) novas neste pedido",
    ]);
  });
});

describe("registoFiscalDoPedido (a pergunta do início)", () => {
  beforeEach(() => {
    falha.contratos = false;
    falha.faturas = false;
    falha.moloni = undefined;
    falha.nContratos = 1;
  });

  it("só lê contratos e faturas — não as propostas (o doc é pesado) nem as tarefas", async () => {
    leituras.length = 0;
    expect(await registoFiscalDoPedido({ id: "q2" })).toBe("tem-contrato");
    // Nem o pedido: quem chama já o leu e passa-o.
    expect(leituras.sort()).toEqual(["contratos:q2", "faturas:q2"]);
  });

  it("um registo visto ganha a uma leitura falhada; sem nenhum visto, lança com a causa", async () => {
    // Contratos lidos (1) e faturas por ler: o contrato visto decide.
    falha.faturas = true;
    expect(await registoFiscalDoPedido({ id: "q" })).toBe("tem-contrato");
    // Nada visto e uma leitura falhada: «não sei», com o erro verdadeiro em `cause`.
    falha.contratos = true;
    const e = await registoFiscalDoPedido({ id: "q" }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(NaoSeiSeHaRegistoFiscal);
    expect((e as Error).name).toBe("NaoSeiSeHaRegistoFiscal");
    expect(((e as Error).cause as Error).message).toBe("contratos em baixo");
  });
});

describe("as faturas do Moloni também são registo fiscal", () => {
  it("sem contrato e com o sinal no Moloni, a guarda do início recusa com tem-fatura", async () => {
    falha.nContratos = 0;
    expect(
      await registoFiscalDoPedido({
        id: "q",
        faturasMoloni: { sinal: { em: "x", documentId: 9 } },
      }),
    ).toBe("tem-fatura");
  });

  it("e a do fim lê o pedido outra vez e vê o que nasceu entretanto", async () => {
    falha.nContratos = 0;
    falha.moloni = { saldo: { em: "x", documentId: 3 } };
    expect((await ligacoesDoPedido("q")).faturas).toBe(1);
  });

  // Júri, 12.ª volta (18/11): a rota põe a marca ANTES de falar com o Moloni e
  // só a troca pelo documento DEPOIS. Se essa escrita falha, a marca é o único
  // rasto de um rascunho que existe lá — e apagar o pedido tirava-lhe a origem.
  it("a marca de «a ser criado», mesmo velha e sem documento, prende o pedido", async () => {
    falha.nContratos = 0;
    expect(
      await registoFiscalDoPedido({
        id: "q",
        faturasMoloni: { sinal: { em: "x", aCriarDesde: "2026-01-01T00:00:00Z" } },
      }),
    ).toBe("tem-fatura");
  });

  it("e a do fim vê a marca de um rascunho a ser criado enquanto se apagava", async () => {
    falha.nContratos = 0;
    falha.moloni = { sinal: { em: "x", aCriarDesde: new Date().toISOString() } };
    expect((await ligacoesDoPedido("q")).faturas).toBe(1);
  });
});

describe("ligacoesDoPedido — o registo visto ganha também no fim", () => {
  it("com um contrato visto e as faturas por ler, não lança: conta o contrato", async () => {
    falha.faturas = true;
    const l = await ligacoesDoPedido("q");
    expect(l.contratos).toBe(1);
    falha.faturas = false;
  });

  it("sem nenhum registo visto e uma leitura falhada, lança", async () => {
    falha.contratos = true;
    falha.faturas = true;
    await expect(ligacoesDoPedido("q")).rejects.toBeInstanceOf(NaoSeiSeHaRegistoFiscal);
    falha.contratos = false;
    falha.faturas = false;
  });
});

describe("propostasQueSairamSemResposta — a resposta perdeu-se, a proposta saiu", () => {
  it("é a que falhou ao apagar e a confirmação já não encontra", () => {
    expect(propostasQueSairamSemResposta(new Set(["p1", "p2"]), ["p2", "p3"])).toEqual(["p1"]);
  });

  it("nenhuma falhou, ou todas as que falharam ficaram: nada", () => {
    expect(propostasQueSairamSemResposta(new Set(), ["p1"])).toEqual([]);
    expect(propostasQueSairamSemResposta(new Set(["p1"]), ["p1"])).toEqual([]);
  });
});
