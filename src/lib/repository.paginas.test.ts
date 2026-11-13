import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { PAGINA_DO_SUPABASE, SupabaseBackend } from "./repository";

/**
 * Auditoria de 13/11: o Supabase devolve no máximo 1000 linhas por leitura e
 * corta o resto SEM AVISAR. O `list()` dizia «fetch everything (no cap)» e lia
 * só as primeiras 1000 — a cópia diária saía truncada. Agora lê por páginas.
 */
function tabelaCom(n: number) {
  const linhas = Array.from({ length: n }, (_, i) => ({ id: `r${String(i).padStart(5, "0")}` }));
  const pedidos: [number, number][] = [];
  const sb = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (de: number, ate: number) => {
            pedidos.push([de, ate]);
            // O que o Supabase faz: nunca mais de 1000 por resposta.
            return {
              data: linhas.slice(de, Math.min(ate + 1, de + PAGINA_DO_SUPABASE)),
              error: null,
              status: 200,
            };
          },
          limit: async (k: number) => ({
            data: linhas.slice(0, Math.min(k, PAGINA_DO_SUPABASE)),
            error: null,
            status: 200,
          }),
        }),
      }),
    }),
  };
  return { sb, pedidos };
}

const mapper = {
  table: "t",
  fromRow: (r: Record<string, unknown>) => r,
  toRow: (x: unknown) => x,
} as never;

describe("list() lê TUDO, por páginas", () => {
  it("2 500 linhas → 2 500 (três páginas), e não 1 000", async () => {
    const { sb, pedidos } = tabelaCom(2500);
    const repo = new SupabaseBackend(mapper, sb as never);
    const todas = await repo.list();
    expect(todas).toHaveLength(2500);
    expect(pedidos).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("exactamente 1 000 → lê mais uma página (vazia) para ter a certeza", async () => {
    const { sb, pedidos } = tabelaCom(1000);
    const todas = await new SupabaseBackend(mapper, sb as never).list();
    expect(todas).toHaveLength(1000);
    expect(pedidos).toHaveLength(2);
  });

  it("poucas linhas → uma leitura só", async () => {
    const { sb, pedidos } = tabelaCom(7);
    expect(await new SupabaseBackend(mapper, sb as never).list()).toHaveLength(7);
    expect(pedidos).toHaveLength(1);
  });
});
