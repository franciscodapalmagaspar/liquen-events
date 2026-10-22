import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * «Dar vida» ao pedido de orçamento (22/10): a pastilha que passa a escolhida
 * assenta com a mola da casa. Prende-se que as três famílias de pastilhas a
 * usam, e que a animação é só `scale`, com a mola, e só com movimento.
 */
const ler = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

describe("a escolha assenta com mola", () => {
  it("as três famílias de pastilhas (tipo, cerimónia, decoração) levam a classe", () => {
    const form = ler("src/app/[lang]/(site)/orcamento/OrcamentoForm.tsx");
    expect(form.match(/active:scale-\[0\.97\] escolha-mola/g)).toHaveLength(3);
  });

  it("anima só ao ficar escolhida, com a mola da casa, e nada com movimento reduzido", () => {
    const css = ler("src/app/globals.css");
    const i = css.indexOf('.escolha-mola[aria-pressed="true"]');
    expect(i).toBeGreaterThan(-1);
    const antes = css.slice(0, i);
    expect(
      antes
        .slice(antes.lastIndexOf("@media"))
        .startsWith("@media (prefers-reduced-motion: no-preference)"),
    ).toBe(true);
    const bloco = css.slice(i, css.indexOf("}\n}", i));
    expect(bloco).toMatch(/\.escolha-mola\[aria-checked="true"\]/);
    expect(bloco).toMatch(
      /animation: escolha-assenta var\(--bo-mola-chegada-ms\) var\(--bo-mola-chegada\);/,
    );
    expect(bloco).toMatch(/from \{\s*scale: 0\.92;\s*\}\s*to \{\s*scale: 1;\s*\}/);
  });
});
