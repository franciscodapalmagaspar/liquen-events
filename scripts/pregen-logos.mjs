/**
 * Pré-gera os LOGÓTIPOS como ficheiros WebP estáticos.
 *
 * PORQUÊ. É o mesmo problema das miniaturas da galeria (ver o cabeçalho de
 * scripts/pregen-gallery.mjs), noutro sítio: a fita de clientes da página
 * inicial e a parede de /clientes desenham ~19 logótipos cada, e o logótipo da
 * Líquen aparece na barra de navegação de TODAS as páginas. Todos passavam pelo
 * `/_next/image`, ou seja, cada um deles era uma transformação on-demand com
 * quota mensal e com degradação medida de 13x sob rajada. Um logótipo que não
 * chega não é uma imagem em falta discreta: é o ícone de imagem partida no topo
 * da página, que foi exactamente uma das capturas de ecrã que a dona do site
 * mandou. Servidos como ficheiros estáticos do CDN, deixam de poder falhar.
 *
 * SAÍDA. public/_img/l/<chave>-<largura>.webp, para tudo o que está em
 * public/logos/ mais os dois logótipos de raiz (public/logo-liquen.png e
 * public/logo-liquen-branco.png e public/logo-liquen-marca.png).
 * ~0,7 MB — ao contrário das miniaturas da galeria (220 MB), isto é pequeno o
 * bastante para não valer a pena discutir se se versiona.
 *
 * ESCADA. [64, 128, 256, 384] — todas presentes em `images.imageSizes` do
 * next.config.ts, que é a condição para o browser as poder escolher: o
 * next/image só emite candidatos de deviceSizes ∪ imageSizes, por isso uma
 * largura fora dessa lista nunca seria pedida e o carregador teria de subir
 * para a seguinte (foi isso que custou +63% de bytes na primeira tentativa da
 * galeria). O topo é 384: um logótipo de cliente está limitado por CSS a 170px
 * de largura (ClientMarquee) ou a ~157px (ClientLogoGrid), ou seja ~340px num
 * ecrã de 2x.
 *
 * CACHE DE BUILD. Igual à da galeria: escreve-se primeiro em
 * .next/cache/pregen-logos/ (pasta que a Vercel preserva entre builds) e
 * liga-se por hardlink para public/_img/l. Um build em que nenhum logótipo
 * mudou não re-encoda nada.
 *
 * Corre automaticamente no `npm run build`; à parte com `npm run pregen`.
 */
import sharp from "sharp";
import { promises as fs } from "fs";
import { createHash } from "crypto";
import path from "path";
import os from "os";

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");
const LOGOS_DIR = path.join(PUBLIC, "logos");
const OUT_DIR = path.join(PUBLIC, "_img", "l");
const CACHE_DIR = path.join(ROOT, ".next", "cache", "pregen-logos");
const INDEX_FILE = path.join(CACHE_DIR, "index.json");

// Manter em sincronia com o carregador de logótipos (esse ficheiro é TS e não
// pode ser importado daqui).
const WIDTHS = [64, 128, 256, 384, 512];

/**
 * QUALIDADE 80 — escolhida por medição, não por hábito. Três coisas medidas:
 *
 * 1. A TRANSPARÊNCIA SOBREVIVE, e sobrevive EXACTAMENTE. As 21 fontes têm todas
 *    canal alfa (16 .avif + 5 .png). Comparando o alfa da saída WebP com o alfa
 *    da mesma fonte redimensionada sem passar por WebP, em 84 ficheiros e em
 *    todas as qualidades de 50 a 95, o erro máximo do canal alfa foi 0 — o
 *    `alphaQuality` do sharp é 100 por omissão, logo o alfa é sem perdas seja
 *    qual for a `quality`. A transparência, portanto, NÃO entra nesta escolha.
 *    (A verificação `perdeuAlfa` mais abaixo torna isto um invariante do build
 *    em vez de uma nota de rodapé.)
 *
 * 2. PARA 19 DAS 21, O RGB É DEITADO FORA PELO CSS. Tanto o ClientMarquee como
 *    o ClientLogoGrid desenham os logótipos de cliente com `brightness-0`, ou
 *    seja, silhuetas pretas: só o alfa se vê. Para esses, qualquer qualidade
 *    acima do mínimo compra zero pixels e paga bytes — medido, a 384px, 14,0 KB
 *    de média a q65 contra 15,1 KB a q80, ~+21 KB na parede inteira de 19.
 *
 * 3. A EXCEPÇÃO É A MARCA, E ESSA APARECE EM TODAS AS PÁGINAS. O
 *    logo-liquen.png sai a cores na barra de navegação, no rodapé, na proposta
 *    e no portal. Medido em erro visível (RGB pré-multiplicado pelo alfa, que é
 *    o que assenta sobre o fundo), a 384px: q65 deixa 0,58% dos pixels errados
 *    em mais de 8/255, q80 deixa 0,31%, q85 0,14%. Custo de q65 -> q80: 8,5 KB
 *    -> 9,5 KB. Um kilobyte para metade dos artefactos na única imagem que
 *    aparece em todos os ecrãs do site é barato; q85 pedia mais 0,8 KB para
 *    ganhar bem menos. (O logo-liquen-branco.png é uma silhueta branca lisa —
 *    erro máximo de 1/255 em qualquer qualidade, é indiferente.)
 *
 * Também se mediu WebP sem perdas: é exacto, mas a 384px custa +23% (19,5 KB
 * contra 15,9 KB de média) e o que compraria — RGB exacto — é justamente o que
 * o `brightness-0` deita fora em 19 dos 21 casos.
 */
