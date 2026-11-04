import { test, expect, type Page } from "@playwright/test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O AVISO DE COOKIES NÃO PODE MATAR OS BOTÕES DA PRIMEIRA DOBRA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. A barra de consentimento é `fixed` e está encostada ao fundo
 * do ecrã — que é exactamente onde vivem as quatro acções que dão dinheiro. Foi
 * MEDIDO, com `document.elementFromPoint` no CENTRO de cada alvo, num 390×844
 * sem escolha feita: a barra media 191 px (23% do ecrã) e no ponto do clique
 * estava
 *
 *   · «Pedir orçamento →» do herói  →  <a>Saber mais (o link do aviso)
 *   · «Ver galeria →»               →  o <p> do aviso
 *   · «PEDIR ORÇAMENTO →» fixo      →  <button>Recusar
 *   · a pílula de WhatsApp          →  a caixa dos dois botões do aviso
 *
 * Os quatro visíveis e os quatro mortos, até a pessoa decidir sobre cookies.
 * No computador (1440×900) eram 74 px e os dois botões fixos.
 *
 * ⚠ A ARMADILHA QUE ESTE FICHEIRO EVITA — e que já apanhou o `social.spec.ts`
 * uma vez, está lá escrito: verificar que a caixa do botão cai dentro da janela
 * NÃO PROVA NADA. Um botão inteiramente tapado passa nesse teste. A pergunta
 * certa é «quem está naquele ponto do ecrã?», porque é isso que o dedo acerta.
 *
 * O QUE ESTE FICHEIRO GARANTE:
 *   1. que no centro de cada um dos quatro alvos está o próprio alvo;
 *   2. que a reserva declarada em CSS (`--reserva-consentimento`) continua
 *      MAIOR OU IGUAL à altura que a barra desenha — é dela que sai o
 *      afastamento, e uma barra que cresça sem a reserva crescer volta a tapar
 *      tudo, em silêncio;
 *   3. que a barra continua LÁ. Um aviso legal que ninguém vê é outro defeito,
 *      não é a correcção deste.
 */

/** O que está no ponto do clique de um alvo, e se esse ponto lhe pertence. */
async function quemEstaNoCentro(page: Page, seletor: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { existe: false as const };
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    const noPonto = document.elementFromPoint(x, y);
    const nome = (n: Element | null) =>
      n
        ? `<${n.tagName.toLowerCase()}> «${(n.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}»`
        : "nada";
    return {
      existe: true as const,
      meu: !!noPonto && (el === noPonto || el.contains(noPonto)),
      quem: nome(noPonto),
      ponto: { x: Math.round(x), y: Math.round(y) },
    };
  }, seletor);
}

/**
 * Espera que um flutuante esteja MESMO à mostra.
 *
 * `toBeVisible()` não chega e é uma armadilha silenciosa: para o Playwright um
 * elemento com `opacity: 0` é visível (tem caixa e não é `visibility: hidden`),
 * e estes dois entram com uma transição de 500 ms a partir de `opacity-0
 * pointer-events-none`. Medir a meio dessa transição é medir um elemento que
 * ainda não recebe o dedo — e o `elementFromPoint` devolve, com toda a razão, o
 * que está por baixo. Aqui espera-se pelo que interessa: opacidade cheia e
 * ponteiro ligado.
 */
async function esperarQueApareca(page: Page, seletor: string) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      // O `opacity`/`pointer-events` do CTA fixo vive no embrulho, o da pílula
      // de WhatsApp no próprio <a>.
      for (const n of [el, el.parentElement]) {
        if (!n) continue;
        const cs = getComputedStyle(n);
        if (cs.opacity !== "1" && parseFloat(cs.opacity) < 0.99) return false;
        if (cs.pointerEvents === "none") return false;
      }
      return true;
    },
    seletor,
    { timeout: 15_000 },
  );
}

/** Altura desenhada da barra e reserva declarada no CSS, em pixels. */
async function barraEReserva(page: Page) {
  return page.evaluate(() => {
    const barra = document.querySelector(".barra-consentimento");
    const reserva = getComputedStyle(document.body).getPropertyValue("--reserva-consentimento");
    return {
      altura: barra ? Math.round(barra.getBoundingClientRect().height) : 0,
      reserva: parseFloat(reserva) || 0,
      alturaDaJanela: window.innerHeight,
    };
  });
}

const HEROI_GALERIA = 'main section a[href$="/galeria"]';
const HEROI_PROPOSTA = 'main section a[href$="/orcamento"]';
const CTA_FIXO = 'div[class*="z-40"][class*="fixed"] a';
const WHATSAPP = "a.whatsapp-fixed";

const MEDIDAS = [
  { nome: "telemóvel", viewport: { width: 390, height: 844 } },
  { nome: "computador", viewport: { width: 1440, height: 900 } },
] as const;

