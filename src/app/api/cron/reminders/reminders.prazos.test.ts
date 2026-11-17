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
type OpcoesDoLote = {
  tectoMs?: number;
  retoma?: unknown;
  sinal?: AbortSignal;
  posicao?: { atual: unknown; passos?: number; listando?: unknown };
};
const H = vi.hoisted(() => ({
  lerPedidos: null as null | (() => Promise<unknown[]>),
  push: null as null | (() => Promise<unknown>),
  lote: null as null | ((opcoes: OpcoesDoLote) => Promise<unknown>),
  chamadasAoLote: [] as OpcoesDoLote[],
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

vi.mock("@/lib/derivadas", async (importOriginal) => ({
  // A regra verdadeira: a rotina e o lote têm de concordar sobre que retoma se segue.
  retomaValida: (await importOriginal<typeof import("@/lib/derivadas")>()).retomaValida,
  gerarLoteDeDerivadas: vi.fn(async (_papel: unknown, opcoes: OpcoesDoLote) => {
    H.chamadasAoLote.push(opcoes);
    return H.lote ? H.lote(opcoes) : RESULTADO;
  }),
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

/**
 * Revisão de 17/11, n.º 2: o `comPrazo` deixava de esperar pelo lote, mas o
 * lote continuava em fundo depois da resposta, e a retoma não avançava — a
 * noite seguinte voltava ao mesmo sítio, e pendurava no mesmo sítio.
 */
describe("o prazo das derivadas PÁRA o lote, e a retoma avança", () => {
  const P = { papel: "essencial", origem: "theme-assets", pasta: "tema-07", caminho: "" };

  it("no fim do prazo o lote recebe o sinal, pára, e a retoma que ele devolve fica guardada", async () => {
    const R = { ...P, pasta: "tema-09" };
    H.lote = (opcoes) =>
      new Promise((resolver) =>
        opcoes.sinal!.addEventListener("abort", () => resolver({ ...RESULTADO, retoma: R })),
      );
    const { ms } = await correr();
    expect(ms).toBeLessThanOrEqual(50_000);
    expect(H.chamadasAoLote[0]!.sinal!.aborted).toBe(true);
    expect(H.gravado.at(-1)?.valor).toEqual(R);
  });

  it("uma pasta que pendura (nem o sinal a pára) fica registada; à segunda, a noite seguinte salta-a", async () => {
    H.lote = (opcoes) => {
      opcoes.posicao!.atual = P;
      return nunca();
    };
    const primeira = await correr();
    expect(primeira.ms).toBeLessThanOrEqual(50_000);
    expect(H.gravado.at(-1)?.valor).toEqual({ ...P, pendurada: true });

    await correr();
    expect(H.chamadasAoLote[1]!.retoma).toEqual({ ...P, pendurada: true });
    expect(H.gravado.at(-1)?.valor).toEqual({ ...P, saltar: true });
  });

  it("uma AVARIA do lote não se confunde com uma pasta pendurada", async () => {
    H.lote = async (opcoes) => {
      opcoes.posicao!.atual = P;
      throw new Error("sem rede");
    };
    await correr();
    expect(H.gravado.filter((g) => g.key.includes("retoma"))).toHaveLength(0);
  });
});

/**
 * 2.ª revisão de 17/11, n.os 2 e 3: só se marca `pendurada` o que não andou
 * desde o sinal; as marcas de antes não se perdem; e uma listagem de pastas
 * pendurada salta a família na noite seguinte.
 */
describe("pendurado é só o que deixou de andar", () => {
  const P = { papel: "essencial", origem: "theme-assets", pasta: "tema-07", caminho: "f3.jpg" };

  it("um bloco lento mas a andar depois do sinal não fica pendurado", async () => {
    H.lote = (opcoes) => {
      const posicao = opcoes.posicao!;
      posicao.atual = P;
      // Uma fotografia acabada por segundo, mesmo depois do sinal.
      setInterval(() => (posicao.passos = (posicao.passos ?? 0) + 1), 1_000);
      return nunca();
    };
    await correr();
    expect(H.gravado.at(-1)?.valor).toEqual(P);
    vi.clearAllTimers();
  });

  it("pendurado a caminho de uma pasta a saltar, a marca fica", async () => {
    const S = { ...P, caminho: "", saltar: true };
    H.estado.set("cron-reminders:retoma-das-derivadas", S);
    // O lote não dá passo nenhum: a posição é a retoma que recebeu.
    H.lote = () => nunca();
    await correr();
    expect(H.chamadasAoLote[0]!.retoma).toEqual(S);
    expect(H.gravado.at(-1)?.valor).toEqual(S);
  });

  it("pendurado na listagem das pastas: regista-o, e a noite seguinte salta a família", async () => {
    const { log } = await import("@/lib/logger");
    vi.mocked(log.warn).mockClear();
    H.lote = (opcoes) => {
      opcoes.posicao!.atual = P;
      opcoes.posicao!.listando = { papel: "essencial", origem: "proposal-assets" };
      return nunca();
    };
    await correr();
    const F = {
      papel: "essencial",
      origem: "proposal-assets",
      pasta: "",
      caminho: "",
      saltarFamilia: true,
    };
    expect(H.gravado.at(-1)?.valor).toEqual(F);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("listagem"),
      expect.objectContaining({ familia: "essencial/proposal-assets" }),
    );
    H.lote = null;
    await correr();
    expect(H.chamadasAoLote[1]!.retoma).toEqual(F);
  });

  it('uma retoma guardada com `pasta: ""` (de antes) não se segue', async () => {
    H.estado.set("cron-reminders:retoma-das-derivadas", {
      papel: "essencial",
      origem: "theme-assets",
      pasta: "",
      caminho: "",
    });
    await correr();
    expect(H.chamadasAoLote[0]!.retoma).toBeNull();
  });

  it("a andar, a `pendurada` da noite anterior na mesma pasta fica (revisão independente)", async () => {
    const A = { ...P, pendurada: true };
    H.estado.set("cron-reminders:retoma-das-derivadas", A);
    H.lote = (opcoes) => {
      const posicao = opcoes.posicao!;
      posicao.atual = P;
      setInterval(() => (posicao.passos = (posicao.passos ?? 0) + 1), 1_000);
      return nunca();
    };
    await correr();
    expect(H.gravado.at(-1)?.valor).toEqual(A);
    vi.clearAllTimers();
  });
});
