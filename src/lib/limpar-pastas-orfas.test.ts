import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const st = vi.hoisted(() => ({
  pastas: {} as Record<string, { id: string; name: string; created_at: string }[]>,
  tabelas: {} as Record<string, unknown[] | null>,
  estado: {} as Record<string, unknown>,
  apagadas: [] as string[],
}));
vi.mock("@/lib/proposal-storage", () => ({
  apagarPastaDoPedido: vi.fn(async (p: string) => {
    st.apagadas.push(p);
    return true;
  }),
}));
vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async (k: string) => st.estado[k] ?? null),
  setState: vi.fn(async (k: string, v: unknown) => {
    st.estado[k] = v;
    return { gravado: true, duradouro: true, onde: "supabase" };
  }),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    storage: {
      from: () => ({
        list: async (pasta: string) => ({
          data:
            pasta === ""
              ? [
                  ...Object.keys(st.pastas).map((n) => ({ id: null, name: n })),
                  { id: "x", name: "solto.jpg" },
                ]
              : st.pastas[pasta],
          error: null,
        }),
      }),
    },
    from: (tabela: string) => ({
      // A tabela `app_state` devolve também o que o `setState` gravou — como
      // a de verdade: a lista de espera vive lá.
      // Como o PostgREST: `order`/`range`, e NUNCA mais de 1000 por resposta.
      select: () => {
        let desde = 0;
        let ate = Infinity;
        const b = {
          order: () => b,
          range(d: number, a: number) {
            desde = d;
            ate = a;
            return b;
          },
          then(resolve: (v: unknown) => unknown) {
            if (st.tabelas[tabela] === null) {
              return Promise.resolve(resolve({ data: null, error: { message: "falhou" } }));
            }
            const todas = [
              ...(st.tabelas[tabela] ?? []),
              ...(tabela === "app_state"
                ? Object.entries(st.estado).map(([key, value]) => ({ key, value }))
                : []),
            ];
            const fim = Math.min(ate + 1, desde + 1000);
            return Promise.resolve(resolve({ data: todas.slice(desde, fim), error: null }));
          },
        };
        return b;
      },
    }),
  }),
}));

import { CHAVE, limparPastasDePedidosApagados } from "./limpar-pastas-orfas";

const dia1 = new Date("2026-11-11T03:00:00Z");
const dia9 = new Date("2026-11-19T03:00:00Z");
const velha = (name: string) => ({ id: name, name, created_at: "2026-07-22T10:00:00Z" });
const nova = (name: string) => ({ id: name, name, created_at: "2026-11-01T10:00:00Z" });

describe("as fotografias de pedidos que já não existem (10/11)", () => {
  beforeEach(() => {
    st.apagadas = [];
    st.estado = {};
    st.pastas = {
      "LIQ-VIVO-1": [velha("a.jpg")],
      "LIQ-APAGADO-1": [velha("b.jpg"), velha("c.jpg")],
      "LIQ-NA-RECICLAGEM": [velha("d.jpg")],
      "LIQ-RECENTE": [nova("e.jpg")],
      "LIQ-NUM-MODELO": [velha("f.jpg")],
      "LIQ-COM-RASCUNHO": [velha("h.jpg")],
      "LIQ-COM-PROPOSTA": [velha("i.jpg")],
      "LIQ-NUM-CONTRATO": [velha("j.jpg")],
      modelos: [velha("g.jpg")],
    };
    st.tabelas = {
      quotes: [{ id: "LIQ-VIVO-1" }],
      reciclagem: [{ origem_id: "LIQ-NA-RECICLAGEM" }],
      app_state: [
        { key: "proposal-draft:LIQ-COM-RASCUNHO", value: { modelos: ["LIQ-NUM-MODELO/f.jpg"] } },
      ],
      proposals: [{ quote_id: "LIQ-COM-PROPOSTA" }],
      contracts: [{ anexo: "LIQ-NUM-CONTRATO/j.jpg" }],
    };
  });

  it("na primeira noite não apaga nada: só põe em espera o que passou todas as portas", async () => {
    const r = await limparPastasDePedidosApagados(dia1);
    expect(st.apagadas).toEqual([]);
    expect(Object.keys(st.estado[CHAVE] as object)).toEqual(["LIQ-APAGADO-1"]);
    expect(r).toMatchObject({ candidatas: 1, emEspera: 1, apagadas: 0, acabou: true });
  });

  it("passados 7 dias, e ainda candidata, sai — e só essa", async () => {
    await limparPastasDePedidosApagados(dia1);
    const r = await limparPastasDePedidosApagados(dia9);
    expect(st.apagadas).toEqual(["LIQ-APAGADO-1"]);
    expect(st.estado[CHAVE]).toEqual({});
    expect(r).toMatchObject({ apagadas: 1, emEspera: 0 });
  });

  it("se entretanto alguma coisa passou a mencioná-la, sai da espera e fica", async () => {
    await limparPastasDePedidosApagados(dia1);
    st.tabelas.tasks = [{ nota: "ver LIQ-APAGADO-1/b.jpg" }];
    await limparPastasDePedidosApagados(dia9);
    expect(st.apagadas).toEqual([]);
    expect(st.estado[CHAVE]).toEqual({});
  });

  it("se uma leitura da base de dados falha, não apaga nem mexe na espera", async () => {
    await limparPastasDePedidosApagados(dia1);
    st.tabelas.invoices = null;
    const r = await limparPastasDePedidosApagados(dia9);
    expect(st.apagadas).toEqual([]);
    expect(Object.keys(st.estado[CHAVE] as object)).toEqual(["LIQ-APAGADO-1"]);
    expect(r.acabou).toBe(false);
  });

  it("se a lista dos pedidos falha, não apaga nada (não saber não é não existir)", async () => {
    await limparPastasDePedidosApagados(dia1);
    st.tabelas.quotes = null;
    await limparPastasDePedidosApagados(dia9);
    expect(st.apagadas).toEqual([]);
  });

  /**
   * Auditoria de 13/11: o Supabase devolve no máximo 1000 linhas e corta o
   * resto sem avisar. Com 1000 pedidos, um pedido VIVO que ficou de fora da
   * lista parecia órfão e a pasta dele era apagada.
   */
  it("um pedido vivo depois das primeiras 1000 linhas continua vivo (lê-se tudo, às páginas)", async () => {
    // O «apagado» da lista volta a existir, mas na linha 1501: lido só até às
    // 1000, parecia órfão e a pasta dele saía.
    const vivo = "LIQ-APAGADO-1";
    st.tabelas.quotes = [
      { id: "LIQ-VIVO-1" },
      ...Array.from({ length: 1500 }, (_, i) => ({
        id: `LIQ-OUTRO-${String(i).padStart(4, "0")}`,
      })),
      { id: vivo },
    ];
    await limparPastasDePedidosApagados(dia1);
    const r = await limparPastasDePedidosApagados(dia9);
    expect(st.apagadas).toEqual([]);
    // E a limpeza CORRE (não pára para sempre por haver mais de 1000 pedidos).
    expect(r.acabou).toBe(true);
  });
});
