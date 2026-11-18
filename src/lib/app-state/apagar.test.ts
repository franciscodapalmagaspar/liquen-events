import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Os apagares das limpezas da noite levam a CONDIÇÃO para a base de dados, na
 * mesma ida: «ainda é lápide» e «ainda está na versão que se leu». É isso que
 * impede um rascunho gravado entre a leitura e o apagar de sair.
 */

const st = vi.hoisted(() => ({
  filtros: [] as string[][],
  resposta: { data: [] as { key: string }[], error: null as unknown },
  sinais: [] as AbortSignal[],
}));

vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => {
    const filtros: string[] = [];
    st.filtros.push(filtros);
    const q = {
      delete: () => q,
      in: (c: string, v: string[]) => (filtros.push(`${c} in ${v.join(",")}`), q),
      is: (c: string, v: null) => (filtros.push(`${c} is ${v}`), q),
      eq: (c: string, v: string) => (filtros.push(`${c} = ${v}`), q),
      like: (c: string, v: string) => (filtros.push(`${c} like ${v}`), q),
      lt: (c: string, v: string) => (filtros.push(`${c} < ${v}`), q),
      select: () => q,
      abortSignal: async (sinal: AbortSignal) => (st.sinais.push(sinal), st.resposta),
    };
    return { from: () => q };
  },
}));

import { apagarEstadoSeNaoMudou, apagarLapides } from "./apagar";

beforeEach(() => {
  st.filtros = [];
  st.resposta = { data: [], error: null };
  st.sinais = [];
});

describe("apagar lápides", () => {
  it("só apaga o que ainda for lápide, e devolve o que saiu", async () => {
    st.resposta = { data: [{ key: "proposal-draft:a" }], error: null };
    expect(await apagarLapides(["proposal-draft:a", "proposal-draft:b"])).toEqual({
      sairam: ["proposal-draft:a"],
      falhou: false,
    });
    expect(st.filtros[0]).toEqual(["key in proposal-draft:a,proposal-draft:b", "value is null"]);
  });

  it("vai em lotes de 100", async () => {
    const chaves = Array.from({ length: 250 }, (_, i) => `proposal-draft:q${i}`);
    await apagarLapides(chaves);
    const lotes = st.filtros[0].filter((f) => f.startsWith("key in"));
    expect(lotes.map((l) => l.split(",").length)).toEqual([100, 100, 50]);
  });

  it("um erro diz que falhou, e uma lista vazia não vai à base", async () => {
    st.resposta = { data: [], error: { message: "em baixo" } };
    expect(await apagarLapides(["proposal-draft:a"])).toEqual({ sairam: [], falhou: true });
    st.filtros = [];
    expect(await apagarLapides([])).toEqual({ sairam: [], falhou: false });
    expect(st.filtros).toEqual([]);
  });
});

describe("apagar só se não mudou", () => {
  it("leva a chave e a versão na mesma condição", async () => {
    st.resposta = { data: [{ key: "k" }], error: null };
    expect(await apagarEstadoSeNaoMudou("ligacao-proposta:abc", "2026-11-17T00:00:00Z")).toBe(
      "apagado",
    );
    expect(st.filtros[0]).toEqual([
      "key = ligacao-proposta:abc",
      "updated_at = 2026-11-17T00:00:00Z",
    ]);
    // E parte com o sinal do prazo: no tempo esgotado o pedido é cortado.
    expect(st.sinais).toHaveLength(1);
    expect(st.sinais[0].aborted).toBe(false);
  });

  it("nenhuma linha apagada é «mudou»; um erro é «falhou»", async () => {
    expect(await apagarEstadoSeNaoMudou("k", "v")).toBe("mudou");
    st.resposta = { data: [], error: { message: "x" } };
    expect(await apagarEstadoSeNaoMudou("k", "v")).toBe("falhou");
  });
});
