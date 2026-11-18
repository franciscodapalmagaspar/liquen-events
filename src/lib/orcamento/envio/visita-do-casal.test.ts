import { describe, it, expect, vi } from "vitest";

const espias = vi.hoisted(() => ({
  capa: vi.fn(async (_c: readonly string[]) => 1),
  web: vi.fn(async (_id: string) => undefined),
}));
vi.mock("@/lib/derivadas", () => ({ aquecerDerivadasDaCapa: espias.capa }));
vi.mock("@/lib/proposta-web/modelo", () => ({ aquecerPropostaWeb: espias.web }));

import { comecarAAquecerACapa, prepararAPaginaOnline } from "./visita-do-casal";

describe("a visita do casal", () => {
  it("a capa aquece com as capas do documento, e sem capas não rebenta", async () => {
    await comecarAAquecerACapa(["c.jpg"]);
    expect(espias.capa).toHaveBeenCalledWith(["c.jpg"]);
    await expect(comecarAAquecerACapa(undefined)).resolves.toBeUndefined();
  });

  it("uma capa que falha NUNCA rejeita — a proposta já está gravada e o email a sair", async () => {
    espias.capa.mockRejectedValueOnce(new Error("sharp rebentou"));
    await expect(comecarAAquecerACapa(["c.jpg"])).resolves.toBeUndefined();
  });

  it("a página online fica para DEPOIS da resposta, com nome para o registo", async () => {
    const depois = vi.fn();
    prepararAPaginaOnline("p1", depois);
    expect(espias.web).not.toHaveBeenCalled();
    expect(depois).toHaveBeenCalledWith(
      "a página online não ficou preparada",
      expect.any(Function),
    );
    await depois.mock.calls[0][1]();
    expect(espias.web).toHaveBeenCalledWith("p1");
  });
});
