import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mapper } from "./repository";

/**
 * A LIMPEZA DAS PASSKEYS ANTERIORES A UMA RECUPERAÇÃO NUNCA TOCA NOUTRA CONTA
 * (revisão de 16/11, n.º 6).
 *
 * Aqui o `listPasskeysFor` e o `removePasskeyOwnedBy` são os VERDADEIROS; só a
 * tabela por baixo é simulada (como em `passkeys-store.test.ts`). O corte de
 * cada conta é dado à mão: o que se prova é que a limpeza de uma conta apaga
 * só o que é dela, mesmo quando outra conta tem passkeys igualmente antigas.
 */

type Passkey = import("./passkeys-store").Passkey;

const db = vi.hoisted(() => ({ rows: new Map<string, unknown>() }));

vi.mock("server-only", () => ({}));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("./repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./repository")>();
  return {
    ...actual,
    createRepository: (mapper: Mapper<Passkey>) => ({
      list: async () => [...db.rows.values()] as Passkey[],
      get: async (id: string) => (db.rows.get(id) as Passkey | undefined) ?? null,
      create: async (e: Passkey) => {
        db.rows.set(mapper.getId(e), e);
      },
      update: async () => null,
      remove: async (id: string) => {
        db.rows.delete(id);
      },
    }),
  };
});

/** O instante da última recuperação, por conta (em minúsculas). */
const cortes = vi.hoisted(() => new Map<string, number>());
vi.mock("./admin-auth", async (orig) => ({
  ...(await orig<typeof import("./admin-auth")>()),
  cortePasskeys: vi.fn(async (nome: string) => ({
    ok: true,
    desde: cortes.get(nome.trim().toLowerCase()) ?? null,
  })),
}));

const { passkeysDaConta } = await import("./passkeys-da-conta");

const ANTES = "2026-08-01T10:00:00.000Z";
const DEPOIS = "2026-11-12T10:00:00.000Z";
const CORTE = Date.parse("2026-11-10T00:00:00.000Z");

function passkey(id: string, userName: string, createdAt: string): Passkey {
  return {
    id,
    userName,
    publicKey: "chave",
    counter: 0,
    transports: [],
    rpId: "liquen.test",
    deviceLabel: "iPhone",
    createdAt,
    lastUsedAt: null,
  };
}

beforeEach(() => {
  db.rows.clear();
  cortes.clear();
  for (const p of [
    passkey("cat-antiga", "Catarina", ANTES),
    passkey("cat-nova", "Catarina", DEPOIS),
    passkey("rui-antiga", "Rui", ANTES),
    passkey("rui-nova", "Rui", DEPOIS),
  ]) {
    db.rows.set(p.id, p);
  }
});

describe("passkeysDaConta — a limpeza depois de uma recuperação", () => {
  it("apaga só as antigas DESTA conta; as do Rui, igualmente antigas, ficam", async () => {
    cortes.set("catarina", CORTE);
    const vivas = await passkeysDaConta("Catarina");
    expect(vivas.map((p) => p.id)).toEqual(["cat-nova"]);
    expect([...db.rows.keys()].sort()).toEqual(["cat-nova", "rui-antiga", "rui-nova"]);
  });

  it("o nome com outras maiúsculas é a mesma conta, e continua a não tocar na do lado", async () => {
    cortes.set("catarina", CORTE);
    await passkeysDaConta("  CATARINA ");
    expect(db.rows.has("cat-antiga")).toBe(false);
    expect(db.rows.has("rui-antiga")).toBe(true);
  });

  it("uma conta sem recuperação não perde nada", async () => {
    cortes.set("catarina", CORTE);
    const doRui = await passkeysDaConta("Rui");
    expect(doRui.map((p) => p.id).sort()).toEqual(["rui-antiga", "rui-nova"]);
    expect(db.rows.size).toBe(4);
  });
});
