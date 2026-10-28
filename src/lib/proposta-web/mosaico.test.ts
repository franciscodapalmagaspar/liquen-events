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

/**
 * Ela (28/10): «há aqui muitas fotos… que nem dá para ver… porque devia estar
 * na vertical ou na horizontal». O acerto da última linha punha uma ao alto
 * numa célula «larga» (2:1) e uma deitada numa «alta» (1:2).
 */
describe("cada foto numa célula da sua forma", () => {
  const AO_ALTO = 0.85;
  const DEITADA = 1.3;
  const contraForma = (aspectos: number[], m: ReturnType<typeof mosaicoDoCapitulo>) => {
    let erradas = 0;
    for (const c of m) {
      if (c.indice === undefined) continue;
      const a = aspectos[c.indice];
      for (const f of [c.forma, c.formaMovel]) {
        if (a < AO_ALTO && f === "larga") erradas++;
        if (a > DEITADA && f === "alta") erradas++;
      }
    }
    return erradas;
  };

  it("em 300 capítulos ao acaso, quase nunca uma foto contra a sua forma — e sem buracos", () => {
    let erradas = 0;
    let fotos = 0;
    for (let s = 1; s <= 300; s++) {
      const aspectos = formas(1 + (s % 13), s);
      const m = mosaicoDoCapitulo(aspectos);
      expect(buracos(m, 4)).toBe(0);
      expect(
        buracos(
          m.map((c) => ({ ...c, forma: c.formaMovel })),
          2,
        ),
      ).toBe(0);
      erradas += contraForma(aspectos, m);
      fotos += aspectos.length;
    }
    // O último recurso (crescer como antes, para não deixar um buraco) ainda
    // existe; mede-se para não voltar a ser a regra.
    expect(erradas / fotos).toBeLessThan(0.02);
  });

  it("a célula de texto cresce primeiro, antes de qualquer fotografia", () => {
    // Três ao alto + texto: falta fechar a linha de 4.
    const m = mosaicoDoCapitulo([0.66, 0.66, 0.66, 1.0, 1.0]);
    const texto = m.find((c) => c.tipo === "texto")!;
    expect(contraForma([0.66, 0.66, 0.66, 1.0, 1.0], m)).toBe(0);
    expect(buracos(m, 4)).toBe(0);
    expect(texto).toBeDefined();
  });

  it("a «grande» só leva fotografias com pixéis para ela", () => {
    for (let s = 1; s <= 200; s++) {
      const aspectos = formas(2 + (s % 9), s);
      const curtos = aspectos.map((_, i) => (i % 2 === 0 ? 736 : 2000));
      const m = mosaicoDoCapitulo(aspectos, true, curtos);
      for (const c of m)
        if (c.forma === "grande" && c.indice !== undefined)
          expect(curtos[c.indice], `s=${s}`).toBeGreaterThanOrEqual(1100);
    }
  });
});
