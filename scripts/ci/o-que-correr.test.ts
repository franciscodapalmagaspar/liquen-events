import { describe, expect, it } from "vitest";
import { oQueCorrer } from "./o-que-correr.mjs";

describe("o que uma mudança precisa de verificar", () => {
  it("depois de juntar, à noite e à mão: tudo", () => {
    for (const evento of ["push", "schedule", "workflow_dispatch"]) {
      expect(oQueCorrer(["docs/X.md"], evento)).toMatchObject({ tudo: true, unidade: "tudo" });
    }
  });

  it("só documentos: nem testes de unidade nem browser", () => {
    expect(oQueCorrer(["docs/LOGIN.md", "CLAUDE.md"], "pull_request")).toMatchObject({
      tudo: false,
      unidade: "nada",
      sitio: false,
      backOffice: false,
    });
  });

  it("um ecrã do back office: os testes ligados e os passeios do back office, sem os do sítio", () => {
    const d = oQueCorrer(
      ["src/app/[lang]/(admin)/orcamento/admin/mesas/Sala.tsx", "docs/MAPA-DE-MESAS.md"],
      "pull_request",
    );
    expect(d).toMatchObject({ tudo: false, unidade: "ligados", sitio: false, backOffice: true });
    expect(d.ligados).toEqual(["src/app/[lang]/(admin)/orcamento/admin/mesas/Sala.tsx"]);
  });

  it("a galeria: os passeios do sítio, sem os do back office", () => {
    expect(
      oQueCorrer(["src/app/[lang]/(site)/galeria/GaleriaClient.tsx"], "pull_request"),
    ).toMatchObject({ sitio: true, backOffice: false });
  });

  it("código partilhado (src/lib): as duas áreas", () => {
    expect(oQueCorrer(["src/lib/orcamento/mapa-de-mesas.ts"], "pull_request")).toMatchObject({
      tudo: false,
      sitio: true,
      backOffice: true,
    });
  });

  it("uma migração em db/: corre o teste das migrações num Postgres a sério", () => {
    const d = oQueCorrer(
      ["db/migracoes/20261118_p7b_gravar_ligacao_por_proposta.sql"],
      "pull_request",
    );
    expect(d.unidade).toBe("ligados");
    expect(d.ligados).toEqual(["test/migracoes.pglite.test.ts"]);
  });

  it.each([
    "package.json",
    "package-lock.json",
    ".github/workflows/ci.yml",
    "e2e/imagens.spec.ts",
    "playwright.dados.config.ts",
    "src/app/globals.css",
    "src/app/[lang]/layout.tsx",
    "scripts/pregen-gallery.mjs",
    "test/em-partes.ts",
  ])("mudar %s corre tudo", (f) => {
    expect(oQueCorrer([f, "docs/X.md"], "pull_request")).toMatchObject({ tudo: true });
  });

  it("uma lista vazia ou cortada pela API não prova nada: tudo", () => {
    expect(oQueCorrer([], "pull_request").tudo).toBe(true);
    expect(
      oQueCorrer(
        Array.from({ length: 3000 }, (_, i) => `docs/${i}.md`),
        "pull_request",
      ).tudo,
    ).toBe(true);
  });
});
