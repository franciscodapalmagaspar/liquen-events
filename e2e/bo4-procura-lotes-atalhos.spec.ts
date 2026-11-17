import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { ESTADO_ADMIN } from "./estado-admin";
import { entrarNoBackOffice, esperarQueACortinaSaia, exigirLogin } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * BO 4 — A PROCURA ⌘K EM TUDO, AS ACÇÕES EM LOTE E OS ATALHOS, NUM BROWSER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que o jsdom não mede: o teclado de verdade (⌘K, ⌘A, Esc, «G»+letra), o
 * dedo no telemóvel (tocar em «Selecionar» e depois nas tarefas), a página sem
 * deslocação horizontal a 390/768/1440 em claro e escuro, e a consola limpa.
 *
 * Corre contra `next dev` (ver `playwright.dados.config.ts`) porque SEMEIA:
 * três tarefas, uma marcação e dois pedidos, todos com «TESTE BO4» no nome —
 * nada de clientes de verdade nas capturas — e apaga-os no fim.
 */

const MARCA = String(Date.now()).slice(-5);
const T = (n: number) => `TESTE BO4 tarefa ${n} ${MARCA}`;
const MARCACAO = `TESTE BO4 prova ${MARCA}`;
/** A marca vem logo a seguir ao prefixo: a procura é sempre por `PREFIXO_DOS_PEDIDOS`,
 *  nunca por cinco algarismos soltos (que podiam casar com um telefone). */
const PREFIXO_DOS_PEDIDOS = `TESTE BO4 ${MARCA}`;
const PEDIDO = (n: string) => `${PREFIXO_DOS_PEDIDOS} ${n}`;

const semeado = { tarefas: [] as string[], marcacoes: [] as string[], pedidos: [] as string[] };

async function contexto(
  browser: import("@playwright/test").Browser,
  opcoes: { largura: number; altura: number; esquema: "light" | "dark"; toque?: boolean },
): Promise<{ ctx: BrowserContext; page: Page; erros: string[] }> {
  const ctx = await browser.newContext({
    storageState: ESTADO_ADMIN,
    viewport: { width: opcoes.largura, height: opcoes.altura },
    colorScheme: opcoes.esquema,
    hasTouch: !!opcoes.toque,
    isMobile: !!opcoes.toque,
  });
  // O escuro desta casa não segue o sistema por omissão (pedido dela: «eu
  // quero o fundo branco») — escolhe-se, e a escolha viaja num cookie que o
  // servidor lê. Ver `ui/aparencia.ts` e `o-modo-escuro-existe.spec.ts`.
  if (opcoes.esquema === "dark") {
    await ctx.addCookies([
      { name: "bo-aparencia", value: "escuro", domain: "localhost", path: "/" },
    ]);
  }
  const page = await ctx.newPage();
  // O selo do `next dev` é um botão fixo no canto: fora das capturas.
  // Depois de haver documento: num separador novo o init corre antes dele.
  await page.addInitScript(() => {
    const por = () => {
      const e = document.createElement("style");
      e.textContent = "nextjs-portal{display:none !important}";
      (document.head ?? document.documentElement)?.appendChild(e);
    };
    if (document.documentElement) por();
    else document.addEventListener("DOMContentLoaded", por, { once: true });
  });
  const erros: string[] = [];
  page.on("pageerror", (e) =>
    erros.push(`pageerror: ${e.message} @ ${(e.stack ?? "").split("\n").slice(1, 4).join(" | ")}`),
  );
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(`console: ${m.text()}`);
  });
  return { ctx, page, erros };
}

async function abrir(page: Page, vista: string) {
  await page.goto(`/orcamento/admin?v=${vista}`);
  // O sinal de que a página hidratou é a classe do `body` (ver o `AGENTS.md`).
  await page.waitForFunction(() => document.body.classList.contains("admin-mode"));
  await esperarQueACortinaSaia(page);
}

async function semDeslocacaoHorizontal(page: Page, onde: string) {
  const { largura, janela } = await page.evaluate(() => ({
    largura: document.documentElement.scrollWidth,
    janela: document.documentElement.clientWidth,
  }));
  expect(
    largura,
    `${onde}: a página rola para o lado (${largura} > ${janela})`,
  ).toBeLessThanOrEqual(janela);
}

