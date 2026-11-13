import { describe, it, expect, vi } from "vitest";

/**
 * O PostgREST corta CADA resposta nas 1000 linhas sem avisar (revisão de
 * 13/11, n.º 1). A varredura por prefixo pedia `limit(limite + 1)` e, com
 * 2500 rascunhos, recebia 1000 e dizia-se «completa» — a cópia e a limpeza
 * de fotos deixavam de ver 1500 rascunhos.
 */
const TODAS = Array.from({ length: 2500 }, (_, i) => ({
  key: `draft:${String(i).padStart(5, "0")}`,
  value: i,
}));

vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("./supabase", () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => {
        let desde = 0;
        let ate = Infinity;
        const b = {
          like: () => b,
          order: () => b,
          range(d: number, a: number) {
            desde = d;
            ate = a;
            return b;
          },
          limit(n: number) {
            ate = n - 1;
            return b;
          },
          then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
            // O tecto do servidor: nunca mais de 1000 por resposta.
            const fim = Math.min(ate + 1, desde + 1000);
            return Promise.resolve(resolve({ data: TODAS.slice(desde, fim), error: null }));
          },
        };
        return b;
      },
    }),
  }),
}));

import { listStateByPrefix } from "./app-state";

describe("listStateByPrefix no Supabase", () => {
  it("lê tudo, por páginas, quando cabe no limite", async () => {
    const r = await listStateByPrefix("draft:", 10_000);
    expect(r.entradas).toHaveLength(2500);
    expect(r.completa).toBe(true);
    expect(new Set(r.entradas.map((e) => e.key)).size).toBe(2500);
  });

  it("acima do limite diz que NÃO está completa", async () => {
    const r = await listStateByPrefix("draft:", 2000);
    expect(r.entradas).toHaveLength(2000);
    expect(r.completa).toBe(false);
  });
});
