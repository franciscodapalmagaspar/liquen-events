import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MOVER UMA FOTO COM O ESTÚDIO ABERTO NOUTRO SEPARADOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Revisão do PR #448. O mover reescreve `tema:boho/a.jpg` → `tema:campestre/
 * a.jpg` no rascunho. Se o `updatedAt` ficasse o mesmo, o estúdio aberto
 * noutro separador (que leu o rascunho antes) gravava a seguir o seu documento
 * — com a referência ANTIGA — e a rota do rascunho não via escrita alheia
 * nenhuma: a foto partia.
 *
 * Aqui correm as duas peças verdadeiras — `moverFotosDaBiblioteca` e a rota
 * `PUT /proposta-rascunho` — sobre o mesmo `app-state` em memória.
 */

const st = vi.hoisted(() => ({
  estado: new Map<string, unknown>(),
}));

vi.mock("@/lib/app-state", () => ({
  getState: async (key: string) => st.estado.get(key) ?? null,
  setState: async (key: string, value: unknown) => {
    st.estado.set(key, value);
    return { gravado: true, duradouro: true, onde: "servidor" };
  },
  listStateByPrefix: async (prefix: string) => ({
    entradas: [...st.estado]
      .filter(([k]) => k.startsWith(prefix))
      .map(([key, value]) => ({ key, value })),
    completa: true,
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
vi.mock("@/lib/estado-do-pedido-servidor", () => ({
  marcarPropostaEmPreparacao: async () => null,
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true, ADMIN_NAME_COOKIE: "liquen_user" }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { esquecerVarreduras, moverFotosDaBiblioteca } from "./theme-materializar";
import { draftKey } from "./proposal-drafts";
import { PUT } from "@/app/api/orcamento/[id]/proposta-rascunho/route";

beforeEach(() => {
  st.estado.clear();
  esquecerVarreduras();
});

describe("o estúdio aberto não repõe a referência antiga depois de um mover", () => {
  it("a gravação seguinte, com a base antiga, junta campo a campo e fica `tema:campestre`", async () => {
    const antes = "2026-11-13T09:00:00.000Z";
    const docDoEstudio = { titulo: "Ana e João", capa: "tema:boho/a.jpg" };
    st.estado.set(draftKey("q-1"), { doc: docDoEstudio, updatedAt: antes });

    await moverFotosDaBiblioteca(["boho/a.jpg"], "campestre");

    // O separador antigo muda só o título, com o que leu às 09:00.
    const res = await PUT(
      new Request("https://liquen.test/api/orcamento/q-1/proposta-rascunho", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc: { ...docDoEstudio, titulo: "Ana & João" },
          baseUpdatedAt: antes,
          campos: ["titulo"],
          base: { titulo: "Ana e João" },
        }),
      }) as unknown as NextRequest,
      { params: Promise.resolve({ id: "q-1" }) },
    );
    expect(res.status).toBe(200);

    const gravado = st.estado.get(draftKey("q-1")) as { doc: Record<string, unknown> };
    expect(gravado.doc.capa).toBe("tema:campestre/a.jpg");
    expect(gravado.doc.titulo).toBe("Ana & João");
  });
});
