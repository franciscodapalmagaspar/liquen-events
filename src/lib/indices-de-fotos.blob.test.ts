import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { eChaveDeIndiceDeFotos } from "./indices-de-fotos";
import { PREFIXO_DO_INDICE, chaveDoIndice } from "./armazenamento/indice";

describe("o índice do Blob é um índice de fotografias", () => {
  it("a lista conhece o prefixo que o índice escreve", () => {
    expect(PREFIXO_DO_INDICE).toBe("blob:i:");
    expect(eChaveDeIndiceDeFotos(chaveDoIndice("proposal-assets", "LIQ-1/a.jpg"))).toBe(true);
    expect(eChaveDeIndiceDeFotos("proposal-draft:LIQ-1")).toBe(false);
  });
});
