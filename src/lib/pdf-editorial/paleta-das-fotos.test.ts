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

  /**
   * A decisão dela de 23/10: «as paletas de cores é de acordo com as cores
   * usadas nas mesas de jantar, em cima das mesas, e de acordo com o material
   * de decoração utilizado / flores». Uma sala de parede azul viva a encher o
   * topo e os lados, e em cima da mesa flores vermelhas, toalha creme e
   * castiçais dourados: a paleta é a da mesa, e não a da parede.
   */
  it("as cores saem do que está em cima da mesa, e não da parede da sala", async () => {
    const bloco = async (w: number, h: number, cor: string) =>
      sharp({ create: { width: w, height: h, channels: 3, background: cor } })
        .png()
        .toBuffer();
    const sala = async (v: number) =>
      sharp({ create: { width: 900, height: 600, channels: 3, background: "#1f5fbf" } })
        .composite([
          // A mesa: a toalha creme do meio para baixo, sem chegar aos lados.
          { input: await bloco(700, 300, "#ede3cf"), top: 300, left: 100 },
          // As flores vermelhas e os castiçais dourados, em cima dela.
          { input: await bloco(170, 110, "#c41e2a"), top: 320, left: 220 + v * 30 },
          { input: await bloco(130, 100, "#b8191f"), top: 330, left: 520 },
          { input: await bloco(36, 150, "#c9a24a"), top: 300, left: 430 },
          { input: await bloco(36, 150, "#c9a24a"), top: 300, left: 660 - v * 10 },
        ])
        .jpeg({ quality: 90 })
        .toBuffer();
    const cores = (await paletaDasFotos(await Promise.all([0, 1, 2].map(sala)))).map(hex);
    const vermelho = cores.some(([r, g, b]) => r > 150 && r - g > 100 && r - b > 90);
    const creme = cores.some(([r, g, b]) => r > 205 && g > 195 && b > 175 && r >= b);
    const dourado = cores.some(([r, g, b]) => r > 150 && g > 110 && b < 120 && r - b > 60);
    const azul = cores.filter(([r, g, b]) => b - r > 60 && b - g > 30);
    expect(vermelho, "o vermelho das flores").toBe(true);
    expect(creme, "o creme da toalha").toBe(true);
    expect(dourado, "o dourado dos castiçais").toBe(true);
    expect(azul, "o azul da parede").toHaveLength(0);
  });
});
