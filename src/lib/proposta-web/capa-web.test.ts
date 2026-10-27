import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A capa da proposta online em AVIF (`capa-web.ts`). Ela (27/10): «sim, avança
 * com a capa em AVIF», e escolheu «Mais rápida».
 */

const H = vi.hoisted(() => ({
  existem: new Set<string>(),
  fabricar: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/proposal-assinaturas", () => ({
  signCapasWebAvif: vi.fn(async (refs: string[]) => {
    const m = new Map<string, string>();
    for (const r of refs) if (H.existem.has(`grande:${r}`)) m.set(r, `https://cdn/grande/${r}`);
    return m;
  }),
  signProposalMidsAvif: vi.fn(async (refs: string[]) => {
    const m = new Map<string, string>();
    for (const r of refs) if (H.existem.has(`media:${r}`)) m.set(r, `https://cdn/media/${r}`);
    return m;
  }),
}));
vi.mock("@/lib/derivadas", () => ({ fabricarCapaWebEmAvif: H.fabricar }));

import { capaWebEmAvif } from "./capa-web";

const REF = "tema:pasta/capa.jpg";

beforeEach(() => {
  H.existem.clear();
  H.fabricar.mockReset();
  H.fabricar.mockImplementation(async (ref: string, falta: { media: boolean; grande: boolean }) => {
    if (falta.media) H.existem.add(`media:${ref}`);
    if (falta.grande) H.existem.add(`grande:${ref}`);
    return Number(falta.media) + Number(falta.grande);
  });
});

describe("a capa da proposta online em AVIF", () => {
  it("quando as duas já existem, só as assina — não fabrica nada", async () => {
    H.existem.add(`media:${REF}`).add(`grande:${REF}`);
    expect(await capaWebEmAvif(REF)).toEqual({
      avif: `https://cdn/media/${REF}`,
      grande: `https://cdn/grande/${REF}`,
    });
    expect(H.fabricar).not.toHaveBeenCalled();
  });

  it("fabrica só a que falta, e devolve-a assinada", async () => {
    const capa = await capaWebEmAvif(REF, "https://ja/assinada.avif");
    expect(H.fabricar).toHaveBeenCalledWith(REF, { media: false, grande: true });
    expect(capa).toEqual({ avif: "https://ja/assinada.avif", grande: `https://cdn/grande/${REF}` });
  });

  it("sem nenhuma, fabrica as duas de uma vez", async () => {
    const capa = await capaWebEmAvif(REF);
    expect(H.fabricar).toHaveBeenCalledTimes(1);
    expect(H.fabricar).toHaveBeenCalledWith(REF, { media: true, grande: true });
    expect(capa.avif).toBeTruthy();
    expect(capa.grande).toBeTruthy();
  });

  it("se a fabricação falhar, a capa fica como estava (nunca lança)", async () => {
    H.fabricar.mockRejectedValue(new Error("storage em baixo"));
    expect(await capaWebEmAvif(REF)).toEqual({});
  });

  it("um armazenamento pendurado não segura a montagem da página", async () => {
    vi.useFakeTimers();
    try {
      H.fabricar.mockImplementation(() => new Promise(() => {}));
      const p = capaWebEmAvif(REF);
      await vi.advanceTimersByTimeAsync(4001);
      expect(await p).toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });

  it("uma fotografia embutida ou de fora não tem derivadas", async () => {
    expect(await capaWebEmAvif("data:image/jpeg;base64,AAAA")).toEqual({});
    expect(await capaWebEmAvif("https://exemplo/x.jpg")).toEqual({});
    expect(H.fabricar).not.toHaveBeenCalled();
  });
});
