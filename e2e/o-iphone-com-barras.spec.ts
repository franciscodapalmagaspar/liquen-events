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
 * E da revisão de 14/11: «Voltar e corrigir» (o envio parado nos cortes) chega
 * ao início do passo; o clique do fim do toque longo não chega a ninguém; o
 * toque (ou o clique, com rato a 1440) que fecha um menu SÓ o fecha; e o toque
 * longo no «⋯» já aberto deixa-o aberto.
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

/**
 * Toca no CENTRO do ecrã, e não onde o `scrollIntoViewIfNeeded` o deixar.
 *
 * O `scrollIntoViewIfNeeded` não conhece as barras fixas: deixa o alvo rente à
 * margem de baixo, DEBAIXO da barra de destinos — e o toque caía em «Visão
 * Geral» (CI de 15/11, PR #470: o passeio 9 do tablet saía do estúdio em vez
 * de pedir o PDF; só se via quando o rascunho deixado pelo passeio anterior
 * mudava a altura do passo 5). Antes de tocar confirma-se que é mesmo o alvo
 * que está debaixo do dedo.
 */
async function tocarAoCentro(page: Page, seletor: ReturnType<Page["locator"]>) {
  const { x, y } = await pontoAoCentro(page, seletor);
  await page.touchscreen.tap(x, y);
}

/**
 * Traz o alvo ao centro do ecrã e devolve o ponto onde o dedo vai pousar,
 * depois de confirmar que é o alvo — e não uma barra fixa — que lá está.
 * `alturaNoAlvo` escolhe a altura do toque dentro do alvo (por omissão o meio).
 */
async function pontoAoCentro(
  page: Page,
  seletor: ReturnType<Page["locator"]>,
  alturaNoAlvo: (altura: number) => number = (h) => h / 2,
): Promise<{ x: number; y: number }> {
  await seletor.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  await page.waitForTimeout(300);
  const b = await seletor.boundingBox();
  expect(b, "o alvo do toque não tem caixa").not.toBeNull();
  const x = b!.x + b!.width / 2;
  const y = b!.y + alturaNoAlvo(b!.height);
  expect(
    await seletor.evaluate(
      (el, [px, py]) => {
        const topo = document.elementFromPoint(px, py);
        return !!topo && (el === topo || el.contains(topo));
      },
      [x, y] as const,
    ),
    "o alvo está tapado (por uma barra fixa?) no sítio do toque",
  ).toBe(true);
  return { x, y };
}

/** O dedo pousado `ms` milissegundos sem se mexer — o que o rato não prova. */
async function toqueLongo(cdp: CDPSession, x: number, y: number, ms = 800) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, ms));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/**
 * Os cliques DO BROWSER (`isTrusted`) que chegam à página a partir de agora.
 *
 * Depois do toque longo o browser manda um `click` quando o dedo se levanta
 * (MEDIDO neste Chromium: pointerdown → 550 ms → pointerup → click). Esse clique
 * tem de ser engolido antes de chegar a quem quer que seja. Contá-lo no
 * `document` é a prova que não depende de onde o menu se desenhou: no dia do
 * calendário o menu abre DEBAIXO do dedo, o clique caía nele e não fazia nada,
 * e o passeio ficava verde sem o engolir (revisão de 14/11). Os `click()` do
 * código (o «⋯» que o toque longo carrega) não contam: não são do browser.
 */
async function contarCliquesDoBrowser(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    const w = window as unknown as { __cliques: number };
    w.__cliques = 0;
    document.addEventListener(
      "click",
      (e) => {
        if (e.isTrusted) w.__cliques += 1;
      },
      true,
    );
  });
  return () => page.evaluate(() => (window as unknown as { __cliques: number }).__cliques);
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

