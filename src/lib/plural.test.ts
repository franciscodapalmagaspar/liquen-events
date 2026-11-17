import { describe, expect, it } from "vitest";
import { plural } from "./plural";

describe("plural", () => {
  it("só o 1 é singular", () => {
    expect(plural(1, "foto", "fotos")).toBe("1 foto");
    expect(plural(2, "foto", "fotos")).toBe("2 fotos");
  });

  it("o zero leva plural, em português de Portugal", () => {
    expect(plural(0, "foto", "fotos")).toBe("0 fotos");
  });

  it("números grandes e negativos não mudam a regra", () => {
    expect(plural(1500, "tema", "temas")).toBe("1500 temas");
    expect(plural(-1, "dia", "dias")).toBe("-1 dias");
  });
});
