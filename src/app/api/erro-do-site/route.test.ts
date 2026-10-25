import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Os erros do browser do site público. Prende-se o que esta porta aberta NÃO
 * pode fazer: encher o registo, levar um token de proposta, aceitar um corpo
 * grande, ou responder com erro (que aparecia a vermelho na consola do
 * visitante).
 */
const st = vi.hoisted(() => ({
  ritmoOk: true,
  registado: [] as Array<{ mensagem: string; contexto: Record<string, unknown> }>,
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "1.2.3.4",
  rateLimit: async () => ({ ok: st.ritmoOk }),
}));
vi.mock("@/lib/logger", () => ({
  log: {
    error: (mensagem: string, _e: unknown, contexto: Record<string, unknown>) =>
      st.registado.push({ mensagem, contexto }),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { POST } from "./route";

const req = (corpo: unknown) =>
  new Request("https://liquen.test/api/erro-do-site", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  }) as unknown as NextRequest;

beforeEach(() => {
  st.ritmoOk = true;
  st.registado = [];
});

describe("POST /api/erro-do-site", () => {
  it("escreve o erro no registo, com o caminho sem o token da proposta", async () => {
    const r = await POST(
      req({ mensagem: "x is undefined", onde: "/proposta/abc.def", marca: "window.error" }),
    );
    expect(r.status).toBe(204);
    expect(st.registado).toHaveLength(1);
    expect(st.registado[0]!.mensagem).toBe("site no browser: x is undefined");
    expect(st.registado[0]!.contexto.onde).toBe("/proposta/[token]");
  });

  it("só leva os cinco campos, e cortados", async () => {
    await POST(req({ mensagem: "m".repeat(900), nome: "Ana", email: "ana@exemplo.pt" }));
    const { mensagem, contexto } = st.registado[0]!;
    expect(mensagem.length).toBeLessThanOrEqual("site no browser: ".length + 300);
    expect(Object.keys(contexto).sort()).toEqual(["aparelho", "marca", "onde", "rasto"]);
    expect(JSON.stringify(contexto)).not.toContain("ana@");
  });

  it("acima do tecto, corpo grande ou malformado: 204 e nada no registo", async () => {
    st.ritmoOk = false;
    expect((await POST(req({ mensagem: "a" }))).status).toBe(204);
    st.ritmoOk = true;
    expect((await POST(req({ mensagem: "x".repeat(5000) }))).status).toBe(204);
    expect((await POST(req("{nao é json"))).status).toBe(204);
    expect(st.registado).toHaveLength(0);
  });
});
