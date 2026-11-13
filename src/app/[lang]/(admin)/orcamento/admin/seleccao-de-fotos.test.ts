import { describe, it, expect } from "vitest";
import { seguirASeleccao } from "./seleccao-de-fotos";

describe("a escolha das fotos segue a fotografia, e não a posição (13/11, n.º 8)", () => {
  const escolha = new Set(["0:1"]);
  const caminhos = new Map([["0:1", "q/b.jpg"]]);

  it("nada mudou: fica igual", () => {
    const r = seguirASeleccao(escolha, caminhos, [{ images: ["q/a.jpg", "q/b.jpg"] }]);
    expect(r.mudou).toBe(false);
    expect([...r.novas]).toEqual(["0:1"]);
  });

  it("reordenada: a escolha vai para a nova posição da MESMA fotografia", () => {
    const r = seguirASeleccao(escolha, caminhos, [{ images: ["q/b.jpg", "q/a.jpg"] }]);
    expect(r.mudou).toBe(true);
    expect([...r.novas]).toEqual(["0:0"]);
  });

  it("movida para outra página: vai atrás dela", () => {
    const r = seguirASeleccao(escolha, caminhos, [
      { images: ["q/a.jpg"] },
      { images: ["q/c.jpg", "q/b.jpg"] },
    ]);
    expect([...r.novas]).toEqual(["1:1"]);
  });

  it("apagada: sai da escolha (nunca passa a apontar para outra)", () => {
    const r = seguirASeleccao(escolha, caminhos, [{ images: ["q/a.jpg", "q/c.jpg"] }]);
    expect([...r.novas]).toEqual([]);
  });
});
