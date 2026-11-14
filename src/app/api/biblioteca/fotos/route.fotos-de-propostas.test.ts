import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Uma foto de PROPOSTA nunca aparece nem conta na Biblioteca (14/11).
 *
 * Em produção, 158 das 1355 linhas de `biblioteca_fotos` eram de pastas
 * `LIQ-…` (balde `proposal-assets`): entravam no `total`, falhavam ao assinar
 * no balde dos temas e a página vinha com menos fotos do que o limite. Aqui só
 * se simulam as leituras do fundo (tabela, temas, Storage) — o filtro que corre
 * é o verdadeiro.
 */

const TEMA = "3f6c1b2e-9a4d-4c7e-8f10-aa11bb22cc33";

const fotosNaTabela = vi.hoisted(() => ({ lista: [] as Array<Record<string, unknown>> }));
const assinadas = vi.hoisted(() => ({ caminhos: [] as string[][] }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/biblioteca-fotos-store", () => ({
  listFotos: async () => fotosNaTabela.lista,
}));
const temas = vi.hoisted(() => ({ falha: null as Error | null }));
vi.mock("@/lib/themes-store", () => ({
  listThemes: async () => {
    if (temas.falha) throw temas.falha;
    return [{ id: TEMA, name: "Itália" }];
  },
}));
vi.mock("@/lib/biblioteca-foto-etiquetas-store", () => ({
  listFotoEtiquetas: async () => [],
}));
vi.mock("@/lib/reciclagem", () => ({
  pastasDeTemasNaReciclagem: async () => new Set<string>(),
}));
vi.mock("@/lib/theme-storage", () => ({
  themeFolder: (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, ""),
  // O balde dos temas só assina o que lá está: um caminho de proposta não.
  signThemePaths: async (caminhos: string[]) => {
    assinadas.caminhos.push(caminhos);
    return new Map(
      caminhos.filter((c) => c.startsWith(`${TEMA}/`)).map((c) => [c, `https://x/${c}`]),
    );
  },
  signThemeThumbs: async () => new Map<string, string>(),
}));

import { GET } from "./route";

const foto = (path: string, createdAt: string) => ({
  path,
  pasta: path.split("/")[0],
  cor: "#c8a0a0",
  largura: 1600,
  altura: 1067,
  createdAt,
  updatedAt: createdAt,
});

const pedir = (qs = "") => GET(new NextRequest(`https://liquen.test/api/biblioteca/fotos${qs}`));

beforeEach(() => {
  assinadas.caminhos = [];
  temas.falha = null;
  // A ordem da tabela (mais recentes primeiro) põe as de proposta À FRENTE —
  // o caso que partia a primeira página.
  fotosNaTabela.lista = [
    foto("LIQ-2026-0412/a1b2.jpg", "2026-11-14T10:00:00Z"),
    foto("LIQ-2026-0412/c3d4.jpg", "2026-11-14T09:00:00Z"),
    foto("LIQ-2026-0399/e5f6.jpg", "2026-11-13T09:00:00Z"),
    foto(`${TEMA}/um.jpg`, "2026-11-01T09:00:00Z"),
    foto(`${TEMA}/dois.jpg`, "2026-10-01T09:00:00Z"),
    // Uma pasta que não é de tema nenhum (tema apagado sem Reciclagem).
    foto("pasta-orfa/tres.jpg", "2026-09-01T09:00:00Z"),
  ];
});

describe("/api/biblioteca/fotos — as fotos das propostas ficam de fora", () => {
  it("não lista nem conta uma foto de proposta", async () => {
    const res = await pedir();
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.total).toBe(2);
    expect(corpo.fotos.map((f: { path: string }) => f.path)).toEqual([
      `${TEMA}/um.jpg`,
      `${TEMA}/dois.jpg`,
    ]);
  });

  it("nem sequer pede ao Storage dos temas para assinar uma de proposta", async () => {
    await pedir();
    for (const c of assinadas.caminhos.flat()) expect(c.startsWith("LIQ-")).toBe(false);
  });

  it("uma página com limite vem cheia, mesmo com fotos de proposta à frente", async () => {
    const corpo = await (await pedir("?limit=1")).json();
    expect(corpo.total).toBe(2);
    expect(corpo.fotos).toHaveLength(1);
    expect(corpo.fotos[0].path).toBe(`${TEMA}/um.jpg`);
  });

  it("pedir a pasta de uma proposta não devolve nada", async () => {
    const corpo = await (await pedir("?pasta=LIQ-2026-0412")).json();
    expect(corpo.total).toBe(0);
    expect(corpo.fotos).toEqual([]);
  });

  it("se a leitura dos temas falha, responde com erro — nunca com a tabela inteira", async () => {
    temas.falha = new Error("base de dados em baixo");
    const res = await pedir();
    expect(res.status).toBeGreaterThanOrEqual(500);
    const corpo = await res.json();
    expect(corpo.fotos).toBeUndefined();
  });
});
