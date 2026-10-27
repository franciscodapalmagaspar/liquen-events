import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Foto } from "./PropostaWeb";

/**
 * A capa da proposta online em AVIF. Ela (27/10): «sim, avança com a capa em
 * AVIF», e escolheu «Mais rápida»: no telemóvel os mesmos pixéis de antes em
 * metade do peso; no ecrã largo, a versão grande, para não ficar esbatida.
 */

const base = {
  src: "https://cdn/media.jpg",
  srcSet: "https://cdn/mini.jpg 400w, https://cdn/media.jpg 1200w",
  grande: "https://cdn/orig.jpg",
  aspecto: 0.667,
};

describe("a capa em AVIF", () => {
  it("a grande só no ecrã largo, ANTES da de 1200 — o browser fica com a primeira que serve", () => {
    const html = renderToStaticMarkup(
      <Foto
        img={{ ...base, avif: "https://cdn/c-1200.avif", avifGrande: "https://cdn/c-2000.avif" }}
        sizes="100vw"
        prioridade
      />,
    );
    const grande = html.indexOf(
      'media="(min-width: 900px)" srcSet="https://cdn/c-2000.avif" type="image/avif"',
    );
    const media = html.indexOf('srcSet="https://cdn/c-1200.avif" type="image/avif"');
    expect(grande).toBeGreaterThan(-1);
    expect(media).toBeGreaterThan(grande);
    // O `<img>` de sempre fica, para quem não lê AVIF.
    expect(html).toContain('src="https://cdn/media.jpg"');
    expect(html).toMatch(/fetchPriority="high"/);
  });

  it("uma fotografia sem a grande fica exactamente como antes", () => {
    const html = renderToStaticMarkup(
      <Foto img={{ ...base, avif: "https://cdn/c-1200.avif" }} sizes="100vw" />,
    );
    expect(html).not.toContain("min-width: 900px");
    expect(html.match(/<source/g)).toHaveLength(1);
  });

  it("sem AVIF nenhuma, nem há `<picture>`", () => {
    const html = renderToStaticMarkup(<Foto img={base} sizes="100vw" />);
    expect(html).not.toContain("<picture");
  });
});
