import { describe, expect, it } from "vitest";
import { avisoDeTemaParecido, temasParecidos, type TemaComparavel } from "./temas-parecidos";

const t = (id: string, name: string, arquivado = false): TemaComparavel => ({
  id,
  name,
  ...(arquivado ? { arquivado } : {}),
});

/**
 * O que se prende aqui é o CRITÉRIO — o que conta como o mesmo tema e o que
 * não conta. É a única parte disto que se pode enganar em silêncio: um
 * critério largo de mais não parte nada, só ensina a ignorar o aviso, e a
 * partir daí o par que interessa passa com os outros.
 */
describe("dois temas que são o mesmo tema", () => {
  it("a mesma palavra por outra ordem", () => {
    const r = temasParecidos([t("a", "Branco e Verde"), t("b", "Verde & Branco")]);
    expect(r.get("a")?.map((x) => x.id)).toEqual(["b"]);
    expect(r.get("b")?.map((x) => x.id)).toEqual(["a"]);
  });

  it("acentos e maiúsculas não distinguem nada", () => {
    const r = temasParecidos([t("a", "Itália"), t("b", "  ITALIA ")]);
    expect(r.size).toBe(2);
  });

  it("as palavras vazias também não", () => {
    const r = temasParecidos([t("a", "Complementos Dos Noivos"), t("b", "Complementos Noivos")]);
    expect(r.size).toBe(2);
  });

  it("três iguais vêem-se todos uns aos outros", () => {
    const r = temasParecidos([t("a", "Boho"), t("b", "boho"), t("c", "BOHO")]);
    expect(r.get("a")).toHaveLength(2);
    expect(
      r
        .get("c")
        ?.map((x) => x.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });
});

describe("o que NÃO é o mesmo tema", () => {
  /**
   * O par que um critério largo apanharia, e que é a razão de não ser largo:
   * são dois temas diferentes, e acusá-los ensina a ignorar o aviso.
   */
  it("um nome que é o princípio do outro fica de fora", () => {
    const r = temasParecidos([t("a", "Branco"), t("b", "Branco & Verde")]);
    expect(r.size).toBe(0);
  });

  it("os números distinguem", () => {
    const r = temasParecidos([t("a", "Mesa 1"), t("b", "Mesa 2")]);
    expect(r.size).toBe(0);
  });

  it("uma palavra a mais é outro tema", () => {
    const r = temasParecidos([
      t("a", "Clássico Intemporal"),
      t("b", "Clássico Intemporal (Branco/dourado)"),
    ]);
    expect(r.size).toBe(0);
  });

  /** Arquivar é arrumar. Um par já arrumado é um par resolvido. */
  it("um tema arquivado não faz par", () => {
    const r = temasParecidos([t("a", "Itália"), t("b", "italia", true)]);
    expect(r.size).toBe(0);
  });

  it("um tema sozinho não aparece no mapa", () => {
    expect(temasParecidos([t("a", "Itália")]).get("a")).toBeUndefined();
  });

  /** Um nome só de palavras vazias tem essência vazia — não pode juntar-se a
   *  todos os outros que também a tenham por acaso. */
  it("nomes só de palavras vazias comparam-se pelo nome inteiro", () => {
    const r = temasParecidos([t("a", "de"), t("b", "para"), t("c", "De")]);
    expect(r.get("a")?.map((x) => x.id)).toEqual(["c"]);
    expect(r.get("b")).toBeUndefined();
  });
});

describe("a frase do cartão", () => {
  it("cita o outro nome, para não obrigar a procurá-lo", () => {
    expect(avisoDeTemaParecido([t("b", "italia")])).toBe("Lê-se como “italia”");
  });

  it("com mais do que um, conta-os", () => {
    expect(avisoDeTemaParecido([t("b", "italia"), t("c", "ITALIA")])).toBe(
      "Lê-se como outros 2 temas",
    );
  });

  it("sem par não há frase", () => {
    expect(avisoDeTemaParecido(undefined)).toBeNull();
    expect(avisoDeTemaParecido([])).toBeNull();
  });
});
