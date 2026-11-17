import { describe, expect, it } from "vitest";
import { mesmasNotas } from "./notas-automaticas";

describe("notas automáticas", () => {
  it("compara por campos, não por identidade", () => {
    const a = { id: "1", adminNotes: "x", lostReason: null };
    expect(mesmasNotas(a, { ...a })).toBe(true);
    expect(mesmasNotas(a, { ...a, lostReason: "" })).toBe(false);
  });
});
