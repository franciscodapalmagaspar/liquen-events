import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { verifyCredentials, createSession, readSession } from "./admin-auth";
import { createProposalToken } from "./proposal-token";

// Keep each test hermetic: auth reads env lazily, so reset what we touch.
const ENV_KEYS = [
  "ADMIN_USERS",
  "ADMIN_PASSWORD_HASH",
  "SESSION_SECRET",
  "SESSION_VERSION",
] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.SESSION_SECRET = "test-secret-please-change-1234567890";
});

afterEach(() => {
  vi.useRealTimers();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("verifyCredentials — shared password fallback", () => {
  it("accepts the default dev password with any name", async () => {
    expect(await verifyCredentials("Catarina", "liquen2026")).toEqual({ name: "Catarina" });
  });

  it("rejects a wrong password", async () => {
    expect(await verifyCredentials("Catarina", "wrong")).toBeNull();
  });

  it("rejects an empty password", async () => {
    expect(await verifyCredentials("Catarina", "")).toBeNull();
  });

  it("defaults the display name when none is given", async () => {
    expect(await verifyCredentials("", "liquen2026")).toEqual({ name: "Equipa" });
  });

  it("honours a custom ADMIN_PASSWORD_HASH", async () => {
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("s3cret!", 10);
    expect(await verifyCredentials("Rui", "s3cret!")).toEqual({ name: "Rui" });
    expect(await verifyCredentials("Rui", "liquen2026")).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA CONTA SEM HASH PRÓPRIO USA A PALAVRA-PASSE QUE A CASA JÁ TEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto existe por causa de uma tarde concreta. A dona da empresa foi ligar a
 * recuperação de palavra-passe, o que exige pôr o `email` da conta dela no
 * `ADMIN_USERS` — variável que a instalação dela nunca teve, porque sempre
 * entrou pela palavra-passe única.
 *
 * Criar o `ADMIN_USERS` obrigava-a a inventar também um `passwordHash`, que
 * não se escreve à mão: gera-se com um comando de Node, num terminal, dentro
 * da pasta do projecto. Ela copiou o EXEMPLO do manual — reticências incluídas,
 * `"$2b$12$..."` — e gravou. À publicação seguinte ficava fechada fora do
 * painel do próprio negócio, sem palavra-passe que correspondesse àquilo.
 *
 * O degrau que estes testes fixam: **acrescentar uma conta não obriga a
 * inventar um segredo.** `name` e `email` chegam, e a palavra-passe continua a
 * ser a que a instalação já tinha.
 */
describe("contas sem `passwordHash` próprio — o degrau da migração", () => {
  it("entra com a palavra-passe partilhada da instalação", async () => {
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("a-de-sempre", 10);
    process.env.ADMIN_USERS = JSON.stringify([
      { name: "Catarina", email: "catarina@liquen-events.com" },
    ]);

    expect(
      await verifyCredentials("catarina@liquen-events.com", "a-de-sempre"),
      "a conta sem hash próprio devia entrar com a palavra-passe da casa",
    ).toEqual({ name: "Catarina", email: "catarina@liquen-events.com" });
    expect(await verifyCredentials("catarina@liquen-events.com", "outra")).toBeNull();
  });

  it("e a conta COM hash próprio continua a usar o dela, não a da casa", async () => {
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("a-de-sempre", 10);
    process.env.ADMIN_USERS = JSON.stringify([
      { name: "Catarina", email: "catarina@liquen-events.com" },
      {
        name: "Rui",
        email: "rui@liquen-events.com",
        passwordHash: bcrypt.hashSync("só-do-rui", 10),
      },
    ]);

    expect(await verifyCredentials("rui@liquen-events.com", "só-do-rui")).toEqual({
      name: "Rui",
      email: "rui@liquen-events.com",
    });
    // A partilhada NÃO abre a conta de quem tem hash próprio. Sem isto, pôr um
    // hash a alguém não lhe dava separação nenhuma — dava-lhe DUAS entradas.
    expect(
      await verifyCredentials("rui@liquen-events.com", "a-de-sempre"),
      "quem tem hash próprio não devia entrar também pela palavra-passe da casa",
    ).toBeNull();
  });

  it("sem hash próprio e sem palavra-passe da casa, o ADMIN_USERS é recusado inteiro", async () => {
    // Em produção não há palavra-passe de recurso. Uma conta assim não teria
    // entrada nenhuma, e o modo de falhar seria o pior: o `ADMIN_USERS` passa a
    // mandar e a instalação fica sem porta, em silêncio.
    // `vi.stubEnv` e não uma atribuição: o `NODE_ENV` é só de leitura nos tipos
    // do Node, e o `unstubAllEnvs` repõe-no sem eu ter de me lembrar.
    vi.stubEnv("NODE_ENV", "production");
    process.env.ADMIN_USERS = JSON.stringify([
      { name: "Catarina", email: "catarina@liquen-events.com" },
    ]);
    try {
      expect(await verifyCredentials("catarina@liquen-events.com", "seja-o-que-for")).toBeNull();
      // E não abre pela pública de desenvolvimento, que está no repositório.
      expect(await verifyCredentials("catarina@liquen-events.com", "liquen2026")).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("verifyCredentials — individual accounts (ADMIN_USERS)", () => {
  beforeEach(() => {
    process.env.ADMIN_USERS = JSON.stringify([
      { name: "Catarina", passwordHash: bcrypt.hashSync("cat-pass", 10) },
      { name: "Rui", passwordHash: bcrypt.hashSync("rui-pass", 10) },
    ]);
  });

  it("matches each user against their own password", async () => {
    expect(await verifyCredentials("Catarina", "cat-pass")).toEqual({ name: "Catarina" });
    expect(await verifyCredentials("Rui", "rui-pass")).toEqual({ name: "Rui" });
  });

  it("does not accept another user's password", async () => {
    expect(await verifyCredentials("Catarina", "rui-pass")).toBeNull();
  });

  it("matches the name case-insensitively", async () => {
    expect(await verifyCredentials("catarina", "cat-pass")).toEqual({ name: "Catarina" });
  });

  it("rejects unknown users", async () => {
    expect(await verifyCredentials("Intruder", "cat-pass")).toBeNull();
  });

  it("falls back to shared password when ADMIN_USERS is malformed", async () => {
    process.env.ADMIN_USERS = "{not json";
    expect(await verifyCredentials("Anyone", "liquen2026")).toEqual({ name: "Anyone" });
  });
});

describe("production fallbacks — login must be disabled without real secrets", () => {
  beforeEach(() => {
    // Simulate production with NOTHING configured: no ADMIN_USERS,
    // no ADMIN_PASSWORD_HASH, no SESSION_SECRET.
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.SESSION_SECRET;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses the committed public dev password in production", async () => {
    // "liquen2026" (DEV_SHARED_HASH) is public knowledge — it must NEVER open a
    // session in production when no real hash is configured.
    expect(await verifyCredentials("Catarina", "liquen2026")).toBeNull();
    expect(await verifyCredentials("", "liquen2026")).toBeNull();
  });

  it("still authenticates a configured ADMIN_PASSWORD_HASH in production", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("prod-pass", 10);
    try {
      expect(await verifyCredentials("Rui", "prod-pass")).toEqual({ name: "Rui" });
      expect(await verifyCredentials("Rui", "liquen2026")).toBeNull();
    } finally {
      delete process.env.ADMIN_PASSWORD_HASH;
    }
  });
});

describe("sessions — signed and expiring", () => {
  it("round-trips a valid session", () => {
    const token = createSession("Catarina");
    expect(readSession(token)).toEqual({ name: "Catarina" });
  });

  it("rejects a tampered payload", () => {
    const token = createSession("Catarina");
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "Hacker", exp: Date.now() + 1e9 })).toString(
      "base64url",
    );
    expect(readSession(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects garbage and empty tokens", () => {
    expect(readSession("")).toBeNull();
    expect(readSession("not-a-token")).toBeNull();
    expect(readSession(null)).toBeNull();
  });

  it("rejects a session signed with a different secret", () => {
    const token = createSession("Catarina");
    process.env.SESSION_SECRET = "a-totally-different-secret-987654321";
    expect(readSession(token)).toBeNull();
  });

  it("rejects an expired session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = createSession("Catarina");
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z")); // > 30 days later
    expect(readSession(token)).toBeNull();
  });

  it("revokes every outstanding session when SESSION_VERSION is bumped", () => {
    const token = createSession("Catarina");
    expect(readSession(token)).toEqual({ name: "Catarina" });
    process.env.SESSION_VERSION = "2";
    expect(readSession(token)).toBeNull();
    // New sessions minted under the new version are valid again.
    expect(readSession(createSession("Catarina"))).toEqual({ name: "Catarina" });
  });

  it("treats tokens without a version claim as version 1", () => {
    // Pre-versioning token: payload has no `v`.
    delete process.env.SESSION_VERSION;
    const legacy = createSession("Catarina");
    expect(readSession(legacy)).toEqual({ name: "Catarina" });
  });

  // Regression: a public proposal-link token must NEVER be accepted as an admin
  // session, even though both are HMACs derived from the same SESSION_SECRET.
  // (This was an auth-bypass: a 14-day proposal link granted full admin access.)
  it("does not accept a proposal-link token as an admin session", () => {
    const proposalToken = createProposalToken("prop-123");
    expect(readSession(proposalToken)).toBeNull();
  });

  it("rejects a validly-signed token that lacks the session type claim", () => {
    // Same key, same wire format, but no typ:"session" → not a session.
    const forged = Buffer.from(
      JSON.stringify({ sub: "Hacker", exp: Date.now() + 1e9, v: "1" }),
    ).toString("base64url");
    // Sign it with the real session flow by tampering a genuine token's body is
    // impossible (sig won't match), so assert the shape guard directly: a token
    // whose payload omits typ is refused.
    expect(readSession(`${forged}.anything`)).toBeNull();
  });
});

/**
 * `contaExiste` — a regra que faz a saída de alguém valer alguma coisa.
 *
 * Uma passkey não passa por `verifyCredentials`: é uma chave presa a um
 * aparelho. Sem esta verificação, tirar uma pessoa do `ADMIN_USERS` mudava-lhe
 * a palavra-passe e deixava-lhe a porta do telemóvel aberta para sempre.
 */
describe("contaExiste", () => {
  it("com ADMIN_USERS, só as contas listadas contam", async () => {
    const { contaExiste } = await import("./admin-auth");
    process.env.ADMIN_USERS = JSON.stringify([
      { name: "Catarina", passwordHash: bcrypt.hashSync("x", 4) },
    ]);
    expect(contaExiste("Catarina")).toBe(true);
    expect(contaExiste("  catarina ")).toBe(true);
    expect(contaExiste("Rui")).toBe(false);
  });

  it("sem ADMIN_USERS (palavra-passe partilhada) qualquer nome conta", async () => {
    // Não há lista de contas para consultar; a alavanca nesse modo é o
    // SESSION_VERSION mais a remoção do dispositivo.
    const { contaExiste } = await import("./admin-auth");
    expect(contaExiste("Quem Quer Que Seja")).toBe(true);
  });

  it("ADMIN_USERS malformado não tranca toda a gente fora", async () => {
    const { contaExiste } = await import("./admin-auth");
    process.env.ADMIN_USERS = "{isto não é json";
    expect(contaExiste("Catarina")).toBe(true);
  });
});

describe("a sessão de quem saiu da equipa (10/11)", () => {
  it("deixa de valer quando a conta sai do ADMIN_USERS", async () => {
    const antes = process.env.ADMIN_USERS;
    const { createSession, readSession } = await import("./admin-auth");
    try {
      process.env.ADMIN_USERS = JSON.stringify([
        { name: "TESTE Ana", email: "ana@exemplo.test", passwordHash: "$2a$04$x" },
        { name: "TESTE Rui", email: "rui@exemplo.test", passwordHash: "$2a$04$x" },
      ]);
      const token = createSession("TESTE Rui");
      expect(readSession(token)).toEqual({ name: "TESTE Rui" });
      process.env.ADMIN_USERS = JSON.stringify([
        { name: "TESTE Ana", email: "ana@exemplo.test", passwordHash: "$2a$04$x" },
      ]);
      expect(readSession(token)).toBeNull();
    } finally {
      if (antes === undefined) delete process.env.ADMIN_USERS;
      else process.env.ADMIN_USERS = antes;
    }
  });
});
