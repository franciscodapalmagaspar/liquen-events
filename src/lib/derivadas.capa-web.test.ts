import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

/**
 * A capa da proposta online em AVIF — as duas derivadas, de um só download
 * (`fabricarCapaWebEmAvif`). Ela (27/10): «sim, avança com a capa em AVIF».
 *
 * O Storage é um duplo; o `sharp` é o verdadeiro, para se ver as medidas e o
 * formato do que fica guardado.
 */

const H = vi.hoisted(() => ({
  original: null as Buffer | null,
  downloads: [] as string[],
  uploads: [] as { bucket: string; caminho: string; bytes: Buffer; contentType: string }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    storage: {
      from: (bucket: string) => ({
        download: async (chave: string) => {
          H.downloads.push(`${bucket}:${chave}`);
          if (!H.original) return { data: null, error: { message: "Object not found" } };
          const b = H.original;
          return { data: { arrayBuffer: async () => b }, error: null };
        },
        upload: async (caminho: string, bytes: Buffer, o: { contentType: string }) => {
          H.uploads.push({ bucket, caminho, bytes, contentType: o.contentType });
          return { error: null };
        },
      }),
    },
  }),
}));
vi.mock("@/lib/theme-storage", () => ({ garantirBucketDeDerivadas: vi.fn(async () => true) }));
vi.mock("@/lib/proposal-storage", () => ({
  PROPOSAL_BUCKET: "proposal-assets",
  PROPOSAL_MID_BUCKET: "proposal-medias",
  PROPOSAL_AVIF_MID_BUCKET: "proposal-avif-medias",
  PROPOSAL_THUMB_BUCKET: "proposal-thumbs",
  uploadProposalMid: vi.fn(),
  uploadProposalThumb: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { fabricarCapaWebEmAvif } = await import("./derivadas");

beforeEach(async () => {
  H.downloads.length = 0;
  H.uploads.length = 0;
  // Uma fotografia ao alto maior do que as duas derivadas.
  H.original = await sharp({
    create: { width: 1800, height: 2700, channels: 3, background: { r: 120, g: 90, b: 60 } },
  })
    .jpeg()
    .toBuffer();
});

describe("a capa em AVIF, fabricada uma vez", () => {
  it("as duas, de um só download do original, no bucket AVIF de 1200", async () => {
    const feitas = await fabricarCapaWebEmAvif("tema:pasta/capa.jpg", {
      media: true,
      grande: true,
    });
    expect(feitas).toBe(2);
    expect(H.downloads).toEqual(["theme-assets:pasta/capa.jpg"]);
    expect(H.uploads.map((u) => `${u.bucket}:${u.caminho}`).sort()).toEqual([
      "theme-avif-medias:pasta/capa.jpg",
      "theme-avif-medias:pasta/capa.jpg.capa.avif",
    ]);
    for (const u of H.uploads) expect(u.contentType).toBe("image/avif");

    const medidas = Object.fromEntries(
      await Promise.all(
        H.uploads.map(async (u) => {
          const m = await sharp(u.bytes).metadata();
          return [u.caminho, `${m.format} ${m.width}x${m.height}`] as const;
        }),
      ),
    );
    // A de 1200 (o telemóvel: os mesmos pixéis de antes) e a grande (≤ 2000).
    expect(medidas["pasta/capa.jpg"]).toBe("heif 800x1200");
    expect(medidas["pasta/capa.jpg.capa.avif"]).toBe("heif 1333x2000");
  });

  it("só a que falta", async () => {
    await fabricarCapaWebEmAvif("ped/capa.jpg", { media: false, grande: true });
    expect(H.uploads.map((u) => `${u.bucket}:${u.caminho}`)).toEqual([
      "proposal-avif-medias:ped/capa.jpg.capa.avif",
    ]);
  });

  it("nunca amplia uma fotografia pequena", async () => {
    H.original = await sharp({
      create: { width: 600, height: 900, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    await fabricarCapaWebEmAvif("ped/capa.jpg", { media: false, grande: true });
    const m = await sharp(H.uploads[0]!.bytes).metadata();
    expect([m.width, m.height]).toEqual([600, 900]);
  });

  it("sem original, nada — e não lança", async () => {
    H.original = null;
    expect(await fabricarCapaWebEmAvif("ped/capa.jpg", { media: true, grande: true })).toBe(0);
    expect(H.uploads).toEqual([]);
  });

  it("nada a fazer, nada se descarrega", async () => {
    expect(await fabricarCapaWebEmAvif("ped/capa.jpg", { media: false, grande: false })).toBe(0);
    expect(
      await fabricarCapaWebEmAvif("data:image/jpeg;base64,AA", { media: true, grande: true }),
    ).toBe(0);
    expect(H.downloads).toEqual([]);
  });
});
