import { describe, expect, it } from "vitest";
import type { ThemeSummary } from "@/lib/theme-types";
import { contarFotosDaBiblioteca, ordenarTemas, temPoucasFotos } from "./ordem";

const T0 = "2026-01-01T00:00:00.000Z";
const THEME: ThemeSummary = {
  id: "t1",
  name: "Terracotta",
  notes: "",
  createdAt: T0,
  updatedAt: T0,
  imageCount: 0,
};

describe("ordenarTemas — a ordem dos cartões", () => {
  const tema = (over: Partial<ThemeSummary>): ThemeSummary => ({ ...THEME, ...over });
  const nomes = (lista: ThemeSummary[]) => lista.map((t) => t.name);

  const A = tema({ id: "a", name: "Alfa", updatedAt: "2026-01-01T00:00:00.000Z", imageCount: 5 });
  const B = tema({ id: "b", name: "Beta", updatedAt: "2026-06-01T00:00:00.000Z", imageCount: 1 });
  const C = tema({ id: "c", name: "Gama", updatedAt: "2026-03-01T00:00:00.000Z", imageCount: 9 });

  it("A–Z, por data e por nº de fotos", () => {
    expect(nomes(ordenarTemas([C, A, B], "alfabetica"))).toEqual(["Alfa", "Beta", "Gama"]);
    expect(nomes(ordenarTemas([A, B, C], "recentes"))).toEqual(["Beta", "Gama", "Alfa"]);
    expect(nomes(ordenarTemas([A, B, C], "fotos"))).toEqual(["Gama", "Alfa", "Beta"]);
  });

  /**
   * O que FIXAR quer dizer: um tema que se usa em quase todas as propostas não
   * pode mudar de sítio porque se ordenou por data. Sem isto, "fixar" era só
   * uma estrela desenhada.
   */
  it("um favorito vem à frente seja qual for a ordem", () => {
    const fixado = { ...C, favorito: true };
    for (const ordem of ["alfabetica", "recentes", "fotos"] as const) {
      expect(nomes(ordenarTemas([A, B, fixado], ordem))[0]).toBe("Gama");
    }
  });

  /**
   * Uma pasta ilegível não sabe quantas fotos tem. Contá-la como zero punha-a
   * atrás de um tema com uma foto — ou seja, escondia no fim da lista
   * precisamente o tema que tem um problema.
   */
  it("uma pasta por ler fica no fim de 'com mais fotos', não à frente do 1 foto", () => {
    const ilegivel = tema({ id: "x", name: "Xis", imageCount: null });
    expect(nomes(ordenarTemas([ilegivel, B], "fotos"))).toEqual(["Beta", "Xis"]);
  });

  it("não mexe na lista que recebe", () => {
    const original = [C, A, B];
    ordenarTemas(original, "alfabetica");
    expect(nomes(original)).toEqual(["Gama", "Alfa", "Beta"]);
  });
});

describe("contarFotosDaBiblioteca", () => {
  const t = (imageCount: number | null) => ({ imageCount }) as never;

  it("soma as fotos e conta os temas", () => {
    expect(contarFotosDaBiblioteca([t(10), t(4), t(0)])).toEqual({
      fotos: 14,
      temas: 3,
      ilegiveis: 0,
      porContar: 0,
    });
  });

  it("uma pasta ilegível NÃO conta como zero — conta como desconhecida", () => {
    // Somá-la a zero em silêncio dava uma biblioteca mais pequena do que é, e
    // é assim que alguém conclui que faltam fotos e as volta a carregar.
    expect(contarFotosDaBiblioteca([t(10), t(null), t(4)])).toEqual({
      fotos: 14,
      temas: 3,
      ilegiveis: 1,
      porContar: 0,
    });
  });

  it("aguenta uma biblioteca vazia", () => {
    expect(contarFotosDaBiblioteca([])).toEqual({
      fotos: 0,
      temas: 0,
      ilegiveis: 0,
      porContar: 0,
    });
  });

  it("um tema por contar (milhares de temas, 9/11) não é uma pasta ilegível", () => {
    // Acima de 150 temas, a contagem dos últimos chega depois: até lá o tema
    // está «por contar», e o total diz-se como mínimo — nunca como avaria.
    const porContar = { imageCount: null, resumoPendente: true } as never;
    expect(contarFotosDaBiblioteca([t(10), porContar, t(4)])).toEqual({
      fotos: 14,
      temas: 3,
      ilegiveis: 0,
      porContar: 1,
    });
  });
});

describe("temPoucasFotos", () => {
  it("avisa abaixo de três — o que não chega para ESCOLHER", () => {
    expect(temPoucasFotos({ imageCount: 0 })).toBe(true);
    expect(temPoucasFotos({ imageCount: 2 })).toBe(true);
    expect(temPoucasFotos({ imageCount: 3 })).toBe(false);
    expect(temPoucasFotos({ imageCount: 40 })).toBe(false);
  });

  it("cala-se quando não se sabe quantas são", () => {
    // Um aviso a partir do que não se sabe é um aviso errado.
    expect(temPoucasFotos({ imageCount: null })).toBe(false);
  });
});
