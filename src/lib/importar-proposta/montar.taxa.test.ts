import { describe, expect, it } from "vitest";
import { taxaDe } from "./montar";

describe("taxaDe — o campo da taxa do IVA", () => {
  it("lê «6%», «6 %%» e «6,5%»", () => {
    expect(taxaDe({ taxa: "6%" })).toBe(0.06);
    expect(taxaDe({ taxa: "6 %%" })).toBe(0.06);
    expect(taxaDe({ taxa: "6,5%" })).toBe(0.065);
  });
  it("não lê «50», «abc» nem vazio — nunca cai para 23 %", () => {
    expect(taxaDe({ taxa: "50" })).toBeNull();
    expect(taxaDe({ taxa: "abc" })).toBeNull();
    expect(taxaDe({ taxa: "" })).toBeNull();
    expect(taxaDe({ taxa: "6,5,1" })).toBeNull();
  });
});
