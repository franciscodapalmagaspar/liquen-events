import { describe, expect, it } from "vitest";
import { esperaDaCopiaDeFotos, esperaDaTraducao } from "./esperas";

describe("quanto tempo se diz que vai demorar", () => {
  it.each([
    [0, 2_300],
    [1, 2_300],
    [50, 2_300],
    [51, 3_800],
    [150, 5_300],
    [-3, 2_300],
  ])("traduzir %i campos: %i ms (um lote de 50 por pedido)", (campos, ms) => {
    expect(esperaDaTraducao(campos)).toBe(ms);
  });

  it.each([
    [0, 2_400],
    [8, 2_400],
    [9, 3_900],
    [24, 5_400],
  ])("copiar %i fotografias: %i ms (oito de cada vez)", (fotos, ms) => {
    expect(esperaDaCopiaDeFotos(fotos)).toBe(ms);
  });
});
