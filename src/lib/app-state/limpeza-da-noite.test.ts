import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LinhaVarrida } from "@/lib/app-state/varrer";

/**
 * A limpeza do app_state na tarefa da noite (P3): as travas — primeiro a
 * cópia, a primeira noite a seco, uma leitura falhada não apaga nada, os
 * tectos, e cada linha sai só se ainda estiver como se leu.
 */

const st = vi.hoisted(() => ({
  espacos: {} as Record<string, LinhaVarrida[]>,
  incompletos: new Set<string>(),
  transbordados: new Set<string>(),
  reciclagem: [] as { origemId: string; retrato: Record<string, unknown> }[] | Error,
  valores: new Map<string, unknown>(),
  registo: { valor: null as unknown, versao: null as string | null } as
    | { valor: unknown; versao: string | null }
    | Error,
  gravados: [] as unknown[],
  lapides: [] as string[][],
  condicionais: [] as [string, string][],
  respostaCondicional: "apagado" as "apagado" | "mudou" | "falhou",
  varreduraPendurada: false,
  agora: null as Record<string, unknown[]> | null,
}));

vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => (st.agora ? {} : null) }));
vi.mock("@/lib/ler-todas-as-linhas", () => ({
  lerTodasAsLinhas: async (_sb: unknown, tabela: string) =>
    st.agora && tabela in st.agora
      ? { data: st.agora[tabela], error: null }
      : { data: null, error: new Error("falhou") },
}));
vi.mock("@/lib/app-state/varrer", () => ({
  varrerPrefixo: async (prefixo: string) => {
    if (st.varreduraPendurada) await new Promise(() => {});
    if (st.transbordados.has(prefixo)) return { estado: "transbordou" };
    if (st.incompletos.has(prefixo)) return { estado: "falhou" };
    return { estado: "completa", linhas: st.espacos[prefixo] ?? [] };
  },
}));
vi.mock("@/lib/app-state", () => ({
  getStates: async (chaves: string[]) =>
    new Map(chaves.filter((k) => st.valores.has(k)).map((k) => [k, st.valores.get(k)])),
  lerEstadoComVersao: async () => {
    if (st.registo instanceof Error) throw st.registo;
    return st.registo;
  },
  gravarEstadoSeNaoMudou: async (_k: string, valor: unknown) => {
    st.gravados.push(valor);
    return "gravado";
  },
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

import { ESPACOS, espacoDaChave } from "@/lib/app-state/espacos";
import { registoDaLimpeza } from "./formas-da-limpeza";
import {
  CHAVE_DO_REGISTO,
  aplicarLimpezaDoAppState,
  planearNaCopia,
  TECTO_DE_BYTES_NA_COPIA,
  TEMPO_DO_PLANO_MS,
} from "./limpeza-da-noite";

const P1 = "11111111-1111-4111-8111-111111111111";
const P_APAGADA = "22222222-2222-4222-8222-222222222222";
const ANTIGA = "2026-11-10T03:00:00Z";
const AGORA = new Date("2026-11-18T03:00:00Z");
const copia = {
  incomplete: [],
  quotes: [{ id: "q1" }],
  proposals: [{ id: P1 }],
};
const l = (key: string, campos = {}, nula = false): LinhaVarrida => ({
  key,
  versao: ANTIGA,
  escritaEm: ANTIGA,
  nula,
  campos,
});

beforeEach(() => {
  st.espacos = {
    "proposal-draft:": [l("proposal-draft:q1", {}, true), l("proposal-draft:q-apagado")],
    "ligacao-de-proposta:": [l(`ligacao-de-proposta:${P_APAGADA}`, { codigo: "abc" })],
  };
  st.incompletos = new Set();
  st.transbordados = new Set();
  st.reciclagem = [];
  st.valores = new Map<string, unknown>([
    [`ligacao-de-proposta:${P_APAGADA}`, { codigo: "abc" }],
    ["proposal-draft:q-apagado", { doc: { cru: true } }],
  ]);
  st.registo = { valor: null, versao: null };
  st.gravados = [];
  st.lapides = [];
  st.condicionais = [];
  st.respostaCondicional = "apagado";
  st.varreduraPendurada = false;
  st.agora = null;
});

/** Um registo válido de uma noite anterior, cuja primeira noite foi `primeiraNoite`. */
const registoDe = (primeiraNoite: string) => ({
  valor: {
    primeiraNoite,
    ultima: {
      dia: primeiraNoite,
      aSeco: true,
      planeadasPorMotivo: { lapide: 1 },
      apagadas: 0,
      mudaram: 0,
      falharam: 0,
      ficam: 0,
    },
  },
  versao: ANTIGA,
});

/** Um prazo que não chega durante o teste. */
const LONGE = Date.now() + 3_600_000;

const planear = async () => {
  const r = await planearNaCopia(copia, AGORA);
  if (!r) throw new Error("o plano devia existir");
  return r;
};

describe("o plano da noite", () => {
  it("decide a partir da cópia; o que sai vai nela com o valor CRU", async () => {
    const { plano, naCopia } = await planear();
    expect(plano.saem.map((s) => s.motivo)).toEqual([
      "lapide",
      "ligacao-sem-proposta",
      "rascunho-sem-pedido",
    ]);
    expect(naCopia).toEqual([
      { key: "proposal-draft:q1", motivo: "lapide", value: null },
      {
        key: `ligacao-de-proposta:${P_APAGADA}`,
        motivo: "ligacao-sem-proposta",
        value: { codigo: "abc" },
      },
      {
        key: "proposal-draft:q-apagado",
        motivo: "rascunho-sem-pedido",
        value: { doc: { cru: true } },
      },
    ]);
  });

  it("uma linha cujo valor não se leu não vai na cópia — e por isso não sai", async () => {
    st.valores = new Map([["proposal-draft:q-apagado", { doc: {} }]]);
    const { plano, naCopia } = await planear();
    expect(plano.saem.map((s) => s.key)).not.toContain(`ligacao-de-proposta:${P_APAGADA}`);
    expect(naCopia.map((c) => c.key)).not.toContain(`ligacao-de-proposta:${P_APAGADA}`);
    expect(plano.ficam).toBe(1);
  });

  it("ao chegar ao tecto de bytes da cópia pára de ler; o resto fica para a noite seguinte", async () => {
    st.valores = new Map<string, unknown>([
      [`ligacao-de-proposta:${P_APAGADA}`, { codigo: "x".repeat(TECTO_DE_BYTES_NA_COPIA) }],
      ["proposal-draft:q-apagado", { doc: {} }],
    ]);
    const { plano } = await planear();
    // Pára no primeiro que não cabe: o resto nem se lê, e fica para amanhã.
    expect(plano.saem.map((s) => s.motivo)).toEqual(["lapide"]);
    expect(plano.ficam).toBe(2);
  });

  it("um espaço que não se leu inteiro: não sai nada", async () => {
    st.incompletos.add("ligacao-proposta:");
    expect(await planearNaCopia(copia, AGORA)).toBeNull();
  });

  it("um espaço que passou do limite fica de fora; os outros limpam-se", async () => {
    st.transbordados.add("ligacao-de-proposta:");
    const { plano } = await planear();
    expect(plano.saem.map((s) => s.key)).toEqual(["proposal-draft:q1", "proposal-draft:q-apagado"]);
  });

  it("as ligações passaram do limite: os inversos ficam também (não se sabe se a ligação vive)", async () => {
    st.espacos["ligacao-proposta:"] = [];
    st.transbordados.add("ligacao-proposta:");
    const { plano } = await planear();
    expect(plano.saem.map((s) => s.key)).not.toContain(`ligacao-de-proposta:${P_APAGADA}`);
    expect(plano.saem.map((s) => s.key)).toEqual(["proposal-draft:q1", "proposal-draft:q-apagado"]);
  });

  it("a Reciclagem que não se lê: não sai nada", async () => {
    st.reciclagem = new Error("em baixo");
    expect(await planearNaCopia(copia, AGORA)).toBeNull();
  });

  it("um plano que não acaba a tempo: não sai nada, e a cópia segue", async () => {
    vi.useFakeTimers();
    try {
      st.varreduraPendurada = true;
      const p = planearNaCopia(copia, AGORA);
      await vi.advanceTimersByTimeAsync(TEMPO_DO_PLANO_MS + 1);
      expect(await p).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uma cópia incompleta, ou sem pedidos ou propostas: não sai nada", async () => {
    expect(await planearNaCopia({ ...copia, incomplete: ["quotes"] }, AGORA)).toBeNull();
    expect(await planearNaCopia({ ...copia, quotes: [] }, AGORA)).toBeNull();
    expect(await planearNaCopia({ ...copia, proposals: [{ semId: 1 }] }, AGORA)).toBeNull();
    expect(
      await planearNaCopia({ quotes: copia.quotes, proposals: copia.proposals }, AGORA),
    ).toBeNull();
  });

  it("o que está na Reciclagem — e as propostas que foram com o pedido — conta como existente", async () => {
    st.reciclagem = [{ origemId: "q-apagado", retrato: { propostas: [{ id: P_APAGADA }] } }];
    const { plano } = await planear();
    expect(plano.saem.map((s) => s.key)).toEqual(["proposal-draft:q1"]);
  });
});

describe("aplicar o plano", () => {
  it("a primeira noite é a seco: conta, regista, e não apaga nada", async () => {
    const r = await aplicarLimpezaDoAppState((await planear()).plano, "2026-11-18", LONGE);
    expect(r).toMatchObject({ aSeco: true, apagadas: 0 });
    expect(st.lapides).toEqual([]);
    expect(st.condicionais).toEqual([]);
    expect(st.gravados).toEqual([
      {
        primeiraNoite: "2026-11-18",
        ultima: expect.objectContaining({
          aSeco: true,
          planeadasPorMotivo: { lapide: 1, "ligacao-sem-proposta": 1, "rascunho-sem-pedido": 1 },
        }),
      },
    ]);
  });

  it("a mesma noite, a correr outra vez, continua a seco", async () => {
    st.registo = registoDe("2026-11-18");
    const r = await aplicarLimpezaDoAppState((await planear()).plano, "2026-11-18", LONGE);
    expect(r?.aSeco).toBe(true);
    expect(st.lapides).toEqual([]);
  });

  it("da segunda noite em diante apaga: as lápides num lote, o resto com a versão lida", async () => {
    st.registo = registoDe("2026-11-17");
    const r = await aplicarLimpezaDoAppState((await planear()).plano, "2026-11-18", LONGE);
    expect(st.lapides).toEqual([["proposal-draft:q1"]]);
    expect(st.condicionais).toEqual([
      [`ligacao-de-proposta:${P_APAGADA}`, ANTIGA],
      ["proposal-draft:q-apagado", ANTIGA],
    ]);
    expect(r).toMatchObject({ aSeco: false, apagadas: 3, mudaram: 0, falharam: 0 });
  });

  it("uma linha que mudou entretanto fica, e conta-se", async () => {
    st.registo = registoDe("2026-11-17");
    st.respostaCondicional = "mudou";
    const r = await aplicarLimpezaDoAppState((await planear()).plano, "2026-11-18", LONGE);
    expect(r).toMatchObject({ apagadas: 1, mudaram: 2 });
  });

  it.each([
    ["sem a última noite", { primeiraNoite: "2026-11-17" }],
    ["com o dia noutra forma", { ...registoDe("2026-11-17").valor, primeiraNoite: "17/11" }],
    [
      "com uma contagem impossível",
      {
        ...registoDe("2026-11-17").valor,
        ultima: { ...registoDe("x").valor.ultima, apagadas: -1 },
      },
    ],
    ["que nem é um objeto", "2026-11-17"],
  ])("um registo fora da forma (%s): a noite fica a seco e escreve um novo", async (_n, valor) => {
    st.registo = { valor, versao: ANTIGA };
    const r = await aplicarLimpezaDoAppState((await planear()).plano, "2026-11-18", LONGE);
    expect(r).toMatchObject({ aSeco: true, apagadas: 0 });
    expect(st.lapides).toEqual([]);
    expect(st.condicionais).toEqual([]);
    expect(st.gravados).toEqual([expect.objectContaining({ primeiraNoite: "2026-11-18" })]);
  });

  it("o registo que se escreve é lido de volta pelo mesmo esquema", async () => {
    await aplicarLimpezaDoAppState((await planear()).plano, "2026-11-18", LONGE);
    expect(registoDaLimpeza.safeParse(st.gravados[0]).success).toBe(true);
    expect(ESPACOS[espacoDaChave(CHAVE_DO_REGISTO) ?? "rascunhos"].valor).toBe(registoDaLimpeza);
  });

  it("com o prazo passado não se apaga nada, e o que ficou por fazer conta em `ficam`", async () => {
    st.registo = registoDe("2026-11-17");
    const r = await aplicarLimpezaDoAppState((await planear()).plano, "2026-11-18", Date.now() - 1);
    expect(st.lapides).toEqual([]);
    expect(st.condicionais).toEqual([]);
    expect(r).toMatchObject({ aSeco: false, apagadas: 0, ficam: 3 });
  });

  it("o registo que não se lê: não se apaga nada", async () => {
    st.registo = new Error("em baixo");
    const r = await aplicarLimpezaDoAppState((await planear()).plano, "2026-11-18", LONGE);
    expect(r).toBeNull();
    expect(st.lapides).toEqual([]);
    expect(st.condicionais).toEqual([]);
  });

  it("um pedido que voltou da Reciclagem entre a cópia e o apagar: o rascunho dele fica", async () => {
    st.registo = registoDe("2026-11-17");
    const { plano } = await planear();
    // A partir daqui há base: quem existe lê-se AGORA, e o pedido voltou.
    st.agora = {
      quotes: [{ id: "q1" }, { id: "q-apagado" }],
      proposals: [{ id: P1 }],
      reciclagem: [],
    };
    const r = await aplicarLimpezaDoAppState(plano, "2026-11-18", LONGE);
    expect(st.condicionais.map(([k]) => k)).not.toContain("proposal-draft:q-apagado");
    expect(r).toMatchObject({ apagadas: 2, mudaram: 1 });
  });

  it("quem existe agora não se lê: não se apaga nada", async () => {
    st.registo = registoDe("2026-11-17");
    const { plano } = await planear();
    st.agora = { quotes: [{ id: "q1" }] }; // propostas e Reciclagem falham
    expect(await aplicarLimpezaDoAppState(plano, "2026-11-18", LONGE)).toBeNull();
    expect(st.lapides).toEqual([]);
    expect(st.condicionais).toEqual([]);
  });
});
