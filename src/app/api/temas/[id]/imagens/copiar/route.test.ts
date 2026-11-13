import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { ProposalTheme } from "@/lib/theme-types";
import { MAX_THEME_COPY_BATCH } from "@/lib/theme-types";

/**
 * LEVAR FOTOS DE UM TEMA PARA OUTRO — a rota.
 *
 * O foco aqui: os guardas (admin, Storage, os dois temas, o modo obrigatório) e
 * as três propriedades que fazem isto ser seguro de repetir —
 *   · um caminho de OUTRO tema é recusado ANTES de o Storage ser tocado;
 *   · repetir o mesmo lote devolve tudo em `existing` e não duplica nada;
 *   · uma falha parcial reporta com honestidade quem ficou onde.
 *
 * A primitiva (`transferThemeImage`) é testada em `theme-storage.test.ts`; aqui
 * é um duplo, para se poderem encenar falhas e colisões.
 */
const st = vi.hoisted(() => ({
  authed: true,
  dbConfigured: true,
  themes: [] as ProposalTheme[],
  /** Caminhos cuja transferência falha. */
  fails: new Set<string>(),
  /** Caminhos que JÁ estão no destino (409 do Storage). */
  exists: new Set<string>(),
  /** Caminhos que chegam ao destino sem miniatura. */
  noThumb: new Set<string>(),
  updates: [] as { id: string; patch: Record<string, unknown> }[],
  updateThrows: null as Error | null,
  transfer: vi.fn(async (from: string, destId: string) => {
    const to = `${destId}/${from.slice(from.indexOf("/") + 1)}`;
    if (st.fails.has(from)) return { outcome: "failed" as const, to, thumb: false };
    if (st.exists.has(from)) return { outcome: "exists" as const, to, thumb: true };
    return { outcome: "copied" as const, to, thumb: !st.noThumb.has(from) };
  }),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/supabase", () => ({ isDatabaseConfigured: () => st.dbConfigured }));
// A porta do mover (`theme-materializar.ts`) tem testes próprios; aqui faz o
// que a primitiva faria, foto a foto, para a rota ser testada sozinha.
vi.mock("@/lib/theme-materializar", () => ({
  moverFotosDaBiblioteca: vi.fn(async (paths: string[], destino: string) => {
    const saida = [];
    for (const p of paths)
      saida.push(
        await (st.transfer as (...a: unknown[]) => ReturnType<typeof st.transfer>)(
          p,
          destino,
          "move",
        ),
      );
    return saida;
  }),
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/themes-store", () => ({
  getTheme: vi.fn(async (id: string) => st.themes.find((t) => t.id === id) ?? null),
  updateTheme: vi.fn(async (id: string, patch: Record<string, unknown>) => {
    if (st.updateThrows) throw st.updateThrows;
    st.updates.push({ id, patch });
    return st.themes.find((t) => t.id === id) ?? null;
  }),
}));
vi.mock("@/lib/theme-storage", async () => {
  // As funções puras de caminho são as REAIS: é o guarda que se está a testar.
  const real = await vi.importActual<typeof import("@/lib/theme-storage")>("@/lib/theme-storage");
  return { ...real, transferThemeImage: st.transfer };
});

import { POST } from "./route";

type Ctx = { params: Promise<{ id: string }> };

function req(body: unknown, id = "t-1"): [NextRequest, Ctx] {
  const r = new Request(`https://liquen.test/api/temas/${id}/imagens/copiar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  return [r, { params: Promise.resolve({ id }) }];
}

const theme = (id: string, name: string, extra: Partial<ProposalTheme> = {}): ProposalTheme => ({
  id,
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

const copy = (paths: string[], destino = "t-2") => ({ paths, destino, modo: "copiar" });
const move = (paths: string[], destino = "t-2") => ({ paths, destino, modo: "mover" });

beforeEach(() => {
  st.authed = true;
  st.dbConfigured = true;
  st.themes = [theme("t-1", "Terracotta"), theme("t-2", "Itália")];
  st.fails = new Set();
  st.exists = new Set();
  st.noThumb = new Set();
  st.updates = [];
  st.updateThrows = null;
  vi.clearAllMocks();
});

describe("guardas", () => {
  it("rejeita quem não está autenticado e nunca toca no Storage", async () => {
    st.authed = false;
    expect((await POST(...req(copy(["t-1/a.jpg"])))).status).toBe(401);
    expect(st.transfer).not.toHaveBeenCalled();
  });

  it("devolve 503 quando o Storage não está configurado", async () => {
    st.dbConfigured = false;
    expect((await POST(...req(copy(["t-1/a.jpg"])))).status).toBe(503);
    expect(st.transfer).not.toHaveBeenCalled();
  });

  it("404 quando a ORIGEM não existe", async () => {
    expect((await POST(...req(copy(["t-9/a.jpg"]), "t-9"))).status).toBe(404);
  });

  it("404 quando o DESTINO não existe", async () => {
    const res = await POST(...req(copy(["t-1/a.jpg"], "t-9")));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Tema de destino não encontrado.");
    expect(st.transfer).not.toHaveBeenCalled();
  });

  it("o modo é OBRIGATÓRIO — um 'mover' nunca sai de um campo em falta", async () => {
    for (const modo of [undefined, "", "transferir", "move", null]) {
      const res = await POST(...req({ paths: ["t-1/a.jpg"], destino: "t-2", modo }));
      expect(res.status).toBe(400);
    }
    expect(st.transfer).not.toHaveBeenCalled();
  });

  it("400 quando a origem e o destino são o mesmo tema", async () => {
    const res = await POST(...req(copy(["t-1/a.jpg"], "t-1")));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("A origem e o destino são o mesmo tema.");
    expect(st.transfer).not.toHaveBeenCalled();
  });

  it("recusa um caminho de OUTRO tema — e o Storage fica por tocar", async () => {
    // É a mesma linha de guarda que o DELETE de fotos e o PATCH da ordem já
    // usam. Sem ela, um pedido feito à mão levava fotos de qualquer tema.
    for (const bad of [
      "t-3/a.jpg",
      "../proposal-assets/q-1/privada.jpg",
      "https://exemplo.pt/a.jpg",
      "t-1/sub/a.jpg",
      "",
      42,
    ]) {
      const res = await POST(...req(copy(["t-1/boa.jpg", bad as string])));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Caminho inválido.");
    }
    expect(st.transfer).not.toHaveBeenCalled();
  });

  it("recusa acima do teto do lote, em vez de cortar em silêncio", async () => {
    const paths = Array.from({ length: MAX_THEME_COPY_BATCH + 1 }, (_, i) => `t-1/f${i}.jpg`);
    const res = await POST(...req(copy(paths)));
    expect(res.status).toBe(400);
    expect(st.transfer).not.toHaveBeenCalled();
  });

  it("aceita exatamente o teto", async () => {
    const paths = Array.from({ length: MAX_THEME_COPY_BATCH }, (_, i) => `t-1/f${i}.jpg`);
    expect((await POST(...req(copy(paths)))).status).toBe(200);
    expect(st.transfer).toHaveBeenCalledTimes(MAX_THEME_COPY_BATCH);
  });

  it("400 sem fotos nenhumas", async () => {
    expect((await POST(...req(copy([])))).status).toBe(400);
    expect((await POST(...req({ destino: "t-2", modo: "copiar" }))).status).toBe(400);
  });

  it("desduplica os caminhos repetidos do pedido", async () => {
    const res = await POST(...req(copy(["t-1/a.jpg", "t-1/a.jpg", "t-1/b.jpg"])));
    expect((await res.json()).requested).toBe(2);
    expect(st.transfer).toHaveBeenCalledTimes(2);
  });
});

describe("copiar", () => {
  it("copia preservando o nome e diz para onde foi cada uma", async () => {
    const res = await POST(...req(copy(["t-1/a.jpg", "t-1/b.jpg"])));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      copied: [
        { from: "t-1/a.jpg", to: "t-2/a.jpg" },
        { from: "t-1/b.jpg", to: "t-2/b.jpg" },
      ],
      existing: [],
      failed: [],
      requested: 2,
      thumbsMissing: 0,
    });
    expect(st.transfer).toHaveBeenCalledWith("t-1/a.jpg", "t-2", "copy");
  });

  it("NÃO mexe na ordem manual nem na capa da origem", async () => {
    st.themes = [
      theme("t-1", "Terracotta", { photoOrder: ["t-1/a.jpg"], coverPath: "t-1/a.jpg" }),
      theme("t-2", "Itália"),
    ];
    await POST(...req(copy(["t-1/a.jpg"])));
    expect(st.updates).toEqual([]);
  });

  it("REPETIR o mesmo lote devolve tudo em `existing` e copia zero", async () => {
    // É a propriedade que faz o "Tentar novamente" ser seguro: o nome é o
    // mesmo, portanto a segunda passagem é uma colisão de chave, não um
    // duplicado invisível na grelha.
    st.exists = new Set(["t-1/a.jpg", "t-1/b.jpg"]);
    const body = await (await POST(...req(copy(["t-1/a.jpg", "t-1/b.jpg"])))).json();
    expect(body.copied).toEqual([]);
    expect(body.existing).toEqual(["t-1/a.jpg", "t-1/b.jpg"]);
    expect(body.failed).toEqual([]);
  });

  it("uma falha parcial põe cada foto no campo certo", async () => {
    st.fails = new Set(["t-1/b.jpg"]);
    st.exists = new Set(["t-1/c.jpg"]);
    const body = await (await POST(...req(copy(["t-1/a.jpg", "t-1/b.jpg", "t-1/c.jpg"])))).json();
    expect(body.copied).toEqual([{ from: "t-1/a.jpg", to: "t-2/a.jpg" }]);
    expect(body.failed).toEqual(["t-1/b.jpg"]);
    expect(body.existing).toEqual(["t-1/c.jpg"]);
  });

  it("conta as miniaturas que ficaram por levar", async () => {
    // Sem miniatura, o destino puxa ORIGINAIS: 164 MB por página de 60 em vez
    // de 1,78 MB. Se acontecer em massa, ela tem de saber porquê.
    st.noThumb = new Set(["t-1/a.jpg", "t-1/b.jpg"]);
    const body = await (await POST(...req(copy(["t-1/a.jpg", "t-1/b.jpg"])))).json();
    expect(body.thumbsMissing).toBe(2);
  });

  it("502 só quando NADA aconteceu", async () => {
    st.fails = new Set(["t-1/a.jpg", "t-1/b.jpg"]);
    expect((await POST(...req(copy(["t-1/a.jpg", "t-1/b.jpg"])))).status).toBe(502);
  });

  it("uma única foto que já lá estava NÃO é um 502", async () => {
    st.fails = new Set(["t-1/a.jpg"]);
    st.exists = new Set(["t-1/b.jpg"]);
    expect((await POST(...req(copy(["t-1/a.jpg", "t-1/b.jpg"])))).status).toBe(200);
  });
});

describe("mover", () => {
  it("usa o modo `move` da primitiva", async () => {
    await POST(...req(move(["t-1/a.jpg"])));
    expect(st.transfer).toHaveBeenCalledWith("t-1/a.jpg", "t-2", "move");
  });

  it("tira da ordem manual da origem SÓ os que saíram mesmo", async () => {
    // Sem isto, o `planOrderedPage` metia caminhos mortos na página e a
    // primeira página da origem voltava CURTA.
    st.themes = [
      theme("t-1", "Terracotta", {
        photoOrder: ["t-1/a.jpg", "t-1/b.jpg", "t-1/c.jpg", "t-1/d.jpg"],
      }),
      theme("t-2", "Itália"),
    ];
    st.fails = new Set(["t-1/b.jpg"]);
    st.exists = new Set(["t-1/c.jpg"]);
    await POST(...req(move(["t-1/a.jpg", "t-1/b.jpg", "t-1/c.jpg"])));
    expect(st.updates).toEqual([
      { id: "t-1", patch: { photoOrder: ["t-1/b.jpg", "t-1/c.jpg", "t-1/d.jpg"] } },
    ]);
  });

  it("limpa a capa da origem quando foi ela que saiu", async () => {
    st.themes = [theme("t-1", "Terracotta", { coverPath: "t-1/a.jpg" }), theme("t-2", "Itália")];
    await POST(...req(move(["t-1/a.jpg"])));
    expect(st.updates).toEqual([{ id: "t-1", patch: { coverPath: "" } }]);
  });

  it("não escreve nada quando não havia arrumação a limpar", async () => {
    await POST(...req(move(["t-1/a.jpg"])));
    expect(st.updates).toEqual([]);
  });

  it("UM MOVER JÁ CONCLUÍDO não pode virar 503 por causa de arrumação", async () => {
    // O `updateTheme` escreve colunas que podem não existir numa base sem o
    // db/schema.sql corrido. As fotos JÁ mudaram de sítio: reportar falha
    // seria o pior resultado possível.
    st.themes = [theme("t-1", "Terracotta", { photoOrder: ["t-1/a.jpg"] }), theme("t-2", "Itália")];
    st.updateThrows = new Error("column photo_order does not exist");
    const res = await POST(...req(move(["t-1/a.jpg"])));
    expect(res.status).toBe(200);
    expect((await res.json()).copied).toEqual([{ from: "t-1/a.jpg", to: "t-2/a.jpg" }]);
  });

  it("nada saiu → nada se limpa na origem", async () => {
    st.themes = [theme("t-1", "Terracotta", { photoOrder: ["t-1/a.jpg"] }), theme("t-2", "Itália")];
    st.exists = new Set(["t-1/a.jpg"]);
    await POST(...req(move(["t-1/a.jpg"])));
    expect(st.updates).toEqual([]);
  });
});
