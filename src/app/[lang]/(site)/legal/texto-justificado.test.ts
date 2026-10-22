import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pedidos dela (17/10): «justifica o texto do orçamento que colocamos a
 * bocado» (a ajuda por baixo da mensagem em /orcamento) e «na política de
 * privacidade também justifica o texto». Como nas páginas de serviços
 * (`servicos/texto-justificado.test.ts`): justificado e com hífen, para o
 * telemóvel não esticar os espaços. E a 22/10: «sim, justifica também os
 * termos e condições».
 */
const site = join(process.cwd(), "src/app/[lang]/(site)");
const ler = (f: string) => readFileSync(join(site, f), "utf8");

describe("texto corrido justificado — orçamento, privacidade e termos", () => {
  it("a ajuda da mensagem do orçamento", () => {
    expect(ler("orcamento/OrcamentoForm.tsx")).toMatch(
      /id="of-mensagem-hint"\s+className="[^"]*text-justify[^"]*hyphens-auto[^"]*"/,
    );
  });

  it("a política de privacidade pede o texto justificado", () => {
    expect(ler("privacidade/page.tsx")).toMatch(/<LegalDocView doc=\{privacy\} justificado \/>/);
  });

  it("os termos também", () => {
    expect(ler("termos/page.tsx")).toMatch(/<LegalDocView doc=\{terms\} justificado \/>/);
  });

  it("o justificado da vista legal leva o hífen", () => {
    expect(ler("legal/LegalDocView.tsx")).toMatch(/"\s*text-justify hyphens-auto"/);
  });
});
