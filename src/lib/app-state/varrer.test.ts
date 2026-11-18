import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A varredura da limpeza da noite traz a chave, a versão e os campos de topo
 * pedidos — nunca o valor inteiro — e lê «não sei» (`completa: false`) em vez
 * de «não há» sempre que alguma coisa não bate.
 */

const st = vi.hoisted(() => ({
  pedidos: [] as { select: string; filtros: string[] }[],
  respostas: { nulas: [] as unknown[], comValor: [] as unknown[] },
  erro: null as unknown,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: () => ({
      select: (select: string) => {
        const pedido = { select, filtros: [] as string[] };
        st.pedidos.push(pedido);
        const q = {
          is: (c: string, v: null) => (pedido.filtros.push(`${c} is ${v}`), q),
          not: (c: string, op: string, v: null) => (pedido.filtros.push(`${c} not ${op} ${v}`), q),
          like: (c: string, v: string) => (pedido.filtros.push(`${c} like ${v}`), q),
          order: () => q,
          range: (desde: number, ate: number) => ({
            // O pedido só parte com o sinal do prazo (`comTecto`).
            abortSignal: async (sinal: AbortSignal) => {
              if (!(sinal instanceof AbortSignal)) throw new Error("sem sinal");
              return {
                data: (pedido.filtros.includes("value is null")
                  ? st.respostas.nulas
                  : st.respostas.comValor
                ).slice(desde, ate + 1),
                error: st.erro,
              };
            },
          }),
        };
        return q;
      },
    }),
  }),
}));

import { varrerPrefixo } from "./varrer";

beforeEach(() => {
  st.pedidos = [];
  st.respostas = { nulas: [], comValor: [] };
  st.erro = null;
});

describe("varrer um prefixo sem trazer os valores", () => {
  it("pede só a chave, a versão e os campos — e separa as lápides", async () => {
    st.respostas = {
      nulas: [{ key: "ligacao-proposta:a", updated_at: "v1" }],
      comValor: [{ key: "ligacao-proposta:b", updated_at: "v2", propostaId: "p", pedidoId: null }],
    };
    const r = await varrerPrefixo("ligacao-proposta:", {
      campos: ["propostaId", "pedidoId"],
      limite: 100,
    });
    // Uma página com o que há e uma vazia, em cada passagem.
    expect(st.pedidos.map((p) => p.select)).toEqual([
      "key, updated_at",
      "key, updated_at",
      "key, updated_at, propostaId:value->propostaId, pedidoId:value->pedidoId",
      "key, updated_at, propostaId:value->propostaId, pedidoId:value->pedidoId",
    ]);
    expect(st.pedidos[2].filtros).toContain("value not is null");
    expect(st.pedidos[0].filtros).toContain("key like ligacao-proposta:%");
    expect(r).toEqual({
      estado: "completa",
      linhas: [
        { key: "ligacao-proposta:a", versao: "v1", escritaEm: "v1", nula: true, campos: {} },
        {
          key: "ligacao-proposta:b",
          versao: "v2",
          escritaEm: "v2",
          nula: false,
          campos: { propostaId: "p", pedidoId: null },
        },
      ],
    });
  });

  it("um erro, uma linha fora da forma, ou mais do que o limite: «não sei»", async () => {
    st.erro = { message: "em baixo" };
    expect(await varrerPrefixo("x:", { limite: 10 })).toEqual({ estado: "falhou" });

    st.erro = null;
    st.respostas.comValor = [{ key: "x:1" }];
    expect(await varrerPrefixo("x:", { limite: 10 })).toEqual({ estado: "falhou" });

    st.respostas.comValor = Array.from({ length: 11 }, (_, i) => ({
      key: `x:${i}`,
      updated_at: "v",
    }));
    expect(await varrerPrefixo("x:", { limite: 10 })).toEqual({ estado: "transbordou" });
  });

  it("um nome de campo que não é um identificador não chega à consulta", async () => {
    await expect(varrerPrefixo("x:", { campos: ["a,b"], limite: 10 })).rejects.toThrow();
    expect(st.pedidos).toEqual([]);
  });

  it("o `%` e o `_` do prefixo não viram curingas", async () => {
    await varrerPrefixo("a_b%:", { limite: 10 });
    expect(st.pedidos[0].filtros).toContain("key like a\\_b\\%:%");
  });

  it("não depende de as páginas terem 1000: avança até vir uma vazia", async () => {
    st.respostas.comValor = Array.from({ length: 1500 }, (_, i) => ({
      key: `x:${String(i).padStart(4, "0")}`,
      updated_at: "v",
    }));
    const r = await varrerPrefixo("x:", { limite: 5000 });
    expect(r.estado === "completa" && r.linhas).toHaveLength(1500);
  });
});
