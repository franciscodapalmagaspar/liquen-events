import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({ create: vi.fn(async () => {}) }));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/quotes-store", () => ({
  createQuote: store.create,
  generateQuoteId: () => "LIQ-MANUAL-0000000000000000",
}));

import { POST } from "./route";

function req(body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("POST /api/orcamento/manual", () => {
  it("rejects the unauthenticated with 401 and never persists", async () => {
    const res = await POST(req({ name: "Ana" }));
    expect(res.status).toBe(401);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("requires a non-empty name (400)", async () => {
    authed.ok = true;
    const res = await POST(req({ name: "   " }));
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("creates a manual quote with a default em_revisao status and no client email sent", async () => {
    authed.ok = true;
    const res = await POST(req({ name: "Ana Cliente", email: "ana@x.pt", guests: 40 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.quote).toMatchObject({
      name: "Ana Cliente",
      status: "em_revisao",
      guests: 40,
      referralSource: "Contacto direto",
    });
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it("clamps negative/absurd guest counts into range", async () => {
    authed.ok = true;
    const neg = await (await POST(req({ name: "X", guests: -5 }))).json();
    expect(neg.quote.guests).toBe(0);
    const huge = await (await POST(req({ name: "X", guests: 10_000_000 }))).json();
    expect(huge.quote.guests).toBe(100000);
  });

  it("honours an explicit status when provided", async () => {
    authed.ok = true;
    const json = await (await POST(req({ name: "X", status: "cotado" }))).json();
    expect(json.quote.status).toBe("cotado");
  });

  it("returns 500 when persistence throws", async () => {
    authed.ok = true;
    store.create.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(req({ name: "Ana" }));
    expect(res.status).toBe(500);
  });

  it("returns 400 (not an uncaught 500) for a malformed JSON body", async () => {
    authed.ok = true;
    const bad = new Request("https://liquen.test/api/orcamento/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    }) as unknown as NextRequest;
    const res = await POST(bad);
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-object JSON body (null) instead of crashing", async () => {
    authed.ok = true;
    const res = await POST(req(null));
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("never persists a NaN quotedPrice from a non-numeric input", async () => {
    authed.ok = true;
    const res = await POST(req({ name: "Ana", quotedPrice: "abc" }));
    expect(res.status).toBe(200);
    const persisted = (store.create.mock.calls[0] as unknown[])[0] as { quotedPrice?: number };
    expect(persisted.quotedPrice ?? null).not.toBeNaN();
    expect(persisted.quotedPrice).toBeUndefined();
  });

  it("clamps quotedPrice into [0, 10M] (no negative / absurd prices)", async () => {
    authed.ok = true;
    const neg = await (await POST(req({ name: "X", quotedPrice: -500 }))).json();
    expect(neg.quote.quotedPrice).toBe(0);
    const huge = await (await POST(req({ name: "X", quotedPrice: 99_999_999_999 }))).json();
    expect(huge.quote.quotedPrice).toBe(10_000_000);
  });

  it("keeps a valid quotedPrice untouched", async () => {
    authed.ok = true;
    const json = await (await POST(req({ name: "X", quotedPrice: 12500 }))).json();
    expect(json.quote.quotedPrice).toBe(12500);
  });

  it("rejects an invalid status, falling back to the default (no garbage persisted)", async () => {
    authed.ok = true;
    const json = await (await POST(req({ name: "X", status: "garbage" }))).json();
    expect(json.quote.status).toBe("em_revisao");
  });

  it("floors a fractional guest count to an integer", async () => {
    authed.ok = true;
    const json = await (await POST(req({ name: "X", guests: 50.9 }))).json();
    expect(json.quote.guests).toBe(50);
  });

  /**
   * Eram os dois ÚNICOS campos do objecto sem `str(...)`: passavam com um
   * `?? null` e entravam tal e qual no jsonb do pedido — e daí para a cópia de
   * segurança, que tem tecto.
   */
  it("a categoria e o tipo de evento passam pelo mesmo tratamento dos vizinhos", async () => {
    authed.ok = true;
    const json = await (
      await POST(req({ name: "X", category: { nao: "é texto" }, eventType: "e".repeat(500) }))
    ).json();
    expect(typeof json.quote.category).toBe("string");
    expect(json.quote.category.length).toBeLessThanOrEqual(40);
    expect(json.quote.eventType.length).toBe(60);
  });

  it("sem categoria nem tipo, continuam a ser null (o «Outro» de sempre)", async () => {
    authed.ok = true;
    const json = await (await POST(req({ name: "X" }))).json();
    expect(json.quote.category).toBeNull();
    expect(json.quote.eventType).toBeNull();
  });
});

/**
 * OS CONTACTOS ESCRITOS À MÃO TAMBÉM TÊM DE EXISTIR (pedido dela, 30/10).
 * Até aqui o email não era conferido de forma nenhuma, e o telefone eram
 * quarenta caracteres quaisquer. Os dois continuam opcionais.
 */
describe("POST /api/orcamento/manual — o email e o telefone", () => {
  it("um email sem forma de email é recusado, com o campo", async () => {
    authed.ok = true;
    const res = await POST(req({ name: "Ana", email: "ana@" }));
    expect(res.status).toBe(400);
    expect((await res.json()).campo).toBe("email");
    expect(store.create).not.toHaveBeenCalled();
  });

  it("um email com um domínio que não recebe correio é recusado, com a frase do site", async () => {
    authed.ok = true;
    const res = await POST(req({ name: "Ana", email: "ana@nao-existe.invalid" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error:
        "Este email não parece existir: confira o que está depois do @ (por exemplo, gmail.com).",
      campo: "email",
    });
    expect(store.create).not.toHaveBeenCalled();
  });

  it.each(["91234", "+44 7911 12", "123456789"])(
    "um telefone que não existe (%s) é recusado, com o campo",
    async (phone) => {
      authed.ok = true;
      const res = await POST(req({ name: "Ana", phone }));
      expect(res.status).toBe(400);
      expect((await res.json()).campo).toBe("telefone");
      expect(store.create).not.toHaveBeenCalled();
    },
  );

  it("um telefone válido de qualquer país grava-se em E.164", async () => {
    authed.ok = true;
    const json = await (await POST(req({ name: "Ana", phone: "+55 11 91234-5678" }))).json();
    expect(json.quote.phone).toBe("+5511912345678");
    const nacional = await (await POST(req({ name: "Rui", phone: "912 345 678" }))).json();
    expect(nacional.quote.phone).toBe("+351912345678");
  });

  it("sem email nem telefone continua a valer (um telefonema)", async () => {
    authed.ok = true;
    const json = await (await POST(req({ name: "Ana" }))).json();
    expect(json.quote).toMatchObject({ email: "", phone: "" });
  });
});
