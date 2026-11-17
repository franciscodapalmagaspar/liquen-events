import { describe, expect, it } from "vitest";
import { pool } from "./concorrencia";

/** Uma tarefa que só acaba quando a mandam acabar. */
function porta() {
  let abrir!: () => void;
  const aberta = new Promise<void>((r) => (abrir = r));
  return { aberta, abrir };
}

describe("pool", () => {
  it("nunca tem mais do que `limit` em voo, e faz todos", async () => {
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
    expect(maximo).toBe(3);
    expect([...feitos].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("começa-os pela ordem em que vêm", async () => {
    const comecados: number[] = [];
    await pool([1, 2, 3, 4], 2, async (n) => {
      comecados.push(n);
    });
    expect(comecados).toEqual([1, 2, 3, 4]);
  });

  it("`stop` trava o que ainda não começou, sem cortar o que vai a caminho", async () => {
    const p = porta();
    let parar = false;
    const comecados: number[] = [];
    const acabados: number[] = [];
    const corrida = pool(
      [1, 2, 3, 4],
      1,
      async (n) => {
        comecados.push(n);
        if (n === 1) await p.aberta;
        acabados.push(n);
      },
      () => parar,
    );
    parar = true;
    p.abrir();
    await corrida;
    expect(comecados).toEqual([1]);
    expect(acabados).toEqual([1]);
  });

  it("uma lista vazia não arranca ninguém", async () => {
    let chamadas = 0;
    await pool([], 4, async () => {
      chamadas += 1;
    });
    expect(chamadas).toBe(0);
  });

  it("um tecto maior do que a lista não cria corredores a mais", async () => {
    let emVoo = 0;
    let maximo = 0;
    await pool([1, 2], 10, async () => {
      emVoo += 1;
      maximo = Math.max(maximo, emVoo);
      await Promise.resolve();
      emVoo -= 1;
    });
    expect(maximo).toBe(2);
  });
});
