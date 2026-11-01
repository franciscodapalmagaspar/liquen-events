import { describe, it, expect } from "vitest";
import { proximaTroca, type Troca } from "./galeria-do-servico";

const seis = ["a", "b", "c", "d", "e", "f"];

describe("proximaTroca (a grelha que vai trocando)", () => {
  it("troca UMA posição pela primeira da fila, e a que sai vai para o fim", () => {
    const t = proximaTroca(seis, ["g", "h"], null, () => 0)!;
    expect(t.posicao).toBe(0);
    expect(t.entra).toBe("g");
    expect(t.fila).toEqual(["h", "a"]);
  });

  it("nunca troca a mesma posição duas vezes seguidas", () => {
    for (let k = 0; k < 50; k++) {
      const r = k / 50;
      const t = proximaTroca(seis, ["g"], 3, () => r)!;
      expect(t.posicao).not.toBe(3);
    }
  });

  it("chega a todas as outras posições", () => {
    const vistas = new Set<number>();
    for (let k = 0; k < 5; k++) vistas.add(proximaTroca(seis, ["g"], 0, () => k / 5)!.posicao);
    expect([...vistas].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("sem fila (um serviço com seis fotografias só) não troca nada", () => {
    expect(proximaTroca(seis, [], null)).toBeNull();
  });

  it("dá a volta: com 12 de fora, cada fotografia só volta depois das outras", () => {
    let visiveis = [...seis];
    let fila = ["g", "h", "i", "j", "k", "l"];
    const entradas: string[] = [];
    let ultima: number | null = null;
    for (let k = 0; k < 6; k++) {
      const t: Troca = proximaTroca(visiveis, fila, ultima, () => (k * 0.37) % 1)!;
      entradas.push(t.entra);
      visiveis = visiveis.map((s, i) => (i === t.posicao ? t.entra : s));
      fila = t.fila;
      ultima = t.posicao;
    }
    expect(entradas).toEqual(["g", "h", "i", "j", "k", "l"]);
  });
});