const QUALITY = 80;

const CONCURRENCY = Number(process.env.PREGEN_CONCURRENCY) || Math.max(2, os.cpus().length);

/** Extensões que contam como logótipo. O SVG fica DE FORA de propósito: já é
    resolução-independente e minúsculo, rasterizá-lo para WebP só o pioraria. */
const IMAGE_EXT = /\.(avif|png|jpe?g|webp)$/i;

/**
 * Os dois logótipos da marca vivem na raiz de public/, não em public/logos/.
 * São listados à mão em vez de se varrer a raiz porque a raiz também tem
 * icon.png, apple-icon.png e afins — ícones de sistema operativo e de
 * separador, que ninguém desenha com <Image> e para os quais uma escada
 * responsiva não faz sentido nenhum.
 */
// Tem de ser igual ao `ROOT_LOGOS` de src/lib/site-image-loader.ts — um
// `.mjs` não importa TS, por isso quem verifica a sincronia é
// src/lib/site-image-loader.test.ts.
const ROOT_LOGOS = [
  "/logo-liquen.png",
  "/logo-liquen-branco.png",
  "/logo-liquen-marca.png",
  "/logo-liquen-recortado.png",
  "/logo-liquen-branco-recortado.png",
];

/** Mesma regra de chave que galleryKey() em scripts/pregen-gallery.mjs e que o
    carregador: basename sem extensão, tudo fora de [A-Za-z0-9_-] em "_". */
function logoKey(src) {
  const base = (src.split("/").pop() ?? src).replace(/\.[^.]+$/, "");
  return base.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Todos os ficheiros de imagem debaixo de public/logos/, como `src` do site
    ("/logos/…"). Recursivo: uma pasta nova de logótipos entra sozinha. */
async function readLogosDir(dir = LOGOS_DIR) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out; // public/logos/ pode não existir numa árvore mínima
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await readLogosDir(full)));
    else if (ent.isFile() && IMAGE_EXT.test(ent.name)) {
      out.push("/" + path.relative(PUBLIC, full).split(path.sep).join("/"));
    }
  }
  return out;
}

const sources = [...new Set([...ROOT_LOGOS, ...(await readLogosDir())])].sort();
if (sources.length === 0) {
  console.error("pregen-logos: não encontrei nenhum logótipo");
  process.exit(1);
}

// Dois logótipos com o mesmo basename dariam a mesma chave e um escreveria por
// cima do outro — silenciosamente, e a parede de clientes mostraria a marca
// errada, que é pior do que não mostrar nenhuma.
const byKey = new Map();
for (const src of sources) {
  const k = logoKey(src);
  if (byKey.has(k)) {
    console.error(`pregen-logos: colisão de chave "${k}": ${byKey.get(k)} e ${src}`);
    process.exit(1);
  }
  byKey.set(k, src);
}

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.mkdir(CACHE_DIR, { recursive: true });

/** Índice da cache: chave -> carimbo da fonte que a gerou. */
let index = {};
try {
  index = JSON.parse(await fs.readFile(INDEX_FILE, "utf8"));
} catch {
  index = {};
}

/** Carimbo de uma fonte: muda se o CONTEÚDO do ficheiro mudar, ou se as
    larguras/qualidade mudarem — nesse caso regenera-se tudo. A data de
    modificação não serve: o git não a guarda, e o clone de cada build da
    Vercel escreve todos os ficheiros com a data desse instante, o que fazia a
    cache falhar sempre. A razão completa está em scripts/pregen-gallery.mjs. */
