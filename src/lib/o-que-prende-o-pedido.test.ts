import { describe, it, expect, vi } from "vitest";

const leituras = vi.hoisted(() => [] as string[]);
const falha = vi.hoisted(() => ({ contratos: false, faturas: false }));
vi.mock("./contracts-store", () => ({
  listContractsForQuote: async (q: string) => {
    if (falha.contratos) throw new Error("contratos em baixo");
    leituras.push(`contratos:${q}`);
    return [{}];
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
  registoFiscalDoPedido,
  NaoSeiSeHaRegistoFiscal,
} = await import("./o-que-prende-o-pedido");

const nada = { contratos: 0, faturas: 0, propostas: 0, tarefas: 0 };

describe("o que prende o pedido", () => {
  it("lê as quatro ligações do pedido, todas pelo id dele", async () => {
    expect(await ligacoesDoPedido("q1")).toEqual({
      contratos: 1,
      faturas: 0,
      propostas: 2,
      tarefas: 0,
    });
    expect(leituras.sort()).toEqual(["contratos:q1", "faturas:q1", "propostas:q1", "tarefas:q1"]);
  });

  it("contrato e fatura são registos fiscais: recusam", () => {
    expect(registoFiscal(nada)).toBeNull();
    expect(registoFiscal({ ...nada, contratos: 1 })).toBe("tem-contrato");
    expect(registoFiscal({ ...nada, faturas: 1 })).toBe("tem-fatura");
    expect(registoFiscal({ ...nada, propostas: 3, tarefas: 1 })).toBeNull();
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
  it("só lê contratos e faturas — não as propostas (o doc é pesado) nem as tarefas", async () => {
    leituras.length = 0;
    expect(await registoFiscalDoPedido("q2")).toBe("tem-contrato");
    expect(leituras.sort()).toEqual(["contratos:q2", "faturas:q2"]);
  });

  it("uma leitura falhada diz QUAL: o contrato primeiro, depois a fatura", async () => {
    falha.faturas = true;
    await expect(registoFiscalDoPedido("q")).rejects.toMatchObject({ motivo: "tem-fatura" });
    falha.contratos = true;
    const e = await registoFiscalDoPedido("q").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(NaoSeiSeHaRegistoFiscal);
    expect((e as InstanceType<typeof NaoSeiSeHaRegistoFiscal>).motivo).toBe("tem-contrato");
    falha.contratos = false;
    falha.faturas = false;
  });
});
