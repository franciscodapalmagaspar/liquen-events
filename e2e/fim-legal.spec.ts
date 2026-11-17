import { expect, test, type Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O FIM LEGAL EM TODAS AS ROTAS PÚBLICAS, E NADA GUARDADO ANTES DO «ACEITAR»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido do Francisco, 17/11 (`docs/LEGAL-FORMULARIO.md`, lista de
 * verificação): um passeio que confirma o Livro de Reclamações e a resolução
 * de litígios (CNIACC, Portal do Consumidor) em todas as rotas — 404, proposta
 * online e `/orcamento` incluídos —, sem nenhuma menção à ODR, e que nada fica
 * guardado no browser antes do consentimento dos cookies.
 *
 * Sem a sessão do back office: é o que um visitante vê.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const ROTAS: Array<[string, string]> = [
  ["a entrada", "/"],
  ["a entrada (EN)", "/en"],
  ["sobre", "/sobre"],
  ["casamentos", "/casamentos"],
  ["galeria", "/galeria"],
  ["contacto", "/contacto"],
  ["privacidade", "/privacidade"],
  ["termos", "/termos"],
  ["o formulário de orçamento", "/orcamento"],
  ["o formulário de orçamento (EN)", "/en/orcamento"],
  ["a página de um anúncio", "/s/comporta"],
  ["o 404 dos anúncios", "/s/esta-nao-existe"],
  ["o 404 do sítio", "/esta-pagina-nao-existe"],
  ["a proposta online (ligação inválida)", "/proposta/ligacao-que-nao-existe"],
];

async function confirmarFimLegal(page: Page, en: boolean) {
  const livro = page.locator('a[href^="https://www.livroreclamacoes.pt/"]').last();
  await expect(livro).toBeAttached();
  await expect(livro).toHaveAttribute("target", "_blank");
  await expect(livro).toHaveAttribute(
    "aria-label",
    en
      ? "Complaints Book (opens in a new tab)"
      : "Livro de Reclamações Eletrónico (abre noutro separador)",
  );
  // O ícone oficial (os WebP pré-gerados de `public/logos/livro-de-reclamacoes.png`).
  await expect(livro.locator("img")).toHaveAttribute("src", /livro-de-reclamacoes/);
  await expect(page.locator('a[href="https://www.cniacc.pt/"]').last()).toBeAttached();
  await expect(page.locator('a[href="https://www.consumidor.gov.pt/"]').last()).toBeAttached();
  const aviso = page.locator("[data-aviso-legal]").last();
  await expect(aviso.locator('a[href$="/privacidade"]')).toHaveCount(1);
  await expect(aviso.locator('a[href$="/privacidade#cookies"]')).toHaveCount(1);
  await expect(aviso.locator('a[href$="/termos"]')).toHaveCount(1);
  const texto = (await page.locator("body").innerText()).toLowerCase();
  expect(texto).not.toMatch(/\bodr\b|resolução de litígios em linha|online dispute resolution/);
}

for (const [nome, rota] of ROTAS) {
  test(`${nome} (${rota}) tem o fim legal inteiro`, async ({ page }) => {
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(e.message));
    await page.goto(rota);
    await confirmarFimLegal(page, rota.startsWith("/en"));
    expect(erros).toEqual([]);
  });
}

test("nada fica guardado no browser antes do consentimento", async ({ page, context }) => {
  // Chega como de um anúncio da Google e da Meta: os identificadores do clique
  // estão no endereço, e não podem ficar guardados sem «Aceitar».
  await page.goto("/s/comporta?gclid=TESTE-GCLID&fbclid=TESTE-FBCLID&utm_source=ig");
  await page.waitForLoadState("networkidle");
  // E depois de navegar para outra página, também.
  await page.goto("/orcamento?gclid=TESTE-GCLID");
  await page.waitForLoadState("networkidle");

  const guardado = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    sessao: Object.keys(sessionStorage),
  }));
  expect(guardado.local).toEqual([]);
  expect(JSON.stringify(guardado)).not.toMatch(/gclid|fbclid|TESTE/);

  const cookies = await context.cookies();
  const nomes = cookies.map((c) => c.name);
  // Nenhum cookie de medição (Google, Meta) sem consentimento.
  expect(nomes.filter((n) => /^_ga|^_gcl|^_fbp|^_fbc|^fr$/.test(n))).toEqual([]);
  expect(JSON.stringify(cookies)).not.toContain("TESTE-");
});
