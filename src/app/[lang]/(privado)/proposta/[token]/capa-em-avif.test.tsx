import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Foto } from "./PropostaWeb";

/**
 * As AVIF da proposta online. Ela (27/10): «sim, avança com a capa em AVIF».
 * E (28/10): «há aqui muitas fotos que parece que estão comidas». O browser
 * escolhe o `<source>` pelo FORMATO, nunca pelo tamanho: uma AVIF só com a de
 * 1200 era escolhida sempre, até na capa de um ecrã de 2880 pixéis.
 */

const base = {
  src: "https://cdn/media.jpg",
  srcSet: "https://cdn/mini.jpg 267w, https://cdn/media.jpg 800w, https://cdn/orig.jpg 1467w",
  grande: "https://cdn/orig.jpg",
  aspecto: 0.667,
};

describe("as AVIF da proposta online", () => {
  it("a capa: um só <source>, com a de 1200 e a grande e as larguras reais", () => {
    const html = renderToStaticMarkup(
      <Foto
        img={{
          ...base,
          avif: "https://cdn/c-1200.avif 800w, https://cdn/c-2000.avif 1333w",
          avifGrande: true,
        }}
        sizes="100vw"
        prioridade
        espacoGrande
      />,
    );
    expect(html.match(/<source/g)).toHaveLength(1);
    expect(html).toContain(
      'srcSet="https://cdn/c-1200.avif 800w, https://cdn/c-2000.avif 1333w" type="image/avif" sizes="100vw"',
    );
    // O `<img>` de sempre fica, para quem não lê AVIF.
    expect(html).toContain('src="https://cdn/media.jpg"');
    expect(html).toMatch(/fetchPriority="high"/);
  });

  it("num espaço grande sem a AVIF grande, nem há <picture>: o JPEG vai até ao original", () => {
    const html = renderToStaticMarkup(
      <Foto img={{ ...base, avif: "https://cdn/m.avif 800w" }} sizes="100vw" espacoGrande />,
    );
    expect(html).not.toContain("<picture");
    expect(html).toContain("https://cdn/orig.jpg 1467w");
  });

  it("num espaço pequeno, a AVIF de 1200 chega e entra", () => {
    const html = renderToStaticMarkup(
      <Foto img={{ ...base, avif: "https://cdn/m.avif 800w" }} sizes="25vw" />,
    );
    expect(html.match(/<source/g)).toHaveLength(1);
    expect(html).toContain('srcSet="https://cdn/m.avif 800w"');
  });

  it("sem AVIF nenhuma, nem há `<picture>`", () => {
    const html = renderToStaticMarkup(<Foto img={base} sizes="100vw" />);
    expect(html).not.toContain("<picture");
  });
});