for (const medida of MEDIDAS) {
  test.describe(`aviso de cookies — ${medida.nome} ${medida.viewport.width}×${medida.viewport.height}`, () => {
    test.use({ viewport: medida.viewport });

    test.beforeEach(async ({ page }) => {
      // Contexto limpo = sem `liquen-consent` no armazenamento = a barra
      // aparece, que é a única situação em que este ficheiro tem alguma coisa
      // para medir. Se ela não aparecer, o teste tem de FALHAR, não passar de
      // vazio — daí o `expect` a seguir.
      await page.goto("/");
      await expect(page.locator(".barra-consentimento")).toBeVisible();
      // Os dois flutuantes só nascem em `requestIdleCallback` e a pílula de
      // WhatsApp espera ainda 1,5 s antes de se mostrar.
      await esperarQueApareca(page, WHATSAPP);
      // E o herói tem de estar montado — é onde vivem dois dos alvos. O
      // «Pedir proposta» saiu a 2/11 e voltou a 4/11, ao lado do «Ver
      // galeria» (pedido dela).
      await expect(page.locator(HEROI_GALERIA).first()).toBeVisible();
    });

    test("a reserva declarada cobre a altura que a barra desenha", async ({ page }) => {
      const { altura, reserva, alturaDaJanela } = await barraEReserva(page);
      expect(altura, "a barra não desenhou — o teste não prova nada").toBeGreaterThan(40);
      expect(
        reserva,
        "`--reserva-consentimento` não está declarada: sem ela nada se afasta do fundo",
      ).toBeGreaterThan(0);
      expect(
        reserva,
        `a barra desenha ${altura} px e o sítio só reserva ${reserva} px — volta a tapar os botões`,
      ).toBeGreaterThanOrEqual(altura);
      // E continua a ser um aviso, não um cartaz: nunca mais do que um quinto
      // do ecrã. Media 22,6% quando isto foi escrito.
      expect(altura / alturaDaJanela).toBeLessThan(0.2);
    });

    test("no centro do CTA do herói está o próprio CTA", async ({ page }) => {
      for (const [nome, seletor] of [
        ["Pedir proposta →", HEROI_PROPOSTA],
        ["Ver galeria →", HEROI_GALERIA],
      ] as const) {
        const r = await quemEstaNoCentro(page, seletor);
        expect(r.existe, `não encontrei o «${nome}» do herói`).toBe(true);
        expect(
          r.meu,
          `no centro do «${nome}» (${r.existe ? `${r.ponto.x},${r.ponto.y}` : "?"}) está ${r.existe ? r.quem : "?"} — alguma coisa fixa está por cima`,
        ).toBe(true);
      }
    });

    test("no centro da pílula de WhatsApp está a pílula", async ({ page }) => {
      const r = await quemEstaNoCentro(page, WHATSAPP);
      expect(r.existe, "a pílula de WhatsApp não apareceu").toBe(true);
      expect(r.meu, `no centro da pílula de WhatsApp está ${r.existe ? r.quem : "?"}`).toBe(true);
    });

    test("o CTA fixo não aparece enquanto o aviso estiver no ecrã", async ({ page }) => {
      // Antes, o CTA fixo subia para cima da barra e este teste media que nada
      // o tapava. Desde a auditoria externa (A1) a resposta é outra: enquanto
      // o aviso pede uma decisão, o «Pedir orçamento» flutuante não aparece —
      // em computador nunca, no telemóvel só depois de a pessoa escolher
      // (`e2e/cta-flutuante.spec.ts` mede esse lado). Mede-se depois do scroll
      // que o faria aparecer.
      await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.2));
      await page.waitForTimeout(800);
      await expect(page.locator(CTA_FIXO)).toBeHidden();
    });

    test("e o aviso continua a ver-se, com os dois botões alcançáveis", async ({ page }) => {
      // A correcção não pode ser «esconder o aviso». Ele tem de continuar
      // visível e as duas escolhas têm de continuar a receber o dedo.
      for (const nome of [/recusar|decline/i, /aceitar|accept/i]) {
        const botao = page.getByRole("button", { name: nome });
        await expect(botao).toBeVisible();
        const caixa = await botao.boundingBox();
        expect(caixa, "o botão do aviso não tem caixa").not.toBeNull();
        const quem = await page.evaluate(
          ([x, y]) => {
            const n = document.elementFromPoint(x, y);
            return n?.closest("button")?.textContent?.trim() ?? `<${n?.tagName.toLowerCase()}>`;
          },
          [caixa!.x + caixa!.width / 2, caixa!.y + caixa!.height / 2],
        );
        expect(quem, `no centro do botão do aviso está «${quem}»`).toMatch(nome);
      }
    });
  });
}

test.describe("a reserva cobre a barra em todas as larguras", () => {
  // As duas larguras estreitas são as que quebram o texto em três linhas — é lá
  // que a barra é mais alta e é lá que a reserva estoura primeiro.
  for (const largura of [320, 360, 390, 768, 1440]) {
    test(`${largura} px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: largura < 640 ? 640 : 900 });
      await page.goto("/");
      await expect(page.locator(".barra-consentimento")).toBeVisible();
      const { altura, reserva } = await barraEReserva(page);
      expect(altura, "a barra não desenhou").toBeGreaterThan(40);
      expect(
        reserva,
        `a ${largura} px a barra desenha ${altura} px e o sítio reserva ${reserva} px`,
      ).toBeGreaterThanOrEqual(altura);
    });
  }
});
