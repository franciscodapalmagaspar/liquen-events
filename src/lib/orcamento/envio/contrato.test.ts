import { describe, it, expect } from "vitest";
import { cortesDoCabecalho, cortesEmCabecalho, normalizaCortes, type Truncagens } from "./contrato";

const cortes: Truncagens = [
  { where: "Mood board «Cerimónia»", dropped: 3, unit: "fotos" },
  { where: "Local", dropped: 1, unit: "linhas" },
];

describe("os cortes no cabeçalho da pré-visualização", () => {
  it("dão os mesmos bytes que a rota antiga escrevia (Buffer, base64 sobre UTF-8)", () => {
    expect(cortesEmCabecalho(cortes)).toBe(
      Buffer.from(JSON.stringify(cortes), "utf8").toString("base64"),
    );
    expect(cortesEmCabecalho([])).toBe(Buffer.from("[]", "utf8").toString("base64"));
  });

  it("vão e voltam com os acentos, pelo mesmo par nos dois lados", () => {
    expect(cortesDoCabecalho(cortesEmCabecalho(cortes))).toEqual(cortes);
  });

  it("um cabeçalho que não é base64 de JSON lê-se como nada", () => {
    expect(cortesDoCabecalho("isto-não-é-base64")).toEqual([]);
    expect(cortesDoCabecalho(null)).toEqual([]);
  });

  it("só passa o que tem forma de corte — uma unidade que o tipo não conhece fica de fora", () => {
    expect(
      normalizaCortes([
        ...cortes,
        { where: "x", dropped: 1, unit: "paginas" },
        { where: "y", dropped: 0, unit: "fotos" },
        null,
        "z",
      ]),
    ).toEqual(cortes);
    expect(normalizaCortes({})).toEqual([]);
  });
});
