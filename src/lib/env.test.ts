import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const VARS = [
  "SESSION_SECRET",
  "ADMIN_USERS",
  "ADMIN_PASSWORD_HASH",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "SENTRY_DSN",
  "CRON_SECRET",
  "DEEPL_API_KEY",
] as const;

/** validateEnv() is idempotent via a module-level flag, so each test needs a
 *  fresh module instance. */
async function freshValidate() {
  vi.resetModules();
  return (await import("./env")).validateEnv;
}

function joined(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n");
}

describe("validateEnv", () => {
  const saved: Record<string, string | undefined> = {};
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    for (const k of VARS) saved[k] = process.env[k];
    for (const k of VARS) delete process.env[k];
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    for (const k of VARS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    logSpy.mockRestore();
    errSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("logs success when every known variable is present", async () => {
    for (const k of VARS) process.env[k] = "x";
    (await freshValidate())();
    expect(joined(logSpy)).toContain("Environment validated");
  });

  it("warns (but does not error) about optional vars outside production", async () => {
    // Ambient NODE_ENV under vitest is "test" (not production).
    (await freshValidate())();
    expect(joined(errSpy)).toContain("Optional environment variables");
    expect(joined(errSpy)).not.toContain("Missing critical");
  });

  it("errors loudly when a critical var is missing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const k of VARS) if (k !== "SESSION_SECRET") process.env[k] = "x";
    (await freshValidate())();
    const out = joined(errSpy);
    expect(out).toContain("Missing critical environment variables");
    expect(out).toContain("SESSION_SECRET");
  });

  it("treats missing Supabase as critical in production (data would be ephemeral)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const k of VARS) if (!k.startsWith("SUPABASE")) process.env[k] = "x";
    (await freshValidate())();
    const out = joined(errSpy);
    expect(out).toContain("Missing critical environment variables");
    expect(out).toContain("SUPABASE_URL");
    expect(out).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * SEM PALAVRA-PASSE NENHUMA CONFIGURADA, A PORTA DO BACK OFFICE FICA MURADA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `sharedHash()` (admin-auth.ts) devolve `null` em produção quando não há
   * `ADMIN_PASSWORD_HASH` — a hash de desenvolvimento está no repositório e é
   * pública, portanto NUNCA é usada em produção. A alternativa é o
   * `ADMIN_USERS`. Sem um NEM outro, o login de admin fica simplesmente
   * desligado: ninguém entra no back office, e a dona descobre-o quando tenta.
   *
   * Isto era um `warn` no meio dos avisos de SMTP e VAPID — e com a frase
   * errada por cima («else a dev default is used», que é verdade em
   * desenvolvimento e é exactamente o contrário em produção). Um back office
   * inacessível é da mesma família do Supabase em falta: um silêncio que só se
   * ouve tarde.
   */
  it("grita quando produção não tem nem ADMIN_PASSWORD_HASH nem ADMIN_USERS", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const k of VARS)
      if (k !== "ADMIN_PASSWORD_HASH" && k !== "ADMIN_USERS") process.env[k] = "x";
    process.env.SESSION_SECRET = "um-segredo-de-sessao-com-mais-de-32-caracteres"; // gitleaks:allow — segredo de teste
    (await freshValidate())();
    const out = joined(errSpy);
    expect(out).toContain("Missing critical environment variables");
    expect(out).toContain("ADMIN_PASSWORD_HASH");
    // E diz a verdade: em produção não há recurso a palavra-passe nenhuma.
    expect(out).not.toContain("dev default");
  });

  it("cala-se quando o ADMIN_USERS sozinho já abre a porta", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const k of VARS) if (k !== "ADMIN_PASSWORD_HASH") process.env[k] = "x";
    process.env.SESSION_SECRET = "um-segredo-de-sessao-com-mais-de-32-caracteres"; // gitleaks:allow — segredo de teste
    process.env.ADMIN_USERS = '[{"name":"Catarina","passwordHash":"$2b$10$x"}]';
    (await freshValidate())();
    expect(joined(errSpy)).not.toContain("Missing critical");
  });

  it("is idempotent — repeated calls validate only once", async () => {
    const validateEnv = await freshValidate();
    validateEnv();
    const before = logSpy.mock.calls.length + errSpy.mock.calls.length;
    validateEnv();
    validateEnv();
    expect(logSpy.mock.calls.length + errSpy.mock.calls.length).toBe(before);
  });
  /**
   * Registos de 10–17/11: «Optional environment variables not set» 1688 vezes,
   * uma por arranque de função, a afogar os erros verdadeiros. Na Vercel as
   * opcionais dizem-se UMA vez por implantação, na construção
   * (`scripts/variaveis-de-ambiente.mjs`); no arranque, só as críticas.
   */
  it("na Vercel, as opcionais em falta NÃO se repetem a cada arranque de função", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    for (const k of VARS) process.env[k] = "x";
    process.env.SESSION_SECRET = "um-segredo-de-sessao-com-mais-de-32-caracteres"; // gitleaks:allow — segredo de teste
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.SENTRY_DSN;
    (await freshValidate())();
    expect(joined(errSpy)).not.toContain("Optional environment variables");
  });

  it("na Vercel, uma CRÍTICA em falta continua a gritar em cada arranque", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    for (const k of VARS) if (!k.startsWith("SUPABASE")) process.env[k] = "x";
    (await freshValidate())();
    expect(joined(errSpy)).toContain("Missing critical environment variables");
  });
});
