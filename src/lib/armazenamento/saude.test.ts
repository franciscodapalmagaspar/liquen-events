import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  modos: null as unknown,
  linhas: 0,
  uso: null as unknown,
  avisos: [] as string[],
}));
vi.mock("@/lib/app-state", () => ({ getState: async () => H.modos }));
vi.mock("./indice", () => ({
  indiceDebaixoDe: async () => ({
    linhas: new Map(Array.from({ length: H.linhas }, (_, i) => [`x${i}`, {}])),
    completa: true,
  }),
}));
vi.mock("./uso", () => ({ usoAtual: async () => H.uso }));
vi.mock("@/lib/logger", () => ({
  log: { warn: (m: string) => H.avisos.push(m), info: vi.fn(), error: vi.fn() },
}));

import { ERRO_SEM_TOKEN, esquecerRegistos, estadoDoBlob } from "./saude";
import { GB, mesDe } from "./tectos";

beforeEach(() => {
  H.modos = null;
  H.linhas = 0;
  H.uso = null;
  H.avisos = [];
  esquecerRegistos();
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe("o estado do Blob para o back office", () => {
  it("sem token e sem nada no Blob: nada a dizer", async () => {
    expect(await estadoDoBlob()).toBeNull();
  });

  it("sem token, com um balde em modo blob e ficheiros no índice: ERRO (n.º 7)", async () => {
    H.modos = { "proposal-pdfs": "blob" };
    H.linhas = 1;
    expect(await estadoDoBlob()).toEqual({ avisos: [], erro: ERRO_SEM_TOKEN });
    expect(H.avisos).toHaveLength(1);
  });

  it("sem token, em espelho: o Supabase tem tudo — não é erro", async () => {
    H.modos = { "proposal-pdfs": "espelho" };
    H.linhas = 5;
    expect(await estadoDoBlob()).toBeNull();
  });

  it("com token, perto do tecto: avisa, e o registo tem travão (uma vez por hora)", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_Loja1234_s";
    H.uso = { mes: mesDe(new Date()), avancadas: 0, simples: 0, transferencia: 0, bytes: 1.6 * GB };
    const r = await estadoDoBlob();
    expect(r?.avisos[0]).toMatch(/perto do tecto/);
    await estadoDoBlob();
    await estadoDoBlob();
    expect(H.avisos.filter((a) => a.includes("tecto"))).toHaveLength(1);
  });

  it("com token e o contador ilegível: avisa que o Blob está parado", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_Loja1234_s";
    expect((await estadoDoBlob())?.avisos[0]).toMatch(/parado/);
  });
});
