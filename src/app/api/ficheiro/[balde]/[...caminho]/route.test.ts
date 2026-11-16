import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ recusa: false, chamadas: [] as unknown[] }));
vi.mock("@/lib/armazenamento/blob", () => {
  class BlobRecusado extends Error {}
  return {
    BlobRecusado,
    MAX_VALIDADE_MS: 24 * 3600_000,
    urlDeLeituraDoBlob: vi.fn(async (...a: unknown[]) => {
      H.chamadas.push(a);
      if (H.recusa) throw new BlobRecusado("transferencia");
      return "https://loja.private.blob.vercel-storage.com/proposal-assets/LIQ-3/a.jpg?vercel-blob-signature=x";
    }),
  };
});

import { GET } from "./route";
import { urlEstavel } from "@/lib/armazenamento/url-estavel";

const TOKEN = "vercel_blob_rw_Loja1234_segredo";

function pedir(url: string) {
  const u = new URL(url, "https://liquen.pt");
  const [, , , balde, ...caminho] = u.pathname.split("/");
  return GET(new Request(u), { params: Promise.resolve({ balde, caminho }) });
}

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = TOKEN;
  H.recusa = false;
  H.chamadas = [];
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe("/api/ficheiro — o redireccionamento para o Blob", () => {
  it("sem o token do Blob, não existe", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect((await pedir("/api/ficheiro/proposal-assets/a/b.jpg?token=x.y.z")).status).toBe(404);
  });

  it("um endereço válido redirecciona para o Blob, conta o tamanho, e fica na cache do navegador", async () => {
    const r = await pedir(
      urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1234, 3600 * 24 * 365, TOKEN),
    );
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toMatch(/^https:\/\/loja\.private\.blob/);
    expect(r.headers.get("cache-control")).toMatch(/^private, max-age=\d+$/);
    expect(H.chamadas[0]).toEqual(["proposal-assets/LIQ-3/a.jpg", expect.any(Number), 1234]);
  });

  it("o destino nunca dura mais do que o endereço nosso", async () => {
    const r = await pedir(urlEstavel("theme-assets", "t/a.jpg", 1, 120, TOKEN));
    const ate = (H.chamadas[0] as [string, number])[1];
    expect(ate - Date.now()).toBeLessThanOrEqual(120_000);
    expect(r.status).toBe(302);
  });

  it("assinatura de outro ficheiro: 403, e o Blob nem é tocado", async () => {
    const url = urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1, 3600, TOKEN).replace(
      "LIQ-3/a.jpg",
      "LIQ-4/a.jpg",
    );
    expect((await pedir(url)).status).toBe(403);
    expect(H.chamadas).toEqual([]);
  });

  it("prazo passado: 410", async () => {
    const url = urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1, 60, TOKEN, Date.now() - 120_000);
    expect((await pedir(url)).status).toBe(410);
  });

  it("acima do tecto do mês: 503 — o travão", async () => {
    H.recusa = true;
    expect((await pedir(urlEstavel("proposal-assets", "LIQ-3/a.jpg", 1, 3600, TOKEN))).status).toBe(
      503,
    );
  });
});
