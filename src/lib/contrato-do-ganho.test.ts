import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Proposal } from "@/lib/orcamento/types";

const propostas = new Map<string, Proposal>();
const contratos: { proposalId: string; status: string; quoteId: string }[] = [];

vi.mock("@/lib/proposals-store", () => ({
  listProposalsForQuote: async (q: string) =>
    [...propostas.values()].filter((p) => p.quoteId === q),
  updateProposal: async (id: string, patch: Partial<Proposal>) => {
    const p = propostas.get(id);
    if (!p) return null;
    const n = { ...p, ...patch };
    propostas.set(id, n);
    return n;
  },
}));
vi.mock("@/lib/contracts-store", () => ({
  newContractId: () => `c${contratos.length + 1}`,
  createContractIfAbsent: async (c: { proposalId: string; status: string; quoteId: string }) => {
    if (!contratos.some((x) => x.proposalId === c.proposalId)) contratos.push(c);
  },
  deleteContract: async () => undefined,
  getContractByProposal: async () => null,
}));

const { aceitarSeOPedidoJaEstaGanho } = await import("./contrato-do-ganho");

const proposta = (id: string, status: Proposal["status"]): Proposal =>
  ({
    id,
    quoteId: "LIQ-1",
    clientName: "Rita & Ricardo",
    clientEmail: "",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 6050,
    vat: 1391.5,
    total: 7441.5,
    status,
    createdAt: "2026-11-12T23:19:00.000Z",
  }) as Proposal;

describe("a proposta enviada depois do «Ganho»", () => {
  beforeEach(() => {
    propostas.clear();
    contratos.length = 0;
  });

  it("fica aceite e nasce o contrato quando o pedido já estava ganho (caso Rita & Ricardo)", async () => {
    propostas.set("p1", proposta("p1", "enviada"));
    const ok = await aceitarSeOPedidoJaEstaGanho(
      "LIQ-1",
      "aceite",
      propostas.get("p1")!,
      "2026-11-16T19:00:00.000Z",
    );
    expect(ok).toBe(true);
    expect(propostas.get("p1")!.status).toBe("aceite");
    expect(propostas.get("p1")!.respondedAt).toBe("2026-11-16T19:00:00.000Z");
    expect(contratos).toEqual([expect.objectContaining({ proposalId: "p1", status: "pendente" })]);
  });

  it("não mexe quando o pedido não está ganho", async () => {
    propostas.set("p1", proposta("p1", "enviada"));
    expect(await aceitarSeOPedidoJaEstaGanho("LIQ-1", "cotado", propostas.get("p1")!)).toBe(false);
    expect(propostas.get("p1")!.status).toBe("enviada");
    expect(contratos).toHaveLength(0);
  });

  it("uma revisão depois de uma proposta aceite continua por responder", async () => {
    propostas.set("p1", proposta("p1", "aceite"));
    propostas.set("p2", proposta("p2", "enviada"));
    expect(await aceitarSeOPedidoJaEstaGanho("LIQ-1", "aceite", propostas.get("p2")!)).toBe(false);
    expect(propostas.get("p2")!.status).toBe("enviada");
    expect(contratos).toHaveLength(0);
  });
});
