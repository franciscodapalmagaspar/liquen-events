#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAPTURAS AO PÍXEL: O BACK OFFICE DE DOIS SERVIDORES, LADO A LADO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uma refatoração não pode mudar o que se vê. Este script prova-o: abre as
 * mesmas vistas do back office em DOIS servidores (por exemplo o `main` e o
 * ramo da refatoração), nas mesmas larguras e nas duas aparências, e conta os
 * píxeis diferentes. O critério é ZERO.
 *
 *   node scripts/capturas/comparar-o-back-office.mjs \
 *     --a http://localhost:3301 --b http://localhost:3302 --saida /tmp/capturas
 *
 * Opções:
 *   --a, --b      os dois servidores (o de referência e o que se mede)
 *   --saida       pasta das imagens (só se guardam as que diferem, e o relatório)
 *   --vistas      lista separada por vírgulas (por omissão, todas as de `VISTAS`)
 *   --larguras    por omissão 390,768,1440
 *   --aparencias  por omissão claro,escuro
 *   --ecra 1      só o ecrã à vista, sem a página inteira (para as folhas que
 *                 flutuam: na página inteira o Chromium estica a janela, e o
 *                 que está preso ao fundo dela muda de sítio)
 *
 * ── COMO SE TORNA COMPARÁVEL ──────────────────────────────────────────────
 *
 *  · Os dois servidores leem os MESMOS dados (copia-se `data/` de um para o
 *    outro antes de arrancar) e a mesma palavra-passe de teste.
 *  · A secção pede-se pelo endereço público (`?v=<secção>`), que o servidor
 *    resolve — não pelo `localStorage` (ver o AGENTS.md sobre o `next dev`).
 *  · Espera-se pela hidratação: a classe `admin-mode` no `body`.
 *  · A aparência vai pelo cookie `bo-aparencia`, que o servidor lê, e o
 *    esquema do sistema acompanha-a.
 *  · `reducedMotion: "reduce"` e `animations: "disabled"`: o que se compara é o
 *    desenho assente, não um fotograma a meio de uma transição.
 *  · Os temas chegam de uma lista fixa (`/api/temas` interceptado), com
 *    fotografias que existem em `public/`, para o seletor do estúdio ter o que
 *    mostrar nos dois lados da mesma maneira.
 *  · Cada caso tira-se nos dois servidores um a seguir ao outro. Se diferir,
 *    repete-se até três vezes — e repete-se também o `a` contra si mesmo, para
 *    distinguir uma diferença verdadeira de um ecrã que não é determinístico.
 *
 * Sai com código 1 se algum caso tiver píxeis diferentes.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pares, arg, i, todos) => {
    if (arg.startsWith("--")) pares.push([arg.slice(2), todos[i + 1]]);
    return pares;
  }, []),
);

if (!args.a || !args.b) {
  console.error("Uso: --a <servidor de referência> --b <servidor a medir> [--saida pasta]");
  process.exit(2);
}

/** As secções que o `AdminClient` monta (`nav.tsx`, `TODAS`). */
const VISTAS = [
  "overview",
  "pedidos",
  "kanban",
  "clientes",
  "calendario",
  "propostas",
  "pagamentos",
  "acompanhamento",
  "fazer-proposta",
  "guioes",
  "mesas",
  "tarefas",
  "fornecedores",
  "inventario",
  "material",
  "temas",
  "estatisticas",
  "contratos",
  "modelos-email",
  "definicoes",
  "servicos",
  "reciclagem",
];

/** Casos que não são uma secção: precisam de cliques depois de a abrir. */
const CASOS_ESPECIAIS = ["painel-do-pedido", "pasta-de-tema", "seletor-de-temas"];

const vistas = args.vistas ? args.vistas.split(",") : [...VISTAS, ...CASOS_ESPECIAIS];
const larguras = (args.larguras ?? "390,768,1440").split(",").map(Number);
const aparencias = (args.aparencias ?? "claro,escuro").split(",");
const saida = path.resolve(args.saida ?? "capturas-do-back-office");
fs.mkdirSync(saida, { recursive: true });

const ALTURA = { 390: 844, 768: 1024, 1440: 900 };

/** Três temas fixos, com fotografias pequenas que o próprio site serve. */
const FOTOS = fs
  .readdirSync(path.resolve("public/imagens"))
  .filter((f) => /^galeria-instagram-.*\.jpg$/i.test(f))
  .sort()
  .slice(0, 12)
  .map((f) => `/imagens/${f}`);

