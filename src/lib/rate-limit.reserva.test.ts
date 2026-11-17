import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { reservarLugar, devolverLugar } from "./rate-limit";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM LUGAR RESERVADO SÓ VOLTA PARA A JANELA E PARA O SÍTIO DE ONDE SAIU
 * (terceira revisão de 16/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O tecto de emails da recuperação reserva um lugar antes de saber se o email
 * vai sair, e devolve-o quando não sai. Três coisas têm de ser verdade:
 *
 *  1. a devolução nunca cria uma chave (sem prazo, no Redis) nem tira o lugar
 *     a uma janela NOVA que entretanto abriu;
 *  2. a devolução vai só ao sítio onde a reserva ficou (Redis ou memória);
 *  3. os dois motores contam o mesmo: um pedido recusado não gasta nada.
 *
 * O ponto 1 só se vê com um Redis a sério, com prazos verdadeiros: os scripts
 * correm aqui num `redis-server` lançado pelo teste (saltado se não houver).
 */

const janelaCurta = 400;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("na memória", () => {
  it("um recusado não gasta; devolver um recusado não abre lugar", async () => {
    const k = `mem-${Math.random()}`;
    const reservas = [];
    for (let i = 0; i < 4; i++) reservas.push(await reservarLugar(k, 3, 60_000));
    expect(reservas.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(reservas.every((r) => r.onde === "memoria")).toBe(true);
    await devolverLugar(reservas[3]);
    expect((await reservarLugar(k, 3, 60_000)).ok).toBe(false);
    await devolverLugar(reservas[0]);
    expect((await reservarLugar(k, 3, 60_000)).ok).toBe(true);
  });

  it("a devolução de uma janela que já acabou não tira o lugar à janela nova", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T10:00:00Z"));
    const k = `mem-janela-${Math.random()}`;
    const velha = await reservarLugar(k, 1, 60_000);
    vi.setSystemTime(new Date("2026-11-17T10:02:00Z"));
    expect((await reservarLugar(k, 1, 60_000)).ok).toBe(true);
    await devolverLugar(velha);
    // A janela nova continua cheia: a devolução era de outra.
    expect((await reservarLugar(k, 1, 60_000)).ok).toBe(false);
  });
});

describe("a devolução vai só ao sítio onde a reserva ficou", () => {
  it("reservado na memória (o Redis falhou): a devolução não toca no Redis", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://x.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "tok");
    const fetchMock = vi.fn(async () => {
      throw new Error("rede em baixo");
    });
    vi.stubGlobal("fetch", fetchMock);
    const k = `fallback-${Math.random()}`;
    const r = await reservarLugar(k, 1, 60_000, { global: true });
    expect(r.onde).toBe("memoria");
    fetchMock.mockClear();
    await devolverLugar(r);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await reservarLugar(k, 1, 60_000)).ok).toBe(true);
  });

  it("reservado no Redis: a devolução vai ao Redis e não mexe na memória", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://x.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "tok");
    const corpos: string[] = [];
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => {
      corpos.push(String(init.body));
      return { ok: true, json: async () => [{ result: [1, 60_000, "j-1"] }] };
    });
    vi.stubGlobal("fetch", fetchMock);
    const k = `redis-${Math.random()}`;
    const r = await reservarLugar(k, 1, 60_000, { global: true });
    expect(r).toMatchObject({ ok: true, onde: "redis", janela: "j-1" });
    await devolverLugar(r);
    expect(corpos).toHaveLength(2);
    expect(corpos[1]).toContain('"EVAL"');
    expect(corpos[1]).toContain('"j-1"');
  });
});

// ── Com um Redis a sério ───────────────────────────────────────────────────
const temRedis = existsSync("/usr/bin/redis-server") || existsSync("/usr/local/bin/redis-server");
const porta = String(20000 + Math.floor(Math.random() * 20000));
let servidor: ChildProcess | null = null;

/** Um `fetch` que fala com o Redis local como se fosse a REST do Upstash. */
function fetchParaORedisLocal() {
  return vi.fn(async (_u: string, init: RequestInit) => {
    const comandos = JSON.parse(String(init.body)) as string[][];
    const resultados = comandos.map((c) => {
      const saida = execFileSync("redis-cli", ["-p", porta, "--json", ...c], {
        encoding: "utf8",
      }).trim();
      return { result: JSON.parse(saida) };
    });
    return { ok: true, json: async () => resultados };
  });
}
const redis = (...args: string[]) =>
  JSON.parse(execFileSync("redis-cli", ["-p", porta, "--json", ...args], { encoding: "utf8" }));

describe.skipIf(!temRedis)("com um Redis verdadeiro (prazos verdadeiros)", () => {
  beforeAll(async () => {
    servidor = spawn("redis-server", ["--port", porta, "--save", "", "--appendonly", "no"], {
      stdio: "ignore",
    });
    for (let i = 0; i < 50; i++) {
      try {
        if (redis("PING") === "PONG") return;
      } catch {
        /* ainda a arrancar */
      }
      await esperar(100);
    }
    throw new Error("o redis-server não arrancou");
  });
  afterAll(() => {
    servidor?.kill();
  });

  const ligar = () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.local");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "tok");
    vi.stubGlobal("fetch", fetchParaORedisLocal());
  };

  it("devolução normal: o lugar volta, e a chave mantém o prazo", async () => {
    ligar();
    const k = `real-normal-${Math.random()}`;
    const a = await reservarLugar(k, 2, 60_000, { global: true });
    await reservarLugar(k, 2, 60_000, { global: true });
    expect((await reservarLugar(k, 2, 60_000, { global: true })).ok).toBe(false);
    // Um recusado não incrementou: o contador está no tecto, não acima.
    expect(redis("GET", k)).toBe("2");
    await devolverLugar(a);
    expect(redis("GET", k)).toBe("1");
    expect(redis("PTTL", k)).toBeGreaterThan(0);
    expect((await reservarLugar(k, 2, 60_000, { global: true })).ok).toBe(true);
  });

  it("chave já expirada: a devolução não a recria (nem a -1, nem sem prazo)", async () => {
    ligar();
    const k = `real-expirada-${Math.random()}`;
    const r = await reservarLugar(k, 3, janelaCurta, { global: true });
    await esperar(janelaCurta + 200);
    await devolverLugar(r);
    expect(redis("EXISTS", k)).toBe(0);
  });

  it("janela nova aberta antes da devolução: o lugar dela não se perde", async () => {
    ligar();
    const k = `real-nova-${Math.random()}`;
    const velha = await reservarLugar(k, 1, janelaCurta, { global: true });
    await esperar(janelaCurta + 200);
    expect((await reservarLugar(k, 1, 60_000, { global: true })).ok).toBe(true);
    await devolverLugar(velha);
    expect(redis("GET", k)).toBe("1");
    expect((await reservarLugar(k, 1, 60_000, { global: true })).ok).toBe(false);
  });

  it("nunca desce abaixo de zero", async () => {
    ligar();
    const k = `real-zero-${Math.random()}`;
    const r = await reservarLugar(k, 3, 60_000, { global: true });
    await devolverLugar(r);
    await devolverLugar(r);
    await devolverLugar(r);
    expect(redis("GET", k)).toBe("0");
  });
});
