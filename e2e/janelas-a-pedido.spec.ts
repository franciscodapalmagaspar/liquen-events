import { test, expect, type Page } from "@playwright/test";
import { esperarQueACortinaSaia } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS JANELAS A PEDIDO ABREM AO PRIMEIRO TOQUE, E O ⌘K NÃO PERDE TECLAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cinco janelas saíram do pacote inicial do painel (`janela-a-pedido.tsx`) para
 * o trazer abaixo do tecto de `scripts/peso-das-rotas.mjs`. O que o jsdom não
 * prova, e isto prova num browser:
 *
 *   1. o ⌘K continua no pacote: a primeira tecla abre-o e as letras escritas
 *      LOGO a seguir caem na caixa, nenhuma no `body`;
 *   2. depois do aquecimento, abrir a folha dos atalhos, o glossário e o novo
 *      pedido não vai buscar código à rede — chegam já desenhados;
 *   3. a frio (logo a seguir a hidratar, antes do aquecimento), a tecla «?»
 *      abre a folha na mesma, sem erro na consola.
 *   4. o «Novo pedido» fica no pacote, como o ⌘K: a frio, o «n» abre-o e as
 *      letras escritas logo a seguir caem todas no Nome.
 *
 * Só lê: não semeia nada.
 */

const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function abrir(page: Page) {
  await page.goto("/orcamento/admin?v=overview");
  await page.waitForFunction(() => document.body.classList.contains("admin-mode"));
  await esperarQueACortinaSaia(page);
}

function vigiarErros(page: Page): string[] {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(`console: ${m.text()}`);
  });
  return erros;
}

test.use({ viewport: { width: 1440, height: 900 } });

test("a frio, a primeira tecla «?» abre a folha dos atalhos", async ({ page }) => {
  const erros = vigiarErros(page);
  await abrir(page);
  await page.keyboard.press("Shift+?");
  await expect(page.getByRole("dialog", { name: "Atalhos de teclado" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Atalhos de teclado" })).toBeHidden();
  expect(erros).toEqual([]);
});

test("o ⌘K abre ao primeiro toque e não perde as letras escritas logo a seguir", async ({
  page,
}) => {
  const erros = vigiarErros(page);
  await abrir(page);
  await page.keyboard.press(`${MOD}+k`);
  await page.keyboard.type("tarefas");
  const campo = page.getByRole("combobox", { name: "Pesquisar ou navegar" });
  await expect(campo).toBeFocused();
  await expect(campo).toHaveValue("tarefas");
  expect(erros).toEqual([]);
});

test("a frio, o «n» abre o novo pedido e não perde as letras escritas logo a seguir", async ({
  page,
}) => {
  const erros = vigiarErros(page);
  await abrir(page);
  await page.keyboard.press("n");
  await page.keyboard.type("Ana");
  const novo = page.getByRole("dialog", { name: /Novo pedido/ });
  await expect(novo).toBeVisible();
  await expect(novo.getByRole("textbox", { name: "Nome", exact: true })).toHaveValue("Ana");
  await page.keyboard.press("Escape");
  await expect(novo).toBeHidden();
  expect(erros).toEqual([]);
});

test("depois do aquecimento, as janelas abrem sem ir buscar código", async ({ page }) => {
  const erros = vigiarErros(page);
  await abrir(page);
  // O aquecimento corre em janelas de inatividade depois do `load`.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(r.url());
  });

  await page.keyboard.press("Shift+?");
  await expect(page.getByRole("dialog", { name: "Atalhos de teclado" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Atalhos de teclado" })).toBeHidden();

  // O «n» abre o novo pedido com o nome já focado: a letra seguinte é dele.
  await page.keyboard.press("n");
  const novo = page.getByRole("dialog", { name: /Novo pedido/ });
  await expect(novo).toBeVisible();
  await page.keyboard.type("Ana");
  await expect(novo.getByRole("textbox", { name: "Nome", exact: true })).toHaveValue("Ana");
  await page.keyboard.press("Escape");
  await expect(novo).toBeHidden();

  expect(scripts, "uma janela aquecida não pode ir buscar código ao abrir").toEqual([]);
  expect(erros).toEqual([]);
});
