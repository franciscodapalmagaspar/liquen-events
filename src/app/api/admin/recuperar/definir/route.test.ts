import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

/**
 * A rota que GASTA a ligação. A lógica (uso único, expiração, o ambiente a
 * mandar) está presa em `src/lib/admin-auth.recuperacao.test.ts`; aqui prende-se
 * o que só existe na rota: os códigos de estado e — o que mais interessa — que
 * uma gravação falhada NUNCA sai daqui como «pronto».
 */
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: () => "test-ip",
  sweep: () => {},
}));

const estado = vi.hoisted(() => ({ mapa: new Map<string, unknown>(), recusaEscrita: false }));
vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async (k: string) => {
    const v = estado.mapa.get(k);
    return v === undefined ? null : JSON.parse(JSON.stringify(v));
  }),
  setState: vi.fn(async (k: string, v: unknown) => {
    if (estado.recusaEscrita) {
      return { gravado: false, duradouro: false, onde: "nenhures", motivo: "escrita-recusada" };
    }
    estado.mapa.set(k, JSON.parse(JSON.stringify(v)));
    return { gravado: true, duradouro: true, onde: "servidor" };
  }),
  // A recuperação grava com escrita condicional (n.º 4 de 16/11).
  lerEstadoComVersao: vi.fn(async (k: string) => {
    const v = estado.mapa.get(k);
    return v === undefined
      ? { valor: null, versao: null }
      : { valor: JSON.parse(JSON.stringify(v)), versao: JSON.stringify(v) };
  }),
  gravarEstadoSeNaoMudou: vi.fn(async (k: string, v: unknown, versao: string | null) => {
    const atual = estado.mapa.get(k);
    if ((atual === undefined ? null : JSON.stringify(atual)) !== versao) return "conflito";
    if (estado.recusaEscrita) return "falhou";
    estado.mapa.set(k, JSON.parse(JSON.stringify(v)));
    return "gravado";
  }),
}));

import { POST } from "./route";
import { pedirRecuperacao, verifyCredentials } from "@/lib/admin-auth";

function definir(body: unknown): NextRequest {
  return new Request("https://liquen-events.com/api/admin/recuperar/definir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const KEYS = ["ADMIN_USERS", "SESSION_SECRET"];
const guardado: Record<string, string | undefined> = {};

async function ligacaoParaCatarina(): Promise<string> {
  const r = await pedirRecuperacao("catarina@liquen-events.com");
  if (r.estado !== "emitido") throw new Error(`esperava um token, veio ${r.estado}`);
  return r.token;
}

beforeEach(() => {
  estado.mapa.clear();
  estado.recusaEscrita = false;
  for (const k of KEYS) guardado[k] = process.env[k];
  process.env.SESSION_SECRET = "definir-rota-secret-1234567890"; // gitleaks:allow — segredo de teste, gerado aqui e sem valor fora daqui
  process.env.ADMIN_USERS = JSON.stringify([
    {
      name: "Catarina",
      email: "catarina@liquen-events.com",
      passwordHash: bcrypt.hashSync("cat-pass", 10),
    },
  ]);
});
afterEach(() => {
  for (const k of KEYS) {
    if (guardado[k] === undefined) delete process.env[k];
    else process.env[k] = guardado[k];
  }
});

describe("POST /api/admin/recuperar/definir", () => {
  it("define a palavra-passe e a ligação deixa de servir", async () => {
    const token = await ligacaoParaCatarina();
    const primeira = await POST(definir({ token, password: "a-minha-frase-nova" }));
    expect(primeira.status).toBe(200);
    expect(
      await verifyCredentials("catarina@liquen-events.com", "a-minha-frase-nova"),
    ).toMatchObject({ name: "Catarina" });

    const segunda = await POST(definir({ token, password: "outra-frase-qualquer" }));
    expect(segunda.status).toBe(400);
  });

  it("uma palavra-passe curta diz PORQUÊ — é a única recusa que explica", async () => {
    const token = await ligacaoParaCatarina();
    const res = await POST(definir({ token, password: "curta" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("12 caracteres");
  });

  it("sem ligação nenhuma, recusa sem ir ao armazenamento", async () => {
    const res = await POST(definir({ password: "a-minha-frase-nova" }));
    expect(res.status).toBe(400);
  });

  it("gravação falhada → 503, e a palavra-passe anterior continua a valer", async () => {
    const token = await ligacaoParaCatarina();
    estado.recusaEscrita = true;
    const res = await POST(definir({ token, password: "a-minha-frase-nova" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("NADA foi alterado");

    estado.recusaEscrita = false;
    expect(await verifyCredentials("catarina@liquen-events.com", "cat-pass")).toMatchObject({
      name: "Catarina",
    });
  });
});
