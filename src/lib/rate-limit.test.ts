import { describe, it, expect, vi, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { clientIp, limiteEsgotado, rateLimit, sweep } from "./rate-limit";

function reqWith(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

describe("clientIp", () => {
  it("takes the first IP from x-forwarded-for and trims it", () => {
    const req = reqWith({ "x-forwarded-for": " 203.0.113.7 , 70.41.3.18 " });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when there is no forwarded-for", () => {
    expect(clientIp(reqWith({ "x-real-ip": "198.51.100.5" }))).toBe("198.51.100.5");
  });

  it("returns 'unknown' when no IP headers are present", () => {
    expect(clientIp(reqWith({}))).toBe("unknown");
  });
});

describe("rateLimit — in-memory (default)", () => {
  let seq = 0;
  // Unique key per call so the module-level bucket map can't leak across tests.
  const uniqueKey = () => `rl-${Date.now()}-${seq++}`;

  it("allows calls up to the limit, then throttles with a positive retryAfter", async () => {
    const k = uniqueKey();
    expect((await rateLimit(k, 3)).ok).toBe(true);
    expect((await rateLimit(k, 3)).ok).toBe(true);
    expect((await rateLimit(k, 3)).ok).toBe(true);
    const blocked = await rateLimit(k, 3);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("treats each key independently", async () => {
    const a = uniqueKey();
    const b = uniqueKey();
    expect((await rateLimit(a, 1)).ok).toBe(true);
    expect((await rateLimit(a, 1)).ok).toBe(false);
    expect((await rateLimit(b, 1)).ok).toBe(true);
  });

  it("resets the window once it has elapsed", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const k = "reset-key";
      expect((await rateLimit(k, 1, 1000)).ok).toBe(true);
      expect((await rateLimit(k, 1, 1000)).ok).toBe(false);
      vi.setSystemTime(1001); // past resetAt (0 + 1000)
      expect((await rateLimit(k, 1, 1000)).ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports retryAfter as the ceiling of the remaining window in seconds", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const k = "retry-key";
      await rateLimit(k, 1, 5000);
      const blocked = await rateLimit(k, 1, 5000);
      expect(blocked.ok).toBe(false);
      expect(blocked.retryAfter).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("rateLimit — Upstash (distributed)", () => {
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.unstubAllGlobals();
  });

  it("uses Redis INCR and blocks once the count exceeds the limit", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://x.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    let n = 0;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [{ result: ++n }, { result: 1 }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    expect((await rateLimit("k", 2)).ok).toBe(true); // count 1
    expect((await rateLimit("k", 2)).ok).toBe(true); // count 2
    const blocked = await rateLimit("k", 2); // count 3 → over the limit
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails open to the in-memory limiter when Redis is unreachable", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://x.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    // Must not throw; the in-memory fallback allows the first call.
    const r = await rateLimit("fallback-key", 1);
    expect(r.ok).toBe(true);
  });
});

describe("sweep", () => {
  it("is safe to call and never throws", () => {
    expect(() => sweep()).not.toThrow();
  });
});

describe("limiteEsgotado — só pergunta, não gasta (10/11)", () => {
  it("diz que sim só depois de o limite ter sido gasto, e não conta nada", async () => {
    const chave = `teste-espreitar-${Math.random()}`;
    expect((await limiteEsgotado(chave, 2)).ok).toBe(true);
    await rateLimit(chave, 2, 60_000);
    expect((await limiteEsgotado(chave, 2)).ok).toBe(true);
    await rateLimit(chave, 2, 60_000);
    const r = await limiteEsgotado(chave, 2);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
    // Perguntar muitas vezes não mexe no contador.
    for (let i = 0; i < 5; i++) await limiteEsgotado(chave, 3);
    expect((await limiteEsgotado(chave, 3)).ok).toBe(true);
  });
});
