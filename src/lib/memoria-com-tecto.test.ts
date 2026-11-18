import { describe, it, expect } from "vitest";
import { MemoriaComTecto } from "./memoria-com-tecto";

describe("MemoriaComTecto — cheia, esquece só a usada há mais tempo", () => {
  it("guarda e lê", () => {
    const m = new MemoriaComTecto<string, boolean>(2);
    m.guardar("a", false);
    expect(m.ler("a")).toBe(false);
    expect(m.ler("b")).toBeUndefined();
    expect(m.tem("a")).toBe(true);
  });

  it("no tecto, sai a mais antiga — e não todas de uma vez", () => {
    const m = new MemoriaComTecto<string, number>(2);
    m.guardar("a", 1);
    m.guardar("b", 2);
    m.guardar("c", 3);
    expect(m.tamanho).toBe(2);
    expect(m.tem("a")).toBe(false);
    expect(m.ler("b")).toBe(2);
    expect(m.ler("c")).toBe(3);
  });

  it("ler uma entrada torna-a a mais recente", () => {
    const m = new MemoriaComTecto<string, number>(2);
    m.guardar("a", 1);
    m.guardar("b", 2);
    m.ler("a");
    m.guardar("c", 3);
    expect(m.tem("a")).toBe(true);
    expect(m.tem("b")).toBe(false);
  });

  it("guardar outra vez a mesma chave não ocupa dois lugares", () => {
    const m = new MemoriaComTecto<string, number>(2);
    m.guardar("a", 1);
    m.guardar("a", 2);
    m.guardar("b", 3);
    expect(m.ler("a")).toBe(2);
    expect(m.tamanho).toBe(2);
  });

  it("um tecto que não faz sentido recusa-se", () => {
    expect(() => new MemoriaComTecto(0)).toThrow(RangeError);
  });
});
