import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { Foto } from "./PropostaWeb";

/**
 * Ela, 28/10: «as fotos estão todas bugadas da proposta online… isto não pode
 * acontecer». A grelha da paleta punha a primeira foto em grande com
 * `img:first-child`. Quando a foto passou a ter AVIF, o `<img>` foi para dentro
 * de um `<picture>`, a seguir às `<source>` — deixou de ser o primeiro filho, e
 * a grelha partiu-se (uma faixa estreita em cima, uma célula vazia em baixo).
 */

const CSS = readFileSync(join(__dirname, "proposta-web.css"), "utf8");

describe("a paleta não depende da posição do <img>", () => {
  it("nenhuma regra da página escolhe um <img> pela posição entre irmãos", () => {
    // Com AVIF o <img> é o ÚLTIMO filho do <picture>; sem AVIF é filho directo.
    expect(CSS).not.toMatch(/img:(first|last|nth)-(child|of-type)/);
  });

  it("a classe da foto grande chega ao <img>, também dentro do <picture>", () => {
    const html = renderToStaticMarkup(
      <Foto
        img={{
          src: "https://cdn/m.jpg",
          grande: "https://cdn/o.jpg",
          avif: "https://cdn/m.avif",
          aspecto: 1.5,
        }}
        sizes="50vw"
        className="pw-pal-grande"
      />,
    );
    expect(html).toContain("<picture");
    expect(html).toMatch(/<img[^>]*class="pw-pal-grande"/);
    expect(CSS).toMatch(/\.pw-pal \.pw-pics \.pw-pal-grande\s*\{\s*grid-row: span 2;/);
  });

  it("as <source> do <picture> não ocupam células da grelha", () => {
    // `display: contents` no <picture> faz das <source> filhas da grelha; o
    // Chromium dá-lhes uma célula e empurra as fotografias (medido a 1440).
    expect(CSS).toMatch(/\.pw picture > source\s*\{\s*display: none;/);
  });
});
