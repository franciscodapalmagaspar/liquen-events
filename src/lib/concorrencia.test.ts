import { describe, expect, it } from "vitest";
import { pool } from "./concorrencia";

describe("pool", () => {
  it("corre tudo, nunca com mais do que o tecto em voo", async () => {
    let emVoo = 0;
    let maximo = 0;
    const feitos: number[] = [];
    await pool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      emVoo += 1;
      maximo = Math.max(maximo, emVoo);
      await new Promise((r) => setTimeout(r, 1));
      feitos.push(n);
      emVoo -= 1;
    });
    expect([...feitos].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(maximo).toBe(3);
  });

  it("começa pela ordem em que vêm", async () => {
    const comecados: number[] = [];
    await pool([1, 2, 3, 4], 1, async (n) => {
      comecados.push(n);
    });
    expect(comecados).toEqual([1, 2, 3, 4]);
  });

  it("o stop trava o que ainda não começou, sem cortar o que já vai a caminho", async () => {
    const feitos: number[] = [];
    let parar = false;
    await pool(
      [1, 2, 3, 4, 5],
      2,
      async (n) => {
        if (n === 2) parar = true;
        await new Promise((r) => setTimeout(r, 1));
        feitos.push(n);
      },
      () => parar,
    );
    expect([...feitos].sort()).toEqual([1, 2]);
  });

  it("uma lista vazia não corre nada", async () => {
    let chamadas = 0;
    await pool([], 4, async () => {
      chamadas += 1;
    });
    expect(chamadas).toBe(0);
  });
});
