import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Confirmar a palavra-passe antes de registar um aparelho (auditoria de 13/11,
 * n.º 5). Sem ADMIN_USERS, a palavra-passe é a partilhada de desenvolvimento.
 */
process.env.SESSION_SECRET = "um-segredo-de-testes-com-32-caracteres-ou-mais";

vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const limite = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: limite.ok, retryAfter: 900 })),
  sweep: () => {},
}));

const { POST } = await import("./route");
const { ADMIN_COOKIE, ADMIN_REAUTH_COOKIE, confirmacaoValida, createSession } =
  await import("@/lib/admin-auth");

function pedido(password: string, sessao: string | null = "Catarina") {
  return new NextRequest("https://liquen.test/api/admin/passkeys/confirmar", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(sessao ? { cookie: `${ADMIN_COOKIE}=${createSession(sessao)}` } : {}),
    },
    body: JSON.stringify({ password }),
  });
}

beforeEach(() => {
  limite.ok = true;
  delete process.env.ADMIN_USERS;
  delete process.env.ADMIN_PASSWORD_HASH;
});

describe("POST /api/admin/passkeys/confirmar", () => {
  it("sem sessão, 401", async () => {
    expect((await POST(pedido("liquen2026", null))).status).toBe(401);
  });

  it("palavra-passe errada: 401 e nenhuma confirmação", async () => {
    const res = await POST(pedido("errada"));
    expect(res.status).toBe(401);
    expect(res.cookies.get(ADMIN_REAUTH_COOKIE)).toBeUndefined();
  });

  it("palavra-passe certa: deixa a confirmação desta conta", async () => {
    const res = await POST(pedido("liquen2026"));
    expect(res.status).toBe(200);
    const cookie = res.cookies.get(ADMIN_REAUTH_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    expect(confirmacaoValida(cookie?.value, "Catarina")).toBe(true);
    expect(confirmacaoValida(cookie?.value, "Rui")).toBe(false);
  });

  it("acima do limite de tentativas, 429", async () => {
    limite.ok = false;
    expect((await POST(pedido("liquen2026"))).status).toBe(429);
  });
});
