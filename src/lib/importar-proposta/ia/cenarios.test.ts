import { describe, it, expect } from "vitest";
import { verificar } from "./verificar";
import { preencher } from "./preencher";
import { CENARIOS } from "./cenarios.testkit";

/**
 * As propostas inventadas das revisões do IVA: quantos avisos cada uma dá, e
 * se o IVA fica por escolher (sem prova nas contas) ou provado.
 */
const ESPERADO: Record<
  string,
  { avisos: string[]; escolher: boolean; linhas?: (number | null)[] }
> = {
  A: { avisos: [], escolher: true },
  B: { avisos: [], escolher: true },
  "B′": { avisos: [], escolher: true },
  C: { avisos: [], escolher: false, linhas: [1000, 740] },
  D: { avisos: [], escolher: true },
  E: {
    avisos: ["numero:ambiguo:orcamento.total:1.200", "numero:ambiguo:orcamento.linhas.0:1.200"],
    escolher: true,
  },
  "E′": { avisos: ["nao-usado:p3:147500"], escolher: true },
};

describe("as propostas inventadas A–E′", () => {
  it.each(Object.keys(ESPERADO))("%s", (k) => {
    const { d, l } = CENARIOS[k]();
    const v = verificar(d, l);
    const e = ESPERADO[k];
    expect(v.avisos.map((a) => a.id)).toEqual(e.avisos);
    expect(v.contas.ivaPorEscolher).toBe(e.escolher);
    const p = preencher(d, v);
    if (e.linhas) expect(p.budgetAmounts).toEqual(e.linhas);
    if (e.escolher) {
      expect(p.totalVatMode).toBeNull();
      expect(p.budgetAmounts.every((x) => x === null)).toBe(true);
    }
  });

  it("E′ — a prestação «(1.475,00 €)» é positiva", () => {
    const { d, l } = CENARIOS["E′"]();
    const v = verificar(d, l);
    expect(v.valores.find((x) => x.unidade === "p3")?.valor).toBe(1475);
  });
});