const MOD = process.platform === "darwin" ? "Meta" : "Control";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  const { ctx, page } = await contexto(browser, { largura: 1440, altura: 900, esquema: "light" });
  exigirLogin(await entrarNoBackOffice(page));
  for (const [n, extra] of [
    [1, { dueDate: "2099-01-10" }],
    [2, {}],
    [3, { priority: "alta" }],
  ] as const) {
    const r = await page.request.post("/api/tarefas", {
      data: { title: T(n), priority: "normal", ...extra },
    });
    expect(r.ok(), `semear a tarefa ${n}`).toBe(true);
    semeado.tarefas.push((await r.json()).id);
  }
  const m = await page.request.post("/api/calendario", {
    data: { title: MARCACAO, date: "2099-03-12", kind: "reuniao", time: "15:30" },
  });
  expect(m.ok(), "semear a marcação").toBe(true);
  semeado.marcacoes.push((await m.json()).id);
  for (const nome of ["Ana", "Bruno"]) {
    const r = await page.request.post("/api/orcamento", {
      data: {
        form: {
          name: PEDIDO(nome),
          email: `teste.bo4.${nome.toLowerCase()}@example.pt`,
          phone: "912345678",
          category: "particulares",
          eventType: "casamentos",
          eventName: "Casamento",
          date: "2099-06-10",
          guests: 80,
          location: "Lugar de teste",
        },
        website: "",
        submissionId: `e2e-bo4-${nome}-${MARCA}`,
      },
    });
    expect(r.ok(), `semear o pedido ${nome} (${r.status()})`).toBe(true);
    semeado.pedidos.push((await r.json()).id);
  }
  await ctx.close();
});

test.afterAll(async ({ browser }) => {
  const { ctx, page } = await contexto(browser, { largura: 1440, altura: 900, esquema: "light" });
  for (const id of semeado.tarefas)
    await page.request.delete(`/api/tarefas/${id}`).catch(() => null);
  for (const id of semeado.marcacoes)
    await page.request.delete(`/api/calendario/${encodeURIComponent(id)}`).catch(() => null);
  for (const id of semeado.pedidos)
    await page.request.delete(`/api/orcamento/${id}`).catch(() => null);
  await ctx.close();
});

test("⌘K procura uma marcação e uma tarefa que já estão na memória, e abre-as", async ({
  browser,
}, info) => {
  const { ctx, page, erros } = await contexto(browser, {
    largura: 1440,
    altura: 900,
    esquema: "light",
  });
  await abrir(page, "tarefas");
  await expect(page.getByText(T(1)).first()).toBeVisible();
  // O calendário chega pelo aquecimento em ociosidade; abrir a vista garante-o.
  await page.keyboard.press("g");
  await page.keyboard.press("a");
  await expect(page.getByRole("heading", { name: "Calendário", level: 1 })).toBeVisible();
  await page.waitForTimeout(800);

  const pedidos: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) pedidos.push(r.url());
  });
  await page.keyboard.press(`${MOD}+k`);
  const campo = page.getByRole("combobox", { name: "Pesquisar ou navegar" });
  await expect(campo).toBeFocused();
  await campo.fill(`prova ${MARCA}`);
  const opcao = page.getByRole("option", { name: new RegExp(MARCACAO) });
  await expect(opcao).toBeVisible();
  await page.screenshot({ path: info.outputPath("paleta-marcacao-1440.png") });
  expect(pedidos, "a procura não pode ir ao servidor").toEqual([]);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: new RegExp(MARCACAO) })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press(`${MOD}+k`);
  await campo.fill(`tarefa 2 ${MARCA}`);
  await page.getByRole("option", { name: new RegExp(T(2)) }).click();
  await expect(page.getByRole("heading", { name: "Tarefas", level: 1 })).toBeVisible();
  await expect(page.locator("[data-tarefa][aria-current]")).toContainText(T(2));
  expect(erros).toEqual([]);
  await ctx.close();
});

