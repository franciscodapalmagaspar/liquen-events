import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  autenticado: true,
  modo: "blob" as string,
  modoEmCache: null as string | null,
  linhasNoIndice: 1,
  mudou: [] as unknown[],
  marcador: null as null | boolean,
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => H.autenticado }));
vi.mock("@/lib/armazenamento/modos", () => ({
  // A cache (até 60 s velha) e a linha fresca podem discordar.
  modoDoBalde: async () => H.modoEmCache ?? H.modo,
  modoDoBaldeFresco: async () => H.modo,
  modosDosBaldes: async () => ({}),
  mudarModo: async (b: string, m: string) => {
    H.mudou.push([b, m]);
    return { [b]: m };
  },
}));
vi.mock("@/lib/armazenamento/indice", () => ({
  indiceDebaixoDe: async () => ({
    linhas: new Map(Array.from({ length: H.linhasNoIndice }, (_, i) => [`x${i}`, {}])),
    completa: true,
  }),
}));
vi.mock("@/lib/armazenamento/migracao", () => ({
  copiar: vi.fn(async () => ({ copiados: 1 })),
  ensaio: vi.fn(),
  libertar: vi.fn(),
  verificarLigacao: vi.fn(),
}));
vi.mock("@/lib/armazenamento/uso", () => ({ usoAtual: async () => null }));
vi.mock("@/lib/ocupacao-do-armazenamento", () => ({
  // Lê os modos ele próprio (4.ª revisão, n.º 9): aqui basta saber que correu.
  gravarMarcadorDoBlob: vi.fn(async () => {
    H.marcador = true;
    return true;
  }),
}));

import { POST } from "./route";
import { copiar } from "@/lib/armazenamento/migracao";

const pedir = (corpo: unknown) =>
  POST(
    new Request("https://liquen.pt/api/admin/armazenamento-blob", {
      method: "POST",
      body: JSON.stringify(corpo),
    }) as never,
  );

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_Loja1234_segredo";
  H.autenticado = true;
  H.modo = "blob";
  H.modoEmCache = null;
  H.linhasNoIndice = 1;
  H.mudou = [];
  H.marcador = null;
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe("POST /api/admin/armazenamento-blob", () => {
  it("só com sessão", async () => {
    H.autenticado = false;
    expect((await pedir({ acao: "estado" })).status).toBe(401);
  });

  it("sem o token do Blob, recusa (e diz porquê)", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const r = await pedir({ acao: "estado" });
    expect(r.status).toBe(409);
  });

  it("recusa baldes fora dos três", async () => {
    expect((await pedir({ acao: "copiar", balde: "proposal-thumbs" })).status).toBe(400);
  });

  it("não sai do modo `blob` com ficheiros no índice", async () => {
    const r = await pedir({ acao: "modo", balde: "theme-assets", modo: "supabase" });
    expect(r.status).toBe(409);
    expect(H.mudou).toEqual([]);
  });

  it("sai do modo `blob` com o índice vazio", async () => {
    H.linhasNoIndice = 0;
    expect((await pedir({ acao: "modo", balde: "theme-assets", modo: "espelho" })).status).toBe(
      200,
    );
    expect(H.mudou).toEqual([["theme-assets", "espelho"]]);
  });

  it("um cursor com travessia não passa", async () => {
    await pedir({ acao: "copiar", balde: "proposal-pdfs", n: 5, depois: "../x" });
    expect(copiar).toHaveBeenCalledWith("proposal-pdfs", { n: 5, depois: null });
  });

  it("a guarda lê o modo FRESCO, não a cache de 60 s (revisão 17/11, n.º 8)", async () => {
    H.modoEmCache = "espelho"; // outra instância já passou o balde a `blob`
    const r = await pedir({ acao: "modo", balde: "theme-assets", modo: "supabase" });
    expect(r.status).toBe(409);
    expect(H.mudou).toEqual([]);
  });

  it("3.ª revisão, n.º 3: mudar um balde para blob grava o marcador JÁ", async () => {
    H.modo = "espelho";
    await pedir({ acao: "modo", balde: "theme-assets", modo: "blob" });
    expect(H.marcador).toBe(true);
  });
});
