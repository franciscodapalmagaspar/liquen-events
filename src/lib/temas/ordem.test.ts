import { describe, expect, it } from "vitest";
import { ORDENS, lerDensidadeGuardada, lerOrdemGuardada } from "./ordem";

/**
 * O que vem do `localStorage` é dado cru: pode ser de uma versão antiga, ter
 * sido mexido à mão, ou nem ser texto. A regra lê-o UMA vez e devolve uma
 * ordem/densidade que existe — ou `null`, que é «sem preferência».
 */
describe("lerOrdemGuardada", () => {
  it("aceita as cinco ordens, tal e qual", () => {
    for (const { valor } of ORDENS) expect(lerOrdemGuardada(valor)).toBe(valor);
  });

  it("o que não é uma das cinco vale «sem preferência»", () => {
    for (const lixo of [
      null,
      undefined,
      "",
      "a-z",
      "Alfabetica",
      " alfabetica",
      "recentes ",
      3,
      {},
      [],
    ]) {
      expect(lerOrdemGuardada(lixo)).toBeNull();
    }
  });
});

describe("lerDensidadeGuardada", () => {
  it("aceita as duas densidades", () => {
    expect(lerDensidadeGuardada("confortavel")).toBe("confortavel");
    expect(lerDensidadeGuardada("compacto")).toBe("compacto");
  });

  it("o que não é uma das duas vale «sem preferência»", () => {
    for (const lixo of [null, undefined, "", "confortável", "COMPACTO", "denso", 1, true]) {
      expect(lerDensidadeGuardada(lixo)).toBeNull();
    }
  });
});
