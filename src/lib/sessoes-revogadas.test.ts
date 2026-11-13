import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Auditoria de 13/11, n.º 6: «Sair» e a recuperação da palavra-passe não
 * fechavam as sessões que já existiam (até 30 dias). Agora fecham.
 */
const H = vi.hoisted(() => ({ estado: new Map<string, unknown>(), leituras: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("./app-state", () => ({
  getState: vi.fn(async (k: string) => {
    H.leituras++;
    const v = H.estado.get(k);
    return v === undefined ? null : structuredClone(v);
  }),
  setState: vi.fn(async (k: string, v: unknown) => {
    H.estado.set(k, structuredClone(v));
    return { gravado: true, duradouro: true, onde: "servidor" };
  }),
}));

import { createSession } from "./admin-auth";
import {
  esquecerRevogacoesEmMemoria,
  revogarSessoesDaConta,
  sessaoValida,
  terminarSessao,
} from "./sessoes-revogadas";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret-please-change-1234567890");
  vi.stubEnv("ADMIN_USERS", "");
  H.estado.clear();
  H.leituras = 0;
  esquecerRevogacoesEmMemoria();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("sessões que deixam de valer antes do prazo", () => {
  it("«Sair» termina ESTA sessão — uma cópia do cookie deixa de valer; as outras não", async () => {
    const esta = createSession("TESTE Ana");
    const outra = createSession("TESTE Ana", 1000 * 60 * 60 * 12);
    expect(await sessaoValida(esta)).toEqual({ name: "TESTE Ana" });

    await terminarSessao(esta);
    expect(await sessaoValida(esta)).toBeNull();
    expect(await sessaoValida(outra)).toEqual({ name: "TESTE Ana" });

    // Outra instância, sem nada em memória, lê o mesmo do registo.
    esquecerRevogacoesEmMemoria();
    expect(await sessaoValida(esta)).toBeNull();
  });

  it("redefinir a palavra-passe fecha TODAS as sessões anteriores dessa conta, e só dessa", async () => {
    const ana1 = createSession("TESTE Ana");
    const ana2 = createSession("TESTE Ana");
    const rui = createSession("TESTE Rui");

    vi.setSystemTime(new Date("2026-11-13T10:05:00Z"));
    await revogarSessoesDaConta("TESTE Ana");
    expect(await sessaoValida(ana1)).toBeNull();
    expect(await sessaoValida(ana2)).toBeNull();
    expect(await sessaoValida(rui)).toEqual({ name: "TESTE Rui" });

    // A entrada a seguir, com a palavra-passe nova, vale.
    vi.setSystemTime(new Date("2026-11-13T10:06:00Z"));
    const nova = createSession("TESTE Ana");
    expect(await sessaoValida(nova)).toEqual({ name: "TESTE Ana" });
  });

  it("não lê a base de dados a cada pedido: uma leitura por minuto, no máximo", async () => {
    const t = createSession("TESTE Ana");
    for (let i = 0; i < 20; i++) await sessaoValida(t);
    expect(H.leituras).toBe(1);
    vi.setSystemTime(new Date("2026-11-13T10:01:01Z"));
    await sessaoValida(t);
    expect(H.leituras).toBe(2);
  });
});
