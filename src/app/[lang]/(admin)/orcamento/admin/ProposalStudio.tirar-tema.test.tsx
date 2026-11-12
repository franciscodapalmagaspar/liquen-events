// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { semOTema } from "./ProposalStudio";

/**
 * Pedido de 12/11: «os noivos não querem cocktail; ela tirou o mood board no
 * Fazer proposta e o cocktail continuou no PDF». As fotografias escolhidas
 * para as páginas guardavam-se à parte do tema e ficavam lá.
 */
type Doc = Parameters<typeof semOTema>[0];

const doc = {
  moodBoards: [
    { id: "a", title: "Decoração Cerimónia", images: ["tema:x/cer1.jpg", "tema:x/partilhada.jpg"] },
    { id: "b", title: "Decor Cocktail", images: ["tema:y/cock1.jpg", "tema:x/partilhada.jpg"] },
    { id: "c", title: "Jantar", images: ["tema:z/jan1.jpg"] },
  ],
  coverImages: ["tema:y/cock1.jpg"],
  fotosDasPaginas: {
    indice: { fotos: ["tema:y/cock1.jpg"] },
    "condicoes:notas": {
      fotos: ["tema:y/cock1.jpg", "tema:z/jan1.jpg"],
      focos: [{ x: 1, y: 1 }, null],
    },
    "separador:jantar": { fotos: ["tema:z/jan1.jpg"] },
    paleta: { fotos: ["tema:x/partilhada.jpg"] },
  },
} as unknown as Doc;

describe("tirar um tema tira-o do PDF todo", () => {
  const depois = semOTema(doc, 1);

  it("o tema sai da lista", () => {
    expect(depois.moodBoards.map((b) => b.title)).toEqual(["Decoração Cerimónia", "Jantar"]);
  });

  it("as fotos dele saem das páginas onde ela as tinha posto; o lugar volta ao automático", () => {
    const p = depois.fotosDasPaginas ?? {};
    expect(p.indice).toBeUndefined();
    expect(p["condicoes:notas"]?.fotos).toEqual(["tema:z/jan1.jpg"]);
    expect(p["condicoes:notas"]?.focos).toEqual([null]);
    expect(p["separador:jantar"]?.fotos).toEqual(["tema:z/jan1.jpg"]);
  });

  it("uma foto que também está noutro tema que fica, fica", () => {
    expect(depois.fotosDasPaginas?.paleta?.fotos).toEqual(["tema:x/partilhada.jpg"]);
  });

  it("a capa não se toca (escolhe-se à parte, à vista)", () => {
    expect(depois.coverImages).toEqual(["tema:y/cock1.jpg"]);
  });
});
