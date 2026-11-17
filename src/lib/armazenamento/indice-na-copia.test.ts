import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  linhas: new Map<string, unknown>(),
  completa: true,
  apagados: 0,
}));
vi.mock("@/lib/app-state", () => ({
  listStateByPrefix: async (p: string) => ({
    entradas: [...H.linhas]
      .filter(([k]) => k.startsWith(p))
      .map(([key, value]) => ({ key, value })),
    completa: H.completa,
  }),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: () => ({
      upsert: async (rows: { key: string; value: unknown }[]) => {
        for (const r of rows) H.linhas.set(r.key, r.value);
        return { error: null };
      },
      delete: () => {
        H.apagados++;
        return { in: async () => ({ error: null }) };
      },
    }),
  }),
}));

import { ehChaveDoIndice, juntarIndiceDoBlob, listIndiceDoBlob } from "./indice-na-copia";

beforeEach(() => {
  H.linhas = new Map();
  H.completa = true;
  H.apagados = 0;
});

describe("o índice do Blob na cópia de segurança (revisão de 17/11, n.º 7)", () => {
  it("vai na cópia, de todos os baldes", async () => {
    H.linhas.set("blob:i:proposal-pdfs/p/k.pdf", { t: 1, c: "x" });
    H.linhas.set("blob:i:theme-assets/t/a.jpg", { t: 2, c: "y" });
    H.linhas.set("outra:coisa", { t: 1, c: "x" });
    expect((await listIndiceDoBlob()).map((l) => l.key)).toEqual([
      "blob:i:proposal-pdfs/p/k.pdf",
      "blob:i:theme-assets/t/a.jpg",
    ]);
  });

  it("uma varredura truncada LANÇA (não sai vazia com ar de completa)", async () => {
    H.completa = false;
    await expect(listIndiceDoBlob()).rejects.toThrow(/índice do Vercel Blob/);
  });

  it("repor JUNTA: as linhas que já lá estão e a cópia não conhece ficam", async () => {
    H.linhas.set("blob:i:proposal-assets/LIQ-9/nova.jpg", { t: 9, c: "hoje" });
    await juntarIndiceDoBlob([
      { key: "blob:i:proposal-assets/LIQ-1/a.jpg", value: { t: 1, c: "x" } },
    ]);
    expect(H.linhas.has("blob:i:proposal-assets/LIQ-9/nova.jpg")).toBe(true);
    expect(H.linhas.has("blob:i:proposal-assets/LIQ-1/a.jpg")).toBe(true);
    expect(H.apagados).toBe(0);
  });

  it("uma chave fora do índice não se escreve — nem as outras", async () => {
    await expect(
      juntarIndiceDoBlob([
        { key: "blob:i:proposal-assets/LIQ-1/a.jpg", value: { t: 1, c: "x" } },
        { key: "invoice-seq-2026", value: { t: 1, c: "x" } },
      ]),
    ).rejects.toThrow(/inválida/);
    expect(H.linhas.size).toBe(0);
    expect(ehChaveDoIndice("blob:i:proposal-thumbs/a.jpg")).toBe(false);
    expect(ehChaveDoIndice("blob:i:proposal-assets/../a.jpg")).toBe(false);
  });
});
