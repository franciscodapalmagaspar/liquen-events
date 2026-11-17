import { describe, expect, it, vi } from "vitest";

/**
 * Sem o token, o `@vercel/blob` NÃO se carrega (revisão de 17/11, n.º 12): o
 * duplo regista quando é avaliado, e só é avaliado se alguém o importar.
 */
const H = vi.hoisted(() => ({ carregado: false }));
vi.mock("@vercel/blob", () => {
  H.carregado = true;
  return {};
});
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ storage: { from: () => ({ list: vi.fn() }) } }),
}));

describe("o SDK do Blob carrega-se só quando é preciso", () => {
  it("importar e usar o `balde()` sem o token não carrega o SDK", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const { balde } = await import("./balde");
    balde("proposal-assets");
    await import("./blob");
    expect(H.carregado).toBe(false);
  });
});
