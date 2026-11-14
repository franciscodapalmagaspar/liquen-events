import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import type { NextRequest } from "next/server";
import { THEME_PAGE_SIZE, MAX_THEME_PAGE_SIZE, type ProposalTheme } from "@/lib/theme-types";

// ── Fotos de um tema ───────────────────────────────────────────────────────
// Duas coisas a fixar aqui: o caminho que chega do cliente NUNCA pode sair da
// pasta deste tema, e uma avaria (base de dados / Storage) tem de sair como
// 503/500 tratado — nunca como uma exceção crua, e nunca a disfarçar um 404
// legítimo de "tema não encontrado".
const st = vi.hoisted(() => ({
  authed: true,
  dbConfigured: true,
  themes: [] as ProposalTheme[],
  throwOnGet: false,
  list: vi.fn(async () => ({
    ok: true,
    images: [{ path: "t-1/a.jpg", url: "https://signed/a", thumbUrl: "https://thumb/a" }],
    total: 1,
    truncated: false,
  })),
  /** Duplo de `apagarFotoDaBiblioteca`: a salvaguarda das propostas que
   *  referenciam a foto tem casa própria (`theme-materializar.test.ts`); aqui
   *  o que se prova é o guarda de caminhos e o tratamento das avarias. */
  del: vi.fn(async (): Promise<{ ok: boolean; motivo?: "referencias" }> => ({ ok: true })),
  /** Duplo de `guardarFotoNaReciclagem` — o mesmo contrato, com o destino. */
  guardar: vi.fn(async (): Promise<{ ok: boolean; motivo?: "referencias" }> => ({ ok: true })),
  /** A Reciclagem em memória (R3b); `semTabela` é antes da migração. */
  reciclagem: [] as { id: string; tipo: string; origemId: string }[],
  semTabela: false,
  upload: vi.fn(async (id: string) => ({
    kind: "created" as const,
    image: { path: `${id}/nova.jpg`, url: "https://signed/nova" },
  })),
  /** A rede secundária (MD5 dos bytes contra o eTag da pasta). Por omissão não
   *  conhece nada — os testes que interessam é que a encenam. */
  byBytes: vi.fn(async (): Promise<string | null> => null),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
// O índice dos resumos tem testes próprios (`route.sem-duplicados.test.ts`);
// aqui nunca encontra nada e nunca escreve — sem ele, o `app_state` de
// desenvolvimento (um ficheiro) era escrito pelos testes.
const indice = vi.hoisted(() => ({ registar: vi.fn(async (_r: unknown[], _c: string) => {}) }));
vi.mock("@/lib/fotos-resumo", () => ({
  procurarExistentes: vi.fn(async () => new Map<string, string>()),
  registarResumos: indice.registar,
  resumoDosBytes: () => "0".repeat(32),
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({ isDatabaseConfigured: () => st.dbConfigured }));
vi.mock("@/lib/themes-store", () => ({
  getTheme: vi.fn(async (id: string) => {
    if (st.throwOnGet) throw new Error("db down");
    return st.themes.find((t) => t.id === id) ?? null;
  }),
}));
vi.mock("@/lib/theme-storage", async () => {
  // As funções puras de caminho são as reais (é o guarda que estamos a testar).
  const real = await vi.importActual<typeof import("@/lib/theme-storage")>("@/lib/theme-storage");
  return {
    ...real,
    listThemeImagePage: st.list,
    uploadThemeImage: st.upload,
    findThemeImageByBytes: st.byBytes,
  };
});
vi.mock("@/lib/theme-materializar", () => ({
  apagarFotoDaBiblioteca: st.del,
  guardarFotoNaReciclagem: st.guardar,
}));
vi.mock("@/lib/reciclagem-store", () => ({
  guardarNaReciclagem: async (e: { id: string; tipo: string; origemId: string }) => {
    if (st.semTabela) {
      throw Object.assign(new Error('relation "public.reciclagem" does not exist'), {
        code: "42P01",
      });
    }
    st.reciclagem.push(e);
  },
  listarReciclagem: async () => st.reciclagem,
  obterDaReciclagem: async (id: string) => st.reciclagem.find((e) => e.id === id) ?? null,
  tirarDaReciclagem: async (id: string) => {
    st.reciclagem = st.reciclagem.filter((e) => e.id !== id);
  },
}));

import { GET, POST, DELETE } from "./route";

type Ctx = { params: Promise<{ id: string }> };

function ctx(id: string): Ctx {
  return { params: Promise.resolve({ id }) };
}

function get(id = "t-1", query = ""): [NextRequest, Ctx] {
  const url = new URL(`https://liquen.test/api/temas/${id}/imagens${query}`);
  return [{ nextUrl: url, url: url.toString() } as unknown as NextRequest, ctx(id)];
}

function del(path: string, id = "t-1"): [NextRequest, Ctx] {
  const url = new URL(`https://liquen.test/api/temas/${id}/imagens`);
  url.searchParams.set("path", path);
  return [{ nextUrl: url, url: url.toString() } as unknown as NextRequest, ctx(id)];
}

function post(
  files: File[],
  id = "t-1",
  thumbs?: File[],
  extra?: { hashes?: string[]; force?: boolean; medias?: File[] },
): [NextRequest, Ctx] {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  for (const t of thumbs ?? []) form.append("thumbs", t);
  for (const m of extra?.medias ?? []) form.append("medias", m);
  for (const h of extra?.hashes ?? []) form.append("hashes", h);
  if (extra?.force) form.append("force", "1");
  const r = new Request(`https://liquen.test/api/temas/${id}/imagens`, {
    method: "POST",
    body: form,
  }) as unknown as NextRequest;
  return [r, ctx(id)];
}

/** O 5.º argumento do `uploadThemeImage`: o que decide o NOME do ficheiro. */
const naming = (fingerprint: string | null, force = false) => ({ fingerprint, force });

const H1 = "0123456789abcdef0123456789abcdef";
const H2 = "fedcba9876543210fedcba9876543210";

const jpg = (name = "foto.jpg", bytes = 10) =>
  new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });

beforeEach(() => {
  st.authed = true;
  st.dbConfigured = true;
  st.throwOnGet = false;
  st.themes = [
    {
      id: "t-1",
      name: "Terracotta",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  st.reciclagem = [];
  st.semTabela = false;
  vi.clearAllMocks();
  // `clearAllMocks` limpa as CHAMADAS, não as implementações encenadas — sem
  // isto, um teste que encene a rede secundária contamina o seguinte.
  st.byBytes.mockReset();
  st.byBytes.mockImplementation(async () => null);
});

describe("GET /api/temas/[id]/imagens", () => {
  it("rejeita quem não está autenticado e nunca lê o Storage", async () => {
    st.authed = false;
    expect((await GET(...get())).status).toBe(401);
    expect(st.list).not.toHaveBeenCalled();
  });

  it("devolve a página de fotos com o total e a miniatura de cada uma", async () => {
    const res = await GET(...get());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      images: [{ path: "t-1/a.jpg", url: "https://signed/a", thumbUrl: "https://thumb/a" }],
      total: 1,
      truncated: false,
    });
  });

  it("pede ao Storage a janela do pedido", async () => {
    await GET(...get("t-1", "?offset=120&limit=40"));
    expect(st.list).toHaveBeenCalledWith("t-1", 40, 120, []);
  });

  it("sem parâmetros pede a primeira página, com o tamanho por omissão", async () => {
    await GET(...get());
    expect(st.list).toHaveBeenCalledWith("t-1", THEME_PAGE_SIZE, 0, []);
  });

  it("corta um limite absurdo e ignora lixo na query", async () => {
    // Um ?limit=5000 mandaria assinar a biblioteca inteira num pedido.
    await GET(...get("t-1", "?limit=5000"));
    expect(st.list).toHaveBeenCalledWith("t-1", MAX_THEME_PAGE_SIZE, 0, []);
    await GET(...get("t-1", "?limit=abc&offset=-40"));
    expect(st.list).toHaveBeenLastCalledWith("t-1", THEME_PAGE_SIZE, 0, []);
  });

  it("uma pasta ilegível sai como ok:false — nunca como um tema sem fotos", async () => {
    st.list.mockResolvedValueOnce({ ok: false, images: [], total: 0, truncated: false });
    const res = await GET(...get());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, images: [] });
  });

  it("devolve 404 para um tema que não existe", async () => {
    expect((await GET(...get("t-9"))).status).toBe(404);
    expect(st.list).not.toHaveBeenCalled();
  });

  it("devolve 503 (não 500) quando o Storage nem sequer está configurado", async () => {
    st.throwOnGet = true;
    st.dbConfigured = false;
    const res = await GET(...get());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("Armazenamento indisponível.");
  });

  it("devolve 500 tratado (não um throw cru) quando a leitura rebenta", async () => {
    st.list.mockRejectedValueOnce(new Error("boom"));
    expect((await GET(...get())).status).toBe(500);
  });
});

describe("DELETE /api/temas/[id]/imagens", () => {
  it("rejeita quem não está autenticado e nunca apaga", async () => {
    st.authed = false;
    expect((await DELETE(...del("t-1/a.jpg"))).status).toBe(401);
    expect(st.del).not.toHaveBeenCalled();
  });

  it("leva a foto para a Reciclagem, e diz qual é a entrada", async () => {
    const res = await DELETE(...del("t-1/a.jpg"));
    expect(res.status).toBe(200);
    const { reciclagem } = await res.json();
    expect(reciclagem).toEqual({ id: expect.any(String) });
    expect(st.guardar).toHaveBeenCalledWith("t-1/a.jpg", `reciclagem/${reciclagem.id}/a.jpg`);
    expect(st.del).not.toHaveBeenCalled();
    expect(st.reciclagem).toMatchObject([{ tipo: "foto-de-tema", origemId: "t-1/a.jpg" }]);
  });

  it("recusa caminhos de OUTRO tema, travessias e URLs — sem tocar no Storage", async () => {
    expect((await DELETE(...del("t-2/a.jpg"))).status).toBe(400);
    expect((await DELETE(...del("../proposal-assets/q-1/privada.jpg"))).status).toBe(400);
    expect((await DELETE(...del("https://exemplo.pt/a.jpg"))).status).toBe(400);
    expect((await DELETE(...del(""))).status).toBe(400);
    expect(st.guardar).not.toHaveBeenCalled();
    expect(st.del).not.toHaveBeenCalled();
  });

  it("devolve 502 quando o Storage não muda a foto — e nada fica na Reciclagem", async () => {
    st.guardar.mockResolvedValueOnce({ ok: false });
    expect((await DELETE(...del("t-1/a.jpg"))).status).toBe(502);
    expect(st.reciclagem).toEqual([]);
  });

  /** Uma foto que está numa proposta e cuja salvaguarda falhou NÃO sai, e a
   *  mensagem tem de dizer isso — senão ela repete a acção a achar que é uma
   *  avaria do Storage. */
  it("explica quando a foto ficou por apagar por estar numa proposta", async () => {
    st.guardar.mockResolvedValueOnce({ ok: false, motivo: "referencias" });
    const res = await DELETE(...del("t-1/a.jpg"));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/proposta/i);
  });

  it("devolve 500 tratado (não um throw cru) quando a remoção rebenta", async () => {
    st.guardar.mockRejectedValueOnce(new Error("boom"));
    expect((await DELETE(...del("t-1/a.jpg"))).status).toBe(500);
  });

  it("devolve 503 quando o Storage nem sequer está configurado", async () => {
    st.dbConfigured = false;
    st.guardar.mockRejectedValueOnce(new Error("boom"));
    expect((await DELETE(...del("t-1/a.jpg"))).status).toBe(503);
  });

  describe("sem a tabela da Reciclagem (antes da migração)", () => {
    beforeEach(() => {
      st.semTabela = true;
    });

    it("apaga de vez, como sempre, e diz-lo (`reciclagem: false`)", async () => {
      const res = await DELETE(...del("t-1/a.jpg"));
      expect(res.status).toBe(200);
      expect((await res.json()).reciclagem).toBe(false);
      expect(st.del).toHaveBeenCalledWith("t-1/a.jpg");
      expect(st.guardar).not.toHaveBeenCalled();
    });

    it("devolve 502 quando o Storage não confirma a remoção", async () => {
      st.del.mockResolvedValueOnce({ ok: false });
      expect((await DELETE(...del("t-1/a.jpg"))).status).toBe(502);
    });
  });
});

