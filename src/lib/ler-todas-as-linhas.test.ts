import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { lerTodasAsLinhas } from "./ler-todas-as-linhas";

function sbCom(linhas: number, maxRows: number, ignoraRange = false) {
  const todas = Array.from({ length: linhas }, (_, i) => ({ id: String(i).padStart(5, "0") }));
  return {
    from: () => ({
      select: () => {
        const b = {
          order: () => b,
          range: async (d: number, a: number) => {
            const desde = ignoraRange ? 0 : d;
            const fim = ignoraRange ? maxRows : Math.min(a + 1, desde + maxRows);
            return { data: todas.slice(desde, fim), error: null };
          },
        };
        return b;
      },
    }),
  } as never;
}

describe("lerTodasAsLinhas (revisão de 13/11)", () => {
  it("lê tudo mesmo com o max-rows abaixo de 1000 (uma página curta não é o fim)", async () => {
    const r = await lerTodasAsLinhas(sbCom(1234, 500), "quotes", "id");
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(1234);
  });

  it("se o `range` for ignorado, pára com erro em vez de girar para sempre", async () => {
    const r = await lerTodasAsLinhas(sbCom(10, 10, true), "quotes", "id");
    expect(r.data).toBeNull();
    expect(r.error).toBeTruthy();
  });
});
