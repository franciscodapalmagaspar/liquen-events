import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  idsQueSaem,
  soltarLigacoesOrfas,
  substituirSemApagarOsQueFicam,
} from "./reposicao-e-chaves-estrangeiras";

describe("idsQueSaem", () => {
  it("devolve só o que está na base e não está na cópia", () => {
    expect(idsQueSaem(["a", "b", "c"], ["b", "d"])).toEqual(["a", "c"]);
    expect(idsQueSaem([], ["x"])).toEqual([]);
    expect(idsQueSaem(["x"], [])).toEqual(["x"]);
  });
});

describe("soltarLigacoesOrfas", () => {
  it("tira a ligação só às linhas cujo pedido não existe, sem mudar as que recebe", () => {
    const linhas: Record<string, unknown>[] = [
      { id: "1", quoteId: "Q1" },
      { id: "2", quoteId: "APAGADO" },
      { id: "3", quoteId: "" },
      { id: "4" },
    ];
    const r = soltarLigacoesOrfas(linhas, "quoteId", new Set(["Q1"]));
    expect(r.soltas).toBe(1);
    expect(r.linhas.map((l) => l.quoteId)).toEqual(["Q1", undefined, "", undefined]);
    expect(linhas[1].quoteId).toBe("APAGADO");
  });
});

/** Um Supabase de mentira com uma tabela, que regista o que lhe pedem. */
function supabaseFalso(inicial: Record<string, unknown>[]) {
  const tabela = new Map(inicial.map((r) => [String(r.id), { ...r }]));
  const chamadas: string[] = [];
  const sb = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (de: number, ate: number) => ({
            data: [...tabela.keys()]
              .sort()
              .slice(de, ate + 1)
              .map((id) => ({ id })),
            error: null,
          }),
        }),
      }),
      delete: () => ({
        in: async (_coluna: string, ids: string[]) => {
          chamadas.push(`apaga ${ids.join(",")}`);
          for (const id of ids) tabela.delete(id);
          return { error: null };
        },
      }),
      upsert: async (linhas: Record<string, unknown>[]) => {
        chamadas.push(`escreve ${linhas.map((l) => l.id).join(",")}`);
        for (const l of linhas) tabela.set(String(l.id), { ...l });
        return { error: null };
      },
    }),
  };
  return { sb: sb as unknown as SupabaseClient, tabela, chamadas };
}

describe("substituirSemApagarOsQueFicam", () => {
  it("apaga só o que a cópia não traz e escreve o resto por cima — o pedido que fica nunca é apagado", async () => {
    const { sb, tabela, chamadas } = supabaseFalso([
      { id: "Q1", data: "hoje" },
      { id: "Q2", data: "hoje" },
    ]);
    await substituirSemApagarOsQueFicam(sb, "quotes", "id", [
      { id: "Q1", data: "copia" },
      { id: "Q3", data: "copia" },
    ]);
    expect(chamadas).toEqual(["apaga Q2", "escreve Q1,Q3"]);
    expect([...tabela.keys()].sort()).toEqual(["Q1", "Q3"]);
    expect(tabela.get("Q1")?.data).toBe("copia");
  });

  it("uma cópia vazia esvazia a tabela (o mesmo que apagar tudo e não inserir nada)", async () => {
    const { sb, tabela } = supabaseFalso([{ id: "Q1" }]);
    await substituirSemApagarOsQueFicam(sb, "quotes", "id", []);
    expect(tabela.size).toBe(0);
  });

  it("lê os ids da base página a página (mais de mil pedidos)", async () => {
    const muitos = Array.from({ length: 2345 }, (_, i) => ({
      id: `Q${String(i).padStart(5, "0")}`,
    }));
    const { sb, tabela } = supabaseFalso(muitos);
    await substituirSemApagarOsQueFicam(sb, "quotes", "id", [{ id: "Q00007" }]);
    expect([...tabela.keys()]).toEqual(["Q00007"]);
  });
});
