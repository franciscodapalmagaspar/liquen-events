import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { focoAutomatico, preparar } from "./imagens";

vi.mock("server-only", () => ({}));

/**
 * O ENQUADRAMENTO DA CAPA.
 *
 * Palavras dela, com a capa à frente: «não ficou com o carro». O PDF recortava
 * pela «atenção» do sharp e o estúdio mostrava o meio. Estes testes prendem as
 * duas promessas: o estúdio pergunta a MESMA coisa que o PDF faz, e o
 * enquadramento escolhido à mão é o que sai.
 *
 * As fotografias são fabricadas aqui — nenhuma foto de cliente entra num teste.
 */

/** Uma fotografia ao alto, cinzenta, com uma faixa vermelha viva EM BAIXO. */
async function aoAltoComAssuntoEmBaixo(): Promise<Buffer> {
  const faixa = await sharp({
    create: { width: 1000, height: 300, channels: 3, background: "#d01818" },
  })
    .png()
    .toBuffer();
  return sharp({ create: { width: 1000, height: 1500, channels: 3, background: "#8a8a8a" } })
    .composite([{ input: faixa, top: 1150, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** A cor média de uma JPEG. */
async function media(jpeg: Buffer) {
  const { channels } = await sharp(jpeg).stats();
  return channels.slice(0, 3).map((c) => c.mean);
}

describe("o enquadramento da capa", () => {
  const W = 1123;
  const H = 794;

  it("com o foco em baixo, o recorte mostra o que está em baixo; em cima, o que está em cima", async () => {
    const foto = await aoAltoComAssuntoEmBaixo();
    const [rBaixo, gBaixo] = await media(
      (await preparar(foto, W, H, W, { foco: { x: 0.5, y: 1 } }))!,
    );
    const [rCima, gCima] = await media(
      (await preparar(foto, W, H, W, { foco: { x: 0.5, y: 0 } }))!,
    );
    expect(rBaixo - gBaixo, "em baixo está a faixa vermelha").toBeGreaterThan(20);
    // A edição quente (§5: vermelho × 1,03) puxa o cinzento uns 4 pontos para
    // o vermelho; a faixa vermelha dá dezenas.
    expect(Math.abs(rCima - gCima), "em cima é só cinzento").toBeLessThan(10);
  });

  it("o foco automático é o mesmo recorte que o PDF faz sozinho", async () => {
    const foto = await aoAltoComAssuntoEmBaixo();
    const foco = await focoAutomatico(foto, W, H);
    const sozinho = await media((await preparar(foto, W, H, W))!);
    const comOFoco = await media((await preparar(foto, W, H, W, { foco }))!);
    for (let i = 0; i < 3; i++) expect(Math.abs(sozinho[i] - comOFoco[i])).toBeLessThan(3);
  });

  it("um foco fora de 0–1 não rebenta: fica no limite", async () => {
    const foto = await aoAltoComAssuntoEmBaixo();
    expect(await preparar(foto, W, H, W, { foco: { x: 7, y: -3 } })).not.toBeNull();
  });
});
