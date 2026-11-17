import { describe, it, expect } from "vitest";
import { todosOsValores } from "./todos-os-valores";

type Cor = "verde" | "azul" | "ocre";

describe("todosOsValores", () => {
  it("devolve a própria lista, tal e qual", () => {
    const cores = todosOsValores<Cor>()(["verde", "azul", "ocre"]);
    expect(cores).toEqual(["verde", "azul", "ocre"]);
  });

  it("não compila com um valor a menos nem com um a mais (prova-o o `tsc`)", () => {
    // @ts-expect-error — falta «ocre»
    todosOsValores<Cor>()(["verde", "azul"]);
    // @ts-expect-error — «roxo» não é uma Cor
    todosOsValores<Cor>()(["verde", "azul", "ocre", "roxo"]);
    expect(true).toBe(true);
  });
});
