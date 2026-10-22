// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assentarComMola } from "./assentar";
import { CHEGADA_MS, molaEmLinear } from "./tokens";

/**
 * «Dar vida» ao pedido de orçamento (22/10): a pastilha que passa a escolhida
 * assenta com a mola da casa. Prende-se a animação (só `scale`, a mola, nada
 * com movimento reduzido) e que as três famílias de pastilhas a chamam só ao
 * escolher.
 */
let reduzido = false;
const animate = vi.fn();

beforeEach(() => {
  reduzido = false;
  animate.mockReset();
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes("reduce") ? reduzido : false,
    media: q,
  })) as unknown as typeof window.matchMedia;
  HTMLElement.prototype.animate = animate as unknown as HTMLElement["animate"];
});

describe("a escolha assenta com mola", () => {
  it("anima o scale com a mola da casa", () => {
    assentarComMola(document.createElement("button"));
    expect(animate).toHaveBeenCalledWith([{ scale: "0.92" }, { scale: "1" }], {
      duration: CHEGADA_MS,
      easing: molaEmLinear(),
    });
  });

  it("com movimento reduzido não anima", () => {
    reduzido = true;
    assentarComMola(document.createElement("button"));
    expect(animate).not.toHaveBeenCalled();
  });

  it("as três famílias de pastilhas chamam-na só ao ficar escolhida", () => {
    const form = readFileSync(
      join(process.cwd(), "src/app/[lang]/(site)/orcamento/OrcamentoForm.tsx"),
      "utf8",
    );
    expect(form.match(/if \(!active\) assentarComMola\(e\.currentTarget\);/g)).toHaveLength(3);
  });

  it("não usa a mola do CSS, que é da caixa convocada do back office", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).not.toMatch(/escolha-mola|escolha-assenta/);
  });
});
