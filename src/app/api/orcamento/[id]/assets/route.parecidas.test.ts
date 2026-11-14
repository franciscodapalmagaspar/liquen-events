import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * «PELO QUE MOSTRAM» (13/11) — a rota `assets` com o índice visual fingido
 * (`fotos-parecidas.ts` tem os seus testes): só a «mesma» é usada sem
 * perguntar; a «talvez» guarda-se como nova; «É outra» (`semParecidas`) nem
 * procura; e a importação pára no travão do espaço.
 */
const st = vi.hoisted(() => ({
  estado: new Map<string, unknown>(),
  /** `<bucket>/<caminho>` dos ficheiros que existem no Storage. */
  ficheiros: new Set<string>(),
  temas: new Map<string, { id: string; arquivado?: boolean }>(),
  guardados: 0,
}));

const uploads = vi.hoisted(() => ({
  upload: vi.fn(async (id: string, _b: Buffer, _t: string, chave?: string) => {
    const path = `${id}/${chave ?? `f${++st.guardados}`}.jpg`;
    st.ficheiros.add(`proposal-assets/${path}`);
    return { path, url: `https://signed/${path}` };
  }),
  thumb: vi.fn(async () => ""),
  mid: vi.fn(async () => true),
  garantirFoto: vi.fn(async () => {}),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/supabase", () => ({
  isDatabaseConfigured: () => true,
  getSupabase: () => ({
    storage: {
      from: (bucket: string) => ({
        exists: async (p: string) => ({ data: st.ficheiros.has(`${bucket}/${p}`) }),
      }),
    },
  }),
}));
vi.mock("@/lib/app-state", () => ({
  getState: async (k: string) => st.estado.get(k) ?? null,
  getStates: async (ks: string[]) =>
    new Map(ks.filter((k) => st.estado.has(k)).map((k) => [k, st.estado.get(k)])),
  setState: async (k: string, v: unknown) => {
    st.estado.set(k, v);
    return { gravado: true, duradouro: true, onde: "servidor" };
  },
}));
vi.mock("@/lib/themes-store", () => ({
  getTheme: async (id: string) => st.temas.get(id) ?? null,
}));
vi.mock("@/lib/proposal-storage", () => ({
  uploadProposalImage: uploads.upload,
  listProposalImages: vi.fn(async () => []),
  signProposalPaths: vi.fn(
    async (refs: string[]) => new Map(refs.map((r) => [r, `https://signed/${r}`])),
  ),
  signProposalThumbs: vi.fn(async () => new Map<string, string>()),
  signProposalMids: async () => new Map<string, string>(),
  uploadProposalThumb: uploads.thumb,
  uploadProposalMid: uploads.mid,
}));
vi.mock("@/lib/proposals-store", () => ({ getProposalByQuote: vi.fn(async () => null) }));
vi.mock("@/lib/proposal-drafts", () => ({ getProposalDraft: vi.fn(async () => null) }));
vi.mock("@/lib/proposal-image", () => ({
  garantirFormatoImprimivel: async (bytes: Buffer, contentType: string) => ({ bytes, contentType }),
  motivoDaRecusa: () => "ilegivel",
  dimensoesReais: async () => ({ w: 1200, h: 800 }),
}));
vi.mock("@/lib/biblioteca-fotos-store", () => ({
  coresDeCaminhos: vi.fn(async () => new Map<string, string>()),
  garantirFoto: uploads.garantirFoto,
  updateFoto: vi.fn(async () => {}),
}));
const vis = vi.hoisted(() => ({
  veredicto: null as null | "mesma" | "talvez",
  procurar: vi.fn(),
  registar: vi.fn(async () => {}),
  sobra: 10_000_000_000,
  somar: vi.fn(async () => {}),
}));
vi.mock("@/lib/fotos-parecidas", () => ({
  impressaoDosBytes: async () => "f".repeat(86),
  registarImpressao: vis.registar,
  procurarParecidas: async (imps: string[], id: string | null) => {
    vis.procurar(imps, id);
    return vis.veredicto
      ? new Map([
          [
            imps[0],
            {
              caminho: "tema:t1/igual.jpg",
              veredicto: vis.veredicto,
              distancias: { grossa: 0, fina: 0, cor: 0 },
            },
          ],
        ])
      : new Map();
  },
}));
vi.mock("@/lib/ocupacao-do-armazenamento", () => ({
  lerEspaco: async () => ({ conhecido: true, sobra: vis.sobra }),
  somarCarregado: vis.somar,
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("sharp", () => ({
  default: () => ({ metadata: async () => ({ width: 1200, height: 800 }) }),
}));

import { POST } from "./route";

async function carregar(extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append(
    "files",
    new File([new TextEncoder().encode("foto-x")], "x.jpg", { type: "image/jpeg" }),
  );
  fd.append("chaves", crypto.randomUUID());
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  const req = new Request("https://liquen.test/api/orcamento/q-1/assets", {
    method: "POST",
    body: fd,
  }) as unknown as NextRequest;
  const res = await POST(req, { params: Promise.resolve({ id: "q-1" }) });
  return { status: res.status, corpo: await res.json() };
}

beforeEach(() => {
  st.estado.clear();
  st.ficheiros.clear();
  st.guardados = 0;
  vis.veredicto = null;
  vis.sobra = 10_000_000_000;
  vi.clearAllMocks();
});

describe("assets: pelo que mostram", () => {
  it("«mesma» (quase certo): usa a guardada, não guarda nada", async () => {
    vis.veredicto = "mesma";
    const { status, corpo } = await carregar();
    expect(status).toBe(200);
    expect(corpo.images[0]).toMatchObject({
      path: "tema:t1/igual.jpg",
      jaExistia: true,
      parecida: true,
    });
    expect(uploads.upload).not.toHaveBeenCalled();
    expect(vis.somar).not.toHaveBeenCalled();
  });

  it("«talvez»: o estúdio não pergunta — guarda como nova, e regista a impressão do SERVIDOR", async () => {
    vis.veredicto = "talvez";
    const { corpo } = await carregar();
    expect(uploads.upload).toHaveBeenCalledTimes(1);
    expect(corpo.images[0].jaExistia).toBeUndefined();
    expect(vis.registar).toHaveBeenCalledWith(corpo.images[0].path, "f".repeat(86));
    expect(vis.somar).toHaveBeenCalledWith(expect.objectContaining({ "proposal-assets": 6 }));
  });

  it("«É outra» (`semParecidas`): nem procura pelo que mostra", async () => {
    vis.veredicto = "mesma";
    await carregar({ semParecidas: "1" });
    expect(vis.procurar).not.toHaveBeenCalled();
    expect(uploads.upload).toHaveBeenCalledTimes(1);
  });

  it("a importação pára no travão: sem espaço até aos 90%, não guarda", async () => {
    vis.sobra = 3;
    const { status, corpo } = await carregar({ importacao: "1" });
    expect(status).toBe(507);
    expect(corpo.travao).toBe(true);
    expect(uploads.upload).not.toHaveBeenCalled();
    // O estúdio (sem `importacao`) não é travado.
    expect((await carregar()).status).toBe(200);
  });
});