/** O centro de um dia vazio, à vista, que NÃO esteja debaixo do menu aberto. */
async function diaVazioForaDoMenu(page: Page, menos: string) {
  const alvo = await page.evaluate((longe) => {
    const m = document.querySelector('[role="menu"]')!.getBoundingClientRect();
    const barra =
      document.querySelector('nav[aria-label*="Navegação do back office"]')?.getBoundingClientRect()
        .top ?? innerHeight;
    for (const c of document.querySelectorAll<HTMLElement>('[role="gridcell"][data-dia]')) {
      if (c.dataset.dia === longe || c.querySelector('[class*="group/chip"]')) continue;
      const r = c.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const noMenu = x >= m.left - 4 && x <= m.right + 4 && y >= m.top - 4 && y <= m.bottom + 4;
      if (!noMenu && y > 80 && y < barra - 8 && x > 0 && x < innerWidth) {
        return { x, y, dia: c.dataset.dia! };
      }
    }
    return null;
  }, menos);
  expect(alvo, "não há um dia vazio à vista fora do menu").not.toBeNull();
  return alvo!;
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

/**
 * O relógio da página parado às 12:00 de hoje — a pior hora para a marcação.
 *
 * A vista de dia abre com o «agora» a um terço do topo da caixa, por isso a
 * marcação das 15:00 aparece num sítio diferente a cada hora. MEDIDO (17/11,
 * 390 × 664): entre as ~11:30 e as ~13:45 o topo dela fica rente à barra de
 * destinos (y 578–622, a barra começa em 580), o `scrollIntoViewIfNeeded`
 * acha-a «à vista» e não mexe, e o dedo caía na barra — abria «Mais destinos»
 * em vez do menu ou do detalhe da marcação. Fora dessa janela passava, e era
 * por isso que o CI de manhã cedo estava verde e o do meio-dia vermelho.
 * Com a hora parada no pior caso, o passeio prova sempre o caso difícil.
 */
async function pararORelogioAoMeioDia(page: Page) {
  const meioDia = new Date();
  meioDia.setHours(12, 0, 0, 0);
  await page.clock.setFixedTime(meioDia);
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

  test("2 · «Voltar e corrigir» (o envio parou nos cortes) chega ao INÍCIO do passo do corte", async ({
    page,
  }) => {
    const erros = errosDaConsola(page);
    const { id, naLista } = await pedidoDoDia(page);
    // NADA SAI: a rota do PDF responde aqui — a descarga com um PDF de uma
    // linha, e o envio com o 409 dos cortes, que é a resposta que pára antes de
    // gravar e de enviar. O rascunho também não toca no servidor.
    const envios: string[] = [];
    await page.route(`**/api/orcamento/${id}/proposta-doc**`, async (route) => {
      const corpo = route.request().postData() ?? "";
      if (/"mode":"send"/.test(corpo)) {
        envios.push(corpo);
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "O documento sai com conteúdo cortado.",
            precisaConfirmarCortes: true,
            truncations: [{ where: "Mood board «TESTE Cerimónia»", dropped: 3, unit: "fotos" }],
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: { "X-Chave-Do-Pdf": "chave-e2e" },
        body: "%PDF-1.4\n%TESTE\n%%EOF\n",
      });
    });
    await page.route(`**/api/orcamento/${id}/proposta-rascunho**`, (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ json: { ok: true, draft: null } })
        : route.fulfill({
            json: { ok: true, guardado: true, updatedAt: new Date().toISOString() },
          }),
    );
    await vista(page, "pedidos");
    // Um rascunho que pode sair (o mesmo dos casos do estúdio), só «TESTE».
    await page.evaluate((chave) => {
      localStorage.setItem(
        chave,
        JSON.stringify({
          template: "decoracao",
          ref: "PO TESTE",
          clientNames: "TESTE Maria & Zé",
          eventType: "Casamento",
          eventDate: "12 de setembro de 2026",
          location: "TESTE Évora",
          guests: "80 pax",
          serviceGroups: [
            { letter: "a)", title: "TESTE Decoração", items: [{ label: "Cerimónia" }] },
          ],
          moodBoards: [{ title: "TESTE Cerimónia", annotation: "", images: [] }],
          budgetItems: ["TESTE Decoração da cerimónia"],
          budgetAmounts: [3000],
          budgetArtigos: ["flores"],
          coverImages: ["", ""],
          totalAmount: 3000,
          totalVatMode: "acrescer",
        }),
      );
    }, `liquen-proposal-studio-${id}`);
    await tocar(page, page.getByText(naLista).first());
    const passos = page.locator("nav[aria-label='Passos da proposta']");
    await expect(passos).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await tocar(page, passos.getByRole("button").nth(4));
    await page.waitForTimeout(800);

    // No telemóvel o PDF final abre numa folha, com «Está certo — enviar».
    await tocar(page, page.getByRole("button", { name: "Descarregar o PDF final" }));
    const estaCerto = page
      .getByRole("dialog", { name: "O PDF final" })
      .getByRole("button", { name: "Está certo — enviar" });
    await expect(estaCerto).toBeVisible({ timeout: 20_000 });
    await tocar(page, estaCerto);
    const confirmar = page.getByRole("button", { name: /^Confirmar$/ });
    await page.waitForTimeout(600);
    if (!(await confirmar.isVisible().catch(() => false))) {
      await tocar(page, page.getByRole("button", { name: "Gerar e enviar ao cliente" }).last());
    }
    await expect(confirmar).toBeVisible();
    await page.waitForTimeout(500); // o «Confirmar» ignora os primeiros 400 ms
    await tocar(page, confirmar);
    const ja = page.getByRole("button", { name: /^Enviar já$/ });
    if (await ja.isVisible().catch(() => false)) await tocar(page, ja);
    const voltar = page.getByRole("button", { name: "Voltar e corrigir" });
    await expect(voltar).toBeVisible({ timeout: 20_000 });
    expect(envios, "o envio não chegou a perguntar").toHaveLength(1);

    // Ela está no fundo do «Rever e enviar», onde a pergunta aparece.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    await tocar(page, voltar);
    await page.waitForTimeout(1200);
    const p = await page.evaluate(() => {
      const nav = document.querySelector("nav[aria-label='Passos da proposta']")!;
      const f = document.querySelector<HTMLElement>('[class~="@container/estudio"]')!;
      return { topo: f.getBoundingClientRect().top, barras: nav.getBoundingClientRect().bottom };
    });
    await expect(passos.getByRole("button").nth(2)).toHaveAttribute("aria-current", "step");
    expect(
      p.topo,
      `a Inspiração começa ${Math.round(p.barras - p.topo)} px acima das barras`,
    ).toBeGreaterThanOrEqual(p.barras - 2);
    expect(p.topo).toBeLessThanOrEqual(p.barras + 48);
    expect(envios, "«Voltar e corrigir» enviou").toHaveLength(1);
    // O 409 é a resposta que o teste deu ao envio: o browser regista-a sempre.
    expect(erros.filter((e) => !/status of 409/.test(e))).toEqual([]);
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

    // Toque longo: o menu do dia, e NÃO o «Novo no calendário» do clique —
    // e o clique que o dedo manda ao levantar não chega a ninguém.
    const cliques = await contarCliquesDoBrowser(page);
    await toqueLongo(cdp, c.x + c.width / 2, c.y + c.height / 2);
    await page.waitForTimeout(600);
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await cliques(), "o clique do fim do toque longo não foi engolido").toBe(0);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    // Com o menu aberto, um toque curto NOUTRO dia só o fecha — não abre
    // «Novo no calendário» lá (revisão de 14/11).
    await toqueLongo(cdp, c.x + c.width / 2, c.y + c.height / 2);
    await page.waitForTimeout(600);
    await expect(page.getByRole("menu")).toBeVisible();
    // Um dia vazio à vista e FORA do menu (senão o toque caía num item dele).
    const alvo = await diaVazioForaDoMenu(page, diaVazioDoMes());
    await page.touchscreen.tap(alvo.x, alvo.y);
    await page.waitForTimeout(800);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("dialog"), "o toque que fechou o menu abriu o dia").toHaveCount(0);

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
    await garantirTarefas(page, 4);
    await vista(page, "tarefas");
    const linha = page.locator("[data-tarefa]", { hasText: /TESTE e2e tarefa/ }).first();
    await linha.scrollIntoViewIfNeeded();
    // A primeira lá em cima, para as outras ficarem à vista por baixo do menu.
    const topo = (await linha.boundingBox())!.y;
    await page.evaluate((d) => window.scrollBy(0, d), topo - 120);
    await page.waitForTimeout(400);
    const titulo = linha.getByText(/TESTE e2e tarefa/).first();
    const c = (await titulo.boundingBox())!;
    const cliques = await contarCliquesDoBrowser(page);
    await toqueLongo(cdp, c.x + c.width / 2, c.y + c.height / 2);
    await page.waitForTimeout(600);
    await expect(page.getByRole("menu")).toBeVisible();
    // O clique que o dedo manda ao levantar não abriu a tarefa por baixo do
    // menu — nem chegou a ninguém.
    await expect(linha).not.toHaveAttribute("aria-current", "true");
    expect(await cliques(), "o clique do fim do toque longo não foi engolido").toBe(0);

    // Com o menu aberto, tocar NOUTRA tarefa só o fecha — não a abre. Uma que
    // não esteja debaixo do menu (senão o toque caía num item dele).
    const m = (await page.getByRole("menu").boundingBox())!;
    const linhas = page.locator("[data-tarefa]", { hasText: /TESTE e2e tarefa/ });
    let outra = linhas.nth(1);
    let t2 = { x: 0, y: 0 };
    for (let i = 1; i < (await linhas.count()); i += 1) {
      const b = await linhas
        .nth(i)
        .getByText(/TESTE e2e tarefa/)
        .first()
        .boundingBox();
      if (!b) continue;
      const x = b.x + Math.min(b.width / 2, 40);
      const y = b.y + b.height / 2;
      const noMenu =
        x >= m.x - 4 && x <= m.x + m.width + 4 && y >= m.y - 4 && y <= m.y + m.height + 4;
      if (!noMenu && y > 80 && y < (await topoDaBarraDeBaixo(page)) - 8) {
        outra = linhas.nth(i);
        t2 = { x, y };
        break;
      }
    }
    expect(t2.y, "não há outra tarefa à vista fora do menu").toBeGreaterThan(0);
    await page.touchscreen.tap(t2.x, t2.y);
    await page.waitForTimeout(800);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(outra, "o toque que fechou o menu abriu a outra tarefa").not.toHaveAttribute(
      "aria-current",
      "true",
    );

    // O toque longo no «⋯» com o menu dele já aberto deixa-o aberto (o «⋯»
    // alterna, e o toque longo abre — não fecha).
    const tres = linha.locator('[aria-haspopup="menu"]').first();
    await tocar(page, tres);
    await page.waitForTimeout(500);
    await expect(tres).toHaveAttribute("aria-expanded", "true");
    const b = (await tres.boundingBox())!;
    await toqueLongo(cdp, b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(600);
    await expect(tres, "o toque longo fechou o menu que já estava aberto").toHaveAttribute(
      "aria-expanded",
      "true",
    );
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
    await pararORelogioAoMeioDia(page);
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
    // Ao centro, e confirmado debaixo do dedo — ver `pararORelogioAoMeioDia`.
    const p = await pontoAoCentro(page, chip, (h) => Math.min(h / 2, 10));
    await toqueLongo(cdp, p.x, p.y);
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

/**
 * O MESMO, COM RATO, A 1440 — o clique que fecha um menu só fecha (revisão de
 * 14/11). Botão direito num dia abre o menu dele; o clique esquerdo NOUTRO dia
 * fechava-o e abria «Novo no calendário» lá. E no «⋯ Acções» das tarefas,
 * clicar noutra tarefa para fechar o menu abria-a.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * 9 · AS BARRAS DO «FAZER PROPOSTA» ENCOLHEM AO DESCER (15/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO antes, a 390 × 664: a descer, só 59 % do ecrã era formulário — o
 * cabeçalho, a barra dos passos, a barra de acção e a de destinos ficavam com
 * o resto. Ao DESCER: em cima só os passos (compactos); em baixo a de destinos
 * fica («Fica a barra de baixo») e a de acção só com o total «A pagar» e o
 * botão principal. Ao SUBIR, voltam inteiras. Tudo por `translate` — o
 * formulário não salta.
 */
const RASCUNHO_COM_TOTAL = {
  template: "decoracao",
  ref: "PO TESTE",
  clientNames: "TESTE Maria & Zé",
  eventType: "Casamento",
  eventDate: "12 de setembro de 2026",
  location: "TESTE Évora",
  guests: "80 pax",
  serviceGroups: [{ letter: "a)", title: "TESTE Decoração", items: [{ label: "Cerimónia" }] }],
  moodBoards: [{ title: "TESTE Cerimónia", annotation: "", images: [] }],
  budgetItems: ["TESTE Decoração da cerimónia"],
  budgetAmounts: [3000],
  budgetArtigos: ["flores"],
  coverImages: ["", ""],
  totalAmount: 3000,
  totalVatMode: "acrescer",
};

async function abrirOEstudioComTotal(page: Page, { rato = false }: { rato?: boolean } = {}) {
  const { id, naLista } = await pedidoDoDia(page);
  await vista(page, "pedidos");
  await page.evaluate(([chave, rascunho]) => localStorage.setItem(chave, rascunho), [
    `liquen-proposal-studio-${id}`,
    JSON.stringify(RASCUNHO_COM_TOTAL),
  ] as const);
  if (rato) await page.getByText(naLista).first().click();
  else await tocar(page, page.getByText(naLista).first());
  await expect(page.locator("nav[aria-label='Passos da proposta']")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1500);
}

/** O que se vê das barras, e quanto ecrã sobra para o formulário. */
async function asBarras(page: Page) {
  return page.evaluate(() => {
    const H = innerHeight;
    const topo = document.querySelector("[data-barra-do-topo]")!.getBoundingClientRect();
    const passos = document
      .querySelector("nav[aria-label='Passos da proposta']")!
      .getBoundingClientRect();
    const total = [...document.querySelectorAll<HTMLElement>("[data-total-da-barra]")].find(
      (e) => e.offsetParent !== null,
    );
    const accao = total?.closest(".bo-material")?.getBoundingClientRect() ?? null;
    const destinos = document
      .querySelector('nav[aria-label="Navegação do back office"]')!
      .getBoundingClientRect();
    const t = total?.getBoundingClientRect() ?? null;
    const cimaLivre = Math.max(0, topo.bottom, passos.bottom);
    const baixoLivre = Math.min(accao?.top ?? H, destinos.top);
    const estudio = document.querySelector<HTMLElement>('[class~="@container/estudio"]')!;
    return {
      estado: document.documentElement.getAttribute("data-barras"),
      topoDoCabecalho: topo.top,
      fundoDoCabecalho: topo.bottom,
      topoDosPassos: passos.top,
      fundoDosPassos: passos.bottom,
      total: total?.innerText.replace(/\s+/g, " ").trim() ?? null,
      totalAVista: !!t && t.top >= 0 && t.bottom <= H && t.width > 0,
      destinosAVista: destinos.top < H && destinos.bottom <= H + 1,
      fracaoLivre: (baixoLivre - cimaLivre) / H,
      // A posição do formulário NO DOCUMENTO: se uma barra o empurrasse, mudava.
      formularioNoDocumento: estudio.getBoundingClientRect().top + scrollY,
    };
  });
}

test.describe("9 · as barras do «Fazer proposta» encolhem ao descer, no iPhone", () => {
  test.beforeEach(async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
  });

  test("a descer encolhem (> 60 % de formulário, o total sempre à vista); a subir voltam", async ({
    page,
  }) => {
    const erros = errosDaConsola(page);
    const cdp = await page.context().newCDPSession(page);
    await abrirOEstudioComTotal(page);
    // No passo 2, que já tem o «anterior» na barra de acção.
    await tocar(
      page,
      page.locator("nav[aria-label='Passos da proposta']").getByRole("button").nth(1),
    );
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);

    const inteiras = await asBarras(page);
    expect(inteiras.estado, "o estúdio liga as barras que encolhem").toBe("inteiras");
    expect(inteiras.topoDoCabecalho).toBeGreaterThanOrEqual(0);
    expect(inteiras.total).toMatch(/A pagar\s*3\s?690,00\s€/);
    await expect(page.getByRole("button", { name: /^← / }).first()).toBeVisible();

    // O dedo sobe: a página desce.
    await deslizar(cdp, 200, 460, 200);
    await page.waitForTimeout(900);
    const encolhidas = await asBarras(page);
    expect(encolhidas.estado).toBe("encolhidas");
    expect(encolhidas.fundoDoCabecalho, "o cabeçalho saiu por cima").toBeLessThanOrEqual(0.5);
    expect(encolhidas.topoDosPassos, "os passos subiram ao topo").toBeLessThanOrEqual(0);
    expect(encolhidas.fundoDosPassos, "e ficaram compactos").toBeLessThanOrEqual(60);
    expect(encolhidas.totalAVista, "o total «A pagar» nunca sai").toBe(true);
    expect(encolhidas.total).toMatch(/A pagar\s*3\s?690,00\s€/);
    expect(encolhidas.destinosAVista, "a barra de destinos fica").toBe(true);
    await expect(page.getByRole("button", { name: /^Seguinte:/ }).first()).toBeVisible();
    // Só o essencial: o «anterior» sai da barra de acção.
    await expect(page.getByRole("button", { name: /^← / })).toHaveCount(0);
    expect(
      encolhidas.fracaoLivre,
      `formulário à vista: ${Math.round(encolhidas.fracaoLivre * 100)} % do ecrã`,
    ).toBeGreaterThan(0.6);

    // O dedo desce: a página sobe — e as barras voltam inteiras.
    await deslizar(cdp, 200, 200, 320);
    await page.waitForTimeout(900);
    const deVolta = await asBarras(page);
    expect(deVolta.estado).toBe("inteiras");
    expect(deVolta.topoDoCabecalho).toBeGreaterThanOrEqual(-0.5);
    await expect(page.getByRole("button", { name: /^← / }).first()).toBeVisible();
    // Encolher e voltar não empurrou o formulário: as duas medidas são da
    // página já descida (o cabeçalho do back office encolhe 8 px aos 24 px de
    // rolagem desde antes disto — é o `useDesceu`, e não estas barras).
    expect(
      Math.abs(deVolta.formularioNoDocumento - encolhidas.formularioNoDocumento),
      "as barras a encolher não mexem no formulário",
    ).toBeLessThanOrEqual(1);

    const larguras = await page.evaluate(() => ({
      documento: document.documentElement.scrollWidth,
      janela: innerWidth,
    }));
    expect(larguras.documento, "sem scroll de lado").toBeLessThanOrEqual(larguras.janela);
    expect(erros).toEqual([]);
  });

  test("com movimento reduzido, encolhem na mesma — sem animar", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const cdp = await page.context().newCDPSession(page);
    await abrirOEstudioComTotal(page);
    await deslizar(cdp, 200, 460, 200);
    await page.waitForTimeout(150);
    const b = await asBarras(page);
    expect(b.estado).toBe("encolhidas");
    // Sem transição a correr, 150 ms depois já está no sítio.
    expect(b.fundoDoCabecalho).toBeLessThanOrEqual(0.5);
    const duracao = await page
      .locator("[data-barra-do-topo]")
      .evaluate((h) => getComputedStyle(h).transitionProperty);
    expect(duracao).not.toContain("translate");
    expect(b.totalAVista).toBe(true);
  });

  /* ── REVISÃO DE 15/11 ────────────────────────────────────────────────────
     1. Os passos subiam ~61 px também quando ainda não tinham colado (a página
        a 30–160 px do topo) e ficavam soltos a meio do ecrã com um buraco por
        baixo. Mede-se a cada altura: nunca há buraco entre os passos e o
        formulário, e colados ficam no topo. */
  test("os passos nunca ficam soltos: a 45, 60, 100, 160 px e depois, estão sempre no sítio", async ({
    page,
  }) => {
    const erros = errosDaConsola(page);
    await abrirOEstudioComTotal(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    const medidas: { y: number; estado: string | null; topo: number; buraco: number }[] = [];
    for (const y of [45, 60, 100, 160, 260, 400]) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(700);
      medidas.push(
        await page.evaluate(() => {
          const nav = document.querySelector<HTMLElement>("[data-passos-da-proposta]")!;
          const r = nav.getBoundingClientRect();
          const seguinte = nav.nextElementSibling!.getBoundingClientRect();
          const mb = parseFloat(getComputedStyle(nav).marginBottom);
          return {
            y: Math.round(scrollY),
            estado: document.documentElement.getAttribute("data-barras"),
            topo: r.top,
            // O que fica entre o fundo dos passos e o que vem a seguir, além
            // da margem deles. Soltos, era o salto inteiro (~61 px).
            buraco: seguinte.top - r.bottom - mb,
          };
        }),
      );
    }
    for (const m of medidas) {
      expect(m.estado, `a ${m.y} px`).toBe("encolhidas");
      expect(m.buraco, `a ${m.y} px não há buraco por baixo dos passos`).toBeLessThanOrEqual(1);
      expect(m.topo, `a ${m.y} px os passos estão no ecrã`).toBeGreaterThanOrEqual(-8);
    }
    // Lá em baixo, colados ao topo.
    expect(medidas.at(-1)!.topo).toBeLessThanOrEqual(0.5);
    expect(erros).toEqual([]);
  });

  /* 2. A pastilha «Antes de enviar: Falta N» saía ao descer, e o botão
        principal ficava apagado sem dizer porquê. Uma falta que trava é um
        alarme: fica. */
  test("no passo 5 com uma falta, a pastilha «Antes de enviar» fica à vista ao descer", async ({
    page,
  }) => {
    const erros = errosDaConsola(page);
    const cdp = await page.context().newCDPSession(page);
    await abrirOEstudioComTotal(page);
    await tocar(
      page,
      page.locator("nav[aria-label='Passos da proposta']").getByRole("button").nth(4),
    );
    await page.waitForTimeout(1200);
    const pastilha = page.getByRole("button", { name: /^Antes de enviar: Falta/ });
    await expect(pastilha).toBeVisible();
    await deslizar(cdp, 200, 460, 200);
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-barras"))).toBe(
      "encolhidas",
    );
    await expect(pastilha, "a falta que trava continua à vista").toBeVisible();
    const caixa = (await pastilha.boundingBox())!;
    expect(caixa.y + caixa.height).toBeLessThanOrEqual(IPHONE_COM_BARRAS.height);
    expect(erros).toEqual([]);
  });

  /* 3. A região `aria-live` dos alarmes da gravação ficava em `display: none`
        com tudo bem — fora da árvore de acessibilidade, e o alarme chegava
        calado. Encolhida, a linha esconde-se só à vista: as regiões ficam. */
  test("encolhidas, as regiões que anunciam os alarmes da gravação continuam na árvore", async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    await abrirOEstudioComTotal(page);
    await deslizar(cdp, 200, 460, 200);
    await page.waitForTimeout(900);
    const regioes = await page.evaluate(() => {
      const naArvore = (el: Element | null) => {
        for (let e = el; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.display === "none" || cs.visibility === "hidden") return false;
        }
        return true;
      };
      return {
        estado: document.documentElement.getAttribute("data-barras"),
        preco: [...document.querySelectorAll("[data-alarme-do-preco][aria-live]")].map(naArvore),
        gravacao: [...document.querySelectorAll("[data-estado-da-gravacao][aria-live]")].map(
          naArvore,
        ),
        // Todas as regiões que a barra de acção tem, sejam quais forem.
        naBarra: [
          ...([...document.querySelectorAll<HTMLElement>("[data-total-da-barra]")]
            .find((e) => e.offsetParent !== null)
            ?.closest(".bo-material")
            ?.querySelectorAll("[aria-live]") ?? []),
        ].map(naArvore),
        // E à vista não ocupam lugar nenhum.
        largura: Math.max(
          0,
          ...[...document.querySelectorAll("[data-acessorio-so-a-vista]")].map(
            (e) => e.getBoundingClientRect().width,
          ),
        ),
      };
    });
    expect(regioes.estado).toBe("encolhidas");
    expect(regioes.naBarra.length, "a barra tem regiões que anunciam").toBeGreaterThan(0);
    expect(regioes.naBarra.every(Boolean), "nenhuma fica fora da árvore").toBe(true);
    expect(regioes.preco.length, "a região do preço existe sempre").toBeGreaterThan(0);
    expect(regioes.gravacao.length, "a região da gravação existe sempre").toBeGreaterThan(0);
    expect(regioes.preco.every(Boolean), "e continua na árvore").toBe(true);
    expect(regioes.gravacao.every(Boolean), "e continua na árvore").toBe(true);
    expect(regioes.largura).toBeLessThanOrEqual(1);
  });

  /* 4. e 5. Com o foco no «← anterior», encolher escondia-o e o foco caía no
        `body`; e o cabeçalho escondido continuava no Tab e no leitor de ecrã.
        O foco que segura é o do TECLADO (`:focus-visible`): chega-se lá com
        Tab, como quem usa um teclado ligado ao tablet. */
  test("com o foco do teclado no «anterior» não encolhem; e escondido, o cabeçalho fica inerte", async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    await abrirOEstudioComTotal(page);
    await tocar(
      page,
      page.locator("nav[aria-label='Passos da proposta']").getByRole("button").nth(1),
    );
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    const anterior = page.getByRole("button", { name: /^← / }).first();
    await anterior.focus();
    // Sai e volta pelo teclado: o foco passa a ser do teclado (`:focus-visible`).
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(700);
    const comFoco = await page.evaluate(() => ({
      estado: document.documentElement.getAttribute("data-barras"),
      focado: document.activeElement?.textContent ?? "",
      doTeclado: document.activeElement?.matches(":focus-visible") ?? false,
    }));
    expect(comFoco.focado).toMatch(/←/);
    expect(comFoco.doTeclado, "o foco veio do teclado").toBe(true);
    expect(comFoco.estado, "com o foco do teclado num acessório, não encolhem").toBe("inteiras");
    await expect(anterior).toBeVisible();

    // O foco sai; o gesto seguinte encolhe — e o cabeçalho fica inerte.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    // Do topo outra vez: a 500 px a página do passo 2 pode já estar no fundo,
    // e lá em baixo as barras não decidem (o fundo não é gesto).
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    await deslizar(cdp, 200, 460, 200);
    await page.waitForTimeout(900);
    const semFoco = await page.evaluate(() => ({
      estado: document.documentElement.getAttribute("data-barras"),
      inerte: document.querySelector("[data-barra-do-topo]")!.hasAttribute("inert"),
    }));
    expect(semFoco.estado).toBe("encolhidas");
    expect(semFoco.inerte, "escondido, fora do Tab e do leitor de ecrã").toBe(true);
    await deslizar(cdp, 200, 200, 320);
    await page.waitForTimeout(900);
    expect(
      await page.evaluate(() =>
        document.querySelector("[data-barra-do-topo]")!.hasAttribute("inert"),
      ),
      "ao subir, volta",
    ).toBe(false);
  });

  /* 2.ª revisão de 15/11: no Chrome do Android um TOQUE dá o foco ao botão, e
     rolar não o tira. Com o foco a segurar as barras fosse de onde fosse,
     depois de tocar no «← anterior» nunca mais encolhiam. */
  test("depois de TOCAR no «anterior», as barras continuam a encolher ao descer", async ({
    page,
  }) => {
    const erros = errosDaConsola(page);
    const cdp = await page.context().newCDPSession(page);
    await abrirOEstudioComTotal(page);
    // No passo 3: o «anterior» leva ao 2, que também o tem — o botão fica.
    await tocar(
      page,
      page.locator("nav[aria-label='Passos da proposta']").getByRole("button").nth(2),
    );
    await page.waitForTimeout(1000);
    await tocar(page, page.getByRole("button", { name: /^← / }).first());
    await page.waitForTimeout(1200);
    const focado = await page.evaluate(() => ({
      texto: document.activeElement?.textContent ?? "",
      doTeclado: document.activeElement?.matches(":focus-visible") ?? false,
    }));
    // O cenário do defeito: o botão tocado ficou com o foco, sem ser do teclado.
    expect(focado.texto, "o toque deu o foco ao «anterior»").toMatch(/←/);
    expect(focado.doTeclado).toBe(false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    for (let i = 0; i < 3; i += 1) {
      await deslizar(cdp, 200, 460, 300);
      await page.waitForTimeout(500);
    }
    expect(
      await page.evaluate(() => document.documentElement.getAttribute("data-barras")),
      "um foco de toque não segura as barras",
    ).toBe("encolhidas");
    expect(erros).toEqual([]);
  });

  /* 2.ª revisão de 15/11: a região da gravação trocava `aria-live`
     polite→assertive no instante do alarme (há leitores que anunciam com o
     valor antigo). Agora são duas fixas: nenhuma muda de atributo, e o alarme
     cai na `assertive`. */
  test("o alarme da gravação cai na região `assertive`, e nenhuma região troca de `aria-live`", async ({
    page,
  }) => {
    await abrirOEstudioComTotal(page);
    await page.evaluate(() => {
      const w = window as unknown as { __mudancasDoAriaLive: string[] };
      w.__mudancasDoAriaLive = [];
      const obs = new MutationObserver((ms) =>
        ms.forEach((m) =>
          w.__mudancasDoAriaLive.push(
            `${m.oldValue}→${(m.target as Element).getAttribute("aria-live")}`,
          ),
        ),
      );
      obs.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ["aria-live"],
      });
    });
    // O servidor deixa de aceitar o rascunho: fica «só neste computador».
    await page.route("**/proposta-rascunho**", (r) =>
      r.request().method() === "GET"
        ? r.continue()
        : r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"TESTE"}' }),
    );
    const campo = page.locator("main textarea, main input[type='text']").first();
    await campo.scrollIntoViewIfNeeded();
    await campo.fill("TESTE alarme da gravação");
    const alarme = page.locator("[data-estado-da-gravacao][aria-live='assertive']");
    await expect(alarme).toContainText(/neste computador|não chegou|por guardar/, {
      timeout: 20_000,
    });
    const regioes = await page.evaluate(() =>
      [...document.querySelectorAll("[data-estado-da-gravacao]")].map((e) => ({
        live: e.getAttribute("aria-live"),
        texto: e.textContent ?? "",
      })),
    );
    expect(
      regioes
        .filter((r) => r.live === "polite")
        .every((r) => !/neste computador|não chegou/.test(r.texto)),
      "o alarme não vai pela região educada",
    ).toBe(true);
    expect(
      await page.evaluate(
        () => (window as unknown as { __mudancasDoAriaLive: string[] }).__mudancasDoAriaLive,
      ),
      "nenhuma região troca de `aria-live`",
    ).toEqual([]);
  });
});

