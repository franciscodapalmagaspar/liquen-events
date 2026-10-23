import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { paletaDasFotos } from "./paleta-das-fotos";

vi.mock("server-only", () => ({}));

/**
 * O pedido dela de 23/10, com o modelo à frente: «a paleta de cores vai buscar
 * cores que não são… os castanhos». As fotografias das mesas eram vermelhos,
 * bordeaux, cremes e velas; a paleta saía cinzento, bege e castanho — a média
 * dos fundos escuros da mesa e da sala.
 *
 * As fotografias são fabricadas aqui: uma mesa de jantar à noite — fundo
 * castanho escuro em mais de metade, uma toalha creme, flores vermelhas e
 * bordeaux e um pouco de verde. Nenhuma foto de cliente entra num teste.
 */

const hex = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));

async function mesaDeJantar(variante: number): Promise<Buffer> {
  const bloco = async (w: number, h: number, cor: string) =>
    sharp({ create: { width: w, height: h, channels: 3, background: cor } })
      .png()
      .toBuffer();
  const castanhos = ["#3a2a20", "#2f241c", "#4a3426"];
  return sharp({
    create: { width: 600, height: 400, channels: 3, background: castanhos[variante % 3] },
  })
    .composite([
      // A toalha creme, em baixo.
      { input: await bloco(600, 110, "#ece2cf"), top: 290, left: 0 },
      // As flores: vermelho vivo e bordeaux.
      { input: await bloco(90, 70, "#c4202a"), top: 200, left: 120 + variante * 20 },
      { input: await bloco(70, 60, "#7a1424"), top: 210, left: 300 },
      // As folhas.
      { input: await bloco(50, 30, "#4f6b3a"), top: 250, left: 420 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe("a paleta dá as cores que se vêem nas mesas, e não os castanhos do fundo", () => {
  it("vermelho, bordeaux e creme entram; o castanho escuro do fundo não manda", async () => {
    const fotos = await Promise.all([0, 1, 2, 3].map(mesaDeJantar));
    const cores = (await paletaDasFotos(fotos)).map(hex);
    expect(cores).toHaveLength(5);
    const vermelho = cores.filter(([r, g, b]) => r > 150 && r - g > 100 && r - b > 90);
    const bordeaux = cores.filter(([r, g, b]) => r < 150 && r - g > 60 && r - b > 40);
    const creme = cores.filter(([r, g, b]) => r > 205 && g > 195 && b > 175 && r >= b);
    expect(vermelho.length, "um vermelho").toBeGreaterThan(0);
    expect(bordeaux.length, "um bordeaux").toBeGreaterThan(0);
    expect(creme.length, "um creme").toBeGreaterThan(0);
    // No máximo um castanho escuro e baço, e nunca à frente das cores.
    const castanhos = cores.filter(
      ([r, g, b]) =>
        0.299 * r + 0.587 * g + 0.114 * b < 95 && Math.max(r, g, b) - Math.min(r, g, b) < 56,
    );
    expect(castanhos.length).toBeLessThanOrEqual(1);
  });

  it("um castanho entra quando domina mesmo (uma mesa só de madeira)", async () => {
    const madeira = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#8a5a36" },
    })
      .jpeg()
      .toBuffer();
    const cores = (await paletaDasFotos([madeira])).map(hex);
    expect(cores.length).toBeGreaterThan(0);
    const [r, g, b] = cores[0];
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });
});
