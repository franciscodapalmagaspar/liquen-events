import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O PDF lido do Blob passa o TAMANHO ao travão (revisão de 17/11, n.º 4): sem
 * ele, a pergunta ao tecto de transferência ia com zero bytes e passava sempre.
 */

const H = vi.hoisted(() => ({ linha: null as null | { t: number; c: string } }));
vi.mock("./armazenamento/modos", () => ({ modoDoBalde: async () => "blob" }));
vi.mock("./armazenamento/indice", () => ({
  lerDoIndice: async (_b: string, cs: string[]) =>
    new Map(H.linha ? cs.map((c) => [c, H.linha]) : []),
}));
vi.mock("./armazenamento/blob", () => {
  class BlobRecusado extends Error {
    motivo = "transferencia";
  }
  return {
    BlobRecusado,
    lerRespostaDoBlob: vi.fn(async () => new Response("%PDF blob", { status: 200 })),
  };
});

import { pdfGuardadoEmFluxo } from "./pdf-do-armazenamento";
import { lerRespostaDoBlob } from "./armazenamento/blob";

const original = { ...process.env };
beforeEach(() => {
  process.env.SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  vi.mocked(lerRespostaDoBlob).mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("%PDF supabase", { status: 200 })),
  );
});
afterEach(() => {
  process.env = { ...original };
  vi.unstubAllGlobals();
});

const pedido = () => new Request("https://liquen-events.com/api/proposta/tok/pdf");

describe("o PDF guardado com o balde no Blob", () => {
  it("passa ao Blob o tamanho que o índice sabe", async () => {
    H.linha = { t: 2_500_000, c: "x" };
    const r = await pdfGuardadoEmFluxo(pedido(), "p1", "k1", "P.pdf");
    expect(await r!.text()).toBe("%PDF blob");
    expect(lerRespostaDoBlob).toHaveBeenCalledWith("proposal-pdfs/p1/k1.pdf", {}, 2_500_000);
  });

  it("sem linha no índice, nem pergunta ao Blob: vai ao Supabase", async () => {
    H.linha = null;
    const r = await pdfGuardadoEmFluxo(pedido(), "p1", "k1", "P.pdf");
    expect(await r!.text()).toBe("%PDF supabase");
    expect(lerRespostaDoBlob).not.toHaveBeenCalled();
  });
});