/* 2.ª revisão de 15/11: num TABLET de toque (≥ 640 px), no passo 5 com nada a
   travar e o painel fechado, o grupo da pastilha/idioma/canal/PDF ficava vazio
   ao descer — e continuava a somar um `gap` de 8 px na barra de acção. */
test.describe("9 · tablet de toque, passo 5: o grupo vazio sai com os filhos", () => {
  test.use({ viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
  });

  test("encolhidas, nenhum item da barra de acção fica vazio a ocupar um intervalo", async ({
    page,
  }) => {
    // Desenhar o PDF final no servidor de desenvolvimento leva o seu tempo.
    test.setTimeout(180_000);
    const cdp = await page.context().newCDPSession(page);
    await abrirOEstudioComTotal(page);
    await tocar(
      page,
      page.locator("nav[aria-label='Passos da proposta']").getByRole("button").nth(4),
    );
    await page.waitForTimeout(1200);
    // Nada a travar: a única falta deste rascunho é ver o PDF final — vê-se,
    // como ela o faz, e confirma-se.
    const descarregar = page.getByRole("button", { name: "Descarregar o PDF final" });
    await tocarAoCentro(page, descarregar);
    // O PDF abre por cima, página a página; fecha-se e confirma-se.
    const oPdf = page.getByRole("dialog", { name: "O PDF final" });
    await expect(oPdf).toBeVisible({ timeout: 120_000 });
    await tocar(page, oPdf.getByRole("button", { name: "Fechar" }));
    await expect(oPdf).toBeHidden();
    const confirmar = page.getByRole("checkbox", { name: "Vi a proposta e está tudo certo" });
    await tocarAoCentro(page, page.getByText("Vi a proposta e está tudo certo"));
    await expect(confirmar).toBeChecked();
    await expect(page.getByRole("button", { name: /^Antes de enviar: .*pronto/ })).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    await deslizar(cdp, 300, 700, 400);
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const total = [...document.querySelectorAll<HTMLElement>("[data-total-da-barra]")].find(
        (e) => e.offsetParent !== null,
      );
      const barra = total?.closest(".bo-material");
      // Todos os itens de flex da barra: um item visível sem nada visível lá
      // dentro é um intervalo a mais.
      const vazios: string[] = [];
      for (const el of barra?.querySelectorAll<HTMLElement>("*") ?? []) {
        const pai = el.parentElement;
        if (!(el instanceof HTMLElement)) continue;
        if (!pai || !/flex/.test(getComputedStyle(pai).display)) continue;
        if (getComputedStyle(el).display === "none" || el.offsetParent === null) continue;
        if (el.matches("[aria-live], [data-acessorio-so-a-vista], .sr-only")) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0) continue;
        vazios.push(el.outerHTML.slice(0, 120));
      }
      const pastilha = document.querySelector("[aria-label^='Antes de enviar']");
      return {
        estado: document.documentElement.getAttribute("data-barras"),
        vazios,
        pastilha: pastilha?.getAttribute("aria-label") ?? "",
      };
    });
    expect(r.estado).toBe("encolhidas");
    expect(r.vazios, "nenhum grupo vazio a somar intervalo").toEqual([]);
  });
});

