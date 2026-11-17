import { describe, expect, it } from "vitest";
import { fotoPelaTecla } from "./temas-grelha";

// 10 fotos em 4 colunas:
//  0 1 2 3
//  4 5 6 7
//  8 9
describe("fotoPelaTecla", () => {
  it("as setas andam na linha e na coluna", () => {
    expect(fotoPelaTecla(5, "ArrowLeft", 4, 10)).toBe(4);
    expect(fotoPelaTecla(5, "ArrowRight", 4, 10)).toBe(6);
    expect(fotoPelaTecla(5, "ArrowUp", 4, 10)).toBe(1);
    expect(fotoPelaTecla(5, "ArrowDown", 4, 10)).toBe(9);
  });
  it("nas pontas não sai da grelha", () => {
    expect(fotoPelaTecla(0, "ArrowLeft", 4, 10)).toBeNull();
    expect(fotoPelaTecla(9, "ArrowRight", 4, 10)).toBeNull();
    expect(fotoPelaTecla(1, "ArrowUp", 4, 10)).toBeNull();
    expect(fotoPelaTecla(7, "ArrowDown", 4, 10)).toBeNull(); // não há foto 11
  });
  it("Home/End vão ao início e ao fim da linha; com ⌘, ao início e ao fim de tudo", () => {
    expect(fotoPelaTecla(6, "Home", 4, 10)).toBe(4);
    expect(fotoPelaTecla(5, "End", 4, 10)).toBe(7);
    expect(fotoPelaTecla(8, "End", 4, 10)).toBe(9); // a última linha é curta
    expect(fotoPelaTecla(6, "Home", 4, 10, true)).toBe(0);
    expect(fotoPelaTecla(2, "End", 4, 10, true)).toBe(9);
  });
  it("PageUp/PageDown saltam três linhas, sem sair", () => {
    expect(fotoPelaTecla(1, "PageDown", 4, 30)).toBe(13);
    expect(fotoPelaTecla(13, "PageUp", 4, 30)).toBe(1);
    expect(fotoPelaTecla(5, "PageDown", 4, 10)).toBe(9);
    expect(fotoPelaTecla(5, "PageUp", 4, 10)).toBe(1);
  });
  it("outras teclas não são dela", () => {
    expect(fotoPelaTecla(5, "a", 4, 10)).toBeNull();
    expect(fotoPelaTecla(0, "ArrowRight", 4, 0)).toBeNull();
  });
});
