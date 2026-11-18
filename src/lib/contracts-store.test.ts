import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Contract } from "./contract-types";

/**
 * Unit tests for the contract store's idempotency/lock logic
 * (createContractIfAbsent) and the two lookup helpers. The shared Repository is
 * replaced by a controllable in-memory fake so we can drive the exact races the
 * real helper is defending against (TOCTOU on the unique proposal_id index).
 */
const repoState = vi.hoisted(() => ({
  rows: [] as Contract[],
  createImpl: null as null | ((c: Contract) => Promise<void>),
}));

vi.mock("./repository", () => ({
  createRepository: () => ({
    create: async (c: Contract) => {
      if (repoState.createImpl) return repoState.createImpl(c);
      repoState.rows.push(c);
    },
    get: async (id: string) => repoState.rows.find((r) => r.id === id) ?? null,
    list: async () =>
      [...repoState.rows].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    // Mirror FileBackend.where: list (sorted desc) then filter by predicate.
    where: async (_col: string, _val: unknown, pred: (e: Contract) => boolean) =>
      [...repoState.rows]
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .filter(pred),
    update: async (id: string, patch: Partial<Contract>) => {
      const i = repoState.rows.findIndex((r) => r.id === id);
      if (i < 0) return null;
      repoState.rows[i] = { ...repoState.rows[i], ...patch };
      return repoState.rows[i];
    },
    remove: async (id: string) => {
      repoState.rows = repoState.rows.filter((r) => r.id !== id);
    },
  }),
}));

import {
  mapper,
  createContractIfAbsent,
  getContractByProposal,
  getAcceptedContractByQuote,
  listContracts,
  getContract,
  updateContract,
} from "./contracts-store";

function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: "c1",
    quoteId: "q1",
    proposalId: "prop1",
    clientName: "Ana",
    clientEmail: "ana@x.pt",
    termsVersion: "v1",
    termsSnapshot: "Termos…",
    status: "aceite",
    createdAt: "2026-01-01T00:00:00.000Z",
    acceptedAt: "2026-01-01T00:00:00.000Z",
    acceptedName: "Ana",
    acceptedIp: "1.2.3.4",
    ...over,
  };
}

beforeEach(() => {
  repoState.rows = [];
  repoState.createImpl = null;
});

describe("createContractIfAbsent", () => {
  it("creates the contract and reports created:true when none exists for the proposal", async () => {
    const res = await createContractIfAbsent(contract({ id: "c1", proposalId: "prop1" }));
    expect(res.created).toBe(true);
    expect(res.contract.id).toBe("c1");
    expect(repoState.rows).toHaveLength(1);
  });

  it("does NOT create a second contract when one already exists (fast path, created:false)", async () => {
    repoState.rows = [contract({ id: "existing", proposalId: "prop1" })];
    const res = await createContractIfAbsent(contract({ id: "c-new", proposalId: "prop1" }));
    expect(res.created).toBe(false);
    expect(res.contract.id).toBe("existing");
    expect(repoState.rows).toHaveLength(1); // no duplicate
  });

  it("recovers from a lost unique-index race: insert throws but the winner's row appears → created:false", async () => {
    // Simulate the TOCTOU window: both callers saw no contract; the OTHER caller
    // won the unique index insert (its row lands) while ours throws a conflict.
    repoState.createImpl = async () => {
      repoState.rows.push(contract({ id: "winner", proposalId: "prop1" }));
      throw new Error("duplicate key value violates unique constraint");
    };
    const res = await createContractIfAbsent(contract({ id: "loser", proposalId: "prop1" }));
    expect(res.created).toBe(false);
    expect(res.contract.id).toBe("winner");
  });

  it("re-throws a genuine persistence failure (no contract materialises)", async () => {
    repoState.createImpl = async () => {
      throw new Error("network down");
    };
    await expect(
      createContractIfAbsent(contract({ id: "c1", proposalId: "prop1" })),
    ).rejects.toThrow("network down");
  });
});

describe("getContractByProposal", () => {
  it("returns the matching contract or null", async () => {
    repoState.rows = [contract({ id: "c1", proposalId: "prop1" })];
    expect((await getContractByProposal("prop1"))?.id).toBe("c1");
    expect(await getContractByProposal("absent")).toBeNull();
  });
});

