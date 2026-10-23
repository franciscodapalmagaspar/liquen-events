import { describe, expect, it } from "vitest";
import {
  DISPOSICOES,
  FOTOS_DA_DISPOSICAO,
  composicao,
  disposicaoDoTema,
  repartir,
  type Caixa,
} from "./mosaico";

/** As caixas de uma composição não saem da folha nem se sobrepõem. */
const sobrepoem = (a: Caixa, b: Caixa) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("as composições pelo número de fotografias", () => {
  const aspectos = (n: number) =>
    Array.from({ length: n }, (_, i) => [1.5, 0.67, 1, 2.4, 0.4][i % 5]);

  it.each([
    [0, "texto"],
    [1, "inteira"],
    [2, "metades"],
    [3, "triptico"],
    [4, "tijolo"],
    [5, "tijolo"],
    [6, "mosaico"],
    [12, "mosaico"],
  ])("%i fotografias → %s", (n, tipo) => {
    expect(composicao(aspectos(n), false).tipo).toBe(tipo);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(
    "%i fotografias: uma célula por foto, dentro da folha, sem sobreposições",
    (n) => {
      for (const par of [false, true]) {
        const c = composicao(aspectos(n), par);
        if (c.tipo === "texto") continue;
        expect(c.celulas).toHaveLength(n);
        const todas = "mosaico" in c ? [...c.celulas, c.mosaico] : c.celulas;
        for (const [i, a] of todas.entries()) {
          expect(a.x).toBeGreaterThanOrEqual(0);
          expect(a.y).toBeGreaterThanOrEqual(0);
          expect(a.x + a.w).toBeLessThanOrEqual(1123.01);
          expect(a.y + a.h).toBeLessThanOrEqual(794.01);
          expect(a.w).toBeGreaterThan(20);
          for (const b of todas.slice(i + 1)) expect(sobrepoem(a, b)).toBe(false);
        }
      }
    },
  );

  it("a célula de texto (346 px, meia altura) alterna entre o canto de cima à esquerda e o da direita", () => {
    for (const n of [4, 5, 8, 12]) {
      const impar = composicao(aspectos(n), false);
      const par = composicao(aspectos(n), true);
      expect("mosaico" in impar && impar.mosaico).toMatchObject({ x: 0, y: 0, w: 346 });
      expect("mosaico" in par && par.mosaico).toMatchObject({ x: 1123 - 346, y: 0, w: 346 });
      expect("mosaico" in par && par.mosaico.h).toBeCloseTo((794 - 6) / 2);
    }
  });

  it("acima de doze, alterna mosaico (9) e tríptico (3), e o resto fecha", () => {
    expect(repartir(12)).toEqual([12]);
    expect(repartir(13)).toEqual([9, 4]);
    expect(repartir(16)).toEqual([9, 7]);
    expect(repartir(25)).toEqual([9, 3, 9, 4]);
  });
});

describe("a disposição à escolha (o pedido dela de 15/10)", () => {
  const aspectos = (n: number) =>
    Array.from({ length: n }, (_, i) => [1.5, 0.67, 1, 2.4, 0.4][i % 5]);

  for (const d of DISPOSICOES) {
    const { min, max } = FOTOS_DA_DISPOSICAO[d];
    it(`${d}: de ${min} a ${max} — uma célula por foto, dentro da folha, sem sobreposições`, () => {
      for (let n = min; n <= max; n++) {
        for (const par of [false, true]) {
          const c = composicao(aspectos(n), par, d);
          if (c.tipo === "texto") throw new Error("não devia ser texto");
          expect(c.celulas, `${d} ${n}`).toHaveLength(n);
          const todas = "mosaico" in c ? [...c.celulas, c.mosaico] : c.celulas;
          for (const [i, a] of todas.entries()) {
            expect(a.x).toBeGreaterThanOrEqual(0);
            expect(a.y).toBeGreaterThanOrEqual(0);
            expect(a.x + a.w).toBeLessThanOrEqual(1123.01);
            expect(a.y + a.h).toBeLessThanOrEqual(794.01);
            expect(a.w, `${d} ${n} célula ${i}`).toBeGreaterThan(40);
            expect(a.h).toBeGreaterThan(40);
            for (const b of todas.slice(i + 1)) expect(sobrepoem(a, b), `${d} ${n}`).toBe(false);
          }
        }
      }
    });
  }

  it("cada disposição desenha o seu tipo", () => {
    expect(composicao(aspectos(4), false, "uma-fila").tipo).toBe("fila");
    expect(composicao(aspectos(8), false, "tres-filas").tipo).toBe("filas");
    expect(composicao(aspectos(4), false, "soltas").tipo).toBe("desalinhadas");
    expect(composicao(aspectos(5), false, "destaque").tipo).toBe("destaque");
    expect(composicao(aspectos(6), false, "grelha").tipo).toBe("grelha");
    expect(composicao(aspectos(2), false, "texto-e-imagem").tipo).toBe("texto-e-imagem");
  });

  it("no destaque e na grelha a primeira célula (a ★) é a maior", () => {
    const area = (c: Caixa) => c.w * c.h;
    for (const d of ["destaque", "grelha"] as const) {
      for (let n = FOTOS_DA_DISPOSICAO[d].min; n <= FOTOS_DA_DISPOSICAO[d].max; n++) {
        const c = composicao(aspectos(n), false, d);
        if (c.tipo === "texto") continue;
        const [primeira, ...resto] = c.celulas;
        for (const o of resto) expect(area(primeira)).toBeGreaterThanOrEqual(area(o));
      }
    }
  });

  it("abaixo do mínimo, a página fica com a automática", () => {
    expect(composicao(aspectos(1), false, "soltas").tipo).toBe("inteira");
    expect(composicao(aspectos(5), false, "tres-filas").tipo).toBe("tijolo");
  });

  it("as cinco soltas são as do exemplo antigo, tal e qual", () => {
    const c = composicao(aspectos(5), false, "soltas");
    expect(c.tipo === "desalinhadas" && c.celulas).toEqual(
      [40, 96, 10, 120, 60].map((y, i) => ({ x: 98 + i * 188, y, w: 174, h: 270 })),
    );
  });

  it("acima do máximo, o tema reparte-se por mais páginas", () => {
    expect(repartir(7, "uma-fila")).toEqual([4, 3]);
    expect(repartir(9, "soltas")).toEqual([5, 4]);
    expect(repartir(12, "duas-filas")).toEqual([12]);
    expect(repartir(9, "texto-e-imagem")).toEqual([3, 3, 3]);
    // Uma disposição que não serve para tão poucas não reparte.
    expect(repartir(1, "soltas")).toEqual([1]);
  });

  it("um valor desconhecido gravado no tema é a automática", () => {
    expect(disposicaoDoTema({ disposicao: "uma-fila" })).toBe("uma-fila");
    expect(disposicaoDoTema({ disposicao: "filas" })).toBeNull();
    expect(disposicaoDoTema({})).toBeNull();
    expect(disposicaoDoTema(null)).toBeNull();
  });
});
