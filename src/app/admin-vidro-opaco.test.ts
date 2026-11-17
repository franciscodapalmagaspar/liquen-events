import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Revisão do lote de 18/11: o `<Glass>` do back office (barra dos Temas, editor
 * das mesas) perde o desfoque com «menos transparência» e «mais contraste».
 * Sem um fundo opaco ficava a tinta a 78 % por cima do que está por baixo,
 * nítido — mais transparência para quem pediu menos.
 */
const css = readFileSync(join(process.cwd(), "src/app/admin.css"), "utf8");

describe("o vidro do back office fica opaco quando se pede menos transparência", () => {
  it("a .lg leva o material opaco dentro dessas preferências", () => {
    const i = css.indexOf(
      "@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {",
    );
    expect(i).toBeGreaterThan(-1);
    const bloco = css.slice(i, css.indexOf("\n}\n", i));
    expect(bloco).toMatch(/\.lg\s*\{\s*background:\s*var\(--bo-material-opaco/);
  });
});
