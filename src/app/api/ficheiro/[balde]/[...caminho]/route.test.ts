import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/ficheiro — o ficheiro do Blob passa POR NÓS, contado ao byte (3.ª
 * revisão de 17/11, n.º 1). O navegador nunca recebe um endereço do Blob.
 */

const H = vi.hoisted(() => ({
  falhar: null as null | "recusa" | "nao-existe" | "416" | "html",
  chamadas: [] as unknown[][],
  noSupabase: true,
  mediaNoSupabase: false,
}));
vi.mock("@/lib/armazenamento/blob", () => ({
  lerRespostaDoBlob: vi.fn(async (...a: unknown[]) => {
    H.chamadas.push(a);
    if (H.falhar === "recusa") throw new Error("recusado pelo tecto");
    if (H.falhar === "nao-existe") return null;
    if (H.falhar === "416")
      return new Response(null, { status: 416, headers: { "content-range": "bytes */10" } });
    if (H.falhar === "html")
      return new Response("<script>alert(1)</script>", {
        status: 200,
        headers: { "content-type": "text/html", "content-length": "25" },
      });
    const pedaco = (a[1] as Record<string, string>).Range;
    return pedaco
      ? new Response("ABC", {
          status: 206,
          headers: {
            "content-type": "application/pdf",
            "content-length": "3",
            "content-range": "bytes 0-2/10",
          },
        })
      : new Response("ABCDEFGHIJ", {
          status: 200,
          headers: { "content-type": "image/jpeg", "content-length": "10" },
        });
  }),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    storage: {
      from: (b: string) => ({
        createSignedUrl: async (c: string) =>
          (b.endsWith("-medias") ? H.mediaNoSupabase : H.noSupabase)
            ? {
                data: {
                  signedUrl: `https://sb.supabase.co/storage/v1/object/sign/${b}/${c}?token=t`,
                },
                error: null,
              }
            : { data: null, error: { message: "Object not found", statusCode: "404" } },
      }),
    },
  }),
}));

import { GET, HEAD } from "./route";
import { urlEstavel } from "@/lib/armazenamento/url-estavel";

const TOKEN = "vercel_blob_rw_Loja1234_segredo";
const SEG = "segredo-das-sessoes-de-teste-com-32-caracteres";

function pedir(url: string, cabecalhos: Record<string, string> = {}) {
  const u = new URL(url, "https://liquen.pt");
  const [, , , balde, ...caminho] = u.pathname.split("/");
  return GET(new Request(u, { headers: cabecalhos }), {
    params: Promise.resolve({ balde, caminho }),
  });
}

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = TOKEN;
  process.env.SESSION_SECRET = SEG;
  H.falhar = null;
  H.chamadas = [];
  H.noSupabase = true;
  H.mediaNoSupabase = false;
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.SESSION_SECRET;
});

const url = (ttl = 3600 * 24 * 365) => urlEstavel("proposal-assets", "LIQ-3/a.jpg", 10, ttl, SEG);

