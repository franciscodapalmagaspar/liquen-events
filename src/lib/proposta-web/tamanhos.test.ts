import { describe, expect, it } from "vitest";
import { fatorParaCobrir, larguraDaDerivada, sizesParaCobrir, srcSetComLarguras } from "./tamanhos";

describe("as larguras reais das derivadas", () => {
  it("numa foto ao alto, a «1200» tem 800 de largura", () => {
    expect(larguraDaDerivada(1600, 2400, 1200)).toBe(800);
    expect(larguraDaDerivada(1600, 2400, 400)).toBe(267);
  });
  it("numa deitada, a largura é o lado", () => {
    expect(larguraDaDerivada(2200, 1467, 1200)).toBe(1200);
  });
  it("nunca amplia: uma foto pequena fica com a sua largura", () => {
    expect(larguraDaDerivada(736, 1104, 1200)).toBe(736);
  });
  it("sem medidas, fica o lado (o que estava antes)", () => {
    expect(larguraDaDerivada(undefined, undefined, 1200)).toBe(1200);
  });
  it("larguras repetidas ficam uma só — a primeira, a mais leve", () => {
    expect(
      srcSetComLarguras([
        { url: "a", largura: 400 },
        { url: "b", largura: 736 },
        { url: "c", largura: 736 },
        { url: undefined, largura: 900 },
      ]),
    ).toBe("a 400w, b 736w");
  });
});

describe("o `sizes` de um espaço que recorta", () => {
  it("a capa no telemóvel: uma foto deitada pede a altura × a forma", () => {
    const s = sizesParaCobrir(1.5, [{ vw: 1, vh: 1 }]);
    // Ecrã mais alto do que 3:2 → manda a altura: 150vh.
    expect(s).toBe("(max-aspect-ratio: 1500/1000) calc(150vh), 100vw");
  });
  it("por ecrã, do mais largo para o mais estreito", () => {
    const s = sizesParaCobrir(1, [
      { desde: 800, vw: 0.5, vh: 0.82 },
      { vw: 1, vh: 0.82 },
    ]);
    expect(s).toBe(
      "(min-width: 800px) and (max-aspect-ratio: 1640/1000) calc(82vh), (min-width: 800px) 50vw, (max-aspect-ratio: 820/1000) calc(82vh), 100vw",
    );
  });
  it("a folga do zoom entra nos dois lados", () => {
    expect(sizesParaCobrir(1, [{ vw: 1, vh: 1 }], 1.09)).toBe(
      "(max-aspect-ratio: 1000/1000) calc(109vh), 109vw",
    );
  });
  it("uma célula mais alta do que a foto pede a foto mais larga", () => {
    expect(fatorParaCobrir(1.5, 0.5)).toBe(3);
    expect(fatorParaCobrir(0.5, 1)).toBe(1);
  });
});
