import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import {
  isThemePath,
  planOrderedPage,
  themeFolder,
  themeIdOfPath,
  contentTypeForPath,
  THEME_BUCKET,
  THEME_THUMB_BUCKET,
  SIGNED_TTL,
} from "./theme-storage";

/**
 * Duplo do Supabase Storage. `getSupabase` devolve um cliente construído a
 * partir deste estado, para podermos encenar as avarias que interessam: o
 * bucket em falta, o bucket ilegível, a listagem a falhar, a cópia recusada.
 * Cada teste corre num módulo fresco (`vi.resetModules`) porque o
 * theme-storage memoiza a verificação do bucket entre chamadas.
 */
const bucketState = () => ({
  exists: true,
  error: null as unknown,
  createError: null as { message: string } | null,
  gets: 0,
  creates: 0,
});

const st = vi.hoisted(() => ({
  configured: true,
  bucket: {
    exists: true,
    error: null as unknown,
    createError: null as { message: string } | null,
    gets: 0,
    creates: 0,
  },
  // O bucket das MINIATURAS é outro, com vida própria: numa instalação antiga
  // pode nem existir, e a biblioteca tem de continuar a funcionar na mesma.
  thumbBucket: {
    exists: true,
    error: null as unknown,
    createError: null as { message: string } | null,
    gets: 0,
    creates: 0,
  },
  buckets: [] as string[],
  list: vi.fn(),
  remove: vi.fn(),
  signed: vi.fn(),
  signOne: vi.fn(),
  copy: vi.fn(),
  move: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  thumbList: vi.fn(),
  thumbRemove: vi.fn(),
  thumbSigned: vi.fn(),
  thumbSignOne: vi.fn(),
  thumbUpload: vi.fn(),
  // A miniatura acompanha a foto na cópia/mudança entre temas — mesma chave,
  // outro bucket. Tem duplos PRÓPRIOS para se poder provar que a falha dela
  // não muda o resultado da operação.
  thumbCopy: vi.fn(),
  thumbMove: vi.fn(),
  // A MICRO (96 px) é outra derivada, noutro bucket, e viaja no mesmo gesto:
  // duplos próprios para se poder ver que ela vai — e para não se confundir a
  // chamada dela com a da miniatura.
  microBucket: {
    exists: true,
    error: null as unknown,
    createError: null as { message: string } | null,
    gets: 0,
    creates: 0,
  },
  microList: vi.fn(),
  microRemove: vi.fn(),
  microSigned: vi.fn(),
  microSignOne: vi.fn(),
  microUpload: vi.fn(),
  microUploadUrl: vi.fn(),
  microCopy: vi.fn(),
  microMove: vi.fn(),
  // ── Carregamento DIRETO ──────────────────────────────────────────────
  /** Esta instalação sabe emitir URLs de carregamento? Um Supabase antigo
   *  não sabe, e é isso que faz o cliente cair para o multipart. */
  hasUploadUrlApi: true,
  uploadUrl: vi.fn(),
  thumbUploadUrl: vi.fn(),
  updateBucket: vi.fn(),
}));

/** Veredicto que a verificação de dimensões devolve — encenado por teste. */
const insp = vi.hoisted(() => ({ verdict: { ok: true, reason: "" } }));

// A verificação real lê o cabeçalho da imagem por HTTP e chama o `sharp`;
// aqui o que se está a provar é OUTRA coisa (o que a confirmação faz com o
// veredicto), por isso o veredicto é encenado e o resto de `proposal-storage`
// fica real — `copyThemeImageToProposal` depende dele.
vi.mock("./proposal-storage", async () => {
  const real = await vi.importActual<typeof import("./proposal-storage")>("./proposal-storage");
  return {
    ...real,
    inspectStoredImage: vi.fn(async () => insp.verdict),
    removeStoredObject: vi.fn(async () => {}),
  };
});

vi.mock("./supabase", () => {
  const from = (bucket: string) => {
    st.buckets.push(bucket);
    // Qualquer bucket de miniaturas — `theme-thumbs` e `proposal-thumbs` — usa
    // os duplos das miniaturas. Antes era só o dos temas, e por isso as
    // assinaturas do bucket de miniaturas das PROPOSTAS caíam no duplo dos
    // originais, que responde a tudo: um teste que encenasse "sem miniatura"
    // recebia uma na mesma.
    const thumbs = bucket.endsWith("-thumbs");
    // E a MICRO (`theme-micro`, 96 px) é uma terceira família, com duplos
    // próprios: sem eles, uma chamada à micro caía nos duplos dos ORIGINAIS
    // (não acaba em `-thumbs`) e um teste sobre ela estaria a medir outra coisa.
    const familia = bucket === "theme-micro" ? "micro" : thumbs ? "thumb" : "orig";
    const dupla = {
      orig: {
        list: st.list,
        remove: st.remove,
        signed: st.signed,
        signOne: st.signOne,
        copy: st.copy,
        move: st.move,
        upload: st.upload,
        uploadUrl: st.uploadUrl,
      },
      thumb: {
        list: st.thumbList,
        remove: st.thumbRemove,
        signed: st.thumbSigned,
        signOne: st.thumbSignOne,
        copy: st.thumbCopy,
        move: st.thumbMove,
        upload: st.thumbUpload,
        uploadUrl: st.thumbUploadUrl,
      },
      micro: {
        list: st.microList,
        remove: st.microRemove,
        signed: st.microSigned,
        signOne: st.microSignOne,
        copy: st.microCopy,
        move: st.microMove,
        upload: st.microUpload,
        uploadUrl: st.microUploadUrl,
      },
    }[familia];
    return {
      list: dupla.list,
      remove: dupla.remove,
      createSignedUrls: dupla.signed,
      createSignedUrl: dupla.signOne,
      copy: dupla.copy,
      move: dupla.move,
      download: st.download,
      upload: dupla.upload,
      ...(st.hasUploadUrlApi ? { createSignedUploadUrl: dupla.uploadUrl } : {}),
    };
  };
  const stateOf = (name: string) => {
    if (name === "theme-thumbs") return st.thumbBucket;
    if (name === "theme-micro") return st.microBucket;
    return st.bucket;
  };
  return {
    getSupabase: () =>
      st.configured
        ? {
            storage: {
              from,
              getBucket: async (name: string) => {
                const b = stateOf(name);
                b.gets++;
                return b.exists ? { data: { name }, error: null } : { data: null, error: b.error };
              },
              createBucket: async (name: string) => {
                const b = stateOf(name);
                b.creates++;
                return { data: null, error: b.createError };
              },
              updateBucket: st.updateBucket,
            },
          }
        : null,
    isDatabaseConfigured: () => st.configured,
  };
});
vi.mock("./logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

/** Módulo fresco: o memo do bucket (e o do bucket das propostas) recomeça. */
async function load() {
  return import("./theme-storage");
}

/** Uma página de listagem do Storage, no formato que o cliente devolve. */
function page(names: string[]) {
  return { data: names.map((name) => ({ id: `id-${name}`, name })), error: null };
}

const NAMES_500 = Array.from({ length: 500 }, (_, i) => `f${i}.jpg`);

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  st.configured = true;
  st.bucket = bucketState();
  st.thumbBucket = bucketState();
  st.microBucket = bucketState();
  st.buckets = [];
  st.list.mockResolvedValue(page([]));
  st.thumbList.mockResolvedValue(page([]));
  st.microList.mockResolvedValue(page([]));
  st.thumbRemove.mockImplementation(async (paths: string[]) => ({
    data: paths.map((p) => ({ name: p })),
    error: null,
  }));
  // Por omissão TODAS as fotos têm miniatura; os testes que interessam mexem
  // nisto (miniatura em falta, bucket inexistente, assinatura recusada).
  st.thumbSigned.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://thumb/${path}` })),
    error: null,
  }));
  st.thumbSignOne.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://thumb/${path}` },
    error: null,
  }));
  st.thumbUpload.mockResolvedValue({ data: { path: "ok" }, error: null });
  st.remove.mockImplementation(async (paths: string[]) => ({
    data: paths.map((p) => ({ name: p })),
    error: null,
  }));
  st.signed.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })),
    error: null,
  }));
  st.signOne.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://signed/${path}` },
    error: null,
  }));
  st.copy.mockResolvedValue({ data: { path: "copiado" }, error: null });
  st.move.mockResolvedValue({ data: { message: "movido" }, error: null });
  st.thumbCopy.mockResolvedValue({ data: { path: "copiado" }, error: null });
  st.thumbMove.mockResolvedValue({ data: { message: "movido" }, error: null });
  st.microCopy.mockResolvedValue({ data: { path: "copiado" }, error: null });
  st.microMove.mockResolvedValue({ data: { message: "movido" }, error: null });
  st.microUpload.mockResolvedValue({ data: { path: "ok" }, error: null });
  st.microRemove.mockImplementation(async (paths: string[]) => ({
    data: paths.map((p) => ({ name: p })),
    error: null,
  }));
  st.microSigned.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://micro/${path}` })),
    error: null,
  }));
  st.microSignOne.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://micro/${path}` },
    error: null,
  }));
  st.microUploadUrl.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://upload/theme-micro/${path}?token=muk`, token: "muk", path },
    error: null,
  }));
  st.download.mockResolvedValue({
    data: { arrayBuffer: async () => new TextEncoder().encode("foto").buffer },
    error: null,
  });
  st.upload.mockResolvedValue({ data: { path: "ok" }, error: null });
  st.hasUploadUrlApi = true;
  insp.verdict = { ok: true, reason: "" };
  st.updateBucket.mockResolvedValue({ data: null, error: null });
  st.uploadUrl.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://upload/theme-assets/${path}?token=tok`, token: "tok", path },
    error: null,
  }));
  st.thumbUploadUrl.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://upload/theme-thumbs/${path}?token=tuk`, token: "tuk", path },
    error: null,
  }));
});

