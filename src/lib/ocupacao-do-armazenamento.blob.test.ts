import { describe, expect, it, vi } from "vitest";

/** A janela da importação mostra o ERRO do Blob sem token (revisão de 17/11, n.º 7). */
vi.mock("@/lib/app-state", () => ({
  getStates: async () => new Map(),
  gravarEstadoSeNaoMudou: vi.fn(),
  lerEstadoComVersao: vi.fn(),
  setState: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => null }));
vi.mock("@/lib/armazenamento/saude", () => ({
  estadoDoBlob: async () => ({
    avisos: ["aviso de tecto"],
    erro: "há ficheiros no Blob sem token",
  }),
}));

import { lerEspaco } from "./ocupacao-do-armazenamento";

describe("lerEspaco com o Blob", () => {
  it("o erro vem primeiro, depois os avisos", async () => {
    expect((await lerEspaco()).avisosBlob).toEqual([
      "há ficheiros no Blob sem token",
      "aviso de tecto",
    ]);
  });
});
