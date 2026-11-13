import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { ProposalTheme } from "@/lib/theme-types";
import { THEME_MERGE_BATCH } from "@/lib/theme-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * JUNTAR DOIS TEMAS NUM SÓ — a rota
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que se prende aqui é o que distingue uma fusão de um «Copiar para…» com
 * tudo selecionado, que é onde as decisões estão:
 *
 *  · a pasta ENCOLHE a cada lote, por isso o deslocamento seguinte conta as
 *    que FICARAM e não as que passaram — sem isto, uma repetida era tentada
 *    outra vez em cada chamada e a fusão nunca acabava;
 *  · uma pasta ILEGÍVEL não é uma pasta vazia. É a diferença entre «acabou» e
 *    «o Storage está em baixo», e a primeira arquivava um tema cheio;
 *  · só se arquiva o que ficou mesmo VAZIO — e nenhuma fotografia é apagada,
 *    em circunstância nenhuma;
 *  · a nota escrita à mão não se perde: é a única coisa da origem que não está
 *    em mais lado nenhum.
 */
const st = vi.hoisted(() => ({
  authed: true,
  dbConfigured: true,
  themes: [] as ProposalTheme[],
  /** O conteúdo da pasta de cada tema, pela ordem em que o Storage a devolve. */
  pastas: new Map<string, string[]>(),
  /** A listagem falha (Storage em baixo). */
  listaAvariada: false,
  fails: new Set<string>(),
  exists: new Set<string>(),
  noThumb: new Set<string>(),
  updates: [] as { id: string; patch: Record<string, unknown> }[],
  transfer: vi.fn(async (from: string, destId: string) => {
    const to = `${destId}/${from.slice(from.indexOf("/") + 1)}`;
    if (st.fails.has(from)) return { outcome: "failed" as const, to, thumb: false };
    if (st.exists.has(from)) return { outcome: "exists" as const, to, thumb: true };
    // Mover é mover: a foto sai mesmo da pasta de origem. É esta linha que faz
    // o teste do `nextOffset` valer alguma coisa.
    const folder = from.slice(0, from.indexOf("/"));
    const nome = from.slice(from.indexOf("/") + 1);
    st.pastas.set(
      folder,
      (st.pastas.get(folder) ?? []).filter((n) => n !== nome),
    );
    st.pastas.set(destId, [...(st.pastas.get(destId) ?? []), nome]);
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
    st.updates.push({ id, patch });
    const t = st.themes.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
    return t ?? null;
  }),
}));
vi.mock("@/lib/theme-storage", async () => {
  const real = await vi.importActual<typeof import("@/lib/theme-storage")>("@/lib/theme-storage");
  return {
    ...real,
    transferThemeImage: st.transfer,
    countThemeFiles: vi.fn(async (themeId: string) => {
      if (st.listaAvariada) return { total: 0, ok: false, truncated: false };
      return { total: (st.pastas.get(themeId) ?? []).length, ok: true, truncated: false };
    }),
    listThemeObjects: vi.fn(async (themeId: string, limit: number, offset: number) => {
      if (st.listaAvariada) return { objects: [], ok: false, truncated: false };
      const todos = st.pastas.get(themeId) ?? [];
      const pagina = todos.slice(offset, offset + limit);
      return {
        objects: pagina.map((name) => ({ name, md5: null })),
        ok: true,
        truncated: pagina.length >= limit,
      };
    }),
  };
});

import { POST } from "./route";

type Ctx = { params: Promise<{ id: string }> };

