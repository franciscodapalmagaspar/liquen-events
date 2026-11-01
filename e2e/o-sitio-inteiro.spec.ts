import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { paginasPublicas } from "./imagens-uteis";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O SÍTIO INTEIRO — todas as páginas do sitemap, e não só as do menu
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A Fase 3 do pedido «nível estúdio» (31/10): «Playwright: todas as páginas
 * respondem 200, axe, capturas a 375/768/1440». O `a11y.spec.ts` corre o axe
 * numa amostra (uma rota de cada tipo); este percorre o sitemap TODO, PT e EN,
 * que é a lista que o Google lê — e a mesma descoberta do `imagens.spec.ts`
 * (`paginasPublicas`), para não haver duas listas de páginas a desacertar.
 *
 * O gate de acessibilidade é o mesmo do `a11y.spec.ts`: zero violações
 * críticas, e zero sérias além do `color-contrast` (o texto editorial ténue,
 * uma escolha de desenho documentada lá).
 *
 * As capturas só se tiram com `CAPTURAS=1` (vão para `docs/medicoes/capturas/`),
 * para o CI não escrever ficheiros a cada corrida. São páginas públicas: as
 * fotografias e os testemunhos já estão no ar; não há dados de clientes do
 * back office.
 */
const PAGINAS = paginasPublicas();

test("o sitemap encontra o sítio todo (guarda contra um verde por falta de páginas)", () => {
  expect(PAGINAS.length).toBeGreaterThanOrEqual(40);
  expect(PAGINAS).toContain("/");
  expect(PAGINAS).toContain("/en");
  expect(PAGINAS).toContain("/orcamento");
});

test.describe("Todas as páginas do sitemap", () => {
  for (const caminho of PAGINAS) {
    test(`${caminho} responde 200 e passa o axe estrutural`, async ({ page }) => {
      const resposta = await page.goto(caminho);
      expect(resposta?.status()).toBe(200);
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const estruturais = violations
        .filter(
          (v) => v.impact === "critical" || (v.impact === "serious" && v.id !== "color-contrast"),
        )
        .map((v) => ({ id: v.id, impact: v.impact, nos: v.nodes.length }));
      expect(estruturais).toEqual([]);
    });
  }
});

const LARGURAS = [
  { nome: "telemovel", width: 375, height: 812 },
  { nome: "tablet", width: 768, height: 1024 },
  { nome: "computador", width: 1440, height: 900 },
] as const;

const PARA_CAPTURAR = [
  "/",
  "/servicos",
  "/servicos/casamentos",
  "/galeria",
  "/sobre",
  "/clientes",
  "/contacto",
  "/orcamento",
];

test.describe("Capturas a 375, 768 e 1440", () => {
  test.skip(!process.env.CAPTURAS, "só com CAPTURAS=1");
  for (const l of LARGURAS) {
    for (const caminho of PARA_CAPTURAR) {
      test(`${caminho} a ${l.width}px`, async ({ page }) => {
        await page.setViewportSize({ width: l.width, height: l.height });
        await page.emulateMedia({ reducedMotion: "reduce" });
        // O aviso dos cookies já respondido («recusar»): a captura mostra a página.
        await page.addInitScript(() => localStorage.setItem("liquen-consent", "denied"));
        await page.goto(caminho, { waitUntil: "load" });
        await page.waitForTimeout(800);
        const pasta = `docs/medicoes/capturas/${l.nome}`;
        mkdirSync(pasta, { recursive: true });
        const nome = caminho === "/" ? "inicio" : caminho.slice(1).replace(/\//g, "-");
        await page.screenshot({ path: `${pasta}/${nome}.jpg`, type: "jpeg", quality: 72 });
      });
    }
  }
});
