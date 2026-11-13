import { describe, expect, it, vi } from "vitest";

/**
 * Os registos do diagnóstico do vídeo (desligado a 4/11) ficavam no
 * `app_state` para sempre (auditoria de 13/11, n.º 15). Saem ao fim de 30 dias
 * — e o filtro que vai à base de dados só apanha ESSES registos.
 */
const H = vi.hoisted(() => ({
  filtros: [] as [string, string, string][],
  linhas: [
    "diagnostico-video:2026-10-01:abc12345",
    "diagnostico-video:2026-10-13:abc12346",
    "diagnostico-video:2026-11-03:abc12347",
    "proposal-draft:LIQ-1",
    "sessoes-revogadas",
  ],
  apagadas: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("./supabase", () => ({
  getSupabase: () => ({
    from: () => ({
      delete: () => {
        let like = "";
        let lt = "";
        const b = {
          like(_c: string, v: string) {
            like = v;
            H.filtros.push(["like", _c, v]);
            return b;
          },
          lt(_c: string, v: string) {
            lt = v;
            H.filtros.push(["lt", _c, v]);
            return b;
          },
          select: () => b,
          then(resolve: (v: { data: { key: string }[]; error: null }) => unknown) {
            const prefixo = like.replace(/%$/, "").replace(/\\([%_\\])/g, "$1");
            const sair = H.linhas.filter((k) => k.startsWith(prefixo) && k < lt);
            H.apagadas.push(...sair);
            return Promise.resolve(resolve({ data: sair.map((key) => ({ key })), error: null }));
          },
        };
        return b;
      },
    }),
  }),
}));

import { limparDiagnosticosDoVideo } from "./limpar-diagnosticos-video";

describe("limpeza do diagnóstico do vídeo", () => {
  it("apaga só os registos do diagnóstico com mais de 30 dias", async () => {
    const n = await limparDiagnosticosDoVideo(new Date("2026-11-13T04:00:00Z"));
    expect(H.filtros).toContainEqual(["like", "key", "diagnostico-video:%"]);
    expect(H.filtros).toContainEqual(["lt", "key", "diagnostico-video:2026-10-14"]);
    expect(H.apagadas).toEqual([
      "diagnostico-video:2026-10-01:abc12345",
      "diagnostico-video:2026-10-13:abc12346",
    ]);
    expect(n).toBe(2);
  });
});
