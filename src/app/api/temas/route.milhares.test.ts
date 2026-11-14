import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { ProposalTheme, ThemeSummary } from "@/lib/theme-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MILHARES DE TEMAS — o servidor só resume o que se vai desenhar (9/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela: a página dos temas «a aguentar milhares de temas». O resumo de cada
 * tema custa uma listagem do Storage; com 2000 temas eram 2000 por visita.
 * Acima de `LIMIAR_DE_RESUMOS`, o GET resume só os primeiros por nome, e a
 * `/api/temas/resumos` resume os outros aos bocados.
 */
const st = vi.hoisted(() => ({
  themes: [] as ProposalTheme[],
  listagens: 0,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/medir-cpu", () => ({ comCpu: (_r: string, fn: unknown) => fn }));
vi.mock("@/lib/themes-store", () => ({
  listThemes: vi.fn(async () => st.themes),
  createTheme: vi.fn(),
}));
vi.mock("@/lib/theme-storage", async () => {
  const real = await vi.importActual<typeof import("@/lib/theme-storage")>("@/lib/theme-storage");
  return {
    ...real,
    listThemeFiles: vi.fn(async () => {
      st.listagens += 1;
      return { names: ["a.jpg"], ok: true, truncated: false };
    }),
    signThemePaths: vi.fn(async (p: string[]) => new Map(p.map((x) => [x, `https://s/${x}`]))),
    signThemeThumbs: vi.fn(async () => new Map()),
  };
});
vi.mock("@/lib/biblioteca-fotos-store", () => ({
  lqipsECoresDeCaminhos: vi.fn(async () => ({
    lqips: new Map(),
    cores: new Map(),
    formas: new Map(),
  })),
}));
vi.mock("@/lib/invoices-store", () => ({ isUniqueViolation: () => false }));

import { GET } from "./route";
import { POST as RESUMOS } from "./resumos/route";
import { LIMIAR_DE_RESUMOS, RESUMOS_POR_PEDIDO } from "@/lib/temas-resumos";

const tema = (i: number): ProposalTheme => ({
  id: `t${i}`,
  name: `Tema ${String(i).padStart(4, "0")}`,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

beforeEach(() => {
  st.themes = [];
  st.listagens = 0;
});

describe("GET /api/temas com milhares de temas", () => {
  it("abaixo do limiar resume tudo, como sempre", async () => {
    st.themes = Array.from({ length: 40 }, (_, i) => tema(i));
    const r: ThemeSummary[] = await (
      await GET(new Request("https://l/api/temas") as unknown as NextRequest)
    ).json();
    expect(r).toHaveLength(40);
    expect(r.every((t) => !t.resumoPendente && t.imageCount === 1)).toBe(true);
    expect(st.listagens).toBe(40);
  });

  it("acima do limiar só lista as pastas dos primeiros por nome — os outros ficam por contar", async () => {
    st.themes = Array.from({ length: 2000 }, (_, i) => tema(1999 - i));
    const r: ThemeSummary[] = await (
      await GET(new Request("https://l/api/temas") as unknown as NextRequest)
    ).json();
    expect(r).toHaveLength(2000);
    expect(st.listagens).toBe(LIMIAR_DE_RESUMOS);
    const resumidos = r
      .filter((t) => !t.resumoPendente)
      .map((t) => t.name)
      .sort();
    expect(resumidos[0]).toBe("Tema 0000");
    expect(resumidos).toHaveLength(LIMIAR_DE_RESUMOS);
    // Por contar não é ilegível: o nome e o resto chegam, a contagem não.
    const pendente = r.find((t) => t.resumoPendente)!;
    expect(pendente.imageCount).toBeNull();
    expect(pendente.name).toMatch(/^Tema /);
  });
});

describe("POST /api/temas/resumos", () => {
  const pedir = (ids: unknown) =>
    RESUMOS(
      new Request("https://l/api/temas/resumos", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }) as unknown as NextRequest,
    );

  it("resume só os pedidos, no máximo um lote, e ignora os que não existem", async () => {
    st.themes = Array.from({ length: 500 }, (_, i) => tema(i));
    const ids = [...Array.from({ length: 100 }, (_, i) => `t${i}`), "nao-existe"];
    const r: ThemeSummary[] = await (await pedir(ids)).json();
    expect(r).toHaveLength(RESUMOS_POR_PEDIDO);
    expect(st.listagens).toBe(RESUMOS_POR_PEDIDO);
    expect(r.every((t) => t.imageCount === 1)).toBe(true);
  });

  it("um pedido sem ids não toca no Storage", async () => {
    st.themes = [tema(1)];
    expect(await (await pedir(undefined)).json()).toEqual([]);
    expect(st.listagens).toBe(0);
  });
});
