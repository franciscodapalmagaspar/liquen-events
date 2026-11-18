// ─────────────────────────────────────────────────────────────────────────────
// BANCO DE ENSAIO DAS FOTOS — quanto custa carregar e mostrar uma foto
//
// PARA QUE SERVE
//   Mede, com números reais e não com estimativas, o que se passa quando a
//   Catarina carrega fotos para a Biblioteca de Temas e quando abre a página de
//   um tema. Serve para decidir o que vale a pena optimizar — e, depois de
//   optimizado, para provar que melhorou mesmo.
//
// COMO CORRER
//   node scripts/bench-fotos.mjs
//
//   Opções (todas facultativas):
//     --fotos=8          quantas fotos de origem usar        (por omissão 8)
//     --mp=4,8,12        que tamanhos simular, em megapixéis (por omissão 4,8,12)
//     --repeticoes=1     quantas vezes repetir cada medição  (por omissão 1)
//     --uplink=10,30,100 velocidades de envio a considerar, em Mbps
//     --json=<caminho>   grava os números em bruto num ficheiro JSON
//     --so-browser       mede só a parte do navegador (salta o servidor)
//
// O QUE MEDE, E ONDE
//   1. NAVEGADOR (Chromium a sério, via Playwright) — descodificar a foto,
//      reduzi-la, codificar o JPEG do original e o da miniatura. É o trabalho
//      que hoje corre na thread principal, em src/app/[lang]/orcamento/admin/image-prep.ts.
//   2. SERVIDOR (Node) — ler o multipart e passar os bytes para memória, que é
//      o que a rota /api/temas/[id]/imagens faz antes de falar com o Storage.
//   3. ARITMÉTICA — junta os tempos medidos ao tamanho dos ficheiros medido e
//      diz onde vai parar o tempo de um lote de 300 fotos: no processador do
//      portátil ou na linha de envio.
//
// O QUE **NÃO** MEDE (e porquê)
//   A rede real. Este banco corre numa máquina isolada: não há Supabase nem
//   função serverless do outro lado. Os bytes que atravessam a rede são
//   MEDIDOS (o tamanho dos ficheiros é real); o TEMPO que demoram a atravessá-la
//   é CALCULADO a partir de velocidades de envio que se dão como parâmetro.
//   Está sempre marcado como «calculado», nunca como «medido».
//
// HONESTIDADE DO CORPUS
//   As fotos de public/imagens já foram optimizadas (2560 px de lado maior,
//   JPEG progressivo). Uma foto acabada de sair de um telemóvel não é assim:
//   é maior e é JPEG «baseline». O corpus volta a codificá-las como um
//   telemóvel faria — baseline, 4:2:0, q92 — nos tamanhos pedidos em --mp.
//   Chegar aos 8/12 MP obriga a ampliar, e ampliar não inventa detalhe: o
//   TEMPO (que depende do número de pixéis) fica fiel, mas os BYTES do JPEG
//   ficam um pouco abaixo do que uma foto verdadeira de 12 MP daria. Onde isso
//   importa, o relatório diz.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import sharp from "sharp";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// ── Argumentos ───────────────────────────────────────────────────────────────
const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const N_PHOTOS = Number(argv.fotos ?? 8);
const MP_LEVELS = String(argv.mp ?? "4,8,12")
  .split(",")
  .map(Number);
const REPEATS = Number(argv.repeticoes ?? 1);
const UPLINKS = String(argv.uplink ?? "10,30,100")
  .split(",")
  .map(Number);
const JSON_OUT = argv.json ?? null;
const BROWSER_ONLY = argv["so-browser"] === "true";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "public", "imagens");
const WORK = path.join(os.tmpdir(), "bench-fotos-corpus");

// ── Constantes que espelham o código em produção ─────────────────────────────
// Se estas mudarem no código, mudam aqui — e o teste
// src/lib/photo-pipeline.bench.test.ts falha a avisar que ficaram dessincronizadas.
const COVER_MAX_EDGE = 2200; // COVER_MAX_EDGE (image-prep.ts)
const COVER_QUALITY = 0.9; // COVER_QUALITY (image-prep.ts)
const COVER_KEEP_BYTES = 1_500_000; // PRESETS.cover.keepBytes
const THUMB_EDGE = 400; // THUMB_EDGE
const THUMB_QUALITY = 0.72; // THUMB_QUALITY
const UPLOAD_CONCURRENCY = 4; // Temas.tsx
const THEME_PAGE_SIZE = 60; // theme-types.ts
const BATCH = 300; // o lote para que estamos a dimensionar

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const fmtMB = (b) => (b / 1048576).toFixed(2);
const fmtKB = (b) => (b / 1024).toFixed(0);
const ms = (n) => `${n.toFixed(0)} ms`;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const rule = (t = "") => console.log(`\n${"━".repeat(78)}\n${t}${t ? "\n" + "━".repeat(78) : ""}`);

