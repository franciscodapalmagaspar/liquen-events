import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Auditoria de 13/11, n.º 6: uma sessão revogada (saiu, ou a palavra-passe foi
 * redefinida) chega às rotas da `/api` SEM o cookie de sessão — e todas a
 * tratam como quem não entrou.
 */
const H = vi.hoisted(() => ({ revogada: false }));

vi.mock("@/lib/sessoes-revogadas", () => ({
  sessaoRevogada: vi.fn(async () => H.revogada),
}));
vi.mock("@/lib/registo-de-acoes", () => ({
  deveRegistar: () => false,
  registarAcao: vi.fn(async () => {}),
}));

import { proxy } from "./proxy";
import { ADMIN_COOKIE, createSession } from "./lib/admin-auth";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret-please-change-1234567890");
  vi.stubEnv("ADMIN_USERS", "");
  H.revogada = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function pedido(token: string): NextRequest {
  return new NextRequest(new URL("https://liquen.test/api/orcamento?resumo=1"), {
    headers: { cookie: `${ADMIN_COOKIE}=${token}; liquen-lang=pt` },
  });
}

/** O `Cookie` que a rota vai ver, tal como o proxy o deixa seguir. */
function cookieQueSegue(res: Response): string | null {
  return res.headers.get("x-middleware-request-cookie");
}

describe("o proxy e as sessões revogadas", () => {
  it("uma sessão revogada segue SEM o cookie de sessão, e o browser apaga-o", async () => {
    H.revogada = true;
    const res = await proxy(pedido(createSession("TESTE Ana")));
    const segue = cookieQueSegue(res) ?? "";
    expect(segue).not.toContain(`${ADMIN_COOKIE}=`);
    expect(segue).toContain("liquen-lang=pt");
    expect(res.headers.get("set-cookie") ?? "").toMatch(new RegExp(`${ADMIN_COOKIE}=;`));
  });

  it("uma sessão válida segue como estava", async () => {
    const token = createSession("TESTE Ana");
    const res = await proxy(pedido(token));
    const segue = cookieQueSegue(res);
    // Sem mudança, o proxy não reescreve o cookie (ou reescreve-o igual).
    if (segue !== null) expect(segue).toContain(`${ADMIN_COOKIE}=${token}`);
    expect(res.headers.get("set-cookie") ?? "").not.toContain(`${ADMIN_COOKIE}=;`);
  });
});