function req(body: unknown, id = "t-1"): [NextRequest, Ctx] {
  const r = new Request(`https://liquen.test/api/temas/${id}/fundir`, {
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

const fotos = (n: number, prefixo = "f") =>
  Array.from({ length: n }, (_, i) => `${prefixo}${i}.jpg`);

beforeEach(() => {
  st.authed = true;
  st.dbConfigured = true;
  st.listaAvariada = false;
  st.themes = [theme("t-1", "Italia"), theme("t-2", "Itália")];
  st.pastas = new Map([
    ["t-1", fotos(3)],
    ["t-2", []],
  ]);
  st.fails.clear();
  st.exists.clear();
  st.noThumb.clear();
  st.updates = [];
  st.transfer.mockClear();
});

describe("os guardas", () => {
  it("sem sessão, 401 — e o Storage nem é tocado", async () => {
    st.authed = false;
    const res = await POST(...req({ destino: "t-2" }));
    expect(res.status).toBe(401);
    expect(st.transfer).not.toHaveBeenCalled();
  });

  it("sem Supabase configurado, 503 com o que fazer", async () => {
    st.dbConfigured = false;
    const res = await POST(...req({ destino: "t-2" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/SUPABASE_URL/);
  });

  it("origem inexistente, 404", async () => {
    const res = await POST(...req({ destino: "t-2" }, "nao-existe"));
    expect(res.status).toBe(404);
  });

  it("destino inexistente, 404", async () => {
    const res = await POST(...req({ destino: "nao-existe" }));
    expect(res.status).toBe(404);
    expect(st.transfer).not.toHaveBeenCalled();
  });

  it("fundir um tema consigo próprio é 400", async () => {
    const res = await POST(...req({ destino: "t-1" }));
    expect(res.status).toBe(400);
  });

  /** Um tema de filtro não tem pasta: as fotos dele são de outros temas. */
  it("um tema de filtro não se funde", async () => {
    st.themes[0] = theme("t-1", "Verdes", { kind: "filtro" });
    const res = await POST(...req({ destino: "t-2" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/filtro/i);
    expect(st.transfer).not.toHaveBeenCalled();
  });

  /**
   * A DIFERENÇA QUE ARQUIVAVA UM TEMA CHEIO.
   *
   * `ok: false` é «não consegui ler», e uma pasta que não se leu tem zero
   * objectos na resposta — exactamente como uma pasta vazia. Confundi-las era
   * ver a fusão declarar-se concluída e tirar da lista um tema com 800 fotos.
   */
  it("pasta ilegível é 502, e não «acabou»", async () => {
    st.listaAvariada = true;
    const res = await POST(...req({ destino: "t-2" }));
    expect(res.status).toBe(502);
    expect(st.updates).toEqual([]);
  });
});

describe("um lote", () => {
  it("leva as fotos e arquiva a origem quando ela fica vazia", async () => {
    const res = await POST(...req({ destino: "t-2" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.moved).toBe(3);
    expect(data.done).toBe(true);
    expect(data.leftBehind).toBe(0);
    expect(data.archived).toBe(true);
    expect(st.pastas.get("t-2")).toHaveLength(3);
    expect(st.updates).toContainEqual({ id: "t-1", patch: { arquivado: true } });
  });

  /** Arquivar é arrumar. Apagar leva as fotos atrás e não se desfaz. */
  it("nunca apaga o tema de origem", async () => {
    await POST(...req({ destino: "t-2" }));
    expect(st.themes.find((t) => t.id === "t-1")).toBeTruthy();
  });

  it("com mais fotos do que um lote, diz que ainda não acabou", async () => {
    st.pastas.set("t-1", fotos(THEME_MERGE_BATCH + 5));
    const data = await (await POST(...req({ destino: "t-2" }))).json();
    expect(data.moved).toBe(THEME_MERGE_BATCH);
    expect(data.done).toBe(false);
    expect(data.archived).toBe(false);
    // Nada ficou para trás: a chamada seguinte volta a listar do princípio.
    expect(data.nextOffset).toBe(0);
  });

  it("uma foto sem miniatura é contada — o destino passa a puxar originais", async () => {
    st.noThumb.add("t-1/f1.jpg");
    const data = await (await POST(...req({ destino: "t-2" }))).json();
    expect(data.thumbsMissing).toBe(1);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE FICA PARA TRÁS
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("as que não saem", () => {
  it("uma repetida fica na origem, e a origem não é arquivada", async () => {
    st.exists.add("t-1/f1.jpg");
    const data = await (await POST(...req({ destino: "t-2" }))).json();
    expect(data.moved).toBe(2);
    expect(data.existing).toBe(1);
    expect(data.done).toBe(true);
    expect(data.leftBehind).toBe(1);
    expect(data.archived).toBe(false);
    expect(st.pastas.get("t-1")).toEqual(["f1.jpg"]);
    expect(st.updates.some((u) => "arquivado" in u.patch)).toBe(false);
  });

  it("uma que falhou também trava o arquivo", async () => {
    st.fails.add("t-1/f2.jpg");
    const data = await (await POST(...req({ destino: "t-2" }))).json();
    expect(data.failed).toBe(1);
    expect(data.archived).toBe(false);
  });

  /**
   * O DESLOCAMENTO QUE FAZ A FUSÃO ACABAR.
   *
   * Sem ele, o segundo lote listava outra vez do zero, apanhava a repetida à
   * cabeça e ficava a tentá-la para sempre.
   */
  it("o deslocamento seguinte salta as que ficaram", async () => {
    st.pastas.set("t-1", fotos(THEME_MERGE_BATCH + 3));
    st.exists.add("t-1/f0.jpg");
    st.fails.add("t-1/f1.jpg");
    const data = await (await POST(...req({ destino: "t-2" }))).json();
    expect(data.nextOffset).toBe(2);
    // E a chamada seguinte, a partir daí, apanha o resto — não as duas de novo.
    const segunda = await (await POST(...req({ destino: "t-2", offset: 2 }))).json();
    expect(segunda.moved).toBe(3);
    expect(segunda.done).toBe(true);
    expect(segunda.leftBehind).toBe(2);
    expect(segunda.archived).toBe(false);
  });
});

describe("a arrumação", () => {
  it("a ordem manual da origem perde as fotos que saíram", async () => {
    st.themes[0] = theme("t-1", "Italia", { photoOrder: ["t-1/f0.jpg", "t-1/f2.jpg"] });
    await POST(...req({ destino: "t-2" }));
    const patch = st.updates.find((u) => u.id === "t-1" && "photoOrder" in u.patch);
    expect(patch?.patch.photoOrder).toEqual([]);
  });

  it("a capa da origem, se saiu, deixa de ser capa", async () => {
    st.themes[0] = theme("t-1", "Italia", { coverPath: "t-1/f0.jpg" });
    await POST(...req({ destino: "t-2" }));
    const patch = st.updates.find((u) => u.id === "t-1" && "coverPath" in u.patch);
    expect(patch?.patch.coverPath).toBe("");
  });

  /**
   * Um destino que estava por DATA continua por data. Dar-lhe ordem manual
   * aqui congelava-o na ordem em que a fusão calhou de correr.
   */
  it("um destino sem ordem manual não ganha uma", async () => {
    await POST(...req({ destino: "t-2" }));
    expect(st.updates.some((u) => u.id === "t-2" && "photoOrder" in u.patch)).toBe(false);
  });

  it("um destino arrumado à mão recebe as novas ao FIM", async () => {
    st.themes[1] = theme("t-2", "Itália", { photoOrder: ["t-2/a.jpg"] });
    await POST(...req({ destino: "t-2" }));
    const patch = st.updates.find((u) => u.id === "t-2" && "photoOrder" in u.patch);
    expect(patch?.patch.photoOrder).toEqual([
      "t-2/a.jpg",
      "t-2/f0.jpg",
      "t-2/f1.jpg",
      "t-2/f2.jpg",
    ]);
  });

  /** A nota é escrita à mão e não está em mais lado nenhum. */
  it("a nota da origem passa para o destino, com a proveniência", async () => {
    st.themes[0] = theme("t-1", "Italia", { notes: "tons quentes" });
    st.themes[1] = theme("t-2", "Itália", { notes: "pedra e verde" });
    await POST(...req({ destino: "t-2" }));
    const patch = st.updates.find((u) => u.id === "t-2" && "notes" in u.patch);
    expect(patch?.patch.notes).toBe('pedra e verde\n\nDe "Italia": tons quentes');
  });

  it("uma nota que já lá está não se repete", async () => {
    st.themes[0] = theme("t-1", "Italia", { notes: "tons quentes" });
    st.themes[1] = theme("t-2", "Itália", { notes: "tons quentes" });
    await POST(...req({ destino: "t-2" }));
    expect(st.updates.some((u) => u.id === "t-2" && "notes" in u.patch)).toBe(false);
  });

  it("sem nota na origem, o destino fica como estava", async () => {
    st.themes[1] = theme("t-2", "Itália", { notes: "pedra e verde" });
    await POST(...req({ destino: "t-2" }));
    expect(st.updates.some((u) => u.id === "t-2" && "notes" in u.patch)).toBe(false);
  });
});
