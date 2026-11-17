import { describe, expect, it } from "vitest";
import { desdeQuando, fraseDeEliminar, photoCountLabel } from "./textos-dos-temas";

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

// (Os testes daqui para baixo viviam no `Temas.test.tsx`.)

describe("desdeQuando", () => {
  const agora = Date.parse("2026-08-05T12:00:00.000Z");
  const dias = (n: number) => new Date(agora - n * 86_400_000).toISOString();

  it("fala como se fala", () => {
    expect(desdeQuando(dias(0), agora)).toBe("hoje");
    expect(desdeQuando(dias(1), agora)).toBe("ontem");
    expect(desdeQuando(dias(9), agora)).toBe("há 9 dias");
    expect(desdeQuando(dias(29), agora)).toBe("há 29 dias");
  });

  /**
   * Fase 02, ponto 13: «a partir de 30 dias mostra a data». Era «há 2 meses» e
   * «há 1 ano» — dois temas com «há 1 ano» podiam estar onze meses afastados.
   * Mudou de propósito; o formato é o da casa, `DD/MM/AAAA`.
   */
  it("a partir de 30 dias diz a data, e não «há N meses»", () => {
    expect(desdeQuando(dias(30), agora)).toBe("06/07/2026");
    expect(desdeQuando(dias(60), agora)).toBe("06/06/2026");
    expect(desdeQuando(dias(400), agora)).toBe("01/07/2025");
  });

  /** Um relógio trocado (ou uma escrita acabada de acontecer) não pode produzir
   *  "há -2 dias" no cartão. */
  it("uma data no futuro conta como hoje", () => {
    expect(desdeQuando(new Date(agora + 86_400_000).toISOString(), agora)).toBe("hoje");
  });

  it("sem data, ou com lixo, não diz nada", () => {
    expect(desdeQuando(undefined, agora)).toBe("");
    expect(desdeQuando("ontem à tarde", agora)).toBe("");
  });
});

describe("fraseDeEliminar", () => {
  it("as frases, no singular e no plural, e os casos sem número", () => {
    expect(fraseDeEliminar({ imageCount: 5 }, 2)).toEqual({
      fotos: "Leva 5 fotografias com ele.",
      propostas: "Está em 2 propostas — essas guardam as fotos que usam e não mudam.",
    });
    expect(fraseDeEliminar({ imageCount: 1 }, 1)).toEqual({
      fotos: "Leva 1 fotografia com ele.",
      propostas: "Está em 1 proposta — essa guarda as fotos que usa e não muda.",
    });
    // Nenhuma proposta: não há nada a dizer sobre elas.
    expect(fraseDeEliminar({ imageCount: 5 }, 0).propostas).toBeNull();
    // A contagem truncada é um mínimo; a pasta ilegível não tem número.
    expect(fraseDeEliminar({ imageCount: 500, truncated: true }, 0).fotos).toBe(
      "Leva 500+ fotografias com ele.",
    );
    expect(fraseDeEliminar({ imageCount: null }, 0).fotos).toBe(
      "As fotografias que estiverem lá dentro vão com ele.",
    );
    expect(fraseDeEliminar({ imageCount: 0 }, 0).fotos).toMatch(/vazia/);
    // Sem a contagem de usos, fica a frase de antes — que continua verdadeira.
    expect(fraseDeEliminar({ imageCount: 5 }, null).propostas).toBe(
      "As propostas já feitas com estas fotos não são afectadas.",
    );
  });
});
