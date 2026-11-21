import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AREA_SERVIDA, SITE } from "@/lib/site";
import { textoDoLlms } from "@/app/llms.txt/route";

/**
 * «Eu só quero é que na IA e no Google e tudo mais apareça em todo o país»
 * (o Francisco, 21/11). O que se diz às máquinas é Portugal inteiro — o país,
 * e nenhuma cidade nem região; a morada de Évora não sai para lado nenhum.
 */
describe("a área de serviço é o país inteiro", () => {
  it("é Portugal, como país, e nada mais", () => {
    expect(AREA_SERVIDA).toEqual({ "@type": "Country", name: "Portugal" });
  });

  it("a empresa e cada serviço declaram-na", () => {
    for (const f of ["src/components/StructuredData.tsx", "src/components/JsonLd.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/areaServed: AREA_SERVIDA/);
    }
  });

  it("nenhum dado estruturado leva a cidade ou a região da morada", () => {
    for (const f of ["src/components/StructuredData.tsx", "src/components/JsonLd.tsx"]) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/SITE\.(city|region)|addressLocality|addressRegion/);
    }
    expect(SITE.city).toBe("Évora"); // só para o papel dos contratos
  });

  it("o llms.txt diz que trabalha em todo o país", () => {
    const t = textoDoLlms();
    expect(t).toContain("works nationwide, across all of Portugal");
    expect(t).toContain("trabalha em todo o país");
  });
});

describe("a marca e o IndexNow", () => {
  it("a empresa e o site levam as outras grafias da marca", async () => {
    const { OUTROS_NOMES } = await import("@/lib/site");
    expect(OUTROS_NOMES).toContain("Liquen");
    expect(
      readFileSync("src/components/StructuredData.tsx", "utf8").match(
        /alternateName: \[\.\.\.OUTROS_NOMES\]/g,
      )?.length,
    ).toBe(2);
  });

  it("a chave do IndexNow existe em public/ e é a mesma do script", async () => {
    const { readdirSync } = await import("node:fs");
    const script = readFileSync("scripts/indexnow.mjs", "utf8");
    const chave = script.match(/const CHAVE = "([0-9a-f]{32})"/)?.[1];
    expect(chave).toBeTruthy();
    expect(readdirSync("public")).toContain(`${chave}.txt`);
    expect(readFileSync(`public/${chave}.txt`, "utf8")).toBe(chave);
    expect(script).toMatch(/VERCEL_ENV !== "production"/);
  });
});
