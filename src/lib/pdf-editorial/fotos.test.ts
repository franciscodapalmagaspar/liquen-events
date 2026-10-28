import { describe, expect, it } from "vitest";
import { Album, type Foto } from "./fotos";

const foto = (id: number, w: number, h: number): Foto => ({
  id,
  bytes: Buffer.alloc(0),
  origem: `TESTE ${id}`,
  w,
  h,
  aspecto: w / h,
  pixeis: w * h,
  tema: 0,
});

describe("o álbum escolhe as fotografias dos painéis e separadores", () => {
  it("«qualquer» forma: as duas de MAIOR resolução — a regra dos separadores", () => {
    const fotos = [
      foto(1, 800, 1200),
      foto(2, 2400, 1600),
      foto(3, 1000, 1000),
      foto(4, 2000, 3000),
    ];
    const escolhidas = new Album(fotos).escolher(6, "qualquer", 2).map((f) => f.id);
    expect(escolhidas).toEqual([4, 2]);
  });

  it("nunca a mesma fotografia em duas páginas seguidas, enquanto houver outra", () => {
    const fotos = [foto(1, 2400, 1600), foto(2, 1200, 800)];
    const album = new Album(fotos);
    expect(album.escolher(5, "deitada")[0].id).toBe(1);
    expect(album.escolher(6, "deitada")[0].id).toBe(2);
    // Duas páginas depois, a melhor volta a poder ser usada.
    expect(album.escolher(8, "deitada")[0].id).toBe(1);
  });

  it("a forma pedida ganha à resolução nos painéis altos", () => {
    const fotos = [foto(1, 3000, 2000), foto(2, 800, 1200)];
    expect(new Album(fotos).escolher(2, "alta")[0].id).toBe(2);
  });

  it("uma pequena por usar já não ganha a uma grande que já apareceu (28/10)", () => {
    // Ela: «perceber onde é que deve colocar a foto relativamente à resolução».
    // A de 736 (a medida do Pinterest) ficava com a página inteira só por ser
    // nova; agora a de 2200, já usada três páginas antes, é a que serve.
    const fotos = [foto(1, 2200, 1467), foto(2, 736, 490)];
    const album = new Album(fotos);
    expect(album.escolher(2, "deitada")[0].id).toBe(1);
    expect(album.escolher(5, "deitada")[0].id).toBe(1);
  });

  it("entre duas que chegam, a ainda não usada continua a ganhar", () => {
    const fotos = [foto(1, 2200, 1467), foto(2, 1600, 1067)];
    const album = new Album(fotos);
    expect(album.escolher(2, "deitada")[0].id).toBe(1);
    expect(album.escolher(5, "deitada")[0].id).toBe(2);
  });
});
