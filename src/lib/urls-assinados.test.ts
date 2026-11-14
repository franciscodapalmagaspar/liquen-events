import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A cache dos endereços assinados vive na `biblioteca_fotos` — a tabela de onde
 * a Biblioteca lista as fotografias. Estes testes prendem as duas coisas que a
 * auditoria de 14/11 encontrou:
 *
 *   1. guardar NUNCA cria uma linha (era um `upsert`, e metia as fotografias
 *      das propostas na Biblioteca);
 *   2. sem a coluna `urls` em produção (42703), diz-se uma vez e deixa-se de
 *      perguntar — em vez de um erro por visita.
 */

const BASE = "https://proj.supabase.co";

/** Um URL assinado deste Storage, a morrer `daqui` segundos depois de agora. */
function assinado(balde: string, caminho: string, daqui = 10 * 365 * 24 * 3600): string {
  const exp = Math.floor(Date.now() / 1000) + daqui;
  const carga = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${BASE}/storage/v1/object/sign/${balde}/${caminho}?token=h.${carga}.s`;
}

const H = vi.hoisted(() => ({
  linhas: [] as { path: string; urls: unknown }[],
  erroDaLeitura: null as null | { code?: string; message: string },
  erroDaEscrita: null as null | { code?: string; message: string },
  chamadas: [] as { op: string; valor?: unknown; filtro?: unknown }[],
  avisos: [] as string[],
}));

vi.mock("./logger", () => ({
  log: { warn: (m: string) => H.avisos.push(m), error: vi.fn(), info: vi.fn() },
}));

vi.mock("./supabase", () => ({
  getSupabase: () => ({
    from: (tabela: string) => {
      expect(tabela).toBe("biblioteca_fotos");
      return {
        select: (colunas: string) => ({
          in: async (_col: string, paths: string[]) => {
            H.chamadas.push({ op: "select", valor: colunas, filtro: paths });
            if (H.erroDaLeitura) return { data: null, error: H.erroDaLeitura };
            return { data: H.linhas.filter((l) => paths.includes(l.path)), error: null };
          },
        }),
        update: (valor: unknown) => ({
          eq: async (_col: string, path: string) => {
            H.chamadas.push({ op: "update", valor, filtro: path });
            return { data: null, error: H.erroDaEscrita };
          },
        }),
        upsert: (valor: unknown) => {
          H.chamadas.push({ op: "upsert", valor });
          return Promise.resolve({ error: null });
        },
        insert: (valor: unknown) => {
          H.chamadas.push({ op: "insert", valor });
          return Promise.resolve({ error: null });
        },
      };
    },
  }),
}));

const { urlsGuardados, guardarUrls, _esquecerColunaEmFalta } = await import("./urls-assinados");

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", BASE);
  H.linhas = [];
  H.erroDaLeitura = null;
  H.erroDaEscrita = null;
  H.chamadas = [];
  H.avisos = [];
  _esquecerColunaEmFalta();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("guardarUrls nunca cria uma linha na biblioteca_fotos", () => {
  it("uma fotografia da PROPOSTA sem linha não fica guardada — e não entra na Biblioteca", async () => {
    // Nenhuma linha na tabela: é o caso de uma foto que a Biblioteca não conhece.
    const guardados = await urlsGuardados(["LIQ-1/casal.jpg"]);
    expect(guardados.size).toBe(0);
    await guardarUrls(
      new Map([["LIQ-1/casal.jpg", { original: assinado("proposal-assets", "LIQ-1/casal.jpg") }]]),
      guardados,
    );
    const escritas = H.chamadas.filter((c) => c.op !== "select");
    expect(escritas).toEqual([]);
  });

  it("uma linha que JÁ existe recebe um update pelo caminho, e nada mais", async () => {
    H.linhas = [{ path: "tema-a/x.jpg", urls: null }];
    const guardados = await urlsGuardados(["tema-a/x.jpg", "LIQ-1/casal.jpg"]);
    // A linha existe, ainda que sem endereço nenhum: é isso que autoriza a escrita.
    expect(guardados.get("tema-a/x.jpg")).toEqual({});
    const miniatura = assinado("theme-thumbs", "tema-a/x.jpg", 6 * 3600);
    await guardarUrls(
      new Map<string, Record<string, string>>([
        ["tema-a/x.jpg", { miniatura }],
        ["LIQ-1/casal.jpg", { original: assinado("proposal-assets", "LIQ-1/casal.jpg") }],
      ]),
      guardados,
    );
    const escritas = H.chamadas.filter((c) => c.op !== "select");
    expect(escritas).toEqual([
      { op: "update", valor: { urls: { miniatura } }, filtro: "tema-a/x.jpg" },
    ]);
  });

  it("não escreve endereços de outro Storage", async () => {
    H.linhas = [{ path: "tema-a/x.jpg", urls: null }];
    const guardados = await urlsGuardados(["tema-a/x.jpg"]);
    await guardarUrls(
      new Map([
        [
          "tema-a/x.jpg",
          { miniatura: "https://outro.supabase.co/storage/v1/object/sign/b/x.jpg?token=a.b.c" },
        ],
      ]),
      guardados,
    );
    expect(H.chamadas.filter((c) => c.op !== "select")).toEqual([]);
  });
});

describe("sem a coluna `urls` (42703 em produção)", () => {
  const SEM_COLUNA = {
    code: "42703",
    message: "column biblioteca_fotos.urls does not exist",
  };

  it("diz uma vez, deixa de perguntar, e quem chama assina tudo", async () => {
    H.erroDaLeitura = SEM_COLUNA;
    expect((await urlsGuardados(["a/1.jpg"])).size).toBe(0);
    expect((await urlsGuardados(["a/2.jpg"])).size).toBe(0);
    expect((await urlsGuardados(["a/3.jpg"])).size).toBe(0);
    await guardarUrls(
      new Map([["a/1.jpg", { original: assinado("theme-assets", "a/1.jpg") }]]),
      new Map([["a/1.jpg", {}]]),
    );
    // Uma consulta recusada, e não uma por visita.
    expect(H.chamadas.filter((c) => c.op === "select")).toHaveLength(1);
    expect(H.chamadas.filter((c) => c.op !== "select")).toEqual([]);
    expect(H.avisos.filter((a) => a.includes("biblioteca_fotos.urls"))).toHaveLength(1);
  });

  it("aplicada a migração, volta a usar a cache sozinha passadas seis horas", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-14T10:00:00Z"), toFake: ["Date"] });
    H.erroDaLeitura = SEM_COLUNA;
    await urlsGuardados(["a/1.jpg"]);
    H.erroDaLeitura = null;
    H.linhas = [{ path: "a/1.jpg", urls: null }];
    expect((await urlsGuardados(["a/1.jpg"])).size).toBe(0);
    vi.setSystemTime(new Date("2026-11-14T16:01:00Z"));
    expect((await urlsGuardados(["a/1.jpg"])).has("a/1.jpg")).toBe(true);
  });

  it("o PGRST002 (esquema por ler, passageiro) NÃO pausa — a visita seguinte volta a perguntar", async () => {
    H.erroDaLeitura = {
      code: "PGRST002",
      message: "Could not query the database for the schema cache. Retrying.",
    };
    await urlsGuardados(["a/1.jpg"]);
    H.erroDaLeitura = null;
    H.linhas = [{ path: "a/1.jpg", urls: null }];
    expect((await urlsGuardados(["a/1.jpg"])).has("a/1.jpg")).toBe(true);
    expect(H.avisos.some((a) => a.includes("biblioteca_fotos.urls"))).toBe(false);
  });

  it("um update recusado pela coluna (PGRST204) também pausa", async () => {
    H.linhas = [{ path: "a/1.jpg", urls: null }];
    const guardados = await urlsGuardados(["a/1.jpg"]);
    H.erroDaEscrita = {
      code: "PGRST204",
      message: "Could not find the 'urls' column of 'biblioteca_fotos' in the schema cache",
    };
    await guardarUrls(
      new Map([["a/1.jpg", { original: assinado("theme-assets", "a/1.jpg") }]]),
      guardados,
    );
    H.chamadas = [];
    await urlsGuardados(["a/1.jpg"]);
    expect(H.chamadas).toEqual([]);
  });
});
