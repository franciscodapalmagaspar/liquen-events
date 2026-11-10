import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sb = vi.hoisted(() => ({
  ficheiros: {} as Record<string, { id: string; name: string; created_at: string }[]>,
  removidos: [] as string[],
}));
vi.mock("@/lib/fotos-editoriais-guardadas", () => ({ BUCKET_EDITORIAL: "fotos-editoriais" }));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    storage: {
      from: () => ({
        list: async (pasta: string) => ({
          data:
            pasta === ""
              ? Object.keys(sb.ficheiros).map((n) => ({ id: null, name: n }))
              : sb.ficheiros[pasta],
        }),
        remove: async (caminhos: string[]) => {
          sb.removidos.push(...caminhos);
          return { error: null };
        },
      }),
    },
  }),
}));

import { limparFotosTratadasVelhas } from "./limpar-fotos-tratadas";

describe("as fotos tratadas com mais de 30 dias saem (10/11)", () => {
  it("apaga as velhas e deixa as recentes", async () => {
    const agora = new Date("2026-12-15T03:00:00Z");
    sb.ficheiros = {
      ab: [
        { id: "1", name: "velha.jpg", created_at: "2026-11-03T10:00:00Z" },
        { id: "2", name: "nova.jpg", created_at: "2026-12-10T10:00:00Z" },
      ],
      cd: [{ id: "3", name: "outra-velha.jpg", created_at: "2026-11-01T10:00:00Z" }],
    };
    sb.removidos = [];
    const r = await limparFotosTratadasVelhas(agora);
    expect(sb.removidos.sort()).toEqual(["ab/velha.jpg", "cd/outra-velha.jpg"]);
    expect(r).toEqual({ apagadas: 2, pastas: 2, acabou: true });
  });
});
