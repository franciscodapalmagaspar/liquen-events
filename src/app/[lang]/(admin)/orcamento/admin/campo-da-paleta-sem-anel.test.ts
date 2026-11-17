import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Revisão · 10 do BO 4. A regra de foco dos campos (`admin.css`) muda a
 * MOLDURA do campo: borda de acento e um segundo píxel por dentro
 * (`box-shadow: inset`). O campo do ⌘K não tem moldura nem cantos — vive
 * transparente dentro da caixa da paleta — e por isso a regra desenhava-lhe
 * um rectângulo de cantos vivos por dentro de uma caixa redonda.
 *
 * Aí o foco já se vê de outra maneira: a janela aberta e o cursor a piscar.
 * O campo sai da regra pela marca `data-sem-anel`; o `forced-colors`, que
 * repõe o contorno do sistema em todos os campos, não abre excepções.
 *
 * (Medido no browser em `e2e/bo4-procura-lotes-atalhos.spec.ts`.)
 */

const RAIZ = process.cwd();
const css = readFileSync(join(RAIZ, "src/app/admin.css"), "utf8");
const paleta = readFileSync(
  join(RAIZ, "src/app/[lang]/(admin)/orcamento/admin/CommandPalette.tsx"),
  "utf8",
);

/** O seletor da regra que pinta a moldura de acento no foco. */
function seletorDaMoldura(): string {
  const i = css.indexOf("box-shadow: inset 0 0 0 1px var(--bo-accent);");
  expect(i, "a regra da moldura de acento desapareceu do admin.css").toBeGreaterThan(-1);
  const inicio = css.lastIndexOf("}", i);
  return css.slice(inicio, i);
}

describe("o campo do ⌘K não leva o rectângulo do foco", () => {
  it("a regra da moldura deixa de fora os campos marcados `data-sem-anel`", () => {
    expect(seletorDaMoldura()).toContain(":not([data-sem-anel])");
  });

  it("e sem o anel global — com `outline-color: transparent`, fora de qualquer media (2.ª revisão · 8)", () => {
    const i = css.indexOf("input[data-sem-anel]:focus-visible {");
    expect(i, "falta a regra que tira o anel global ao campo marcado").toBeGreaterThan(-1);
    const regra = css.slice(i, css.indexOf("}", i));
    expect(regra).toContain("outline-color: transparent");
    expect(regra).toContain("box-shadow: none");
    expect(regra).not.toContain("outline: none");
    // Fora de qualquer media: um browser sem `forced-colors` não volta ao rectângulo.
    const antes = css.slice(0, i);
    expect(antes.lastIndexOf("@media")).toBeLessThan(antes.lastIndexOf("}\n\n"));
    expect(css).not.toContain("@media (forced-colors: none)");
  });

  it("o campo da paleta tem a marca", () => {
    expect(paleta).toMatch(/role="combobox"[\s\S]{0,400}data-sem-anel/);
  });

  it("o `forced-colors` continua a pôr o contorno do sistema em TODOS os campos", () => {
    const bloco = css.slice(css.lastIndexOf("@media (forced-colors: active)"));
    const regra = bloco.slice(0, bloco.indexOf("}\n}") + 3);
    expect(regra).toContain("outline: 2px solid CanvasText");
    // Com o mesmo peso da regra do campo do ⌘K, para lhe ganhar também.
    expect(regra).toContain("input[data-sem-anel]");
  });
});
