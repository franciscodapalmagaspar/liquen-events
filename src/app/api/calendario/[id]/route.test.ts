import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  del: vi.fn(async (id: string) => id),
  mover: vi.fn(async (id: string, p: { date: string; time?: string }) => ({ id, ...p })),
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
vi.mock("@/lib/calendar-store", () => ({
  deleteCalendarEvent: store.del,
  moverCalendarEvent: store.mover,
}));

import { DELETE, PATCH } from "./route";
import { ConflictError } from "@/lib/repository";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(): NextRequest {
  return new Request("https://liquen.test/api/calendario/e1", {
    method: "DELETE",
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("/api/calendario/[id]", () => {
  it("DELETE rejects the unauthenticated with 401", async () => {
    expect((await DELETE(req(), ctx("e1"))).status).toBe(401);
    expect(store.del).not.toHaveBeenCalled();
  });

  it("DELETE removes the event when authenticated", async () => {
    authed.ok = true;
    const res = await DELETE(req(), ctx("e1"));
    expect(res.status).toBe(200);
    expect(store.del).toHaveBeenCalledWith("e1");
  });

  describe("PATCH — mover de dia (fase 09)", () => {
    const patch = (body: unknown) =>
      new Request("https://liquen.test/api/calendario/e1", {
        method: "PATCH",
        body: typeof body === "string" ? body : JSON.stringify(body),
      }) as unknown as NextRequest;

    it("401 sem sessão, e o store nem é tocado", async () => {
      expect((await PATCH(patch({ date: "2026-09-12" }), ctx("e1"))).status).toBe(401);
      expect(store.mover).not.toHaveBeenCalled();
    });

    it("move a data — e só a data, se não vier hora", async () => {
      authed.ok = true;
      const res = await PATCH(patch({ date: "2026-09-12", title: "não se mexe" }), ctx("e1"));
      expect(res.status).toBe(200);
      expect(store.mover).toHaveBeenCalledWith("e1", { date: "2026-09-12" });
    });

    it("leva a hora quando vem (vazia = sem hora)", async () => {
      authed.ok = true;
      await PATCH(patch({ date: "2026-09-12", time: "" }), ctx("e1"));
      expect(store.mover).toHaveBeenCalledWith("e1", { date: "2026-09-12", time: "" });
    });

    it("400 para data ou hora mal formadas, e para corpo inválido", async () => {
      authed.ok = true;
      expect((await PATCH(patch({ date: "12/09/2026" }), ctx("e1"))).status).toBe(400);
      expect((await PATCH(patch({ date: "2026-09-12", time: "9h" }), ctx("e1"))).status).toBe(400);
      expect((await PATCH(patch("{mal"), ctx("e1"))).status).toBe(400);
      expect(store.mover).not.toHaveBeenCalled();
    });

    it("404 se já não existe; 409 se outra pessoa a mudou entretanto", async () => {
      authed.ok = true;
      store.mover.mockResolvedValueOnce(null as never);
      expect((await PATCH(patch({ date: "2026-09-12" }), ctx("e1"))).status).toBe(404);
      store.mover.mockRejectedValueOnce(new ConflictError("e1", { table: "calendar_events" }));
      expect((await PATCH(patch({ date: "2026-09-12" }), ctx("e1"))).status).toBe(409);
    });
  });
});
