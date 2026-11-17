import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A mudança: a cópia só conta como feita com o Blob relido e o sha256 igual;
 * o `libertar` não apaga NADA do Supabase sem essa prova, sem o modo `blob`,
 * nem se o original mudou depois da cópia.
 */

const e = vi.hoisted(() => ({
  modo: "espelho" as string,
  supabase: new Map<string, { bytes: Uint8Array; md5: string | null; atualizado: string }>(),
  blob: new Map<string, Uint8Array>(),
  indice: new Map<string, Record<string, unknown>>(),
  /** O Blob devolve outros bytes ao reler (corrupção). */
  corromper: false,
  removidos: [] as string[],
}));

vi.mock("./modos", () => ({ modoDoBalde: async () => e.modo }));
vi.mock("./uso", () => ({ acertarBytes: vi.fn(async () => undefined) }));
vi.mock("./indice", () => ({
  lerDoIndice: async (_b: string, cs: string[]) =>
    new Map(cs.filter((c) => e.indice.has(c)).map((c) => [c, e.indice.get(c)])),
  indiceDebaixoDe: async () => ({ linhas: new Map(e.indice), completa: true }),
  gravarNoIndice: async (_b: string, ls: { caminho: string; linha: Record<string, unknown> }[]) => {
    for (const l of ls) e.indice.set(l.caminho, l.linha);
    return true;
  },
}));
vi.mock("./blob", () => {
  class BlobRecusado extends Error {
    constructor(readonly motivo: string) {
      super("recusado");
    }
  }
  class BlobAvariado extends Error {}
  return {
    BlobRecusado,
    BlobAvariado,
    porNoBlob: vi.fn(async (k: string, b: Uint8Array) => {
      e.blob.set(k, b);
      return { etag: null };
    }),
    lerDoBlob: vi.fn(async (k: string) => {
      const b = e.blob.get(k);
      if (!b) return null;
      return { bytes: e.corromper ? new Uint8Array([...b].reverse()) : b, tipo: "x" };
    }),
    apagarDoBlob: vi.fn(async (ks: string[]) => ks.forEach((k) => e.blob.delete(k))),
    cabecalhoNoBlob: vi.fn(async (k: string) => {
      const b = e.blob.get(k);
      return b ? { tamanho: b.byteLength, tipo: "x", etag: null } : null;
    }),
  };
});

const raiz = {
  list: vi.fn(async (pasta: string) => {
    const filhos = new Map<
      string,
      {
        name: string;
        id: string | null;
        metadata: Record<string, unknown> | null;
        created_at: string;
        updated_at: string;
      }
    >();
    for (const [c, o] of e.supabase) {
      if (pasta && !c.startsWith(`${pasta}/`)) continue;
      const resto = pasta ? c.slice(pasta.length + 1) : c;
      const [primeiro, ...mais] = resto.split("/");
      filhos.set(
        primeiro,
        mais.length
          ? { name: primeiro, id: null, metadata: null, created_at: "", updated_at: "" }
          : {
              name: primeiro,
              id: "id",
              metadata: {
                size: o.bytes.byteLength,
                eTag: o.md5 ? `"${o.md5}"` : '"abc-2"',
                cacheControl: "max-age=31536000",
              },
              created_at: "2026-01-01T00:00:00Z",
              updated_at: o.atualizado,
            },
      );
    }
    return { data: [...filhos.values()], error: null };
  }),
  download: vi.fn(async (c: string) => ({
    data: new Blob([Buffer.from(e.supabase.get(c)!.bytes)]),
    error: null,
  })),
  remove: vi.fn(async (cs: string[]) => {
    for (const c of cs) {
      e.supabase.delete(c);
      e.removidos.push(c);
    }
    return { data: cs.map((name) => ({ name })), error: null };
  }),
};
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ storage: { from: () => raiz } }) }));

import { compararCaminhos, copiar, ensaio, libertar } from "./migracao";
import { porNoBlob } from "./blob";

