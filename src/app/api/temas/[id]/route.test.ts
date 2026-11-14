import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { ProposalTheme } from "@/lib/theme-types";

// ── Renomear / eliminar um tema ────────────────────────────────────────────
// O que aqui interessa: nomes equivalentes não podem coexistir (a biblioteca
// é escolhida a olho, dois "Itália" seriam indistinguíveis), e eliminar um
// tema só pode apagar os metadados DEPOIS de o Storage confirmar que as fotos
// saíram — senão ficavam fotos órfãs numa pasta sem dono.
const st = vi.hoisted(() => ({
  authed: true,
  themes: [] as ProposalTheme[],
  throwOnList: false,
  cleanup: { ok: true, removed: 0 },
  update: vi.fn(async (id: string, patch: Partial<ProposalTheme>) => {
    const t = st.themes.find((x) => x.id === id);
    return t ? { ...t, ...patch } : null;
  }),
  remove: vi.fn(async () => {}),
  folder: vi.fn(async () => st.cleanup),
  /** A Reciclagem em memória; `semTabela` é antes da migração. */
  reciclagem: [] as { id: string; tipo: string; origemId: string }[],
  semTabela: false,
  salvar: vi.fn(async () => true),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/themes-store", () => ({
  listThemes: vi.fn(async () => {
    if (st.throwOnList) throw new Error("db down");
    return st.themes;
  }),
  getTheme: vi.fn(async (id: string) => st.themes.find((t) => t.id === id) ?? null),
  updateTheme: st.update,
  deleteTheme: st.remove,
}));
vi.mock("@/lib/theme-storage", async () => {
  // Normalização de nomes real (é o que estamos a testar); só o Storage é falso.
  const real = await vi.importActual<typeof import("@/lib/theme-storage")>("@/lib/theme-storage");
  return { ...real, deleteThemeFolder: st.folder };
});
// Apagar passa pela Reciclagem (R3b). O motor é o verdadeiro; a tabela vive em
// memória, e a salvaguarda das propostas é falsa (tem testes próprios).
vi.mock("@/lib/reciclagem-store", () => ({
  guardarNaReciclagem: async (e: { id: string; tipo: string; origemId: string }) => {
    if (st.semTabela) {
      throw Object.assign(new Error('relation "public.reciclagem" does not exist'), {
        code: "42P01",
      });
    }
    st.reciclagem.push(e);
  },
  listarReciclagem: async () => st.reciclagem,
  obterDaReciclagem: async (id: string) => st.reciclagem.find((e) => e.id === id) ?? null,
  tirarDaReciclagem: async (id: string) => {
    st.reciclagem = st.reciclagem.filter((e) => e.id !== id);
  },
}));
vi.mock("@/lib/theme-materializar", async () => {
  const real = await vi.importActual<typeof import("@/lib/theme-materializar")>(
    "@/lib/theme-materializar",
  );
  return { ...real, salvarAntesDeReciclarOTema: st.salvar };
});
// Mesmo reconhecedor de 23505 do módulo real, sem arrastar a loja de faturas.
vi.mock("@/lib/invoices-store", () => ({
  isUniqueViolation: (err: unknown) =>
    !!err && typeof err === "object" && (err as { code?: string }).code === "23505",
}));

import { PATCH, DELETE } from "./route";

type Ctx = { params: Promise<{ id: string }> };

function patchReq(body: unknown, id = "t-1"): [NextRequest, Ctx] {
  const r = new Request(`https://liquen.test/api/temas/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  return [r, { params: Promise.resolve({ id }) }];
}

function deleteReq(id = "t-1"): [NextRequest, Ctx] {
  const r = new Request(`https://liquen.test/api/temas/${id}`, {
    method: "DELETE",
  }) as unknown as NextRequest;
  return [r, { params: Promise.resolve({ id }) }];
}

