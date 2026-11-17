import { describe, expect, it } from "vitest";
import { CICLOS_CONHECIDOS, compararCiclos } from "./ciclos-de-importacao.mjs";

describe("ciclos de importação", () => {
  const hoje = CICLOS_CONHECIDOS.map((c) => c.split(" > "));

  it("os de hoje passam", () => {
    expect(compararCiclos(hoje)).toEqual({ novos: [], resolvidos: [] });
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
});
