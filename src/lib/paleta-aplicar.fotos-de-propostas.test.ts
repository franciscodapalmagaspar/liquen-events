import { describe, it, expect, vi } from "vitest";

/**
 * O passe das paletas só etiqueta fotos da BIBLIOTECA (14/11). As fotos das
 * propostas também têm linha — e cor — em `biblioteca_fotos`, mas não são da
 * Biblioteca e nunca podem ganhar etiquetas por causa disso.
 */

const TEMA = "3f6c1b2e-9a4d-4c7e-8f10-aa11bb22cc33";
const etiquetadas = vi.hoisted(() => ({ paths: [] as string[] }));

vi.mock("./biblioteca-fotos-store", () => ({
  listFotos: async () => [
    {
      path: "LIQ-2026-0412/a1b2.jpg",
      pasta: "LIQ-2026-0412",
      cor: "#b5523b",
      createdAt: "",
      updatedAt: "",
    },
    { path: `${TEMA}/um.jpg`, pasta: TEMA, cor: "#b5523b", createdAt: "", updatedAt: "" },
  ],
}));
vi.mock("./themes-store", () => ({ listThemes: async () => [{ id: TEMA, name: "Itália" }] }));
vi.mock("./theme-storage", () => ({
  themeFolder: (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, ""),
}));
vi.mock("./biblioteca-foto-etiquetas-store", () => ({
  listFotoEtiquetas: async () => [],
  etiquetar: async (path: string) => {
    etiquetadas.paths.push(path);
    return { criada: true };
  },
}));

import { aplicarPaletas } from "./paleta-aplicar";

describe("aplicarPaletas — fotos de propostas", () => {
  it("nunca etiqueta (nem planeia) uma foto de proposta", async () => {
    const ensaio = await aplicarPaletas({ ensaio: true });
    const planeadas = ensaio.plano.aAplicar.map((a) => a.path);
    expect(planeadas.some((p) => p.startsWith("LIQ-"))).toBe(false);

    await aplicarPaletas();
    expect(etiquetadas.paths.some((p) => p.startsWith("LIQ-"))).toBe(false);
  });
});
