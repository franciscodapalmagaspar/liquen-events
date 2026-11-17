import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MINIMO_MS } from "@/lib/anti-spam/tempo-minimo";
import { EtiquetaPossivelSpam } from "./EtiquetaPossivelSpam";

describe("a etiqueta «Possível spam»", () => {
  it("sem marca não desenha nada", () => {
    expect(renderToStaticMarkup(<EtiquetaPossivelSpam valor={undefined} />)).toBe("");
    expect(renderToStaticMarkup(<EtiquetaPossivelSpam valor={{ motivo: "inventado" }} />)).toBe("");
    // Nem a caixa à volta (a margem é da própria etiqueta): um `{}` gravado não
    // deixa um espaço vazio por baixo do e-mail.
    expect(renderToStaticMarkup(<EtiquetaPossivelSpam valor={{}} className="mt-1 block" />)).toBe(
      "",
    );
  });

  it("com marca diz a palavra e o porquê (não só a cor)", () => {
    const html = renderToStaticMarkup(<EtiquetaPossivelSpam valor={{ motivo: "depressa" }} />);
    expect(html).toContain("Possível spam");
    // O número vem do mesmo sítio que a regra (`tempo-minimo.ts`).
    expect(html).toContain(`menos de ${MINIMO_MS / 1000} segundos`);
    expect(html).toContain("<svg");
  });
});
