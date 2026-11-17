import { describe, it, expect } from "vitest";
import { cortesDoCabecalhoCru, cortesEmCabecalho, type Truncagens } from "./contrato";
import { cortesDoCabecalho } from "@/lib/orcamento/estudio/textos-do-estudio";

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
    expect(cortesDoCabecalhoCru(cortesEmCabecalho(cortes))).toEqual(cortes);
    expect(cortesDoCabecalho(cortesEmCabecalho(cortes))).toEqual(cortes);
  });

  it("um cabeçalho que não é base64 de JSON lê-se como nada", () => {
    expect(cortesDoCabecalhoCru("isto-não-é-base64")).toBeNull();
    expect(cortesDoCabecalho("isto-não-é-base64")).toEqual([]);
    expect(cortesDoCabecalho(null)).toEqual([]);
  });
});