describe("getAcceptedContractByQuote", () => {
  it("returns the most recent ACCEPTED contract for the quote", async () => {
    repoState.rows = [
      contract({ id: "old", quoteId: "q1", status: "aceite", createdAt: "2026-01-01T00:00:00Z" }),
      contract({ id: "new", quoteId: "q1", status: "aceite", createdAt: "2026-03-01T00:00:00Z" }),
    ];
    const got = await getAcceptedContractByQuote("q1");
    expect(got?.id).toBe("new"); // newest wins (created_at desc)
  });

  it("ignores pending contracts and returns null when none accepted", async () => {
    repoState.rows = [contract({ id: "c1", quoteId: "q1", status: "pendente" })];
    expect(await getAcceptedContractByQuote("q1")).toBeNull();
  });

  it("returns null for a quote with no contracts", async () => {
    expect(await getAcceptedContractByQuote("q-none")).toBeNull();
  });
});

describe("CRUD delegation", () => {
  it("lists, gets and updates a stored contract", async () => {
    repoState.rows = [contract({ id: "c1", proposalId: "prop1", status: "pendente" })];
    expect(await listContracts()).toHaveLength(1);
    expect((await getContract("c1"))?.id).toBe("c1");
    const updated = await updateContract("c1", { status: "aceite", acceptedName: "Rui" });
    expect(updated).toMatchObject({ status: "aceite", acceptedName: "Rui" });
    expect((await getContract("c1"))?.status).toBe("aceite");
  });

  it("update returns null for an unknown id", async () => {
    expect(await updateContract("ghost", { status: "aceite" })).toBeNull();
  });
});

/**
 * The camelCase↔snake_case mapper is the bug-prone seam (per repository.ts).
 * The tests above mock the Repository, so exercise the mapper directly here:
 * a full round-trip, empty optionals (null↔undefined), and row-missing defaults.
 */
describe("mapper (row ↔ domain)", () => {
  it("round-trips every field (with created_at added back by the DB)", () => {
    const c = contract({
      id: "c9",
      quoteId: "q9",
      proposalId: "p9",
      clientName: "Ana",
      clientEmail: "ana@x.pt",
      termsVersion: "v3",
      termsSnapshot: "Texto dos termos",
      status: "aceite",
      createdAt: "2026-05-01T08:00:00.000Z",
      acceptedAt: "2026-05-01T08:00:00.000Z",
      acceptedName: "Ana",
      acceptedIp: "9.9.9.9",
    });
    const row = mapper.toRow(c);
    expect(mapper.fromRow(row)).toEqual(c);
  });

  it("persists empty optionals as null and reads them back as undefined", () => {
    const row = mapper.toRow(
      contract({
        id: "c10",
        status: "pendente",
        acceptedAt: undefined,
        acceptedName: undefined,
        acceptedIp: undefined,
      }),
    );
    expect(row.accepted_at).toBeNull();
    expect(row.accepted_name).toBeNull();
    expect(row.accepted_ip).toBeNull();
    const back = mapper.fromRow(row);
    expect(back.acceptedAt).toBeUndefined();
    expect(back.acceptedName).toBeUndefined();
    expect(back.acceptedIp).toBeUndefined();
  });

  it("defaults a sparse row: status 'pendente', empty strings, a createdAt fallback", () => {
    const back = mapper.fromRow({ id: "c11" });
    expect(back.id).toBe("c11");
    expect(back.status).toBe("pendente");
    expect(back.quoteId).toBe("");
    expect(back.proposalId).toBe("");
    expect(back.clientName).toBe("");
    expect(back.termsVersion).toBe("");
    expect(back.createdAt).toBeTruthy();
    expect(back.acceptedAt).toBeUndefined();
  });
});

describe("P5: a chave estrangeira contracts.quote_id → quotes", () => {
  it("um contrato sem pedido grava quote_id null, nunca '' (que a chave recusa)", () => {
    const c = {
      id: "c",
      quoteId: "",
      proposalId: "p",
      status: "pendente",
      createdAt: "2026-01-01",
    } as Contract;
    expect(mapper.toRow(c).quote_id).toBeNull();
    expect(mapper.fromRow(mapper.toRow(c)).quoteId).toBe("");
  });
});
