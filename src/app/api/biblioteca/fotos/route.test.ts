import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * A LISTAGEM DA BIBLIOTECA SÓ MOSTRA FOTOS DA BIBLIOTECA (14/11).
 *
 * A `biblioteca_fotos` guarda também as fotos das propostas (`LIQ-…/…`): o
 * estúdio grava lá a cor, o LQIP e a forma de cada uma. Antes disto, a rota
 * contava-as no `total` (158 a mais em 1 355) e cortava a página COM elas lá
 * dentro; como não se assinam no bucket dos temas, saíam depois do corte — e a
 * página vinha com buracos (pedia-se 60, chegavam menos).
 */

type F = { path: string; pasta: string };
const H = vi.hoisted(() => ({ fotos: [] as F[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/biblioteca-fotos-store", () => ({ listFotos: async () => H.fotos }));
vi.mock("@/lib/biblioteca-foto-etiquetas-store", () => ({ listFotoEtiquetas: async () => [] }));
vi.mock("@/lib/reciclagem", () => ({ pastasDeTemasNaReciclagem: async () => new Set<string>() }));
// O bucket dos temas só assina o que lá existe: um caminho de pedido não.
const assina = async (caminhos: string[]) =>
  new Map(caminhos.filter((c) => !c.startsWith("LIQ-")).map((c) => [c, `https://x/${c}`]));
vi.mock("@/lib/theme-storage", () => ({ signThemePaths: assina, signThemeThumbs: assina }));

const { GET } = await import("./route");

const pedir = async (qs = "") => {
  const r = await GET(new NextRequest(`http://localhost/api/biblioteca/fotos${qs}`));
  return (await r.json()) as { total: number; fotos: { path: string }[] };
};

beforeEach(() => {
  // Intercaladas, como na tabela (ordenada por data): tema, pedido, tema, pedido…
  H.fotos = Array.from({ length: 6 }, (_, i) =>
    i % 2 === 0
      ? { path: `0b6f2c1e-tema/${i}.jpg`, pasta: "0b6f2c1e-tema" }
      : { path: `LIQ-MT7CWVWU-C4BFD3877E978CFF/${i}.jpg`, pasta: "LIQ-MT7CWVWU-C4BFD3877E978CFF" },
  );
});

describe("GET /api/biblioteca/fotos", () => {
  it("o total conta só as fotos dos temas, não as das propostas", async () => {
    const r = await pedir();
    expect(r.total).toBe(3);
    expect(r.fotos.every((f) => !f.path.startsWith("LIQ-"))).toBe(true);
  });

  it("uma página pedida vem cheia — as fotos das propostas não abrem buracos", async () => {
    const r = await pedir("?limit=2&offset=0");
    expect(r.fotos.map((f) => f.path)).toEqual(["0b6f2c1e-tema/0.jpg", "0b6f2c1e-tema/2.jpg"]);
    const seguinte = await pedir("?limit=2&offset=2");
    expect(seguinte.fotos.map((f) => f.path)).toEqual(["0b6f2c1e-tema/4.jpg"]);
  });
});