test("os atalhos: «G»+letra, «/» na vista, e a folha mostra os escondidos", async ({
  browser,
}, info) => {
  const { ctx, page, erros } = await contexto(browser, {
    largura: 1440,
    altura: 900,
    esquema: "light",
  });
  await abrir(page, "overview");
  for (const [letra, titulo] of [
    ["d", "Pagamentos"],
    ["i", "Temas"],
    ["m", "Material"],
    ["c", "Propostas Aceites"],
    ["f", "Fazer proposta"],
    ["r", "Propostas"],
  ] as const) {
    await page.keyboard.press("g");
    await page.keyboard.press(letra);
    await expect(page.getByRole("heading", { name: titulo, level: 1, exact: true })).toBeVisible();
  }
  // Nas Propostas, o «/» foca a procura DAS PROPOSTAS.
  await page.waitForTimeout(500);
  await page.keyboard.press("/");
  await expect(page.getByLabel("Procurar propostas")).toBeFocused();
  await page.keyboard.press("Escape");
  await page
    .locator("body")
    .click({ position: { x: 5, y: 5 } })
    .catch(() => {});
  await page.keyboard.press("Shift+?");
  const folha = page.getByRole("dialog", { name: "Atalhos de teclado" });
  await expect(folha).toBeVisible();
  for (const t of ["Biblioteca de temas", "Anterior e seguinte", "Eliminar a tarefa"]) {
    await expect(folha.getByText(t, { exact: true })).toBeVisible();
  }
  await page.screenshot({ path: info.outputPath("atalhos-1440.png") });
  expect(erros).toEqual([]);
  await ctx.close();
});

/** O que o servidor diz de uma tarefa — o ecrã não chega para provar uma gravação. */
async function tarefaNoServidor(page: Page, id: string) {
  const r = await page.request.get("/api/tarefas");
  const lista = (await r.json()) as { id: string; dueDate?: string; done?: boolean }[];
  return lista.find((t) => t.id === id);
}
async function pedidoNoServidor(page: Page, id: string) {
  const r = await page.request.get(`/api/orcamento/${id}`);
  return (await r.json()) as { archived?: boolean };
}

test("Tarefas: ⌘+clique escolhe, «Adiar uma semana» e «Anular» — no ecrã e no servidor", async ({
  browser,
}, info) => {
  const { ctx, page, erros } = await contexto(browser, {
    largura: 1440,
    altura: 900,
    esquema: "light",
  });
  await abrir(page, "tarefas");
  const titulo = (n: number) => page.getByRole("button", { name: new RegExp(`«${T(n)}»`) });
  await expect(titulo(1)).toBeVisible();
  const antes = (await tarefaNoServidor(page, semeado.tarefas[0]))?.dueDate;
  await titulo(1).click({ modifiers: [MOD] });
  await titulo(3).click({ modifiers: [MOD] });
  const barra = page.getByRole("toolbar", { name: "Ações nas tarefas selecionadas" });
  await expect(barra.getByText("2 selecionadas")).toBeVisible();
  await page.screenshot({ path: info.outputPath("tarefas-lote-1440.png") });
  await barra.getByRole("button", { name: "Adiar uma semana" }).click();
  await expect(page.getByText("2 tarefas adiadas uma semana.")).toBeVisible();
  await expect
    .poll(async () => (await tarefaNoServidor(page, semeado.tarefas[0]))?.dueDate?.slice(0, 10))
    .toBe("2099-01-17");
  await page.getByRole("button", { name: "Anular" }).click();
  await expect(page.getByText("Anulado.")).toBeVisible();
  await expect
    .poll(async () => (await tarefaNoServidor(page, semeado.tarefas[0]))?.dueDate)
    .toBe(antes);

  // ⌘A e Esc com o foco onde ficou (sem clicar no título da página antes).
  await page.keyboard.press(`${MOD}+a`);
  await expect(barra).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(barra).toHaveCount(0);
  expect(erros).toEqual([]);
  await ctx.close();
});

