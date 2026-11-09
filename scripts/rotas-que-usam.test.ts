import { describe, expect, it } from "vitest";
import { rotasQueUsam } from "./rotas-que-usam.mjs";

describe("rotasQueUsam — onde o binário do sharp tem de ir", () => {
  const rotas = rotasQueUsam("sharp");

  it("apanha as rotas que já partiram em produção sem ele", () => {
    // A avaria de 2026: «Could not load the "sharp" module» em /api/temas.
    expect(rotas).toContain("/api/temas");
    expect(rotas).toContain("/api/temas/*/miniaturas");
    // E as que desenham o PDF e as fotografias da proposta.
    expect(rotas).toContain("/api/orcamento/*/pagina-do-rascunho");
    expect(rotas).toContain("/api/proposta/*/pdf");
  });

  it("deixa de fora as que não lhe chegam — é aí que se poupa", () => {
    expect(rotas.length).toBeGreaterThan(30);
    expect(rotas.length).toBeLessThan(100);
    expect(rotas).not.toContain("/api/vitals");
  });

  it("as chaves são padrões: nenhum `[x]`, que num padrão quer dizer «uma destas letras»", () => {
    for (const r of rotas) expect(r).not.toMatch(/\[|\]/);
  });
});
