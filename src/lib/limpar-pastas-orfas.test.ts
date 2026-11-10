import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const st = vi.hoisted(() => ({
  pastas: {} as Record<string, { id: string; name: string; created_at: string }[]>,
  tabelas: {} as Record<string, unknown[] | null>,
  apagadas: [] as string[],
}));
vi.mock("@/lib/proposal-storage", () => ({
  apagarPastaDoPedido: vi.fn(async (p: string) => {
    st.apagadas.push(p);
    return true;
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
      select: async () =>
        st.tabelas[tabela] === null
          ? { data: null, error: { message: "falhou" } }
          : { data: st.tabelas[tabela] ?? [], error: null },
    }),
  }),
}));

import { limparPastasDePedidosApagados } from "./limpar-pastas-orfas";

const agora = new Date("2026-11-11T03:00:00Z");
const velha = (name: string) => ({ id: name, name, created_at: "2026-07-22T10:00:00Z" });
const nova = (name: string) => ({ id: name, name, created_at: "2026-11-01T10:00:00Z" });

describe("as fotografias de pedidos que já não existem (10/11)", () => {
  beforeEach(() => {
    st.apagadas = [];
    st.pastas = {
      "LIQ-VIVO-1": [velha("a.jpg")],
      "LIQ-APAGADO-1": [velha("b.jpg"), velha("c.jpg")],
      "LIQ-NA-RECICLAGEM": [velha("d.jpg")],
      "LIQ-RECENTE": [nova("e.jpg")],
      "LIQ-NUM-MODELO": [velha("f.jpg")],
      modelos: [velha("g.jpg")],
    };
    st.tabelas = {
      quotes: [{ id: "LIQ-VIVO-1" }],
      reciclagem: [{ origem_id: "LIQ-NA-RECICLAGEM" }],
      proposal_settings: [{ value: { modelos: [{ images: ["LIQ-NUM-MODELO/f.jpg"] }] } }],
    };
  });

  it("apaga só a pasta de um pedido que não existe, não está na Reciclagem, ninguém menciona e é velha", async () => {
    const r = await limparPastasDePedidosApagados(agora);
    expect(st.apagadas).toEqual(["LIQ-APAGADO-1"]);
    expect(r).toEqual({ candidatas: 3, apagadas: 1, acabou: true });
  });

  it("se uma leitura da base de dados falha, não apaga nada", async () => {
    st.tabelas.proposals = null;
    const r = await limparPastasDePedidosApagados(agora);
    expect(st.apagadas).toEqual([]);
    expect(r.acabou).toBe(false);
  });

  it("se a lista dos pedidos falha, não apaga nada (não saber não é não existir)", async () => {
    st.tabelas.quotes = null;
    await limparPastasDePedidosApagados(agora);
    expect(st.apagadas).toEqual([]);
  });

  it("um rascunho guardado com o id do pedido na chave segura a pasta", async () => {
    st.tabelas.app_state = [{ key: "draft:LIQ-APAGADO-1", value: {} }];
    await limparPastasDePedidosApagados(agora);
    expect(st.apagadas).toEqual([]);
  });
});
