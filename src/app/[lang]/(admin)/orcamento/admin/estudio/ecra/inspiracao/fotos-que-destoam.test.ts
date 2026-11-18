import { describe, expect, it } from "vitest";
import { fraseDasFotosQueDestoam } from "./fotos-que-destoam";

describe("fraseDasFotosQueDestoam", () => {
  it("nenhuma a destoar, nada a dizer", () => {
    expect(fraseDasFotosQueDestoam([])).toBeNull();
  });

  it("uma só, no singular e a contar do um", () => {
    expect(fraseDasFotosQueDestoam([0])).toBe("A 1.ª fotografia destoa da paleta desta página.");
  });

  it("várias, por ordem, com «e a» antes da última", () => {
    expect(fraseDasFotosQueDestoam([4, 1])).toBe(
      "A 2.ª e a 5.ª fotografias destoam da paleta desta página.",
    );
    expect(fraseDasFotosQueDestoam([6, 2, 0])).toBe(
      "A 1.ª, a 3.ª e a 7.ª fotografias destoam da paleta desta página.",
    );
  });

  it("nomeia no máximo as três primeiras que o detector devolveu", () => {
    expect(fraseDasFotosQueDestoam([9, 8, 7, 0])).toBe(
      "A 8.ª, a 9.ª e a 10.ª fotografias destoam da paleta desta página.",
    );
  });

  it("não mexe na lista que recebe", () => {
    const fora = [3, 1];
    fraseDasFotosQueDestoam(fora);
    expect(fora).toEqual([3, 1]);
  });
});
