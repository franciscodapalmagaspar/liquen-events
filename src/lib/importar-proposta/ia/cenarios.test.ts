import { describe, it, expect } from "vitest";
import { verificar } from "./verificar";
import { preencher } from "./preencher";
import { CENARIOS } from "./cenarios.testkit";
import { escolherIva } from "./fixtures.testkit";

/**
 * As propostas inventadas das revisões do IVA. Desde a quinta revisão o IVA é
 * SEMPRE ela que o escolhe: em todas, nada passa antes da escolha. As contas e
 * as frases ficam como sugestões.
 */
const ESPERADO: Record<
  string,
  {
    avisos: string[];
    contas: "sem_iva" | "com_iva" | null;
    frases: "sem_iva" | "com_iva" | null;
    discordancia?: boolean;
  }
> = {
  A: { avisos: [], contas: null, frases: "sem_iva" },
  B: { avisos: [], contas: null, frases: "com_iva" },
  "B′": { avisos: [], contas: null, frases: null },
  C: { avisos: [], contas: "sem_iva", frases: null },
  D: { avisos: [], contas: null, frases: null },
  E: {
    avisos: ["numero:ambiguo:orcamento.total:1.200", "numero:ambiguo:orcamento.linhas.0:1.200"],
    contas: null,
    frases: "sem_iva",
  },
  "E′": { avisos: ["nao-usado:p3:147500"], contas: null, frases: "sem_iva" },
  // S1b/S1c: «Transporte 230» parece o IVA de 1.000 — as contas SUGEREM com
  // IVA, mas é só sugestão: ela escolhe.
  S1b: { avisos: [], contas: "com_iva", frases: null },
  S1c: { avisos: [], contas: "com_iva", frases: null },
  // S2: o trio é do catering do parceiro; também só sugestão.
  S2: { avisos: ["nao-usado:p5:40020", "nao-usado:p6:214020"], contas: "sem_iva", frases: null },
  S7b: {
    avisos: ["conta:sem-total", "nao-usado:p2:10000", "nao-usado:p2:12300"],
    contas: "sem_iva",
    frases: null,
  },
  N1: { avisos: [], contas: "sem_iva", frases: "com_iva", discordancia: true },
  N2: { avisos: [], contas: null, frases: null },
  N3: { avisos: [], contas: null, frases: null },
};

describe("as propostas inventadas A–E′, S1b–S7b e N1–N3: o IVA é sempre ela que o escolhe", () => {
  it.each(Object.keys(ESPERADO))("%s", (k) => {
    const { d, l } = CENARIOS[k]();
    const v = verificar(d, l);
    const e = ESPERADO[k];
    expect(v.avisos.map((a) => a.id)).toEqual(e.avisos);
    expect(v.contas.ivaPorEscolher).toBe(true);
    expect(v.contas.sugestaoDasContas?.modo ?? null).toBe(e.contas);
    expect(v.contas.sugestaoDasFrases).toBe(e.frases);
    expect(v.contas.discordancia).toBe(e.discordancia ?? false);
    const p = preencher(d, v);
    expect(p.ivaPorEscolher).toBe(true);
    expect(p.totalVatMode).toBeNull();
    expect(p.budgetAmounts.every((x) => x === null)).toBe(true);
  });

  it("C — depois da escolha, as linhas passam", () => {
    const { d, l } = CENARIOS.C();
    const { gravar } = escolherIva(preencher(d, verificar(d, l)), "acrescer");
    expect(gravar.budgetAmounts).toEqual([1000, 740]);
  });

  it("E′ — a prestação «(1.475,00 €)» é positiva", () => {
    const { d, l } = CENARIOS["E′"]();
    expect(verificar(d, l).valores.find((x) => x.unidade === "p3")?.valor).toBe(1475);
  });

  it("N3 — horas numa tabela de preços não são dinheiro, e «1.200» é 1 200", () => {
    const { d, l } = CENARIOS.N3();
    const v = verificar(d, l);
    expect(v.valores.map((x) => x.valor)).not.toContain(16.3);
    expect(v.leitura.orcamento.linhas[1].totalDaLinha.valor).toBe(1200);
  });
});
