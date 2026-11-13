import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";
import type { NextRequest } from "next/server";

/**
 * «UMA FOTOGRAFIA NUNCA SE GUARDA DUAS VEZES» (13/11) — a rota `assets` com o
 * índice dos resumos A SÉRIO (`fotos-resumo.ts`). O que se finge é o que está
 * por baixo dele: o `app_state` (um mapa em memória), o Storage (um conjunto
 * de ficheiros que existem) e os temas (vivos ou arquivados).
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
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("sharp", () => ({
  default: () => ({ metadata: async () => ({ width: 1200, height: 800 }) }),
}));

import { POST } from "./route";

const resumo = (b: Uint8Array) => createHash("sha256").update(b).digest("hex").slice(0, 32);

function foto(conteudo: string, nome = "foto.jpg"): File {
  return new File([new TextEncoder().encode(conteudo)], nome, { type: "image/jpeg" });
}

async function carregar(f: File, id = "q-1", extra?: { thumb?: File; media?: File }) {
  const fd = new FormData();
  fd.append("files", f);
  // Uma chave nova por envio, como o estúdio faz a cada foto escolhida.
  fd.append("chaves", crypto.randomUUID());
  if (extra?.thumb) fd.append("thumbs", extra.thumb);
  if (extra?.media) fd.append("medias", extra.media);
  const req = new Request(`https://liquen.test/api/orcamento/${id}/assets`, {
    method: "POST",
    body: fd,
  }) as unknown as NextRequest;
  const res = await POST(req, { params: Promise.resolve({ id }) });
  return { status: res.status, corpo: await res.json() };
}

beforeEach(() => {
  st.estado.clear();
  st.ficheiros.clear();
  st.temas.clear();
  st.guardados = 0;
  vi.clearAllMocks();
});

describe("assets POST: uma fotografia nunca se guarda duas vezes", () => {
  it("a mesma foto carregada duas vezes no mesmo pedido fica UM ficheiro", async () => {
    const a = await carregar(foto("a mesma fotografia"));
    const b = await carregar(foto("a mesma fotografia", "copia.jpg"));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(uploads.upload).toHaveBeenCalledTimes(1);
    expect(b.corpo.images[0].path).toBe(a.corpo.images[0].path);
    expect(b.corpo.images[0].jaExistia).toBe(true);
    expect([...st.ficheiros]).toHaveLength(1);
  });

  it("igual a uma foto da Biblioteca (tema vivo) → `tema:` e zero bytes guardados", async () => {
    const bytes = new TextEncoder().encode("foto da biblioteca");
    const caminho = `t1/${resumo(bytes)}.jpg`;
    st.temas.set("t1", { id: "t1" });
    st.ficheiros.add(`theme-assets/${caminho}`);
    st.estado.set(`foto-resumo:${resumo(bytes)}`, [`tema:${caminho}`]);

    const r = await carregar(foto("foto da biblioteca"), "q-1", {
      thumb: foto("miniatura"),
      media: foto("media"),
    });
    expect(r.status).toBe(200);
    expect(r.corpo.images[0].path).toBe(`tema:${caminho}`);
    expect(r.corpo.images[0].url).toBe(`https://signed/tema:${caminho}`);
    // Nada guardado: nem a foto, nem a miniatura, nem a média, nem a linha.
    expect(uploads.upload).not.toHaveBeenCalled();
    expect(uploads.thumb).not.toHaveBeenCalled();
    expect(uploads.mid).not.toHaveBeenCalled();
    expect(uploads.garantirFoto).not.toHaveBeenCalled();
  });

  it("o resumo do ORIGINAL que o navegador manda também reconhece a da Biblioteca", async () => {
    const original = "1".repeat(32);
    st.temas.set("t1", { id: "t1" });
    st.ficheiros.add(`theme-assets/t1/${original}.jpg`);
    st.estado.set(`foto-resumo:${original}`, [`tema:t1/${original}.jpg`]);

    const fd = new FormData();
    fd.append("files", foto("bytes preparados noutro tamanho"));
    fd.append("resumos", original);
    const req = new Request("https://liquen.test/api/orcamento/q-1/assets", {
      method: "POST",
      body: fd,
    }) as unknown as NextRequest;
    const res = await POST(req, { params: Promise.resolve({ id: "q-1" }) });
    const corpo = await res.json();
    expect(corpo.images[0].path).toBe(`tema:t1/${original}.jpg`);
    expect(uploads.upload).not.toHaveBeenCalled();
  });

  it("um tema ARQUIVADO não conta: guarda-se na pasta do pedido", async () => {
    const bytes = new TextEncoder().encode("foto de um tema arquivado");
    const caminho = `t2/${resumo(bytes)}.jpg`;
    st.temas.set("t2", { id: "t2", arquivado: true });
    st.ficheiros.add(`theme-assets/${caminho}`);
    st.estado.set(`foto-resumo:${resumo(bytes)}`, [`tema:${caminho}`]);

    const r = await carregar(foto("foto de um tema arquivado"));
    expect(uploads.upload).toHaveBeenCalledTimes(1);
    expect(r.corpo.images[0].path).toMatch(/^q-1\//);
    // E não sai do índice: o tema pode voltar.
    expect(st.estado.get(`foto-resumo:${resumo(bytes)}`)).toContain(`tema:${caminho}`);
  });

  it("foto DIFERENTE com o mesmo nome guarda-se", async () => {
    await carregar(foto("primeira", "IMG_0001.jpg"));
    await carregar(foto("segunda, outra fotografia", "IMG_0001.jpg"));
    expect(uploads.upload).toHaveBeenCalledTimes(2);
  });

  it("a mesma foto num pedido DIFERENTE guarda-se (apagar um pedido leva a pasta)", async () => {
    await carregar(foto("igual"), "q-1");
    const b = await carregar(foto("igual"), "q-2");
    expect(uploads.upload).toHaveBeenCalledTimes(2);
    expect(b.corpo.images[0].path).toMatch(/^q-2\//);
  });

  it("um caminho que já não existe sai do índice, e a foto guarda-se", async () => {
    const bytes = new TextEncoder().encode("apagada entretanto");
    st.estado.set(`foto-resumo:${resumo(bytes)}`, ["q-1/morta.jpg"]);
    const r = await carregar(foto("apagada entretanto"));
    expect(uploads.upload).toHaveBeenCalledTimes(1);
    expect(st.estado.get(`foto-resumo:${resumo(bytes)}`)).toEqual([r.corpo.images[0].path]);
  });

  it("o resumo do ORIGINAL errado não envenena o índice: só serve para procurar", async () => {
    // A Biblioteca tem a foto X, registada pelo resumo do original dela.
    const original = "2".repeat(32);
    st.temas.set("t1", { id: "t1" });
    st.ficheiros.add(`theme-assets/t1/${original}.jpg`);
    st.estado.set(`foto-resumo:${original}`, [`tema:t1/${original}.jpg`]);

    // Um navegador manda OUTRA fotografia com esse resumo (errado).
    const outra = new TextEncoder().encode("uma fotografia que não é a X");
    const fd = new FormData();
    fd.append("files", new File([outra], "y.jpg", { type: "image/jpeg" }));
    fd.append("resumos", original);
    await POST(
      new Request("https://liquen.test/api/orcamento/q-1/assets", {
        method: "POST",
        body: fd,
      }) as unknown as NextRequest,
      { params: Promise.resolve({ id: "q-1" }) },
    );
    // Os bytes desta NÃO ficam ligados à X…
    expect(st.estado.get(`foto-resumo:${resumo(outra)}`)).toBeUndefined();
    // …e por isso, carregada outra vez sem resumo do cliente, guarda-se.
    const r = await carregar(new File([outra], "y.jpg", { type: "image/jpeg" }));
    expect(uploads.upload).toHaveBeenCalledTimes(1);
    expect(r.corpo.images[0].path).toMatch(/^q-1\//);
  });

  it("um resumo do cliente num carregamento NOVO não entra no índice", async () => {
    const doCliente = "3".repeat(32);
    const fd = new FormData();
    fd.append("files", foto("fotografia nova"));
    fd.append("resumos", doCliente);
    await POST(
      new Request("https://liquen.test/api/orcamento/q-1/assets", {
        method: "POST",
        body: fd,
      }) as unknown as NextRequest,
      { params: Promise.resolve({ id: "q-1" }) },
    );
    expect(uploads.upload).toHaveBeenCalledTimes(1);
    expect(st.estado.has(`foto-resumo:${doCliente}`)).toBe(false);
    expect(
      st.estado.has(`foto-resumo:${resumo(new TextEncoder().encode("fotografia nova"))}`),
    ).toBe(true);
  });

  it("reutilizar uma foto ANTIGA da pasta do pedido grava-lhe a forma, a cor e o LQIP", async () => {
    const bytes = new TextEncoder().encode("foto antiga sem forma");
    st.ficheiros.add("proposal-assets/q-1/antiga.jpg");
    st.estado.set(`foto-resumo:${resumo(bytes)}`, ["q-1/antiga.jpg"]);
    const fd = new FormData();
    fd.append("files", new File([bytes], "a.jpg", { type: "image/jpeg" }));
    fd.append("cores", "#aabbcc");
    const res = await POST(
      new Request("https://liquen.test/api/orcamento/q-1/assets", {
        method: "POST",
        body: fd,
      }) as unknown as NextRequest,
      { params: Promise.resolve({ id: "q-1" }) },
    );
    expect((await res.json()).images[0].path).toBe("q-1/antiga.jpg");
    expect(uploads.upload).not.toHaveBeenCalled();
    expect(uploads.garantirFoto).toHaveBeenCalledWith(
      "q-1/antiga.jpg",
      expect.objectContaining({ cor: "#aabbcc", largura: 1200, altura: 800 }),
    );
  });

  it("um tema que já não existe sai do índice (não ocupa um lugar para sempre)", async () => {
    const bytes = new TextEncoder().encode("foto de um tema apagado");
    st.ficheiros.add(`theme-assets/t9/${resumo(bytes)}.jpg`);
    st.estado.set(`foto-resumo:${resumo(bytes)}`, [`tema:t9/${resumo(bytes)}.jpg`]);
    const r = await carregar(foto("foto de um tema apagado"));
    expect(uploads.upload).toHaveBeenCalledTimes(1);
    expect(st.estado.get(`foto-resumo:${resumo(bytes)}`)).toEqual([r.corpo.images[0].path]);
  });
});
