import { describe, expect, it } from "vitest";
import {
  agruparCenas,
  distanciaDeCor,
  hamming,
  mesmaCena,
  quantil,
  serveParaDestaque,
} from "../../../../../scripts/galeria-analise.mjs";
import { PHOTOS } from "./photos-data";
import TILE_COLORS from "./tile-colors.json";
import GALLERY_META from "./gallery-meta.json";
import { aspectFor } from "@/lib/image-meta";
import {
  JANELA_CENA,
  JANELA_EVENTO,
  bucketKey,
  interleaveByCollection,
  type Photo,
} from "./interleave";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GALERIA INTELIGENTE — o que se prende
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: «espetacularmente inteligente», e, para as quase iguais,
 * «mostra todas, afastadas». O build olha para cada foto
 * (`scripts/galeria-analise.mjs` → `gallery-meta.json`) e a ordem usa isso:
 *
 *  1. as contas: a distância entre impressões, as cenas, o destaque;
 *  2. com as 918 fotografias VERDADEIRAS e 20 sementes:
 *     · fotos do mesmo evento (casal ou publicação do Instagram) nunca a menos
 *       de `JANELA_EVENTO` lugares, onde houver alternativa;
 *     · a mesma cena nunca a menos de `JANELA_CENA`;
 *     · nunca duas a preto e branco seguidas;
 *     · o mosaico grande do topo é sempre uma foto deitada e a cores, e as
 *       satélites não repetem o evento dele.
 */

describe("as contas", () => {
  it("a distância entre impressões conta os bits diferentes", () => {
    expect(hamming("0000000000000000", "0000000000000000")).toBe(0);
    expect(hamming("0000000000000000", "000000000000000f")).toBe(4);
    expect(hamming("ffffffffffffffff", "0000000000000000")).toBe(64);
  });

  it("a distância entre cores é a euclidiana, e sem cor é infinita", () => {
    expect(distanciaDeCor("#000000", "#000000")).toBe(0);
    expect(Math.round(distanciaDeCor("#000000", "#030404"))).toBe(6);
    expect(distanciaDeCor(undefined, "#000000")).toBe(Infinity);
  });

  it("até 8 bits é a mesma cena; de 9 a 11 só com a cor parecida e o mesmo tipo", () => {
    const a = { h: "0000000000000000", cor: "#808080" };
    expect(mesmaCena(a, { h: "00000000000000ff", cor: "#808080" })).toBe(true); // 8 bits
    expect(mesmaCena(a, { h: "0000000000000fff", cor: "#808080" })).toBe(false); // 12 bits
  });

  it("de 9 a 11 bits, uma P&B e uma a cores não são a mesma cena", () => {
    const a = { h: "0000000000000000", cor: "#808080", pb: true };
    const b = { h: "00000000000003ff", cor: "#808080", pb: false }; // 10 bits
    expect(mesmaCena(a, b)).toBe(false);
    expect(mesmaCena(a, { ...b, pb: true })).toBe(true);
    expect(mesmaCena(a, { ...b, pb: true, cor: "#b0b0b0" })).toBe(false); // cor longe
  });

  it("as cenas têm ids curtos e estáveis, e as fotos sozinhas não têm cena", () => {
    const cenas = agruparCenas([
      { src: "/b.jpg", h: "0000000000000000", cor: "#808080" },
      { src: "/a.jpg", h: "0000000000000001", cor: "#808080" },
      { src: "/z.jpg", h: "ffffffffffffffff", cor: "#808080" },
    ]);
    expect([...cenas.entries()]).toEqual([
      ["/a.jpg", "c1"],
      ["/b.jpg", "c1"],
    ]);
  });

  it("o destaque é deitado, a cores e nítido", () => {
    expect(serveParaDestaque({ n: 900 }, 1.5, 800)).toBe(true);
    expect(serveParaDestaque({ n: 900 }, 0.8, 800)).toBe(false); // ao alto
    expect(serveParaDestaque({ n: 900, pb: true }, 1.5, 800)).toBe(false);
    expect(serveParaDestaque({ n: 500 }, 1.5, 800)).toBe(false); // tremida
    expect(quantil([4, 1, 3, 2], 0.25)).toBe(2);
  });
});

// ── Com as fotografias verdadeiras ─────────────────────────────────────────

type Visto = { c?: string; pb?: number; d?: number; f?: string };
const VISTO = GALLERY_META as Record<string, Visto>;
const FOTOS: Photo[] = PHOTOS.map((p) => {
  const v = VISTO[p.src] ?? {};
  return {
    ...p,
    aspectRatio: aspectFor(p.src),
    color: (TILE_COLORS as Record<string, string>)[p.src],
    ...(v.c ? { cena: v.c } : {}),
    ...(v.pb ? { pb: true } : {}),
    ...(v.d ? { destaque: true } : {}),
  };
});
const SEMENTES = Array.from({ length: 20 }, (_, i) => `:s${i}`);
const razao = (p: Photo) => {
  const [w, h] = p.aspectRatio.split("/").map((x) => Number(x.trim()));
  return w / h;
};

