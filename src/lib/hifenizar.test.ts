import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { hifenizar } = await import("./hifenizar");

/**
 * «O texto está espaçado… tem que estar normal, mas formatado» (22/10). O
 * iPhone não parte palavras portuguesas sozinho; as sílabas marcam-se no
 * servidor com hífenes invisíveis (U+00AD).
 */
const SHY = "­";
const ver = (t: string) => t.replaceAll(SHY, "·");

describe("hifenizar", () => {
  it("marca as sílabas das palavras portuguesas compridas", () => {
    expect(ver(hifenizar("concretização e fornecedores de confiança"))).toBe(
      "con·cre·ti·za·ção e for·ne·ce·do·res de con·fi·an·ça",
    );
  });

  it("não toca nas palavras curtas", () => {
    expect(hifenizar("desde o seu dia, nossa casa")).toBe("desde o seu dia, nossa casa");
  });

  it("o texto, sem os hífenes invisíveis, fica igual ao que era", () => {
    const texto =
      "Casamentos, eventos corporativos e celebrações, desde o conceito à concretização.";
    expect(hifenizar(texto).replaceAll(SHY, "")).toBe(texto);
  });

  it("em inglês, pelas regras do inglês", () => {
    expect(ver(hifenizar("unforgettable celebrations", "en"))).toContain("·");
    expect(hifenizar("unforgettable celebrations", "en").replaceAll(SHY, "")).toBe(
      "unforgettable celebrations",
    );
  });
});