/** A forma de `ThemeSummary` (`src/lib/theme-types.ts`). */
const TEMAS = ["Campo", "Romântico", "Minimal"].map((name, i) => ({
  id: `tema-captura-${i + 1}`,
  name,
  imageCount: 4,
  coverUrl: FOTOS[i * 4],
}));

/** A forma de `ThemeImagePage`. */
function imagensDoTema(id) {
  const i = Math.max(
    0,
    TEMAS.findIndex((t) => t.id === id),
  );
  const images = FOTOS.slice(i * 4, i * 4 + 4).map((url, j) => ({
    path: `${id}/foto-${j + 1}.jpg`,
    url,
    thumbUrl: url,
  }));
  return { ok: true, images, total: images.length, truncated: false };
}

async function entrar(contexto, base) {
  const page = await contexto.newPage();
  const painel = page.getByRole("navigation", { name: /Navegação do back office/i });
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    await page.goto(`${base}/orcamento/admin`);
    if (
      await painel.waitFor({ state: "visible", timeout: 5_000 }).then(
        () => true,
        () => false,
      )
    ) {
      await page.close();
      return;
    }
    await page
      .getByRole("button", { name: /^Entrar com palavra-passe$/ })
      .click({ timeout: 5_000 })
      .catch(() => {});
    const email = page.getByLabel(/^Email$/i);
    if ((await email.count()) === 0) continue;
    await email.fill("catarina@liquen-events.com");
    await page.locator('input[name="password"]').fill("liquen2026");
    await page.getByRole("button", { name: /^Entrar$/ }).click();
    if (
      await painel.waitFor({ state: "visible", timeout: 30_000 }).then(
        () => true,
        () => false,
      )
    ) {
      await page.close();
      return;
    }
  }
  throw new Error(`Não consegui entrar no back office de ${base}`);
}

async function novoContexto(browser, base, largura, aparencia) {
  const contexto = await browser.newContext({
    viewport: { width: largura, height: ALTURA[largura] ?? 900 },
    deviceScaleFactor: 1,
    colorScheme: aparencia === "escuro" ? "dark" : "light",
    reducedMotion: "reduce",
    locale: "pt-PT",
    timezoneId: "Europe/Lisbon",
    hasTouch: largura < 1024,
    isMobile: false,
  });
  await contexto.route("**/api/temas", (r) =>
    r.request().method() === "GET" ? r.fulfill({ json: TEMAS }) : r.continue(),
  );
  await contexto.route("**/api/temas/*/imagens**", (r) => {
    const id = decodeURIComponent(new URL(r.request().url()).pathname.split("/")[3] ?? "");
    return r.fulfill({ json: imagensDoTema(id) });
  });
  // O aviso «o trabalho não está a ser guardado» depende de quando a pergunta
  // ao servidor responde — num servidor sem Supabase aparecia numa captura e
  // não na outra. Responde-se sempre «está tudo bem», nos dois lados.
  await contexto.route("**/api/admin/armazenamento**", (r) =>
    r.fulfill({ json: { avisar: false } }),
  );
  await entrar(contexto, base);
  const { hostname } = new URL(base);
  await contexto.addCookies([
    { name: "bo-aparencia", value: aparencia, domain: hostname, path: "/" },
  ]);
  return contexto;
}

/** Espera que o ecrã assente: hidratado, letras carregadas, rede calma. */
async function assentar(page) {
  await page.waitForFunction(() => document.body.classList.contains("admin-mode"), undefined, {
    timeout: 60_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(
      [...document.images]
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise(
              (r) => img.addEventListener("load", r, { once: true }) || setTimeout(r, 5000),
            ),
        ),
    ),
  );
  await page.waitForTimeout(700);
}

