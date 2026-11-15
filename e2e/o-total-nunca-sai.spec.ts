import { test, expect, type Page } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, garantirPedido } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TOTAL DA PROPOSTA ESTÁ SEMPRE À VISTA — EM TODAS AS LARGURAS E PASSOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «não quero fazer scroll para saber quanto vai a proposta».
 *
 * A auditoria de 14/11 (n.º 1) encontrou o total apagado a 1440 e a 768 nos
 * passos 1 a 4: a barra de baixo é `w-fit` a partir de 40rem, e o grupo do
 * total era um `@container` lá dentro — um contentor de tamanho inline mede
 * ZERO para quem o embrulha a abraçar o conteúdo, e o `@max-[20rem]:hidden`
 * disparava. A barra encolhia para 26 px. A 390, a partir do passo 2, o botão
 * «anterior» tirava-lhe o lugar na mesma.
 *
 * E o n.º 2: a 768 o cabeçalho do estúdio pedia 794 px e a página ganhava
 * scroll de lado.
 *
 * Nenhum teste em jsdom apanha isto — não há layout. Mede-se num browser.
 */

const LARGURAS = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

async function totalDaBarra(page: Page) {
  return page.evaluate(() => {
    const total = [...document.querySelectorAll<HTMLElement>("[data-total-da-barra]")].find(
      (el) => el.offsetParent !== null,
    );
    if (!total) return null;
    const barra = total.closest(".bo-material");
    const t = total.getBoundingClientRect();
    const b = barra?.getBoundingClientRect();
    return {
      texto: total.innerText.replace(/\s+/g, " ").trim(),
      largura: t.width,
      dentroDaBarra: !!b && t.left >= b.left - 0.5 && t.right <= b.right + 0.5,
      alturaDaBarra: b?.height ?? 0,
    };
  });
}

for (const tamanho of LARGURAS) {
  test(`a ${tamanho.width} px o total está à vista nos cinco passos, e a página não foge para o lado`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(tamanho);
    exigirLogin(await entrarNoBackOffice(page));
    await garantirPedido(page);

    // Pelo endereço público, que o servidor resolve (ver o AGENTS.md), e à
    // espera da hidratação antes de clicar.
    await page.goto("/orcamento/admin?v=fazer-proposta", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.classList.contains("admin-mode"), null, {
      timeout: 60_000,
    });
    await expect(page.getByText(/Para quem é a proposta\?/)).toBeVisible({ timeout: 30_000 });
    const clientes = page.locator("li button");
    await expect(clientes.first()).toBeVisible({ timeout: 15_000 });
    await clientes.first().click();

    await expect(page.getByRole("button", { name: /^Seguinte: Serviços/ })).toBeVisible({
      timeout: 30_000,
    });

    // Um valor, para haver um total a pagar.
    await page
      .getByRole("button", { name: /^4\s*Orçamento/ })
      .first()
      .click();
    const valor = page
      .getByLabel(/Valor \(sem IVA\)/)
      .locator("visible=true")
      .first();
    await valor.fill("3000");
    await valor.blur();
    await page
      .getByRole("button", { name: /^1\s*Evento/ })
      .first()
      .click();

    for (const passo of ["Evento", "Serviços", "Inspiração", "Orçamento", "Rever e enviar"]) {
      await page
        .getByRole("button", { name: new RegExp(`^\\d\\s*${passo}`) })
        .first()
        .click();
      await expect
        .poll(async () => (await totalDaBarra(page))?.texto ?? "", {
          message: `passo «${passo}» a ${tamanho.width}: o total a pagar tem de estar na barra`,
          timeout: 10_000,
        })
        .toMatch(/3\s?690,00\s€/);
      const total = await totalDaBarra(page);
      expect(total?.dentroDaBarra, `passo «${passo}»: o total cabe dentro da barra`).toBe(true);
      expect(total?.alturaDaBarra, `passo «${passo}»: a barra não encolheu`).toBeGreaterThan(30);

      const larguras = await page.evaluate(() => ({
        documento: document.documentElement.scrollWidth,
        janela: window.innerWidth,
      }));
      expect(larguras.documento, `passo «${passo}»: sem scroll de lado`).toBeLessThanOrEqual(
        larguras.janela,
      );
    }
  });
}
