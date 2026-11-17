import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A janela da importação e o Blob (17/11). Sem token: a MESMA leitura de
 * `main` (uma `getStates` com as duas chaves de sempre), e o erro «há
 * ficheiros no Blob sem o token» vem do marcador que essa leitura já traz.
 */
const H = vi.hoisted(() => ({
  chaves: [] as string[][],
  ocupacao: null as unknown,
  versao: 0,
  /** Os modos que cada leitura devolve, por ordem (o último repete-se). */
  modos: [{ "theme-assets": "blob" }] as (Record<string, string> | null)[],
  leiturasDosModos: 0,
  /** Corre antes de cada compare-and-set (simula outra escrita a meio). */
  antesDeGravar: null as null | (() => void),
}));
vi.mock("@/lib/armazenamento/modos", () => ({
  modosDosBaldes: async () => ({
    "proposal-pdfs": "supabase",
    "theme-assets": "supabase",
    "proposal-assets": "supabase",
  }),
  modosLidosOuNull: async () => {
    const i = Math.min(H.leiturasDosModos++, H.modos.length - 1);
    return H.modos[i];
  },
}));
vi.mock("@/lib/app-state", () => ({
  getStates: async (ks: string[]) => {
    H.chaves.push(ks);
    return new Map(H.ocupacao ? [["armazenamento:ocupacao", H.ocupacao]] : []);
  },
  gravarEstadoSeNaoMudou: vi.fn(async (_k: string, v: unknown, versao: string) => {
    if (H.antesDeGravar) {
      const f = H.antesDeGravar;
      H.antesDeGravar = null;
      f();
    }
    if (versao !== String(H.versao)) return "conflito";
    H.ocupacao = v;
    H.versao++;
    return "gravado";
  }),
  lerEstadoComVersao: vi.fn(async () => ({ valor: H.ocupacao, versao: String(H.versao) })),
  setState: vi.fn(async (_k: string, v: unknown) => {
    H.ocupacao = v;
    H.versao++;
    return { gravado: true, duradouro: true, onde: "servidor" };
  }),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ storage: { listBuckets: async () => ({ data: [], error: null }) } }),
}));

import { gravarMarcadorDoBlob, lerEspaco, medirOcupacao } from "./ocupacao-do-armazenamento";

beforeEach(() => {
  H.chaves = [];
  H.ocupacao = null;
  H.versao = 0;
  H.modos = [{ "theme-assets": "blob" }];
  H.leiturasDosModos = 0;
  H.antesDeGravar = null;
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
    expect(await gravarMarcadorDoBlob()).toBe(true);
    const e = await lerEspaco();
    expect(e.conhecido).toBe(false); // a linha nova não finge uma medição
    expect(e.avisosBlob?.[0]).toMatch(/token não está configurado/);
  });

  it("4.ª revisão, n.º 9: gravarMarcadorDoBlob relê os modos dentro do ciclo", async () => {
    // 1.ª volta: modos com um balde em blob; outra escrita entra a meio
    // (conflito); 2.ª volta: os modos já não têm blob — fica false.
    H.modos = [{ "theme-assets": "blob" }, { "theme-assets": "espelho" }];
    H.antesDeGravar = () => {
      H.versao++;
    };
    expect(await gravarMarcadorDoBlob()).toBe(true);
    expect((H.ocupacao as { blobEmUso: boolean }).blobEmUso).toBe(false);
  });

  it("4.ª revisão, n.º 9: na medição, com os modos ilegíveis, um true gravado a meio não é apagado", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_Loja1234_s";
    H.ocupacao = { medidoEm: "", bytes: 0, porBucket: {}, completo: false };
    H.modos = [null];
    // A meio da medição, a ação `modo` grava o marcador a true.
    H.antesDeGravar = () => {
      H.ocupacao = { ...(H.ocupacao as object), blobEmUso: true };
      H.versao++;
    };
    await medirOcupacao(null, new Date(), { prazoMs: 1000 });
    expect((H.ocupacao as { blobEmUso?: boolean }).blobEmUso).toBe(true);
  });
});