const md5 = (b: Uint8Array) => createHash("md5").update(b).digest("hex");
function pôr(c: string, bytes: number[], comMd5 = true) {
  const b = new Uint8Array(bytes);
  e.supabase.set(c, { bytes: b, md5: comMd5 ? md5(b) : null, atualizado: "2026-01-01T00:00:00Z" });
}

beforeEach(() => {
  e.modo = "espelho";
  e.supabase.clear();
  e.blob.clear();
  e.indice.clear();
  e.corromper = false;
  e.removidos = [];
  vi.clearAllMocks();
});

describe("ordem do percurso", () => {
  it("pasta a pasta", () => {
    expect(compararCaminhos("a/b", "a-b/c")).toBeLessThan(0);
    expect(compararCaminhos("a/z", "a/z")).toBe(0);
    expect(compararCaminhos("b", "a/z")).toBeGreaterThan(0);
  });
});

describe("ensaio", () => {
  it("conta sem escrever nada", async () => {
    pôr("p1/a.pdf", [1, 2, 3]);
    pôr("p2/b.pdf", [4, 5]);
    const r = await ensaio("proposal-pdfs");
    expect(r.porCopiar).toEqual({ ficheiros: 2, bytes: 5 });
    expect(r.completo).toBe(true);
    expect(e.blob.size).toBe(0);
    expect(e.indice.size).toBe(0);
  });
});

describe("copiar", () => {
  it("copia, relê, confere o sha256 e só então marca `v: true`", async () => {
    pôr("p1/a.pdf", [1, 2, 3]);
    const r = await copiar("proposal-pdfs", { n: 10, depois: null });
    expect(r.copiados).toBe(1);
    expect(r.proximo).toBeNull();
    const linha = e.indice.get("p1/a.pdf")!;
    expect(linha.v).toBe(true);
    expect(linha.s).toBe(
      createHash("sha256")
        .update(new Uint8Array([1, 2, 3]))
        .digest("hex"),
    );
    expect(e.supabase.has("p1/a.pdf")).toBe(true); // copiar nunca apaga
  });

  it("uma cópia que não bate certo é desfeita e não fica no índice", async () => {
    pôr("p1/a.pdf", [1, 2, 3]);
    e.corromper = true;
    const r = await copiar("proposal-pdfs", { n: 10, depois: null });
    expect(r.copiados).toBe(0);
    expect(r.falhas[0].motivo).toMatch(/não bate certo/);
    expect(e.blob.size).toBe(0);
    expect(e.indice.size).toBe(0);
  });

  it("aos bocados: pára em `n` e continua de `proximo`", async () => {
    pôr("a/1.pdf", [1]);
    pôr("a/2.pdf", [2]);
    pôr("b/3.pdf", [3]);
    const r1 = await copiar("proposal-pdfs", { n: 2, depois: null });
    expect(r1.copiados).toBe(2);
    expect(r1.proximo).toBe("a/2.pdf");
    const r2 = await copiar("proposal-pdfs", { n: 2, depois: r1.proximo });
    expect(r2.copiados).toBe(1);
    expect(r2.proximo).toBeNull();
  });

  it("não substitui uma versão DIFERENTE que já esteja no Blob", async () => {
    pôr("p1/a.pdf", [1, 2, 3]);
    e.indice.set("p1/a.pdf", { t: 3, c: "x", s: "f".repeat(64) });
    const r = await copiar("proposal-pdfs", { n: 10, depois: null });
    expect(r.falhas[0].motivo).toMatch(/versão diferente/);
    expect(e.blob.size).toBe(0);
  });
});

