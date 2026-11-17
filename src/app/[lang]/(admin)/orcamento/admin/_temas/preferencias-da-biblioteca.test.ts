// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DENSIDADE_KEY,
  guardarDensidade,
  guardarOrdem,
  lerDensidade,
  lerOrdem,
  ORDEM_KEY,
} from "./preferencias-da-biblioteca";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

/** Um `localStorage` que lança — janela privada, política do browser. */
function storageQueLanca() {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
}

describe("a ordem lembrada", () => {
  it("vazio: não há preferência", () => {
    expect(lerOrdem()).toBeNull();
  });

  it("guarda e volta a ler", () => {
    guardarOrdem("recentes");
    expect(lerOrdem()).toBe("recentes");
  });

  it("lixo, ou o valor de uma versão antiga, vale como «não há preferência»", () => {
    for (const v of ["", "A-Z", "az", '"recentes"', "null", "alfabetica "]) {
      window.localStorage.setItem(ORDEM_KEY, v);
      expect(lerOrdem(), JSON.stringify(v)).toBeNull();
    }
  });

  it("um `localStorage` que lança não deita o ecrã abaixo", () => {
    storageQueLanca();
    expect(lerOrdem()).toBeNull();
    expect(() => guardarOrdem("fotos")).not.toThrow();
  });
});

describe("a densidade lembrada", () => {
  it("guarda e volta a ler as duas", () => {
    guardarDensidade("compacto");
    expect(lerDensidade()).toBe("compacto");
    guardarDensidade("confortavel");
    expect(lerDensidade()).toBe("confortavel");
  });

  it("lixo vale como «não há preferência»", () => {
    for (const v of ["", "compact", "COMPACTO", "1"]) {
      window.localStorage.setItem(DENSIDADE_KEY, v);
      expect(lerDensidade(), v).toBeNull();
    }
  });

  it("um `localStorage` que lança não deita o ecrã abaixo", () => {
    storageQueLanca();
    expect(lerDensidade()).toBeNull();
    expect(() => guardarDensidade("compacto")).not.toThrow();
  });
});
