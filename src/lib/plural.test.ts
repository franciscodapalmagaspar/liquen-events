import { describe, expect, it } from "vitest";
import { plural } from "./plural";

describe("plural", () => {
  it("só o 1 é singular", () => {
    expect(plural(1, "foto", "fotos")).toBe("1 foto");
    expect(plural(0, "foto", "fotos")).toBe("0 fotos");
    expect(plural(2, "foto", "fotos")).toBe("2 fotos");
    expect(plural(1000, "foto", "fotos")).toBe("1000 fotos");
  });

  it("o −1 e as fracções não são «um»", () => {
    expect(plural(-1, "foto", "fotos")).toBe("-1 fotos");
    expect(plural(1.5, "foto", "fotos")).toBe("1.5 fotos");
  });
});
