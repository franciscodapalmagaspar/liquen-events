import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
  del: vi.fn(async (id: string) => id),
  /** A ficha GRAVADA — o telefone confere-se contra ela (só quando muda). */
  get: vi.fn(async (id: string) =>
    id === "s1" ? { id: "s1", name: "Catering Sol", phone: "266 00 00 0 (escritório)" } : null,
  ),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
// Apagar passa pela Reciclagem (R3, `src/lib/reciclagem.ts`, com testes
// próprios). Aqui interessa a rota: a guarda e o apagar que chega ao store.
vi.mock("@/lib/reciclagem", () => ({
  quemApagou: () => undefined,
  enviarParaAReciclagem: async (_tipo: string, id: string) => {
    await store.del(id);
    return { id: "r1" };
  },
}));
vi.mock("@/lib/suppliers-store", () => ({
  updateSupplier: store.update,
  deleteSupplier: store.del,
  obterFornecedor: store.get,
}));

import { PATCH, DELETE } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(method: "PATCH" | "DELETE", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/fornecedores/s1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("/api/fornecedores/[id]", () => {
  it("PATCH and DELETE reject the unauthenticated with 401", async () => {
    expect((await PATCH(req("PATCH", { name: "X" }), ctx("s1"))).status).toBe(401);
    expect((await DELETE(req("DELETE"), ctx("s1"))).status).toBe(401);
    expect(store.update).not.toHaveBeenCalled();
    expect(store.del).not.toHaveBeenCalled();
  });

  it("PATCH updates the supplier when authenticated", async () => {
    authed.ok = true;
    const res = await PATCH(req("PATCH", { name: "Novo nome" }), ctx("s1"));
    expect(res.status).toBe(200);
    expect(store.update).toHaveBeenCalledWith("s1", { name: "Novo nome" });
  });

  it("DELETE removes the supplier when authenticated", async () => {
    authed.ok = true;
    const res = await DELETE(req("DELETE"), ctx("s1"));
    expect(res.status).toBe(200);
    expect(store.del).toHaveBeenCalledWith("s1");
  });

  it("blocks mass-assignment of id/createdAt via PATCH", async () => {
    authed.ok = true;
    await PATCH(
      req("PATCH", { name: "Novo nome", id: "s2-evil", createdAt: "2000-01-01" }),
      ctx("s1"),
    );
    expect(store.update).toHaveBeenCalledWith("s1", { name: "Novo nome" });
  });

  it("rejects invalid field values with 400", async () => {
    authed.ok = true;
    const res = await PATCH(req("PATCH", { email: "not-an-email" }), ctx("s1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("PATCH answers 400 (not 500) to a malformed or non-object body", async () => {
    authed.ok = true;
    const cru = (corpo: string) =>
      new Request("https://liquen.test/api/fornecedores/s1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: corpo,
      }) as unknown as NextRequest;
    for (const corpo of ["{ isto não é JSON", "null", "42", "[]"]) {
      const res = await PATCH(cru(corpo), ctx("s1"));
      expect(res.status, corpo).toBe(400);
    }
    expect(store.update).not.toHaveBeenCalled();
  });
});

/**
 * O TELEFONE DE UM FORNECEDOR (pedido dela, 30/10: «números de telefone seja
 * qual país for»). Conferido só quando muda — o ecrã manda a ficha inteira em
 * cada gravação, e um telefone antigo de outro feitio não pode impedir de
 * corrigir a nota.
 */
describe("PATCH /api/fornecedores/[id] — o telefone", () => {
  it("um telefone novo que não existe é recusado, com o campo", async () => {
    authed.ok = true;
    const res = await PATCH(req("PATCH", { phone: "91234" }), ctx("s1"));
    expect(res.status).toBe(400);
    expect((await res.json()).campo).toBe("telefone");
    expect(store.update).not.toHaveBeenCalled();
  });

  it("um telefone novo válido grava-se em E.164", async () => {
    authed.ok = true;
    await PATCH(req("PATCH", { phone: "+34 612 345 678" }), ctx("s1"));
    expect(store.update).toHaveBeenCalledWith("s1", { phone: "+34612345678" });
  });

  it("o telefone antigo, que volta igual com a nota, passa sem ser conferido", async () => {
    authed.ok = true;
    const res = await PATCH(
      req("PATCH", { phone: "266 00 00 0 (escritório)", notes: "Pagar a 30 dias" }),
      ctx("s1"),
    );
    expect(res.status).toBe(200);
    expect(store.update).toHaveBeenCalledWith("s1", {
      phone: "266 00 00 0 (escritório)",
      notes: "Pagar a 30 dias",
    });
  });
});
