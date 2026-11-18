#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESTÚDIO AO PÍXEL — duas versões do «Fazer proposta», lado a lado
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Partir o `ProposalStudio` em peças só vale se ela não der por isso: o ecrã
 * tem de ficar IGUAL, píxel a píxel. Este guião fotografa os cinco passos do
 * estúdio em dois servidores (o de antes e o de depois), nas três larguras e
 * nos dois temas, e conta os píxeis diferentes de cada par. Uma diferença que
 * não esteja numa mudança aprovada é um erro, e corrige-se no código.
 *
 * Os dois estados do ecrã:
 *   · «nova»   — o estúdio aberto num pedido sem rascunho;
 *   · «editar» — o mesmo pedido reaberto com um rascunho gravado (o valor de
 *                3000 € escrito no Orçamento e a página recarregada).
 *
 * ── Uso ────────────────────────────────────────────────────────────────────
 *   # os dois servidores de DESENVOLVIMENTO a correr (ver o AGENTS.md: o de
 *   # produção recusa escritas sem Supabase), com os MESMOS dados em `data/`:
 *   node scripts/capturas/estudio-ao-pixel.mjs --semear http://localhost:3301
 *   # copia o `data/` desse servidor para o outro, e arranca-o; depois:
 *   node scripts/capturas/estudio-ao-pixel.mjs http://localhost:3300 http://localhost:3301 /tmp/capturas
 *
 * Variáveis: LARGURAS=390,768,1440 · TEMAS=light,dark · ESTADOS=nova,editar.
 *
 * ── Para os dois lados darem o mesmo ecrã ─────────────────────────────────
 *   · o relógio do browser fica parado (`clock.setFixedTime`): o «guardado às»
 *     e as datas relativas dizem o mesmo nos dois;
 *   · `reducedMotion: "reduce"`, e cada captura espera que a página pare de
 *     mudar (duas capturas seguidas iguais) antes de contar;
 *   · cada passagem apaga o rascunho do servidor e começa com o browser limpo.
 *
 * Custo: só local — dois `next dev` nesta máquina, nada na Vercel nem no
 * Supabase (o armazém é o ficheiro de `data/`).
 */
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const NOME = "Capturas Estúdio";
const SUBMISSION_ID = "capturas-estudio-ao-pixel";
const RELOGIO = new Date("2026-11-18T10:00:00Z");
const PASSOS = ["Evento", "Serviços", "Inspiração", "Orçamento", "Rever e enviar"];

const lista = (v, omissao) => (v ? v.split(",").map((s) => s.trim()) : omissao);
const LARGURAS = lista(process.env.LARGURAS, ["390", "768", "1440"]).map(Number);
const TEMAS = lista(process.env.TEMAS, ["light", "dark"]);
const ESTADOS = lista(process.env.ESTADOS, ["nova", "editar"]);
const ALTURA = { 390: 844, 768: 1024, 1440: 900 };

function payload() {
  return {
    form: {
      name: NOME,
      email: "capturas@example.pt",
      phone: "912345678",
      category: "particulares",
      eventType: "casamentos",
      eventName: "Casamento",
      date: "2099-06-10",
      guests: 120,
      location: "Herdade da Maridona, Glória",
    },
    website: "",
    submissionId: SUBMISSION_ID,
  };
}

async function entrar(page, base) {
  await page.goto(`${base}/orcamento/admin`, { waitUntil: "domcontentloaded" });
  const painel = page.getByRole("navigation", { name: /Navegação do back office/i });
  if (
    await painel.waitFor({ state: "visible", timeout: 8_000 }).then(
      () => true,
      () => false,
    )
  ) {
    return;
  }
  await page
    .getByRole("button", { name: /^Entrar com palavra-passe$/ })
    .click({ timeout: 8_000 })
    .catch(() => {});
  await page.getByLabel(/^Email$/i).fill("catarina@liquen-events.com");
  await page.locator('input[name="password"]').fill("liquen2026");
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await painel.waitFor({ state: "visible", timeout: 60_000 });
}

async function idDoPedido(page, base) {
  const r = await page.request.get(`${base}/api/orcamento`);
  if (!r.ok()) throw new Error(`GET /api/orcamento respondeu ${r.status()}`);
  const meu = (await r.json()).find((q) => q?.name === NOME && !q?.archived);
  return meu?.id ?? null;
}

async function semear(base) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await entrar(page, base);
  let id = await idDoPedido(page, base);
  if (!id) {
    const r = await page.request.post(`${base}/api/orcamento`, { data: payload() });
    if (!r.ok()) throw new Error(`POST /api/orcamento respondeu ${r.status()}: ${await r.text()}`);
    id = (await r.json()).id;
  }
  console.log(`pedido «${NOME}»: ${id}`);
  await browser.close();
}

/** Espera que a página pare de mudar: duas fotografias seguidas iguais. */
async function capturaParada(page) {
  let anterior = null;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(700);
    const agora = await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" });
    if (anterior && agora.equals(anterior)) return agora;
    anterior = agora;
  }
  return anterior;
}

async function abrirOEstudio(page, base) {
  await page.goto(`${base}/orcamento/admin?v=fazer-proposta`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("admin-mode"), null, {
    timeout: 90_000,
  });
  await page.getByText(/Para quem é a proposta\?/).waitFor({ timeout: 60_000 });
  await page.locator("li button").filter({ hasText: NOME }).first().click();
  await page.getByRole("button", { name: /^Seguinte: Serviços/ }).waitFor({ timeout: 60_000 });
}

