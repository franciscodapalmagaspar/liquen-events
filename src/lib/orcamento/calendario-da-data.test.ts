import { describe, expect, it } from "vitest";
import {
  dataNoCampo,
  diasDaSemana,
  fimDaSemana,
  inicioDaSemana,
  partesDe,
  semanasDoMes,
  somarDias,
  somarMeses,
  tituloDoMes,
} from "./calendario-da-data";

describe("calendário da data — as contas", () => {
  it("partesDe recusa o que não é uma data a sério", () => {
    expect(partesDe("2027-07-24")).toEqual({ ano: 2027, mes: 6, dia: 24 });
    expect(partesDe("2027-02-31")).toBeNull();
    expect(partesDe("")).toBeNull();
    expect(partesDe("24/07/2027")).toBeNull();
  });

  it("somar dias atravessa meses e anos", () => {
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2027-03-01", -1)).toBe("2027-02-28");
    expect(somarDias("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("somar um mês a 31 de janeiro dá o último dia de fevereiro, não março", () => {
    expect(somarMeses("2027-01-31", 1)).toBe("2027-02-28");
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29");
    expect(somarMeses("2027-03-15", -12)).toBe("2026-03-15");
  });

  it("seis semanas sempre, a começar à segunda-feira", () => {
    // Outubro de 2026 começa a uma quinta-feira.
    const s = semanasDoMes(2026, 9);
    expect(s).toHaveLength(6);
    expect(s.every((w) => w.length === 7)).toBe(true);
    expect(s[0][0].iso).toBe("2026-09-28");
    expect(s[0][3]).toMatchObject({ iso: "2026-10-01", dia: 1, doMes: true });
    expect(s[0][0].doMes).toBe(false);
    // Um mês que começa à segunda não deixa a primeira linha vazia.
    expect(semanasDoMes(2027, 2)[0][0].iso).toBe("2027-03-01");
  });

  it("início e fim da semana, de segunda a domingo", () => {
    // 24 de julho de 2027 é um sábado.
    expect(inicioDaSemana("2027-07-24")).toBe("2027-07-19");
    expect(fimDaSemana("2027-07-24")).toBe("2027-07-25");
  });

  it("escreve em português e em inglês", () => {
    expect(tituloDoMes(2026, 9, "pt-PT")).toBe("Outubro 2026");
    expect(tituloDoMes(2026, 9, "en-GB")).toBe("October 2026");
    expect(diasDaSemana("pt-PT").map((d) => d.inicial)).toEqual(["S", "T", "Q", "Q", "S", "S", "D"]);
    expect(dataNoCampo("2027-07-24", "pt-PT")).toMatch(/24 de julho de 2027/);
  });
});
