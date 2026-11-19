import { test, expect, type Page } from "@playwright/test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUM TEXTO DO SITE PÚBLICO ABAIXO DE 12 px — MEDIDO NO BROWSER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 17/11: um júri contou 104 textos de 9 a 11 px nas páginas públicas, e as
 * «Boas práticas» do Lighthouse desceram de 100 para 96 em seis páginas (a
 * entrada, o /en, o Sobre, a Galeria, o pedido de proposta e os anúncios
 * `/s/`). O dono aprovou o chão de 12 px, num token só (`--text-miuda`).
 *
 * O teste de contrato (`src/app/letra-minima-do-site.contrato.test.ts`) lê o
 * código. Este mede o tamanho REAL que o browser calcula, com a cascata toda
 * aplicada — que é onde uma regra escrita na camada errada, ou um `em` dentro
 * de um pai pequeno, se apanha.
 *
 * Ao contrário do back office (`chao-da-letra.spec.ts`), aqui o chão é o mesmo
 * em todas as larguras: o site não tem tabelas densas.
 */

const CHAO = 12;

const PAGINAS = [
  "/",
  "/en",
  "/sobre",
  "/servicos",
  "/galeria",
  "/clientes",
  "/contacto",
  "/orcamento",
  "/privacidade",
  "/s/alentejo",
  "/casamentos/destination",
];

async function letraAbaixoDoChao(page: Page) {
  // Descer a página: há texto que só se desenha ao chegar ao ecrã. Com um
  // tecto, porque a galeria vai carregando mais fotografias ao descer.
  await page.evaluate(async () => {
    const fim = Math.min(document.documentElement.scrollHeight, 15_000);
    for (let y = 0; y < fim; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
  });
  return page.evaluate((chao) => {
    const fora: { texto: string; px: number; classe: string }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      // Só quem TEM texto próprio: um contentor herda o tamanho, e contá-lo
      // dava a mesma queixa dezenas de vezes.
      const proprio = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0,
      );
      if (!proprio) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // A exceção pedida pelo dono a 18/11: as três chamadas em maiúsculas
      // («Pedir proposta» e «Ver galeria» na entrada, e o que flutua ao
      // descer) voltam ao tamanho de antes. Presas pelo teste de contrato.
      if (el.closest('[class*="text-chamada"]')) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px >= chao) continue;
      fora.push({
        texto: (el.textContent ?? "").trim().slice(0, 40),
        px,
        classe: String(el.className).slice(0, 80),
      });
    }
    return fora;
  }, CHAO);
}

for (const largura of [390, 1440]) {
  test.describe(`o chão da letra do site a ${largura} px`, () => {
    test.use({ viewport: { width: largura, height: largura < 500 ? 844 : 900 } });

    for (const caminho of PAGINAS) {
      test(`${caminho}: nada abaixo de 12 px`, async ({ page }) => {
        test.setTimeout(90_000);
        await page.goto(caminho);
        const pequenos = await letraAbaixoDoChao(page);
        expect(
          pequenos,
          `${caminho} a ${largura} px: ${pequenos.length} textos abaixo de 12 px — ${JSON.stringify(pequenos.slice(0, 6))}`,
        ).toEqual([]);
      });
    }
  });
}

test("a sonda: a classe do token dá mesmo 12 px no browser", async ({ page }) => {
  // Mede a REGRA e não o conteúdo: se o `--text-miuda` for podado do `:root`
  // ou o utilitário deixar de ser gerado, a letra cai para a do pai sem erro.
  await page.goto("/");
  const px = await page.evaluate(() => {
    const el = document.createElement("span");
    el.className = "text-miuda";
    el.textContent = "sonda";
    document.body.appendChild(el);
    const tamanho = parseFloat(getComputedStyle(el).fontSize);
    const variavel = getComputedStyle(document.documentElement).getPropertyValue("--text-miuda");
    el.remove();
    return { tamanho, variavel: variavel.trim() };
  });
  expect(px.variavel, "o --text-miuda não chegou ao :root").not.toBe("");
  expect(px.tamanho).toBe(12);
});
