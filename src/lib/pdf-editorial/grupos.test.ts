import { describe, expect, it } from "vitest";
import {
  agrupar,
  capitulos,
  eDaCerimoniaMesmo,
  eDasMesas,
  grupoDoTema,
  grupoNoCasamento,
} from "./grupos";
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
    const c = capitulos([{ title: "Cerimónia" }, { title: "Cocktail" }, ...temas], (t) => t, true);
    expect(c.map((x) => x.grupo)).toEqual(["cerimonia", "cocktail", "jantar"]);
    expect(c[0].itens.map((t) => t.title)).toEqual(["Cerimónia", "Arco de abóboras"]);
    expect(c[1].itens.map((t) => t.title)).toEqual(["Cocktail", "Bar"]);
  });

  it("num casamento sem tema da cerimónia, o arco não abre «Cerimónia» (14/11)", () => {
    // Até 14/11 este caso dava ["cerimonia", "cocktail", "jantar"]: o «Arco de
    // abóboras» sozinho criava o capítulo.
    const c = capitulos([{ title: "Cocktail" }, ...temas], (t) => t, true);
    expect(c.map((x) => x.grupo)).toEqual(["cocktail", "jantar", "ambiente"]);
    expect(c[2].itens.map((t) => t.title)).toEqual(["Arco de abóboras"]);
  });
});

/**
 * Pedido de 12/11: os noivos não quiseram cocktail, ela tirou o tema no
 * «Fazer proposta», e o PDF continuou com o capítulo «Cocktail» — porque o
 * «Seating Plan» que ficou vivia lá dentro.
 */
