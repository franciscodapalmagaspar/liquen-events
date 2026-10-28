import { describe, expect, it } from "vitest";
import { avaliarFoto, lugarDaChave } from "./qualidade-da-foto";

describe("esta foto vai ficar bem aqui? (ela, 28/10)", () => {
  it("uma foto do Pinterest é sempre má, mesmo que pareça grande", () => {
    const a = avaliarFoto(736, 1104, "tema");
    expect(a.nivel).toBe("ma");
    expect(a.motivo).toMatch(/Pinterest/);
  });

  it("mood board: conta o lado mais curto", () => {
    expect(avaliarFoto(700, 1050, "tema").nivel).toBe("ma");
    expect(avaliarFoto(1000, 1500, "tema").nivel).toBe("fraca");
    expect(avaliarFoto(1650, 2200, "tema").nivel).toBe("boa");
    // Deitada: o curto é a altura.
    expect(avaliarFoto(2200, 700, "tema").nivel).toBe("ma");
  });

  it("página inteira e capa: conta o lado maior", () => {
    expect(avaliarFoto(1100, 733, "pagina").nivel).toBe("ma");
    expect(avaliarFoto(1500, 1000, "pagina").nivel).toBe("fraca");
    expect(avaliarFoto(2200, 1467, "capa").nivel).toBe("boa");
  });

  it("a capa ao alto avisa, mas não é má se tiver pixéis", () => {
    const a = avaliarFoto(1467, 2200, "capa");
    expect(a.nivel).toBe("fraca");
    expect(a.motivo).toMatch(/ao alto/);
  });

  it("o motivo diz as medidas e o que se pede", () => {
    expect(avaliarFoto(900, 600, "capa").motivo).toBe(
      "É pequena para a capa (900 × 600 px; pede pelo menos 1200 px). Vai ficar desfocada.",
    );
  });

  it("sem medidas, não se inventa nada", () => {
    expect(avaliarFoto(0, 0, "capa")).toEqual({ nivel: "boa", motivo: null });
  });

  it("o sítio sai da chave do carregamento", () => {
    expect(lugarDaChave("board-2")).toBe("tema");
    expect(lugarDaChave("cover-0")).toBe("capa");
    expect(lugarDaChave("pagina-separador:1")).toBe("pagina");
  });
});
