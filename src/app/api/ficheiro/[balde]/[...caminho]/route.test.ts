import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  recusa: false,
  chamadas: [] as unknown[],
  noSupabase: true,
  mediaNoSupabase: false,
}));
vi.mock("@/lib/armazenamento/blob", () => ({
  MAX_VALIDADE_MS: 24 * 3600_000,
  urlDeLeituraDoBlob: vi.fn(async (...a: unknown[]) => {
    H.chamadas.push(a);
    if (H.recusa) throw new Error("recusado");
    return "https://loja.private.blob.vercel-storage.com/proposal-assets/LIQ-3/a.jpg?vercel-blob-signature=x";
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

import { GET } from "./route";
import { expAlinhado, urlEstavel } from "@/lib/armazenamento/url-estavel";

const TOKEN = "vercel_blob_rw_Loja1234_segredo";
const SEG = "segredo-das-sessoes-de-teste-com-32-caracteres";

function pedir(url: string) {
  const u = new URL(url, "https://liquen.pt");
  const [, , , balde, ...caminho] = u.pathname.split("/");
  return GET(new Request(u), { params: Promise.resolve({ balde, caminho }) });
}

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = TOKEN;
  process.env.SESSION_SECRET = SEG;
  H.recusa = false;
  H.chamadas = [];
  H.noSupabase = true;
  H.mediaNoSupabase = false;
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.SESSION_SECRET;
});

describe("/api/ficheiro — o redireccionamento para o Blob", () => {
  it("sem o token do Blob, não existe", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect((await pedir("/api/ficheiro/proposal-assets/a/b.jpg?token=x.y.z")).status).toBe(404);
  });

  it("um endereço válido redirecciona para o Blob e fica na cache do navegador", async () => {
    const r = await pedir(urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1234, 3600 * 24 * 365, SEG));
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toMatch(/^https:\/\/loja\.private\.blob/);
    expect(r.headers.get("cache-control")).toMatch(/^private, max-age=\d+$/);
    expect(H.chamadas[0]).toEqual(["proposal-assets/LIQ-3/a.jpg", expect.any(Number), 1234]);
  });

  it("assinatura de outro ficheiro: 403, e o Blob nem é tocado", async () => {
    const url = urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1, 3600, SEG).replace(
      "LIQ-3/a.jpg",
      "LIQ-4/a.jpg",
    );
    expect((await pedir(url)).status).toBe(403);
    expect(H.chamadas).toEqual([]);
  });

  it("prazo passado: 410", async () => {
    const url = urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1, 60, SEG, Date.now() - 120_000);
    expect((await pedir(url)).status).toBe(410);
  });

  it("acima do tecto, com cópia no Supabase: vai ao Supabase, nunca 503 (revisão 17/11, n.º 1)", async () => {
    H.recusa = true;
    const r = await pedir(urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1, 3600, SEG));
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toMatch(
      /supabase\.co\/storage\/v1\/object\/sign\/proposal-assets\/LIQ-3\/a\.jpg/,
    );
  });

  it("acima do tecto e sem cópia nenhuma: 503 — o travão", async () => {
    H.recusa = true;
    H.noSupabase = false;
    const r = await pedir(urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1, 3600, SEG));
    expect(r.status).toBe(503);
  });

  it("o limite por IP é apertado: o 31.º pedido no mesmo minuto dá 429", async () => {
    const url = urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1, 3600, SEG);
    const req = () =>
      GET(
        new Request(new URL(url, "https://liquen.pt"), {
          headers: { "x-forwarded-for": "9.9.9.9" },
        }),
        {
          params: Promise.resolve({ balde: "proposal-assets", caminho: ["LIQ-3", "a.jpg"] }),
        },
      );
    const estados: number[] = [];
    for (let i = 0; i < 31; i++) estados.push((await req()).status);
    expect(estados.slice(0, 30).every((s) => s === 302)).toBe(true);
    expect(estados[30]).toBe(429);
  });

  it("trocar o token do Blob não invalida os endereços guardados (revisão 17/11, n.º 7)", async () => {
    const url = urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1, 3600, SEG);
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_Loja1234_OUTRO";
    expect((await pedir(url)).status).toBe(302);
  });

  it("um endereço assinado com o token do Blob (o desenho antigo) já não abre", async () => {
    const url = urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1, 3600, TOKEN);
    expect((await pedir(url)).status).toBe(403);
  });

  it("2.ª revisão, n.º 1: cada pedido conta (sem endereços reutilizados entre pedidos)", async () => {
    const url = urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1234, 3600 * 24, SEG);
    await pedir(url);
    await pedir(url);
    expect(H.chamadas).toHaveLength(2);
  });

  it("2.ª revisão, n.º 1: o 302 fica no navegador até ao fim do destino, nunca mais de 24 h", async () => {
    const r = await pedir(urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1, 3600 * 24 * 365, SEG));
    const idade = Number(/max-age=(\d+)/.exec(r.headers.get("cache-control") ?? "")![1]);
    expect(idade).toBeGreaterThan(23 * 3600);
    expect(idade).toBeLessThanOrEqual(24 * 3600);
  });

  it("2.ª revisão, n.º 6: o destino nunca dura mais do que o nosso endereço", async () => {
    const agora = Date.now();
    const r = await pedir(urlEstavel("theme-assets", "t/a.jpg", 1, 120, SEG, agora));
    const fimDoNosso = expAlinhado(agora, 120) * 1000;
    const ate = (H.chamadas[0] as [string, number, number])[1];
    expect(ate).toBeLessThanOrEqual(fimDoNosso);
    const idade = Number(/max-age=(\d+)/.exec(r.headers.get("cache-control") ?? "")![1]);
    expect(idade * 1000).toBeLessThanOrEqual(fimDoNosso - agora);
  });

  it("2.ª revisão, n.º 1: acima do tecto, sem original no Supabase mas com a média: vai à média", async () => {
    H.recusa = true;
    H.noSupabase = false;
    H.mediaNoSupabase = true;
    const r = await pedir(urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1, 3600, SEG));
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toMatch(/object\/sign\/proposal-medias\/LIQ-3\/a\.jpg/);
  });
});