const theme = (id: string, name: string): ProposalTheme => ({
  id,
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

beforeEach(() => {
  st.authed = true;
  st.throwOnList = false;
  st.themes = [theme("t-1", "Terracotta"), theme("t-2", "Itália")];
  st.cleanup = { ok: true, removed: 0 };
  st.reciclagem = [];
  st.semTabela = false;
  vi.clearAllMocks();
  st.salvar.mockResolvedValue(true);
});

describe("PATCH /api/temas/[id]", () => {
  it("rejeita quem não está autenticado e nunca escreve", async () => {
    st.authed = false;
    expect((await PATCH(...patchReq({ name: "Novo" }))).status).toBe(401);
    expect(st.update).not.toHaveBeenCalled();
  });

  it("renomeia e anota", async () => {
    const res = await PATCH(...patchReq({ name: "Terracota Quente", notes: "tons de pedra" }));
    expect(res.status).toBe(200);
    expect(st.update).toHaveBeenCalledWith("t-1", {
      name: "Terracota Quente",
      notes: "tons de pedra",
    });
  });

  it("recusa um nome vazio", async () => {
    expect((await PATCH(...patchReq({ name: "  " }))).status).toBe(400);
    expect(st.update).not.toHaveBeenCalled();
  });

  it("deixa o tema manter o SEU próprio nome (não colide consigo mesmo)", async () => {
    expect((await PATCH(...patchReq({ name: "terracotta" }))).status).toBe(200);
  });

  it("recusa o nome de OUTRO tema, mesmo diferindo só nos acentos", async () => {
    const res = await PATCH(...patchReq({ name: "Italia" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Já existe um tema com um nome equivalente a "Italia".');
    expect(st.update).not.toHaveBeenCalled();
  });

  it("traduz o 23505 do índice único num 409 (corrida entre a verificação e a escrita)", async () => {
    st.update.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
    const res = await PATCH(...patchReq({ name: "Toscana" }));
    expect(res.status).toBe(409);
  });

  it("devolve 404 para um tema que não existe", async () => {
    expect((await PATCH(...patchReq({ notes: "x" }, "t-9"))).status).toBe(404);
  });

  it("escolhe a capa do cartão", async () => {
    const res = await PATCH(...patchReq({ coverPath: "t-1/8f14e45f.jpg" }));
    expect(res.status).toBe(200);
    expect(st.update).toHaveBeenCalledWith("t-1", { coverPath: "t-1/8f14e45f.jpg" });
  });

  it("recusa uma capa de OUTRO tema, uma travessia ou um URL — e não escreve nada", async () => {
    expect((await PATCH(...patchReq({ coverPath: "t-2/a.jpg" }))).status).toBe(400);
    expect(
      (await PATCH(...patchReq({ coverPath: "../proposal-assets/q-1/privada.jpg" }))).status,
    ).toBe(400);
    expect((await PATCH(...patchReq({ coverPath: "https://exemplo.pt/a.jpg" }))).status).toBe(400);
    expect((await PATCH(...patchReq({ coverPath: "t-1/nao-e-imagem.svg" }))).status).toBe(400);
    expect(st.update).not.toHaveBeenCalled();
  });

  it("limpa a capa com uma string vazia (volta à foto mais recente)", async () => {
    const res = await PATCH(...patchReq({ coverPath: "" }));
    expect(res.status).toBe(200);
    expect(st.update).toHaveBeenCalledWith("t-1", { coverPath: "" });
    // E não é devolvido um coverPath vazio, que não é caminho nenhum.
    expect((await res.json()).coverPath).toBeUndefined();
  });

  it("uma coluna cover_path em falta explica o passo do schema (503, não 500)", async () => {
    st.update.mockRejectedValueOnce(
      Object.assign(
        new Error(
          "Could not find the 'cover_path' column of 'proposal_themes' in the schema cache",
        ),
        { code: "PGRST204" },
      ),
    );
    const res = await PATCH(...patchReq({ coverPath: "t-1/a.jpg" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/db\/schema\.sql/);
  });

  it("devolve 500 tratado quando a base de dados falha", async () => {
    st.throwOnList = true;
    expect((await PATCH(...patchReq({ name: "Toscana" }))).status).toBe(500);
  });
});

describe("DELETE /api/temas/[id]", () => {
  it("rejeita quem não está autenticado e nunca toca no Storage", async () => {
    st.authed = false;
    expect((await DELETE(...deleteReq())).status).toBe(401);
    expect(st.folder).not.toHaveBeenCalled();
    expect(st.remove).not.toHaveBeenCalled();
  });

  it("devolve 404 para um tema que não existe, sem apagar nada", async () => {
    expect((await DELETE(...deleteReq("t-9"))).status).toBe(404);
    expect(st.folder).not.toHaveBeenCalled();
    expect(st.remove).not.toHaveBeenCalled();
  });

  it("vai para a Reciclagem: a linha sai, as fotos ficam na pasta", async () => {
    const res = await DELETE(...deleteReq());
    expect(res.status).toBe(200);
    const { reciclagem } = await res.json();
    expect(reciclagem).toEqual({ id: expect.any(String) });
    expect(st.salvar).toHaveBeenCalledWith("t-1");
    expect(st.remove).toHaveBeenCalledWith("t-1");
    // A pasta fica 30 dias: é ela que o «Repor» devolve.
    expect(st.folder).not.toHaveBeenCalled();
    expect(st.reciclagem).toMatchObject([{ id: reciclagem.id, tipo: "tema", origemId: "t-1" }]);
  });

  it("se as propostas não ficam a salvo, não sai nada — 502, e nada na Reciclagem", async () => {
    st.salvar.mockResolvedValueOnce(false);
    const res = await DELETE(...deleteReq());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/O tema NÃO foi eliminado/);
    expect(st.remove).not.toHaveBeenCalled();
    expect(st.reciclagem).toEqual([]);
  });

  describe("sem a tabela da Reciclagem (antes da migração), é o apagar de sempre", () => {
    beforeEach(() => {
      st.semTabela = true;
    });

    it("apaga as fotos primeiro e só depois os metadados", async () => {
      st.cleanup = { ok: true, removed: 7 };
      const res = await DELETE(...deleteReq());
      expect(res.status).toBe(200);
      expect((await res.json()).reciclagem).toBe(false);
      expect(st.folder).toHaveBeenCalledWith("t-1");
      expect(st.remove).toHaveBeenCalledWith("t-1");
    });

    it("NÃO elimina o tema quando a limpeza do Storage falha — 502 e nada perdido", async () => {
      st.cleanup = { ok: false, removed: 2 };
      const res = await DELETE(...deleteReq());
      expect(res.status).toBe(502);
      expect((await res.json()).error).toBe(
        "Não foi possível apagar as fotos do tema. O tema não foi eliminado — tenta de novo.",
      );
      expect(st.remove).not.toHaveBeenCalled();
    });

    it("devolve 500 tratado quando o Storage rebenta", async () => {
      st.folder.mockRejectedValueOnce(new Error("boom"));
      expect((await DELETE(...deleteReq())).status).toBe(500);
      expect(st.remove).not.toHaveBeenCalled();
    });
  });
});

// ── Ordem manual das fotos ─────────────────────────────────────────────────
// O mesmo guarda da capa e da remoção: um caminho de OUTRO tema aqui
// reordenaria fotos que não são deste.
describe("PATCH /api/temas/[id] — ordem das fotos", () => {
  it("guarda a ordem escolhida, sem repetições", async () => {
    st.authed = true;
    const res = await PATCH(
      ...patchReq({ photoOrder: ["t-1/b.jpg", "t-1/a.jpg", "t-1/b.jpg"] }, "t-1"),
    );
    expect(res.status).toBe(200);
    expect(st.update).toHaveBeenCalledWith(
      "t-1",
      expect.objectContaining({ photoOrder: ["t-1/b.jpg", "t-1/a.jpg"] }),
    );
  });

  it("recusa um caminho de outro tema", async () => {
    st.authed = true;
    const res = await PATCH(...patchReq({ photoOrder: ["t-2/a.jpg"] }, "t-1"));
    expect(res.status).toBe(400);
    expect(st.update).not.toHaveBeenCalled();
  });

  it("recusa travessia de diretórios", async () => {
    st.authed = true;
    expect((await PATCH(...patchReq({ photoOrder: ["../fora.jpg"] }, "t-1"))).status).toBe(400);
    expect(st.update).not.toHaveBeenCalled();
  });

  it("recusa o que não é uma lista", async () => {
    st.authed = true;
    expect((await PATCH(...patchReq({ photoOrder: "t-1/a.jpg" }, "t-1"))).status).toBe(400);
  });

  /**
   * Revisão de 14/11, n.º 7: a foto na Reciclagem não está na grelha, e a
   * ordem que o ecrã envia já não a traz. Guarda o lugar dela para quando for
   * reposta; a que saiu de vez não volta.
   */
  it("reordenar com uma foto na Reciclagem não lhe tira o lugar", async () => {
    st.authed = true;
    st.themes = [
      {
        id: "t-1",
        name: "Natal",
        photoOrder: ["t-1/a.jpg", "t-1/foi.jpg", "t-1/apagada.jpg", "t-1/b.jpg"],
      } as ProposalTheme,
    ];
    st.reciclagem = [{ id: "e-1", tipo: "foto-de-tema", origemId: "t-1/foi.jpg" }];
    const res = await PATCH(...patchReq({ photoOrder: ["t-1/b.jpg", "t-1/a.jpg"] }, "t-1"));
    expect(res.status).toBe(200);
    expect(st.update).toHaveBeenCalledWith(
      "t-1",
      expect.objectContaining({ photoOrder: ["t-1/b.jpg", "t-1/a.jpg", "t-1/foi.jpg"] }),
    );
  });

  it("uma lista vazia limpa a arrumação", async () => {
    st.authed = true;
    await PATCH(...patchReq({ photoOrder: [] }, "t-1"));
    expect(st.update).toHaveBeenCalledWith("t-1", expect.objectContaining({ photoOrder: [] }));
  });
});
