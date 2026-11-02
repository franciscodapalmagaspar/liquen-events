import { test, expect } from "@playwright/test";

/**
 * /contacto is now a direct-contact page — the single lead-capture form lives
 * at /orcamento (see orcamento.spec.ts for that flow). This verifies the page
 * renders its hero, carries NO form, exposes the direct channels, and routes
 * visitors to the one quote form.
 */
test.describe("Contacto (direct-contact page)", () => {
  test("renders the hero and carries no form", async ({ page }) => {
    await page.goto("/contacto");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
  });

  test("offers the direct channels (e-mail, phone, WhatsApp)", async ({ page }) => {
    await page.goto("/contacto");
    // `:visible` so the assertion targets the on-page channels rail, not the
    // identical links inside the (closed, hidden) mobile menu.
    await expect(page.locator('a[href^="mailto:"]:visible').first()).toBeVisible();
    await expect(page.locator('a[href^="tel:"]:visible').first()).toBeVisible();
    await expect(page.locator('a[href*="wa.me"]:visible').first()).toBeVisible();
  });

  test("routes to the single quote form", async ({ page }) => {
    await page.goto("/contacto");
    // Two CTAs carry this label (the page's own panel + the footer); both point
    // to the one form. Assert on the first (the in-page panel CTA).
    const cta = page.getByRole("link", { name: /Pedir proposta/i }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /\/orcamento/);
  });
});
