import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O `balde()` com duplos: um Supabase em memória, o índice em memória, e o
 * Blob em memória (as portas de `blob.ts`). Prende o encaminhamento por modo,
 * o recuo para o Supabase, e que sem o token NADA muda.
 */

const estado = vi.hoisted(() => ({
  modo: "supabase" as "supabase" | "espelho" | "blob",
  supabase: new Map<string, Map<string, Uint8Array>>(),
  indice: new Map<
    string,
    Map<
      string,
      { t: number; c: string; m?: string | null; s?: string | null; ct?: string; v?: boolean }
    >
  >(),
  blob: new Map<string, Uint8Array>(),
  recusar: null as null | string,
  falharLeituraDoBlob: false,
  indiceFalhaAoGravar: false,
  falharApagar: false,
}));

vi.mock("./modos", () => ({ modoDoBalde: async () => estado.modo }));

vi.mock("./indice", () => {
  const de = (b: string) => {
    if (!estado.indice.has(b)) estado.indice.set(b, new Map());
    return estado.indice.get(b)!;
  };
  return {
    lerDoIndice: async (b: string, cs: string[]) =>
      new Map(cs.filter((c) => de(b).has(c)).map((c) => [c, de(b).get(c)!])),
    indiceDebaixoDe: async (b: string, p: string) => ({
      linhas: new Map([...de(b)].filter(([c]) => c.startsWith(p))),
      completa: true,
    }),
    gravarNoIndice: async (b: string, ls: { caminho: string; linha: never }[]) => {
      if (estado.indiceFalhaAoGravar) return false;
      for (const { caminho, linha } of ls) de(b).set(caminho, linha);
      return true;
    },
    tirarDoIndice: async (b: string, cs: string[]) => {
      for (const c of cs) de(b).delete(c);
      return true;
    },
  };
});

vi.mock("./blob", () => {
  class BlobRecusado extends Error {
    constructor(readonly motivo: string) {
      super("recusado");
    }
  }
  class BlobAvariado extends Error {
    constructor(
      readonly operacao: string,
      readonly codigo: string,
    ) {
      super(codigo);
    }
  }
  return {
    BlobRecusado,
    BlobAvariado,
    porNoBlob: vi.fn(async (chave: string, bytes: Uint8Array, o: { sobrescrever: boolean }) => {
      if (estado.recusar) throw new BlobRecusado(estado.recusar);
      if (!o.sobrescrever && estado.blob.has(chave)) throw new BlobAvariado("put", "ja-existe");
      estado.blob.set(chave, bytes);
      return { etag: null };
    }),
    lerDoBlob: vi.fn(async (chave: string) => {
      if (estado.falharLeituraDoBlob) throw new BlobAvariado("get", "avaria");
      const b = estado.blob.get(chave);
      return b ? { bytes: b, tipo: "image/jpeg" } : null;
    }),
    apagarDoBlob: vi.fn(async (chaves: string[]) => {
      if (estado.falharApagar) throw new BlobAvariado("del", "avaria");
      for (const c of chaves) estado.blob.delete(c);
    }),
    copiarNoBlob: vi.fn(async (de: string, para: string) => {
      estado.blob.set(para, estado.blob.get(de)!);
    }),
    urlDeLeituraDoBlob: vi.fn(
      async (chave: string) => `https://loja.private.blob.vercel-storage.com/${chave}?assinado`,
    ),
  };
});