async function irAoPasso(page, i) {
  await page
    .getByRole("button", { name: new RegExp(`^${i + 1}\\s*${PASSOS[i]}`) })
    .first()
    .click();
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function passagem(base, largura, tema, estado) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: largura, height: ALTURA[largura] ?? 900 },
    colorScheme: tema,
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(RELOGIO);
  const erros = [];
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  page.on("pageerror", (e) => erros.push(String(e)));

  await entrar(page, base);
  const id = await idDoPedido(page, base);
  if (!id) throw new Error(`não há pedido «${NOME}» em ${base} — corre primeiro com --semear`);
  await page.request.delete(`${base}/api/orcamento/${id}/proposta-rascunho`);

  await abrirOEstudio(page, base);
  if (estado === "editar") {
    await irAoPasso(page, 3);
    const valor = page
      .getByLabel(/Valor \(sem IVA\)/)
      .locator("visible=true")
      .first();
    await valor.fill("3000");
    await valor.blur();
    // A gravação do rascunho no servidor, e só depois recarregar.
    await page
      .getByText(/Guardado|Tudo guardado/i)
      .first()
      .waitFor({ timeout: 30_000 })
      .catch(() => {});
    await page.waitForTimeout(3_000);
    await abrirOEstudio(page, base);
  }

  const fotos = [];
  for (let i = 0; i < PASSOS.length; i++) {
    await irAoPasso(page, i);
    fotos.push(await capturaParada(page));
  }
  await browser.close();
  return { fotos, erros };
}

/** Píxeis diferentes entre duas capturas, e a caixa que os contém. */
async function comparar(a, b, saidaDiff) {
  const [ia, ib] = await Promise.all(
    [a, b].map((x) => sharp(x).ensureAlpha().raw().toBuffer({ resolveWithObject: true })),
  );
  if (ia.info.width !== ib.info.width || ia.info.height !== ib.info.height) {
    return {
      px: -1,
      motivo: `tamanhos diferentes: ${ia.info.width}×${ia.info.height} vs ${ib.info.width}×${ib.info.height}`,
    };
  }
  const { width: w, height: h } = ia.info;
  const diff = Buffer.alloc(w * h * 4);
  let px = 0;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const igual =
      ia.data[o] === ib.data[o] &&
      ia.data[o + 1] === ib.data[o + 1] &&
      ia.data[o + 2] === ib.data[o + 2] &&
      ia.data[o + 3] === ib.data[o + 3];
    if (igual) {
      const g = (ia.data[o] + ia.data[o + 1] + ia.data[o + 2]) / 3;
      diff[o] = diff[o + 1] = diff[o + 2] = 255 - (255 - g) * 0.2;
      diff[o + 3] = 255;
    } else {
      px++;
      const x = i % w,
        y = (i / w) | 0;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      diff[o] = 255;
      diff[o + 1] = diff[o + 2] = 0;
      diff[o + 3] = 255;
    }
  }
  if (px > 0)
    await sharp(diff, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(saidaDiff);
  return { px, caixa: px ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--semear") return semear(args[1]);
  const [baseA, baseB, saida = "/tmp/capturas-estudio"] = args;
  if (!baseA || !baseB) {
    console.error("uso: estudio-ao-pixel.mjs <antes> <depois> [pasta] | --semear <url>");
    process.exit(2);
  }
  mkdirSync(saida, { recursive: true });
  const relatorio = [];
  for (const estado of ESTADOS) {
    for (const largura of LARGURAS) {
      for (const tema of TEMAS) {
        const [A, B] = [
          await passagem(baseA, largura, tema, estado),
          await passagem(baseB, largura, tema, estado),
        ];
        for (let i = 0; i < PASSOS.length; i++) {
          const nome = `${estado}-${largura}-${tema}-${i + 1}`;
          writeFileSync(path.join(saida, `${nome}-antes.png`), A.fotos[i]);
          writeFileSync(path.join(saida, `${nome}-depois.png`), B.fotos[i]);
          const r = await comparar(A.fotos[i], B.fotos[i], path.join(saida, `${nome}-diff.png`));
          relatorio.push({ nome, passo: PASSOS[i], ...r });
          console.log(
            `${nome.padEnd(22)} ${String(r.px).padStart(8)} px${r.caixa ? ` em ${JSON.stringify(r.caixa)}` : ""}${r.motivo ? ` (${r.motivo})` : ""}`,
          );
        }
        if (A.erros.length || B.erros.length) {
          relatorio.push({
            nome: `${estado}-${largura}-${tema}-consola`,
            antes: A.erros,
            depois: B.erros,
          });
          console.log(`  consola: antes ${A.erros.length} erro(s), depois ${B.erros.length}`);
        }
      }
    }
  }
  writeFileSync(path.join(saida, "relatorio.json"), JSON.stringify(relatorio, null, 2));
  const comDiferenca = relatorio.filter((r) => typeof r.px === "number" && r.px !== 0);
  console.log(
    `\n${relatorio.filter((r) => typeof r.px === "number").length} pares; ${comDiferenca.length} com diferença.`,
  );
  process.exit(comDiferenca.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
