// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { guardarPdfVisto, lerPdfVisto } from "./pdf-visto";

/**
 * Revisão de 17/11, n.º 4: o «já vi o PDF final» guardado na aba perdia as
 * fotografias em falta desse PDF. Recarregar a página (o «voltar» do telemóvel
 * faz isso) apagava a linha da Conferência que as diz, com o mesmo PDF à frente.
 */
describe("o «já vi o PDF final» desta aba", () => {
  beforeEach(() => sessionStorage.clear());

  it("guarda e lê também as fotografias em falta", () => {
    guardarPdfVisto("q1", { chave: "k", retrato: "r", confirmado: true, emFalta: 9 });
    expect(lerPdfVisto("q1")).toEqual({ chave: "k", retrato: "r", confirmado: true, emFalta: 9 });
  });

  it("sem fotos em falta, não inventa nenhuma", () => {
    guardarPdfVisto("q1", { chave: "k", retrato: "r", confirmado: false });
    expect(lerPdfVisto("q1")).toEqual({ chave: "k", retrato: "r", confirmado: false });
  });

  it("um número estragado no armazenamento não passa", () => {
    sessionStorage.setItem(
      "liquen-pdf-visto:q1",
      JSON.stringify({ chave: "k", retrato: "r", confirmado: true, emFalta: "9" }),
    );
    expect(lerPdfVisto("q1")?.emFalta).toBeUndefined();
    sessionStorage.setItem(
      "liquen-pdf-visto:q1",
      JSON.stringify({ chave: "k", retrato: "r", confirmado: true, emFalta: -2 }),
    );
    expect(lerPdfVisto("q1")?.emFalta).toBeUndefined();
  });

  it("apagar limpa", () => {
    guardarPdfVisto("q1", { chave: "k", retrato: "r", confirmado: true, emFalta: 1 });
    guardarPdfVisto("q1", null);
    expect(lerPdfVisto("q1")).toBeNull();
  });
});