describe("sem tema do cocktail, não há capítulo «Cocktail»", () => {
  const comCocktail = [
    { title: "Decoração Cerimónia " },
    { title: "Decor Cocktail" },
    { title: "Decoração e Decor Floral Jantar " },
    { title: "Seating Plan" },
    { title: "Complementos dos Noivos " },
  ];
  const semCocktail = comCocktail.filter((t) => t.title !== "Decor Cocktail");

  it("com o tema do cocktail, o seating plan fica no «Cocktail» (como no exemplo dela)", () => {
    const c = capitulos(comCocktail, (t) => t, true);
    expect(c.map((x) => x.grupo)).toEqual(["cerimonia", "cocktail", "jantar", "complementos"]);
    expect(c[1].itens.map((t) => t.title)).toEqual(["Decor Cocktail", "Seating Plan"]);
  });

  it("tirado o cocktail, o capítulo desaparece e o seating plan passa para o «Jantar»", () => {
    const c = capitulos(semCocktail, (t) => t, true);
    expect(c.map((x) => x.grupo)).toEqual(["cerimonia", "jantar", "complementos"]);
    expect(c[1].itens.map((t) => t.title)).toEqual([
      "Decoração e Decor Floral Jantar ",
      "Seating Plan",
    ]);
  });

  it("o bar e o bistro, sem cocktail, vão para «Ambiente»", () => {
    const todos = [{ title: "Bar" }, { title: "Bistro" }, { title: "Mesas" }];
    expect(todos.map((t) => grupoNoCasamento(t, todos))).toEqual([
      "ambiente",
      "ambiente",
      "jantar",
    ]);
  });

  it("«Seatting» (com dois tt, como ela às vezes escreve) conta como seating", () => {
    const todos = [{ title: "Decoração Seatting Plan " }, { title: "Cocktail" }];
    expect(grupoNoCasamento(todos[0], todos)).toBe("cocktail");
    expect(grupoNoCasamento(todos[0], [todos[0]])).toBe("jantar");
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

describe("fotosQueDaoCor (13/11): as fotografias da página que dão cor à paleta", () => {
  it("havendo temas das mesas, só as da página que são deles", async () => {
    const { fotosQueDaoCor } = await import("./grupos");
    const temas = [
      { title: "Decoração Cerimónia", images: ["c1", "c2"] },
      { title: "Mesas de Jantar", images: ["m1", "m2"] },
    ];
    expect(fotosQueDaoCor(["m1", "c1", "m2"], temas)).toEqual(["m1", "m2"]);
  });

  it("sem temas das mesas (ou nenhuma deles na página), todas as da página", async () => {
    const { fotosQueDaoCor } = await import("./grupos");
    expect(
      fotosQueDaoCor(["c1", "c2"], [{ title: "Decoração Cerimónia", images: ["c1"] }]),
    ).toEqual(["c1", "c2"]);
    expect(fotosQueDaoCor(["c1"], [{ title: "Mesas de Jantar", images: ["m1"] }])).toEqual(["c1"]);
  });

  it("um tema das mesas só com texto não conta", async () => {
    const { fotosQueDaoCor } = await import("./grupos");
    expect(fotosQueDaoCor(["c1"], [{ title: "Mesas de Jantar", images: [] }])).toEqual(["c1"]);
  });
});

/**
 * Auditoria de 14/11, defeito 1: os complementos são testados antes do jantar,
 * e «noivos» é palavra dos complementos — «Mesa dos noivos» ia parar ao lado
 * dos ramos, e ficava fora da paleta das mesas.
 */
describe("a mesa dos noivos é do jantar, e o ramo da noiva continua nos complementos", () => {
  it.each([
    ["Mesa dos noivos", "jantar"],
    ["Mesa de honra dos noivos", "jantar"],
    ["Mesa de honra", "jantar"],
    ["Decoração Mesa dos Noivos", "jantar"],
    ["Mesas dos noivos e padrinhos", "jantar"],
    ["MESA DA NOIVA", "jantar"],
    // O que já estava certo fica.
    ["Ramo da noiva", "complementos"],
    ["Ramo da Noiva e lapelas", "complementos"],
    ["Lapelas dos noivos", "complementos"],
    ["Complementos dos Noivos", "complementos"],
    ["Mesa da cerimónia", "cerimonia"],
    ["Mesa dos noivos no altar", "cerimonia"],
  ])("«%s» → %s", (titulo, grupo) => {
    expect(grupoDoTema(titulo)).toBe(grupo);
    const todos = [{ title: titulo }, { title: "Decoração Cerimónia" }];
    expect(grupoNoCasamento(todos[0], todos)).toBe(grupo);
  });

  it("e entra na paleta das mesas", () => {
    expect(eDasMesas("Mesa dos noivos")).toBe(true);
    expect(eDasMesas("Mesa de honra dos noivos")).toBe(true);
    expect(eDasMesas("Ramo da noiva")).toBe(false);
  });

  it("no subtítulo também", () => {
    expect(grupoDoTema("Proposta A", "Mesa dos noivos")).toBe("jantar");
  });
});

/**
 * Auditoria de 14/11, defeito 2: o mesmo padrão do cocktail de 12/11, do lado
 * da cerimónia — um «Arco floral» sozinho abria o capítulo «Cerimónia».
 */
describe("sem tema da cerimónia, não há capítulo «Cerimónia»", () => {
  it("o arco e o corredor, sem cerimónia, vão para «Ambiente»", () => {
    const todos = [
      { title: "Arco floral" },
      { title: "Corredor nupcial" },
      { title: "Aisle" },
      { title: "Mesa dos noivos" },
    ];
    expect(todos.map((t) => grupoNoCasamento(t, todos))).toEqual([
      "ambiente",
      "ambiente",
      "ambiente",
      "jantar",
    ]);
    expect(capitulos(todos, (t) => t, true).map((c) => c.grupo)).toEqual(["jantar", "ambiente"]);
  });

  it.each(["Decoração Cerimónia", "Igreja", "Altar", "Ceremony", "Arco cerimonial"])(
    "com «%s», o arco e o corredor continuam na «Cerimónia»",
    (daCerimonia) => {
      const todos = [{ title: "Arco floral" }, { title: "Corredor" }, { title: daCerimonia }];
      expect(todos.map((t) => grupoNoCasamento(t, todos))).toEqual([
        "cerimonia",
        "cerimonia",
        "cerimonia",
      ]);
    },
  );

  it("a cerimónia pode vir no subtítulo", () => {
    const todos = [{ title: "Arco floral" }, { title: "Proposta A", subtitulo: "Cerimónia" }];
    expect(grupoNoCasamento(todos[0], todos)).toBe("cerimonia");
  });

  it("o exemplo dela fica igual: o corredor ao lado da «Decoração Cerimónia»", () => {
    const todos = [
      { title: "Decoração Cerimónia" },
      { title: "Corredor nupcial" },
      { title: "Decor Cocktail" },
      { title: "Seating Plan" },
      { title: "Decoração e Decor Floral Mesas Jantar" },
      { title: "Decor Floral Mesa Bolo" },
      { title: "Complementos dos Noivos" },
    ];
    expect(todos.map((t) => grupoNoCasamento(t, todos))).toEqual([
      "cerimonia",
      "cerimonia",
      "cocktail",
      "cocktail",
      "jantar",
      "jantar",
      "complementos",
    ]);
  });

  it.each([
    ["Arco floral", false],
    ["Corredor", false],
    ["Aisle", false],
    ["Decoração Cerimónia", true],
    ["Mesa da cerimónia", true],
    ["Igreja", true],
    ["Altar", true],
    ["Arco cerimonial", true],
    ["Mesas de jantar", false],
  ])("eDaCerimoniaMesmo(«%s») → %s", (titulo, sim) => {
    expect(eDaCerimoniaMesmo(titulo)).toBe(sim);
  });
});
