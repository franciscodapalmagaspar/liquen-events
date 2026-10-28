import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As fotos de tema no retrato: guarda-se o caminho, assina-se ao ler
 * (`assinaturas-do-retrato.ts`). Ela (28/10): «sim» — a proposta a abrir
 * depressa depois de estar parada.
 */

const H = vi.hoisted(() => ({
  pedidos: [] as { bucket: string; caminhos: string[]; ttl: number }[],
  falta: "",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/proposal-assinaturas", () => ({
  assinarLote: vi.fn(async (bucket: string, caminhos: string[], _s: boolean, ttl: number) => {
    H.pedidos.push({ bucket, caminhos, ttl });
    const m = new Map<string, string>();
    for (const c of caminhos)
      if (c !== H.falta)
        m.set(
          c,
          `https://x.supabase.co/storage/v1/object/sign/${bucket}/${encodeURI(c)}?token=a.NOVO.c`,
        );
    return m;
  }),
}));

import { THEME_SIGNED_TTL } from "@/lib/theme-ref";
import {
  assinarFotosDeTema,
  temAssinaturasPorFazer,
  tirarAssinaturasDeTema,
} from "./assinaturas-do-retrato";

const url = (bucket: string, caminho: string) =>
  `https://x.supabase.co/storage/v1/object/sign/${bucket}/${caminho}?token=aaa.VELHO.ccc`;

beforeEach(() => {
  H.pedidos.length = 0;
  H.falta = "";
});

describe("as fotos de tema saem do retrato e voltam a assinar-se", () => {
  it("troca só as de tema — as do pedido ficam como estão", () => {
    const json = JSON.stringify({
      a: url("theme-medias", "p/x.jpg"),
      b: url("proposal-assets", "q/y.jpg"),
    });
    const sem = tirarAssinaturasDeTema(json);
    expect(sem).toContain("~LIQUEN-TEMA[theme-medias|p/x.jpg]~");
    expect(sem).toContain(url("proposal-assets", "q/y.jpg"));
    expect(sem).not.toContain('VELHO.ccc","b');
    expect(temAssinaturasPorFazer(sem)).toBe(true);
  });

  it("um bucket que começa como outro não se confunde (theme-avif-medias ≠ theme-avif)", () => {
    const sem = tirarAssinaturasDeTema(
      JSON.stringify({ a: url("theme-avif-medias", "p/x.jpg.capa.avif") }),
    );
    expect(sem).toContain("~LIQUEN-TEMA[theme-avif-medias|p/x.jpg.capa.avif]~");
  });

  it("dentro de um srcSet, cada endereço vira o seu marcador e as larguras ficam", () => {
    const srcSet = `${url("theme-thumbs", "p/x.jpg")} 400w, ${url("theme-medias", "p/x.jpg")} 1200w`;
    const sem = tirarAssinaturasDeTema(JSON.stringify({ srcSet }));
    expect(JSON.parse(sem).srcSet).toBe(
      "~LIQUEN-TEMA[theme-thumbs|p/x.jpg]~ 400w, ~LIQUEN-TEMA[theme-medias|p/x.jpg]~ 1200w",
    );
  });

  it("assina um lote por bucket, com o prazo das fotos de tema, e o mesmo caminho uma vez só", async () => {
    const sem = tirarAssinaturasDeTema(
      JSON.stringify({
        a: url("theme-medias", "p/x.jpg"),
        b: url("theme-medias", "p/x.jpg"),
        c: url("theme-thumbs", "p/x.jpg"),
      }),
    );
    const com = await assinarFotosDeTema(sem);
    expect(H.pedidos).toHaveLength(2);
    for (const p of H.pedidos) expect(p.ttl).toBe(THEME_SIGNED_TTL);
    expect(H.pedidos.find((p) => p.bucket === "theme-medias")!.caminhos).toEqual(["p/x.jpg"]);
    expect(com).not.toContain("~LIQUEN-TEMA[");
    expect(JSON.parse(com!).a).toBe(
      "https://x.supabase.co/storage/v1/object/sign/theme-medias/p/x.jpg?token=a.NOVO.c",
    );
  });

  it("um caminho com espaços ou acentos assina-se pelo nome real", async () => {
    const sem = tirarAssinaturasDeTema(
      JSON.stringify({ a: url("theme-assets", "p/Mesa%20%C3%A0%20noite.jpg") }),
    );
    await assinarFotosDeTema(sem);
    expect(H.pedidos[0].caminhos).toEqual(["p/Mesa à noite.jpg"]);
  });

  it("se uma ficar por assinar, devolve null — quem chama monta a página", async () => {
    H.falta = "p/y.jpg";
    const sem = tirarAssinaturasDeTema(
      JSON.stringify({ a: url("theme-medias", "p/x.jpg"), b: url("theme-medias", "p/y.jpg") }),
    );
    expect(await assinarFotosDeTema(sem)).toBeNull();
  });

  it("sem fotos de tema, não pede nada", async () => {
    const json = JSON.stringify({ a: url("proposal-assets", "q/y.jpg") });
    expect(await assinarFotosDeTema(json)).toBe(json);
    expect(H.pedidos).toHaveLength(0);
  });
});
