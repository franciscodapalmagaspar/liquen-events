import { describe, expect, it } from "vitest";
import { CICLOS_CONHECIDOS, compararCiclos, lerCiclosDoMadge } from "./ciclos-de-importacao.mjs";

describe("ciclos de importação", () => {
  const hoje = CICLOS_CONHECIDOS.map((c) => c.split(" > "));

  it("os de hoje passam", () => {
    expect(compararCiclos(hoje)).toEqual({ novos: [], resolvidos: [], cego: false });
  });

  it("um ciclo novo aparece como novo", () => {
    const r = compararCiclos([
      ...hoje,
      ["lib/orcamento/estudio/gravar.ts", "app/[lang]/(admin)/orcamento/admin/ProposalStudio.tsx"],
    ]);
    expect(r.novos).toEqual([
      "lib/orcamento/estudio/gravar.ts > app/[lang]/(admin)/orcamento/admin/ProposalStudio.tsx",
    ]);
  });

  it("um conhecido que desaparece pede para sair da lista", () => {
    expect(compararCiclos(hoje.slice(1)).resolvidos).toEqual([CICLOS_CONHECIDOS[0]]);
  });

  it("uma lista vazia, com ciclos conhecidos, é o madge cego — não é verde", () => {
    expect(compararCiclos([]).cego).toBe(true);
    expect(compararCiclos([], []).cego).toBe(false);
  });
});

describe("ler a saída do madge", () => {
  it("lê a lista de ciclos", () => {
    expect(lerCiclosDoMadge({ stdout: '[["a.ts","b.ts"]]' })).toEqual([["a.ts", "b.ts"]]);
    expect(lerCiclosDoMadge({ stdout: "[]" })).toEqual([]);
  });

  it("um npx que não arranca, ou uma saída que não é a lista, dá null", () => {
    expect(lerCiclosDoMadge({ error: new Error("spawnSync npx ENOENT"), stdout: null })).toBeNull();
    expect(lerCiclosDoMadge({ stdout: null })).toBeNull();
    expect(lerCiclosDoMadge({ stdout: "null" })).toBeNull();
    expect(lerCiclosDoMadge({ stdout: "{}" })).toBeNull();
    expect(lerCiclosDoMadge({ stdout: '["a.ts"]' })).toBeNull();
    expect(lerCiclosDoMadge({ stdout: "Error: algo" })).toBeNull();
  });
});