/**
 * As funções puras de caminhos são o guarda de segurança da biblioteca: os
 * caminhos que chegam do cliente (importar para uma proposta, remover uma
 * foto) são validados SÓ por elas antes de tocar no Storage. Um furo aqui
 * significaria ler/apagar fora da pasta do tema.
 */
describe("isThemePath", () => {
  it("aceita um ficheiro dentro da pasta de um tema", () => {
    expect(isThemePath("tema-1/8f14e45f.jpg")).toBe(true);
    expect(isThemePath("TEMA_2/foto-01.jpeg")).toBe(true);
    expect(isThemePath("t3/a.png")).toBe(true);
    expect(isThemePath("t3/a.webp")).toBe(true);
  });

  it("rejeita travessia de diretórios", () => {
    expect(isThemePath("../proposal-assets/q-1/segredo.jpg")).toBe(false);
    expect(isThemePath("tema/../../etc/passwd.jpg")).toBe(false);
    expect(isThemePath("tema/sub/foto.jpg")).toBe(false);
  });

  it("rejeita URLs, data-URIs e caminhos absolutos", () => {
    expect(isThemePath("https://exemplo.pt/foto.jpg")).toBe(false);
    expect(isThemePath("data:image/jpeg;base64,AAAA")).toBe(false);
    expect(isThemePath("/tema/foto.jpg")).toBe(false);
  });

  it("rejeita extensões não-imagem e valores que não são strings", () => {
    expect(isThemePath("tema/script.svg")).toBe(false);
    expect(isThemePath("tema/malware.exe")).toBe(false);
    expect(isThemePath("tema/sem-extensao")).toBe(false);
    expect(isThemePath("")).toBe(false);
    expect(isThemePath(null)).toBe(false);
    expect(isThemePath(42)).toBe(false);
    expect(isThemePath(["tema/a.jpg"])).toBe(false);
  });
});