// ─────────────────────────────────────────────────────────────────────────────
// 0. CORPUS — fotos reais, recodificadas como um telemóvel as escreveria
// ─────────────────────────────────────────────────────────────────────────────
async function buildCorpus() {
  await fsp.mkdir(WORK, { recursive: true });
  const all = (await fsp.readdir(SRC_DIR)).filter((f) => /\.jpe?g$/i.test(f));
  if (all.length === 0) throw new Error(`Sem fotos em ${SRC_DIR}`);

  // As maiores primeiro: ampliar o menos possível para chegar aos alvos.
  const sized = [];
  for (const f of all) {
    const { size } = await fsp.stat(path.join(SRC_DIR, f));
    sized.push({ f, size });
  }
  sized.sort((a, b) => b.size - a.size);
  const picks = sized.slice(0, N_PHOTOS).map((s) => s.f);

  const corpus = [];
  for (const f of picks) {
    const src = path.join(SRC_DIR, f);
    const meta = await sharp(src).metadata();
    const ar = meta.width / meta.height;
    for (const mp of MP_LEVELS) {
      const h = Math.round(Math.sqrt((mp * 1e6) / ar));
      const w = Math.round(h * ar);
      const out = path.join(WORK, `${mp}mp__${f}`);
      if (!fs.existsSync(out)) {
        await sharp(src, { failOn: "none" })
          .rotate()
          // Como um telemóvel escreve: baseline (nunca progressivo), 4:2:0, q92.
          .resize(w, h, { kernel: "lanczos3" })
          .jpeg({ quality: 92, progressive: false, chromaSubsampling: "4:2:0" })
          .toFile(out);
      }
      const { size } = await fsp.stat(out);
      corpus.push({ file: out, name: `${mp}mp__${f}`, mp, w, h, bytes: size });
    }
  }
  return corpus;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. NAVEGADOR — o pipeline tal como está hoje, mais os candidatos a alternativa
// ─────────────────────────────────────────────────────────────────────────────

/** Corre dentro da página: mede o pipeline ACTUAL, passo a passo. */
const PAGE_SETUP = () => {
  window.fitWithin = (w, h, maxEdge) => {
    const scale = Math.min(1, maxEdge / Math.max(w, h, 1));
    return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
  };
  window.drawTo = (source, w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, w, h);
    return c;
  };
  window.encode = (c, q) => new Promise((r) => c.toBlob(r, "image/jpeg", q));
  // Os bytes viajam em base64: passar um array de milhões de números por
  // page.evaluate é ordens de grandeza mais lento do que a própria medição.
  window.toBytes = (b64) => {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  };
};

/** O pipeline de hoje, cronometrado por passo. */
const RUN_CURRENT = async ({ name, data, cfg }) => {
  const file = new File([window.toBytes(data)], name, { type: "image/jpeg" });
  const now = () => performance.now();
  const out = { name, inBytes: file.size };

  // O atalho de image-prep.ts: um ficheiro suportado e pequeno sobe tal e qual
  // (mas a miniatura ainda obriga a descodificar).
  out.keptOriginal = file.size <= cfg.keepBytes;

  let t0 = now();
  const bmp = await createImageBitmap(file);
  out.decodeMs = now() - t0;
  out.srcW = bmp.width;
  out.srcH = bmp.height;

  const { w, h } = window.fitWithin(bmp.width, bmp.height, cfg.maxEdge);
  out.outW = w;
  out.outH = h;

  let base = bmp;
  if (!out.keptOriginal) {
    t0 = now();
    const c1 = window.drawTo(bmp, w, h);
    out.drawMs = now() - t0;
    t0 = now();
    const blob1 = await window.encode(c1, cfg.quality);
    out.encodeMs = now() - t0;
    out.outBytes = blob1.size;
    base = c1;
  } else {
    // Sobe tal e qual: nada de desenhar nem codificar o original.
    out.drawMs = 0;
    out.encodeMs = 0;
    out.outBytes = file.size;
    out.outW = bmp.width;
    out.outH = bmp.height;
  }

  // Miniatura, da mesma bitmap/canvas.
  const t = window.fitWithin(out.outW, out.outH, cfg.thumbEdge);
  t0 = now();
  const c2 = window.drawTo(base, t.w, t.h);
  const blob2 = await window.encode(c2, cfg.thumbQuality);
  out.thumbMs = now() - t0;
  out.thumbBytes = blob2.size;
  out.thumbW = t.w;
  out.thumbH = t.h;

  bmp.close();
  out.totalMs = out.decodeMs + out.drawMs + out.encodeMs + out.thumbMs;
  return out;
};

