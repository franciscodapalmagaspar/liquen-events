import { test, expect, type Page, type CDPSession } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, pedidoDoDia } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BACK OFFICE NUM IPHONE 14, COM AS BARRAS DO SAFARI — 390 × 664, COM O DEDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A auditoria do telemóvel de 14/11 achou que as 22 vistas, em repouso, estavam
 * limpas — e que os defeitos apareciam quando se TOCA e se ABRE. Cada caso daqui
 * é um desses achados, medido como ela o faria: com o dedo (toques por CDP, não
 * cliques de rato) e à altura que o iPhone deixa com as barras do Safari à
 * vista (664 px, e não os 844 do ecrã).
 *
 *   1. A gaveta «⋯» mostrava 4 dos 10 destinos e acabava num fio.
 *   2. Mudar de passo no «Fazer proposta» deixava a página a meio do passo novo.
 *   3. Abrir os «Filtros» dos Pedidos fazia a página deslizar para o lado.
 *   4. Campos a 12–14 px (o iOS amplia a página ao focá-los).
 *   5. Tocar num dia do calendário punha o resumo por baixo da barra de baixo.
 *   6. O toque longo fazia o mesmo que o toque curto (o Safari não dispara
 *      `contextmenu`): agora abre o menu, e o toque curto fica como estava.
 *   7. A semana abria com um dia cortado a meio.
 *   8. «Nova tarefa» abria colada à barra de baixo, com os detalhes por baixo.
 *
 * Corre com servidor que GRAVA (cria uma marcação e tarefas «TESTE e2e») — ver
 * `playwright.movel.config.ts`.
 */

