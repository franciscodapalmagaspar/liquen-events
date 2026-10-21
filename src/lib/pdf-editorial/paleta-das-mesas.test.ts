import { beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PALETA SAI DAS MESAS, NÃO DA CERIMÓNIA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela a 20/10: a colaboradora viu que as cinco cores da página «A
 * paleta e o ambiente» batiam com a cerimónia e não com as mesas de jantar. A
 * cerimónia vem primeiro no documento, e as cores saíam das primeiras 40 fotos.
 * Ela escolheu também: as fotografias dessa página passam a ser das mesas.
 *
 * Fotografias fabricadas aqui: a cerimónia toda azul, o jantar todo vermelho.
 */

vi.setConfig({ testTimeout: 240_000 });

const usadas: Buffer[][] = [];
vi.mock("./paleta-das-fotos", async (original) => {
  const real = await original<typeof import("./paleta-das-fotos")>();
  return {
    paletaDasFotos: (fotos: readonly Buffer[]) => {
      usadas.push([...fotos]);
      return real.paletaDasFotos(fotos);
    },
  };
});

const { renderEditorialPdf, fotosDoEditorial } = await import("./montar");

const AZUL = "#2f5fb0";
const VERMELHO = "#b0302f";
const b64 = new Map<string, string>();
const medidas = new Map<string, { w: number; h: number }>();
const ref = (nome: string) => `TESTE/${nome}.jpg`;
const cerimonia = Array.from({ length: 8 }, (_, i) => ref(`cerimonia-${i}`));
const jantar = Array.from({ length: 4 }, (_, i) => ref(`jantar-${i}`));

beforeAll(async () => {
  for (const [lista, cor] of [
    [cerimonia, AZUL],
    [jantar, VERMELHO],
  ] as const) {
    for (const [i, r] of lista.entries()) {
      const [w, h] = i % 2 ? [600, 900] : [900, 600];
      const bytes = await sharp({ create: { width: w, height: h, channels: 3, background: cor } })
        .jpeg({ quality: 70 })
        .toBuffer();
      b64.set(r, bytes.toString("base64"));
      medidas.set(r, { w, h });
    }
  }
});

function documento(temas: { title: string; images: string[] }[]): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "TESTE",
    clientNames: "TESTE Ana & TESTE Rui",
    eventType: "Casamento",
    eventDate: "8 de julho de 2028",
    location: "Évora",
    moodBoards: temas,
    totalText: "3.200,00 € + IVA",
    totalAmount: 3200,
    validUntil: "2026-11-27",
  } as ProposalDoc);
}

async function desenhar(d: ProposalDoc) {
  usadas.length = 0;
  const comBytes = {
    ...d,
    moodBoards: d.moodBoards.map((b) => ({ ...b, images: b.images.map((r) => b64.get(r) ?? "") })),
  } as ProposalDoc;
  const refs = { capa: d.coverImages, temas: d.moodBoards.map((b) => b.images), paginas: {} };
  return renderEditorialPdf(comBytes, "pt", {}, { refs, medidas });
}

const bytesDe = (lista: string[]) => lista.map((r) => Buffer.from(b64.get(r)!, "base64"));

describe("a paleta e o ambiente vêm das mesas", () => {
  it("com a cerimónia primeiro, as cores e a fila são do jantar", async () => {
    const d = documento([
      { title: "Decoração Cerimónia", images: cerimonia },
      { title: "Mesas de Jantar", images: jantar },
    ]);
    await desenhar(d);
    expect(usadas).toHaveLength(1);
    expect(usadas[0].map((b) => b.toString("base64"))).toEqual(
      bytesDe(jantar).map((b) => b.toString("base64")),
    );
    const fotos = await fotosDoEditorial(d, "pt", medidas);
    // As quatro do jantar: três na fila e a fotografia grande (o 7.º lugar).
    const daPagina = fotos.ambiente.map((f) => f?.ref).filter(Boolean);
    expect(daPagina).toEqual(expect.arrayContaining(jantar));
    expect(jantar).toContain(fotos.ambiente[fotos.ambiente.length - 1]?.ref);
  });

  it("as cores que saem são vermelhas, não azuis", async () => {
    const { paletaDasFotos } = await import("./paleta-das-fotos");
    const cores = await paletaDasFotos(bytesDe(jantar));
    expect(cores.length).toBeGreaterThan(0);
    for (const c of cores) {
      const [r, , b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      expect(r).toBeGreaterThan(b);
    }
  });

  it("sem tema das mesas, fica como antes: todas as fotografias", async () => {
    const d = documento([
      { title: "Decoração Cerimónia", images: cerimonia.slice(0, 4) },
      { title: "Decor Cocktail", images: cerimonia.slice(4) },
    ]);
    await desenhar(d);
    expect(usadas[0]).toHaveLength(8);
  });

  it("um tema «Mesas» só com texto não tira as cores às outras", async () => {
    const d = documento([
      { title: "Decoração Cerimónia", images: cerimonia },
      { title: "Mesas de jantar", images: [] },
    ]);
    await desenhar(d);
    expect(usadas[0]).toHaveLength(cerimonia.length);
  });

  it("um buffet conta como mesa", async () => {
    const d = documento([
      { title: "Decoração Cerimónia", images: cerimonia },
      { title: "Buffet", images: jantar },
    ]);
    await desenhar(d);
    expect(usadas[0]).toHaveLength(jantar.length);
  });
});
