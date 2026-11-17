import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  recusa: false,
  chamadas: [] as unknown[],
  noSupabase: true,
}));
vi.mock("@/lib/armazenamento/blob", () => ({
  urlDoNavegadorNoBlob: vi.fn(async (...a: unknown[]) => {
    H.chamadas.push(a);
    if (H.recusa) throw new Error("recusado");
    return {
      url: "https://loja.private.blob.vercel-storage.com/proposal-assets/LIQ-3/a.jpg?vercel-blob-signature=x",
      ate: Date.now() + 20 * 3600_000,
      nova: true,
    };
  }),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    storage: {
      from: (b: string) => ({
        createSignedUrl: async (c: string) =>
          H.noSupabase
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
import { urlEstavel } from "@/lib/armazenamento/url-estavel";

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
    expect(H.chamadas[0]).toEqual(["proposal-assets/LIQ-3/a.jpg", 1234]);
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

  it("o limite por IP é realista: o 121.º pedido no mesmo minuto dá 429", async () => {
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
    for (let i = 0; i < 121; i++) estados.push((await req()).status);
    expect(estados.slice(0, 120).every((s) => s === 302)).toBe(true);
    expect(estados[120]).toBe(429);
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
});
