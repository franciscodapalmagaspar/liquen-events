import { describe, expect, it } from "vitest";
import { HEX } from "./paleta";

/** Contraste WCAG entre duas cores #rrggbb. */
function contraste(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Sobre o fundo de recurso (a Tinta), as três cores de texto leem-se. A Pedra
 * é só para fios de 1 px, e não entra. Sobre as fotografias, o contraste
 * garante-se escurecendo-as (`imagens.BRILHO`), não com cor (§2 do documento).
 */
describe("as cores de texto leem-se na Tinta", () => {
  it.each([
    ["cal", HEX.cal],
    ["papel", HEX.papel],
    ["linho", HEX.linho],
  ])("%s ≥ 4,5:1", (_nome, cor) => {
    expect(contraste(cor, HEX.tinta)).toBeGreaterThanOrEqual(4.5);
  });
});
