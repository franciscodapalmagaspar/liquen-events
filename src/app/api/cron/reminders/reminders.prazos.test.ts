import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ROTINA DA MANHÃ RESPONDE SEMPRE ANTES DO TECTO (registos de 10–17/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Task timed out after 60 seconds», três vezes em `/api/cron/reminders`.
 * Nenhum passo tinha prazo próprio: uma leitura pendurada, um push que não
 * responde ou a travessia das derivadas levavam a função inteira até ser
 * morta. Estes testes prendem o orçamento de cada passo e a retoma das
 * derivadas de uma noite para a seguinte.
 */
const H = vi.hoisted(() => ({
  lerPedidos: null as null | (() => Promise<unknown[]>),
  push: null as null | (() => Promise<unknown>),
  lote: null as null | ((opcoes: unknown) => Promise<unknown>),
  chamadasAoLote: [] as Array<{ tectoMs?: number; retoma?: unknown }>,
  estado: new Map<string, unknown>(),
  gravado: [] as Array<{ key: string; valor: unknown }>,
}));

const RESULTADO = {
  geradas: 0,
  falhas: [] as string[],
  fotografiasFeitas: 0,
  retoma: null as unknown,
  restantes: 0,
  restantesEssenciais: 0,
  fotografiasRestantes: 0,
  papel: null,
};

vi.mock("@/lib/derivadas", () => ({
  gerarLoteDeDerivadas: vi.fn(
    async (_papel: unknown, opcoes: { tectoMs?: number; retoma?: unknown }) => {
      H.chamadasAoLote.push(opcoes);
      return H.lote ? H.lote(opcoes) : RESULTADO;
    },
  ),
}));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({}) }));
vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async (key: string) => H.estado.get(key) ?? null),
  setState: vi.fn(async (key: string, valor: unknown) => {
    H.gravado.push({ key, valor });
    H.estado.set(key, valor);
    return { gravado: true, duradouro: true, onde: "servidor" };
  }),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => false }));
vi.mock("@/lib/quotes-store", () => ({
  listQuotes: vi.fn(() =>
    H.lerPedidos
      ? H.lerPedidos()
      : Promise.resolve([
          { id: "q1", status: "pendente", name: "Ana", submittedAt: "2020-01-01T00:00:00Z" },
        ]),
  ),
}));
vi.mock("@/lib/calendar-store", () => ({ listCalendarEvents: vi.fn(async () => []) }));
vi.mock("@/lib/proposals-store", () => ({ listAllProposals: vi.fn(async () => []) }));
vi.mock("@/lib/push", () => ({
  sendPushToAll: vi.fn(() => (H.push ? H.push() : Promise.resolve({ sent: 1, failed: 0 }))),
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { GET } from "./route";

const SECRET = "cron-top-secret";
const req = () =>
  new Request("https://liquen.test/api/cron/reminders", {
    headers: { authorization: `Bearer ${SECRET}` },
  }) as unknown as NextRequest;

const nunca = () => new Promise<never>(() => undefined);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("CRON_SECRET", SECRET);
  H.lerPedidos = null;
  H.push = null;
  H.lote = null;
  H.chamadasAoLote = [];
  H.estado = new Map();
  H.gravado = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** Corre o GET com o relógio falso a andar, e diz quanto tempo «passou». */
async function correr() {
  const t0 = Date.now();
  let res: Response | undefined;
  void GET(req()).then((r) => (res = r));
  for (let i = 0; i < 120 && !res; i += 1) await vi.advanceTimersByTimeAsync(1_000);
  if (!res) throw new Error("a rotina não respondeu em 120 s");
  return { res, ms: Date.now() - t0 };
}

describe("cada passo da rotina da manhã tem prazo", () => {
  it("uma leitura pendurada não leva a função atrás: o resumo sai marcado incompleto", async () => {
    H.lerPedidos = nunca;
    const { res, ms } = await correr();
    expect(ms).toBeLessThan(50_000);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ incompleto: ["pedidos"] });
  });

  it("um push pendurado também não, e a resposta diz que não chegou", async () => {
    H.push = nunca;
    const { res, ms } = await correr();
    expect(ms).toBeLessThan(50_000);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ sent: 0, subscricoes: "não foi possível ler" });
  });

  it("as derivadas penduradas não passam dos 50 s, e o resumo sai igual", async () => {
    H.lote = nunca;
    const { res, ms } = await correr();
    expect(ms).toBeLessThanOrEqual(50_000);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 1 });
  });

  it("tudo pendurado ao mesmo tempo: responde na mesma antes dos 50 s", async () => {
    H.lerPedidos = nunca;
    H.push = nunca;
    H.lote = nunca;
    const { ms } = await correr();
    expect(ms).toBeLessThanOrEqual(50_000);
  });
});

describe("o que não coube fica para a noite seguinte", () => {
  it("guarda onde parou, e a noite seguinte começa aí", async () => {
    const retoma = { papel: "essencial", origem: "theme-assets", pasta: "tema-12", caminho: "" };
    H.lote = async () => ({ ...RESULTADO, retoma });
    await correr();
    expect(H.chamadasAoLote[0]!.retoma).toBeNull();
    expect(H.gravado.at(-1)?.valor).toEqual(retoma);

    H.lote = null;
    await correr();
    expect(H.chamadasAoLote[1]!.retoma).toEqual(retoma);
    // E acabada a travessia, a retoma limpa-se: a noite seguinte recomeça.
    expect(H.gravado.at(-1)?.valor).toBeNull();
  });
});
