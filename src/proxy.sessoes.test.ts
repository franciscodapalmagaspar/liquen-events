import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Auditoria de 13/11, n.º 6: uma sessão revogada (saiu, ou a palavra-passe foi
 * redefinida) chega às rotas da `/api` SEM o cookie de sessão — e todas a
 * tratam como quem não entrou.
 */
const H = vi.hoisted(() => ({
  revogada: false,
  /** Sem registo das revogações (instância nova, Supabase lento). */
  semRegisto: false,
}));

vi.mock("@/lib/sessoes-revogadas", () => ({
  MENSAGEM_REVOGACAO_INDISPONIVEL: "Não foi possível confirmar a sessão neste momento.",
  estadoDaSessao: vi.fn(async (_t: string, o: { muda: boolean }) => {
    if (H.semRegisto) return o.muda ? "indisponivel" : "valida";
    return H.revogada ? "revogada" : "valida";
  }),
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
  H.semRegisto = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function pedido(token: string, method = "GET"): NextRequest {
  return new NextRequest(new URL("https://liquen.test/api/orcamento?resumo=1"), {
    method,
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

  // Auditoria de 16/11, n.º 7.
  it("sem o registo das revogações, o que MUDA dados recebe 503 e não chega à rota", async () => {
    H.semRegisto = true;
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await proxy(pedido(createSession("TESTE Ana"), m));
      expect(res.status, m).toBe(503);
      expect(res.headers.get("x-middleware-next"), m).toBeNull();
      expect(res.headers.get("retry-after"), m).toBe("5");
      expect((await res.json()).error, m).toMatch(/confirmar a sessão/);
    }
  });

  it("sem o registo das revogações, o que só LÊ continua a passar", async () => {
    H.semRegisto = true;
    const token = createSession("TESTE Ana");
    const res = await proxy(pedido(token, "GET"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("sem sessão, um POST sem registo não é travado (o formulário público)", async () => {
    H.semRegisto = true;
    const res = await proxy(
      new NextRequest(new URL("https://liquen.test/api/orcamento"), { method: "POST" }),
    );
    expect(res.status).toBe(200);
  });
});
