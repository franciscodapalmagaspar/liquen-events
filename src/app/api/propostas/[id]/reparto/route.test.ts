import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/** A repartição grava-se sobre o documento ACABADO DE LER, e só ela. */

const authed = vi.hoisted(() => ({ ok: true }));
const estado = vi.hoisted(() => ({ proposta: null as Record<string, unknown> | null }));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/proposals-store", () => ({
  updateProposalWith: vi.fn(
    async (_id: string, f: (p: Record<string, unknown>) => Record<string, unknown>) => {
      if (!estado.proposta) return null;
      estado.proposta = f(estado.proposta);
      return estado.proposta;
    },
  ),
}));

import { PATCH } from "./route";

const ctx = { params: Promise.resolve({ id: "p1" }) };
const req = (body: unknown) =>
  new Request("https://liquen.test/api/propostas/p1/reparto", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;

beforeEach(() => {
  authed.ok = true;
  estado.proposta = {
    id: "p1",
    status: "aceite",
    doc: { ref: "PO Teste", budgetItems: ["Decor"], totalAmount: 10000, notasInternas: "x" },
  };
});

describe("PATCH /api/propostas/[id]/reparto", () => {
  it("grava só a repartição, e não mexe no resto do documento", async () => {
    const res = await PATCH(req({ reparto: { flores: 8450, transporte: 1550 } }), ctx);
    expect(res.status).toBe(200);
    const doc = (estado.proposta as { doc: Record<string, unknown> }).doc;
    expect(doc.repartoPorArtigo).toEqual({ flores: 8450, transporte: 1550 });
    expect(doc.ref).toBe("PO Teste");
    expect(doc.notasInternas).toBe("x");
    // Ao browser só vão os campos do dinheiro.
    const j = await res.json();
    expect(j.doc).not.toHaveProperty("notasInternas");
  });

  it("recusa artigos inventados e valores que não são números", async () => {
    expect((await PATCH(req({ reparto: { inventado: 1 } }), ctx)).status).toBe(400);
    expect((await PATCH(req({ reparto: { material: "mil" } }), ctx)).status).toBe(400);
    expect((await PATCH(req({ reparto: { material: -1 } }), ctx)).status).toBe(400);
  });

  it("zero tira o artigo", async () => {
    await PATCH(req({ reparto: { material: 0, transporte: 10 } }), ctx);
    expect((estado.proposta as { doc: Record<string, unknown> }).doc.repartoPorArtigo).toEqual({
      transporte: 10,
    });
  });

  it("fora do back office, nada", async () => {
    authed.ok = false;
    expect((await PATCH(req({ reparto: {} }), ctx)).status).toBe(401);
  });
});
