import { describe, expect, it } from "vitest";
import { falta, mosaicoDoCapitulo } from "./mosaico";

/** Um gerador pequeno e repetível de formas. */
function formas(n: number, semente: number): number[] {
  let x = semente;
  return Array.from({ length: n }, () => {
    x = (x * 9301 + 49297) % 233280;
    return [0.67, 0.75, 1, 1.33, 1.5, 0.8, 1.78][x % 7];
  });
}

describe("o mosaico de um capítulo", () => {
  it("no telemóvel (2 colunas) as linhas ficam sempre completas", () => {
    for (let n = 2; n <= 30; n++)
      for (let s = 1; s <= 12; s++) {
        const m = mosaicoDoCapitulo(formas(n, s)).map((c) => ({ forma: c.formaMovel }));
        expect(falta(m, 2), `n=${n} s=${s}`).toBe(0);
      }
  });

  it("tem uma célula de texto, em terceiro lugar", () => {
    const m = mosaicoDoCapitulo([1, 1, 1, 1]);
    expect(m.filter((c) => c.tipo === "texto")).toHaveLength(1);
    expect(m[2].tipo).toBe("texto");
  });

  it("todas as fotografias entram, pela ordem dada", () => {
    const m = mosaicoDoCapitulo(formas(11, 3));
    expect(m.filter((c) => c.tipo === "foto").map((c) => c.indice)).toEqual(
      Array.from({ length: 11 }, (_, i) => i),
    );
  });

  it("uma ao alto ocupa duas linhas (uma sim, outra não); uma deitada, duas colunas", () => {
    const m = mosaicoDoCapitulo([0.67, 0.67, 1.78, 1, 1, 1, 1], true);
    const porIndice = (i: number) => m.find((c) => c.indice === i)!.forma;
    expect(porIndice(0)).toBe("alta");
    expect(porIndice(1)).toBe("normal");
    expect(porIndice(2)).toBe("larga");
  });

  it("sem fotografias e sem texto, não há mosaico", () => {
    expect(mosaicoDoCapitulo([], false)).toEqual([]);
  });
});

import { buracos } from "./mosaico";

describe("o mosaico não tem buracos", () => {
  it("nem a 4 colunas nem a 2, e a última linha de 4 fica completa sempre que dá", () => {
    let completas = 0;
    let casos = 0;
    for (let n = 1; n <= 24; n++)
      for (let s = 1; s <= 10; s++) {
        const m = mosaicoDoCapitulo(formas(n, s));
        expect(buracos(m, 4), `4 col n=${n} s=${s}`).toBe(0);
        expect(
          buracos(
            m.map((c) => ({ forma: c.formaMovel })),
            2,
          ),
          `2 col n=${n} s=${s}`,
        ).toBe(0);
        casos++;
        if (falta(m, 4) === 0) completas++;
      }
    // Quase sempre completa; quando não dá sem abrir buracos, fica a linha curta.
    expect(completas / casos).toBeGreaterThan(0.95);
  });

  it("o caso do 1.º capítulo do teste: deitada, alta, texto, alta, deitada", () => {
    const m = mosaicoDoCapitulo([1.5, 0.75, 0.75, 1.5]);
    expect(buracos(m, 4)).toBe(0);
    expect(
      buracos(
        m.map((c) => ({ forma: c.formaMovel })),
        2,
      ),
    ).toBe(0);
  });
});