/**
 * CANDIDATOS a caminho mais rápido. Não são propostas de implementação — são
 * medições para dar um alvo a quem vai optimizar.
 *
 *   · bitmapResize — createImageBitmap já com resizeWidth/resizeHeight. O
 *     descodificador de JPEG pode reduzir enquanto descodifica, em vez de
 *     descodificar tudo e só depois reduzir.
 *   · edge1600 / edge1400 — o mesmo pipeline, mas com um tecto de pixéis mais
 *     baixo para o original.
 *   · webp — o mesmo, codificado em WebP em vez de JPEG.
 */
const RUN_CANDIDATES = async ({ name, data, cfg }) => {
  const file = new File([window.toBytes(data)], name, { type: "image/jpeg" });
  const now = () => performance.now();
  const res = {};

  // (a) descodificar já reduzido
  {
    const probe = await createImageBitmap(file);
    const { w, h } = window.fitWithin(probe.width, probe.height, cfg.maxEdge);
    probe.close();
    const t0 = now();
    const bmp = await createImageBitmap(file, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: "high",
    });
    const decodeResizeMs = now() - t0;
    const t1 = now();
    const c = window.drawTo(bmp, w, h);
    const blob = await window.encode(c, cfg.quality);
    const encMs = now() - t1;
    const tt = window.fitWithin(w, h, cfg.thumbEdge);
    const t2 = now();
    const c2 = window.drawTo(c, tt.w, tt.h);
    const tb = await window.encode(c2, cfg.thumbQuality);
    const thumbMs = now() - t2;
    bmp.close();
    res.bitmapResize = {
      decodeResizeMs,
      encMs,
      thumbMs,
      totalMs: decodeResizeMs + encMs + thumbMs,
      outBytes: blob.size,
      thumbBytes: tb.size,
      outW: w,
      outH: h,
    };
  }

  // (b) tectos de pixéis mais baixos, e (c) WebP
  for (const [label, edge, quality, type] of [
    ["edge1600", 1600, cfg.quality, "image/jpeg"],
    ["edge1400", 1400, cfg.quality, "image/jpeg"],
    ["edge1600webp", 1600, 0.82, "image/webp"],
  ]) {
    const probe = await createImageBitmap(file);
    const { w, h } = window.fitWithin(probe.width, probe.height, edge);
    probe.close();
    const t0 = now();
    const bmp = await createImageBitmap(file, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: "high",
    });
    const c = window.drawTo(bmp, w, h);
    const blob = await new Promise((r) => c.toBlob(r, type, quality));
    const tt = window.fitWithin(w, h, cfg.thumbEdge);
    const c2 = window.drawTo(c, tt.w, tt.h);
    const tb = await new Promise((r) => c2.toBlob(r, type, cfg.thumbQuality));
    const totalMs = now() - t0;
    bmp.close();
    res[label] = { totalMs, outBytes: blob.size, thumbBytes: tb.size, outW: w, outH: h };
  }

  return res;
};

/**
 * CONCORRÊNCIA — o `UPLOAD_CONCURRENCY = 4` de Temas.tsx compra alguma coisa?
 *
 * O pool lança 4 preparações ao mesmo tempo, mas `canvas`/`toBlob` correm na
 * THREAD PRINCIPAL: quatro chamadas simultâneas não se dividem por quatro
 * núcleos, fazem fila na mesma thread. Isto mede os três casos lado a lado —
 * 4 em série, 4 pelo pool actual, e 4 em quatro Web Workers com OffscreenCanvas —
 * para se saber quanto é que mudar de sítio o trabalho valeria.
 */