for (const tamanho of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  // Revisão de 15/11, n.º 6: uma janela de computador ESTREITA (rato) também
  // não muda — o telemóvel conhece-se pelo toque, não só pela largura.
  { width: 600, height: 800 },
]) {
  test.describe(`9 · no computador (rato, ${tamanho.width} px), nada muda`, () => {
    test.use({ viewport: tamanho, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
    test.beforeEach(async ({ page }) => {
      exigirLogin(await entrarNoBackOffice(page));
    });

    test("a descer, o cabeçalho e os passos ficam onde estavam", async ({ page }) => {
      const erros = errosDaConsola(page);
      await abrirOEstudioComTotal(page, { rato: true });
      await page.mouse.move(tamanho.width / 2, tamanho.height / 2);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(900);
      const b = await asBarras(page);
      expect(b.estado, "fora do telemóvel o atributo nem existe").toBeNull();
      expect(b.topoDoCabecalho).toBeGreaterThanOrEqual(-0.5);
      expect(b.topoDosPassos).toBeGreaterThanOrEqual(b.fundoDoCabecalho - 1);
      expect(b.totalAVista).toBe(true);
      expect(erros).toEqual([]);
    });
  });
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * 10 · UM TOQUE NUMA MARCAÇÃO ABRE O DETALHE, E NÃO «REMOVER …?» (15/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O toque é a forma de perguntar o que é aquilo. «Remover» passa a estar lá
 * dentro, pela pergunta e pela Reciclagem de sempre. O toque longo continua a
 * abrir o menu (caso 6), e arrastar para outro dia continua a mover.
 * NADA SE APAGA aqui: a pergunta é cancelada.
 */
async function verDia(page: Page) {
  const vistaDia = page
    .getByRole("radio", { name: "Dia", exact: true })
    .or(page.getByRole("tab", { name: "Dia", exact: true }))
    .or(page.getByRole("button", { name: "Dia", exact: true }))
    .first();
  await tocar(page, vistaDia);
  await page.waitForTimeout(1000);
}

test.describe("10 · a marcação no iPhone", () => {
  test.beforeEach(async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
  });

  test("o toque abre o detalhe; «Remover» lá dentro pergunta; «Cancelar» não apaga", async ({
    page,
  }) => {
    const erros = errosDaConsola(page);
    await pararORelogioAoMeioDia(page);
    await garantirMarcacaoDeHoje(page);
    await vista(page, "calendario");
    await verDia(page);
    const chip = page.getByRole("button", { name: new RegExp(`^Abrir Reunião: ${MARCACAO}`) });
    // Ao centro, e confirmado debaixo do dedo — ver `pararORelogioAoMeioDia`.
    await tocarAoCentro(page, chip.first());
    await page.waitForTimeout(700);

    const detalhe = page.getByRole("dialog", { name: new RegExp(MARCACAO) });
    await expect(detalhe).toBeVisible();
    await expect(detalhe.getByText("15:00")).toBeVisible();
    await expect(page.getByText(/do calendário\?/)).toHaveCount(0);
    // A folha nasce inteira, acima do fundo do ecrã.
    const caixa = (await detalhe.boundingBox())!;
    expect(caixa.y + caixa.height).toBeLessThanOrEqual(IPHONE_COM_BARRAS.height + 1);

    await tocar(page, detalhe.getByRole("button", { name: /^Remover$/ }));
    const pergunta = page.getByRole("dialog", { name: new RegExp(`Remover «${MARCACAO}»`) });
    await expect(pergunta).toBeVisible();
    await expect(pergunta.getByText(/Reciclagem/)).toBeVisible();
    await tocar(page, pergunta.getByRole("button", { name: /^Cancelar$/ }));
    await page.waitForTimeout(600);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(chip.first()).toBeVisible();

    const larguras = await page.evaluate(() => ({
      documento: document.documentElement.scrollWidth,
      janela: innerWidth,
    }));
    expect(larguras.documento).toBeLessThanOrEqual(larguras.janela);
    expect(erros).toEqual([]);
  });

  test("no mês, a linha da marcação no resumo do dia também abre o detalhe", async ({ page }) => {
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
    await page.waitForTimeout(1000);
    await tocar(
      page,
      page.getByRole("button", { name: new RegExp(`^Abrir Reunião: ${MARCACAO}`) }).first(),
    );
    await expect(page.getByRole("dialog", { name: new RegExp(MARCACAO) })).toBeVisible();
    await expect(page.getByText(/do calendário\?/)).toHaveCount(0);
    expect(erros).toEqual([]);
  });
});

test.describe("com rato, a 1440: o clique que fecha um menu só fecha", () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  });
  test.beforeEach(async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
  });

  test("calendário: botão direito num dia, clique noutro — fecha, e não cria nada", async ({
    page,
  }) => {
    const erros = errosDaConsola(page);
    await vista(page, "calendario");
    await page
      .getByRole("radio", { name: "Mês", exact: true })
      .or(page.getByRole("tab", { name: "Mês", exact: true }))
      .or(page.getByRole("button", { name: "Mês", exact: true }))
      .first()
      .click();
    await page.waitForTimeout(800);
    const dia = page.locator(`[role="gridcell"][data-dia="${diaVazioDoMes()}"]`);
    await dia.click({ button: "right" });
    await expect(page.getByRole("menu")).toBeVisible();
    const alvo = await diaVazioForaDoMenu(page, diaVazioDoMes());
    const outro = page.locator(`[role="gridcell"][data-dia="${alvo.dia}"]`);
    await page.mouse.click(alvo.x, alvo.y);
    await page.waitForTimeout(600);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("dialog"), "o clique que fechou o menu abriu o dia").toHaveCount(0);
    // E o clique seguinte é um clique: abre o «Novo no calendário».
    await outro.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(erros).toEqual([]);
  });

  test("tarefas: «⋯ Acções» aberto, clique noutra tarefa — fecha, e não a abre", async ({
    page,
  }) => {
    const erros = errosDaConsola(page);
    await garantirTarefas(page, 2);
    await vista(page, "tarefas");
    const linhas = page.locator("[data-tarefa]", { hasText: /TESTE e2e tarefa/ });
    const primeira = linhas.first();
    const outra = linhas.nth(1);
    await primeira.hover();
    const tres = primeira.locator('[aria-haspopup="menu"]').first();
    await tres.click();
    await expect(tres).toHaveAttribute("aria-expanded", "true");
    await outra
      .getByText(/TESTE e2e tarefa/)
      .first()
      .click();
    await page.waitForTimeout(600);
    await expect(tres).toHaveAttribute("aria-expanded", "false");
    await expect(outra, "o clique que fechou o menu abriu a outra tarefa").not.toHaveAttribute(
      "aria-current",
      "true",
    );
    await outra
      .getByText(/TESTE e2e tarefa/)
      .first()
      .click();
    await expect(outra).toHaveAttribute("aria-current", "true");
    expect(erros).toEqual([]);
  });
});