test("Pedidos: caixa marcada → ⌘A e Esc, e «Arquivar (N)» com «Anular» — no ecrã e no servidor", async ({
  browser,
}, info) => {
  const { ctx, page, erros } = await contexto(browser, {
    largura: 1440,
    altura: 900,
    esquema: "light",
  });
  await abrir(page, "pedidos");
  await page.getByLabel("Procurar pedidos por nome, email, local ou ID").fill(PREFIXO_DOS_PEDIDOS);
  await expect(page.getByText(PEDIDO("Ana")).first()).toBeVisible();
  // Marca uma caixa (o foco fica NELA) e é daí que vem o ⌘A — o gesto real.
  await page.getByRole("checkbox", { name: `Selecionar pedido de ${PEDIDO("Ana")}` }).click();
  await expect(page.getByText(/^1 selecionado$/)).toBeVisible();
  await page.keyboard.press(`${MOD}+a`);
  await expect(page.getByText(/^2 selecionados$/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText(/selecionados?$/)).toHaveCount(0);
  await page.getByRole("checkbox", { name: `Selecionar pedido de ${PEDIDO("Bruno")}` }).click();
  await page.keyboard.press(`${MOD}+a`);
  await page.screenshot({ path: info.outputPath("pedidos-lote-1440.png") });
  await page.getByRole("button", { name: "Arquivar (2)" }).click();
  await expect(page.getByText("2 pedidos arquivados.")).toBeVisible();
  await expect(page.getByText(PEDIDO("Ana"))).toHaveCount(0);
  for (const id of semeado.pedidos)
    await expect.poll(async () => (await pedidoNoServidor(page, id)).archived).toBe(true);
  await page.getByRole("button", { name: "Anular" }).click();
  await expect(page.getByText(PEDIDO("Ana")).first()).toBeVisible();
  for (const id of semeado.pedidos)
    await expect.poll(async () => (await pedidoNoServidor(page, id)).archived ?? false).toBe(false);
  expect(erros).toEqual([]);
  await ctx.close();
});

test("Pedidos: restaurar os arquivados volta à lista normal — no ecrã e no servidor", async ({
  browser,
}) => {
  const { ctx, page, erros } = await contexto(browser, {
    largura: 1440,
    altura: 900,
    esquema: "light",
  });
  for (const id of semeado.pedidos)
    await page.request.patch(`/api/orcamento/${id}`, { data: { archived: true } });
  await abrir(page, "pedidos");
  const botao = page.getByRole("button", { name: /^Arquivados · \d+$/ });
  const quantos = Number((await botao.textContent())?.match(/\d+/)?.[0] ?? 0);
  await botao.click();
  await page.getByLabel("Procurar pedidos por nome, email, local ou ID").fill(PREFIXO_DOS_PEDIDOS);
  await page.getByRole("checkbox", { name: `Selecionar pedido de ${PEDIDO("Ana")}` }).click();
  await page.keyboard.press(`${MOD}+a`);
  await page.getByRole("button", { name: "Restaurar (2)" }).click();
  await expect(page.getByText("2 pedidos restaurados.")).toBeVisible();
  for (const id of semeado.pedidos)
    await expect.poll(async () => (await pedidoNoServidor(page, id)).archived ?? false).toBe(false);
  if (quantos === 2) {
    // Eram os únicos: a lista volta à normal, com os dois lá e com saída.
    await expect(page.getByRole("button", { name: /^Arquivados ·/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Todos · / })).toBeVisible();
  }
  await expect(page.getByText(PEDIDO("Ana")).first()).toBeVisible();
  expect(erros).toEqual([]);
  await ctx.close();
});

for (const largura of [390, 1440]) {
  for (const esquema of ["light", "dark"] as const) {
    test(`o campo do ⌘K sem rectângulo de foco — ${largura} px, ${esquema}`, async ({
      browser,
    }, info) => {
      const toque = largura < 1024;
      const { ctx, page, erros } = await contexto(browser, {
        largura,
        altura: largura === 390 ? 844 : 900,
        esquema,
        toque,
      });
      await abrir(page, "pedidos");
      // A procura dos Pedidos, focada: a moldura de acento segue os cantos.
      const procura = page.getByLabel("Procurar pedidos por nome, email, local ou ID");
      await procura.focus();
      await page.screenshot({
        path: info.outputPath(`procura-pedidos-foco-${largura}-${esquema}.png`),
        clip: { x: 0, y: 0, width: largura, height: 220 },
      });
      if (toque) await page.getByRole("button", { name: "Pesquisar" }).tap();
      else await page.keyboard.press(`${MOD}+k`);
      const campo = page.getByRole("combobox", { name: "Pesquisar ou navegar" });
      await expect(campo).toBeFocused();
      await page.keyboard.type("tar");
      await page.screenshot({ path: info.outputPath(`paleta-foco-${largura}-${esquema}.png`) });
      const estilo = await campo.evaluate((el) => {
        const c = getComputedStyle(el);
        return { sombra: c.boxShadow, estilo: c.outlineStyle, cor: c.outlineColor };
      });
      expect(estilo.sombra, "o rectângulo do foco voltou ao campo do ⌘K").toBe("none");
      // O contorno existe mas sem cor (o `forced-colors` dá-lha) — 2.ª revisão · 8.
      expect(
        estilo.estilo === "none" || /rgba\(0, 0, 0, 0\)|transparent/.test(estilo.cor),
        `o anel global voltou ao campo do ⌘K (${estilo.estilo} ${estilo.cor})`,
      ).toBe(true);
      expect(erros).toEqual([]);
      await ctx.close();
    });
  }
}

test("telemóvel com toque: «Selecionar» e tocar nas tarefas", async ({ browser }, info) => {
  const { ctx, page, erros } = await contexto(browser, {
    largura: 390,
    altura: 844,
    esquema: "dark",
    toque: true,
  });
  await abrir(page, "tarefas");
  await expect(page.getByText(T(1)).first()).toBeVisible();
  await page.getByRole("button", { name: "Selecionar", exact: true }).tap();
  await page.getByRole("button", { name: new RegExp(`Selecionar «${T(1)}»`) }).tap();
  await page.getByRole("button", { name: new RegExp(`Selecionar «${T(2)}»`) }).tap();
  const barra = page.getByRole("toolbar", { name: "Ações nas tarefas selecionadas" });
  await expect(barra.getByText("2 selecionadas")).toBeVisible();
  // Tocar não abriu o detalhe de nenhuma.
  await expect(page.locator("[data-tarefa][aria-current]")).toHaveCount(0);
  await semDeslocacaoHorizontal(page, "tarefas 390 com a barra");
  await barra.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("tarefas-lote-390-escuro.png") });
  await page.getByRole("button", { name: "Cancelar", exact: true }).tap();
  await expect(barra).toHaveCount(0);
  expect(erros).toEqual([]);
  await ctx.close();
});

