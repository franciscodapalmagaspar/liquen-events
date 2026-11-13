import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const terminadas = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/sessoes-revogadas", () => ({
  terminarSessao: vi.fn(async (t: string) => {
    terminadas.push(t);
    return true;
  }),
}));

import { ADMIN_COOKIE, ADMIN_NAME_COOKIE } from "@/lib/admin-auth";
import * as route from "./route";

const { POST } = route;

describe("POST /api/admin/logout", () => {
  it("clears the admin session cookie (empty value, immediate expiry, httpOnly)", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const cookie = res.cookies.get(ADMIN_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/");
  });

  it("also clears the (non-httpOnly) display-name cookie", async () => {
    const res = await POST();
    const name = res.cookies.get(ADMIN_NAME_COOKIE);
    expect(name).toBeDefined();
    expect(name?.value).toBe("");
    expect(name?.maxAge).toBe(0);
    expect(name?.httpOnly).toBe(false);
  });

  it("is idempotent when already logged out (no request/cookie needed)", async () => {
    const a = await POST();
    const b = await POST();
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.cookies.get(ADMIN_COOKIE)?.value).toBe("");
  });

  it("only exposes POST — GET/PUT/DELETE are not handled here (method guard)", () => {
    expect(typeof POST).toBe("function");
    expect((route as Record<string, unknown>).GET).toBeUndefined();
    expect((route as Record<string, unknown>).PUT).toBeUndefined();
    expect((route as Record<string, unknown>).DELETE).toBeUndefined();
  });

  it("termina a sessão no servidor — uma cópia do cookie deixa de valer (n.º 6)", async () => {
    const req = new NextRequest(new URL("https://liquen.test/api/admin/logout"), {
      method: "POST",
      headers: { cookie: `${ADMIN_COOKIE}=corpo.assinatura` },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(terminadas).toContain("corpo.assinatura");
  });
});
