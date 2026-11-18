import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A limpeza do app_state na tarefa da noite (P3): as travas — primeiro a
 * cópia, a primeira noite a seco, uma leitura falhada não apaga nada, e cada
 * linha sai só se ainda estiver como se leu.
 */

const st = vi.hoisted(() => ({
  espacos: {} as Record<string, { key: string; value: unknown; versao: string }[]>,
  incompletos: new Set<string>(),
  reciclagem: [] as { origemId: string; retrato: Record<string, unknown> }[] | Error,
  registo: { valor: null as unknown, versao: null as string | null } as
    | { valor: unknown; versao: string | null }
    | Error,
  gravados: [] as unknown[],
  lapides: [] as string[][],
  condicionais: [] as [string, string][],
  respostaCondicional: "apagado" as "apagado" | "mudou" | "falhou",
}));

vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/app-state", () => ({
  listStateByPrefix: async (prefixo: string) => ({
    entradas: st.espacos[prefixo] ?? [],
    completa: !st.incompletos.has(prefixo),
  }),
  lerEstadoComVersao: async () => {
    if (st.registo instanceof Error) throw st.registo;
    return st.registo;
  },
  gravarEstadoSeNaoMudou: async (_k: string, valor: unknown) => {
    st.gravados.push(valor);
    return "gravado";
  },
}));
vi.mock("@/lib/app-state/apagar", () => ({
  apagarLapides: async (chaves: string[]) => {
    st.lapides.push(chaves);
    return { sairam: chaves, falhou: false };
  },
  apagarEstadoSeNaoMudou: async (chave: string, versao: string) => {
    st.condicionais.push([chave, versao]);
    return st.respostaCondicional;
  },
}));
vi.mock("@/lib/reciclagem-store", () => ({
  listarReciclagem: async () => {
    if (st.reciclagem instanceof Error) throw st.reciclagem;
    return st.reciclagem;
  },
}));

import { aplicarLimpezaDoAppState, paraACopia, planearNaCopia } from "./limpar-app-state";

const P1 = "11111111-1111-4111-8111-111111111111";
const P_APAGADA = "22222222-2222-4222-8222-222222222222";
const ONTEM = "2026-11-17T03:00:00Z";
const AGORA = new Date("2026-11-18T03:00:00Z");
const copia = { incomplete: [], quotes: [{ id: "q1" }], proposals: [{ id: P1 }] };

beforeEach(() => {
  st.espacos = {
    "proposal-draft:": [
      { key: "proposal-draft:q1", value: null, versao: ONTEM },
      { key: "proposal-draft:q-apagado", value: { doc: {} }, versao: ONTEM },
    ],
    "ligacao-de-proposta:": [{ key: `ligacao-de-proposta:${P_APAGADA}`, value: {}, versao: ONTEM }],
  };
  st.incompletos = new Set();
  st.reciclagem = [];
  st.registo = { valor: null, versao: null };
  st.gravados = [];
  st.lapides = [];
  st.condicionais = [];
  st.respostaCondicional = "apagado";
});

describe("o plano da noite", () => {
  it("decide a partir da cópia, e o que sai vai para a cópia com o valor", async () => {
    const plano = await planearNaCopia(copia, AGORA);
    expect(plano?.saem.map((s) => s.motivo)).toEqual([
      "lapide",
      "ligacao-sem-proposta",
      "rascunho-sem-pedido",
    ]);
    expect(paraACopia(plano!)).toContainEqual({
      key: "proposal-draft:q-apagado",
      motivo: "rascunho-sem-pedido",
      value: { doc: {} },
    });
  });

  it("um espaço que não se leu inteiro: não sai nada", async () => {
    st.incompletos.add("ligacao-proposta:");
    expect(await planearNaCopia(copia, AGORA)).toBeNull();
  });

  it("a Reciclagem que não se lê: não sai nada", async () => {
    st.reciclagem = new Error("em baixo");
    expect(await planearNaCopia(copia, AGORA)).toBeNull();
  });

  it("uma cópia incompleta, ou sem pedidos ou propostas: não sai nada", async () => {
    expect(await planearNaCopia({ ...copia, incomplete: ["quotes"] }, AGORA)).toBeNull();
    expect(await planearNaCopia({ ...copia, quotes: [] }, AGORA)).toBeNull();
    expect(await planearNaCopia({ ...copia, proposals: [{ semId: 1 }] }, AGORA)).toBeNull();
    expect(
      await planearNaCopia({ quotes: copia.quotes, proposals: copia.proposals }, AGORA),
    ).toBeNull();
  });

  it("o que está na Reciclagem (o pedido E o que saiu com ele) conta como existente", async () => {
    st.reciclagem = [{ origemId: "q-apagado", retrato: { propostas: [{ id: P_APAGADA }] } }];
    const plano = await planearNaCopia(copia, AGORA);
    expect(plano?.saem.map((s) => s.key)).toEqual(["proposal-draft:q1"]);
  });
});

describe("aplicar o plano", () => {
  it("a primeira noite é a seco: conta, regista, e não apaga nada", async () => {
    const plano = (await planearNaCopia(copia, AGORA))!;
    const r = await aplicarLimpezaDoAppState(plano, "2026-11-18");
    expect(r).toMatchObject({ aSeco: true, apagadas: 0 });
    expect(st.lapides).toEqual([]);
    expect(st.condicionais).toEqual([]);
    expect(st.gravados).toEqual([
      {
        primeiraNoite: "2026-11-18",
        ultima: expect.objectContaining({
          aSeco: true,
          porMotivo: { lapide: 1, "ligacao-sem-proposta": 1, "rascunho-sem-pedido": 1 },
        }),
      },
    ]);
  });

  it("a mesma noite, a correr outra vez, continua a seco", async () => {
    st.registo = { valor: { primeiraNoite: "2026-11-18" }, versao: ONTEM };
    const r = await aplicarLimpezaDoAppState((await planearNaCopia(copia, AGORA))!, "2026-11-18");
    expect(r?.aSeco).toBe(true);
    expect(st.lapides).toEqual([]);
  });

  it("da segunda noite em diante apaga: as lápides num lote, o resto com a versão lida", async () => {
    st.registo = { valor: { primeiraNoite: "2026-11-17" }, versao: ONTEM };
    const r = await aplicarLimpezaDoAppState((await planearNaCopia(copia, AGORA))!, "2026-11-18");
    expect(st.lapides).toEqual([["proposal-draft:q1"]]);
    expect(st.condicionais).toEqual([
      [`ligacao-de-proposta:${P_APAGADA}`, ONTEM],
      ["proposal-draft:q-apagado", ONTEM],
    ]);
    expect(r).toMatchObject({ aSeco: false, apagadas: 3, mudaram: 0, falharam: 0 });
  });

  it("uma linha que mudou entretanto fica, e conta-se", async () => {
    st.registo = { valor: { primeiraNoite: "2026-11-17" }, versao: ONTEM };
    st.respostaCondicional = "mudou";
    const r = await aplicarLimpezaDoAppState((await planearNaCopia(copia, AGORA))!, "2026-11-18");
    expect(r).toMatchObject({ apagadas: 1, mudaram: 2 });
  });

  it("o registo que não se lê: não se apaga nada", async () => {
    st.registo = new Error("em baixo");
    const r = await aplicarLimpezaDoAppState((await planearNaCopia(copia, AGORA))!, "2026-11-18");
    expect(r).toBeNull();
    expect(st.lapides).toEqual([]);
    expect(st.condicionais).toEqual([]);
  });
});
