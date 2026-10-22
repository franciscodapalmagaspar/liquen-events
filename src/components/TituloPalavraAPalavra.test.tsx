// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import TituloPalavraAPalavra from "./TituloPalavraAPalavra";
import { wordStaggerMs } from "@/lib/motion/tokens";

/**
 * «Títulos palavra a palavra» (22/10). Prende-se: o título é a frase tal e
 * qual (sem cópia escondida), cada palavra leva o seu atraso com o tecto da
 * casa, a animação é CSS e espera pela cortina na primeira visita, e os seis
 * títulos de topo usam-no.
 */

afterEach(cleanup);

const raiz = process.cwd();
const ler = (f: string) => readFileSync(path.join(raiz, f), "utf8");

describe("o título de topo entra palavra a palavra", () => {
  it("o nome do título é a frase, uma vez só", () => {
    render(
      <h1>
        <TituloPalavraAPalavra texto="Decoração de casamentos no Alentejo" />
      </h1>,
    );
    expect(
      screen.getByRole("heading", { name: "Decoração de casamentos no Alentejo" }),
    ).toBeTruthy();
    expect(document.querySelector("h1")?.textContent).toBe("Decoração de casamentos no Alentejo");
  });

  it("cada palavra leva o atraso da casa, com tecto", () => {
    const texto = "um dois três quatro cinco seis sete oito nove";
    render(<TituloPalavraAPalavra texto={texto} />);
    const atrasos = [...document.querySelectorAll<HTMLElement>(".palavra-sobe")].map((e) =>
      e.style.getPropertyValue("--word-delay"),
    );
    expect(atrasos).toEqual(texto.split(" ").map((_, i) => `${wordStaggerMs(i)}ms`));
  });

  it("a animação é CSS, só com movimento, e espera pela cortina na primeira visita", () => {
    const css = ler("src/app/globals.css");
    const bloco = css.slice(
      css.indexOf("@media (prefers-reduced-motion: no-preference) {\n  .palavra-sobe"),
    );
    expect(bloco).toMatch(
      /\.palavra-sobe \{\s*animation: word-rise [^;]*var\(--ease-out\)[^;]*backwards;/,
    );
    expect(bloco).toMatch(
      /html:not\(\[data-navigated\]\) \.palavra-sobe \{\s*animation-delay: calc\(var\(--cortina-sobe\) \+ var\(--word-delay, 0ms\)\);/,
    );
  });

  it("os títulos de topo usam-no", () => {
    for (const f of [
      "servicos/page.tsx",
      "servicos/[slug]/page.tsx",
      "clientes/page.tsx",
      "galeria/page.tsx",
      "contacto/page.tsx",
      "sobre/page.tsx",
    ]) {
      const src = ler(`src/app/[lang]/(site)/${f}`);
      expect(src, f).toMatch(/<h1[^>]*>\s*<TituloPalavraAPalavra/);
    }
  });
});