function fakeBucket(nome: string) {
  // Lido a cada chamada: os testes trocam o mapa de um balde a meio.
  const mapa = () => {
    if (!estado.supabase.has(nome)) estado.supabase.set(nome, new Map());
    return estado.supabase.get(nome)!;
  };
  const bytes = async (c: unknown) =>
    c instanceof Uint8Array ? c : new Uint8Array(await (c as Blob).arrayBuffer());
  return {
    upload: vi.fn(async (p: string, corpo: unknown, o?: { upsert?: boolean }) => {
      if (mapa().has(p) && !o?.upsert)
        return { data: null, error: { message: "The resource already exists", statusCode: "409" } };
      mapa().set(p, await bytes(corpo));
      return { data: { path: p }, error: null };
    }),
    download: vi.fn(async (p: string) =>
      mapa().has(p)
        ? { data: new Blob([Buffer.from(mapa().get(p)!)]), error: null }
        : { data: null, error: { message: "Object not found", statusCode: "404" } },
    ),
    exists: vi.fn(async (p: string) => ({ data: mapa().has(p), error: null })),
    remove: vi.fn(async (ps: string[]) => {
      const fora = ps.filter((p) => mapa().delete(p));
      return { data: fora.map((name) => ({ name })), error: null };
    }),
    list: vi.fn(async (pasta: string, o?: { limit?: number; offset?: number }) => {
      const nomes = [...mapa().keys()]
        .filter((k) => k.startsWith(pasta ? `${pasta}/` : ""))
        .map((k) => k.slice(pasta ? pasta.length + 1 : 0));
      const ficheiros = nomes.filter((n) => !n.includes("/"));
      const lista = ficheiros.map((name) => ({
        name,
        id: `sb-${name}`,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
        last_accessed_at: null,
        metadata: { size: mapa().get(pasta ? `${pasta}/${name}` : name)!.byteLength },
      }));
      return {
        data: lista.slice(o?.offset ?? 0, (o?.offset ?? 0) + (o?.limit ?? 100)),
        error: null,
      };
    }),
    createSignedUrls: vi.fn(async (ps: string[]) => ({
      data: ps.map((p) => ({
        path: p,
        signedUrl: `https://sb.supabase.co/storage/v1/object/sign/${nome}/${p}?token=x`,
        error: null,
      })),
      error: null,
    })),
    createSignedUrl: vi.fn(async (p: string) => ({
      data: { signedUrl: `https://sb.supabase.co/storage/v1/object/sign/${nome}/${p}?token=x` },
      error: null,
    })),
    copy: vi.fn(async () => ({ data: { path: "x" }, error: null })),
    move: vi.fn(async () => ({ data: { message: "ok" }, error: null })),
    info: vi.fn(async () => ({ data: { cacheControl: "max-age=3600" }, error: null })),
    createSignedUploadUrl: vi.fn(async (p: string) => ({
      data: { signedUrl: `https://sb/${p}`, token: "t", path: p },
      error: null,
    })),
  };
}

const baldesFalsos = new Map<string, ReturnType<typeof fakeBucket>>();
const sb = {
  storage: {
    from: vi.fn((nome: string) => {
      if (!baldesFalsos.has(nome)) baldesFalsos.set(nome, fakeBucket(nome));
      return baldesFalsos.get(nome)!;
    }),
  },
};
vi.mock("@/lib/supabase", () => ({ getSupabase: () => sb }));

import { balde, esquecerTodasAsJuncoes } from "./balde";
import * as blob from "./blob";

const JPG = new Uint8Array([0xff, 0xd8, 1, 2, 3]);

beforeEach(() => {
  estado.modo = "supabase";
  estado.supabase.clear();
  estado.indice.clear();
  estado.blob.clear();
  estado.recusar = null;
  estado.falharLeituraDoBlob = false;
  estado.indiceFalhaAoGravar = false;
  estado.falharApagar = false;
  baldesFalsos.clear();
  esquecerTodasAsJuncoes();
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_Loja1234_segredo";
  process.env.SESSION_SECRET = "segredo-das-sessoes-de-teste-com-32-caracteres";
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.SESSION_SECRET;
  delete process.env.BLOB_URL_SECRET;
});

describe("balde(): sem o token do Blob, é o balde do Supabase TAL E QUAL", () => {
  it("devolve o mesmo objecto que `sb.storage.from(nome)`", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(balde("proposal-assets", sb as never)).toBe(sb.storage.from("proposal-assets"));
  });

  it("um balde fora dos três também passa tal e qual, com o token", () => {
    expect(balde("proposal-thumbs", sb as never)).toBe(sb.storage.from("proposal-thumbs"));
  });

  it("sem `sb`, usa o `getSupabase()`", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(balde("theme-assets")).toBe(sb.storage.from("theme-assets"));
  });
});

describe("balde(): modo `supabase` com o token", () => {
  it("escreve e lê só no Supabase; o Blob nem é tocado", async () => {
    const b = balde("proposal-assets", sb as never);
    expect((await b.upload("LIQ-1/a.jpg", JPG, { contentType: "image/jpeg" })).error).toBeNull();
    expect(estado.supabase.get("proposal-assets")!.has("LIQ-1/a.jpg")).toBe(true);
    expect(blob.porNoBlob).not.toHaveBeenCalled();
  });

  it("os métodos que não são nossos passam ao Supabase (envio directo do navegador)", async () => {
    estado.modo = "blob";
    const r = await balde("proposal-assets", sb as never).createSignedUploadUrl("LIQ-1/x.jpg");
    expect(r.data?.signedUrl).toBe("https://sb/LIQ-1/x.jpg");
  });
});

