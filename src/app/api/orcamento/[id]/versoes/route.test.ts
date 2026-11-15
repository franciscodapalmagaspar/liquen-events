import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * O histórico de uma negociação. O que se prende aqui é a ORDEM (comparar cada
 * versão com a que veio antes, não com a que veio depois) e o que a resposta
 * carrega — a lista não leva documentos, e o restauro leva um só.
 */

const authed = vi.hoisted(() => ({ ok: true }));
const store = vi.hoisted(() => ({ list: vi.fn(async () => [] as unknown[]) }));

vi.mock("@/lib/admin-auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin-auth")>()),
  isAuthed: () => authed.ok,
}));
vi.mock("@/lib/proposals-store", () => ({ listProposalsForQuote: store.list }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const { GET } = await import("./route");

const pedir = (query = "") =>
  GET({ nextUrl: new URL(`http://x/api/orcamento/LIQ-1/versoes${query}`) } as NextRequest, {
    params: Promise.resolve({ id: "LIQ-1" }),
  });

/** Uma proposta enviada, com documento. */
const enviada = (id: string, createdAt: string, total: number, doc: Record<string, unknown>) => ({
  id,
  createdAt,
  sentAt: createdAt,
  total,
  status: "enviada",
  doc,
});

// Como a store as devolve: da mais recente para a mais antiga.
const TRES = [
  enviada("v3", "2026-03-01T10:00:00.000Z", 9500, {
    totalAmount: 9500,
    budgetItems: ["Flores"],
    budgetAmounts: [2500],
  }),
  enviada("v2", "2026-02-01T10:00:00.000Z", 8800, {
    totalAmount: 8800,
    budgetItems: ["Flores"],
    budgetAmounts: [1800],
  }),
  enviada("v1", "2026-01-01T10:00:00.000Z", 8000, {
    totalAmount: 8000,
    budgetItems: ["Flores"],
    budgetAmounts: [1000],
  }),
];

beforeEach(() => {
  authed.ok = true;
  store.list.mockReset();
  store.list.mockResolvedValue([]);
});

describe("a lista", () => {
  it("compara cada versão com a ANTERIOR, não com a seguinte", async () => {
    store.list.mockResolvedValue(TRES);
    const body = await (await pedir()).json();

    // Vem da mais recente para a mais antiga — é a ordem por que se lê.
    expect(body.versoes.map((v: { id: string }) => v.id)).toEqual(["v3", "v2", "v1"]);

    // O preço SUBIU de 8800 para 9500. Comparar ao contrário (que é o que a
    // ordem da store dá de graça) dizia o inverso, e essa frase ia ao telefone.
    const v3 = body.versoes[0];
    expect(v3.resumo).toContain("8\u00A0800");
    expect(v3.resumo.indexOf("8\u00A0800")).toBeLessThan(v3.resumo.indexOf("9\u00A0500"));
  });

  it("a primeira versão não inventa alterações", async () => {
    store.list.mockResolvedValue(TRES);
    const body = await (await pedir()).json();
    const v1 = body.versoes[2];
    expect(v1.mudancas).toEqual([]);
    // "Sem alterações" numa primeira versão leria-se como "não mudou nada desde
    // a anterior" — e anterior não há.
    expect(v1.resumo).toBe("Primeira versão enviada");
  });

  it("não carrega os documentos", async () => {
    // Cada documento chega aos 18 KB. A lista é para ser vista de relance; se
    // levasse os documentos todos, ver o histórico custava meio megabyte.
    store.list.mockResolvedValue(TRES);
    const body = await (await pedir()).json();
    expect(body.versoes.every((v: Record<string, unknown>) => !("doc" in v))).toBe(true);
  });

  it("ignora propostas sem documento", async () => {
    // Uma proposta de linhas (a antiga) não é uma versão de nada: não há o que
    // comparar nem o que restaurar, e na lista seria uma entrada que não abre.
    store.list.mockResolvedValue([
      { id: "linhas", createdAt: "2026-04-01T10:00:00.000Z", total: 100, status: "enviada" },
      ...TRES,
    ]);
    const body = await (await pedir()).json();
    expect(body.versoes.map((v: { id: string }) => v.id)).toEqual(["v3", "v2", "v1"]);
  });

  it("um pedido sem propostas nenhumas dá uma lista vazia, não um erro", async () => {
    const res = await pedir();
    expect(res.status).toBe(200);
    expect((await res.json()).versoes).toEqual([]);
  });
});

describe("restaurar", () => {
  it("`?doc=` devolve o documento daquela versão, e só o daquela", async () => {
    store.list.mockResolvedValue(TRES);
    const body = await (await pedir("?doc=v1")).json();
    expect(body.id).toBe("v1");
    expect(body.doc.totalAmount).toBe(8000);
    expect(body.versoes).toBeUndefined();
  });

  it("uma versão que não é deste pedido dá 404", async () => {
    // A busca é dentro das propostas DESTE pedido: um id de outro casamento não
    // pode devolver o documento de outro casamento.
    store.list.mockResolvedValue(TRES);
    expect((await pedir("?doc=de-outro-pedido")).status).toBe(404);
  });
});

describe("a guarda", () => {
  it("sem sessão não chega à store", async () => {
    authed.ok = false;
    const res = await pedir();
    expect(res.status).toBe(401);
    expect(store.list).not.toHaveBeenCalled();
  });
});
