import { describe, expect, it } from "vitest";
import type { StudioDoc } from "./documento-inicial";
import { idsTirados, move } from "./listas";

describe("move", () => {
  it("troca com o vizinho, sem mexer na lista original", () => {
    const l = ["a", "b", "c"];
    expect(move(l, 1, -1)).toEqual(["b", "a", "c"]);
    expect(move(l, 1, 1)).toEqual(["a", "c", "b"]);
    expect(l).toEqual(["a", "b", "c"]);
  });

  it("nas pontas devolve a MESMA lista (nada a redesenhar)", () => {
    const l = ["a", "b"];
    expect(move(l, 0, -1)).toBe(l);
    expect(move(l, 1, 1)).toBe(l);
  });
});

describe("idsTirados", () => {
  const grupo = (id: string, itens: string[]) =>
    ({
      id,
      title: id,
      items: itens.map((i) => ({ id: i, label: i })),
    }) as unknown as StudioDoc["serviceGroups"][number];

  it("diz os grupos e as linhas que saíram, e só esses", () => {
    const antes = [grupo("g1", ["a", "b"]), grupo("g2", ["c"])];
    const depois = [grupo("g1", ["a"])];
    expect(idsTirados(antes, depois).sort()).toEqual(["b", "c", "g2"]);
  });

  it("uma linha que mudou de grupo não saiu", () => {
    const antes = [grupo("g1", ["a"]), grupo("g2", [])];
    const depois = [grupo("g1", []), grupo("g2", ["a"])];
    expect(idsTirados(antes, depois)).toEqual([]);
  });
});
