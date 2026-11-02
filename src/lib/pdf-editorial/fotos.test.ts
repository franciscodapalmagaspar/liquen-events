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

describe("numa página inteira, a régua do aviso (A3, 2/11)", () => {
  it("entre duas não vizinhas, a boa ganha à fraca — mesmo já usada", () => {
    // 3000 px é boa numa página inteira; 1500 é fraca (abaixo dos 1800).
    const fotos = [foto(1, 3000, 2000), foto(2, 1500, 1000)];
    const album = new Album(fotos);
    expect(album.paraAFolha(2, "deitada", "pagina")[0].id).toBe(1);
    // Três páginas depois a boa já foi usada — e continua a ganhar.
    expect(album.paraAFolha(5, "deitada", "pagina")[0].id).toBe(1);
  });

  it("sem `lugar` (painéis e faixas) o degrau é o de sempre: as duas chegam, ganha a por usar", () => {
    const fotos = [foto(1, 3000, 2000), foto(2, 1500, 1000)];
    const album = new Album(fotos);
    expect(album.escolher(2, "deitada")[0].id).toBe(1);
    expect(album.escolher(5, "deitada")[0].id).toBe(2);
  });

  it("nunca uma má quando há uma boa não vizinha — e a medida do Pinterest é má", () => {
    // 736 px de largura é o ficheiro do site, não o original.
    const fotos = [foto(1, 736, 1104), foto(2, 2400, 1600)];
    expect(new Album(fotos).paraAFolha(3, "qualquer", "pagina")[0].id).toBe(2);
  });

  it("a decisão dela: uma boa VIZINHA não ganha a uma fraca que não é", () => {
    // «Ganha não repetir»: a boa está na página ao lado; entra a fraca.
    const fotos = [foto(1, 3000, 2000), foto(2, 1500, 1000)];
    const album = new Album(fotos);
    expect(album.paraAFolha(4, "deitada", "pagina")[0].id).toBe(1);
    expect(album.paraAFolha(5, "deitada", "pagina")[0].id).toBe(2);
  });

  it("a capa usa a régua da capa", () => {
    const fotos = [foto(1, 1100, 733), foto(2, 2600, 1733)];
    expect(new Album(fotos).paraAFolha(1, "deitada", "capa")[0].id).toBe(2);
  });
});