describe("/api/ficheiro", () => {
  it("sem o token do Blob, não existe", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect((await pedir("/api/ficheiro/proposal-assets/a/b.jpg?token=x.y.z")).status).toBe(404);
  });

  it("3.ª revisão, n.º 1: devolve os BYTES (nunca um endereço do Blob), imutáveis na cache", async () => {
    const r = await pedir(url());
    expect(r.status).toBe(200);
    expect(r.headers.get("location")).toBeNull();
    expect(await r.text()).toBe("ABCDEFGHIJ");
    expect(r.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(r.headers.get("etag")).toMatch(/^"[0-9a-f]{32}"$/);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(H.chamadas[0]).toEqual(["proposal-assets/LIQ-3/a.jpg", {}, 10]);
  });

  it("3.ª revisão, n.º 1: o leitor de PDF pede um pedaço — e recebe-o (206)", async () => {
    const r = await pedir(url(), { range: "bytes=0-2" });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 0-2/10");
    expect(await r.text()).toBe("ABC");
    expect(H.chamadas[0][1]).toEqual({ Range: "bytes=0-2" });
  });

  it("3.ª revisão, n.º 1: um If-None-Match com o ETag responde 304 sem ir ao Blob", async () => {
    const etag = (await pedir(url())).headers.get("etag")!;
    H.chamadas = [];
    const r = await pedir(url(), { "if-none-match": etag });
    expect(r.status).toBe(304);
    expect(H.chamadas).toEqual([]);
  });

  it("um If-Range que não bate certo pede o ficheiro todo", async () => {
    await pedir(url(), { range: "bytes=0-2", "if-range": '"outro"' });
    expect(H.chamadas[0][1]).toEqual({});
  });

  it("assinatura de outro ficheiro: 403, e o Blob nem é tocado", async () => {
    expect((await pedir(url().replace("LIQ-3/a.jpg", "LIQ-4/a.jpg"))).status).toBe(403);
    expect(H.chamadas).toEqual([]);
  });

  it("prazo passado: 410", async () => {
    const velho = urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1, 60, SEG, Date.now() - 600_000);
    expect((await pedir(velho)).status).toBe(410);
  });

  it("acima do tecto, com o original no Supabase: vai ao Supabase", async () => {
    H.falhar = "recusa";
    const r = await pedir(url());
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toMatch(/object\/sign\/proposal-assets\/LIQ-3\/a\.jpg/);
  });

  it("não está no Blob nem no Supabase, mas há média: vai à média", async () => {
    H.falhar = "nao-existe";
    H.noSupabase = false;
    H.mediaNoSupabase = true;
    const r = await pedir(url());
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toMatch(/object\/sign\/proposal-medias\/LIQ-3\/a\.jpg/);
  });

  it("sem Blob e sem cópia nenhuma: 503 — o travão", async () => {
    H.falhar = "recusa";
    H.noSupabase = false;
    expect((await pedir(url())).status).toBe(503);
  });

  it("3.ª revisão, n.º 2: 300 pedidos por minuto por IP; o 301.º dá 429", async () => {
    const estados: number[] = [];
    for (let i = 0; i < 301; i++)
      estados.push((await pedir(url(), { "x-forwarded-for": "9.9.9.9" })).status);
    expect(estados.slice(0, 300).every((s) => s === 200)).toBe(true);
    expect(estados[300]).toBe(429);
  });

  it("trocar o token do Blob não invalida os endereços guardados", async () => {
    const u = url();
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_Loja1234_OUTRO";
    expect((await pedir(u)).status).toBe(200);
  });

  it("4.ª revisão, n.º 3: um 416 do Blob segue como 416, com o content-range — nem aviso, nem Supabase", async () => {
    H.falhar = "416";
    const r = await pedir(url(), { range: "bytes=50-60" });
    expect(r.status).toBe(416);
    expect(r.headers.get("content-range")).toBe("bytes */10");
  });

  it("4.ª revisão, n.º 5: HEAD não vai ao Blob (nem conta), mas diz o tamanho, o tipo e o ETag", async () => {
    const u = new URL(url(), "https://liquen.pt");
    const [, , , balde, ...caminho] = u.pathname.split("/");
    const r = await HEAD(new Request(u, { method: "HEAD" }), {
      params: Promise.resolve({ balde, caminho }),
    });
    expect(r.status).toBe(200);
    expect(H.chamadas).toEqual([]);
    expect(r.headers.get("content-length")).toBe("10");
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("etag")).toMatch(/^"[0-9a-f]{32}"$/);
  });

  it("4.ª revisão, n.º 8: sai sempre com nosniff e CSP sandbox", async () => {
    const r = await pedir(url());
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
  });

  it("4.ª revisão, n.º 8: um tipo fora da lista (HTML) vai como octet-stream e em anexo", async () => {
    H.falhar = "html";
    const r = await pedir(url());
    expect(r.headers.get("content-type")).toBe("application/octet-stream");
    expect(r.headers.get("content-disposition")).toBe("attachment");
  });
});
