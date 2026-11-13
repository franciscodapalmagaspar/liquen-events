import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  list: vi.fn(async () => [{ id: "t1", title: "Existing" }]),
  create: vi.fn(async (t: Record<string, unknown>) => ({ id: "t-new", ...t })),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/tasks-store", () => ({ listTasks: store.list, createTask: store.create }));

import { GET, POST } from "./route";

function req(method: "GET" | "POST", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/tarefas", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("/api/tarefas", () => {
  it("GET and POST reject the unauthenticated with 401", async () => {
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await POST(req("POST", { title: "X" }))).status).toBe(401);
    expect(store.list).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });

  it("GET returns the list for an authenticated admin", async () => {
    authed.ok = true;
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "t1", title: "Existing" }]);
  });

  it("POST creates a task when authenticated", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { title: "Nova tarefa" }));
    expect(res.status).toBe(200);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it("POST rejects an empty title with 400", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { title: "   " }));
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("POST rejects an invalid priority with 400 (value validation)", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { title: "X", priority: "urgente" }));
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("POST rejects a malformed JSON body with 400 (not a 500)", async () => {
    authed.ok = true;
    const bad = new Request("https://liquen.test/api/tarefas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    }) as unknown as NextRequest;
    const res = await POST(bad);
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("POST maps only the whitelisted fields into the created task", async () => {
    authed.ok = true;
    await POST(req("POST", { title: "Nova", priority: "alta", dueDate: "2026-08-01" }));
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Nova", priority: "alta", dueDate: "2026-08-01" }),
    );
  });

  /**
   * N.º 2 da auditoria de 13/11: «amanhã às 10h» gravava `2026-11-13T10:00`. A
   * tarefa saía de «Hoje», caía em «Semana», mostrava «Invalid Date» e a coluna
   * `date` perdia a hora ao recarregar. O prazo grava-se como dia; a hora vai
   * para o título.
   */
  it("n.º 2: um prazo com hora grava-se como dia, e a hora fica no título", async () => {
    authed.ok = true;
    await POST(req("POST", { title: "Confirmar florista", dueDate: "2026-11-13T10:00" }));
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Confirmar florista às 10h", dueDate: "2026-11-13" }),
    );
  });
});
