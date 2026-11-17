import { describe, expect, it } from "vitest";
import { seleccionarComModificadores as sel } from "./seleccao-em-lista";

/**
 * A regra do ⇧+clique e do ⌘+clique das Tarefas (BO 4) — a mesma da grelha dos
 * Temas. A ordem é a do ecrã.
 */
const ORDEM = ["a", "b", "c", "d", "e"];

describe("seleccionarComModificadores", () => {
  it("⌘+clique soma uma e tira a mesma ao segundo", () => {
    const um = sel(new Set(), ORDEM, "c", null, false);
    expect([...um]).toEqual(["c"]);
    expect([...sel(um, ORDEM, "c", "c", false)]).toEqual([]);
  });

  it("⇧+clique estende da âncora até à linha clicada, nos dois sentidos", () => {
    expect([...sel(new Set(["b"]), ORDEM, "d", "b", true)].sort()).toEqual(["b", "c", "d"]);
    expect([...sel(new Set(["d"]), ORDEM, "b", "d", true)].sort()).toEqual(["b", "c", "d"]);
  });

  it("⇧+clique sobre uma já escolhida desmarca o intervalo (o sentido é o da clicada)", () => {
    const tudo = new Set(ORDEM);
    expect([...sel(tudo, ORDEM, "d", "b", true)].sort()).toEqual(["a", "e"]);
  });

  it("⇧+clique sem âncora, ou com âncora que já não está à vista, é um clique simples", () => {
    expect([...sel(new Set(), ORDEM, "c", null, true)]).toEqual(["c"]);
    expect([...sel(new Set(), ORDEM, "c", "z", true)]).toEqual(["c"]);
  });

  it("não muda o conjunto que recebeu", () => {
    const antes = new Set(["a"]);
    sel(antes, ORDEM, "b", "a", true);
    expect([...antes]).toEqual(["a"]);
  });
});