describe("com as 918 fotografias verdadeiras", () => {
  it("o gallery-meta.json cobre fotos que existem na galeria, e nada a mais", () => {
    const daGaleria = new Set(PHOTOS.map((p) => p.src));
    for (const src of Object.keys(VISTO)) expect(daGaleria.has(src), src).toBe(true);
    // A análise está viva: há fotos a P&B e fotos que servem o destaque. Já
    // não se exige uma cena repetida — a 28/10 ela pediu para apagar as
    // fotos repetidas, e a galeria ficou sem nenhuma.
    expect(Object.values(VISTO).some((v) => v.pb)).toBe(true);
    expect(Object.values(VISTO).some((v) => v.d)).toBe(true);
  });

  it.each(SEMENTES)("semente %s: as cenas afastadas, nenhuma P&B seguida", (seed) => {
    const ordem = interleaveByCollection(FOTOS, seed);
    expect(ordem).toHaveLength(FOTOS.length);
    for (let i = 1; i < ordem.length; i++) {
      expect(ordem[i].pb && ordem[i - 1].pb, `P&B seguidas em ${i}`).toBeFalsy();
      const cena = ordem[i].cena;
      if (!cena) continue;
      for (let k = Math.max(0, i - JANELA_CENA); k < i; k++) {
        expect(ordem[k].cena, `a cena ${cena} repete-se em ${k} e ${i}`).not.toBe(cena);
      }
    }
  });

  it.each(SEMENTES)("semente %s: o mesmo evento nunca perto, nas primeiras 300", (seed) => {
    const ordem = interleaveByCollection(FOTOS, seed);
    // As primeiras 300 são o que se vê: aí há sempre alternativa. Na cauda, um
    // evento grande pode não ter com quem trocar — é o «melhor esforço».
    for (let i = 1; i < 300; i++) {
      for (let k = Math.max(0, i - JANELA_EVENTO); k < i; k++) {
        expect(bucketKey(ordem[k]), `evento repetido em ${k} e ${i}`).not.toBe(bucketKey(ordem[i]));
      }
    }
  });

  it.each(SEMENTES)("semente %s: o mosaico do topo é deitado, a cores, e variado", (seed) => {
    const [grande, ...satelites] = interleaveByCollection(FOTOS, seed).slice(0, 5);
    expect(grande.destaque).toBe(true);
    expect(razao(grande)).toBeGreaterThanOrEqual(1.2);
    expect(grande.pb).toBeFalsy();
    const eventos = new Set(satelites.map(bucketKey));
    expect(eventos.has(bucketKey(grande))).toBe(false);
    expect(eventos.size).toBe(4);
    expect(satelites.filter((p) => p.pb).length).toBeLessThanOrEqual(1);
  });

  it("a ordem continua a ser a mesma para a mesma semente (servidor e browser)", () => {
    const a = interleaveByCollection(FOTOS, ":x").map((p) => p.src);
    const b = interleaveByCollection(FOTOS, ":x").map((p) => p.src);
    expect(a).toEqual(b);
  });
});

/**
 * O DESTAQUE É SEMPRE DEITADO (15/10). Ela mandou uma foto ao alto no maior
 * lugar da página, e pediu que a galeria o percebesse sozinha. Medido antes
 * desta correcção: em 400 ordens, 10 sem destaque nas primeiras 24, e numa
 * delas uma foto ao alto à cabeça.
 */
describe("o destaque é sempre deitado", () => {
  const MUITAS = Array.from({ length: 400 }, (_, i) => `:d${i}`);

  it("com as fotografias verdadeiras, em 400 ordens", () => {
    const falhas = MUITAS.filter((seed) => {
      const [grande] = interleaveByCollection(FOTOS, seed);
      return !grande.destaque || razao(grande) < 1.2;
    });
    expect(falhas).toEqual([]);
  });

  /** 40 fotos ao alto de eventos diferentes, uma delas deitada. */
  const umaDeitada = (n: number, comAnalise: boolean): Photo[] =>
    Array.from({ length: n }, (_, i) => ({
      src: `/imagens/galeria-teste-${String(i).padStart(2, "0")}.jpg`,
      label: (["Casamento", "Evento", "Corporativo"] as const)[i % 3],
      aspectRatio: i === n - 1 ? "3 / 2" : "4 / 5",
      ...(comAnalise && i === n - 1 ? { destaque: true } : {}),
    }));

  it("vai buscá-lo à lista inteira quando não está nas primeiras 24", () => {
    const fotos = umaDeitada(60, true);
    for (const seed of MUITAS.slice(0, 50)) {
      expect(interleaveByCollection(fotos, seed)[0].aspectRatio, seed).toBe("3 / 2");
    }
  });

  it("sem dados de análise, fica a mais deitada", () => {
    const fotos = umaDeitada(20, false);
    for (const seed of MUITAS.slice(0, 50)) {
      expect(interleaveByCollection(fotos, seed)[0].aspectRatio, seed).toBe("3 / 2");
    }
  });
});
