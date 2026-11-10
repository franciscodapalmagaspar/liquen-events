import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ANGULOS_DO_FUNDO, BRILHOS_DO_FUNDO } from "./valores-do-fundo";

/**
 * A rota do fundo só desenha os brilhos e ângulos destas listas. Se o modelo
 * passar a pedir outro, a página recebia o mais próximo em vez do pedido —
 * este teste avisa antes.
 */
describe("os valores do fundo que o modelo pede estão na lista da rota", () => {
  const fonte = readFileSync(fileURLToPath(new URL("./modelo.ts", import.meta.url)), "utf8");
  const chamadas = [...fonte.matchAll(/\bfundo\(([\s\S]*?)\),?\n/g)].map((m) => m[1]);

  it("encontra as chamadas", () => {
    expect(chamadas.length).toBeGreaterThanOrEqual(4);
  });

  it("todos os brilhos e ângulos estão nas listas", () => {
    for (const c of chamadas) {
      for (const n of c.match(/-?\d+(?:\.\d+)?/g) ?? []) {
        const v = Number(n);
        if (v > 0 && v < 1) expect(BRILHOS_DO_FUNDO, c).toContain(v);
        else if (v < 0) expect(ANGULOS_DO_FUNDO, c).toContain(v);
      }
    }
  });
});
