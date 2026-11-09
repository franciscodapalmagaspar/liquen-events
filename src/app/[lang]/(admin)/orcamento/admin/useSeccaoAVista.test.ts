import { describe, expect, it } from "vitest";
import { caixaNaLinha } from "./useSeccaoAVista";

describe("caixaNaLinha — a secção que está a ser lida", () => {
  const caixas = [
    { id: "evento", topo: -400, fundo: 200 },
    { id: "capas", topo: 220, fundo: 600 },
    { id: "servicos", topo: 620, fundo: 1400 },
  ];

  it("é a que atravessa a linha", () => {
    expect(caixaNaLinha(caixas, 100)).toBe("evento");
    expect(caixaNaLinha(caixas, 300)).toBe("capas");
    expect(caixaNaLinha(caixas, 900)).toBe("servicos");
  });

  it("no intervalo entre duas, fica a que já passou", () => {
    expect(caixaNaLinha(caixas, 210)).toBe("evento");
  });

  it("antes da primeira, a primeira; sem caixas, nenhuma", () => {
    expect(caixaNaLinha([{ id: "a", topo: 500, fundo: 900 }], 100)).toBe("a");
    expect(caixaNaLinha([], 100)).toBeNull();
  });

  it("não depende da ordem em que chegam", () => {
    expect(caixaNaLinha([...caixas].reverse(), 300)).toBe("capas");
  });
});
