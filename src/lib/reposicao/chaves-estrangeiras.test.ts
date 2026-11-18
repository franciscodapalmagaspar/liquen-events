import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/logger", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const {
  comDependentesGuardados,
  idsDosPedidosUmaVez,
  idsQueSaem,
  lerIds,
  soltarLigacoesOrfas,
  substituirSemApagarOsQueFicam,
} = await import("./chaves-estrangeiras");

type Linha = Record<string, unknown>;

/**
 * Um Supabase de mentira com várias tabelas (chave `id`, ou `codigo` nos
 * códigos curtos). Lê por chave (`gt` + `order` + `limit`, com um tecto de
 * linhas configurável, como o `max-rows` do PostgREST), apaga por `in`, escreve
 * por `upsert`, e regista o que lhe pedem.
 */
function supabaseFalso(
  inicial: Record<string, Linha[]>,
  opcoes: { tecto?: number; aoLer?: (tabela: string) => Error | null } = {},
) {
  const chaveDe = (t: string) => (t === "ligacoes_de_proposta" ? "codigo" : "id");
  const tabelas = new Map(
    Object.entries(inicial).map(([t, ls]) => [
      t,
      new Map(ls.map((l) => [String(l[chaveDe(t)]), { ...l }])),
    ]),
  );
  const de = (t: string) => {
    if (!tabelas.has(t)) tabelas.set(t, new Map());
    return tabelas.get(t)!;
  };
  const chamadas: string[] = [];
  const sb = {
    from: (t: string) => ({
      select: () => {
        let depois: string | null = null;
        const q = {
          gt: (_c: string, v: string) => {
            depois = v;
            return q;
          },
          order: () => q,
          limit: async (n: number) => {
            const erro = opcoes.aoLer?.(t) ?? null;
            if (erro) return { data: null, error: erro };
            const linhas = [...de(t).entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .filter(([k]) => depois === null || k > depois)
              .slice(0, Math.min(n, opcoes.tecto ?? n))
              .map(([, l]) => ({ ...l }));
            return { data: linhas, error: null };
          },
        };
        return q;
      },
      delete: () => ({
        in: async (_c: string, ids: string[]) => {
          chamadas.push(`apaga ${t} ${ids.join(",")}`);
          for (const id of ids) de(t).delete(id);
          return { error: null };
        },
      }),
      upsert: async (linhas: Linha[]) => {
        chamadas.push(`escreve ${t} ${linhas.map((l) => l[chaveDe(t)]).join(",")}`);
        if (t === "ligacoes_de_proposta" && linhas.some((l) => l.recusar)) {
          return { error: { code: "23505", message: "duplicate key" } };
        }
        for (const l of linhas) de(t).set(String(l[chaveDe(t)]), { ...l });
        return { error: null };
      },
    }),
  };
  return { sb: sb as unknown as SupabaseClient, tabelas, de, chamadas };
}

describe("idsQueSaem", () => {
  it("devolve só o que está na base e não está na cópia", () => {
    expect(idsQueSaem(["a", "b", "c"], ["b", "d"])).toEqual(["a", "c"]);
    expect(idsQueSaem([], ["x"])).toEqual([]);
    expect(idsQueSaem(["x"], [])).toEqual(["x"]);
  });
});

describe("soltarLigacoesOrfas", () => {
  it("tira a ligação só às linhas cujo pedido não existe, sem mudar as que recebe", () => {
    const linhas: Linha[] = [
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

describe("lerIds", () => {
  it("lê por chave até uma página vazia, mesmo com um tecto de linhas menor do que a página", async () => {
    const todos = Array.from({ length: 1200 }, (_, i) => ({
      id: `Q${String(i).padStart(4, "0")}`,
    }));
    const { sb } = supabaseFalso({ quotes: todos }, { tecto: 500 });
    expect(await lerIds(sb, "quotes", "id")).toEqual(todos.map((t) => t.id));
  });
});

describe("substituirSemApagarOsQueFicam", () => {
  it("apaga só o que a cópia não traz e escreve o resto por cima — o pedido que fica nunca é apagado", async () => {
    const { sb, de, chamadas } = supabaseFalso({
      quotes: [
        { id: "Q1", data: "hoje" },
        { id: "Q2", data: "hoje" },
      ],
    });
    await substituirSemApagarOsQueFicam(sb, "quotes", "id", [
      { id: "Q1", data: "copia" },
      { id: "Q3", data: "copia" },
    ]);
    // Escreve primeiro, apaga no fim: uma escrita que falhe não deixa nada caído.
    expect(chamadas).toEqual(["escreve quotes Q1,Q3", "apaga quotes Q2"]);
    expect([...de("quotes").keys()].sort()).toEqual(["Q1", "Q3"]);
    expect(de("quotes").get("Q1")?.data).toBe("copia");
  });

  it("uma cópia vazia esvazia a tabela (o mesmo que apagar tudo e não inserir nada)", async () => {
    const { sb, de } = supabaseFalso({ quotes: [{ id: "Q1" }] });
    await substituirSemApagarOsQueFicam(sb, "quotes", "id", []);
    expect(de("quotes").size).toBe(0);
  });

  it("com mais de mil pedidos", async () => {
    const muitos = Array.from({ length: 2345 }, (_, i) => ({
      id: `Q${String(i).padStart(5, "0")}`,
    }));
    const { sb, de } = supabaseFalso({ quotes: muitos });
    await substituirSemApagarOsQueFicam(sb, "quotes", "id", [{ id: "Q00007" }]);
    expect([...de("quotes").keys()]).toEqual(["Q00007"]);
  });
});

describe("idsDosPedidosUmaVez", () => {
  it("lê os pedidos uma vez por reposição, por mais conjuntos que os peçam", async () => {
    let leituras = 0;
    const { sb } = supabaseFalso(
      { quotes: [{ id: "Q1" }] },
      {
        aoLer: () => {
          leituras++;
          return null;
        },
      },
    );
    const pedidos = idsDosPedidosUmaVez(sb, "quotes", "id");
    expect(leituras).toBe(0);
    const [a, b, c] = await Promise.all([pedidos(), pedidos(), pedidos()]);
    expect([...a]).toEqual(["Q1"]);
    expect(b).toBe(a);
    expect(c).toBe(a);
    // Uma página com o pedido e a página vazia que prova o fim — uma vez só.
    expect(leituras).toBe(2);
  });

  it("uma falha passageira não fica guardada: o conjunto seguinte volta a tentar", async () => {
    let leituras = 0;
    const { sb } = supabaseFalso(
      { quotes: [{ id: "Q1" }] },
      { aoLer: () => (++leituras === 1 ? new Error("503") : null) },
    );
    const pedidos = idsDosPedidosUmaVez(sb, "quotes", "id");
    await expect(pedidos()).rejects.toThrow("503");
    expect([...(await pedidos())]).toEqual(["Q1"]);
  });
});

describe("comDependentesGuardados (os códigos curtos na reposição das propostas)", () => {
  const DEP = {
    tabela: "ligacoes_de_proposta",
    chave: "codigo",
    colunaDoPai: "proposal_id",
    tabelaDoPai: "proposals",
    chaveDoPai: "id",
  };
  const comCascata = (f: ReturnType<typeof supabaseFalso>, pais: string[]) => async () => {
    // O que o Postgres faz: apagar as propostas leva os códigos em cascata.
    f.de("proposals").clear();
    f.de("ligacoes_de_proposta").clear();
    for (const p of pais) f.de("proposals").set(p, { id: p });
    return new Set(pais);
  };

  it("os códigos de propostas que voltam, voltam; os outros não", async () => {
    const f = supabaseFalso({
      proposals: [{ id: "P1" }, { id: "P2" }],
      ligacoes_de_proposta: [
        { codigo: "c1", proposal_id: "P1" },
        { codigo: "c2", proposal_id: "P2" },
      ],
    });
    expect(await comDependentesGuardados(f.sb, DEP, comCascata(f, ["P1"]))).toBe(1);
    expect([...f.de("ligacoes_de_proposta").keys()]).toEqual(["c1"]);
  });

  it("se a reposição rebenta a meio, os códigos voltam para as propostas que ficaram", async () => {
    const f = supabaseFalso({
      proposals: [{ id: "P1" }],
      ligacoes_de_proposta: [{ codigo: "c1", proposal_id: "P1" }],
    });
    const rebenta = async (): Promise<ReadonlySet<string>> => {
      await comCascata(f, ["P1"])();
      throw new Error("o 2.º lote falhou");
    };
    await expect(comDependentesGuardados(f.sb, DEP, rebenta)).rejects.toThrow("2.º lote");
    expect([...f.de("ligacoes_de_proposta").keys()]).toEqual(["c1"]);
  });

  it("uma linha que esbarra numa restrição fica de fora, sem rebentar as outras", async () => {
    const f = supabaseFalso({
      proposals: [{ id: "P1" }],
      ligacoes_de_proposta: [
        { codigo: "c1", proposal_id: "P1" },
        { codigo: "c2", proposal_id: "P1", recusar: true },
      ],
    });
    expect(await comDependentesGuardados(f.sb, DEP, comCascata(f, ["P1"]))).toBe(1);
    expect([...f.de("ligacoes_de_proposta").keys()]).toEqual(["c1"]);
  });

  it("numa base sem a tabela, repõe à mesma", async () => {
    const f = supabaseFalso(
      { proposals: [] },
      {
        aoLer: (t) =>
          t === "ligacoes_de_proposta"
            ? Object.assign(new Error('relation "ligacoes_de_proposta" does not exist'), {
                code: "42P01",
              })
            : null,
      },
    );
    let reposto = false;
    await comDependentesGuardados(f.sb, DEP, async () => {
      reposto = true;
      return new Set<string>();
    });
    expect(reposto).toBe(true);
  });
});
