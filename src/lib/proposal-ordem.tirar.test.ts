import { describe, expect, it } from "vitest";
import { mesmaRubrica, temasQueSaemComAsLinhas } from "./proposal-ordem";

describe("tirar a linha tira o mood board dela (12/11)", () => {
  const boards = [
    { title: "Decoração Cerimónia " },
    { title: "Decor Cocktail" },
    { title: "Decoração e Decor Floral Jantar " },
    { title: "Seating Plan" },
    { title: "Complementos dos Noivos " },
  ];
  const ficam = [
    "Decoração Casamento ",
    "Decor Floral Cerimónia ",
    "Decoração e Decor Floral Jantar ",
    "Seating Plan ",
    "Complementos dos Noivos ",
  ];

  it("a linha «Coctail» (com o erro dela) leva o «Decor Cocktail»", () => {
    expect(temasQueSaemComAsLinhas(["Coctail"], ficam, boards)).toEqual([1]);
  });

  it("um mood board que ainda casa com uma linha que fica, fica", () => {
    expect(temasQueSaemComAsLinhas(["Jantar"], ficam, boards)).toEqual([]);
  });

  it("tirar o «Seating Plan» leva o mood board «Seating Plan»", () => {
    const semSeating = ficam.filter((r) => !r.startsWith("Seating"));
    expect(temasQueSaemComAsLinhas(["Seating Plan "], semSeating, boards)).toEqual([3]);
  });

  it("uma linha sem nome que distinga («Decoração», vazia) não leva nada", () => {
    expect(temasQueSaemComAsLinhas(["Decoração", ""], [], boards)).toEqual([]);
  });

  it("não casa palavras diferentes por uma letra quando são curtas", () => {
    expect(mesmaRubrica("Bar", "Bolo")).toBe(false);
    expect(mesmaRubrica("Mesa", "Mesas")).toBe(false);
    expect(mesmaRubrica("Seatting plan", "Seating Plan")).toBe(true);
    expect(mesmaRubrica("Complementos", "Complementos dos Noivos")).toBe(true);
    expect(mesmaRubrica("Cerimónia", "Jantar")).toBe(false);
  });
});
