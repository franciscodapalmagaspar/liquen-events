import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  list: vi.fn(async () => [{ id: "s1", name: "Catering Sol" }]),
  create: vi.fn(async (s: Record<string, unknown>) => ({ id: "s-new", ...s })),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/suppliers-store", () => ({
  listSuppliers: store.list,
  createSupplier: store.create,
}));

import { GET, POST } from "./route";

function req(method: "GET" | "POST", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/fornecedores", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("/api/fornecedores", () => {
  it("GET and POST reject the unauthenticated with 401", async () => {
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await POST(req("POST", { name: "X" }))).status).toBe(401);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("GET returns the suppliers for an authenticated admin", async () => {
    authed.ok = true;
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "s1", name: "Catering Sol" }]);
  });

  it("POST creates a supplier when authenticated", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { name: "Floristas Lua", category: "Floristas" }));
    expect(res.status).toBe(200);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it("POST answers 400 (not 500) to a malformed or non-object body", async () => {
    authed.ok = true;
    const cru = (corpo: string) =>
      new Request("https://liquen.test/api/fornecedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corpo,
      }) as unknown as NextRequest;
    for (const corpo of ["{ isto não é JSON", "null", '"uma string"', "[]"]) {
      const res = await POST(cru(corpo));
      expect(res.status, corpo).toBe(400);
    }
    expect(store.create).not.toHaveBeenCalled();
  });

  it("POST rejects an empty name with 400", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { name: "" }));
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });
});

/** O telefone de um fornecedor novo também tem de existir (30/10), em E.164. */
describe("POST /api/fornecedores — o telefone", () => {
  it("um telefone que não existe é recusado, com o campo", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { name: "Flores Lda", phone: "123456789" }));
    expect(res.status).toBe(400);
    expect((await res.json()).campo).toBe("telefone");
    expect(store.create).not.toHaveBeenCalled();
  });

  it("um número francês sem indicativo não é português, e é recusado", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { name: "Flores Lda", phone: "06 12 34 56 78" }));
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("com o indicativo, grava-se em E.164", async () => {
    authed.ok = true;
    await POST(req("POST", { name: "Flores Lda", phone: "+33 6 12 34 56 78" }));
    expect(store.create).toHaveBeenCalledWith(expect.objectContaining({ phone: "+33612345678" }));
  });
});