const IPHONE_COM_BARRAS = { width: 390, height: 664 };
test.use({ viewport: IPHONE_COM_BARRAS, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

const IGNORAR = [
  /React DevTools/i,
  /\[Fast Refresh\]/i,
  /favicon/i,
  /Failed to load resource: the server responded with a status of 404/i,
  /is using quality/i,
  /net::ERR_(TUNNEL_CONNECTION_FAILED|CONNECTION_|NAME_NOT_RESOLVED|PROXY_)/i,
  // Sem Supabase/R2 não há fotografias: o estúdio avisa na consola, e é do
  // ambiente, não do ecrã.
  /não deu para ir buscar as fotografias/i,
  /Failed to fetch/i,
];
function errosDaConsola(page: Page): string[] {
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORAR.some((r) => r.test(m.text()))) erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  return erros;
}

async function vista(page: Page, v: string) {
  await page.goto(`/orcamento/admin?v=${v}`);
  await page.waitForFunction(() => document.body.classList.contains("admin-mode"), undefined, {
    timeout: 60_000,
  });
  await page
    .waitForFunction(
      () => {
        const c = document.querySelector(".cortina");
        return !c || document.documentElement.getAttribute("data-cortina") === "fora";
      },
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(800);
}

async function tocar(page: Page, seletor: ReturnType<Page["locator"]>) {
  await seletor.scrollIntoViewIfNeeded();
  const b = await seletor.boundingBox();
  expect(b, "o alvo do toque não tem caixa").not.toBeNull();
  await page.touchscreen.tap(b!.x + b!.width / 2, b!.y + b!.height / 2);
}

/** O dedo pousado `ms` milissegundos sem se mexer — o que o rato não prova. */
async function toqueLongo(cdp: CDPSession, x: number, y: number, ms = 800) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, ms));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function deslizar(cdp: CDPSession, x: number, y0: number, y1: number) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 10; i += 1) {
    await new Promise((r) => setTimeout(r, 25));
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 10 }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function topoDaBarraDeBaixo(page: Page): Promise<number> {
  return page
    .getByRole("navigation", { name: /Navegação do back office/i })
    .evaluate((n) => n.getBoundingClientRect().top);
}

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Um dia deste mês sem nada marcado, longe de hoje (para o toque longo «no vazio»). */
function diaVazioDoMes(): string {
  const d = new Date();
  const dia = d.getDate() > 15 ? 3 : 25;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

const MARCACAO = "TESTE e2e — reunião do telemóvel";

async function garantirMarcacaoDeHoje(page: Page) {
  const lista = (await (await page.request.get("/api/calendario")).json()) as {
    title: string;
    date: string;
  }[];
  if (lista.some((e) => e.title === MARCACAO && e.date === hojeISO())) return;
  const r = await page.request.post("/api/calendario", {
    data: { title: MARCACAO, kind: "reuniao", time: "15:00", note: "", date: hojeISO() },
  });
  expect(r.ok(), `não gravou a marcação: ${r.status()}`).toBe(true);
}

async function garantirTarefas(page: Page, n: number) {
  const lista = (await (await page.request.get("/api/tarefas")).json()) as {
    title: string;
    done?: boolean;
  }[];
  const ja = lista.filter((t) => t.title.startsWith("TESTE e2e") && !t.done).length;
  for (let i = ja; i < n; i += 1) {
    const r = await page.request.post("/api/tarefas", {
      data: { title: `TESTE e2e tarefa ${i + 1} do telemóvel` },
    });
    expect(r.ok(), `não gravou a tarefa: ${r.status()}`).toBe(true);
  }
}

test.describe("o back office num iPhone com as barras do Safari", () => {
  test.beforeEach(async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
  });

  test("1 · a gaveta «⋯» mostra os dez destinos, e cada um responde ao dedo", async ({ page }) => {
    const erros = errosDaConsola(page);
    await vista(page, "pedidos");
    await tocar(page, page.getByRole("button", { name: /Mais destinos/i }).first());
    const nav = page.getByRole("navigation", { name: "Mais destinos" });
    await expect(nav).toBeVisible();
    await page.waitForTimeout(500);

    const destinos = await nav.getByRole("button").evaluateAll((bs) =>
      bs.map((b) => {
        const r = b.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const quem = document.elementFromPoint(x, y);
        return {
          nome: (b.getAttribute("aria-label") ?? b.textContent ?? "").trim(),
          responde: !!quem && (quem === b || b.contains(quem)),
          fundo: Math.round(r.bottom),
        };
      }),
    );
    expect(
      destinos.length,
      "a gaveta tem os destinos que não cabem na barra",
    ).toBeGreaterThanOrEqual(10);
    // Sem rolar: no iPhone com barras, os dez à vista e cada um a responder por si.
    expect(destinos.filter((d) => !d.responde).map((d) => d.nome)).toEqual([]);
    expect(Math.max(...destinos.map((d) => d.fundo))).toBeLessThanOrEqual(IPHONE_COM_BARRAS.height);
    expect(erros).toEqual([]);
  });

  test("2 · mudar de passo sobe ao topo do passo novo — pela barra e pelo «Seguinte»", async ({
    page,
  }) => {
    const erros = errosDaConsola(page);
    const { naLista } = await pedidoDoDia(page);
    await vista(page, "pedidos");
    await tocar(page, page.getByText(naLista).first());
    const passos = page.locator("nav[aria-label='Passos da proposta']");
    await expect(passos).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);

    const inicioDoPasso = () =>
      page.evaluate(() => {
        const nav = document.querySelector("nav[aria-label='Passos da proposta']")!;
        const f = document.querySelector<HTMLElement>('[class~="@container/estudio"]')!;
        return {
          topo: f.getBoundingClientRect().top,
          barras: nav.getBoundingClientRect().bottom,
          scrollY,
        };
      });

    // Vinda do FUNDO do passo 1, toca no «2».
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    await tocar(page, passos.getByRole("button").nth(1));
    await page.waitForTimeout(1200);
    let p = await inicioDoPasso();
    expect(
      p.topo,
      `o passo 2 começa ${Math.round(p.barras - p.topo)} px acima das barras`,
    ).toBeGreaterThanOrEqual(p.barras - 2);
    expect(p.topo, "o passo 2 começa logo por baixo das barras").toBeLessThanOrEqual(p.barras + 48);

    // E pelo «Seguinte», também do fundo.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    await tocar(page, page.getByRole("button", { name: /^Seguinte:/ }).first());
    await page.waitForTimeout(1200);
    p = await inicioDoPasso();
    expect(p.topo).toBeGreaterThanOrEqual(p.barras - 2);
    expect(p.topo).toBeLessThanOrEqual(p.barras + 48);

    // Quem já está no topo do passo não é sacudido: do topo do 3 para o 4.
    const antes = (await inicioDoPasso()).scrollY;
    await tocar(page, passos.getByRole("button").nth(3));
    await page.waitForTimeout(1000);
    expect(Math.abs((await inicioDoPasso()).scrollY - antes)).toBeLessThanOrEqual(1);
    expect(erros).toEqual([]);
  });

  test("2 · com movimento reduzido, o salto ao topo do passo é imediato", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { naLista } = await pedidoDoDia(page);
    await vista(page, "pedidos");
    await tocar(page, page.getByText(naLista).first());
    const passos = page.locator("nav[aria-label='Passos da proposta']");
    await expect(passos).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    await tocar(page, passos.getByRole("button").nth(2));
    // Sem esperar por animação nenhuma: dois fotogramas.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const p = await page.evaluate(() => {
      const nav = document.querySelector("nav[aria-label='Passos da proposta']")!;
      const f = document.querySelector<HTMLElement>('[class~="@container/estudio"]')!;
      return { topo: f.getBoundingClientRect().top, barras: nav.getBoundingClientRect().bottom };
    });
    expect(p.topo).toBeGreaterThanOrEqual(p.barras - 2);
    expect(p.topo).toBeLessThanOrEqual(p.barras + 48);
  });

  test("3 · abrir os «Filtros» dos Pedidos não faz a página deslizar para o lado", async ({
    page,
  }) => {
    const erros = errosDaConsola(page);
    await pedidoDoDia(page);
    await vista(page, "pedidos");
    await tocar(page, page.locator('[aria-controls="painel-filtros-pedidos"]').first());
    await expect(page.locator("#painel-filtros-pedidos")).toBeVisible();
    await page.waitForTimeout(400);
    const { sw, cw, foraDoEcra } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      foraDoEcra: [...document.querySelectorAll("#painel-filtros-pedidos > *")]
        .filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5)
        .map((e) => e.getAttribute("aria-label") ?? e.textContent?.trim().slice(0, 30)),
    }));
    expect(foraDoEcra).toEqual([]);
    expect(sw, `a página tem ${sw - cw} px a mais na largura`).toBeLessThanOrEqual(cw);
    expect(erros).toEqual([]);
  });

  test("4 · nenhum campo fica abaixo de 16 px no dedo (o iOS amplia a página)", async ({
    page,
  }) => {
    const pequenos = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("input, textarea, select")]
          .filter(
            (e) =>
              !["checkbox", "radio", "hidden", "range", "color", "file"].includes(
                (e as HTMLInputElement).type,
              ) && e.getClientRects().length > 0,
          )
          .map((e) => ({
            nome: e.getAttribute("aria-label") ?? e.id ?? e.getAttribute("name") ?? e.tagName,
            letra: parseFloat(getComputedStyle(e).fontSize),
          }))
          .filter((c) => c.letra < 16),
      );

    // Os modelos de email (o corpo do modelo, nas duas versões do editor).
    await vista(page, "modelos-email");
    expect(await pequenos()).toEqual([]);
    for (const nome of [/Editor clássico/i, /^Modelos$/i]) {
      const b = page.getByRole("button", { name: nome }).or(page.getByRole("tab", { name: nome }));
      if (
        await b
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await tocar(page, b.first());
        await page.waitForTimeout(600);
        expect(await pequenos()).toEqual([]);
      }
    }

    // O passo «Serviços» do estúdio: o título do grupo é o campo mais escrito.
    const { naLista } = await pedidoDoDia(page);
    await vista(page, "pedidos");
    await tocar(page, page.getByText(naLista).first());
    const passos = page.locator("nav[aria-label='Passos da proposta']");
    await expect(passos).toBeVisible({ timeout: 30_000 });
    await tocar(page, passos.getByRole("button").nth(1));
    await page.waitForTimeout(800);
    await expect(page.getByLabel(/^Título do grupo 1$/).first()).toBeVisible();
    expect(await pequenos()).toEqual([]);
  });

  test("5 · tocar num dia com marcação mostra o resumo do dia acima da barra de baixo", async ({
    page,
  }) => {
    const erros = errosDaConsola(page);
    await garantirMarcacaoDeHoje(page);
    await vista(page, "calendario");
    const mes = page
      .getByRole("radio", { name: "Mês", exact: true })
      .or(page.getByRole("tab", { name: "Mês", exact: true }))
      .or(page.getByRole("button", { name: "Mês", exact: true }))
      .first();
    await tocar(page, mes);
    await page.waitForTimeout(800);
    await tocar(page, page.locator(`[role="gridcell"][data-dia="${hojeISO()}"]`));
    await page.waitForTimeout(1200);
    const fechar = page.getByRole("button", { name: "Fechar dia" });
    await expect(fechar).toBeVisible();
    const cabecalho = await fechar.evaluate((b) => b.getBoundingClientRect().bottom);
    const barra = await topoDaBarraDeBaixo(page);
    expect(
      cabecalho,
      `o resumo do dia começa ${Math.round(cabecalho - barra)} px por baixo da barra`,
    ).toBeLessThanOrEqual(barra);
    // E o que o dia tem lá dentro também se vê — a marcação, por cima da barra.
    const resumo = fechar.locator("xpath=ancestor::div[contains(@class,'bo-entrada')][1]");
    const linha = resumo.getByText(MARCACAO).first();
    await expect(linha).toBeVisible();
    expect(await linha.evaluate((e) => e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(
      barra,
    );
    expect(erros).toEqual([]);
  });

  test("6 · o toque longo abre o menu do dia; o toque curto continua a criar; deslizar não abre nada", async ({
    page,
  }) => {
    const erros = errosDaConsola(page);
    const cdp = await page.context().newCDPSession(page);
    await vista(page, "calendario");
    const mes = page
      .getByRole("radio", { name: "Mês", exact: true })
      .or(page.getByRole("tab", { name: "Mês", exact: true }))
      .or(page.getByRole("button", { name: "Mês", exact: true }))
      .first();
    await tocar(page, mes);
    await page.waitForTimeout(800);
    const dia = page.locator(`[role="gridcell"][data-dia="${diaVazioDoMes()}"]`);
    await dia.scrollIntoViewIfNeeded();
    const c = (await dia.boundingBox())!;

    // Toque longo: o menu do dia, e NÃO o «Novo no calendário» do clique.
    await toqueLongo(cdp, c.x + c.width / 2, c.y + c.height / 2);
    await page.waitForTimeout(600);
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    // Deslizar por cima do dia rola a página e não abre nada.
    await deslizar(cdp, c.x + c.width / 2, c.y + c.height / 2, c.y + c.height / 2 - 160);
    await page.waitForTimeout(800);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // E o toque curto continua a ser «acrescentar» num dia vazio.
    await tocar(page, dia);
    await page.waitForTimeout(800);
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(erros).toEqual([]);
  });

  test("6 · o toque longo numa tarefa abre as «Acções» dela, e não a tarefa", async ({ page }) => {
    const erros = errosDaConsola(page);
    const cdp = await page.context().newCDPSession(page);
    await garantirTarefas(page, 1);
    await vista(page, "tarefas");
    const linha = page.locator("[data-tarefa]", { hasText: /TESTE e2e tarefa/ }).first();
    await linha.scrollIntoViewIfNeeded();
    const titulo = linha.getByText(/TESTE e2e tarefa/).first();
    const c = (await titulo.boundingBox())!;
    await toqueLongo(cdp, c.x + c.width / 2, c.y + c.height / 2);
    await page.waitForTimeout(600);
    await expect(page.getByRole("menu")).toBeVisible();
    // O clique que o dedo manda ao levantar não abriu a tarefa por baixo do menu.
    await expect(linha).not.toHaveAttribute("aria-current", "true");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    // O toque curto continua a abrir a tarefa.
    await tocar(page, titulo);
    await page.waitForTimeout(800);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(linha).toHaveAttribute("aria-current", "true");
    expect(erros).toEqual([]);
  });

  test("6 · o toque longo numa marcação abre o menu DELA, e não o do dia", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await garantirMarcacaoDeHoje(page);
    await vista(page, "calendario");
    const vistaDia = page
      .getByRole("radio", { name: "Dia", exact: true })
      .or(page.getByRole("tab", { name: "Dia", exact: true }))
      .or(page.getByRole("button", { name: "Dia", exact: true }))
      .first();
    await tocar(page, vistaDia);
    await page.waitForTimeout(1000);
    const chip = page.getByRole("button", { name: new RegExp(MARCACAO) }).first();
    await chip.scrollIntoViewIfNeeded();
    const c = (await chip.boundingBox())!;
    await toqueLongo(cdp, c.x + c.width / 2, c.y + Math.min(c.height / 2, 10));
    await page.waitForTimeout(600);
    const menu = page.getByRole("menu");
    await expect(menu).toHaveCount(1);
    await expect(menu).toHaveAttribute("aria-label", new RegExp(MARCACAO));
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("7 · a semana abre no início de um dia, com hoje inteiro à vista", async ({ page }) => {
    const erros = errosDaConsola(page);
    await vista(page, "calendario");
    const semana = page
      .getByRole("radio", { name: "Semana", exact: true })
      .or(page.getByRole("tab", { name: "Semana", exact: true }))
      .or(page.getByRole("button", { name: "Semana", exact: true }))
      .first();
    await tocar(page, semana);
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => {
      const hoje = document.querySelector<HTMLElement>('[aria-current="date"]')!;
      const colunas = [...hoje.parentElement!.children] as HTMLElement[];
      let caixa: HTMLElement | null = hoje.parentElement;
      while (caixa && getComputedStyle(caixa).overflowX !== "auto") caixa = caixa.parentElement;
      const c = caixa!.getBoundingClientRect();
      const inicio = c.left + caixa!.clientLeft + 48;
      const fim = c.left + caixa!.clientLeft + caixa!.clientWidth;
      const h = hoje.getBoundingClientRect();
      return {
        rola: caixa!.scrollWidth > caixa!.clientWidth,
        diasCortadosAEsquerda: colunas.filter((k) => {
          const r = k.getBoundingClientRect();
          return r.left < inicio - 1.5 && r.right > inicio + 1.5;
        }).length,
        hojeInteiro: h.left >= inicio - 1.5 && h.right <= fim + 1.5,
      };
    });
    if (m.rola) {
      expect(m.diasCortadosAEsquerda, "a semana abriu com um dia cortado a meio").toBe(0);
    }
    expect(m.hojeInteiro).toBe(true);
    expect(erros).toEqual([]);
  });

  test("8 · «Nova tarefa» abre por inteiro acima da barra de baixo", async ({ page }) => {
    const erros = errosDaConsola(page);
    await garantirTarefas(page, 3);
    await vista(page, "tarefas");
    const abrir = page
      .locator("[data-lista-de-tarefas]")
      .getByRole("button", { name: /^\+?\s*Nova tarefa$/ })
      .last();
    await tocar(page, abrir);
    const campo = page.getByRole("textbox", { name: "Nova tarefa" });
    await expect(campo).toBeVisible();
    await page.waitForTimeout(1000);
    const fundo = await campo.evaluate((i) => i.parentElement!.getBoundingClientRect().bottom);
    const barra = await topoDaBarraDeBaixo(page);
    expect(
      fundo,
      `a linha de escrever acaba ${Math.round(fundo - barra)} px por baixo da barra`,
    ).toBeLessThanOrEqual(barra + 1);
    expect(erros).toEqual([]);
  });
});
