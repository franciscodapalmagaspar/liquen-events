import { describe, expect, it } from "vitest";
import { juntarAosVistos, lerVistos, VISTOS_NO_MAXIMO } from "./vistos-recentemente";

const visto = (id: string) => ({ id, name: `Nome ${id}`, email: `${id}@x.pt`, status: "pendente" });

describe("vistos recentemente", () => {
  it("lê a lista guardada", () => {
    expect(lerVistos(JSON.stringify([visto("a"), visto("b")]))).toEqual([visto("a"), visto("b")]);
  });

  it("um texto vazio, estragado ou que não é uma lista dá a lista vazia", () => {
    for (const texto of [null, "", "{", "null", "42", '{"id":"a"}', '"a"'])
      expect(lerVistos(texto)).toEqual([]);
  });

  it("deixa de fora as entradas sem a forma certa", () => {
    const texto = JSON.stringify([
      visto("a"),
      null,
      { id: "" },
      { id: 3, name: "x" },
      "b",
      visto("c"),
    ]);
    expect(lerVistos(texto)).toEqual([visto("a"), visto("c")]);
  });

  it("nunca passa do tecto, nem ao ler", () => {
    const muitos = Array.from({ length: 10 }, (_, i) => visto(String(i)));
    expect(lerVistos(JSON.stringify(muitos))).toHaveLength(VISTOS_NO_MAXIMO);
  });

  it("o pedido aberto vai para a cabeça, sem se repetir, até ao tecto", () => {
    const antes = ["a", "b", "c", "d", "e", "f"].map(visto);
    expect(juntarAosVistos(antes, visto("c")).map((v) => v.id)).toEqual([
      "c",
      "a",
      "b",
      "d",
      "e",
      "f",
    ]);
    expect(juntarAosVistos(antes, visto("z")).map((v) => v.id)).toEqual([
      "z",
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    expect(juntarAosVistos([], visto("a"))).toEqual([visto("a")]);
  });
});