const RUN_CONCURRENCY = async ({ datas, cfg }) => {
  const files = datas.map(
    (d, i) => new File([window.toBytes(d)], `p${i}.jpg`, { type: "image/jpeg" }),
  );
  const prep = async (file) => {
    const bmp = await createImageBitmap(file);
    const { w, h } = window.fitWithin(bmp.width, bmp.height, cfg.maxEdge);
    const c = window.drawTo(bmp, w, h);
    const blob = await window.encode(c, cfg.quality);
    const t = window.fitWithin(w, h, cfg.thumbEdge);
    const c2 = window.drawTo(c, t.w, t.h);
    const tb = await window.encode(c2, cfg.thumbQuality);
    bmp.close();
    return blob.size + tb.size;
  };
  const out = { cores: navigator.hardwareConcurrency };

  await prep(files[0]); // aquecer

  let t0 = performance.now();
  for (let i = 0; i < 4; i++) await prep(files[i]);
  out.serial4 = performance.now() - t0;

  t0 = performance.now();
  await Promise.all([0, 1, 2, 3].map((i) => prep(files[i])));
  out.pool4 = performance.now() - t0;

  const src = `
    const fit=(w,h,m)=>{const s=Math.min(1,m/Math.max(w,h,1));return{w:Math.max(1,Math.round(w*s)),h:Math.max(1,Math.round(h*s))}};
    self.onmessage = async (e) => {
      const { file, cfg } = e.data;
      const bmp = await createImageBitmap(file);
      const { w, h } = fit(bmp.width, bmp.height, cfg.maxEdge);
      const c = new OffscreenCanvas(w, h);
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(bmp, 0, 0, w, h);
      const blob = await c.convertToBlob({ type: 'image/jpeg', quality: cfg.quality });
      const t = fit(w, h, cfg.thumbEdge);
      const c2 = new OffscreenCanvas(t.w, t.h);
      const x2 = c2.getContext('2d');
      x2.imageSmoothingEnabled = true; x2.imageSmoothingQuality = 'high';
      x2.drawImage(c, 0, 0, t.w, t.h);
      const tb = await c2.convertToBlob({ type: 'image/jpeg', quality: cfg.thumbQuality });
      bmp.close();
      self.postMessage(blob.size + tb.size);
    };`;
  const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
  const workers = [0, 1, 2, 3].map(() => new Worker(url));
  const runW = (wk, file) =>
    new Promise((res, rej) => {
      wk.onerror = (e) => rej(new Error(e.message || "worker"));
      wk.onmessage = (e) => res(e.data);
      wk.postMessage({ file, cfg });
    });
  try {
    await Promise.all(workers.map((wk, i) => runW(wk, files[i]))); // aquecer
    t0 = performance.now();
    await Promise.all(workers.map((wk, i) => runW(wk, files[i])));
    out.workers4 = performance.now() - t0;
  } catch (e) {
    out.workersError = String(e && e.message);
  }
  workers.forEach((w) => w.terminate());
  return out;
};

async function benchBrowser(corpus) {
  if (!fs.existsSync(CHROME)) {
    throw new Error(
      `Chromium não encontrado em ${CHROME}. Instale com: npx playwright install chromium`,
    );
  }
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  // Uma origem real, e não about:blank: um Worker criado a partir de um Blob
  // não arranca numa origem opaca, e a secção da concorrência precisa dele.
  await page.route("**/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>bench</title>",
    }),
  );
  await page.goto("http://bench.local/");
  await page.addInitScript(PAGE_SETUP);
  await page.evaluate(PAGE_SETUP);

  const cfg = {
    maxEdge: COVER_MAX_EDGE,
    quality: COVER_QUALITY,
    keepBytes: COVER_KEEP_BYTES,
    thumbEdge: THUMB_EDGE,
    thumbQuality: THUMB_QUALITY,
  };

  const rows = [];
  for (const item of corpus) {
    const data = (await fsp.readFile(item.file)).toString("base64");
    const runs = [];
    for (let i = 0; i < REPEATS; i++) {
      runs.push(await page.evaluate(RUN_CURRENT, { name: item.name, data, cfg }));
    }
    const pick = (k) => median(runs.map((r) => r[k]));
    const r0 = runs[0];
    const row = {
      ...item,
      keptOriginal: r0.keptOriginal,
      srcW: r0.srcW,
      srcH: r0.srcH,
      outW: r0.outW,
      outH: r0.outH,
      thumbW: r0.thumbW,
      thumbH: r0.thumbH,
      outBytes: r0.outBytes,
      thumbBytes: r0.thumbBytes,
      decodeMs: pick("decodeMs"),
      drawMs: pick("drawMs"),
      encodeMs: pick("encodeMs"),
      thumbMs: pick("thumbMs"),
      totalMs: pick("totalMs"),
    };
    row.candidates = await page.evaluate(RUN_CANDIDATES, { name: item.name, data, cfg });
    rows.push(row);
    console.log(
      `  ${item.name.slice(0, 44).padEnd(46)} ${String(r0.srcW + "×" + r0.srcH).padEnd(11)} ` +
        `${fmtMB(item.bytes)}MB → ${fmtMB(row.outBytes)}MB  ` +
        `desc ${row.decodeMs.toFixed(0)} · red ${row.drawMs.toFixed(0)} · ` +
        `cod ${row.encodeMs.toFixed(0)} · mini ${row.thumbMs.toFixed(0)} = ${row.totalMs.toFixed(0)} ms`,
    );
  }

  // Concorrência: usa as fotos de 8 MP (o caso central).
  const mid = MP_LEVELS.includes(8) ? 8 : MP_LEVELS[Math.floor(MP_LEVELS.length / 2)];
  const pick4 = corpus.filter((c) => c.mp === mid).slice(0, 4);
  let concurrency = null;
  if (pick4.length === 4) {
    const datas = [];
    for (const c of pick4) datas.push((await fsp.readFile(c.file)).toString("base64"));
    concurrency = { mp: mid, ...(await page.evaluate(RUN_CONCURRENCY, { datas, cfg })) };
  }

  await browser.close();
  return { rows, concurrency };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SERVIDOR — o custo do salto do meio (ler o multipart, pôr os bytes em memória)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * A rota faz `await request.formData()` e depois
 * `Buffer.from(await file.arrayBuffer())` por ficheiro. Isto mede exactamente
 * esses dois passos com bytes reais. NÃO mede a rede nem o Storage — mede o
 * trabalho de CPU/memória que a função serverless faz só por estar no meio.
 */
