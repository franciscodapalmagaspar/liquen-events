import { describe, expect, it } from "vitest";
import { esperaPorElaParaGravar } from "./leitura-da-abertura";

describe("esperaPorElaParaGravar", () => {
  it("com a leitura a caminho e sem gesto, não grava sozinho", () => {
    expect(esperaPorElaParaGravar("a-caminho", false)).toBe(true);
  });

  it("com a leitura falhada e sem gesto, não grava sozinho (seria às cegas)", () => {
    expect(esperaPorElaParaGravar("falhou", false)).toBe(true);
  });

  it("ao primeiro gesto dela, grava — mesmo sem leitura", () => {
    expect(esperaPorElaParaGravar("a-caminho", true)).toBe(false);
    expect(esperaPorElaParaGravar("falhou", true)).toBe(false);
  });

  it("com a leitura feita, grava como sempre", () => {
    expect(esperaPorElaParaGravar("lida", false)).toBe(false);
    expect(esperaPorElaParaGravar("lida", true)).toBe(false);
  });
});
