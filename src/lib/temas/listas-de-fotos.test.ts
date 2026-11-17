import { describe, expect, it } from "vitest";
import type { ThemeImage } from "@/lib/theme-types";
import { mergePage, moveItem, reinsertAt } from "./listas-de-fotos";

// (Estes testes viviam no `Temas.test.tsx`; vieram para junto do que testam.)

const photo = (n: number): ThemeImage => ({
  path: `t1/foto-${n}.jpg`,
  url: `https://cdn.test/foto-${n}.jpg`,
});

describe("reordenar fotos à mão", () => {
  it("tira a foto de onde está e põe-na onde deve ficar", () => {
    expect(moveItem(["a", "b", "c", "d"], 2, 0)).toEqual(["c", "a", "b", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 0, 3)).toEqual(["b", "c", "d", "a"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("nunca perde nem duplica uma foto", () => {
    const list = ["a", "b", "c", "d", "e"];
    for (let from = 0; from < list.length; from++) {
      for (let to = 0; to < list.length; to++) {
        const moved = moveItem(list, from, to);
        expect([...moved].sort()).toEqual([...list].sort());
        expect(moved).toHaveLength(list.length);
      }
    }
  });

  it("devolve a lista intacta para índices fora dela", () => {
    const list = ["a", "b"];
    expect(moveItem(list, -1, 0)).toBe(list);
    expect(moveItem(list, 0, 5)).toBe(list);
  });
});

describe("ajudantes puros da grelha", () => {
  const a = photo(1);
  const b = photo(2);
  const c = photo(3);

  it("mergePage não duplica o que já está na grelha", () => {
    // Acontece de verdade: enquanto sobem fotos, a lista do servidor desloca-se
    // e a página seguinte pode trazer de volta alguma que já mostramos.
    expect(mergePage([a, b], [b, c])).toEqual([a, b, c]);
    expect(mergePage([], [a])).toEqual([a]);
  });

  it("mergePage ignora entradas sem caminho", () => {
    expect(mergePage([a], [{ path: "", url: "x" }])).toEqual([a]);
  });

  it("reinsertAt repõe cada foto no índice onde estava", () => {
    const positions = new Map([
      [a.path, 0],
      [b.path, 1],
      [c.path, 2],
    ]);
    expect(reinsertAt([b], [a, c], positions)).toEqual([a, b, c]);
  });

  it("reinsertAt não repete uma foto que já lá está", () => {
    const positions = new Map([[a.path, 0]]);
    expect(reinsertAt([a, b], [a], positions)).toEqual([a, b]);
  });

  it("reinsertAt aguenta um índice que já não existe na lista encolhida", () => {
    const positions = new Map([[c.path, 9]]);
    expect(reinsertAt([a], [c], positions)).toEqual([a, c]);
  });
});
