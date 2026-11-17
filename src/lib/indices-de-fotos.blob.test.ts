import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PREFIXO_DO_INDICE_DO_BLOB, eChaveDeIndiceDeFotos } from "./indices-de-fotos";
import { PREFIXO_DO_INDICE, chaveDoIndice } from "./armazenamento/indice";

describe("o índice do Blob é um índice de fotografias", () => {
  it("a lista conhece o prefixo que o índice escreve", () => {
    expect(PREFIXO_DO_INDICE).toBe(PREFIXO_DO_INDICE_DO_BLOB);
    expect(eChaveDeIndiceDeFotos(chaveDoIndice("proposal-assets", "LIQ-1/a.jpg"))).toBe(true);
    expect(eChaveDeIndiceDeFotos("proposal-draft:LIQ-1")).toBe(false);
  });
});