describe("balde(): modo `espelho`", () => {
  it("escreve nos dois e lê do Supabase", async () => {
    estado.modo = "espelho";
    const b = balde("theme-assets", sb as never);
    await b.upload("t/a.jpg", JPG, { contentType: "image/jpeg" });
    expect(estado.supabase.get("theme-assets")!.has("t/a.jpg")).toBe(true);
    expect(estado.blob.has("theme-assets/t/a.jpg")).toBe(true);
    expect(estado.indice.get("theme-assets")!.get("t/a.jpg")!.t).toBe(JPG.byteLength);
    await b.download("t/a.jpg");
    expect(blob.lerDoBlob).not.toHaveBeenCalled();
  });

  it("um erro do Blob no espelho não estraga a escrita no Supabase", async () => {
    estado.modo = "espelho";
    estado.recusar = "armazenamento";
    const r = await balde("theme-assets", sb as never).upload("t/a.jpg", JPG);
    expect(r.error).toBeNull();
    expect(estado.supabase.get("theme-assets")!.has("t/a.jpg")).toBe(true);
  });
});

describe("balde(): modo `blob`", () => {
  it("escreve no Blob e no índice, não no Supabase", async () => {
    estado.modo = "blob";
    const r = await balde("proposal-pdfs", sb as never).upload("p1/k.pdf", JPG, {
      contentType: "application/pdf",
    });
    expect(r.error).toBeNull();
    expect(estado.blob.has("proposal-pdfs/p1/k.pdf")).toBe(true);
    expect(estado.supabase.get("proposal-pdfs")?.has("p1/k.pdf") ?? false).toBe(false);
    const linha = estado.indice.get("proposal-pdfs")!.get("p1/k.pdf")!;
    expect(linha.s).toMatch(/^[0-9a-f]{64}$/);
    expect(linha.m).toMatch(/^[0-9a-f]{32}$/);
  });

  it("uma escrita recusada pelo tecto vai para o Supabase — nunca se perde", async () => {
    estado.modo = "blob";
    estado.recusar = "operacoes-avancadas";
    const r = await balde("proposal-assets", sb as never).upload("LIQ-1/a.jpg", JPG);
    expect(r.error).toBeNull();
    expect(estado.supabase.get("proposal-assets")!.has("LIQ-1/a.jpg")).toBe(true);
    expect(estado.blob.size).toBe(0);
  });

  it("um índice que não grava desfaz a escrita no Blob e guarda no Supabase", async () => {
    estado.modo = "blob";
    estado.indiceFalhaAoGravar = true;
    const r = await balde("proposal-assets", sb as never).upload("LIQ-1/a.jpg", JPG);
    expect(r.error).toBeNull();
    expect(estado.blob.has("proposal-assets/LIQ-1/a.jpg")).toBe(false);
    expect(estado.supabase.get("proposal-assets")!.has("LIQ-1/a.jpg")).toBe(true);
  });

  it("`upsert: false` recusa com 409 o que já existe — no Blob ou no Supabase", async () => {
    estado.modo = "blob";
    const b = balde("theme-assets", sb as never);
    await b.upload("t/a.jpg", JPG);
    expect((await b.upload("t/a.jpg", JPG)).error).toMatchObject({ statusCode: "409" });
    estado.supabase.set("theme-assets", new Map([["t/velha.jpg", JPG]]));
    expect((await b.upload("t/velha.jpg", JPG)).error).toMatchObject({ statusCode: "409" });
  });

  it("lê do Blob o que o índice diz que lá está", async () => {
    estado.modo = "blob";
    const b = balde("theme-assets", sb as never);
    await b.upload("t/a.jpg", JPG);
    const r = await b.download("t/a.jpg");
    expect(new Uint8Array(await r.data!.arrayBuffer())).toEqual(JPG);
    expect(sb.storage.from("theme-assets").download).not.toHaveBeenCalled();
  });

  it("um 404 no Blob volta ao Supabase — nunca se perde uma foto a meio da migração", async () => {
    estado.modo = "blob";
    estado.indice.set("theme-assets", new Map([["t/a.jpg", { t: 5, c: "x" }]]));
    estado.supabase.set("theme-assets", new Map([["t/a.jpg", JPG]]));
    const r = await balde("theme-assets", sb as never).download("t/a.jpg");
    expect(r.error).toBeNull();
    expect(new Uint8Array(await r.data!.arrayBuffer())).toEqual(JPG);
  });

  it("uma avaria do Blob também volta ao Supabase", async () => {
    estado.modo = "blob";
    estado.falharLeituraDoBlob = true;
    estado.indice.set("theme-assets", new Map([["t/a.jpg", { t: 5, c: "x" }]]));
    estado.supabase.set("theme-assets", new Map([["t/a.jpg", JPG]]));
    expect((await balde("theme-assets", sb as never).download("t/a.jpg")).error).toBeNull();
  });

  it("a listagem junta o Supabase e o índice — sem listar o Blob", async () => {
    estado.modo = "blob";
    estado.supabase.set("proposal-assets", new Map([["LIQ-1/velha.jpg", JPG]]));
    estado.indice.set(
      "proposal-assets",
      new Map([
        ["LIQ-1/nova.jpg", { t: 9, c: "2026-11-16", m: "a".repeat(32) }],
        ["LIQ-2/outra.jpg", { t: 9, c: "2026-11-16" }],
      ]),
    );
    const { data } = await balde("proposal-assets", sb as never).list("LIQ-1");
    expect(data!.map((e) => e.name).sort()).toEqual(["nova.jpg", "velha.jpg"]);
    const nova = data!.find((e) => e.name === "nova.jpg")!;
    expect(nova.id).toBeTruthy();
    expect(nova.metadata).toMatchObject({ size: 9, eTag: `"${"a".repeat(32)}"` });
  });

  it("assina pelo Blob o que lá está (endereço estável) e pelo Supabase o resto", async () => {
    estado.modo = "blob";
    estado.indice.set("proposal-assets", new Map([["LIQ-1/nova.jpg", { t: 9, c: "x" }]]));
    const { data } = await balde("proposal-assets", sb as never).createSignedUrls(
      ["LIQ-1/nova.jpg", "LIQ-1/velha.jpg"],
      3600 * 24,
    );
    expect(data![0].signedUrl).toMatch(
      /^\/api\/ficheiro\/proposal-assets\/LIQ-1\/nova\.jpg\?token=/,
    );
    expect(data![1].signedUrl).toMatch(/supabase\.co/);
  });

  it("um prazo curto (servidor) assina directo no Blob", async () => {
    estado.modo = "blob";
    estado.indice.set("proposal-assets", new Map([["LIQ-1/nova.jpg", { t: 9, c: "x" }]]));
    const { data } = await balde("proposal-assets", sb as never).createSignedUrl(
      "LIQ-1/nova.jpg",
      60,
    );
    expect(data!.signedUrl).toMatch(/^https:\/\/loja\.private\.blob/);
  });

  it("apagar leva dos dois lados e tira do índice", async () => {
    estado.modo = "blob";
    const b = balde("proposal-assets", sb as never);
    await b.upload("LIQ-1/a.jpg", JPG);
    estado.supabase.set("proposal-assets", new Map([["LIQ-1/b.jpg", JPG]]));
    const r = await b.remove(["LIQ-1/a.jpg", "LIQ-1/b.jpg"]);
    expect(r.error).toBeNull();
    expect((r.data as { name: string }[]).map((o) => o.name).sort()).toEqual([
      "LIQ-1/a.jpg",
      "LIQ-1/b.jpg",
    ]);
    expect(estado.blob.size).toBe(0);
    expect(estado.indice.get("proposal-assets")!.size).toBe(0);
  });

  it("copiar de um balde para outro, dentro do Blob, não passa bytes pela função", async () => {
    estado.modo = "blob";
    await balde("theme-assets", sb as never).upload("t/a.jpg", JPG, { contentType: "image/jpeg" });
    const r = await balde("theme-assets", sb as never).copy("t/a.jpg", "LIQ-1/a.jpg", {
      destinationBucket: "proposal-assets",
    });
    expect(r.error).toBeNull();
    expect(blob.copiarNoBlob).toHaveBeenCalledTimes(1);
    expect(estado.indice.get("proposal-assets")!.has("LIQ-1/a.jpg")).toBe(true);
  });

  it("`exists` vê o que está só no Blob", async () => {
    estado.modo = "blob";
    estado.indice.set("theme-assets", new Map([["t/a.jpg", { t: 5, c: "x" }]]));
    expect((await balde("theme-assets", sb as never).exists("t/a.jpg")).data).toBe(true);
  });

  it("sem segredo para os endereços, assina no Supabase em vez de falhar (revisão 17/11, n.º 7)", async () => {
    estado.modo = "blob";
    delete process.env.SESSION_SECRET;
    estado.indice.set("proposal-assets", new Map([["LIQ-1/nova.jpg", { t: 9, c: "x" }]]));
    const { data } = await balde("proposal-assets", sb as never).createSignedUrls(
      ["LIQ-1/nova.jpg"],
      3600 * 24,
    );
    expect(data![0].signedUrl).toMatch(/supabase\.co/);
  });

  it("BLOB_URL_SECRET, quando existe, ganha ao SESSION_SECRET", async () => {
    const { segredoDosEnderecos } = await import("./url-estavel");
    expect(segredoDosEnderecos({ BLOB_URL_SECRET: "a", SESSION_SECRET: "b" })).toBe("a");
    expect(segredoDosEnderecos({ SESSION_SECRET: "b", BLOB_READ_WRITE_TOKEN: "t" })).toBe("b");
    expect(segredoDosEnderecos({ BLOB_READ_WRITE_TOKEN: "t" })).toBe("");
  });

  describe("revisão de 17/11, n.º 9", () => {
    it("copiar dentro do Blob leva o Cache-Control do original", async () => {
      estado.modo = "blob";
      await balde("theme-assets", sb as never).upload("t/a.jpg", JPG, { cacheControl: "31536000" });
      await balde("theme-assets", sb as never).copy("t/a.jpg", "LIQ-1/a.jpg", {
        destinationBucket: "proposal-assets",
      });
      expect(blob.copiarNoBlob).toHaveBeenCalledWith(
        "theme-assets/t/a.jpg",
        "proposal-assets/LIQ-1/a.jpg",
        expect.objectContaining({ cacheSegundos: 31536000 }),
      );
    });

    it("copiar do Supabase para o Blob leva o Cache-Control que o Supabase guardou", async () => {
      estado.modo = "blob";
      estado.supabase.set("theme-assets", new Map([["t/velha.jpg", JPG]]));
      await balde("theme-assets", sb as never).copy("t/velha.jpg", "LIQ-1/v.jpg", {
        destinationBucket: "proposal-assets",
      });
      expect(blob.porNoBlob).toHaveBeenCalledWith(
        "proposal-assets/LIQ-1/v.jpg",
        expect.anything(),
        expect.objectContaining({ cacheSegundos: 3600 }),
      );
    });

    it("apagar que falha no Blob devolve erro (não se dá por apagado)", async () => {
      estado.modo = "blob";
      const b = balde("proposal-assets", sb as never);
      await b.upload("LIQ-1/a.jpg", JPG);
      estado.falharApagar = true;
      const r = await b.remove(["LIQ-1/a.jpg"]);
      expect(r.error).toBeTruthy();
      expect(estado.indice.get("proposal-assets")!.has("LIQ-1/a.jpg")).toBe(true);
    });

    it("mudar com a origem a não sair diz-o — e a fotografia fica nos dois sítios", async () => {
      estado.modo = "blob";
      const b = balde("theme-assets", sb as never);
      await b.upload("t/a.jpg", JPG);
      estado.falharApagar = true;
      const r = await b.move("t/a.jpg", "u/a.jpg");
      expect(r.error?.message).toMatch(/a origem não saiu/);
      expect(estado.blob.has("theme-assets/t/a.jpg")).toBe(true);
      expect(estado.blob.has("theme-assets/u/a.jpg")).toBe(true);
    });
  });

  it("n.º 11: paginar não relê a pasta inteira a cada página; escrever esquece a junção", async () => {
    estado.modo = "blob";
    estado.supabase.set(
      "proposal-assets",
      new Map(
        Array.from({ length: 5 }, (_, i) => [`LIQ-1/s${i}.jpg`, JPG] as [string, Uint8Array]),
      ),
    );
    const b = balde("proposal-assets", sb as never);
    const p1 = await b.list("LIQ-1", { limit: 2, offset: 0 });
    const p2 = await b.list("LIQ-1", { limit: 2, offset: 2 });
    const p3 = await b.list("LIQ-1", { limit: 2, offset: 4 });
    expect([...p1.data!, ...p2.data!, ...p3.data!].map((e) => e.name)).toHaveLength(5);
    expect(sb.storage.from("proposal-assets").list).toHaveBeenCalledTimes(1);
    await b.upload("LIQ-1/nova.jpg", JPG);
    const depois = await b.list("LIQ-1", { limit: 100 });
    expect(depois.data!.map((e) => e.name)).toContain("nova.jpg");
  });
});
