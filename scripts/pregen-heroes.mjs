/**
 * Pre-generates the marketing heroes as static, responsive WebP files under
 * public/_img so the FIRST visitor to any page gets a sharp hero immediately —
 * no on-demand `/_next/image` cold-encode (the "blurred placeholder, then it
 * snaps into focus" gap on the very first request after a fresh deploy).
 *
 * Each hero <Image> uses the `heroImageLoader` (src/lib/hero-image-loader.ts),
 * which rewrites its srcset to `/_img/<key>-<w>.webp`. This script produces
 * exactly those files. Runs automatically before every build (`prebuild`), and
 * on demand with `npm run pregen`.
 *
 * Keep HERO_SOURCES / HERO_WIDTHS / the key sanitiser in sync with
 * src/lib/hero-image-loader.ts (that module is TS and can't be imported here).
 */
import sharp from "sharp";
import { promises as fs } from "fs";
import { createHash } from "crypto";
import path from "path";

const PUBLIC = path.join(process.cwd(), "public");
const OUT_DIR = path.join(PUBLIC, "_img");
/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE JÁ ESTÁ FEITO NÃO SE VOLTA A FAZER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este pré-gerador re-codificava as 43 origens × 4 larguras a CADA build,
 * mesmo sem nada ter mudado — os ficheiros estão versionados em `public/_img`,
 * portanto o trabalho era todo deitado fora por cima de si próprio. Enquanto
 * era só WebP passou despercebido. Com o AVIF a juntar-se (que é muito mais
 * lento a codificar), o build da Vercel do commit dos heróis em AVIF morreu aos
 * ~45 minutos, que é o tecto dela. Aqui neste contentor a mesma passagem levou
 * 17 minutos só nos heróis.
 *
 * O manifesto guarda, por origem, um carimbo (hash do ficheiro-fonte + os
 * ajustes de codificação) e o TAMANHO de cada ficheiro produzido. Uma origem
 * só é re-codificada se o carimbo mudar ou se algum dos ficheiros faltar ou
 * tiver outro tamanho — o que também apanha o caso em que alguém gravou no
 * repositório um ficheiro truncado a meio de uma codificação (aconteceu: 132
 * dos 172 AVIF foram commitados com o encode ainda a correr).
 *
 * Vive fora de `public/` de propósito: é metadado de build, não um recurso
 * para servir. Está versionado para que um clone fresco (a Vercel faz um por
 * deploy) já saiba que não tem nada a fazer.
 */
const MANIFESTO = path.join(process.cwd(), "scripts", "pregen-heroes.manifest.json");

// The six full-bleed page heroes (kept in sync with each page + HeroWarm).
const HERO_SOURCES = [
  // Os seis heróis de página originais.
  "/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg", // antiga capa da home (continua em uso)
  "/imagens/entrada-floresta-clara.jpg", // home: 1.º fotograma do vídeo da entrada, sem as tiras pretas
  "/imagens/hd-edited.jpg", // sobre
  "/imagens/EW1_1330.jpg", // servicos
  "/imagens/DaniGui_Preview20.jpg", // galeria
  "/imagens/galeria-jun26-16.jpg", // /servicos, faixa das celebrações
  "/imagens/DJI_20250913190635_0120_D.jpg", // contacto
  "/imagens/EW1_1393.jpg", // clientes
  // Fundos de secção, faixas e capas de serviço — tudo o que é desenhado a
  // `sizes="100vw"`. Ver o comentário em src/lib/hero-image-loader.ts: a lista
  // foi recolhida a MEDIR o `naturalWidth` contra a caixa em pixels de
  // dispositivo, não a adivinhar, e TEM de ser igual à de lá (há um teste).
  "/imagens/DaniGui_Adois_61.jpg",
  "/imagens/DaniGui_JantarFesta_130.jpg",
  "/imagens/DaniGui_JantarFesta_18.jpg",
  "/imagens/DaniGui_JantarFesta_26.jpg",
  "/imagens/DaniGui_JantarFesta_48.jpg",
  "/imagens/EW1_1332.jpg",
  "/imagens/EW1_1333.jpg",
  "/imagens/EW1_1404.jpg",
  "/imagens/EW1_1405.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A4463.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A4472.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A4738.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A5248.jpg",
  "/imagens/JOAO_E_PEDRO_IMGL2823.jpg",
  "/imagens/J&A-68.jpg",
  "/imagens/M&F0497.jpg",
  "/imagens/Natalia e Jonathan-198.jpg",
  "/imagens/stephanie-mizio-555.jpg",
  "/imagens/stephanie-mizio-715.jpg",
  "/imagens/stephanie-mizio-760.jpg",
  "/imagens/viaturas-classicas.jpg",
  // Heróis das landing pages das campanhas (src/lib/ads/polos.ts).
  "/imagens/EW1_1392.jpg",
  "/imagens/J&A-243.jpg",
  "/imagens/teresinhaeze-1434.jpg",
  "/imagens/DaniGui_Preview79.jpg",
  "/imagens/M&F0508.jpg",
  "/imagens/EW1_0580.jpg",
  "/imagens/EW1_0365.jpg",
  "/imagens/EW1_0363.jpg",
  "/imagens/J&A-442.jpg",
  "/imagens/matilde-e-tomas28.jpg",
  "/imagens/EW1_1396.jpg",
  "/imagens/stephanie-mizio-7.jpg",
  "/imagens/M&F0502.jpg",
  "/imagens/EW1_1342.jpg",
  "/imagens/J&A-52.jpg",
  "/imagens/M&F0515.jpg",
];