const A_ARRASTAR = "TESTE e2e — marcação para arrastar";

test.describe("10 · com rato, a 1440: clicar abre o detalhe, e arrastar continua a mover", () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  });
  test.beforeEach(async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
  });

  test("o clique abre o detalhe; arrastar a etiqueta para outro dia move-a (e volta)", async ({
    page,
  }) => {
    const erros = errosDaConsola(page);
    // Dois dias deste mês longe de hoje E do «dia vazio» que o caso 6 usa
    // (um dia com marcação deixa de ser vazio, e o toque curto lá abre o
    // resumo do dia em vez de «acrescentar»).
    const d = new Date();
    const base = d.getDate() > 15 ? 8 : 20;
    const doMes = (n: number) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
    const de = doMes(base);
    const para = doMes(base + 1);
    // A marcação de arrastar vive no dia `de` ou no `para`; se estiver noutro
    // (uma corrida antiga), volta ao `de` pela mesma rota que o arrasto usa.
    const lista = (await (await page.request.get("/api/calendario")).json()) as {
      id: string;
      title: string;
      date: string;
    }[];
    const existente = lista.find((e) => e.title === A_ARRASTAR);
    if (existente && existente.date !== de && existente.date !== para) {
      const r = await page.request.patch(`/api/calendario/${existente.id}`, {
        data: { date: de },
      });
      expect(r.ok(), `não voltou ao dia ${de}: ${r.status()}`).toBe(true);
    }
    if (!existente) {
      const r = await page.request.post("/api/calendario", {
        data: { title: A_ARRASTAR, kind: "evento", time: "", note: "", date: de },
      });
      expect(r.ok(), `não gravou a marcação: ${r.status()}`).toBe(true);
    }
    const ondeEsta = async () =>
      (
        (await (await page.request.get("/api/calendario")).json()) as {
          title: string;
          date: string;
        }[]
      ).find((e) => e.title === A_ARRASTAR)?.date;

    await vista(page, "calendario");
    await page
      .getByRole("radio", { name: "Mês", exact: true })
      .or(page.getByRole("button", { name: "Mês", exact: true }))
      .first()
      .click();
    await page.waitForTimeout(600);

    const dataInicial = (await ondeEsta())!;
    const destino = dataInicial === para ? de : para;
    const chip = page
      .locator(`[role="gridcell"][data-dia="${dataInicial}"]`)
      .getByRole("button", { name: new RegExp(`^Abrir Evento: ${A_ARRASTAR}`) });

    // O clique abre o detalhe, e não a pergunta.
    await chip.click();
    const detalhe = page.getByRole("dialog", { name: new RegExp(A_ARRASTAR) });
    await expect(detalhe).toBeVisible();
    await expect(page.getByText(/do calendário\?/)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Arrastar continua a mover.
    await chip.dragTo(page.locator(`[role="gridcell"][data-dia="${destino}"]`));
    await expect.poll(ondeEsta, { timeout: 10_000 }).toBe(destino);
    // O ecrã também já sabe (o «Anular» chegou, e com ele a versão nova da
    // marcação que o segundo arrasto vai mandar ao servidor).
    await expect(page.getByRole("button", { name: "Anular" })).toBeVisible();
    await page.waitForTimeout(800);
    // E volta ao sítio, pelo mesmo gesto.
    await page
      .locator(`[role="gridcell"][data-dia="${destino}"]`)
      .getByRole("button", { name: new RegExp(`^Abrir Evento: ${A_ARRASTAR}`) })
      .dragTo(page.locator(`[role="gridcell"][data-dia="${dataInicial}"]`));
    await expect.poll(ondeEsta, { timeout: 10_000 }).toBe(dataInicial);
    expect(erros).toEqual([]);
  });
});
