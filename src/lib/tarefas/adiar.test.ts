import { describe, expect, it } from "vitest";
import { adiarUmaSemana } from "./listas";

/** «Adiar uma semana» das acções em várias tarefas (BO 4). */
describe("adiarUmaSemana", () => {
  const HOJE = "2026-11-17";

  it("sete dias a partir do prazo, quando ele ainda não passou", () => {
    expect(adiarUmaSemana("2026-11-20", HOJE)).toBe("2026-11-27");
    expect(adiarUmaSemana(HOJE, HOJE)).toBe("2026-11-24");
  });

  it("sete dias a partir de HOJE quando não há prazo ou ele já passou", () => {
    expect(adiarUmaSemana(undefined, HOJE)).toBe("2026-11-24");
    expect(adiarUmaSemana("2026-11-01", HOJE)).toBe("2026-11-24");
  });

  it("muda de mês e de ano sem se perder", () => {
    expect(adiarUmaSemana("2026-12-28", HOJE)).toBe("2027-01-04");
    expect(adiarUmaSemana("2027-02-25", HOJE)).toBe("2027-03-04");
  });

  it("um prazo com hora conta pelo dia (revisão · 6)", () => {
    expect(adiarUmaSemana("2026-11-20T10:00:00.000Z", HOJE)).toBe("2026-11-27");
    expect(adiarUmaSemana("2026-11-01T23:00", HOJE)).toBe("2026-11-24");
  });

  it("um instante conta pelo dia em LISBOA, e não pelo de UTC (2.ª revisão · 10)", () => {
    // 23:30 UTC de 19 de julho já é dia 20 em Lisboa (UTC+1 no verão).
    expect(adiarUmaSemana("2026-07-19T23:30:00.000Z", "2026-07-01")).toBe("2026-07-27");
  });

  it("um prazo estragado conta como sem prazo", () => {
    expect(adiarUmaSemana("amanhã", HOJE)).toBe("2026-11-24");
  });
});
