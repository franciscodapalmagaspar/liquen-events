import { test, expect } from "@playwright/test";

test.describe("Home", () => {
  test("loads with the brand title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Líquen/i);
  });

  test("navigates to Serviços from the navbar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Serviços" }).first().click();
    await expect(page).toHaveURL(/\/servicos/);
  });

  test("contact page renders and routes to the quote form", async ({ page }) => {
    await page.goto("/contacto");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /Pedir proposta/i }).first()).toHaveAttribute(
      "href",
      /\/orcamento/,
    );
  });
});
