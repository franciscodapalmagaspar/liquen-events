import { test, expect, type Page } from "@playwright/test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O «PEDIR ORÇAMENTO» FLUTUANTE (auditoria externa, A1)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Havia quatro chamadas à acção ao mesmo tempo: o «Pedir orçamento» da barra,
 * o flutuante em baixo à esquerda, o WhatsApp e o aviso de cookies.
 *
 *   · computador (lg, ≥ 1024 px): o flutuante sai — a barra já tem o botão;
 *   · telemóvel: só depois de passar o topo da página, e nunca enquanto o
 *     aviso de cookies estiver no ecrã.
 *
 * Do lado «com o aviso no ecrã» trata `consentimento-geometria.spec.ts`. Aqui
 * a pessoa escolhe primeiro.
 */

const CTA_FIXO = ".cta-flutuante a";

/**
 * «À mostra» = desenhado, opaco e fora do `inert`. Não serve o `toBeVisible`
 * do Playwright: ele conta como visível um elemento a `opacity: 0`, que é
 * exactamente como o CTA espera no topo da página (opaco a zero, `inert`, sem
 * ponteiro) para poder entrar com uma transição.
 */
async function ctaAMostra(page: Page) {
  return page.evaluate(() => {
    const caixa = document.querySelector<HTMLElement>(".cta-flutuante");
    if (!caixa) return false;
    const cs = getComputedStyle(caixa);
    return cs.display !== "none" && Number(cs.opacity) > 0.5 && !caixa.inert;
  });
}

async function recusarCookies(page: Page) {
  await page.goto("/");
  await expect(page.locator(".barra-consentimento")).toBeVisible();
  await page.getByRole("button", { name: /recusar|decline/i }).click();
  await expect(page.locator(".barra-consentimento")).toHaveCount(0);
}

async function descer(page: Page, ecras: number) {
  await page.evaluate((n) => window.scrollTo(0, window.innerHeight * n), ecras);
  await page.waitForTimeout(800);
}

test.describe("telemóvel 390×844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("no topo não aparece; depois do primeiro ecrã aparece", async ({ page }) => {
    await recusarCookies(page);
    await descer(page, 0);
    await expect.poll(() => ctaAMostra(page)).toBe(false);
    await descer(page, 1.2);
    await expect.poll(() => ctaAMostra(page)).toBe(true);
    await expect(page.locator(CTA_FIXO)).toBeVisible();
  });
});

for (const largura of [1024, 1440]) {
  test.describe(`computador ${largura} px`, () => {
    test.use({ viewport: { width: largura, height: 900 } });

    test("não aparece, nem depois de descer", async ({ page }) => {
      await recusarCookies(page);
      await descer(page, 1.2);
      await expect(page.locator(CTA_FIXO)).toBeHidden();
      expect(await ctaAMostra(page)).toBe(false);
      // E a barra de navegação continua a ter o seu.
      await expect(
        page
          .locator("nav")
          .getByRole("link", { name: /pedir proposta/i })
          .first(),
      ).toBeAttached();
    });
  });
}