for (const largura of [390, 768, 1440]) {
  for (const esquema of ["light", "dark"] as const) {
    test(`sem deslocação horizontal nem erros — ${largura} px, ${esquema}`, async ({
      browser,
    }, info) => {
      const toque = largura < 1024;
      const { ctx, page, erros } = await contexto(browser, {
        largura,
        altura: largura === 390 ? 844 : 1000,
        esquema,
        toque,
      });
      // Tarefas com a barra do lote aberta.
      await abrir(page, "tarefas");
      await expect(page.getByText(T(1)).first()).toBeVisible();
      const selecionar = page.getByRole("button", { name: "Selecionar", exact: true });
      if (toque) await selecionar.tap();
      else await selecionar.click();
      const t1 = page.getByRole("button", { name: new RegExp(`Selecionar «${T(1)}»`) });
      if (toque) await t1.tap();
      else await t1.click();
      await semDeslocacaoHorizontal(page, `tarefas ${largura} ${esquema}`);
      await page.screenshot({ path: info.outputPath(`tarefas-${largura}-${esquema}.png`) });

      // Propostas e Pedidos.
      for (const vista of ["propostas", "pedidos"]) {
        // Cada `goto` recarrega: a memória começa vazia, e as tarefas só voltam
        // a estar nela quando o aquecimento em ociosidade as traz. A paleta
        // não as vai buscar (regra de custo) — espera-se por esse aquecimento.
        const aquecidas = page
          .waitForResponse((r) => r.url().includes("/api/tarefas"), { timeout: 30_000 })
          .catch(() => null);
        await abrir(page, vista);
        await aquecidas;
        await page.waitForTimeout(400);
        await semDeslocacaoHorizontal(page, `${vista} ${largura} ${esquema}`);
      }
      // Pedidos com a barra do lote.
      await page
        .getByLabel("Procurar pedidos por nome, email, local ou ID")
        .fill(PREFIXO_DOS_PEDIDOS);
      const caixa = page.getByRole("checkbox", {
        name: new RegExp(`Selecionar pedido de ${PEDIDO("Ana")}`),
      });
      if (toque) await caixa.first().tap();
      else await caixa.first().click();
      await expect(page.getByRole("button", { name: "Arquivar (1)" })).toBeVisible();
      await semDeslocacaoHorizontal(page, `pedidos com lote ${largura} ${esquema}`);
      await page.screenshot({ path: info.outputPath(`pedidos-${largura}-${esquema}.png`) });

      // A paleta.
      if (!toque) {
        await page.keyboard.press(`${MOD}+k`);
      } else {
        await page.getByRole("button", { name: "Pesquisar" }).tap();
      }
      await page.getByRole("combobox", { name: "Pesquisar ou navegar" }).fill(`TESTE BO4 tarefa`);
      await expect(page.getByRole("group", { name: "Tarefas" })).toBeVisible();
      await semDeslocacaoHorizontal(page, `paleta ${largura} ${esquema}`);
      await page.screenshot({ path: info.outputPath(`paleta-${largura}-${esquema}.png`) });
      expect(erros).toEqual([]);
      await ctx.close();
    });
  }
}
