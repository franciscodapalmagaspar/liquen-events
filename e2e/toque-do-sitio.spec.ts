import { test, expect } from "@playwright/test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BOTÃO DO SÍTIO CEDE AO CARREGAR (auditoria externa, A8)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `.toque:active` → `scale: 0.97` em 100 ms. Lê-se o `scale` COMPUTADO com o
 * rato em baixo, como faz o `resposta-ao-toque.spec.ts` do back office: uma
 * classe que compila e não faz nada já aconteceu nesta casa.
 */

test.use({ viewport: { width: 1440, height: 900 } });

test("o «Pedir proposta» da barra encolhe para 0.97 enquanto se carrega", async ({ page }) => {
  await page.goto("/");
  const botao = page.locator("nav a.toque").first();
  await expect(botao).toBeVisible();
  const caixa = (await botao.boundingBox())!;
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  const carregado = await botao.evaluate((el) => getComputedStyle(el).scale);
  await page.mouse.move(0, 0);
  await page.mouse.up();
  expect(carregado).toBe("0.97");
});

test.describe("com movimento reduzido", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });
  test("não encolhe", async ({ page }) => {
    await page.goto("/");
    const botao = page.locator("nav a.toque").first();
    const caixa = (await botao.boundingBox())!;
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    const carregado = await botao.evaluate((el) => getComputedStyle(el).scale);
    await page.mouse.move(0, 0);
    await page.mouse.up();
    expect(carregado).toBe("none");
  });
});
