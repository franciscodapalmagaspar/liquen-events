import { test, expect } from "@playwright/test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TRÊS VÍDEOS DA ENTRADA TOCAM — E SÓ QUANDO DEVEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (15/10): os três vídeos de fundo na capa, «super fluidos, sem
 * travar». As regras estão provadas sem browser (entrada-em-video.test.ts,
 * EntradaEmVideo.test.tsx); aqui prova-se o que só um browser mostra:
 *   · o vídeo chega a TOCAR (o tempo avança) e fica à vista por cima da foto;
 *   · a fotografia continua por baixo — é o LCP, e é o que fica sem vídeo;
 *   · com movimento reduzido o vídeo toca na mesma (decisão dela, 16/10);
 *   · cada entrada abre num take diferente, e a cortina sobe com ele a andar.
 *
 * O Chromium dos testes não tem H.264, por isso toca a rede em WebM — o mesmo
 * componente, o mesmo caminho, outro ficheiro. Tem a etiqueta `@movimento`
 * para correr no job que vai contra o build de produção.
 */

test.describe("@movimento a entrada em vídeo", () => {
  test("o take de entrada entra por cima da fotografia e toca", async ({ page }) => {
    test.setTimeout(60_000);
    const seguinte = page.waitForRequest(
      (r) => /\/videos\/entrada\/v6\/entrada-[23]-/.test(r.url()),
      {
        timeout: 30_000,
      },
    );
    await page.goto("/");
    // Primeira visita de sempre (contexto novo): entra na floresta.
    const primeiro = page.locator("video[data-primeiro]");
    await expect(primeiro).toHaveAttribute("data-entrada-video", "0");
    await expect(primeiro).toHaveCSS("opacity", "1", { timeout: 25_000 });
    expect(await primeiro.evaluate((v: HTMLVideoElement) => v.currentSrc)).toMatch(
      /\/videos\/entrada\/v6\/entrada-1-(paisagem|retrato)/,
    );

    const t1 = await primeiro.evaluate((v: HTMLVideoElement) => v.currentTime);
    await page.waitForTimeout(800);
    const t2 = await primeiro.evaluate((v: HTMLVideoElement) => v.currentTime);
    expect(t2, "o tempo do vídeo não avançou: está parado").toBeGreaterThan(t1);

    // O seguinte (o 2 ou o 3 — a ordem é sorteada) já se descarrega inteiro
    // enquanto o de entrada toca.
    await seguinte;

    // E a fotografia continua lá por baixo.
    await expect(page.locator("section img.hero-settle")).toHaveCount(1);
  });

  // Ela (16/10, à noite): «não estar sempre a aparecer o mesmo vídeo da
  // floresta no início, vai trocando». A 1.ª visita abre na floresta; cada
  // entrada seguinte abre num take diferente do da anterior.
  test("cada entrada abre num take diferente do da anterior", async ({ page }) => {
    test.setTimeout(60_000);
    const takes: string[] = [];
    for (let k = 0; k < 3; k++) {
      await page.goto("/");
      const n = await page.locator("video[data-primeiro]").getAttribute("data-entrada-video");
      takes.push(n ?? "?");
    }
    expect(takes[0]).toBe("0");
    expect(takes[1]).not.toBe(takes[0]);
    expect(takes[2]).not.toBe(takes[1]);
  });

  // Ela (16/10): a cortina «sincronizada com o vídeo». Quando o pano acaba de
  // subir, o take já está a andar — e começou com a subida, não antes.
  test("a cortina sobe com o vídeo a andar", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-cortina", "fora", { timeout: 15_000 });
    const primeiro = page.locator("video[data-primeiro]");
    const t = await primeiro.evaluate((v: HTMLVideoElement) => v.currentTime);
    expect(t, "o take já ia longe quando o pano subiu: correu escondido").toBeLessThan(2.5);
    await expect
      .poll(() => primeiro.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 })
      .toBeGreaterThan(t);
  });

  // Decisão dela (16/10): os vídeos tocam MESMO com «reduzir movimento».
  test("com movimento reduzido o vídeo toca na mesma", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    const primeiro = page.locator("video[data-primeiro]");
    await expect(primeiro).toHaveCSS("opacity", "1", { timeout: 25_000 });
    const t1 = await primeiro.evaluate((v: HTMLVideoElement) => v.currentTime);
    await page.waitForTimeout(800);
    expect(await primeiro.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(t1);
    await ctx.close();
  });
});
