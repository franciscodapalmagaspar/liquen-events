import { describe, expect, it } from "vitest";
import { photoCountLabel } from "./textos-dos-temas";

describe("photoCountLabel", () => {
  it("uma pasta ilegível não diz «0 fotos»", () => {
    expect(photoCountLabel(null)).toBe("Fotos indisponíveis");
    expect(photoCountLabel(null, true)).toBe("Fotos indisponíveis");
  });

  it("uma contagem que bateu no tecto é um mínimo", () => {
    expect(photoCountLabel(500, true)).toBe("500+ fotos");
  });

  it("o resto conta-se em português", () => {
    expect(photoCountLabel(0)).toBe("0 fotos");
    expect(photoCountLabel(1)).toBe("1 foto");
    expect(photoCountLabel(37, false)).toBe("37 fotos");
  });
});