describe("libertar", () => {
  it("recusa fora do modo `blob`", async () => {
    pôr("p1/a.pdf", [1, 2, 3]);
    await copiar("proposal-pdfs", { n: 10, depois: null });
    await expect(libertar("proposal-pdfs", { n: 10, depois: null })).rejects.toThrow(/modo blob/);
    expect(e.removidos).toEqual([]);
  });

  it("apaga do Supabase só o que tem prova, e mantém o Blob", async () => {
    pôr("p1/a.pdf", [1, 2, 3]);
    await copiar("proposal-pdfs", { n: 10, depois: null });
    pôr("p1/sem-copia.pdf", [9]);
    e.modo = "blob";
    const r = await libertar("proposal-pdfs", { n: 10, depois: null });
    expect(e.removidos).toEqual(["p1/a.pdf"]);
    expect(r.ficam).toEqual([{ caminho: "p1/sem-copia.pdf", motivo: "não está no Blob" }]);
    expect(e.blob.has("proposal-pdfs/p1/a.pdf")).toBe(true);
  });

  it("não apaga uma cópia não verificada (escrita pelo espelho, sem `v`)", async () => {
    pôr("p1/a.pdf", [1, 2, 3]);
    e.indice.set("p1/a.pdf", {
      t: 3,
      c: "x",
      s: "a".repeat(64),
      m: md5(new Uint8Array([1, 2, 3])),
    });
    e.blob.set("proposal-pdfs/p1/a.pdf", new Uint8Array([1, 2, 3]));
    e.modo = "blob";
    const r = await libertar("proposal-pdfs", { n: 10, depois: null });
    expect(e.removidos).toEqual([]);
    expect(r.ficam[0].motivo).toBe("cópia não verificada");
  });

  it("não apaga se o original no Supabase mudou depois da cópia", async () => {
    pôr("p1/a.pdf", [1, 2, 3]);
    await copiar("proposal-pdfs", { n: 10, depois: null });
    pôr("p1/a.pdf", [3, 2, 1]); // mesmo tamanho, outro conteúdo
    e.modo = "blob";
    const r = await libertar("proposal-pdfs", { n: 10, depois: null });
    expect(e.removidos).toEqual([]);
    expect(r.ficam[0].motivo).toMatch(/mudou depois da cópia/);
  });

  it("sem MD5 (envio em partes), só sai se não foi mexido depois da verificação", async () => {
    pôr("p1/a.pdf", [1, 2, 3], false);
    await copiar("proposal-pdfs", { n: 10, depois: null });
    e.supabase.get("p1/a.pdf")!.atualizado = "2099-01-01T00:00:00Z";
    e.modo = "blob";
    const r = await libertar("proposal-pdfs", { n: 10, depois: null });
    expect(e.removidos).toEqual([]);
    expect(r.ficam[0].motivo).toMatch(/mudou/);
  });

  it("não apaga se o HEAD do Blob não confirma o tamanho", async () => {
    pôr("p1/a.pdf", [1, 2, 3]);
    await copiar("proposal-pdfs", { n: 10, depois: null });
    e.blob.set("proposal-pdfs/p1/a.pdf", new Uint8Array([1]));
    e.modo = "blob";
    const r = await libertar("proposal-pdfs", { n: 10, depois: null });
    expect(e.removidos).toEqual([]);
    expect(r.ficam[0].motivo).toBe("tamanho no Blob diferente");
  });

  it("não apaga se o ficheiro já não está no Blob", async () => {
    pôr("p1/a.pdf", [1, 2, 3]);
    await copiar("proposal-pdfs", { n: 10, depois: null });
    e.blob.clear();
    e.modo = "blob";
    await libertar("proposal-pdfs", { n: 10, depois: null });
    expect(e.removidos).toEqual([]);
  });

  it("a cópia leva o Cache-Control do Supabase (revisão 17/11, n.º 9)", async () => {
    pôr("p1/a.pdf", [1, 2, 3]);
    await copiar("proposal-pdfs", { n: 10, depois: null });
    expect(porNoBlob).toHaveBeenCalledWith(
      "proposal-pdfs/p1/a.pdf",
      expect.anything(),
      expect.objectContaining({ cacheSegundos: 31536000 }),
    );
    expect(e.indice.get("p1/a.pdf")!.cc).toBe(31536000);
  });
});
