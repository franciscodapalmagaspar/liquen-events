import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Auditoria de 13/11, estúdio n.º 16: a razão de uma gravação recusada nunca
 * aparecia. O ecrã lia `erro` (o campo do 503), e as outras recusas da rota —
 * «Rascunho demasiado grande.» (413), «Rascunho em falta.» (400) — vêm em
 * `error`. Ficava «não foi possível guardar», sem dizer porquê.
 */
const { gravarRascunhoNoServidor } = await import("./ProposalStudio");

afterEach(() => vi.unstubAllGlobals());

describe("gravarRascunhoNoServidor diz porque é que o servidor recusou", () => {
  it("lê `error` (413)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "Rascunho demasiado grande." }, { status: 413 })),
    );
    const r = await gravarRascunhoNoServidor("LIQ-1", { doc: {}, baseUpdatedAt: null });
    expect(r).toMatchObject({ estado: "so-local", porque: "Rascunho demasiado grande." });
  });

  it("e continua a ler `erro` (503 da base de dados)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ erro: "A base de dados recusou.", permanente: true }, { status: 503 }),
      ),
    );
    const r = await gravarRascunhoNoServidor("LIQ-1", { doc: {}, baseUpdatedAt: null });
    expect(r).toMatchObject({ estado: "so-local", porque: "A base de dados recusou." });
  });
});
