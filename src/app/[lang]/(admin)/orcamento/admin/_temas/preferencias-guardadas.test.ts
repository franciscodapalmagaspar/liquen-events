// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DENSIDADE_KEY,
  ORDEM_KEY,
  guardarDensidade,
  guardarOrdem,
  lerDensidade,
  lerOrdem,
} from "./preferencias-guardadas";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("a ordem e a densidade lembradas neste aparelho", () => {
  it("sem nada guardado, não há preferência", () => {
    expect(lerOrdem()).toBeNull();
    expect(lerDensidade()).toBeNull();
  });

  it("o que se guarda é o que se lê", () => {
    guardarOrdem("mais-usados");
    guardarDensidade("compacto");
    expect(window.localStorage.getItem(ORDEM_KEY)).toBe("mais-usados");
    expect(window.localStorage.getItem(DENSIDADE_KEY)).toBe("compacto");
    expect(lerOrdem()).toBe("mais-usados");
    expect(lerDensidade()).toBe("compacto");
  });

  it("lixo guardado (versão antiga, mexido à mão) vale «sem preferência»", () => {
    window.localStorage.setItem(ORDEM_KEY, "a-z");
    window.localStorage.setItem(DENSIDADE_KEY, '{"v":"compacto"}');
    expect(lerOrdem()).toBeNull();
    expect(lerDensidade()).toBeNull();
  });

  it("um localStorage que rebenta (janela privada, política) não deita o ecrã abaixo", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    expect(lerOrdem()).toBeNull();
    expect(lerDensidade()).toBeNull();
    expect(() => guardarOrdem("recentes")).not.toThrow();
    expect(() => guardarDensidade("confortavel")).not.toThrow();
  });
});