// The widths the loader snaps to. A hero is 100vw, so these span phone → 2x
// desktop; the loader rounds each srcset candidate up to the nearest of these.
const HERO_WIDTHS = [640, 1080, 1536, 2048];

// Same sanitiser as heroKey() in the loader: basename without extension, with
// anything outside [A-Za-z0-9_-] collapsed to "_".
function heroKey(src) {
  const base = src
    .split("/")
    .pop()
    .replace(/\.[^.]+$/, "");
  return base.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Os ajustes de codificação fazem parte do carimbo: mudá-los invalida tudo. */
const AJUSTES = `l:${HERO_WIDTHS.join(",")}|webp:q75e6|avif:q46e4`;

/** Carimbo de uma origem: o conteúdo dela mais os ajustes. Não usa `mtime` —
    num clone fresco o `mtime` é a hora do checkout e nunca coincidiria. */
async function carimboDe(inputPath) {
  const conteudo = await fs.readFile(inputPath);
  const hash = createHash("sha256").update(conteudo).digest("hex").slice(0, 16);
  return `${AJUSTES}|${hash}`;
}

/** Todos os ficheiros da entrada existem e têm o tamanho que ela diz? */
async function saidaIntacta(ficheiros) {
  if (!ficheiros || typeof ficheiros !== "object") return false;
  for (const [nome, tamanho] of Object.entries(ficheiros)) {
    try {
      const st = await fs.stat(path.join(OUT_DIR, nome));
      if (st.size !== tamanho) return false;
    } catch {
      return false;
    }
  }
  return true;
}

let manifesto = {};
try {
  manifesto = JSON.parse(await fs.readFile(MANIFESTO, "utf8"));
} catch {
  // Sem manifesto (a primeira vez, ou apagado de propósito): gera tudo.
}

await fs.mkdir(OUT_DIR, { recursive: true });

let written = 0;
let saltadas = 0;
const novoManifesto = {};
for (const src of HERO_SOURCES) {
  const inputPath = path.join(PUBLIC, src);
  const key = heroKey(src);
  let meta;
  try {
    meta = await sharp(inputPath).metadata();
  } catch (err) {
    console.warn(`skip ${src}: ${err.message}`);
    continue;
  }

  const carimbo = await carimboDe(inputPath);
  const anterior = manifesto[key];
  if (anterior?.carimbo === carimbo && (await saidaIntacta(anterior.ficheiros))) {
    novoManifesto[key] = anterior;
    saltadas += 1;
    continue;
  }

  const ficheiros = {};
  for (const w of HERO_WIDTHS) {
    // Never upscale past the source width (matches next/image behaviour).
    const target = meta.width ? Math.min(w, meta.width) : w;
    const outPath = path.join(OUT_DIR, `${key}-${w}.webp`);
    await sharp(inputPath)
      .resize(target, null, { withoutEnlargement: true })
      // `effort: 6` (a omissão do sharp é 4) NÃO mexe na qualidade pedida —
      // manda o codificador procurar melhor a mesma qualidade. Sai o mesmo
      // q75, em menos bytes, à custa de tempo de BUILD (que ninguém espera).
      // MEDIDO, ficheiro a ficheiro, sobre o MESMO conjunto (as 4 larguras das
      // 43 origens que existem em disco, 172 ficheiros):
      //   effort 4: 21,00 MB      effort 6: 19,93 MB      −5,1% (1097 KB)
      // Em /clientes, nos três degraus de 1536 px que a página usa:
      //   DJI_…_0120_D  282,0 -> 264,2 KB
      //   EW1_1404      123,0 -> 117,5 KB
      //   EW1_1393       83,2 ->  80,2 KB
      // Baixar o `quality` renderia mais, e foi medido: na foto de drone, q65
      // dava 228,5 KB mas custava 1,35 dB de PSNR contra o original (33,78 ->
      // 32,43 dB). NÃO foi aplicado — estes ficheiros são heróis a toda a
      // largura, e há véus que os tapam mas há páginas onde não há.
      .webp({ quality: 75, effort: 6 })
      .toFile(outPath);
    ficheiros[`${key}-${w}.webp`] = (await fs.stat(outPath)).size;
    written++;

    /**
     * ── E O MESMO EM AVIF ────────────────────────────────────────────────
     *
     * MEDIDO, e é o buraco que faltava: a grelha da galeria tem 2785 ficheiros
     * AVIF e esta pasta tinha 192 WebP e ZERO. Os heróis ficaram de fora da
     * conversão. E não é uma imagem qualquer — na secretária o herói É o
     * elemento de LCP (3388 ms, 104,6 KB em WebP a 2048 px).
     *
     * `quality: 46`, MEDIDO — e a primeira tentativa foi a 55, que não valeu
     * nada. Copiei a relação da galeria (AVIF q52 contra WebP q65) sem reparar
     * que aqui a linha de base é OUTRA: os heróis são WebP q75, não q65. A
     * q55, metade dos ficheiros saíam MAIORES do que o WebP que substituíam, e
     * no herói que é o elemento de LCP a poupança era de 1 KB em 102.
     *
     * A curva, no herói de LCP (DaniGui_Preview20 a 2048 px), com PSNR contra
     * o mesmo redimensionamento sem perdas — a mesma métrica que já decidiu o
     * `quality: 75` do WebP aqui em cima:
     *
     *   WebP  q75   102 KB   38,67 dB   ← o que serve hoje
     *   AVIF  q50    82 KB   39,20 dB   (−20 %, e MELHOR qualidade)
     *   AVIF  q46    63 KB   38,44 dB   (−38 %, −0,23 dB)
     *   AVIF  q42    51 KB   37,73 dB   (−50 %, −0,94 dB)
     *
     * Escolhido q46: −38 % dos bytes por 0,23 dB. O comentário do WebP aqui
     * em cima recusou uma troca de 1,35 dB por −19 % — esta é seis vezes mais
     * barata em qualidade e o dobro em bytes.
     *
     * `effort: 4` e não mais: a curva está medida na galeria — 3 → 4 custa
     * 5,5x o tempo de encode para 6% de bytes. Aqui são 43 origens × 4
     * larguras e o build já espera pelo pré-gerador da galeria.
     */
    const avifPath = path.join(OUT_DIR, `${key}-${w}.avif`);
    await sharp(inputPath)
      .resize(target, null, { withoutEnlargement: true })
      .avif({ quality: 46, effort: 4 })
      .toFile(avifPath);
    ficheiros[`${key}-${w}.avif`] = (await fs.stat(avifPath)).size;
    written++;
  }

  novoManifesto[key] = { carimbo, ficheiros };
}

// O manifesto é escrito só no fim e por inteiro: uma corrida interrompida a
// meio não deixa para trás um manifesto que jure que o trabalho está feito.
await fs.writeFile(MANIFESTO, `${JSON.stringify(novoManifesto, null, 2)}\n`);

console.log(
  `pregen-heroes: wrote ${written} files to public/_img (${saltadas} origens já estavam feitas)`,
);