async function benchServerHop(corpus) {
  const byMp = new Map();
  for (const item of corpus) {
    const buf = await fsp.readFile(item.file);
    const runs = [];
    for (let i = 0; i < Math.max(3, REPEATS); i++) {
      const fd = new FormData();
      fd.append("files", new Blob([buf], { type: "image/jpeg" }), item.name);
      fd.append("thumbs", new Blob([Buffer.alloc(40 * 1024)], { type: "image/jpeg" }), "t.jpg");
      const req = new Request("http://local/api/temas/x/imagens", { method: "POST", body: fd });

      const t0 = performance.now();
      const form = await req.formData();
      const parseMs = performance.now() - t0;
      const t1 = performance.now();
      const f = form.getAll("files")[0];
      const bytes = Buffer.from(await f.arrayBuffer());
      const toBufMs = performance.now() - t1;
      runs.push({ parseMs, toBufMs, total: parseMs + toBufMs, len: bytes.length });
    }
    const key = item.mp;
    if (!byMp.has(key)) byMp.set(key, []);
    byMp.get(key).push({
      name: item.name,
      bytes: item.bytes,
      parseMs: median(runs.map((r) => r.parseMs)),
      toBufMs: median(runs.map((r) => r.toBufMs)),
      totalMs: median(runs.map((r) => r.total)),
    });
  }
  return byMp;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. AUDITORIA DOS CONSUMIDORES — que tamanho é que alguém desenha, de facto
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Lê as constantes do código (não as copia de cabeça) e calcula, em pixéis, a
 * maior dimensão que cada sítio chega a desenhar de uma foto da biblioteca.
 */
async function auditConsumers() {
  const read = (p) => fsp.readFile(path.join(ROOT, p), "utf8");
  const pdf = await read("src/lib/proposal-geometria.ts");
  const img = await read("src/lib/proposal-image.ts");

  const grab = (src, re, label) => {
    const m = src.match(re);
    if (!m)
      throw new Error(`Não encontrei ${label} — o código mudou; actualize o banco de ensaio.`);
    return Number(m[1]);
  };

  const W = grab(pdf, /^export const PAGINA_W = ([\d.]+);/m, "PAGINA_W (largura da página)");
  const H = grab(pdf, /^export const PAGINA_H = ([\d.]+);/m, "PAGINA_H (altura da página)");
  const M = grab(pdf, /^export const PAGINA_M = (\d+);/m, "PAGINA_M (margem)");
  const panelFrac = grab(pdf, /const panelW = PAGINA_W \* ([\d.]+);/, "fracção do painel central");
  const coverDpi = grab(img, /cover: (\d+),/, "DPI da capa");
  const collageDpi = grab(img, /collage: (\d+),/, "DPI do mood board");
  const maxEdge = grab(img, /MAX_IMAGE_EDGE_PX = (\d+);/, "MAX_IMAGE_EDGE_PX");

  const px = (pt, dpi) => Math.round((pt * dpi) / 72);
  const cap = (w, h) => {
    const over = Math.max(w, h) / maxEdge;
    return over > 1 ? { w: Math.round(w / over), h: Math.round(h / over) } : { w, h };
  };

  // Capa: duas tiras a ladear um painel central, de topo a fundo da A4 paisagem.
  const sideW = (W - W * panelFrac) / 2;
  const cover = cap(px(sideW, coverDpi), px(H, coverDpi));

  // Mood board: a maior caixa possível é UMA foto sozinha a ocupar a área toda.
  const areaW = W - 2 * M;
  const areaH = H - M - 112 - (M + 8);
  const collage1 = cap(px(areaW, collageDpi), px(areaH, collageDpi));

  return {
    coverBoxPt: { w: +sideW.toFixed(2), h: H },
    coverPx: cover,
    collageBoxPt: { w: +areaW.toFixed(2), h: +areaH.toFixed(2) },
    collagePx: collage1,
    maxEdge,
    coverDpi,
    collageDpi,
    largest: Math.max(cover.w, cover.h, collage1.w, collage1.h),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RELATÓRIO
// ─────────────────────────────────────────────────────────────────────────────
function reportUpload(rows) {
  rule("1. ORÇAMENTO DE CARREGAMENTO, POR FOTO (medido em Chromium)");
  console.log(
    "\n  MP   entrada    descodif.  reduzir  codificar  miniatura   TOTAL CPU   saída      miniatura",
  );
  const byMp = new Map();
  for (const r of rows) {
    if (!byMp.has(r.mp)) byMp.set(r.mp, []);
    byMp.get(r.mp).push(r);
  }
  const summary = [];
  for (const [mp, rs] of [...byMp].sort((a, b) => a[0] - b[0])) {
    const s = {
      mp,
      inBytes: mean(rs.map((r) => r.bytes)),
      decodeMs: mean(rs.map((r) => r.decodeMs)),
      drawMs: mean(rs.map((r) => r.drawMs)),
      encodeMs: mean(rs.map((r) => r.encodeMs)),
      thumbMs: mean(rs.map((r) => r.thumbMs)),
      totalMs: mean(rs.map((r) => r.totalMs)),
      outBytes: mean(rs.map((r) => r.outBytes)),
      thumbBytes: mean(rs.map((r) => r.thumbBytes)),
      outDims: `${rs[0].outW}×${rs[0].outH}`,
      kept: rs.filter((r) => r.keptOriginal).length,
    };
    summary.push(s);
    console.log(
      `  ${String(mp).padStart(2)}   ${fmtMB(s.inBytes).padStart(6)}MB   ` +
        `${s.decodeMs.toFixed(0).padStart(7)}ms ${s.drawMs.toFixed(0).padStart(7)}ms ` +
        `${s.encodeMs.toFixed(0).padStart(8)}ms ${s.thumbMs.toFixed(0).padStart(9)}ms ` +
        `${s.totalMs.toFixed(0).padStart(9)}ms  ${fmtMB(s.outBytes).padStart(6)}MB  ` +
        `${fmtKB(s.thumbBytes).padStart(5)}KB` +
        (s.kept ? `  (${s.kept}/${rs.length} sem recodificar)` : ""),
    );
  }
  return summary;
}

function reportBatch(summary, uplinks) {
  rule(`2. UM LOTE DE ${BATCH} FOTOS — o processador ou a linha de envio?`);
  for (const s of summary) {
    const cpuSerial = (s.totalMs * BATCH) / 1000;
    // A thread principal é UMA: os 4 carregamentos em paralelo esperam todos
    // pela mesma fila de canvas/toBlob. O CPU não se divide por 4.
    const wireBytes = (s.outBytes + s.thumbBytes) * BATCH;
    console.log(
      `\n  ── Fotos de ${s.mp} MP ` +
        `(cada uma sai com ${fmtMB(s.outBytes)}MB + ${fmtKB(s.thumbBytes)}KB de miniatura) ──`,
    );
    console.log(
      `     CPU no navegador (thread principal, em série): ` +
        `${s.totalMs.toFixed(0)} ms × ${BATCH} = ${cpuSerial.toFixed(0)} s  (${(cpuSerial / 60).toFixed(1)} min)`,
    );
    console.log(`     Bytes a subir: ${(wireBytes / 1073741824).toFixed(2)} GB`);
    for (const mbps of uplinks) {
      const wireSec = (wireBytes * 8) / (mbps * 1e6);
      const limite = wireSec > cpuSerial ? "a LINHA" : "o CPU";
      console.log(
        `       · a ${String(mbps).padStart(3)} Mbps de envio → ${wireSec.toFixed(0).padStart(5)} s ` +
          `(${(wireSec / 60).toFixed(1)} min) — manda ${limite}` +
          ` (rácio linha/CPU = ${(wireSec / cpuSerial).toFixed(2)}×)`,
      );
    }
    const crossover = (((s.outBytes + s.thumbBytes) * 8) / (s.totalMs / 1000) / 1e6).toFixed(1);
    console.log(
      `     ⇒ Ponto de viragem: acima de ~${crossover} Mbps de envio, o gargalo passa a ser o CPU.`,
    );
  }
}

function reportCandidates(rows) {
  rule("3. CANDIDATOS — quanto é que cada mudança pouparia (medido)");
  const byMp = new Map();
  for (const r of rows) {
    if (!byMp.has(r.mp)) byMp.set(r.mp, []);
    byMp.get(r.mp).push(r);
  }
  for (const [mp, rs] of [...byMp].sort((a, b) => a[0] - b[0])) {
    const base = mean(rs.map((r) => r.totalMs));
    const baseBytes = mean(rs.map((r) => r.outBytes + r.thumbBytes));
    console.log(`\n  ── ${mp} MP — hoje: ${ms(base)} de CPU, ${fmtMB(baseBytes)}MB na rede ──`);
    for (const key of ["bitmapResize", "edge1600", "edge1400", "edge1600webp"]) {
      const t = mean(rs.map((r) => r.candidates[key].totalMs));
      const b = mean(rs.map((r) => r.candidates[key].outBytes + r.candidates[key].thumbBytes));
      const dims = rs[0].candidates[key];
      console.log(
        `     ${key.padEnd(14)} ${ms(t).padStart(9)} (${(((base - t) / base) * 100).toFixed(0)}% menos CPU)  ` +
          `${fmtMB(b).padStart(6)}MB (${(((baseBytes - b) / baseBytes) * 100).toFixed(0)}% menos bytes)  ` +
          `${dims.outW}×${dims.outH}`,
      );
    }
  }
}

function reportConcurrency(c) {
  if (!c) return;
  rule(`4. CONCORRÊNCIA — o pool de ${UPLOAD_CONCURRENCY} está mesmo a paralelizar?`);
  console.log(
    `\n  Quatro fotos de ${c.mp} MP, na mesma máquina (${c.cores} núcleos lógicos):\n` +
      `    4 em série                       ${ms(c.serial4).padStart(9)}  (${(c.serial4 / 4).toFixed(0)} ms/foto)\n` +
      `    4 pelo pool actual (thread princ.) ${ms(c.pool4).padStart(7)}  (${(c.pool4 / 4).toFixed(0)} ms/foto)  ` +
      `→ ganho ${(c.serial4 / c.pool4).toFixed(2)}×`,
  );
  if (c.workers4) {
    console.log(
      `    4 em 4 Web Workers (OffscreenCanvas) ${ms(c.workers4).padStart(5)}  (${(c.workers4 / 4).toFixed(0)} ms/foto)  ` +
        `→ ganho ${(c.serial4 / c.workers4).toFixed(2)}×`,
    );
  } else if (c.workersError) {
    console.log(`    4 em 4 Web Workers: FALHOU (${c.workersError})`);
  }
  console.log(
    `\n  ⇒ Subir o UPLOAD_CONCURRENCY não acelera a preparação: o trabalho de\n` +
      `    canvas está todo na mesma thread e limita-se a fazer fila. Quem\n` +
      `    paraleliza a sério são os workers.`,
  );
}

function reportServer(byMp) {
  rule("5. O SALTO DO MEIO — o que a função serverless paga só por estar lá");
  console.log("\n  (MEDIDO: ler o multipart + pôr os bytes em memória, em Node, na mesma máquina)");
  console.log("\n  MP    tamanho    ler multipart   arrayBuffer→Buffer   TOTAL na função");
  for (const [mp, rs] of [...byMp].sort((a, b) => a[0] - b[0])) {
    console.log(
      `  ${String(mp).padStart(2)}   ${fmtMB(mean(rs.map((r) => r.bytes))).padStart(6)}MB   ` +
        `${mean(rs.map((r) => r.parseMs))
          .toFixed(1)
          .padStart(10)} ms   ` +
        `${mean(rs.map((r) => r.toBufMs))
          .toFixed(1)
          .padStart(14)} ms   ` +
        `${mean(rs.map((r) => r.totalMs))
          .toFixed(1)
          .padStart(12)} ms`,
    );
  }
  console.log(
    "\n  NÃO MEDIDO (não há rede nem Supabase neste banco): o tempo do troço\n" +
      "  navegador→função e do troço função→Storage. O que se pode afirmar com\n" +
      "  segurança é ESTRUTURAL, e não precisa de cronómetro: os MESMOS bytes\n" +
      "  atravessam a rede DUAS vezes em série (a função só começa a enviar para o\n" +
      "  Storage depois de ter o corpo todo em memória — é o que o `await\n" +
      "  request.formData()` acima obriga). Subir directamente para o Storage com um\n" +
      "  URL assinado elimina o segundo troço por inteiro e o tecto de ~4,5 MB com ele.",
  );
}

function reportDisplay(rows, consumers) {
  rule(`6. ORÇAMENTO DE VISUALIZAÇÃO — abrir uma página de ${THEME_PAGE_SIZE} fotos`);
  const thumb = mean(rows.map((r) => r.thumbBytes));
  const orig = mean(rows.map((r) => r.outBytes));
  console.log(
    `\n  COM miniatura   ${THEME_PAGE_SIZE} × ${fmtKB(thumb)}KB = ${fmtMB(thumb * THEME_PAGE_SIZE)} MB` +
      `   (${THEME_PAGE_SIZE} pedidos de imagem + 1 à API)`,
  );
  console.log(
    `  SEM miniatura   ${THEME_PAGE_SIZE} × ${fmtMB(orig)}MB = ${fmtMB(orig * THEME_PAGE_SIZE)} MB` +
      `   (${THEME_PAGE_SIZE} pedidos de imagem + 1 à API)`,
  );
  console.log(
    `  ⇒ A biblioteca actual da Catarina não tem miniaturas nenhumas: cai toda no\n` +
      `    segundo caso, ou seja ${(orig / thumb).toFixed(0)}× mais bytes para desenhar células de ~150 px.`,
  );
  console.log(
    `\n  Nota sobre os pedidos: são ${THEME_PAGE_SIZE} URLs assinados distintos, todos para\n` +
      `  o mesmo host do Storage — em HTTP/2 vão numa só ligação, portanto o custo\n` +
      `  está nos BYTES e não no número de idas e voltas.`,
  );

  rule("7. DE QUE TAMANHO PRECISA MESMO O ORIGINAL?");
  console.log(
    `\n  Lido do código, não de memória:\n` +
      `    · Capa do PDF   caixa ${consumers.coverBoxPt.w}×${consumers.coverBoxPt.h} pt a ${consumers.coverDpi} DPI ` +
      `→ ${consumers.coverPx.w}×${consumers.coverPx.h} px\n` +
      `    · Mood board    caixa ${consumers.collageBoxPt.w.toFixed(0)}×${consumers.collageBoxPt.h.toFixed(0)} pt a ${consumers.collageDpi} DPI ` +
      `→ ${consumers.collagePx.w}×${consumers.collagePx.h} px  (uma foto sozinha na página, o pior caso)\n` +
      `    · Tecto rígido  MAX_IMAGE_EDGE_PX = ${consumers.maxEdge} px (nunca é atingido pelas caixas acima)\n` +
      `\n  ⇒ O maior número de pixéis que ALGUM sítio do PDF chega a desenhar é ` +
      `${consumers.largest} px de lado maior.\n` +
      `    Guardamos ${COVER_MAX_EDGE} px. São ${(COVER_MAX_EDGE / consumers.largest).toFixed(1)}× mais de lado, ` +
      `${((COVER_MAX_EDGE / consumers.largest) ** 2).toFixed(1)}× mais pixéis — que ninguém desenha.`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
rule("BANCO DE ENSAIO DAS FOTOS — Líquen Events");
console.log(
  `\n  Máquina: ${os.cpus().length} núcleos · ${os.cpus()[0]?.model?.trim() ?? "?"} · Node ${process.version}\n` +
    `  Pipeline sob ensaio: ${COVER_MAX_EDGE} px q${COVER_QUALITY} + miniatura ${THUMB_EDGE} px q${THUMB_QUALITY},\n` +
    `  ${UPLOAD_CONCURRENCY} carregamentos em paralelo, páginas de ${THEME_PAGE_SIZE} fotos.`,
);

console.log("\n  A preparar o corpus (fotos reais, recodificadas como um telemóvel)…");
const corpus = await buildCorpus();
console.log(
  `  ${corpus.length} ficheiros em ${MP_LEVELS.length} tamanhos (${MP_LEVELS.join("/")} MP), ` +
    `${fmtMB(corpus.reduce((a, c) => a + c.bytes, 0))} MB no total.\n`,
);

console.log("  A medir o pipeline no navegador…\n");
const { rows, concurrency } = await benchBrowser(corpus);

const summary = reportUpload(rows);
reportBatch(summary, UPLINKS);
reportCandidates(rows);
reportConcurrency(concurrency);

if (!BROWSER_ONLY) {
  const server = await benchServerHop(corpus);
  reportServer(server);
}

const consumers = await auditConsumers();
reportDisplay(rows, consumers);

if (JSON_OUT) {
  await fsp.writeFile(JSON_OUT, JSON.stringify({ rows, summary, consumers, concurrency }, null, 2));
  console.log(`\n  Números em bruto gravados em ${JSON_OUT}`);
}
rule();
