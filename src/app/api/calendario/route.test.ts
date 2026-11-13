import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  list: vi.fn(async () => [{ id: "e1", title: "Reunião", date: "2026-07-01" }]),
  create: vi.fn(async (e: Record<string, unknown>) => ({ id: "e-new", ...e })),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/calendar-store", () => ({
  listCalendarEvents: store.list,
  createCalendarEvent: store.create,
}));

import { GET, POST } from "./route";

function req(method: "GET" | "POST", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/calendario", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("/api/calendario", () => {
  it("GET and POST reject the unauthenticated with 401", async () => {
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await POST(req("POST", { title: "X", date: "2026-07-01" }))).status).toBe(401);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("GET returns the events for an authenticated admin", async () => {
    authed.ok = true;
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "e1", title: "Reunião", date: "2026-07-01" }]);
  });

  it("POST creates an event when authenticated", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { title: "Visita ao espaço", date: "2026-08-15" }));
    expect(res.status).toBe(200);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it("POST answers 400 (not 500) to a malformed or non-object body", async () => {
    authed.ok = true;
    const cru = (corpo: string) =>
      new Request("https://liquen.test/api/calendario", {
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

  it("POST rejects a malformed/missing date with 400", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { title: "Sem data válida", date: "15/08/2026" }));
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });
});

/** Achado n.º 15 da auditoria 6: um dia que não existe dava 500 do Postgres. */
describe("POST /api/calendario — a data, a hora e os tectos", () => {
  it("«2027-02-30» é 400 com a frase em português, e nunca chega à base de dados", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { title: "Reunião", date: "2027-02-30" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Data inválida/);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("uma hora que não existe é 400", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { title: "Reunião", date: "2027-02-10", time: "24:99" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Hora inválida/);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("título e nota têm tecto", async () => {
    authed.ok = true;
    const longo = await POST(req("POST", { title: "x".repeat(201), date: "2027-02-10" }));
    expect(longo.status).toBe(400);
    const nota = await POST(
      req("POST", { title: "Reunião", date: "2027-02-10", note: "x".repeat(2001) }),
    );
    expect(nota.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("uma marcação certa grava-se com a hora e a nota", async () => {
    authed.ok = true;
    const res = await POST(
      req("POST", { title: "Reunião", date: "2027-02-10", time: "09:30", note: "Na quinta" }),
    );
    expect(res.status).toBe(200);
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2027-02-10", time: "09:30", note: "Na quinta" }),
    );
  });
});