describe("POST /api/temas/[id]/imagens", () => {
  it("rejeita quem não está autenticado e nunca escreve", async () => {
    st.authed = false;
    expect((await POST(...post([jpg()]))).status).toBe(401);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("devolve 503 quando o Storage não está configurado", async () => {
    st.dbConfigured = false;
    expect((await POST(...post([jpg()]))).status).toBe(503);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("devolve 404 para um tema que não existe", async () => {
    expect((await POST(...post([jpg()], "t-9"))).status).toBe(404);
  });

  it("recusa um formato não suportado", async () => {
    const gif = new File([new Uint8Array(4)], "a.gif", { type: "image/gif" });
    expect((await POST(...post([gif]))).status).toBe(415);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("um WEBP é aceite mas GUARDADO em JPEG (o PDF não sabe imprimir WebP)", async () => {
    // As fotos desta biblioteca são copiadas tal e qual para a proposta e vão
    // direitas ao mood board. O `pdf-lib` só embute JPEG/PNG, por isso um WebP
    // guardado como está saía como MOLDURA VAZIA no PDF do cliente — foi assim
    // que uma proposta seguiu com seis molduras e duas fotos. O formato continua
    // a ser aceite (o Pinterest, que é de onde vêm as fotos, serve WebP): o que
    // muda é o que fica guardado.
    const bytes = await sharp({
      create: { width: 24, height: 24, channels: 3, background: { r: 120, g: 140, b: 110 } },
    })
      .webp()
      .toBuffer();
    const foto = new File([new Uint8Array(bytes)], "pinterest.webp", { type: "image/webp" });
    const res = await POST(...post([foto]));
    expect(res.status).toBe(200);
    const [, guardados, tipo] = st.upload.mock.calls[0] as unknown as [string, Buffer, string];
    expect(tipo).toBe("image/jpeg");
    // E o que se guardou é MESMO um JPEG (marcador SOI), não o WebP original.
    expect(guardados[0]).toBe(0xff);
    expect(guardados[1]).toBe(0xd8);
  });

  it("carrega as fotos recebidas", async () => {
    const res = await POST(...post([jpg(), jpg("outra.jpg")]));
    expect(res.status).toBe(200);
    expect((await res.json()).images).toHaveLength(2);
    // Sem campo `thumbs` continua tudo a funcionar (é opcional).
    expect(st.upload).toHaveBeenLastCalledWith(
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      undefined,
      naming(null),
      undefined,
      undefined,
    );
  });

  it("aceita as miniaturas emparelhadas pela ordem", async () => {
    const res = await POST(
      ...post([jpg("a.jpg"), jpg("b.jpg")], "t-1", [jpg("ta.jpg", 4), jpg("tb.jpg", 5)]),
    );
    expect(res.status).toBe(200);
    expect(st.upload).toHaveBeenNthCalledWith(
      1,
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      { bytes: expect.any(Buffer), contentType: "image/jpeg" },
      naming(null),
      undefined,
      undefined,
    );
    expect(st.upload).toHaveBeenCalledTimes(2);
  });

  it("um marcador vazio significa 'esta foto vem sem miniatura'", async () => {
    const vazio = new File([], "sem.jpg", { type: "image/jpeg" });
    await POST(...post([jpg("a.jpg"), jpg("b.jpg")], "t-1", [vazio, jpg("tb.jpg", 5)]));
    expect(st.upload).toHaveBeenNthCalledWith(
      1,
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      undefined,
      naming(null),
      undefined,
      undefined,
    );
    expect(st.upload).toHaveBeenNthCalledWith(
      2,
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      expect.objectContaining({ contentType: "image/jpeg" }),
      naming(null),
      undefined,
      undefined,
    );
  });

  it("miniaturas em número diferente das fotos são IGNORADAS, não emparelhadas à sorte", async () => {
    // Pelo índice, uma miniatura a menos acompanharia a foto errada — uma foto
    // com a miniatura de outra é pior do que foto nenhuma.
    const res = await POST(...post([jpg("a.jpg"), jpg("b.jpg")], "t-1", [jpg("ta.jpg", 4)]));
    expect(res.status).toBe(200);
    expect(st.upload).toHaveBeenNthCalledWith(
      1,
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      undefined,
      naming(null),
      undefined,
      undefined,
    );
    expect(st.upload).toHaveBeenNthCalledWith(
      2,
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      undefined,
      naming(null),
      undefined,
      undefined,
    );
  });

  it("uma miniatura de formato ou tamanho impossíveis é descartada — a foto sobe na mesma", async () => {
    const gif = new File([new Uint8Array(4)], "t.gif", { type: "image/gif" });
    const res = await POST(...post([jpg()], "t-1", [gif]));
    expect(res.status).toBe(200);
    expect(st.upload).toHaveBeenCalledWith(
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      undefined,
      naming(null),
      undefined,
      undefined,
    );
  });
});

// ── Não repetir fotos que já estão no tema ─────────────────────────────────
describe("POST /api/temas/[id]/imagens — repetidas", () => {
  it("entrega o resumo de cada foto, emparelhado pela ordem", async () => {
    await POST(...post([jpg("a.jpg"), jpg("b.jpg")], "t-1", undefined, { hashes: [H1, H2] }));
    expect(st.upload).toHaveBeenNthCalledWith(
      1,
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      undefined,
      naming(H1),
      undefined,
      undefined,
    );
    expect(st.upload).toHaveBeenNthCalledWith(
      2,
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      undefined,
      naming(H2),
      undefined,
      undefined,
    );
  });

  it("resumos em número diferente das fotos são IGNORADOS, não emparelhados à sorte", async () => {
    // Um resumo a menos guardaria uma foto com a IDENTIDADE de outra — e a
    // partir daí a foto certa seria sempre reportada como repetida.
    await POST(...post([jpg("a.jpg"), jpg("b.jpg")], "t-1", undefined, { hashes: [H1] }));
    expect(st.upload).toHaveBeenNthCalledWith(
      1,
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      undefined,
      naming(null),
      undefined,
      undefined,
    );
    expect(st.upload).toHaveBeenNthCalledWith(
      2,
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      undefined,
      naming(null),
      undefined,
      undefined,
    );
  });

  it("um resumo mal formado vira null na SUA posição, sem desalinhar os outros", async () => {
    // É também o guarda contra travessia de diretórios: o nome do ficheiro
    // passa a vir do cliente, e só 32 hex chegam ao Storage.
    await POST(
      ...post([jpg("a.jpg"), jpg("b.jpg")], "t-1", undefined, {
        hashes: ["../../etc/passwd", H2],
      }),
    );
    expect(st.upload).toHaveBeenNthCalledWith(
      1,
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      undefined,
      naming(null),
      undefined,
      undefined,
    );
    expect(st.upload).toHaveBeenNthCalledWith(
      2,
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      undefined,
      naming(H2),
      undefined,
      undefined,
    );
  });

  it("uma repetida é 200 com `duplicates` — NUNCA um erro HTTP", async () => {
    // Um 502 mandaria a Catarina procurar uma avaria que não existe, e o
    // "Tentar novamente" repetiria isto para sempre.
    st.upload.mockResolvedValueOnce({ kind: "duplicate", path: "t-1/ja-la-estava.jpg" } as never);
    const res = await POST(...post([jpg("praia.jpg")], "t-1", undefined, { hashes: [H1] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      images: [],
      duplicates: [{ name: "praia.jpg", path: "t-1/ja-la-estava.jpg", reason: "no-tema" }],
    });
  });

  it("cada foto (nova ou repetida) entra no índice dos resumos como `tema:`", async () => {
    // É por aqui que uma proposta que receba esta MESMA foto devolve a
    // referência à Biblioteca em vez de guardar outra cópia (`fotos-resumo.ts`).
    const res = await POST(...post([jpg("nova.jpg")]));
    const [nova] = (await res.json()).images;
    expect(indice.registar).toHaveBeenCalledWith(["0".repeat(32)], `tema:${nova.path}`);
  });

  it("o resumo do CLIENTE nunca liga os bytes que chegaram a uma foto que lá estava", async () => {
    // Repetida pelo NOME (= o resumo que o navegador mandou): os bytes que
    // chegaram não provam nada sobre a que lá está. Só o que o nome já diz.
    st.upload.mockResolvedValueOnce({ kind: "duplicate", path: "t-1/ja-la-estava.jpg" } as never);
    await POST(...post([jpg("praia.jpg")], "t-1", undefined, { hashes: [H1] }));
    expect(indice.registar).toHaveBeenCalledWith([H1], "tema:t-1/ja-la-estava.jpg");
    expect(JSON.stringify(indice.registar.mock.calls)).not.toContain("0".repeat(32));

    // Repetida pelo MD5 dos bytes: aí são os bytes a prova, e o resumo do
    // cliente fica de fora.
    indice.registar.mockClear();
    st.byBytes.mockResolvedValueOnce("t-1/antiga.jpg");
    await POST(...post([jpg("praia.jpg")], "t-1", undefined, { hashes: [H1] }));
    expect(indice.registar).toHaveBeenCalledWith(["0".repeat(32)], "tema:t-1/antiga.jpg");

    // Nova com o resumo no NOME: o original entra, porque o nome já o afirma.
    indice.registar.mockClear();
    st.upload.mockResolvedValueOnce({
      kind: "created",
      image: { path: `t-1/${H1}.jpg`, url: "u" },
    } as never);
    await POST(...post([jpg("praia.jpg")], "t-1", undefined, { hashes: [H1] }));
    expect(indice.registar).toHaveBeenCalledWith(["0".repeat(32), H1], `tema:t-1/${H1}.jpg`);
  });

  it("meio lote repetido: as boas entram e as repetidas são contadas à parte", async () => {
    st.upload
      .mockResolvedValueOnce({ kind: "duplicate", path: "t-1/velha.jpg" } as never)
      .mockResolvedValueOnce({
        kind: "created",
        image: { path: "t-1/nova.jpg", url: "https://signed/nova" },
      } as never);
    const res = await POST(
      ...post([jpg("a.jpg"), jpg("b.jpg")], "t-1", undefined, {
        hashes: [H1, H2],
      }),
    );
    const body = await res.json();
    expect(body.images).toHaveLength(1);
    expect(body.duplicates).toHaveLength(1);
    expect(body.duplicates[0].name).toBe("a.jpg");
  });

  it("a rede secundária apanha a foto ANTIGA (nome UUID) sem escrever nada", async () => {
    st.byBytes.mockResolvedValueOnce("t-1/3f2504e0-4f89-11d3-9a0c-0305e82c3301.jpg");
    const res = await POST(...post([jpg("praia.jpg")]));
    expect(res.status).toBe(200);
    expect(st.upload).not.toHaveBeenCalled();
    expect((await res.json()).duplicates).toEqual([
      {
        name: "praia.jpg",
        path: "t-1/3f2504e0-4f89-11d3-9a0c-0305e82c3301.jpg",
        reason: "no-tema",
      },
    ]);
  });

  it("'Adicionar mesmo assim' salta as DUAS verificações", async () => {
    st.byBytes.mockResolvedValue("t-1/velha.jpg");
    const res = await POST(
      ...post([jpg("praia.jpg")], "t-1", undefined, { hashes: [H1], force: true }),
    );
    expect(res.status).toBe(200);
    expect(st.byBytes).not.toHaveBeenCalled();
    expect(st.upload).toHaveBeenCalledWith(
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      undefined,
      naming(H1, true),
      undefined,
      undefined,
    );
  });

  it("uma avaria a sério continua a ser 502 — não se disfarça de repetida", async () => {
    st.upload.mockResolvedValueOnce(null as never);
    expect((await POST(...post([jpg()]))).status).toBe(502);
  });
});

// A ordem que a equipa arrumou tem de CHEGAR à listagem — senão arrastava-se
// uma foto para a frente e, ao recarregar, ela voltava para trás.
describe("GET /api/temas/[id]/imagens — ordem arrumada à mão", () => {
  it("entrega a ordem do tema à listagem", async () => {
    st.themes = st.themes.map((t) =>
      t.id === "t-1" ? { ...t, photoOrder: ["t-1/b.jpg", "t-1/a.jpg"] } : t,
    );
    await GET(...get("t-1", "?offset=0&limit=60"));
    expect(st.list).toHaveBeenCalledWith("t-1", 60, 0, ["t-1/b.jpg", "t-1/a.jpg"]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DE 1200 px DA BIBLIOTECA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É a derivada que a PÁGINA DO CASAL mostra — as de 400 e 96 servem a grelha e
 * as tiras daqui. A maior parte das fotografias de uma proposta vem da
 * Biblioteca, portanto é por aqui que a maior parte delas nasce.
 *
 * Nascia no servidor, uma a uma, à primeira vez que alguém olhava. Chega agora
 * já feita do browser, do mesmo canvas que fez a miniatura.
 */
describe("a derivada de 1200 px", () => {
  it("é entregue ao armazenamento, emparelhada com a sua fotografia", async () => {
    const [req, c] = post([jpg("a.jpg")], "t-1", [jpg("a.thumb.jpg")], {
      medias: [jpg("a.mid.jpg", 2048)],
    });

    const res = await POST(req, c);

    expect(res.status).toBe(200);
    // O SÉTIMO argumento do `uploadThemeImage`, a seguir à micro. Afirmado por
    // posição e não por índice: o duplo tem tipo estreito, e indexá-lo passava
    // nos testes e rebentava o `tsc` — que só corre no CI.
    expect(st.upload).toHaveBeenNthCalledWith(
      1,
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      expect.objectContaining({ contentType: "image/jpeg" }),
      naming(null),
      undefined,
      expect.objectContaining({ contentType: "image/jpeg" }),
    );
  });

  it("sem ela, o carregamento corre na mesma", async () => {
    // Um browser onde a fabricação falhou, ou um cliente mais antigo do que
    // esta rota, envia só o original: a fotografia guarda-se e a de 1200 volta
    // a ser feita a pedido, que é o que acontecia a todas.
    const [req, c] = post([jpg("a.jpg")], "t-1", [jpg("a.thumb.jpg")]);

    const res = await POST(req, c);

    expect(res.status).toBe(200);
    expect(st.upload).toHaveBeenNthCalledWith(
      1,
      "t-1",
      expect.any(Buffer),
      "image/jpeg",
      expect.objectContaining({ contentType: "image/jpeg" }),
      naming(null),
      undefined,
      undefined,
    );
  });

  it("um número de derivadas diferente do de fotos não emparelha nenhuma", async () => {
    // A mesma regra das miniaturas, e pela mesma razão: emparelhar pela ordem
    // com listas de tamanhos diferentes daria a derivada de uma fotografia à
    // fotografia ao lado — e ninguém repara, porque as duas são plausíveis.
    const [req, c] = post([jpg("a.jpg"), jpg("b.jpg")], "t-1", undefined, {
      medias: [jpg("a.mid.jpg", 2048)],
    });

    const res = await POST(req, c);

    expect(res.status).toBe(200);
    for (const n of [1, 2]) {
      expect(st.upload).toHaveBeenNthCalledWith(
        n,
        "t-1",
        expect.any(Buffer),
        "image/jpeg",
        undefined,
        naming(null),
        undefined,
        undefined,
      );
    }
  });
});
