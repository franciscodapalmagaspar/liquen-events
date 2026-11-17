import { describe, expect, it } from "vitest";
import { comLimite } from "./com-limite";

/** As escritas de um lote vão N de cada vez (revisão · 3 do BO 4). */
describe("comLimite", () => {
  it("nunca tem mais de `limite` no ar, e devolve pela ordem dos itens", async () => {
    let noAr = 0;
    let maximo = 0;
    const r = await comLimite([5, 1, 4, 2, 3, 1, 2, 5, 1], 4, async (ms, i) => {
      noAr++;
      maximo = Math.max(maximo, noAr);
      await new Promise((ok) => setTimeout(ok, ms));
      noAr--;
      return i * 10;
    });
    expect(maximo).toBe(4);
    expect(r).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80]);
  });

  it("com menos itens do que o limite, corre-os todos, e com nenhum não faz nada", async () => {
    expect(await comLimite([1, 2], 4, async (x) => x * 2)).toEqual([2, 4]);
    expect(await comLimite([], 4, async (x) => x)).toEqual([]);
  });

  it("um item que rejeita não derruba o lote: fica `null`, e os outros chegam", async () => {
    const r = await comLimite([1, 2, 3], 2, async (x) => {
      if (x === 2) throw new Error("recusado");
      return x * 10;
    });
    expect(r).toEqual([10, null, 30]);
  });
});
