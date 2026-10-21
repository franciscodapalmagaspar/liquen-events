import { describe, expect, it } from "vitest";
import { agrupar, capitulos, eDasMesas, grupoDoTema } from "./grupos";
import { primeirosNomes } from "./textos";

describe("o grupo lê-se do nome do tema", () => {
  it.each([
    // Os nove temas do exemplo dela, com o capítulo em que ela os pôs.
    ["Decoração Cerimónia", "cerimonia"],
    ["Corredor nupcial", "cerimonia"],
    ["Decor Cocktail", "cocktail"],
    ["Seating Plan", "cocktail"],
    ["Decoração e Decor Floral Mesas Jantar", "jantar"],
    ["Decor Floral Mesa Bolo", "jantar"],
    ["Complementos dos Noivos", "complementos"],
    // E o que não encaixa em nenhum não desaparece.
    ["Luzes e Lounge", "ambiente"],
    // Palavra inteira: «bar» não apanha «barro», «mesa» não apanha «mesada».
    ["Vasos de barro", "ambiente"],
    // A cerimónia ganha às palavras genéricas do jantar.
    ["Mesa da cerimónia", "cerimonia"],
    // Sem acentos e em inglês também.
    ["CERIMONIA", "cerimonia"],
    ["Bridal bouquet", "complementos"],
  ])("«%s» → %s", (titulo, grupo) => {
    expect(grupoDoTema(titulo)).toBe(grupo);
  });

  it("o subtítulo conta quando o título não diz nada", () => {
    expect(grupoDoTema("Proposta A", "Ramo da Noiva")).toBe("complementos");
  });

  it("os capítulos saem pela ordem do dia, e os temas pela ordem do documento", () => {
    const temas = ["Bolo", "Lapelas", "Corredor", "Bar", "Altar"];
    const r = agrupar(temas, (t) => grupoDoTema(t));
    expect(r).toEqual([
      { grupo: "cerimonia", itens: ["Corredor", "Altar"] },
      { grupo: "cocktail", itens: ["Bar"] },
      { grupo: "jantar", itens: ["Bolo"] },
      { grupo: "complementos", itens: ["Lapelas"] },
    ]);
  });
});

describe("os primeiros nomes do título", () => {
  it("separa o casal pelo «&» e fica com o primeiro nome de cada", () => {
    expect(primeirosNomes("Mafalda Santos & João Barros e Cunha", "pt")).toBe("Mafalda e João");
    expect(primeirosNomes("Mafalda Santos & João Barros e Cunha", "en")).toBe("Mafalda and João");
  });

  it("sem «&» não inventa um casal", () => {
    expect(primeirosNomes("João Barros e Cunha", "pt")).toBeNull();
    expect(primeirosNomes("Quinta do Vale, Lda.", "pt")).toBeNull();
  });
});

describe("os capítulos: casamento pelo dia, o resto pelo mood board", () => {
  const temas = [{ title: "Bar" }, { title: "Arco de abóboras" }, { title: "Mesas" }];

  it("fora dos casamentos, cada mood board é um capítulo, pela ordem dela", () => {
    const c = capitulos(temas, (t) => t, false);
    expect(c.map((x) => x.chave)).toEqual(["tema-1", "tema-2", "tema-3"]);
    expect(c.every((x) => x.grupo === null)).toBe(true);
    expect(c.map((x) => x.itens[0].title)).toEqual(["Bar", "Arco de abóboras", "Mesas"]);
  });

  it("num casamento, continuam os capítulos do dia", () => {
    const c = capitulos(temas, (t) => t, true);
    expect(c.map((x) => x.grupo)).toEqual(["cerimonia", "cocktail", "jantar"]);
  });
});

describe("o tema é das mesas? (a paleta e o ambiente, pedido dela a 20/10)", () => {
  it.each([
    ["Decoração e Decor Floral Mesas Jantar", true],
    ["Centro de mesa", true],
    ["Mesa do Bolo", true],
    ["Buffet", true],
    ["Buffet do cocktail", true],
    ["Dinner tables", true],
    ["Decoração Cerimónia", false],
    ["Mesa da cerimónia", false],
    ["Buffet da cerimónia", false],
    ["Bar", false],
    ["Ramo da noiva", false],
    ["Luzes e Lounge", false],
  ])("«%s» → %s", (titulo, sim) => {
    expect(eDasMesas(titulo)).toBe(sim);
  });

  it("o subtítulo conta, como no grupo", () => {
    expect(eDasMesas("Proposta B", "Mesas de jantar")).toBe(true);
  });
});