describe("themeFolder", () => {
  it("mantém ids normais intactos", () => {
    expect(themeFolder("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    );
  });

  it("remove tudo o que poderia escapar da pasta", () => {
    expect(themeFolder("../../etc")).toBe("etc");
    expect(themeFolder("tema/outro")).toBe("temaoutro");
    expect(themeFolder("tema com espaços!")).toBe("temacomespaos");
  });
});

describe("themeIdOfPath", () => {
  it("devolve a pasta de um caminho válido", () => {
    expect(themeIdOfPath("tema-1/foto.jpg")).toBe("tema-1");
  });

  it("devolve vazio para um caminho inválido (nunca um palpite)", () => {
    expect(themeIdOfPath("../fora/foto.jpg")).toBe("");
    expect(themeIdOfPath("foto.jpg")).toBe("");
  });
});

describe("contentTypeForPath", () => {
  it("mapeia a extensão para o content-type da cópia", () => {
    expect(contentTypeForPath("t/a.png")).toBe("image/png");
    expect(contentTypeForPath("t/a.webp")).toBe("image/webp");
    expect(contentTypeForPath("t/a.jpg")).toBe("image/jpeg");
    expect(contentTypeForPath("t/a.JPEG")).toBe("image/jpeg");
  });
});

describe("bucket", () => {
  it("é separado do bucket das propostas", () => {
    expect(THEME_BUCKET).toBe("theme-assets");
  });

  it("as miniaturas vivem noutro bucket, privado e à parte", () => {
    expect(THEME_THUMB_BUCKET).toBe("theme-thumbs");
    expect(THEME_THUMB_BUCKET).not.toBe(THEME_BUCKET);
  });
});

describe("validade dos URLs assinados", () => {
  // Eram 10 anos: num bucket com milhares de fotos, cada URL que escapasse
  // ficava a servi-las para sempre. Tem de cobrir um dia de trabalho e nada
  // mais — as rotas voltam a assinar a cada pedido.
  it("dura horas, não anos", () => {
    expect(SIGNED_TTL).toBeGreaterThanOrEqual(60 * 60);
    expect(SIGNED_TTL).toBeLessThanOrEqual(60 * 60 * 24);
  });
});

// ── Bucket: criar só quando falta mesmo ────────────────────────────────────
describe("ensureBucket", () => {
  it("cria o bucket quando ele ainda não existe", async () => {
    st.bucket.exists = false;
    const { listThemeFiles } = await load();
    expect((await listThemeFiles("t-1")).ok).toBe(true);
    expect(st.bucket.creates).toBe(1);
  });

  it("NÃO cria o bucket quando o getBucket falha por avaria — e reporta ilegível", async () => {
    // Um 500 do Storage não é "o bucket não existe": criá-lo às cegas mascarava
    // a avaria e a pasta apareceria vazia.
    st.bucket.exists = false;
    st.bucket.error = { status: 500, message: "Internal error" };
    const { listThemeFiles } = await load();
    expect(await listThemeFiles("t-1")).toEqual({ names: [], ok: false, truncated: false });
    expect(st.bucket.creates).toBe(0);
  });

  it("não fixa a avaria: a chamada seguinte volta a tentar", async () => {
    st.bucket.exists = false;
    st.bucket.error = { status: 503, message: "Service unavailable" };
    const { listThemeFiles } = await load();
    expect((await listThemeFiles("t-1")).ok).toBe(false);
    st.bucket.exists = true;
    expect((await listThemeFiles("t-1")).ok).toBe(true);
  });

  /**
   * Ela (27/10): «sim, avança com a capa em AVIF» — e a capa não saía em AVIF
   * porque isto apertava os buckets das DERIVADAS com a lista dos originais,
   * tirando-lhes o `image/avif`. Nenhuma fotografia tinha a versão AVIF.
   */
  it("um bucket de derivadas que já existe continua a aceitar AVIF", async () => {
    st.bucket.exists = true;
    const { garantirBucketDeDerivadas } = await load();
    expect(await garantirBucketDeDerivadas("theme-avif-medias")).toBe(true);
    const [nome, opcoes] = st.updateBucket.mock.calls.at(-1)!;
    expect(nome).toBe("theme-avif-medias");
    expect(opcoes.allowedMimeTypes).toContain("image/avif");
  });

  it("o bucket dos ORIGINAIS fica com a lista estreita — sem AVIF", async () => {
    st.bucket.exists = true;
    const { listThemeFiles } = await load();
    await listThemeFiles("t-1");
    const [nome, opcoes] = st.updateBucket.mock.calls.at(-1)!;
    expect(nome).toBe("theme-assets");
    expect(opcoes.allowedMimeTypes).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });

  it("verifica o bucket UMA vez, mesmo com listagens em paralelo", async () => {
    const { listThemeFiles } = await load();
    await Promise.all([listThemeFiles("t-1"), listThemeFiles("t-2"), listThemeFiles("t-3")]);
    expect(st.bucket.gets).toBe(1);
  });
});

// ── Listar sem assinar ─────────────────────────────────────────────────────
describe("listThemeFiles", () => {
  it("devolve os nomes dos ficheiros reais da pasta", async () => {
    st.list.mockResolvedValue({
      data: [
        { id: "1", name: "a.jpg" },
        { id: null, name: "subpasta" }, // marcador de pasta: não é ficheiro
        { id: "2", name: ".emptyFolderPlaceholder" },
        { id: "3", name: "b.png" },
      ],
      error: null,
    });
    const { listThemeFiles } = await load();
    expect(await listThemeFiles("t-1")).toEqual({
      names: ["a.jpg", "b.png"],
      ok: true,
      truncated: false,
    });
  });

  it("distingue pasta VAZIA de pasta ILEGÍVEL", async () => {
    const { listThemeFiles } = await load();
    expect(await listThemeFiles("t-1")).toEqual({ names: [], ok: true, truncated: false });

    st.list.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await listThemeFiles("t-1")).toEqual({ names: [], ok: false, truncated: false });
  });

  it("assinala truncated quando a página vem cheia (a contagem é um mínimo)", async () => {
    st.list.mockResolvedValue(page(["a.jpg", "b.jpg"]));
    const { listThemeFiles } = await load();
    expect(await listThemeFiles("t-1", 2)).toMatchObject({ truncated: true });
    expect(await listThemeFiles("t-1", 3)).toMatchObject({ truncated: false });
  });

  it("é ilegível — não vazia — sem Storage configurado", async () => {
    st.configured = false;
    const { listThemeFiles } = await load();
    expect(await listThemeFiles("t-1")).toEqual({ names: [], ok: false, truncated: false });
  });

  it("pede a página ao Storage com o offset recebido", async () => {
    const { listThemeFiles } = await load();
    await listThemeFiles("t-1", 100, 200);
    expect(st.list).toHaveBeenCalledWith(
      "t-1",
      expect.objectContaining({ limit: 100, offset: 200 }),
    );
  });
});

// ── Contar sem assinar ─────────────────────────────────────────────────────
describe("countThemeFiles", () => {
  it("soma as páginas até uma página curta", async () => {
    st.list
      .mockResolvedValueOnce(page(["a.jpg", "b.jpg"]))
      .mockResolvedValueOnce(page(["c.jpg"]))
      .mockResolvedValue(page([]));
    const { countThemeFiles } = await load();
    expect(await countThemeFiles("t-1", 5, 2)).toEqual({ total: 3, ok: true, truncated: false });
    expect(st.signed).not.toHaveBeenCalled();
  });

  it("para no teto de páginas e diz que o total é um MÍNIMO", async () => {
    st.list.mockResolvedValue(page(["a.jpg", "b.jpg"]));
    const { countThemeFiles } = await load();
    expect(await countThemeFiles("t-1", 2, 2)).toEqual({ total: 4, ok: true, truncated: true });
    expect(st.list).toHaveBeenCalledTimes(2);
  });

  it("uma pasta ilegível não é '0 fotos'", async () => {
    st.list.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { countThemeFiles } = await load();
    expect(await countThemeFiles("t-1")).toEqual({ total: 0, ok: false, truncated: false });
  });
});

// ── Uma página, assinada (originais + miniaturas) ──────────────────────────
describe("listThemeImagePage", () => {
  it("assina SÓ a página pedida, num pedido por bucket", async () => {
    st.list.mockResolvedValue(page(["a.jpg", "b.png"]));
    const { listThemeImagePage } = await load();
    const res = await listThemeImagePage("t-1", 2, 0);
    expect(res.images).toEqual([
      { path: "t-1/a.jpg", url: "https://signed/t-1/a.jpg", thumbUrl: "https://thumb/t-1/a.jpg" },
      { path: "t-1/b.png", url: "https://signed/t-1/b.png", thumbUrl: "https://thumb/t-1/b.png" },
    ]);
    expect(st.signed).toHaveBeenCalledTimes(1);
    expect(st.thumbSigned).toHaveBeenCalledTimes(1);
    // A MESMA chave nos dois buckets — é o que dispensa qualquer índice.
    expect(st.signed).toHaveBeenCalledWith(["t-1/a.jpg", "t-1/b.png"], expect.any(Number));
    expect(st.thumbSigned).toHaveBeenCalledWith(["t-1/a.jpg", "t-1/b.png"], expect.any(Number));
  });

  it("pede ao Storage exatamente a janela recebida", async () => {
    const { listThemeImagePage } = await load();
    await listThemeImagePage("t-1", 40, 120);
    expect(st.list).toHaveBeenCalledWith(
      "t-1",
      expect.objectContaining({ limit: 40, offset: 120 }),
    );
  });

  it("corta um limite absurdo em vez de mandar assinar a biblioteca toda", async () => {
    const { listThemeImagePage } = await load();
    await listThemeImagePage("t-1", 5000, -3);
    expect(st.list).toHaveBeenCalledWith("t-1", expect.objectContaining({ limit: 200, offset: 0 }));
  });

  it("uma foto SEM miniatura fica com o original (fotos anteriores às miniaturas)", async () => {
    st.list.mockResolvedValue(page(["velha.jpg", "nova.jpg"]));
    // O Storage devolve erro por item para o que não existe.
    st.thumbSigned.mockResolvedValue({
      data: [
        { path: "t-1/velha.jpg", signedUrl: null, error: "Object not found" },
        { path: "t-1/nova.jpg", signedUrl: "https://thumb/t-1/nova.jpg", error: null },
      ],
      error: null,
    });
    const { listThemeImagePage } = await load();
    const { images } = await listThemeImagePage("t-1", 10, 0);
    expect(images[0]).toEqual({ path: "t-1/velha.jpg", url: "https://signed/t-1/velha.jpg" });
    expect(images[1].thumbUrl).toBe("https://thumb/t-1/nova.jpg");
  });

  it("o bucket das miniaturas nem existir não estraga nada", async () => {
    st.list.mockResolvedValue(page(["a.jpg"]));
    st.thumbSigned.mockResolvedValue({ data: null, error: { message: "Bucket not found" } });
    const { listThemeImagePage } = await load();
    const { ok, images } = await listThemeImagePage("t-1", 10, 0);
    expect(ok).toBe(true);
    expect(images).toEqual([{ path: "t-1/a.jpg", url: "https://signed/t-1/a.jpg" }]);
    // E não o cria: um bucket vazio não serve para nada.
    expect(st.thumbBucket.creates).toBe(0);
  });

  it("a primeira página curta JÁ é o total — sem outra ida ao Storage", async () => {
    st.list.mockResolvedValue(page(["a.jpg", "b.jpg"]));
    const { listThemeImagePage } = await load();
    expect(await listThemeImagePage("t-1", 10, 0)).toMatchObject({ total: 2, truncated: false });
    expect(st.list).toHaveBeenCalledTimes(1);
  });

  it("conta a pasta quando a página vem cheia — o total não é o da página", async () => {
    st.list
      .mockResolvedValueOnce(page(["a.jpg", "b.jpg"])) // a página pedida (cheia)
      .mockResolvedValue(page(NAMES_500)); // a contagem, numa página só
    const { listThemeImagePage } = await load();
    const res = await listThemeImagePage("t-1", 2, 0);
    expect(res.images).toHaveLength(2);
    expect(res).toMatchObject({ total: 500, truncated: false });
  });

  it("pasta ilegível: ok=false e nada assinado (nunca 'tema sem fotos')", async () => {
    st.list.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { listThemeImagePage } = await load();
    expect(await listThemeImagePage("t-1", 10, 0)).toEqual({
      ok: false,
      images: [],
      total: 0,
      truncated: false,
    });
    expect(st.signed).not.toHaveBeenCalled();
    expect(st.thumbSigned).not.toHaveBeenCalled();
  });

  it("página lida mas contagem falhada: total é um mínimo honesto", async () => {
    st.list
      .mockResolvedValueOnce(page(["a.jpg", "b.jpg"]))
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    const { listThemeImagePage } = await load();
    expect(await listThemeImagePage("t-1", 2, 10)).toMatchObject({
      ok: true,
      total: 12,
      truncated: true,
    });
  });
});

// ── Miniaturas: carregar, apagar, nunca mandar em nada ─────────────────────
describe("miniaturas", () => {
  it("guarda a miniatura na MESMA chave, no bucket das miniaturas", async () => {
    const { uploadThemeImage } = await load();
    const res = await uploadThemeImage("t-1", Buffer.from("foto"), "image/jpeg", {
      bytes: Buffer.from("mini"),
      contentType: "image/jpeg",
    });
    const image = res?.kind === "created" ? res.image : null;
    expect(image?.path).toMatch(/^t-1\/[0-9a-f-]+\.jpg$/);
    expect(image?.thumbUrl).toBe(`https://thumb/${image?.path}`);
    expect(st.thumbUpload).toHaveBeenCalledWith(
      image?.path,
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/jpeg" }),
    );
    expect(st.buckets).toContain(THEME_THUMB_BUCKET);
  });

  it("cria o bucket das miniaturas no primeiro uso — e só nesse", async () => {
    st.thumbBucket.exists = false;
    const { uploadThemeImage } = await load();
    const thumb = { bytes: Buffer.from("mini"), contentType: "image/jpeg" };
    await Promise.all([
      uploadThemeImage("t-1", Buffer.from("a"), "image/jpeg", thumb),
      uploadThemeImage("t-1", Buffer.from("b"), "image/jpeg", thumb),
    ]);
    expect(st.thumbBucket.gets).toBe(1);
    expect(st.thumbBucket.creates).toBe(1);
  });

  it("uma miniatura que falha NÃO deita o carregamento abaixo", async () => {
    st.thumbUpload.mockResolvedValue({ data: null, error: { message: "sem permissões" } });
    const { uploadThemeImage } = await load();
    const res = await uploadThemeImage("t-1", Buffer.from("foto"), "image/jpeg", {
      bytes: Buffer.from("mini"),
      contentType: "image/jpeg",
    });
    const image = res?.kind === "created" ? res.image : null;
    expect(image?.url).toBeTruthy();
    expect(image?.thumbUrl).toBeUndefined();
  });

  it("sem miniatura enviada não se toca no bucket das miniaturas", async () => {
    const { uploadThemeImage } = await load();
    await uploadThemeImage("t-1", Buffer.from("foto"), "image/jpeg");
    expect(st.buckets).not.toContain(THEME_THUMB_BUCKET);
    expect(st.thumbUpload).not.toHaveBeenCalled();
  });

  it("apagar uma foto leva a miniatura com ela", async () => {
    const { deleteThemeImage } = await load();
    expect(await deleteThemeImage("t-1/a.jpg")).toBe(true);
    expect(st.remove).toHaveBeenCalledWith(["t-1/a.jpg"]);
    expect(st.thumbRemove).toHaveBeenCalledWith(["t-1/a.jpg"]);
  });

  it("a miniatura que não sai não impede apagar a foto", async () => {
    st.thumbRemove.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { deleteThemeImage } = await load();
    expect(await deleteThemeImage("t-1/a.jpg")).toBe(true);
  });
});

describe("signThemePaths", () => {
  it("assina caminhos de temas DIFERENTES num único pedido", async () => {
    const { signThemePaths } = await load();
    const urls = await signThemePaths(["t-1/a.jpg", "t-2/b.jpg"]);
    expect(st.signed).toHaveBeenCalledTimes(1);
    expect(urls.get("t-2/b.jpg")).toBe("https://signed/t-2/b.jpg");
  });

  it("não toca no Storage para uma lista vazia", async () => {
    const { signThemePaths } = await load();
    expect((await signThemePaths([])).size).toBe(0);
    expect(st.signed).not.toHaveBeenCalled();
  });
});

// ── Esvaziar a pasta ao eliminar o tema ────────────────────────────────────
describe("deleteThemeFolder", () => {
  it("pagina até uma página curta — um tema com mais de 500 fotos não deixa órfãs", async () => {
    st.list
      .mockResolvedValueOnce(page(NAMES_500))
      .mockResolvedValueOnce(page(["x.jpg", "y.jpg", "z.jpg"]));
    const { deleteThemeFolder } = await load();
    expect(await deleteThemeFolder("t-1")).toEqual({ ok: true, removed: 503 });
    expect(st.list.mock.calls.map((c) => (c[1] as { offset: number }).offset)).toEqual([0, 500]);
    expect(st.remove).toHaveBeenCalledTimes(2);
    expect(st.remove).toHaveBeenLastCalledWith(["t-1/x.jpg", "t-1/y.jpg", "t-1/z.jpg"]);
  });

  it("recusa (e não apaga nada) quando a listagem falha", async () => {
    st.list.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { deleteThemeFolder } = await load();
    expect(await deleteThemeFolder("t-1")).toEqual({ ok: false, removed: 0 });
    expect(st.remove).not.toHaveBeenCalled();
  });

  it("recusa quando a remoção falha, dizendo quantas já tinham saído", async () => {
    st.list
      .mockResolvedValueOnce(page(NAMES_500))
      .mockResolvedValueOnce(page(["x.jpg"]))
      .mockResolvedValue(page([]));
    st.remove.mockResolvedValueOnce({ data: NAMES_500.map((n) => ({ name: n })), error: null });
    st.remove.mockResolvedValueOnce({ data: null, error: { message: "sem permissões" } });
    const { deleteThemeFolder } = await load();
    expect(await deleteThemeFolder("t-1")).toEqual({ ok: false, removed: 500 });
  });

  it("recusa sem Storage — o tema tem de continuar lá para se poder repetir", async () => {
    st.configured = false;
    const { deleteThemeFolder } = await load();
    expect(await deleteThemeFolder("t-1")).toEqual({ ok: false, removed: 0 });
  });

  it("leva também as miniaturas do tema", async () => {
    st.list.mockResolvedValueOnce(page(["a.jpg"])).mockResolvedValue(page([]));
    st.thumbList.mockResolvedValueOnce(page(["a.jpg"])).mockResolvedValue(page([]));
    const { deleteThemeFolder } = await load();
    expect(await deleteThemeFolder("t-1")).toEqual({ ok: true, removed: 1 });
    expect(st.thumbRemove).toHaveBeenCalledWith(["t-1/a.jpg"]);
  });

  it("miniaturas que não se conseguem apagar NÃO impedem eliminar o tema", async () => {
    st.list.mockResolvedValueOnce(page(["a.jpg"])).mockResolvedValue(page([]));
    st.thumbList.mockResolvedValue({ data: null, error: { message: "Bucket not found" } });
    const { deleteThemeFolder } = await load();
    expect(await deleteThemeFolder("t-1")).toEqual({ ok: true, removed: 1 });
  });

  it("não apaga miniaturas quando as fotos ficaram por apagar", async () => {
    // Senão a grelha do tema (que continua lá) passava a puxar originais.
    st.list.mockResolvedValue(page(["a.jpg"]));
    st.remove.mockResolvedValue({ data: null, error: { message: "sem permissões" } });
    const { deleteThemeFolder } = await load();
    expect((await deleteThemeFolder("t-1")).ok).toBe(false);
    expect(st.thumbRemove).not.toHaveBeenCalled();
  });
});

// ── Escolher um LOTE da biblioteca para uma proposta ───────────────────────
describe("referenciarFotosDaBiblioteca", () => {
  /**
   * O TESTE QUE INTERESSA. Isto copiava os bytes para a pasta da proposta —
   * e era essa cópia que dava à foto uma identidade nova e deitava fora a
   * cache do navegador sobre a foto que ele tinha acabado de descarregar no
   * seletor. Se um dia voltar a haver aqui uma cópia, é este que fica
   * vermelho.
   */
  it("não copia UM ÚNICO byte", async () => {
    const { referenciarFotosDaBiblioteca } = await load();
    const paths = Array.from({ length: 10 }, (_, i) => `t-1/f${i}.jpg`);
    const res = await referenciarFotosDaBiblioteca(paths);

    expect(res.images).toHaveLength(10);
    expect(st.copy, "copiou fotos entre buckets").not.toHaveBeenCalled();
    expect(st.thumbCopy, "copiou miniaturas entre buckets").not.toHaveBeenCalled();
    expect(st.upload, "voltou a carregar bytes").not.toHaveBeenCalled();
    expect(st.download, "puxou bytes para a função").not.toHaveBeenCalled();
  });

  it("devolve REFERÊNCIAS, e assinadas contra o bucket dos temas", async () => {
    const { referenciarFotosDaBiblioteca } = await load();
    const res = await referenciarFotosDaBiblioteca(["t-1/a.jpg"]);

    expect(res.images[0].path, "o caminho guardado no documento").toBe("tema:t-1/a.jpg");
    // O `sourcePath` é o caminho nu — é o que o estúdio usa para marcar de que
    // tema veio a foto.
    expect(res.images[0].sourcePath).toBe("t-1/a.jpg");
    // Os URLs vêm dos buckets da BIBLIOTECA. A pasta da proposta nem é tocada.
    expect(st.signed).toHaveBeenCalledWith(["t-1/a.jpg"], SIGNED_TTL);
    expect(st.thumbSigned).toHaveBeenCalledWith(["t-1/a.jpg"], SIGNED_TTL);
    expect(st.buckets).toContain(THEME_BUCKET);
    expect(st.buckets).toContain(THEME_THUMB_BUCKET);
    expect(st.buckets).not.toContain("proposal-assets");
    expect(st.buckets).not.toContain("proposal-thumbs");
  });

  /**
   * A pasta de um pedido assina a 10 anos; a biblioteca a 6 horas, porque é o
   * activo do estúdio inteiro e são milhares de ficheiros. Assinar uma foto da
   * biblioteca com o prazo das propostas desfazia essa decisão em silêncio —
   * e o sítio onde isso aconteceria é precisamente este, porque quem assina é
   * código do `proposal-storage`.
   */
  it("assina com o prazo da BIBLIOTECA, não com o das propostas", async () => {
    const { referenciarFotosDaBiblioteca } = await load();
    await referenciarFotosDaBiblioteca(["t-1/a.jpg"]);
    expect(SIGNED_TTL).toBe(60 * 60 * 6);
    for (const chamada of [...st.signed.mock.calls, ...st.thumbSigned.mock.calls]) {
      expect(chamada[1], "prazo de assinatura errado").toBe(SIGNED_TTL);
    }
  });

  it("assina o lote inteiro em DOIS pedidos, não dois por foto", async () => {
    const { referenciarFotosDaBiblioteca } = await load();
    const paths = Array.from({ length: 40 }, (_, i) => `t-1/f${i}.jpg`);
    const res = await referenciarFotosDaBiblioteca(paths);
    expect(res.images).toHaveLength(40);
    expect(st.signOne, "assinou uma a uma").not.toHaveBeenCalled();
    expect(st.thumbSignOne, "assinou as miniaturas uma a uma").not.toHaveBeenCalled();
    expect(st.signed).toHaveBeenCalledTimes(1);
    expect(st.thumbSigned).toHaveBeenCalledTimes(1);
  });

  it("mantém a ordem PEDIDA — é a ordem por que saem no PDF", async () => {
    // O Storage devolve as assinaturas ao contrário, que é uma coisa que ele
    // pode fazer: a ordem tem de vir do pedido, não da resposta.
    st.signed.mockImplementation(async (paths: string[]) => ({
      data: [...paths].reverse().map((path) => ({ path, signedUrl: `https://signed/${path}` })),
      error: null,
    }));
    const { referenciarFotosDaBiblioteca } = await load();
    const paths = ["t-1/a.jpg", "t-1/b.jpg", "t-1/c.jpg", "t-1/d.jpg"];
    const res = await referenciarFotosDaBiblioteca(paths);
    expect(res.images.map((i) => i.path)).toEqual(paths.map((p) => `tema:${p}`));
  });

  it("uma foto sem URL sai da lista e é reportada, sem buracos nem trocas", async () => {
    st.signed.mockImplementation(async (paths: string[]) => ({
      data: paths
        .filter((p) => p !== "t-1/b.jpg")
        .map((path) => ({ path, signedUrl: `https://signed/${path}` })),
      error: null,
    }));
    const { referenciarFotosDaBiblioteca } = await load();
    const res = await referenciarFotosDaBiblioteca([
      "t-1/a.jpg",
      "t-1/b.jpg",
      "t-1/c.jpg",
      "t-1/d.jpg",
    ]);
    expect(res.images.map((i) => i.path)).toEqual([
      "tema:t-1/a.jpg",
      "tema:t-1/c.jpg",
      "tema:t-1/d.jpg",
    ]);
    expect(res.failed).toEqual(["t-1/b.jpg"]);
  });

  it("uma miniatura que falhe não impede a foto de entrar", async () => {
    st.thumbSigned.mockResolvedValue({ data: [], error: null });
    const { referenciarFotosDaBiblioteca } = await load();
    const res = await referenciarFotosDaBiblioteca(["t-1/a.jpg"]);
    expect(res.images).toHaveLength(1);
    expect(res.images[0].thumbUrl).toBeUndefined();
    expect(res.failed).toEqual([]);
  });

  it("recusa caminhos que não são do bucket de temas", async () => {
    const { referenciarFotosDaBiblioteca } = await load();
    const res = await referenciarFotosDaBiblioteca([
      "../proposal-assets/q-9/privada.jpg",
      "https://exemplo.pt/a.jpg",
    ]);
    expect(res.images).toEqual([]);
    expect(st.signed).not.toHaveBeenCalled();
  });
});

// ── Cópia tema → proposta ──────────────────────────────────────────────────
describe("copyThemeImageToProposal", () => {
  it("copia dentro do Storage, sem puxar os bytes para cá", async () => {
    const { copyThemeImageToProposal } = await load();
    const res = await copyThemeImageToProposal("t-1/a.jpg", "q-42");
    expect(res?.path).toMatch(/^q-42\/[0-9a-f-]+\.jpg$/);
    expect(res?.url).toBe(`https://signed/${res?.path}`);
    // Destino construído no servidor, no bucket das propostas.
    expect(st.copy).toHaveBeenCalledWith("t-1/a.jpg", res?.path, {
      destinationBucket: "proposal-assets",
    });
    expect(st.download).not.toHaveBeenCalled();
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("mantém a extensão da foto de origem", async () => {
    const { copyThemeImageToProposal } = await load();
    expect((await copyThemeImageToProposal("t-1/a.png", "q-1"))?.path).toMatch(/\.png$/);
    expect((await copyThemeImageToProposal("t-1/a.webp", "q-1"))?.path).toMatch(/\.webp$/);
    expect((await copyThemeImageToProposal("t-1/a.jpeg", "q-1"))?.path).toMatch(/\.jpg$/);
  });

  it("recorre a descarregar + carregar quando o Storage recusa a cópia", async () => {
    st.copy.mockResolvedValue({ data: null, error: { message: "not supported" } });
    const { copyThemeImageToProposal } = await load();
    const res = await copyThemeImageToProposal("t-1/a.jpg", "q-42");
    expect(res?.path).toMatch(/^q-42\/[0-9a-f-]+\.jpg$/);
    expect(st.download).toHaveBeenCalledWith("t-1/a.jpg");
    expect(st.upload).toHaveBeenCalledWith(
      res?.path,
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/jpeg" }),
    );
  });

  it("devolve null quando também o recurso falha", async () => {
    st.copy.mockResolvedValue({ data: null, error: { message: "não" } });
    st.download.mockResolvedValue({ data: null, error: { message: "não" } });
    const { copyThemeImageToProposal } = await load();
    expect(await copyThemeImageToProposal("t-1/a.jpg", "q-1")).toBeNull();
  });

  it("recusa um caminho que não é do bucket de temas SEM tocar no Storage", async () => {
    const { copyThemeImageToProposal } = await load();
    expect(await copyThemeImageToProposal("../proposal-assets/q-9/privada.jpg", "q-1")).toBeNull();
    expect(await copyThemeImageToProposal("https://exemplo.pt/a.jpg", "q-1")).toBeNull();
    expect(st.buckets).toEqual([]);
    expect(st.copy).not.toHaveBeenCalled();
    expect(st.download).not.toHaveBeenCalled();
  });
});

// ── A ordem arrumada à mão manda no início da lista ────────────────────────
describe("bilhetes de carregamento direto", () => {
  it("constrói o caminho NO SERVIDOR, dentro da pasta do tema", async () => {
    const { createThemeUploadTickets } = await load();
    const tickets = await createThemeUploadTickets("tema-1", ["image/jpeg", "image/png"]);

    expect(tickets).toHaveLength(2);
    // O que o cliente pediu foi só o TIPO; a pasta e o nome saem daqui.
    expect(tickets![0].path).toMatch(/^tema-1\/[0-9a-f-]{36}\.jpg$/);
    expect(tickets![1].path).toMatch(/^tema-1\/[0-9a-f-]{36}\.png$/);
    // Dois bilhetes nunca apontam ao mesmo sítio.
    expect(tickets![0].path).not.toBe(tickets![1].path);
    // A miniatura vai na MESMA chave, no bucket das miniaturas.
    expect(tickets![0].thumb?.path).toBe(tickets![0].path);
  });

  it("um id de tema com travessia é limpo antes de virar pasta", async () => {
    const { createThemeUploadTickets } = await load();
    const tickets = await createThemeUploadTickets("../../etc", ["image/jpeg"]);

    // `themeFolder` come os caracteres perigosos: sobra "etc", nunca um
    // caminho que saia do bucket.
    expect(tickets![0].path).toMatch(/^etc\//);
    expect(tickets![0].path).not.toContain("..");
  });

  it("emite sempre com upsert desligado — um bilhete não substitui nada", async () => {
    const { createThemeUploadTickets } = await load();
    await createThemeUploadTickets("tema-1", ["image/jpeg"]);

    expect(st.uploadUrl).toHaveBeenCalledWith(expect.any(String), { upsert: false });
  });

  it("corta o pedido no teto de bilhetes", async () => {
    const { createThemeUploadTickets } = await load();
    const tickets = await createThemeUploadTickets(
      "tema-1",
      Array.from({ length: 100 }, () => "image/jpeg"),
    );

    expect(tickets!.length).toBeLessThanOrEqual(24);
  });

  it("um Storage que não sabe emitir URLs devolve null — o cliente cai para o multipart", async () => {
    st.hasUploadUrlApi = false;
    const { createThemeUploadTickets } = await load();

    expect(await createThemeUploadTickets("tema-1", ["image/jpeg"])).toBeNull();
  });

  it("se UM bilhete falhar, não sai nenhum (nada de lotes com buracos)", async () => {
    st.uploadUrl.mockResolvedValueOnce({ data: null, error: { message: "não" } });
    const { createThemeUploadTickets } = await load();

    expect(await createThemeUploadTickets("tema-1", ["image/jpeg", "image/jpeg"])).toBeNull();
  });

  it("sem bucket de miniaturas, a foto sobe na mesma e fica sem miniatura", async () => {
    st.thumbBucket.exists = false;
    st.thumbBucket.createError = { message: "recusado" };
    const { createThemeUploadTickets } = await load();
    const tickets = await createThemeUploadTickets("tema-1", ["image/jpeg"]);

    expect(tickets).toHaveLength(1);
    expect(tickets![0].thumb).toBeNull();
  });
});

describe("confirmação de carregamentos diretos", () => {
  it("assina as boas e devolve-as com miniatura", async () => {
    const { confirmThemeUploads } = await load();
    const res = await confirmThemeUploads("tema-1", ["tema-1/foto.jpg"]);

    expect(res.rejected).toEqual([]);
    expect(res.images).toEqual([
      {
        path: "tema-1/foto.jpg",
        url: "https://signed/tema-1/foto.jpg",
        thumbUrl: "https://thumb/tema-1/foto.jpg",
      },
    ]);
  });

  it("RECUSA um caminho da pasta de outro tema, sem lhe tocar", async () => {
    const { confirmThemeUploads } = await load();
    const res = await confirmThemeUploads("tema-1", [
      "tema-2/roubada.jpg",
      "../proposal-assets/q-1/segredo.jpg",
      "tema-1/minha.jpg",
    ]);

    // Só a que é mesmo desta pasta é assinada. As outras nem chegam ao Storage.
    expect(res.images.map((i) => i.path)).toEqual(["tema-1/minha.jpg"]);
    expect(res.rejected).toContain("tema-2/roubada.jpg");
    expect(res.rejected).toContain("../proposal-assets/q-1/segredo.jpg");
  });

  it("uma imagem que não passa na verificação é APAGADA e reportada", async () => {
    insp.verdict = { ok: false, reason: "dimensoes-excessivas" };
    const { confirmThemeUploads } = await load();
    const proposal = await import("./proposal-storage");
    const res = await confirmThemeUploads("tema-1", ["tema-1/bomba.png"]);

    expect(res.images).toEqual([]);
    expect(res.rejected).toEqual(["tema-1/bomba.png"]);
    // Sai o original E a miniatura — nada de lixo órfão no bucket.
    expect(proposal.removeStoredObject).toHaveBeenCalledWith("theme-assets", "tema-1/bomba.png");
    expect(proposal.removeStoredObject).toHaveBeenCalledWith("theme-thumbs", "tema-1/bomba.png");
  });
});

describe("memória curta da contagem", () => {
  it("a segunda contagem não volta a ler a pasta", async () => {
    st.list.mockResolvedValue(page(NAMES_500));
    const { countThemeFiles } = await load();

    const first = await countThemeFiles("tema-1");
    const calls = st.list.mock.calls.length;
    const second = await countThemeFiles("tema-1");

    expect(second).toEqual(first);
    expect(st.list.mock.calls.length).toBe(calls);
  });

  it("carregar uma foto deita a contagem fora", async () => {
    st.list.mockResolvedValue(page(NAMES_500));
    const { countThemeFiles, uploadThemeImage } = await load();

    await countThemeFiles("tema-1");
    const calls = st.list.mock.calls.length;
    await uploadThemeImage("tema-1", Buffer.from("foto"), "image/jpeg");
    await countThemeFiles("tema-1");

    // Contou outra vez: o número que a Catarina vê muda quando ela mexe.
    expect(st.list.mock.calls.length).toBeGreaterThan(calls);
  });

  it("uma contagem TRUNCADA nunca fica guardada — é um mínimo, não um total", async () => {
    st.list.mockResolvedValue(page(NAMES_500));
    const { countThemeFiles } = await load();

    // Teto de 1 página com páginas cheias: o resultado sai truncado.
    const first = await countThemeFiles("tema-1", 1, 500);
    expect(first.truncated).toBe(true);
    const calls = st.list.mock.calls.length;
    await countThemeFiles("tema-1", 1, 500);

    expect(st.list.mock.calls.length).toBeGreaterThan(calls);
  });

  it("cada tema tem a sua contagem", async () => {
    st.list.mockResolvedValue(page(NAMES_500));
    const { countThemeFiles } = await load();

    await countThemeFiles("tema-1");
    const calls = st.list.mock.calls.length;
    await countThemeFiles("tema-2");

    expect(st.list.mock.calls.length).toBeGreaterThan(calls);
  });
});

describe("planOrderedPage", () => {
  const order = ["t/a.jpg", "t/b.jpg", "t/c.jpg"];

  it("serve o prefixo arrumado antes de tocar na pasta", () => {
    expect(planOrderedPage(order, 2, 0)).toEqual({
      fromOrder: ["t/a.jpg", "t/b.jpg"],
      storageSkip: 0,
      needFromStorage: 0,
    });
  });

  it("completa a página com a pasta quando o prefixo acaba a meio", () => {
    expect(planOrderedPage(order, 5, 0)).toEqual({
      fromOrder: order,
      storageSkip: 0,
      needFromStorage: 2,
    });
  });

  it("depois do prefixo, a pasta continua de onde ficou", () => {
    // Offset 5 com 3 arrumadas: já se mostraram as 3 + 2 da pasta.
    expect(planOrderedPage(order, 4, 5)).toEqual({
      fromOrder: [],
      storageSkip: 2,
      needFromStorage: 4,
    });
  });

  it("sem ordem manual é exatamente o comportamento de sempre", () => {
    expect(planOrderedPage([], 60, 120)).toEqual({
      fromOrder: [],
      storageSkip: 120,
      needFromStorage: 60,
    });
  });
});

// ── NÃO REPETIR FOTOS QUE JÁ ESTÃO NO TEMA ─────────────────────────────────
//
// A identidade de uma foto é o resumo do ficheiro ORIGINAL, guardado no NOME
// (`<tema>/<32 hex>.jpg`). O índice de repetidas é derivado da MESMA listagem
// que a contagem já faz — não há segunda lista a manter. Um furo aqui não dá
// um erro: dá uma foto BOA que desaparece em silêncio.

/** Uma página de listagem com eTag por objeto (é dele que sai o MD5). */
function pageWithETags(items: { name: string; etag?: string }[]) {
  return {
    data: items.map(({ name, etag }) => ({
      id: `id-${name}`,
      name,
      metadata: etag ? { eTag: `"${etag}"` } : null,
    })),
    error: null,
  };
}

const HASH_A = "0123456789abcdef0123456789abcdef";
const HASH_B = "fedcba9876543210fedcba9876543210";
const UUID_ANTIGO = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("readThemeFingerprints", () => {
  it("lê os resumos dos NOMES e os MD5 dos eTags, numa só passagem pela pasta", async () => {
    st.list.mockResolvedValue(
      pageWithETags([
        { name: `${HASH_A}.jpg`, etag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        { name: `${UUID_ANTIGO}.jpg`, etag: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      ]),
    );
    const { readThemeFingerprints } = await load();
    const index = await readThemeFingerprints("t-1");

    expect([...index.hashes]).toEqual([HASH_A]);
    expect(index.md5s.get("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")).toBe(`t-1/${UUID_ANTIGO}.jpg`);
    expect(index.ok).toBe(true);
    expect(index.complete).toBe(true);
    // A biblioteca antiga (nome UUID) está lá: a UI tem de o poder dizer.
    expect(index.legacy).toBe(true);
    // Zero assinaturas: o passo caro não acontece a construir um índice.
    expect(st.signed).not.toHaveBeenCalled();
  });

  it("um tema só com nomes de resumo não é 'legado'", async () => {
    st.list.mockResolvedValue(
      pageWithETags([{ name: `${HASH_A}.jpg` }, { name: `${HASH_B}.png` }]),
    );
    const { readThemeFingerprints } = await load();
    const index = await readThemeFingerprints("t-1");
    expect(index.legacy).toBe(false);
    expect(index.hashes.size).toBe(2);
  });

  it("uma pasta ILEGÍVEL não é 'sem repetidas'", async () => {
    // Dizer "nenhuma repetida" faria a UI prometer uma verificação que não
    // aconteceu — e o guarda da escrita deixaria de ter quem o explicasse.
    st.list.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { readThemeFingerprints } = await load();
    const index = await readThemeFingerprints("t-1");
    expect(index.ok).toBe(false);
    expect(index.hashes.size).toBe(0);
  });

  it("acima do teto de páginas o índice sai INCOMPLETO, não errado", async () => {
    // 20 páginas de 1000 sempre cheias: a partir daqui é melhor esforço
    // declarado e a UI não pode anunciar "12 já estavam".
    st.list.mockResolvedValue(
      pageWithETags(Array.from({ length: 1000 }, (_, i) => ({ name: `${UUID_ANTIGO}-${i}.jpg` }))),
    );
    const { readThemeFingerprints } = await load();
    const index = await readThemeFingerprints("t-1");
    expect(index.ok).toBe(true);
    expect(index.complete).toBe(false);
  });

  it("descarta eTags que não são o MD5 do conteúdo", async () => {
    // Um eTag de carregamento multipart traz `-<n>` e NÃO é o MD5. Casá-lo
    // saltaria uma foto boa; descartá-lo só deixa passar uma repetida.
    st.list.mockResolvedValue(
      pageWithETags([
        { name: "a.jpg", etag: "cccccccccccccccccccccccccccccccc-3" },
        { name: "b.jpg", etag: "nao-e-um-md5" },
      ]),
    );
    const { readThemeFingerprints } = await load();
    expect((await readThemeFingerprints("t-1")).md5s.size).toBe(0);
  });
});

describe("memória do índice de repetidas", () => {
  it("NÃO é reconstruído a cada foto carregada — é a armadilha de desempenho", async () => {
    // Reconstruir o índice a cada escrita transformaria um lote de 300 fotos
    // em 300 varrimentos: num tema de 4000, 300 × 4 `list` × 120 ms ≈ 144 s de
    // Storage desperdiçados por arrasto.
    st.list.mockResolvedValue(pageWithETags([{ name: `${HASH_A}.jpg` }]));
    const { readThemeFingerprints, uploadThemeImage } = await load();

    await readThemeFingerprints("t-1");
    const calls = st.list.mock.calls.length;

    for (let i = 0; i < 10; i++) {
      await uploadThemeImage("t-1", Buffer.from(`foto${i}`), "image/jpeg", undefined, {
        fingerprint: HASH_B,
      });
    }
    await readThemeFingerprints("t-1");

    expect(st.list.mock.calls.length).toBe(calls);
  });

  it("mas o índice fica a saber o que acabou de ser escrito", async () => {
    st.list.mockResolvedValue(pageWithETags([{ name: `${HASH_A}.jpg` }]));
    const { readThemeFingerprints, uploadThemeImage } = await load();

    await readThemeFingerprints("t-1");
    await uploadThemeImage("t-1", Buffer.from("foto"), "image/jpeg", undefined, {
      fingerprint: HASH_B,
    });

    expect((await readThemeFingerprints("t-1")).hashes.has(HASH_B)).toBe(true);
  });

  it("uma REMOÇÃO deita o índice fora (é o que não se sabe atualizar)", async () => {
    st.list.mockResolvedValue(pageWithETags([{ name: `${HASH_A}.jpg` }]));
    const { readThemeFingerprints, deleteThemeImage } = await load();

    await readThemeFingerprints("t-1");
    const calls = st.list.mock.calls.length;
    await deleteThemeImage(`t-1/${HASH_A}.jpg`);
    await readThemeFingerprints("t-1");

    expect(st.list.mock.calls.length).toBeGreaterThan(calls);
  });

  it("cada tema tem o seu índice", async () => {
    st.list.mockResolvedValue(pageWithETags([{ name: `${HASH_A}.jpg` }]));
    const { readThemeFingerprints } = await load();
    await readThemeFingerprints("t-1");
    const calls = st.list.mock.calls.length;
    await readThemeFingerprints("t-2");
    expect(st.list.mock.calls.length).toBeGreaterThan(calls);
  });
});

describe("uploadThemeImage — o nome é a identidade", () => {
  it("guarda a foto com o resumo no nome", async () => {
    const { uploadThemeImage } = await load();
    const res = await uploadThemeImage("t-1", Buffer.from("foto"), "image/jpeg", undefined, {
      fingerprint: HASH_A,
    });
    expect(res).toEqual({
      kind: "created",
      image: { path: `t-1/${HASH_A}.jpg`, url: `https://signed/t-1/${HASH_A}.jpg` },
    });
  });

  it("sem resumo continua a ser UUID — retro-compatível, nunca recusa", async () => {
    const { uploadThemeImage } = await load();
    const res = await uploadThemeImage("t-1", Buffer.from("foto"), "image/jpeg");
    expect(res?.kind).toBe("created");
    expect(res?.kind === "created" && res.image.path).toMatch(
      /^t-1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
    );
  });

  it("um resumo mal formado também cai no UUID (nunca chega ao caminho)", async () => {
    const { uploadThemeImage } = await load();
    const res = await uploadThemeImage("t-1", Buffer.from("foto"), "image/jpeg", undefined, {
      fingerprint: "../../etc/passwd",
    });
    expect(res?.kind === "created" && res.image.path).not.toContain("..");
  });

  it("o 409 do Storage vira `duplicate` — a garantia atómica, sem corrida", async () => {
    st.upload.mockResolvedValue({ data: null, error: { statusCode: "409", message: "Duplicate" } });
    const { uploadThemeImage } = await load();
    const res = await uploadThemeImage("t-1", Buffer.from("foto"), "image/jpeg", undefined, {
      fingerprint: HASH_A,
    });
    expect(res).toEqual({ kind: "duplicate", path: `t-1/${HASH_A}.jpg` });
    // Nada de miniatura para uma foto que não foi escrita.
    expect(st.thumbUpload).not.toHaveBeenCalled();
  });

  it("reconhece 'already exists' também pela frase", async () => {
    st.upload.mockResolvedValue({
      data: null,
      error: { message: "The resource already exists" },
    });
    const { uploadThemeImage } = await load();
    const res = await uploadThemeImage("t-1", Buffer.from("foto"), "image/jpeg", undefined, {
      fingerprint: HASH_A,
    });
    expect(res?.kind).toBe("duplicate");
  });

  it("uma avaria a sério continua a ser null — não se disfarça de repetida", async () => {
    st.upload.mockResolvedValue({ data: null, error: { statusCode: "500", message: "boom" } });
    const { uploadThemeImage } = await load();
    expect(
      await uploadThemeImage("t-1", Buffer.from("foto"), "image/jpeg", undefined, {
        fingerprint: HASH_A,
      }),
    ).toBeNull();
  });

  it("'Adicionar mesmo assim' põe sufixo — e a foto CONTINUA a contar no índice", async () => {
    const { uploadThemeImage, readThemeFingerprints } = await load();
    st.list.mockResolvedValue(pageWithETags([]));
    await readThemeFingerprints("t-1");
    const res = await uploadThemeImage("t-1", Buffer.from("foto"), "image/jpeg", undefined, {
      fingerprint: HASH_A,
      force: true,
    });
    expect(res?.kind === "created" && res.image.path).toMatch(
      new RegExp(`^t-1/${HASH_A}-[0-9a-f]{4}\\.jpg$`),
    );
    // Sem isto, cada cópia forçada abria um buraco permanente no índice.
    expect((await readThemeFingerprints("t-1")).hashes.has(HASH_A)).toBe(true);
  });
});

describe("findThemeImageByBytes — a rede secundária da biblioteca antiga", () => {
  /** MD5 real dos bytes, que é com o que o eTag da listagem é comparado. */
  const md5 = (s: string) => createHash("md5").update(Buffer.from(s)).digest("hex");

  it("reconhece a foto antiga pelo MD5 do conteúdo e diz QUAL é", async () => {
    st.list.mockResolvedValue(
      pageWithETags([{ name: `${UUID_ANTIGO}.jpg`, etag: md5("bytes-preparados") }]),
    );
    const { findThemeImageByBytes } = await load();
    expect(await findThemeImageByBytes("t-1", Buffer.from("bytes-preparados"))).toBe(
      `t-1/${UUID_ANTIGO}.jpg`,
    );
  });

  it("bytes diferentes não casam", async () => {
    st.list.mockResolvedValue(
      pageWithETags([{ name: `${UUID_ANTIGO}.jpg`, etag: md5("bytes-preparados") }]),
    );
    const { findThemeImageByBytes } = await load();
    expect(await findThemeImageByBytes("t-1", Buffer.from("outra-foto"))).toBeNull();
  });

  it("pasta ilegível NÃO responde 'não é repetida' com confiança", async () => {
    st.list.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { findThemeImageByBytes } = await load();
    expect(await findThemeImageByBytes("t-1", Buffer.from("x"))).toBeNull();
  });
});

// ── LEVAR FOTOS DE UM TEMA PARA OUTRO ──────────────────────────────────────
//
// A decisão que manda em tudo: o NOME DO FICHEIRO é preservado. É isso que faz
// "já está no destino?" ser uma colisão de chave respondida pelo Storage, que
// torna o lote repetível sem duplicar nada, e que leva a identidade da foto
// com ela (senão a deteção de repetidas deixava de a reconhecer no destino).

describe("transferThemeImage", () => {
  it("PRESERVA o nome do ficheiro — a identidade viaja com a foto", async () => {
    const { transferThemeImage } = await load();
    const res = await transferThemeImage(`t-1/${HASH_A}.jpg`, "t-2", "copy");
    expect(res).toEqual({ outcome: "copied", to: `t-2/${HASH_A}.jpg`, thumb: true });
    expect(st.copy).toHaveBeenCalledWith(`t-1/${HASH_A}.jpg`, `t-2/${HASH_A}.jpg`);
  });

  it("o destino é construído NO SERVIDOR, a partir do id do tema", async () => {
    const { transferThemeImage } = await load();
    // Um id com travessia é limpo pelo `themeFolder` antes de virar caminho.
    const res = await transferThemeImage("t-1/a.jpg", "../../etc", "copy");
    expect(res.to).toBe("etc/a.jpg");
  });

  it("copiar chama `copy` no MESMO bucket, sem `destinationBucket`", async () => {
    const { transferThemeImage } = await load();
    await transferThemeImage("t-1/a.jpg", "t-2", "copy");
    // Dois argumentos e mais nenhum: é dentro do bucket dos temas.
    expect(st.copy).toHaveBeenCalledWith("t-1/a.jpg", "t-2/a.jpg");
    expect(st.move).not.toHaveBeenCalled();
    expect(st.buckets).toContain(THEME_BUCKET);
  });

  it("mover usa `move` (atómico por foto: a foto nunca está em lado nenhum)", async () => {
    const { transferThemeImage } = await load();
    await transferThemeImage("t-1/a.jpg", "t-2", "move");
    expect(st.move).toHaveBeenCalledWith("t-1/a.jpg", "t-2/a.jpg");
    expect(st.copy).not.toHaveBeenCalled();
  });

  it("409 no destino → `exists`, e ao MOVER a origem NÃO é apagada", async () => {
    // Apagar aqui seria inferir, a partir do nome, que os bytes são os mesmos.
    st.move.mockResolvedValue({ data: null, error: { statusCode: "409", message: "Duplicate" } });
    const { transferThemeImage } = await load();
    const res = await transferThemeImage("t-1/a.jpg", "t-2", "move");
    expect(res.outcome).toBe("exists");
    expect(st.remove).not.toHaveBeenCalled();
    // E a miniatura nem é tentada: não há nada de novo no destino.
    expect(st.thumbMove).not.toHaveBeenCalled();
  });

  it("um erro no ORIGINAL é `failed` e a miniatura nem chega a ser tentada", async () => {
    st.copy.mockResolvedValue({ data: null, error: { statusCode: "500", message: "boom" } });
    const { transferThemeImage } = await load();
    expect((await transferThemeImage("t-1/a.jpg", "t-2", "copy")).outcome).toBe("failed");
    expect(st.thumbCopy).not.toHaveBeenCalled();
  });

  it("a miniatura falhada NÃO muda o resultado — só é assinalada", async () => {
    // 92× mais bytes se ela faltar (164 MB contra 1,78 MB por página de 60),
    // por isso conta-se; mas a foto está no destino e isso é o que decide.
    st.thumbCopy.mockResolvedValue({ data: null, error: { statusCode: "500", message: "boom" } });
    const { transferThemeImage } = await load();
    const res = await transferThemeImage("t-1/a.jpg", "t-2", "copy");
    expect(res.outcome).toBe("copied");
    expect(res.thumb).toBe(false);
  });

  /**
   * ── A MICRO VAI NO MESMO GESTO QUE A MINIATURA ──────────────────────────
   *
   * São DUAS derivadas com a mesma chave: a miniatura de 400 px (as grelhas) e
   * a micro de 96 px (as três tiras de pré-visualização do cartão de tema).
   * Levava-se a primeira e esquecia-se a segunda — e isso são duas avarias, não
   * uma: a micro ficava ÓRFÃ na origem (ao mover, apontando para uma foto que
   * já lá não está) e o cartão do destino passava a puxar os 400 px para
   * desenhar 43 × 42 px, que são os 91% de bytes a mais que a micro existe
   * exactamente para poupar.
   */
  it("a MICRO acompanha a foto, como a miniatura", async () => {
    const { transferThemeImage } = await load();
    await transferThemeImage("t-1/a.jpg", "t-2", "copy");
    expect(st.thumbCopy).toHaveBeenCalledWith("t-1/a.jpg", "t-2/a.jpg");
    expect(
      st.microCopy,
      "a micro ficou para trás — órfã na origem, em falta no destino",
    ).toHaveBeenCalledWith("t-1/a.jpg", "t-2/a.jpg");
  });

  it("ao MOVER, a micro é MOVIDA — não fica órfã na origem", async () => {
    const { transferThemeImage } = await load();
    await transferThemeImage("t-1/a.jpg", "t-2", "move");
    expect(st.microMove).toHaveBeenCalledWith("t-1/a.jpg", "t-2/a.jpg");
    expect(st.microCopy).not.toHaveBeenCalled();
  });

  it("a micro falhada não muda o resultado nem o veredicto da miniatura", async () => {
    // Quem não encontra a micro cai na miniatura — é uma degradação de bytes,
    // não uma foto perdida. O `thumb` continua a ser sobre os 400 px, que é o
    // que a conta "N sem miniatura" do painel mostra.
    st.microCopy.mockResolvedValue({ data: null, error: { statusCode: "500", message: "boom" } });
    const { transferThemeImage } = await load();
    const res = await transferThemeImage("t-1/a.jpg", "t-2", "copy");
    expect(res).toEqual({ outcome: "copied", to: "t-2/a.jpg", thumb: true });
  });

  it("NUNCA cria o bucket da micro (nem o das miniaturas)", async () => {
    st.microBucket.exists = false;
    const { transferThemeImage } = await load();
    await transferThemeImage("t-1/a.jpg", "t-2", "copy");
    expect(st.microBucket.creates).toBe(0);
  });

  it("409 no destino → a micro nem é tentada, como a miniatura", async () => {
    st.copy.mockResolvedValue({ data: null, error: { statusCode: "409", message: "Duplicate" } });
    const { transferThemeImage } = await load();
    expect((await transferThemeImage("t-1/a.jpg", "t-2", "copy")).outcome).toBe("exists");
    expect(st.microCopy).not.toHaveBeenCalled();
  });

  it("uma miniatura que não existe (404) é ignorada — a foto chega na mesma", async () => {
    st.thumbCopy.mockResolvedValue({
      data: null,
      error: { statusCode: "404", message: "Not found" },
    });
    const { transferThemeImage } = await load();
    expect((await transferThemeImage("t-1/a.jpg", "t-2", "copy")).outcome).toBe("copied");
  });

  it("NUNCA cria o bucket das miniaturas", async () => {
    // Numa instalação anterior às miniaturas não há nada para copiar; criá-lo
    // seria ruído. É a regra que o módulo já segue.
    st.thumbBucket.exists = false;
    const { transferThemeImage } = await load();
    await transferThemeImage("t-1/a.jpg", "t-2", "copy");
    expect(st.thumbBucket.creates).toBe(0);
  });

  it("um caminho inválido não toca no Storage", async () => {
    const { transferThemeImage } = await load();
    for (const bad of ["../proposal-assets/q-1/privada.jpg", "https://exemplo.pt/a.jpg", ""]) {
      expect((await transferThemeImage(bad, "t-2", "copy")).outcome).toBe("failed");
    }
    expect(st.copy).not.toHaveBeenCalled();
    expect(st.move).not.toHaveBeenCalled();
  });

  it("origem igual a destino é recusada sem tocar no Storage", async () => {
    const { transferThemeImage } = await load();
    expect((await transferThemeImage("t-1/a.jpg", "t-1", "copy")).outcome).toBe("failed");
    expect(st.copy).not.toHaveBeenCalled();
  });

  it("o destino fica a saber que tem a foto (a costura com as repetidas)", async () => {
    st.list.mockResolvedValue(pageWithETags([]));
    const { transferThemeImage, readThemeFingerprints } = await load();
    await readThemeFingerprints("t-2");
    await transferThemeImage(`t-1/${HASH_A}.jpg`, "t-2", "copy");
    // Largar depois o ficheiro original em t-2 é corretamente detetado.
    expect((await readThemeFingerprints("t-2")).hashes.has(HASH_A)).toBe(true);
  });

  it("repetir o mesmo lote é inofensivo: tudo `exists`, zero duplicados", async () => {
    const { transferThemeImage } = await load();
    expect((await transferThemeImage("t-1/a.jpg", "t-2", "copy")).outcome).toBe("copied");
    st.copy.mockResolvedValue({ data: null, error: { statusCode: "409", message: "Duplicate" } });
    expect((await transferThemeImage("t-1/a.jpg", "t-2", "copy")).outcome).toBe("exists");
    expect((await transferThemeImage("t-1/a.jpg", "t-2", "copy")).outcome).toBe("exists");
  });
});

// ── A Reciclagem (R3b, `docs/TUDO-REVERSIVEL.md`) ──────────────────────────
// Uma foto removida de um tema vivo sai da pasta para `reciclagem/<entrada>/`
// com UM `move`, e volta ao mesmo caminho. As derivadas ficam onde estão.
describe("fotos na Reciclagem", () => {
  const ENTRADA = "0b6e8a52-3c41-4f0e-9d7a-2f1c5e9b7a10";
  const GUARDADA = `reciclagem/${ENTRADA}/a.jpg`;

  it("o caminho na Reciclagem tem dois níveis, e recusa o que é estranho", async () => {
    const { caminhoNaReciclagem } = await load();
    expect(caminhoNaReciclagem("t-1/a.jpg", ENTRADA)).toBe(GUARDADA);
    expect(caminhoNaReciclagem("../x/a.jpg", ENTRADA)).toBeNull();
    expect(caminhoNaReciclagem("t-1/a.jpg", "../../t-2")).toBeNull();
  });

  it("levar é um `move` do original — a miniatura não sai do sítio", async () => {
    const { levarFotoParaAReciclagem } = await load();
    expect(await levarFotoParaAReciclagem("t-1/a.jpg", GUARDADA)).toBe(true);
    expect(st.move).toHaveBeenCalledWith("t-1/a.jpg", GUARDADA);
    expect(st.remove).not.toHaveBeenCalled();
    expect(st.thumbMove).not.toHaveBeenCalled();
    expect(st.thumbRemove).not.toHaveBeenCalled();
  });

  it("um `move` recusado diz que não — a foto fica no tema", async () => {
    st.move.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const { levarFotoParaAReciclagem } = await load();
    expect(await levarFotoParaAReciclagem("t-1/a.jpg", GUARDADA)).toBe(false);
  });

  it("trazer devolve ao mesmo caminho; se já lá está outra, não pisa", async () => {
    const { trazerFotoDaReciclagem } = await load();
    expect(await trazerFotoDaReciclagem("t-1/a.jpg", GUARDADA)).toBe("ok");
    expect(st.move).toHaveBeenCalledWith(GUARDADA, "t-1/a.jpg");
    st.move.mockResolvedValueOnce({
      data: null,
      error: { statusCode: "409", message: "The resource already exists" },
    });
    expect(await trazerFotoDaReciclagem("t-1/a.jpg", GUARDADA)).toBe("existe");
  });

  it("largar apaga a guardada e a miniatura — se a foto não voltou ao tema", async () => {
    const { largarFotoDaReciclagem } = await load();
    expect(await largarFotoDaReciclagem("t-1/a.jpg", GUARDADA)).toBe(true);
    expect(st.remove).toHaveBeenCalledWith([GUARDADA]);
    expect(st.thumbRemove).toHaveBeenCalledWith(["t-1/a.jpg"]);
  });

  it("largar NÃO leva a miniatura de uma foto que entretanto voltou ao tema", async () => {
    st.list.mockResolvedValue(page(["a.jpg"]));
    const { largarFotoDaReciclagem } = await load();
    expect(await largarFotoDaReciclagem("t-1/a.jpg", GUARDADA)).toBe(true);
    expect(st.remove).toHaveBeenCalledWith([GUARDADA]);
    expect(st.thumbRemove).not.toHaveBeenCalled();
  });

  it("se a guardada não sai, diz que não — a entrada fica para amanhã", async () => {
    st.remove.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const { largarFotoDaReciclagem } = await load();
    expect(await largarFotoDaReciclagem("t-1/a.jpg", GUARDADA)).toBe(false);
  });
});
