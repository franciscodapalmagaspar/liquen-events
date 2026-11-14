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

/**
 * O MESMO, COM RATO, A 1440 — o clique que fecha um menu só fecha (revisão de
 * 14/11). Botão direito num dia abre o menu dele; o clique esquerdo NOUTRO dia
 * fechava-o e abria «Novo no calendário» lá. E no «⋯ Acções» das tarefas,
 * clicar noutra tarefa para fechar o menu abria-a.
 */
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
