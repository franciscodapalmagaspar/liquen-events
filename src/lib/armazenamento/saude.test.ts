import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  uso: null as unknown,
  avisos: [] as string[],
  leituras: 0,
  erros: [] as string[],
}));
// Sem token, NENHUMA leitura à base de dados (2.ª revisão de 17/11, n.º 4):
// qualquer chamada a estes duplos conta como uma.
vi.mock("@/lib/app-state", () => ({
  getState: async () => {
    H.leituras++;
    return null;
  },
  getStates: async () => {
    H.leituras++;
    return new Map();
  },
}));
vi.mock("./indice", () => ({
  indiceDebaixoDe: async () => {
    H.leituras++;
    return { linhas: new Map(), completa: true };
  },
}));
vi.mock("./uso", () => ({
  usoAtual: async () => {
    H.leituras++;
    return H.uso;
  },
}));
vi.mock("@/lib/logger", () => ({
  log: {
    warn: (m: string) => H.avisos.push(m),
    info: vi.fn(),
    error: (m: string) => H.erros.push(m),
  },
}));

import {
  ERRO_SEM_TOKEN,
  alertarSemToken,
  esquecerRegistos,
  estadoDoBlob,
  marcadorDoBlob,
} from "./saude";
import { GB, mesDe } from "./tectos";

beforeEach(() => {
  H.uso = null;
  H.avisos = [];
  H.leituras = 0;
  H.erros = [];
  esquecerRegistos();
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe("o estado do Blob para o back office", () => {
  it("sem token: nada a dizer, e ZERO leituras (n.º 4)", async () => {
    expect(await estadoDoBlob()).toBeNull();
    expect(await estadoDoBlob(false)).toBeNull();
    expect(H.leituras).toBe(0);
  });

  it("sem token, com o marcador da noite a dizer que há um balde em blob: ERRO, sem ler nada", async () => {
    expect(await estadoDoBlob(true)).toEqual({ avisos: [], erro: ERRO_SEM_TOKEN });
    expect(H.leituras).toBe(0);
    expect(H.avisos).toHaveLength(1);
  });

  it("o marcador: com token conta os modos; sem token fica o que estava", () => {
    expect(marcadorDoBlob(undefined, { "theme-assets": "blob" }, true)).toBe(true);
    expect(marcadorDoBlob(true, { "theme-assets": "espelho" }, true)).toBe(false);
    expect(marcadorDoBlob(true, {}, false)).toBe(true);
    expect(marcadorDoBlob(undefined, {}, false)).toBeUndefined();
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

  it("3.ª revisão, n.º 3: uma leitura dos modos falhada (null) não desce o marcador", () => {
    expect(marcadorDoBlob(true, null, true)).toBe(true);
    expect(marcadorDoBlob(undefined, null, true)).toBeUndefined();
  });

  it("3.ª revisão, n.º 3: marcador a true sem token é um ALERTA, uma vez por dia", () => {
    alertarSemToken(true);
    alertarSemToken(true);
    alertarSemToken(false);
    expect(H.erros).toHaveLength(1);
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_Loja1234_s";
    esquecerRegistos();
    alertarSemToken(true);
    expect(H.erros).toHaveLength(1);
  });
});
