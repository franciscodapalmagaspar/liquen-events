import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EtiquetaPossivelSpam } from "./EtiquetaPossivelSpam";

describe("a etiqueta «Possível spam»", () => {
  it("sem marca não desenha nada", () => {
    expect(renderToStaticMarkup(<EtiquetaPossivelSpam valor={undefined} />)).toBe("");
    expect(renderToStaticMarkup(<EtiquetaPossivelSpam valor={{ motivo: "inventado" }} />)).toBe("");
  });

  it("com marca diz a palavra e o porquê (não só a cor)", () => {
    const html = renderToStaticMarkup(<EtiquetaPossivelSpam valor={{ motivo: "depressa" }} />);
    expect(html).toContain("Possível spam");
    expect(html).toContain("menos de 3 segundos");
    expect(html).toContain("<svg");
  });
});
