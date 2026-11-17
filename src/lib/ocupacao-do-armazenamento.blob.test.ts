import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A janela da importação e o Blob (17/11). Sem token: a MESMA leitura de
 * `main` (uma `getStates` com as duas chaves de sempre), e o erro «há
 * ficheiros no Blob sem o token» vem do marcador que essa leitura já traz.
 */
const H = vi.hoisted(() => ({ chaves: [] as string[][], ocupacao: null as unknown }));
vi.mock("@/lib/app-state", () => ({
  getStates: async (ks: string[]) => {
    H.chaves.push(ks);
    return new Map(H.ocupacao ? [["armazenamento:ocupacao", H.ocupacao]] : []);
  },
  gravarEstadoSeNaoMudou: vi.fn(async (_k: string, v: unknown) => {
    H.ocupacao = v;
    return "gravado";
  }),
  lerEstadoComVersao: vi.fn(async () => ({ valor: H.ocupacao, versao: null })),
  setState: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => null }));

import { gravarMarcadorDoBlob, lerEspaco } from "./ocupacao-do-armazenamento";

beforeEach(() => {
  H.chaves = [];
  H.ocupacao = null;
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe("lerEspaco com o Blob desligado", () => {
  it("lê exactamente o que lia em main, e não diz nada do Blob", async () => {
    const e = await lerEspaco();
    expect(H.chaves).toEqual([["armazenamento:ocupacao", "armazenamento:desde-a-medicao"]]);
    expect(e.avisosBlob).toBeUndefined();
  });

  it("com o marcador da noite e sem token: mostra o erro, sem ler mais nada", async () => {
    H.ocupacao = {
      medidoEm: new Date().toISOString(),
      bytes: 1,
      porBucket: {},
      completo: true,
      blobEmUso: true,
    };
    const e = await lerEspaco();
    expect(e.avisosBlob?.[0]).toMatch(/token não está configurado/);
    expect(H.chaves).toHaveLength(1);
  });

  it("3.ª revisão, n.º 3: o marcador grava-se já (sem medição ainda) e o erro aparece sem token", async () => {
    expect(await gravarMarcadorDoBlob(true)).toBe(true);
    const e = await lerEspaco();
    expect(e.conhecido).toBe(false); // a linha nova não finge uma medição
    expect(e.avisosBlob?.[0]).toMatch(/token não está configurado/);
  });
});
