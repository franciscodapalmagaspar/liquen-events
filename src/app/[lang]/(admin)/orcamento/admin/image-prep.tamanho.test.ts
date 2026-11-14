import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp, { type OutputInfo, type Sharp } from "sharp";
import { presetDe, PROPOSTA_MAX_EDGE, THUMB_EDGE, THUMB_QUALITY } from "./image-prep";
import { MID_EDGE, MID_QUALITY } from "./image-worker";
import { LADO_PAGINA } from "@/lib/pdf-editorial/imagens";
import { CAPA_WEB_LADO } from "@/lib/derivadas-medidas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CADA FOTOGRAFIA NOVA DE PROPOSTA OCUPA MENOS — E O PDF NÃO PERDE NADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Com fotografias reais do site (2 560 px), pelos presets verdadeiros: o que
 * se guardava (original 2 200 px JPEG + média e miniatura JPEG) contra o que
 * se guarda agora (original 1 800 px JPEG + média e miniatura WebP). O canvas
 * é aproximado pelo codificador do `sharp` com as mesmas qualidades.
 */

vi.setConfig({ testTimeout: 60_000 });

const FOTOS = [
  "stephanie-mizio-16.jpg",
  "J&A-10.jpg",
  "Sophia&Artur_MAINOVA-122.jpg",
  "PJ-0277.jpg",
];

async function guardado(fonte: Buffer, destino: "biblioteca" | "proposta") {
  const p = presetDe("board", destino);
  const fit = (b: Buffer, l: number) =>
    sharp(b).resize(l, l, { fit: "inside", withoutEnlargement: true });
  const original = await fit(fonte, p.maxEdge)
    .jpeg({ quality: Math.round(p.quality * 100) })
    .toBuffer();
  const enc = (img: Sharp, q: number) =>
    p.derivadas === "webp"
      ? img.webp({ quality: Math.round(q * 100) })
      : img.jpeg({ quality: Math.round(q * 100) });
  const media = await enc(fit(original, MID_EDGE), MID_QUALITY).toBuffer();
  const mini = await enc(fit(original, THUMB_EDGE), THUMB_QUALITY).toBuffer();
  return { original, total: original.length + media.length + mini.length };
}

/** O caminho do PDF: o original reduzido a 1 800 px q86 (`proposal-doc-render.ts`). */
const pdf = (b: Buffer) =>
  sharp(b)
    .resize(LADO_PAGINA, LADO_PAGINA, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();

async function psnr(a: Buffer, ref: { data: Buffer; info: OutputInfo }) {
  const x = await sharp(a)
    .resize(ref.info.width, ref.info.height, { fit: "fill" })
    .raw()
    .toBuffer();
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i] - ref.data[i]) ** 2;
  return 10 * Math.log10((255 * 255) / (s / x.length));
}

describe("a fotografia nova de uma proposta", () => {
  it("guarda-se no lado que o PDF usa, nunca acima", () => {
    expect(PROPOSTA_MAX_EDGE).toBe(LADO_PAGINA);
    expect(presetDe("board", "proposta").maxEdge).toBeLessThan(presetDe("board").maxEdge);
    // A CAPA fica a 2 200 px: a capa web grande pede 2 000 (revisão de 13/11 —
    // a 1 800 perdia 7 dB num ecrã de 1 920).
    expect(presetDe("cover", "proposta").maxEdge).toBe(CAPA_WEB_LADO + 200);
    expect(presetDe("cover", "proposta").maxEdge).toBeGreaterThanOrEqual(CAPA_WEB_LADO);
    expect(presetDe("cover", "proposta").derivadas).toBe("webp");
    expect(presetDe("board", "proposta").derivadas).toBe("webp");
    // A Biblioteca fica como estava.
    expect(presetDe("cover")).toMatchObject({ maxEdge: 2200, derivadas: "jpeg" });
  });

  it("ocupa pelo menos 20% menos do que antes, e o PDF fica igual ou melhor", async () => {
    let antes = 0;
    let agora = 0;
    for (const f of FOTOS) {
      const fonte = await sharp(readFileSync(path.join(process.cwd(), "public/imagens", f)))
        .rotate()
        .toBuffer();
      const ref = await sharp(fonte)
        .resize(LADO_PAGINA, LADO_PAGINA, { fit: "inside" })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const velho = await guardado(fonte, "biblioteca");
      const novo = await guardado(fonte, "proposta");
      antes += velho.total;
      agora += novo.total;
      const qVelho = await psnr(await pdf(velho.original), ref);
      const qNovo = await psnr(await pdf(novo.original), ref);
      // O PDF sai do original novo sem segunda redução: nunca pior (com folga de 0,3 dB).
      expect(qNovo, f).toBeGreaterThan(qVelho - 0.3);
    }
    expect(agora).toBeLessThan(antes * 0.8);
  });
});