async function abrirCaso(page, base, caso) {
  if (VISTAS.includes(caso)) {
    await page.goto(`${base}/orcamento/admin?v=${caso}`);
    await assentar(page);
    return;
  }
  if (caso === "painel-do-pedido") {
    await page.goto(`${base}/orcamento/admin?v=pedidos`);
    await assentar(page);
    // O pedido semeado pelos passeios (`e2e/semear-pedido.ts`).
    await page.getByText("Semente E2E", { exact: true }).first().click({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await assentar(page);
    return;
  }
  if (caso === "pasta-de-tema") {
    await page.goto(`${base}/orcamento/admin?v=temas`);
    await assentar(page);
    await page.getByText(TEMAS[0].name, { exact: true }).first().click({ timeout: 15_000 });
    await assentar(page);
    return;
  }
  if (caso === "seletor-de-temas") {
    await page.goto(`${base}/orcamento/admin?v=fazer-proposta`);
    await assentar(page);
    await page.locator("li button").first().click({ timeout: 30_000 });
    const abrir = page.getByRole("button", { name: /biblioteca de temas/i }).first();
    await abrir.click({ timeout: 30_000 });
    await page.getByRole("dialog", { name: /biblioteca de temas/i }).waitFor({ timeout: 20_000 });
    await assentar(page);
    return;
  }
  throw new Error(`Caso desconhecido: ${caso}`);
}

async function capturar(contexto, base, caso) {
  const page = await contexto.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  try {
    await abrirCaso(page, base, caso);
    const png = await page.screenshot({
      fullPage: !args.ecra,
      animations: "disabled",
      caret: "hide",
    });
    return { png, erros };
  } finally {
    await page.close();
  }
}

/** Píxeis diferentes entre duas imagens (tamanhos diferentes contam tudo). */
async function diferenca(a, b) {
  const [ia, ib] = await Promise.all(
    [a, b].map((png) => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })),
  );
  if (ia.info.width !== ib.info.width || ia.info.height !== ib.info.height) {
    return {
      px: Math.max(ia.info.width * ia.info.height, ib.info.width * ib.info.height),
      tamanho: `${ia.info.width}×${ia.info.height} ≠ ${ib.info.width}×${ib.info.height}`,
    };
  }
  let px = 0;
  for (let i = 0; i < ia.data.length; i += 4) {
    if (
      ia.data[i] !== ib.data[i] ||
      ia.data[i + 1] !== ib.data[i + 1] ||
      ia.data[i + 2] !== ib.data[i + 2] ||
      ia.data[i + 3] !== ib.data[i + 3]
    )
      px += 1;
  }
  return { px, tamanho: `${ia.info.width}×${ia.info.height}` };
}

const browser = await chromium.launch();
const resultados = [];
let falhas = 0;

for (const largura of larguras) {
  for (const aparencia of aparencias) {
    const [ca, cb] = await Promise.all([
      novoContexto(browser, args.a, largura, aparencia),
      novoContexto(browser, args.b, largura, aparencia),
    ]);
    for (const caso of vistas) {
      const nome = `${caso}-${largura}-${aparencia}`;
      let melhor = null;
      let estavel = null;
      for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
        try {
          const a = await capturar(ca, args.a, caso);
          const b = await capturar(cb, args.b, caso);
          const d = await diferenca(a.png, b.png);
          if (!melhor || d.px < melhor.px)
            melhor = { ...d, a: a.png, b: b.png, erros: [...a.erros, ...b.erros] };
          if (d.px === 0) break;
          // Diferente: o `a` é igual a si mesmo? Se não for, o ecrã não é determinístico.
          const a2 = await capturar(ca, args.a, caso);
          estavel = (await diferenca(a.png, a2.png)).px === 0;
        } catch (e) {
          melhor = melhor ?? { px: -1, tamanho: "—", erro: String(e).split("\n")[0] };
        }
      }
      const linha = {
        caso: nome,
        px: melhor.px,
        tamanho: melhor.tamanho,
        estavel,
        erro: melhor.erro,
        errosDaPagina: melhor.erros?.length ?? 0,
      };
      resultados.push(linha);
      if (melhor.px !== 0) {
        falhas += 1;
        if (melhor.a) fs.writeFileSync(path.join(saida, `${nome}.a.png`), melhor.a);
        if (melhor.b) fs.writeFileSync(path.join(saida, `${nome}.b.png`), melhor.b);
      }
      console.log(
        `${melhor.px === 0 ? "igual " : "DIFERE"}  ${nome.padEnd(40)} ${String(melhor.px).padStart(8)} px  ${melhor.tamanho}` +
          (estavel === false ? "  (o `a` não é igual a si mesmo)" : "") +
          (melhor.erro ? `  ${melhor.erro}` : ""),
      );
    }
    await Promise.all([ca.close(), cb.close()]);
  }
}

await browser.close();
fs.writeFileSync(path.join(saida, "relatorio.json"), JSON.stringify(resultados, null, 2));
console.log(
  `\n${resultados.length} casos, ${falhas} com diferenças. Relatório: ${path.join(saida, "relatorio.json")}`,
);
process.exit(falhas ? 1 : 0);
