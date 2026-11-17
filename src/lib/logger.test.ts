import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log } from "./logger";

/** Flatten a spy's calls into one searchable string, unwrapping Error args. */
function text(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls
    .flat()
    .map((a: unknown) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a)))
    .join("\n");
}

describe("log", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("routes info/debug to stdout and warn/error to stderr", () => {
    log.info("an info");
    log.debug("a debug");
    log.warn("a warning");
    log.error("an error");
    expect(text(logSpy)).toContain("an info");
    expect(text(logSpy)).toContain("a debug");
    expect(text(errSpy)).toContain("a warning");
    expect(text(errSpy)).toContain("an error");
  });

  it("includes the structured context with the message", () => {
    log.info("with context", { quoteId: "q_1", count: 3 });
    const out = text(logSpy);
    expect(out).toContain("with context");
    expect(out).toContain("quoteId");
    expect(out).toContain("q_1");
  });

  it("surfaces an Error's message when one is passed to error()", () => {
    log.error("operation failed", new Error("kaboom"), { route: "/api/x" });
    const out = text(errSpy);
    expect(out).toContain("operation failed");
    expect(out).toContain("kaboom");
    expect(out).toContain("route");
  });
});

describe("log — error webhook alerting", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    delete process.env.ERROR_WEBHOOK_URL;
  });

  it("does nothing when ERROR_WEBHOOK_URL is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    log.error("unset-webhook-case");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts error-level logs to the webhook in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example.com/abc";
    log.error("alert-me-please", new Error("kaboom"), { route: "/api/x" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.example.com/abc");
    expect(String(opts.body)).toContain("alert-me-please");
    expect(String(opts.body)).toContain("kaboom");
  });

  it("throttles repeated identical errors", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example.com/abc";
    log.error("repeated-identical-error");
    log.error("repeated-identical-error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never alerts outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example.com/abc";
    log.error("dev-no-alert");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ALERTA TEM DE SOBREVIVER AO FIM DO PEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Em serverless, o contentor é CONGELADO assim que a resposta sai. Um
 * `void fetch(...)` que ainda não tenha ligado morre aí: o `log.error` escreve
 * a linha na consola e o Sentry / o webhook do Slack NUNCA recebem nada. É o
 * mesmo defeito que já se corrigiu no `/api/backup` e no `/api/orcamento`, e
 * é pior aqui: o que se perde é precisamente o aviso de que alguma coisa
 * correu mal — a falha apaga o seu próprio alarme.
 *
 * A cura ali foi o `after()` do `next/server`. Aqui não pode ser: o `logger` é
 * importado por componentes de CLIENTE (o sino das notificações, o
 * `error.tsx`, o `global-error.tsx`) e um `import` estático de `next/server`
 * arrastava código de servidor para o pacote do browser.
 *
 * Usa-se o mesmo mecanismo por baixo do `after`, que a documentação do Next
 * descreve como o contrato para quem implementa plataformas
 * (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`,
 * secção «supporting `after` for serverless platforms»):
 *
 *   globalThis[Symbol.for("@next/request-context")].get().waitUntil
 *
 * Um símbolo global não é um `import`: no browser não existe e o registo
 * degrada exactamente para o que fazia antes.
 */
describe("log.error — o alerta é prendido ao pedido (waitUntil)", () => {
  const SIMBOLO = Symbol.for("@next/request-context");
  let fetchMock: ReturnType<typeof vi.fn>;
  let waitUntil: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal("fetch", fetchMock);
    waitUntil = vi.fn();
    (globalThis as Record<symbol, unknown>)[SIMBOLO] = { get: () => ({ waitUntil }) };
    vi.stubEnv("NODE_ENV", "production");
  });
  afterEach(() => {
    delete (globalThis as Record<symbol, unknown>)[SIMBOLO];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    delete process.env.ERROR_WEBHOOK_URL;
    delete process.env.SENTRY_DSN;
  });

  it("entrega o POST do webhook ao waitUntil do pedido", () => {
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example.com/abc";
    log.error("webhook-waituntil-case");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise);
  });

  it("entrega também o envelope do Sentry", () => {
    process.env.SENTRY_DSN = "https://chave@sentry.example.com/42";
    log.error("sentry-waituntil-case");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("a promessa entregue nunca rejeita — um webhook em baixo não pode derrubar a invocação", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("ECONNREFUSED")));
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example.com/abc";
    log.error("webhook-em-baixo");
    await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  });

  it("sem contexto de pedido (browser, script, teste) continua a disparar e não rebenta", () => {
    delete (globalThis as Record<symbol, unknown>)[SIMBOLO];
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example.com/abc";
    expect(() => log.error("sem-contexto-case")).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * O canal de alertas recebe texto que pode ter vindo de fora (a mensagem de um
 * erro, o contexto de um pedido). Uma menção lá dentro não pode virar um aviso
 * a toda a gente no Slack/Discord, e os erros do browser de um visitante não
 * podem abrir uma chave de travão por cada mensagem diferente.
 */
describe("log — o alerta não deixa texto de fora mandar no canal", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NODE_ENV", "production");
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example.com/abc";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    delete process.env.ERROR_WEBHOOK_URL;
  });

  it("neutraliza <, > e @ e desliga as menções", () => {
    log.error("mencoes <!channel> @everyone <@123>", new Error("<@here>"), { a: "@x" });
    const corpo = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    for (const campo of [corpo.text, corpo.content]) {
      expect(campo).not.toMatch(/[<>@]/);
      expect(campo).toContain("everyone");
    }
    expect(corpo.allowed_mentions).toEqual({ parse: [] });
  });

  it("os erros do browser do site partilham uma só chave de travão", () => {
    log.error("site no browser: primeira-mensagem-xyz");
    log.error("site no browser: segunda-mensagem-xyz");
    log.error("site no browser: terceira-mensagem-xyz");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("um `null` no lugar do erro não vai como «null» para o canal nem para o Sentry", () => {
    process.env.SENTRY_DSN = "https://chave@sentry.example.com/123";
    try {
      log.error("erro-sem-objecto-xyz", null, { onde: "/x" });
      const corpos = fetchMock.mock.calls.map((c) => String((c as [string, RequestInit])[1].body));
      const webhook = corpos.find((b) => b.includes('"allowed_mentions"'))!;
      expect(JSON.parse(webhook).text).not.toMatch(/\bnull\b/);
      const sentry = corpos.find((b) => b.includes("erro-sem-objecto-xyz") && b !== webhook)!;
      const evento = JSON.parse(sentry.split("\n")[2]);
      // Sem `exception`: senão todos estes erros juntavam-se num só «Error: null».
      expect(evento.exception).toBeUndefined();
    } finally {
      delete process.env.SENTRY_DSN;
    }
  });
});
