import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ManifestoDeFotografias } from "./manifesto-de-fotografias";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS `tema:` QUE A JUNÇÃO ESCREVE SOBREVIVEM A UM «FUNDIR» (revisão do #451)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A Fase A troca, no rascunho, a cópia da pasta do pedido por `tema:T/x.jpg`.
 * Se ela depois fundir o tema T no U (ou mover a foto), o caminho T/x.jpg deixa
 * de existir. Quem reescreve as referências nesse momento é o
 * `moverFotosDaBiblioteca` (PR #448) — o mesmo que a rota `fundir` e a
 * `imagens/copiar` chamam. Aqui correm as duas peças verdadeiras sobre o mesmo
 * `app_state` em memória: a Fase A e depois o mover.
 */

const st = vi.hoisted(() => ({
  estado: new Map<string, unknown>(),
  carimbos: new Map<string, string>(),
}));

const grava = (key: string, value: unknown) => {
  st.estado.set(key, value);
  st.carimbos.set(key, new Date().toISOString());
};

vi.mock("@/lib/app-state", () => ({
  getState: async (key: string) => st.estado.get(key) ?? null,
  setState: async (key: string, value: unknown) => {
    st.estado.set(key, structuredClone(value));
    st.carimbos.set(key, new Date().toISOString());
    return { gravado: true, duradouro: true, onde: "servidor" };
  },
  listStateByPrefix: async (prefix: string) => ({
    entradas: [...st.estado]
      .filter(([k]) => k.startsWith(prefix))
      .map(([key, value]) => ({ key, value })),
    completa: true,
  }),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    storage: { from: () => ({ copy: async () => ({}), remove: async () => ({ data: [] }) }) },
    from: (tabela: string) => ({
      select: () => {
        let desde = 0;
        let chave = "";
        const b = {
          order: () => b,
          like: () => b,
          gt: () => b,
          range(d: number) {
            desde = d;
            return b;
          },
          eq(_c: string, v: string) {
            chave = v;
            return b;
          },
          maybeSingle: async () => ({
            data: st.estado.has(chave)
              ? { key: chave, value: st.estado.get(chave), updated_at: st.carimbos.get(chave) }
              : null,
            error: null,
          }),
          then(resolve: (v: unknown) => unknown) {
            const todas =
              tabela === "app_state"
                ? [...st.estado].map(([key, value]) => ({
                    key,
                    value,
                    updated_at: st.carimbos.get(key),
                  }))
                : tabela === "proposal_themes"
                  ? [{ id: "tema-t" }, { id: "tema-u" }]
                  : [];
            return Promise.resolve(resolve({ data: desde > 0 ? [] : todas, error: null }));
          },
        };
        return b;
      },
      update: (novo: { value: unknown; updated_at: string }) => {
        let chave = "";
        let lido = "";
        const u = {
          eq(c: string, v: string) {
            if (c === "key") chave = v;
            else lido = v;
            return u;
          },
          is: () => u,
          select: async () => {
            if (st.carimbos.get(chave) !== lido) return { data: [], error: null };
            st.estado.set(chave, novo.value);
            st.carimbos.set(chave, novo.updated_at);
            return { data: [{ key: chave }], error: null };
          },
        };
        return u;
      },
    }),
  }),
}));
vi.mock("@/lib/proposals-store", () => ({
  listAllProposals: async () => [],
  updateProposalWith: async () => null,
}));
vi.mock("@/lib/reciclagem-store", () => ({
  listarReciclagem: async () => [],
  actualizarRetrato: async () => null,
}));
vi.mock("@/lib/repository", () => ({ isMissingTable: () => false }));
vi.mock("@/lib/biblioteca-fotos-store", () => ({
  getFoto: async () => null,
  garantirFoto: async () => ({}),
  deleteFoto: async () => {},
}));
vi.mock("@/lib/biblioteca-foto-etiquetas-store", () => ({
  etiquetasDaFoto: async () => [],
  etiquetar: async () => ({ criada: false }),
  desetiquetar: async () => true,
}));
vi.mock("@/lib/theme-storage", () => ({
  themeFolder: (id: string) => id,
  copyThemeImageToProposal: async () => null,
  deleteThemeImage: async () => true,
  deleteThemeFolder: async () => ({ ok: true, removed: 0 }),
  levarFotoParaAReciclagem: async () => true,
  apagarDerivadasOrfas: async () => {},
  transferThemeImage: async (from: string, destId: string) => ({
    outcome: "copied",
    to: `${destId}/${from.slice(from.indexOf("/") + 1)}`,
    thumb: true,
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { esquecerVarreduras, moverFotosDaBiblioteca } from "./theme-materializar";
import { juntarFotosDuplicadas } from "./juntar-fotos-duplicadas";

const manifesto: ManifestoDeFotografias = {
  geradoEm: "2026-11-14T03:00:00Z",
  buckets: [],
  ficheiros: 2,
  bytes: 0,
  completo: true,
  avisos: [],
  readme: "",
  entradas: [
    { chave: "theme-assets/tema-t/f0f0.jpg", bytes: 900, soma: "bbb", alteradoEm: "2026-08-01" },
    { chave: "proposal-assets/LIQ-1/copia.jpg", bytes: 900, soma: "bbb", alteradoEm: "2026-10-01" },
  ],
};

beforeEach(() => {
  st.estado.clear();
  st.carimbos.clear();
  esquecerVarreduras();
});

describe("Fase A → fundir o tema → o rascunho continua a apontar para uma foto que existe", () => {
  it("a `tema:` escrita pela junção passa para o tema de destino", async () => {
    grava("proposal-draft:LIQ-1", {
      doc: { coverImages: ["LIQ-1/copia.jpg"] },
      updatedAt: "2026-11-10T10:00:00Z",
    });

    await juntarFotosDuplicadas(manifesto, new Date("2026-11-14T03:00:00Z"));
    const depoisDaJuncao = st.estado.get("proposal-draft:LIQ-1") as { doc: unknown };
    expect(depoisDaJuncao.doc).toEqual({ coverImages: ["tema:tema-t/f0f0.jpg"] });

    // Fundir T em U é mover todas as fotos de T para U (`fundir/route.ts`).
    const r = await moverFotosDaBiblioteca(["tema-t/f0f0.jpg"], "tema-u");
    expect(r[0]).toMatchObject({ outcome: "copied", to: "tema-u/f0f0.jpg" });

    const fim = st.estado.get("proposal-draft:LIQ-1") as { doc: unknown };
    expect(fim.doc).toEqual({ coverImages: ["tema:tema-u/f0f0.jpg"] });
  });
});
