import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Adversarial coverage for the proposal-asset upload ─────────────────────
// Focus: the admin guard, the storage-not-configured 503, and strict payload
// validation — malformed multipart (400, not 500), no files (400), bad MIME
// (415), oversized (413), storage failure (502). We mock the storage layer so
// no Supabase is touched and assert it is only called for accepted files.
const st = vi.hoisted(() => ({
  garantirFoto: vi.fn(async (_p: string, _d: unknown) => {}),
  updateFoto: vi.fn(async (_p: string, _d: unknown) => {}),
  /** O que o `dimensoesReais` devolve. `null` = o sharp não leu os bytes. */
  forma: vi.fn(async () => ({ w: 1200, h: 800 }) as { w: number; h: number } | null),
  authed: false,
  dbConfigured: true,
  /** O documento gravado da proposta (null = não há). */
  doc: null as unknown,
  upload: vi.fn(async (id: string) => ({ path: `${id}/x.jpg`, url: "https://signed/x.jpg" })),
  /** O que guardou a de 1200 px, para se poder afirmar que foi guardada. */
  guardarMedia: vi.fn(async (_p: string, _b: Buffer, _t?: string) => true),
  /** As de 1200 px que o Storage TEM. Vazio = nenhuma fabricada ainda. */
  assinarMedias: vi.fn(async (_refs: string[]) => new Map<string, string>()),
  list: vi.fn(
    async (id: string): Promise<{ path: string; url: string; thumbUrl?: string }[]> => [
      { path: `${id}/x.jpg`, url: "https://signed/x.jpg" },
    ],
  ),
  /** A conversão à porta: o que não é JPEG/PNG sai daqui já em JPEG. A real usa
   *  sharp (que este ficheiro mocka), por isso mocka-se a FRONTEIRA — o que
   *  interessa aqui é o que a rota GUARDA. */
  converter: vi.fn(async (bytes: Buffer, contentType: string) =>
    /^image\/(jpe?g|png)$/i.test(contentType)
      ? { bytes, contentType }
      : { bytes: Buffer.from("convertida"), contentType: "image/jpeg" },
  ),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/supabase", () => ({ isDatabaseConfigured: () => st.dbConfigured }));
vi.mock("@/lib/proposal-storage", () => ({
  uploadProposalImage: st.upload,
  listProposalImages: st.list,
  // As assinaturas em lote, que é por onde passam as fotos que NÃO estão na
  // pasta deste pedido (as da Biblioteca e as que ficaram noutra pasta).
  signProposalPaths: vi.fn(
    async (refs: string[]) => new Map(refs.map((r) => [r, `https://signed/${r}`])),
  ),
  signProposalThumbs: vi.fn(async () => new Map<string, string>()),
  // O degrau do MEIO da cascata do estúdio: assinada e directa do Storage,
  // quando lá está. Ver `mediasAssinadas` na rota.
  signProposalMids: (refs: string[]) => st.assinarMedias(refs),
  signProposalMidsAvif: async () => new Map<string, string>(),
  uploadProposalThumb: vi.fn(async () => ""),
  // A de 1200 px — a que a PÁGINA DO CASAL mostra. Passou a chegar já feita do
  // browser, em vez de nascer no servidor à primeira vez que alguém olha.
  uploadProposalMid: st.guardarMedia,
}));
/** O documento gravado desta proposta — é aí que estão escritas as referências
 *  das fotos que a listagem da pasta não vê. */
vi.mock("@/lib/proposals-store", () => ({
  getProposalByQuote: vi.fn(async () => (st.doc ? { doc: st.doc } : null)),
}));
vi.mock("@/lib/proposal-drafts", () => ({ getProposalDraft: vi.fn(async () => null) }));
// `motivoDaRecusa` é PURO (olha para os bytes e diz porque não servem) e é o
// que escolhe a frase que a pessoa lê. Fica o real: substituí-lo era testar a
// rota contra um diagnóstico inventado.
vi.mock("@/lib/proposal-image", async (importOriginal) => ({
  garantirFormatoImprimivel: st.converter,
  motivoDaRecusa: (await importOriginal<typeof import("@/lib/proposal-image")>()).motivoDaRecusa,
  // A FORMA da fotografia, que a rota passou a GRAVAR (`biblioteca_fotos`).
  // Devolve-se um valor fixo: os bytes das fixtures são zeros, e o que aqui se
  // verifica é que a rota a lê e a manda gravar — não o que o sharp sabe ler.
  dimensoesReais: st.forma,
}));
vi.mock("@/lib/biblioteca-fotos-store", () => ({
  coresDeCaminhos: vi.fn(async () => new Map<string, string>()),
  garantirFoto: st.garantirFoto,
  updateFoto: st.updateFoto,
}));
// O índice dos resumos tem testes próprios (`route.sem-duplicados.test.ts`);
// aqui nunca encontra nada e nunca escreve — sem ele, o `app_state` de
// desenvolvimento (um ficheiro) era escrito pelos testes.
vi.mock("@/lib/fotos-resumo", () => ({
  procurarExistentes: vi.fn(async () => new Map<string, string>()),
  registarResumos: vi.fn(async () => {}),
  resumoDosBytes: () => "0".repeat(32),
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
// The route reads image dimensions via sharp to reject decompression bombs.
// Test fixtures are dummy bytes, so mock sharp to report a normal-sized image
// (individual dimension-cap behaviour is covered where it matters, not here).
vi.mock("sharp", () => ({
  default: () => ({ metadata: async () => ({ width: 1200, height: 800 }) }),
}));

import { GET, POST } from "./route";

const MAX_BYTES = 12 * 1024 * 1024;

function file(name: string, type: string, size = 8): File {
  return new File([new Uint8Array(size)], name, { type });
}

function uploadReq(
  files: File[],
  id = "q-1",
  extra?: { thumbs?: File[]; medias?: File[] },
): [NextRequest, { params: Promise<{ id: string }> }] {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  for (const t of extra?.thumbs ?? []) fd.append("thumbs", t);
  for (const m of extra?.medias ?? []) fd.append("medias", m);
  const req = new Request(`https://liquen.test/api/orcamento/${id}/assets`, {
    method: "POST",
    body: fd,
  }) as unknown as NextRequest;
  return [req, { params: Promise.resolve({ id }) }];
}

beforeEach(() => {
  st.authed = true;
  st.dbConfigured = true;
  st.doc = null;
  vi.clearAllMocks();
});

describe("POST /api/orcamento/[id]/assets", () => {
  it("401s the unauthenticated and never uploads", async () => {
    st.authed = false;
    const [req, ctx] = uploadReq([file("a.jpg", "image/jpeg")]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("503s when storage (Supabase) is not configured", async () => {
    st.dbConfigured = false;
    const [req, ctx] = uploadReq([file("a.jpg", "image/jpeg")]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(503);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("400 (not 500) on a malformed / non-multipart body", async () => {
    const req = new Request("https://liquen.test/api/orcamento/q-1/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not multipart",
    }) as unknown as NextRequest;
    const res = await POST(req, { params: Promise.resolve({ id: "q-1" }) });
    expect(res.status).toBe(400);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("400 when no files are present in the form", async () => {
    const [req, ctx] = uploadReq([]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("415 on an unsupported file type (e.g. a PDF or SVG), before any upload", async () => {
    const [req, ctx] = uploadReq([file("evil.svg", "image/svg+xml")]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(415);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("413 on an oversized image (> 12 MB) without reading it into storage", async () => {
    const [req, ctx] = uploadReq([file("huge.jpg", "image/jpeg", MAX_BYTES + 1)]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(413);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("accepts JPG/PNG/WEBP and returns the stored path + signed url", async () => {
    const [req, ctx] = uploadReq([
      file("a.jpg", "image/jpeg"),
      file("b.png", "image/png"),
      file("c.webp", "image/webp"),
    ]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.images).toHaveLength(3);
    expect(st.upload).toHaveBeenCalledTimes(3);
    expect(st.upload).toHaveBeenCalledWith("q-1", expect.any(Buffer), "image/jpeg", undefined);
  });

  it("um WEBP é aceite mas GUARDADO em JPEG (o PDF não sabe imprimir WebP)", async () => {
    // A porta que faltava fechar: o Pinterest serve WebP, o `pdf-lib` só embute
    // JPEG/PNG, e um WebP guardado tal e qual acabava como moldura vazia na
    // proposta do cliente. Recusar o formato fecharia o fluxo de trabalho do
    // estúdio — converte-se à entrada.
    const [req, ctx] = uploadReq([file("pinterest.webp", "image/webp")]);
    expect((await POST(req, ctx)).status).toBe(200);
    expect(st.upload).toHaveBeenCalledWith("q-1", expect.any(Buffer), "image/jpeg", undefined);
    expect(st.upload).not.toHaveBeenCalledWith("q-1", expect.any(Buffer), "image/webp", undefined);
  });

  it("o PNG e o JPEG passam intactos — não se reencoda o que já é imprimível", async () => {
    const [req, ctx] = uploadReq([file("b.png", "image/png")]);
    expect((await POST(req, ctx)).status).toBe(200);
    expect(st.upload).toHaveBeenCalledWith("q-1", expect.any(Buffer), "image/png", undefined);
  });

  it("415 quando nem o sharp consegue converter os bytes, sem guardar nada", async () => {
    st.converter.mockResolvedValueOnce(null as unknown as { bytes: Buffer; contentType: string });
    const [req, ctx] = uploadReq([file("estranha.webp", "image/webp")]);
    expect((await POST(req, ctx)).status).toBe(415);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("rejects the whole batch (415) as soon as one file has a bad type, before uploading the good one", async () => {
    const [req, ctx] = uploadReq([file("bad.gif", "image/gif"), file("ok.png", "image/png")]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(415);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("502 when the storage layer fails to persist an image", async () => {
    st.upload.mockResolvedValueOnce(null as unknown as { path: string; url: string });
    const [req, ctx] = uploadReq([file("a.jpg", "image/jpeg")]);
    const res = await POST(req, ctx);
    expect(res.status).toBe(502);
  });
});

function getReq(id = "q-1"): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new Request(`https://liquen.test/api/orcamento/${id}/assets`, {
    method: "GET",
  }) as unknown as NextRequest;
  return [req, { params: Promise.resolve({ id }) }];
}

describe("GET /api/orcamento/[id]/assets", () => {
  it("401s the unauthenticated and never lists", async () => {
    st.authed = false;
    const [req, ctx] = getReq();
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
    expect(st.list).not.toHaveBeenCalled();
  });

  it("returns the pedido's uploaded images with signed urls", async () => {
    const [req, ctx] = getReq("q-42");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.images).toEqual([
      {
        path: "q-42/x.jpg",
        url: "https://signed/x.jpg",
        // A foto do armazém não tem miniatura guardada (é uma das antigas): a
        // lista NÃO a deixa sair sem uma derivada leve — ver abaixo.
        thumbUrl: "/api/orcamento/q-42/miniatura?ref=q-42%2Fx.jpg",
      },
    ]);
    expect(st.list).toHaveBeenCalledWith("q-42");
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * NENHUMA FOTO SAI DESTA LISTA SEM UMA DERIVADA LEVE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Uma foto sem `thumbUrl` faz a grelha do estúdio cair para o ORIGINAL.
   * Medido a 1,6 Mbps com 24 células: 1099 KB por célula (26,4 MB nas 24) e a
   * primeira fotografia pintada aos 34,0 s — para caixas de 174 px. Com
   * miniatura: 20 KB por célula e a primeira aos 2,5 s.
   *
   * As fotos carregadas depois das miniaturas trazem a sua e ficam com o URL
   * assinado do Storage (nada muda para elas). As antigas passam a sair com o
   * endereço que a fabrica à primeira vez que alguém olha.
   */
  it("uma foto SEM miniatura guardada sai com a miniatura a pedido", async () => {
    st.list.mockResolvedValueOnce([{ path: "q-9/antiga.jpg", url: "https://signed/antiga.jpg" }]);
    const [req, ctx] = getReq("q-9");
    const body = await (await GET(req, ctx)).json();
    expect(body.images[0].thumbUrl).toBe("/api/orcamento/q-9/miniatura?ref=q-9%2Fantiga.jpg");
    // E o ORIGINAL continua onde estava: é o plano B da célula e o que a lupa
    // abre. Uma miniatura no lugar do original seria uma foto pixelizada no
    // ecrã grande.
    expect(body.images[0].url).toBe("https://signed/antiga.jpg");
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * E O DEGRAU DO MEIO, PARA A QUEDA NÃO CUSTAR 1099 KB
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A célula do estúdio tinha dois degraus — a miniatura e, a falhar essa, o
   * ORIGINAL. Medido a 1,6 Mbps: 20 KB → 1099 KB, para desenhar a mesma caixa
   * de ~100 px. A derivada de 1200 px (~200 KB) já era fabricada em lote; o que
   * faltava era esta lista dizer onde ela está.
   */
  it("uma foto com a derivada de 1200 px sai com ela, para a célula ter onde cair", async () => {
    st.list.mockResolvedValueOnce([
      { path: "q-9/nova.jpg", url: "https://signed/nova.jpg", thumbUrl: "https://signed/mini.jpg" },
    ]);
    st.assinarMedias.mockResolvedValueOnce(new Map([["q-9/nova.jpg", "https://signed/media.jpg"]]));
    const [req, ctx] = getReq("q-9");
    const body = await (await GET(req, ctx)).json();
    expect(body.images[0].midUrl).toBe("https://signed/media.jpg");
    // Os outros dois degraus não se mexem: a grelha continua a desenhar a
    // miniatura, e o original continua a ser o que a lupa abre.
    expect(body.images[0].thumbUrl).toBe("https://signed/mini.jpg");
    expect(body.images[0].url).toBe("https://signed/nova.jpg");
  });

  /**
   * Ausente é uma RESPOSTA, e não um buraco a tapar: quer dizer que a derivada
   * ainda não foi fabricada, e a célula cai directa ao original como sempre
   * caiu. Um `midUrl` inventado seria um degrau que dá 404 — uma tentativa
   * gasta a descobrir o que esta lista já sabia.
   */
  it("sem a derivada fabricada, o campo não vem — e a lista sai na mesma", async () => {
    st.list.mockResolvedValueOnce([
      { path: "q-9/nova.jpg", url: "https://signed/nova.jpg", thumbUrl: "https://signed/mini.jpg" },
    ]);
    const [req, ctx] = getReq("q-9");
    const body = await (await GET(req, ctx)).json();
    expect(body.images[0].midUrl).toBeUndefined();
    expect(body.images[0].thumbUrl).toBe("https://signed/mini.jpg");
  });

  it("uma foto COM miniatura guardada mantém o URL assinado do Storage", async () => {
    st.list.mockResolvedValueOnce([
      { path: "q-9/nova.jpg", url: "https://signed/nova.jpg", thumbUrl: "https://signed/mini.jpg" },
    ]);
    const [req, ctx] = getReq("q-9");
    const body = await (await GET(req, ctx)).json();
    // Sem desvio pelo nosso servidor: o Storage serve-a directamente, como
    // sempre serviu.
    expect(body.images[0].thumbUrl).toBe("https://signed/mini.jpg");
  });

  it("returns an empty list (200) when storage is unavailable", async () => {
    st.list.mockResolvedValueOnce([]);
    const [req, ctx] = getReq();
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.images).toEqual([]);
  });

  /**
   * O handler não tinha `try/catch`: um Storage a ATIRAR (que não é o mesmo que
   * devolver uma lista vazia) saía como 500 anónimo e sem nada nos registos.
   */
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * UMA FOTO DO DOCUMENTO QUE MORA NA PASTA DE OUTRO PEDIDO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A listagem do Storage é POR PASTA: `listProposalImages("q-1")` só vê
   * `q-1/…`. Quem assinava o resto era o ramo da Biblioteca, e esse só conhece
   * as referências `tema:`. Um caminho `q-antigo/x.jpg` escrito no documento —
   * uma proposta copiada em que a recópia das fotos não chegou ao fim — não era
   * assinado por ninguém, e a célula ficava sem URL: caixa cinzenta com a
   * palavra «Imagem», que é o sintoma que a dona do negócio descreveu.
   */
  it("assina uma foto do documento que ficou na pasta de outro pedido", async () => {
    st.doc = { moodBoards: [{ images: ["q-antigo/copiada.jpg", "q-1/propria.jpg"] }] };
    st.list.mockResolvedValueOnce([{ path: "q-1/propria.jpg", url: "https://signed/propria" }]);
    const [req, ctx] = getReq("q-1");
    const body = await (await GET(req, ctx)).json();
    const caminhos = body.images.map((i: { path: string }) => i.path);
    expect(caminhos).toContain("q-antigo/copiada.jpg");
    // E a da própria pasta continua a vir pelo caminho de sempre — sem
    // duplicados: quem já está na listagem não passa por aqui outra vez.
    expect(caminhos.filter((c: string) => c === "q-1/propria.jpg")).toHaveLength(1);
  });

  it("um Storage que rebenta dá um 500 registado, não um 500 anónimo", async () => {
    const { log } = await import("@/lib/logger");
    st.list.mockRejectedValueOnce(new Error("Storage em baixo"));
    const [req, ctx] = getReq();
    const res = await GET(req, ctx);
    expect(res.status).toBe(500);
    expect(log.error).toHaveBeenCalled();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A FORMA DA FOTOGRAFIA FICA GRAVADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Da caça a bugs: A5-004 = A6-002 = A8-015, encontrado por três agentes
 * independentes a partir de três ângulos diferentes. As colunas
 * `largura`/`altura` existiam, eram lidas por três consumidores, e ninguém as
 * escrevia — o `formasDeCaminhos` devolvia SEMPRE um mapa vazio.
 *
 * O que isso custava, tudo em silêncio: a página do casal desenhava as células
 * sem `aspect-ratio` (o salto de 10 833 px), o empacotamento das colunas nunca
 * equilibrava, e as «suspeitas» da verificação pré-envio eram código morto.
 */
describe("o carregamento grava a forma da fotografia", () => {
  const gravado = () => (st.updateFoto.mock.calls.at(-1)?.[1] ?? {}) as Record<string, unknown>;

  it("manda a largura e a altura, e não só a cor", async () => {
    st.authed = true;
    st.forma.mockResolvedValueOnce({ w: 1600, h: 1067 });
    await POST(...uploadReq([file("a.jpg", "image/jpeg")]));
    expect(gravado()).toMatchObject({ largura: 1600, altura: 1067 });
  });

  it("uma foto ao alto fica ao alto — a orientação EXIF já vem aplicada", async () => {
    // O `dimensoesReais` troca os eixos quando a etiqueta de orientação diz que
    // a foto está deitada no ficheiro. Gravar os números crus do cabeçalho
    // punha a página a reservar uma caixa deitada para uma foto ao alto.
    st.authed = true;
    st.forma.mockResolvedValueOnce({ w: 1067, h: 1600 });
    await POST(...uploadReq([file("b.jpg", "image/jpeg")]));
    const d = gravado();
    expect(Number(d.altura)).toBeGreaterThan(Number(d.largura));
  });

  it("quando o sharp não lê os bytes, grava-se o resto e não se inventa forma", async () => {
    st.authed = true;
    st.forma.mockResolvedValueOnce(null);
    await POST(...uploadReq([file("c.jpg", "image/jpeg")]));
    const d = gravado();
    expect(d).not.toHaveProperty("largura");
    expect(d).not.toHaveProperty("altura");
  });

  /**
   * A6-003. O LQIP é a mancha de cor que ocupa a célula enquanto a fotografia
   * não chega. O caminho da Biblioteca de Temas gravava-o e este não — e por
   * isso a MESMA página do casal tinha metade das células a abrir com
   * placeholder e a outra metade a abrir vazias.
   */
  it("aceita o LQIP que o estúdio calcula, como a Biblioteca já aceitava", async () => {
    st.authed = true;
    const fd = new FormData();
    fd.append("files", file("d.jpg", "image/jpeg"));
    fd.append("lqips", `data:image/webp;base64,${"A".repeat(60)}==`);
    const req = new Request("https://liquen.test/api/orcamento/q-1/assets", {
      method: "POST",
      body: fd,
    }) as unknown as NextRequest;
    await POST(req, { params: Promise.resolve({ id: "q-1" }) });
    expect(gravado()).toHaveProperty("lqip");
  });

  it("um LQIP que não passa na verificação não é gravado", async () => {
    st.authed = true;
    const fd = new FormData();
    fd.append("files", file("e.jpg", "image/jpeg"));
    // Um SVG com script dentro — o `lqipAceitavel` recusa-o, e bem.
    fd.append("lqips", "data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg==");
    const req = new Request("https://liquen.test/api/orcamento/q-1/assets", {
      method: "POST",
      body: fd,
    }) as unknown as NextRequest;
    await POST(req, { params: Promise.resolve({ id: "q-1" }) });
    expect(gravado()).not.toHaveProperty("lqip");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DE 1200 px CHEGA JÁ FEITA — E NÃO NASCE À PRIMEIRA VISITA DO CASAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É a derivada que a PÁGINA DO CASAL mostra: num telemóvel a fotografia ocupa
 * ~343 pontos a três pixéis por ponto, e é essa que o `srcset` escolhe. A de
 * 400 px serve as grelhas do back office.
 *
 * Nascia no servidor, uma a uma, à primeira vez que alguém olhava para cada
 * fotografia — um download do original, um `sharp` e um upload, tudo dentro do
 * pedido de quem estava a ver. Numa proposta acabada de enviar, quem está a ver
 * é o casal, a olhar para um rectângulo vazio.
 *
 * Agora sobe ao lado do original, do mesmo canvas que já fez a miniatura.
 */
describe("a derivada de 1200 px que vem do browser", () => {
  beforeEach(() => {
    st.authed = true;
    st.dbConfigured = true;
    vi.clearAllMocks();
  });

  it("é guardada, com o caminho da fotografia que acabou de subir", async () => {
    const [req, ctx] = uploadReq([file("f.jpg", "image/jpeg")], "q-1", {
      medias: [file("f.mid.jpg", "image/jpeg", 2048)],
    });

    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    expect(st.guardarMedia).toHaveBeenCalledTimes(1);
    // O caminho é o do ORIGINAL guardado, e não o nome do ficheiro que veio no
    // formulário: é por esse caminho que a página a vai procurar.
    expect(st.guardarMedia.mock.calls[0][0]).toBe("q-1/x.jpg");
  });

  it("sem ela, o carregamento corre na mesma", async () => {
    // Um browser onde a fabricação falhou, ou um cliente mais antigo do que
    // esta rota, envia só o original. A fotografia guarda-se na mesma e a de
    // 1200 volta a ser feita a pedido — que é o que acontecia a todas.
    const [req, ctx] = uploadReq([file("f.jpg", "image/jpeg")]);

    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    expect(st.guardarMedia).not.toHaveBeenCalled();
  });

  it("uma que não seja imagem não é guardada", async () => {
    const [req, ctx] = uploadReq([file("f.jpg", "image/jpeg")], "q-1", {
      medias: [file("f.mid.pdf", "application/pdf", 2048)],
    });

    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    expect(st.guardarMedia).not.toHaveBeenCalled();
  });

  it("guardá-la falhar não deita abaixo um carregamento que correu bem", async () => {
    // Melhor esforço, como a miniatura: a fotografia JÁ está guardada quando se
    // chega aqui, e devolver erro faria alguém repetir um carregamento que
    // resultou — criando a foto duas vezes.
    st.guardarMedia.mockResolvedValueOnce(false);
    const [req, ctx] = uploadReq([file("f.jpg", "image/jpeg")], "q-1", {
      medias: [file("f.mid.jpg", "image/jpeg", 2048)],
    });

    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
  });
});