function stamp(conteudo) {
  const resumo = createHash("sha1").update(conteudo).digest("hex");
  return `${resumo}:${conteudo.length}:${WIDTHS.join(",")}:${QUALITY}`;
}

const nextIndex = {};
const t0 = Date.now();
let encoded = 0;
let reused = 0;
let i = 0;
const bytesByWidth = Object.fromEntries(WIDTHS.map((w) => [w, 0]));
const countByWidth = Object.fromEntries(WIDTHS.map((w) => [w, 0]));
const failures = [];

async function link(from, to) {
  await fs.rm(to, { force: true });
  try {
    await fs.link(from, to);
  } catch {
    // Sistemas de ficheiros diferentes (ou sem suporte a hardlinks): copia.
    await fs.copyFile(from, to);
  }
}

async function worker() {
  for (;;) {
    const k = i++;
    if (k >= sources.length) return;
    const src = sources[k];
    const key = logoKey(src);

    // Validar o caminho antes de lhe tocar — ver a nota longa em
    // scripts/pregen-gallery.mjs. Quem faz o trabalho é o `path.relative`: se o
    // caminho resolvido sair de public/, a relativa começa com ".." ou é
    // absoluta.
    if (!/^\/[^\0]+\.(avif|png|jpe?g|webp)$/i.test(src)) {
      failures.push(`${src}: caminho de origem recusado`);
      continue;
    }
    const inputPath = path.resolve(PUBLIC, "." + src);
    const rel = path.relative(PUBLIC, inputPath);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
      failures.push(`${src}: caminho de origem fora de public/`);
      continue;
    }

    // Um só descritor para ver e para ler, para que o `stat` que decide a cache
    // e o `read` que a preenche falem do mesmo ficheiro.
    let fh;
    try {
      fh = await fs.open(inputPath, "r");
    } catch {
      failures.push(`${src}: ficheiro de origem não existe`);
      continue;
    }

    let want;
    try {
      // Um read só, para o carimbo e para a codificação.
      let input;
      try {
        input = await fh.readFile();
      } catch (err) {
        failures.push(`${src}: ${err.message}`);
        continue;
      }
      want = stamp(input);

      // Reaproveitar da cache quando a fonte não mudou E todos os ficheiros
      // estão lá (uma cache truncada regenera em vez de mentir).
      let cached = index[key] === want;
      if (cached) {
        for (const w of WIDTHS) {
          try {
            await fs.access(path.join(CACHE_DIR, `${key}-${w}.webp`));
          } catch {
            cached = false;
            break;
          }
        }
      }

      if (!cached) {
        let meta;
        try {
          meta = await sharp(input).metadata();
        } catch (err) {
          failures.push(`${src}: ${err.message}`);
          continue;
        }
        let perdeuAlfa = false;
        for (const w of WIDTHS) {
          // Nunca ampliar acima da fonte (igual ao next/image). Um logótipo de
          // 304px de largura fica com o ficheiro "-384" a 304px reais: o nome
          // existe (é o contrato), os pixels não são inventados.
          const target = meta.width ? Math.min(w, meta.width) : w;
          const buf = await sharp(input)
            .resize(target, null, { withoutEnlargement: true })
            .webp({ quality: QUALITY })
            .toBuffer();

          /**
           * A TRANSPARÊNCIA TEM DE SOBREVIVER, E CONFERE-SE.
           *
           * Todos os 21 logótipos têm fundo transparente, e é assim que assentam
           * na fita escura da página inicial e na parede clara de /clientes. Um
           * encode que os achatasse contra um rectângulo opaco não daria erro
           * nenhum — daria caixas brancas (ou pretas) à volta de cada marca, e
           * ninguém daria por isso até estar publicado. Medir custa um
           * `metadata()` sobre um buffer que já está em memória, só no encode.
           */
          if (meta.hasAlpha && !(await sharp(buf).metadata()).hasAlpha) perdeuAlfa = true;

          await fs.writeFile(path.join(CACHE_DIR, `${key}-${w}.webp`), buf);
        }
        if (perdeuAlfa) {
          failures.push(`${src}: o WebP perdeu o canal alfa (fundo transparente)`);
          continue;
        }
        encoded++;
      } else {
        reused++;
      }
    } finally {
      await fh.close();
    }

    for (const w of WIDTHS) {
      const cacheFile = path.join(CACHE_DIR, `${key}-${w}.webp`);
      await link(cacheFile, path.join(OUT_DIR, `${key}-${w}.webp`));
      const s = await fs.stat(cacheFile);
      bytesByWidth[w] += s.size;
      countByWidth[w]++;
    }
    nextIndex[key] = want;
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Um logótipo que falhe é um ícone de imagem partida no topo de todas as
// páginas. Melhor falhar o build do que publicar isso.
if (failures.length) {
  console.error(`pregen-logos: ${failures.length} logótipo(s) falharam:`);
  for (const f of failures.slice(0, 20)) console.error(`  - ${f}`);
  process.exit(1);
}

/**
 * CONFERIR A SAÍDA, ficheiro a ficheiro, antes de dizer que correu bem.
 *
 * Nenhum passo ter lançado excepção não é a mesma coisa que a saída estar
 * completa: um `link()` que caia no ramo de fallback, uma cache parcial de uma
 * corrida interrompida, um disco cheio a meio — e o build passa verde com
 * ficheiros em falta. O contrato é este: PARA CADA logótipo e CADA largura da
 * escada existe um ficheiro, e não tem zero bytes. Ou se verifica, ou não é um
 * contrato.
 */
const missing = [];
const badKeys = new Set();
for (const src of sources) {
  const key = logoKey(src);
  for (const w of WIDTHS) {
    const out = path.join(OUT_DIR, `${key}-${w}.webp`);
    try {
      const s = await fs.stat(out);
      if (s.size === 0) {
        missing.push(`${key}-${w}.webp (0 bytes)`);
        badKeys.add(key);
      }
    } catch {
      missing.push(`${key}-${w}.webp`);
      badKeys.add(key);
    }
  }
}
if (missing.length) {
  /**
   * FALHAR ALTO, MAS NÃO ENCRAVAR PARA SEMPRE.
   *
   * A cache vive em .next/cache/, que a Vercel guarda entre builds. Uma entrada
   * má lá dentro (uma escrita cortada a meio por um build cancelado, por
   * exemplo) tem o carimbo certo e o ficheiro no sítio — só que vazio. Sem isto,
   * a verificação reprovava-a hoje e voltaria a reprová-la em TODOS os builds
   * seguintes, e a única saída seria alguém ir limpar a cache à mão. Deitando
   * fora as entradas culpadas antes de sair, este build falha (que é o que tem
   * de fazer) e o próximo regenera-as sozinho.
   */
  for (const key of badKeys) {
    for (const w of WIDTHS) {
      await fs.rm(path.join(CACHE_DIR, `${key}-${w}.webp`), { force: true });
      await fs.rm(path.join(OUT_DIR, `${key}-${w}.webp`), { force: true });
    }
  }
  console.error(
    `pregen-logos: ${missing.length} ficheiro(s) em falta na saída, de ` +
      `${sources.length * WIDTHS.length} esperados:`,
  );
  for (const m of missing.slice(0, 20)) console.error(`  - ${m}`);
  console.error(
    `  ${badKeys.size} entrada(s) da cache deitadas fora — uma nova corrida regenera-as.`,
  );
  process.exit(1);
}

// Limpeza: ficheiros de logótipos que já não existem, tanto na saída como na
// cache (senão a cache cresce para sempre).
const wanted = new Set();
for (const key of byKey.keys()) for (const w of WIDTHS) wanted.add(`${key}-${w}.webp`);
let pruned = 0;
for (const dir of [OUT_DIR, CACHE_DIR]) {
  for (const name of await fs.readdir(dir)) {
    if (name === "index.json" || wanted.has(name)) continue;
    await fs.rm(path.join(dir, name), { force: true, recursive: true });
    pruned++;
  }
}

await fs.writeFile(INDEX_FILE, JSON.stringify(nextIndex), "utf8");

const seconds = (Date.now() - t0) / 1000;
const totalBytes = Object.values(bytesByWidth).reduce((a, b) => a + b, 0);
console.log(
  `pregen-logos: ${sources.length} logótipos x ${WIDTHS.length} larguras = ` +
    `${sources.length * WIDTHS.length} ficheiros (${(totalBytes / 1024).toFixed(0)} KB) ` +
    `em ${seconds.toFixed(1)}s — ${encoded} encodados, ${reused} reaproveitados da cache` +
    (pruned ? `, ${pruned} obsoletos removidos` : ""),
);
console.log(
  "  " +
    WIDTHS.map(
      (w) => `w=${w}: ${(bytesByWidth[w] / countByWidth[w] / 1024).toFixed(1)}KB média`,
    ).join("  "),
);
