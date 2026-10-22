import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Os três capítulos da página inicial (Casamentos / Corporativos / Privados)
 * abrem a página de destino NO TOPO.
 *
 * O dos Privados apontava para `/servicos#celebracoes`, e a âncora deixava
 * quem carregava em «Ver serviços» a meio da página dos serviços. Palavras
 * dela (22/10): «quando uma pessoa carrega nos privados em ver serviços, vá
 * parar à página dos serviços».
 */
describe("os capítulos da página inicial", () => {
  const fonte = readFileSync("src/app/[lang]/(site)/page.tsx", "utf8");
  const bloco = /const serviceLinks = \[([\s\S]*?)\];/.exec(fonte)?.[1] ?? "";
  const destinos = [...bloco.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);

  it("são três, e nenhum leva a meio de uma página (sem âncoras)", () => {
    expect(destinos).toHaveLength(3);
    for (const d of destinos) expect(d, `${d} salta para o meio da página`).not.toContain("#");
  });

  it("o dos Privados abre a página dos serviços", () => {
    expect(destinos).toContain("/servicos");
  });
});
