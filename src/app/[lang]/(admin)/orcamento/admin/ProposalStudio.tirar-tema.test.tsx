// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { semAsFotosNasPaginas, semOTema } from "./ProposalStudio";

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

describe("tirar UMA foto de um tema tira-a das páginas (auditoria 12/11, n.º 2)", () => {
  it("a foto tirada sai das páginas; a que ainda está noutro tema fica", () => {
    const tirada = {
      ...doc,
      moodBoards: doc.moodBoards.map((b, i) => (i === 1 ? { ...b, images: [] } : b)),
    };
    const r = semAsFotosNasPaginas(tirada as Doc, ["tema:y/cock1.jpg", "tema:x/partilhada.jpg"]);
    expect(r.fotosDasPaginas?.indice).toBeUndefined();
    expect(r.fotosDasPaginas?.paleta?.fotos).toEqual(["tema:x/partilhada.jpg"]);
  });
});

describe("o separador de um capítulo que deixou de existir sai (n.º 9)", () => {
  it("num casamento, tirado o cocktail, «separador:cocktail» sai; os outros ficam", () => {
    const casamento = {
      ...doc,
      eventType: "Casamento",
      fotosDasPaginas: {
        "separador:cocktail": { fotos: ["biblioteca/x.jpg"] },
        "separador:jantar": { fotos: ["biblioteca/y.jpg"] },
      },
    } as unknown as Doc;
    const r = semOTema(casamento, 1);
    expect(r.fotosDasPaginas?.["separador:cocktail"]).toBeUndefined();
    expect(r.fotosDasPaginas?.["separador:jantar"]?.fotos).toEqual(["biblioteca/y.jpg"]);
  });
});
