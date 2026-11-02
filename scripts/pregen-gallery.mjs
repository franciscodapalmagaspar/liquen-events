/**
 * Pré-gera as MINIATURAS de TODAS as fotos do site como ficheiros WebP
 * estáticos.
 *
 * PORQUÊ. Ver o cabeçalho de src/app/[lang]/galeria/gallery-image-loader.ts.
 * Em resumo: cada miniatura da grelha era uma transformação on-demand no
 * `/_next/image` (431 a 442 URLs distintos numa travessia completa, 2 637 na
 * união de 8 classes de dispositivo). Isso põe o carregamento de CADA foto
 * dependente de um serviço com quota mensal e com degradação medida de 13x sob
 * rajada (219 ms isolado -> 2 900 ms em 30 simultâneas). Servidas como
 * ficheiros estáticos do CDN, as miniaturas deixam de ter quota, encode,
 * arranque a frio ou tempo esgotado — deixam de poder falhar.
 *
 * PORQUÊ TODAS E NÃO SÓ AS DA GALERIA. Retirar a galeria do optimizador
 * resolveu a galeria e mais nada: o menu, o portefólio das páginas de serviço e
 * os fundos de secção continuavam a passar pelo `/_next/image`, e é aí que a
 * dona do site continuava a ver ícones de imagem partida. As fotos que essas
 * páginas desenham vêm todas da MESMA pasta (public/imagens/), mas nem todas
 * estão em photos-data.ts — são 557 ficheiros contra 427 na galeria. Gerar só
 * as 427 deixava 130 sem ficheiro estático, ou seja, deixava o problema de pé
 * exactamente onde ele estava a ser visto. A regra passa a ser simples e sem
 * excepções: TODO o ficheiro de imagem em public/imagens/ tem escada estática.
 *
 * SAÍDA. public/_img/g/<chave>-<largura>.webp, para todos os ficheiros de
 * imagem de public/imagens/ nas larguras de GALLERY_WIDTHS. NÃO é versionado
 * (ver .gitignore): são ~220 MB de WebP incompressível (gzip -1 poupa 0,2%) que
 * o build regenera de graça.
 *
 * CACHE DE BUILD. A saída é primeiro escrita em .next/cache/pregen-gallery/
 * (pasta que a Vercel preserva entre builds) e depois ligada por hardlink para
 * public/_img/g. Um build em que nenhuma foto mudou não re-encoda nada: só
 * refaz os links (~3 s). Só o primeiro build de cada foto paga o encode.
 *
 * Manter WIDTHS / QUALITY / galleryKey() em sincronia com
 * src/app/[lang]/galeria/gallery-image-loader.ts (esse ficheiro é TS e não
 * pode ser importado daqui). O teste gallery-image-loader.test.ts falha se
 * saírem de sincronia.
 *
 * Corre automaticamente no `npm run build`; à parte com `npm run pregen`.
 * Os logótipos têm escada e pasta próprias — ver scripts/pregen-logos.mjs.
 */
import sharp from "sharp";
import { promises as fs } from "fs";
import { createHash } from "crypto";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  VERSAO_ANALISE,
  agruparCenas,
  analisarFoto,
  quantil,
  serveParaDestaque,
} from "./galeria-analise.mjs";

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");
const IMAGES_DIR = path.join(PUBLIC, "imagens");
const OUT_DIR = path.join(PUBLIC, "_img", "g");
const CACHE_DIR = path.join(ROOT, ".next", "cache", "pregen-gallery");
const INDEX_FILE = path.join(CACHE_DIR, "index.json");

/** Extensões que contam como foto. Em sincronia com o teste de caminho lá em
    baixo — o que este filtro deixa entrar tem de passar nesse teste. */
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/**
 * public/imagens/_intake/ é a bandeja de entrada de scripts/gallery-sync.mjs:
 * fotos que ainda NÃO fazem parte do site e que o sync move para
 * public/imagens/ quando entram mesmo. Gerar-lhes a escada seria encode pago
 * por fotos que nada desenha e, pior, uma foto em trânsito existiria nos dois
 * sítios com o mesmo basename — ou seja, uma colisão de chave a falhar o build
 * a meio de um `gallery:sync`.
 */
const SKIP_DIRS = new Set(["_intake"]);

// Em sincronia com GALLERY_WIDTHS / GALLERY_QUALITY do loader.
const WIDTHS = [384, 640, 768, 1024, 1280];
const QUALITY = 65;

/**
 * ── AVIF, ao lado do WebP ──────────────────────────────────────────────────
 *
 * O WebP continua a existir e continua a ser o que qualquer browser recebe se
 * não souber AVIF: é a rede de segurança, não um plano B teórico. O AVIF vai à
 * frente na negociação do `<picture>`.
 *
 * PORQUÊ VALE A PENA, medido nesta pasta (16 fotos, as 5 larguras da escada):
 *
 *   webp q65 (o que havia)   19,4 / 44,8 / 60,6 / 101,4 / 152,3 KB
 *   avif q52 effort 3        cerca de -30% em todas as larguras
 *
 * PORQUÊ QUALIDADE 52. As escalas não são comparáveis entre formatos, por isso
 * a escolha foi MEDIDA e não arbitrada (scripts/comparar-qualidade.mjs, SSIM
 * contra o original, 8 fotos a 768 e 1024 px):
 *
 *   webp q65 (o que havia)   SSIM 0,9312   62,9 KB
 *   webp q72                 SSIM 0,9392   72,1 KB
 *   webp q75                 SSIM 0,9423   76,1 KB
 *   avif q52 (o novo)        SSIM 0,9330   50,4 KB
 *   avif q60                 SSIM 0,9505   73,8 KB
 *
 * O q52 do AVIF é o mesmo ponto de qualidade do q65 do WebP que substitui
 * (0,9330 contra 0,9312 — a diferença não se vê) por menos 20% de bytes. NÃO
 * chega ao q75 do WebP; uma versão anterior deste comentário dizia que sim, e
 * era falso.
 *
 * Se um dia se quiser mais nitidez do que bytes, o degrau é o `avif q60`: sobe
 * o SSIM 0,018 (a maior subida da tabela) mas fica 17% MAIS pesado do que o
 * WebP que havia — ou seja, desfaz a poupança. Fica dito, com o número ao lado,
 * para essa ser uma decisão e não uma descoberta.
 *
 * PORQUÊ effort 3 E NÃO O 4 POR OMISSÃO. Medido nesta máquina, por ficheiro:
 *   effort 0 → 43,1 KB · 129 ms      effort 3 → 40,0 KB ·  470 ms
 *   effort 2 → 42,2 KB · 306 ms      effort 4 → 37,5 KB · 2575 ms
 * O 4 custa 5,5x o tempo do 3 para poupar 6% dos bytes. Com 557 fotos x 5
 * larguras isso é a diferença entre acrescentar ~6 minutos ao primeiro build e
 * acrescentar ~1 hora — e o build da Vercel tem limite. Os ficheiros ficam em
 * .next/cache, portanto este custo paga-se UMA vez por fotografia.
 */
const AVIF_QUALITY = 52;
const AVIF_EFFORT = 3;
/** As duas famílias, para os sítios que percorrem a escada toda. */
const FORMATOS = [
  { ext: "webp", encode: (s) => s.webp({ quality: QUALITY }) },
  { ext: "avif", encode: (s) => s.avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT }) },
];

// sharp já é multi-thread no seu próprio pool; mais workers do que núcleos só
// serve para manter o pool cheio enquanto uns fazem I/O.
const CONCURRENCY = Number(process.env.PREGEN_CONCURRENCY) || Math.max(2, os.cpus().length);

/** Mesma função que galleryKey() no loader. */
function galleryKey(src) {
  const base = (src.split("/").pop() ?? src).replace(/\.[^.]+$/, "");
  return base.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * As fotos DA GALERIA, lidas do módulo de dados (é TS, por isso lê-se como
 * texto). Já não é a lista de trabalho — é só o subconjunto que precisa de cor
 * em tile-colors.json, e a lista que TEM de existir no disco.
 */
async function readGallerySources() {
  const dataFile = path.join(ROOT, "src", "app", "[lang]", "(site)", "galeria", "photos-data.ts");
  const raw = await fs.readFile(dataFile, "utf8");
  const sources = [...raw.matchAll(/src: "([^"]+)"/g)].map((m) => m[1]);
  if (sources.length === 0) {
    throw new Error("pregen-gallery: não encontrei nenhuma foto em photos-data.ts");
  }
  return [...new Set(sources)];
}

/** Todos os ficheiros de imagem debaixo de public/imagens/, como `src` do site
    ("/imagens/…"). Recursivo: uma pasta nova de fotos entra sozinha. */
async function readDiskSources(dir = IMAGES_DIR) {
  const out = [];
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      out.push(...(await readDiskSources(full)));
    } else if (ent.isFile() && IMAGE_EXT.test(ent.name)) {
      out.push("/" + path.relative(PUBLIC, full).split(path.sep).join("/"));
    }
  }
  return out;
}

const gallerySources = await readGallerySources();
const GALLERY_SRCS = new Set(gallerySources);

/**
 * A UNIÃO, e não só o disco.
 *
 * Se uma foto estiver em photos-data.ts e não no disco, enumerar só o disco
 * fazia-a desaparecer da lista de trabalho E da verificação final — build
 * verde, mosaico partido em produção. Somando as duas listas, essa foto entra
 * na lista, não abre, e o script falha com "ficheiro de origem não existe", que
 * é o que tem de acontecer.
 */
const sources = [...new Set([...gallerySources, ...(await readDiskSources())])].sort();

// Duas fotos com o mesmo basename dariam a mesma chave e uma escreveria por
// cima da outra — silenciosamente, e a galeria mostraria a foto errada.
const byKey = new Map();
for (const src of sources) {
  const k = galleryKey(src);
  if (byKey.has(k)) {
    throw new Error(`pregen-gallery: colisão de chave "${k}": ${byKey.get(k)} e ${src}`);
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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PACOTE DO GITHUB — A CACHE QUE NÃO DEPENDE DA VERCEL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A 13/10 nenhum deploy acabava: a Vercel restaurou uma cache de build ANTIGA,
 * sem as miniaturas da galeria, e este script pôs-se a codificar as ~1000
 * fotos (5 larguras × WebP e AVIF). Medido: ~10 s de processador por foto —
 * numa máquina de 2 núcleos, hora e meia. A Vercel corta aos 45 minutos, e o
 * registo ficava mudo até lá. Era o mesmo defeito de agosto («meia hora de
 * build, em cada build»), que a cache da Vercel tinha escondido — até ao dia em
 * que ela não veio.
 *
 * A CI do GitHub tem a SUA cache destas miniaturas (`actions/cache`), sempre
 * quente, e publica-a como um ficheiro do repositório (a release
 * `pregen-cache`, ver .github/workflows/ci.yml). Quando aqui faltam muitas,
 * descarrega-se esse pacote — segundos — e só se codifica o que for mesmo
 * novo. Sem pacote (rede em baixo, ainda não publicado), segue como antes.
 *
 * O pacote só ACRESCENTA: o que já está nesta cache não é tocado, e cada
 * entrada continua a ser conferida pelo carimbo do CONTEÚDO da fotografia —
 * um ficheiro do pacote que não corresponda à foto de agora é recodificado.
 */
const LIMIAR_DO_PACOTE = 25;
const URL_DO_PACOTE =
  process.env.PREGEN_PACOTE_URL ||
  "https://github.com/LiquenEvents/liquen-events/releases/download/pregen-cache/pregen-gallery.tar";
{
  const emFalta = [...byKey.keys()].filter((k) => !index[k]).length;
  if (emFalta > LIMIAR_DO_PACOTE && !process.env.PREGEN_SEM_PACOTE) {
    const t = Date.now();
    console.log(`pregen-gallery: faltam ${emFalta} fotos na cache — a descarregar o pacote…`);
    try {
      index = await juntarOPacote(index);
      const ainda = [...byKey.keys()].filter((k) => !index[k]).length;
      console.log(
        `pregen-gallery: pacote junto em ${((Date.now() - t) / 1000).toFixed(1)}s — ` +
          `faltam agora ${ainda}`,
      );
    } catch (err) {
      console.warn(`pregen-gallery: sem pacote (${err.message}) — segue a codificar tudo`);
    }
  }
}

/** Descarrega o pacote, abre-o ao lado da cache e junta só o que falta. */
async function juntarOPacote(atual) {
  const resposta = await fetch(URL_DO_PACOTE, { signal: AbortSignal.timeout(240_000) });
  if (!resposta.ok || !resposta.body) throw new Error(`HTTP ${resposta.status}`);
  const pasta = path.join(ROOT, ".next", "cache", "pregen-pacote");
  await fs.rm(pasta, { recursive: true, force: true });
  await fs.mkdir(pasta, { recursive: true });
  const tar = path.join(pasta, "pacote.tar");
  // Às postas para o disco: são ~600 MB, que não têm de passar pela memória.
  await pipeline(Readable.fromWeb(resposta.body), createWriteStream(tar));
  const r = spawnSync("tar", ["-xf", tar, "-C", pasta], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("tar falhou");
  await fs.rm(tar, { force: true });

  const doPacote = JSON.parse(await fs.readFile(path.join(pasta, "index.json"), "utf8"));
  const junto = { ...atual };
  for (const [chave, entrada] of Object.entries(doPacote)) {
    if (junto[chave] || !byKey.has(chave)) continue;
    // Só entra se TODOS os ficheiros da chave vieram no pacote; senão a
    // entrada fica de fora e a foto é codificada como antes.
    const nomes = WIDTHS.flatMap((w) => FORMATOS.map((f) => `${chave}-${w}.${f.ext}`));
    const temTudo = (
      await Promise.all(
        nomes.map((n) =>
          fs.access(path.join(pasta, n)).then(
            () => true,
            () => false,
          ),
        ),
      )
    ).every(Boolean);
    if (!temTudo) continue;
    for (const n of nomes) {
      const destino = path.join(CACHE_DIR, n);
      await fs.rm(destino, { force: true });
      await fs.rename(path.join(pasta, n), destino);
    }
    junto[chave] = entrada;
  }
  await fs.rm(pasta, { recursive: true, force: true });
  return junto;
}

/**
 * Carimbo de uma fonte: muda se o CONTEÚDO do ficheiro mudar, ou se as
 * larguras/qualidade mudarem — nesse caso toda a galeria é regenerada.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * PORQUÊ O CONTEÚDO E NÃO A DATA DE MODIFICAÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O carimbo era `mtime:tamanho`, e nessa forma esta cache NUNCA acertava na
 * Vercel — só em desenvolvimento, onde os ficheiros ficam quietos no disco.
 *
 * O git não guarda datas de modificação. Cada build começa por um clone
 * limpo, e o clone escreve os 557 ficheiros com a data desse instante: duas
 * fotos commitadas com meses de diferença saem do clone com o mesmo carimbo
 * ao nanossegundo, e o carimbo é outro em cada build. A cache respondia
 * sempre "esta foto mudou", e as 557 fotos × 5 larguras × 2 formatos eram
 * recodificadas do princípio — meia hora de build, sempre, mesmo num commit
 * que não tocou numa única imagem.
 *
 * O resumo do conteúdo não tem esse problema: uma foto que não mudou dá o
 * mesmo resumo em qualquer máquina e em qualquer dia. É o mesmo carimbo que
 * scripts/pregen-heroes.mjs já usa, e pela mesma razão.
 *
 * O QUE CUSTA. Ler e resumir os 557 originais (283 MB) leva cerca de 20
 * segundos — e o ficheiro é lido UMA vez, com o mesmo `buffer` a servir para
 * o resumo e para a codificação quando ela é precisa. Vinte segundos contra
 * meia hora.
 */
function stamp(conteudo) {
  // Os parâmetros do AVIF entram no carimbo: mudar a qualidade tem de
  // invalidar a cache, senão o build seguinte serve ficheiros da qualidade
  // anterior e ninguém dá por isso.
  const resumo = createHash("sha1").update(conteudo).digest("hex");
  return `${resumo}:${conteudo.length}:${WIDTHS.join(",")}:${QUALITY}:a${AVIF_QUALITY}e${AVIF_EFFORT}`;
}

const nextIndex = {};
const t0 = Date.now();
let encoded = 0;
let reused = 0;
let i = 0;
const bytesByWidth = Object.fromEntries(WIDTHS.map((w) => [w, 0]));
const bytesAvifByWidth = Object.fromEntries(WIDTHS.map((w) => [w, 0]));
const countByWidth = Object.fromEntries(WIDTHS.map((w) => [w, 0]));
const failures = [];
/** src -> cor média, escrito em tile-colors.json (ver mais abaixo). */
const colors = {};
/** src -> o que a galeria «vê» na foto (galeria-analise.mjs), para
 *  gallery-meta.json (ver mais abaixo). */
const analises = {};

async function link(from, to) {
  await fs.rm(to, { force: true });
  try {
    await fs.link(from, to);
  } catch {
    // Sistemas de ficheiros diferentes (ou sem suporte a hardlinks): copia.
    await fs.copyFile(from, to);
  }
}

/** A análise de uma foto, com a versão; uma falha não pára o build — a foto
 *  fica só sem os dados da galeria inteligente (ordem e recorte de antes). */
async function analisar(buf, src) {
  try {
    return { v: VERSAO_ANALISE, ...(await analisarFoto(sharp, buf)) };
  } catch (err) {
    console.warn(`  análise de ${src} falhou: ${err.message}`);
    return undefined;
  }
}

async function worker() {
  for (;;) {
    const k = i++;
    if (k >= sources.length) return;
    // O registo não pode ficar mudo: de 100 em 100, quantas vão e quantas
    // foram codificadas (as outras vieram da cache).
    if (k > 0 && k % 100 === 0) {
      console.log(
        `pregen-gallery: ${k}/${sources.length} — ${encoded} codificadas, ` +
          `${((Date.now() - t0) / 1000).toFixed(0)}s`,
      );
    }
    const src = sources[k];
    const key = galleryKey(src);

    /**
     * VALIDAR O CAMINHO ANTES DE LHE TOCAR.
     *
     * O `src` vem de um ficheiro de dados e vai parar a leituras e escritas no
     * disco. Hoje a lista é código nosso, mas um script de build que escreve a
     * partir de caminhos que não valida torna-se perigoso no dia em que a lista
     * passar a vir de outro lado.
     *
     * A lista de caracteres do nome é deliberadamente LARGA: as fotos reais
     * chamam-se "M&F0678.jpg" ou "natalia e jonathan-4.jpg". Uma expressão
     * apertada recusava 153 das 427 (medido a correr o build), o que seria bem
     * pior do que o problema. Quem faz o trabalho de segurança é o
     * `path.relative` a seguir: se o caminho resolvido sair de `public/`, a
     * relativa começa com ".." ou é absoluta.
     */
    if (!/^\/[^\0]+\.(jpe?g|png|webp)$/i.test(src)) {
      failures.push(`${src}: caminho de origem recusado`);
      continue;
    }
    const inputPath = path.resolve(PUBLIC, "." + src);
    const rel = path.relative(PUBLIC, inputPath);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
      failures.push(`${src}: caminho de origem fora de public/`);
      continue;
    }

    /**
     * UM SÓ DESCRITOR PARA VER E PARA LER.
     *
     * Antes fazia-se `stat(caminho)` e, mais abaixo, `readFile(caminho)`: duas
     * resoluções do mesmo nome, e entre elas o ficheiro pode mudar ou ser
     * trocado. Abrindo UMA vez e usando o descritor para as duas coisas, ambas
     * falam do mesmo ficheiro, sempre.
     */
    let fh;
    try {
      fh = await fs.open(inputPath, "r");
    } catch {
      failures.push(`${src}: ficheiro de origem não existe`);
      continue;
    }

    let want;
    let color;
    let analise;
    try {
      /**
       * UM read do original, que serve para as duas coisas: o carimbo que
       * decide a cache e, se ela não acertar, a codificação lá em baixo. Ler
       * duas vezes o mesmo ficheiro para carimbar e depois para codificar
       * pagava 283 MB de leitura a dobrar sem nada em troca.
       */
      let input;
      try {
        input = await fh.readFile();
      } catch (err) {
        failures.push(`${src}: ${err.message}`);
        continue;
      }
      want = stamp(input);

      // Reaproveitar da cache de build quando a fonte não mudou E todos os
      // ficheiros estão lá (uma cache truncada regenera em vez de mentir).
      const entry = index[key];
      let cached = entry?.stamp === want && typeof entry.color === "string";
      if (cached) color = entry.color;
      if (cached) {
        for (const w of WIDTHS) {
          for (const f of FORMATOS) {
            try {
              await fs.access(path.join(CACHE_DIR, `${key}-${w}.${f.ext}`));
            } catch {
              cached = false;
              break;
            }
          }
          if (!cached) break;
        }
      }

      if (!cached) {
        // O read já está feito acima e o mesmo buffer serve todas as larguras:
        // o custo dominante é o decode, não o encode.
        let meta;
        try {
          meta = await sharp(input).metadata();
        } catch (err) {
          failures.push(`${src}: ${err.message}`);
          continue;
        }
        let smallest;
        for (const w of WIDTHS) {
          // Nunca ampliar acima da fonte (igual ao next/image).
          const target = meta.width ? Math.min(w, meta.width) : w;
          /**
           * UM redimensionamento por largura, dois encodes a partir dele. O
           * custo dominante é o decode do original (feito uma vez, acima) e o
           * resize; repetir a cadeia inteira por formato pagava o resize duas
           * vezes sem necessidade.
           *
           * `.toColourspace("srgb")` é explícito de propósito: as fotografias
           * de casamento saem de máquinas configuradas em AdobeRGB ou
           * ProPhoto com frequência, e um ficheiro entregue ao browser com
           * cores nesse espaço mas sem perfil aparece dessaturado. O sharp
           * larga os metadados (incluindo o EXIF e o perfil ICC) por omissão,
           * portanto o perfil NÃO vai no ficheiro — o que torna obrigatório
           * converter os píxeis antes de o largar.
           */
          const base = sharp(input)
            .resize(target, null, { withoutEnlargement: true })
            .toColourspace("srgb");
          for (const f of FORMATOS) {
            const buf = await f.encode(base.clone()).toBuffer();
            await fs.writeFile(path.join(CACHE_DIR, `${key}-${w}.${f.ext}`), buf);
            if (f.ext === "webp") smallest ??= buf;
          }
        }
        // Cor média da foto, para o mosaico nunca ser um rectângulo liso do
        // fundo da página enquanto a fotografia não chega (ver tile-colors.json
        // e o uso em galeria/page.tsx). Calculada a partir da miniatura mais
        // pequena que acabámos de gerar — é um decode de 384px, não do
        // original.
        const px = await sharp(smallest).resize(1, 1, { fit: "cover" }).raw().toBuffer();
        color = "#" + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
        analise = await analisar(smallest, src);
        encoded++;
      } else {
        reused++;
        // A análise é da mesma miniatura de 384: quando a cache acerta mas a
        // análise é de outra versão (ou não existe), refaz-se só ela, a partir
        // do ficheiro que já lá está — sem voltar a codificar nada.
        analise = entry.analise?.v === VERSAO_ANALISE ? entry.analise : undefined;
        if (!analise) {
          analise = await analisar(
            await fs.readFile(path.join(CACHE_DIR, `${key}-${WIDTHS[0]}.webp`)),
            src,
          );
        }
      }
    } finally {
      await fh.close();
    }

    for (const w of WIDTHS) {
      for (const f of FORMATOS) {
        const cacheFile = path.join(CACHE_DIR, `${key}-${w}.${f.ext}`);
        await link(cacheFile, path.join(OUT_DIR, `${key}-${w}.${f.ext}`));
        const s = await fs.stat(cacheFile);
        // O relatório continua a contar o WebP: é a linha comparável com todas
        // as medições anteriores. O AVIF tem contagem própria.
        if (f.ext === "webp") {
          bytesByWidth[w] += s.size;
          countByWidth[w]++;
        } else {
          bytesAvifByWidth[w] += s.size;
        }
      }
    }
    nextIndex[key] = { stamp: want, color, ...(analise ? { analise } : {}) };
    colors[src] = color;
    if (analise) analises[src] = analise;
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Uma foto que falhe deixa a grelha a mostrar "Foto indisponível" — que é
// exactamente o sintoma que este script existe para eliminar. Melhor falhar o
// build do que publicar buracos.
if (failures.length) {
  console.error(`pregen-gallery: ${failures.length} foto(s) falharam:`);
  for (const f of failures.slice(0, 20)) console.error(`  - ${f}`);
  process.exit(1);
}

/**
 * CONFERIR A SAÍDA, ficheiro a ficheiro, antes de dizer que correu bem.
 *
 * Até aqui o script dava-se por satisfeito por nenhum passo ter lançado
 * excepção. Não é a mesma coisa que a saída estar completa: um `link()` que
 * caia num ramo de fallback, uma cache parcial de uma corrida anterior
 * interrompida, um disco cheio a meio — e o build passa verde com miniaturas em
 * falta. No site isso é um 404 por mosaico, ou seja, a queixa que este script
 * existe para eliminar.
 *
 * O contrato que o site assume é exactamente este: PARA CADA ficheiro de imagem
 * de public/imagens/ e CADA largura da escada existe um ficheiro. Ou se
 * verifica, ou não é um contrato. São ~2800 `stat` no fim de um passo de ~130s.
 */
const missing = [];
const badKeys = new Set();
for (const src of sources) {
  const key = galleryKey(src);
  for (const w of WIDTHS) {
    for (const f of FORMATOS) {
      const out = path.join(OUT_DIR, `${key}-${w}.${f.ext}`);
      try {
        const s = await fs.stat(out);
        if (s.size === 0) {
          missing.push(`${key}-${w}.${f.ext} (0 bytes)`);
          badKeys.add(key);
        }
      } catch {
        missing.push(`${key}-${w}.${f.ext}`);
        badKeys.add(key);
      }
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
      for (const f of FORMATOS) {
        await fs.rm(path.join(CACHE_DIR, `${key}-${w}.${f.ext}`), { force: true });
        await fs.rm(path.join(OUT_DIR, `${key}-${w}.${f.ext}`), { force: true });
      }
    }
  }
  console.error(
    `pregen-gallery: ${missing.length} ficheiro(s) em falta na saída, de ` +
      `${sources.length * WIDTHS.length * FORMATOS.length} esperados:`,
  );
  for (const m of missing.slice(0, 20)) console.error(`  - ${m}`);
  console.error(
    `  ${badKeys.size} entrada(s) da cache deitadas fora — uma nova corrida regenera-as.`,
  );
  process.exit(1);
}

// Limpeza: ficheiros de fotos que já não existem em public/imagens/, tanto na
// saída como na cache (senão a cache cresce para sempre).
const wanted = new Set();
for (const key of byKey.keys())
  for (const w of WIDTHS) for (const f of FORMATOS) wanted.add(`${key}-${w}.${f.ext}`);
let pruned = 0;
for (const dir of [OUT_DIR, CACHE_DIR]) {
  for (const name of await fs.readdir(dir)) {
    if (name === "index.json" || wanted.has(name)) continue;
    await fs.rm(path.join(dir, name), { force: true, recursive: true });
    pruned++;
  }
}

await fs.writeFile(INDEX_FILE, JSON.stringify(nextIndex), "utf8");

/**
 * tile-colors.json — a cor média de cada foto, para o mosaico ter uma cor sua
 * enquanto a fotografia não chega.
 *
 * PORQUÊ NÃO SÓ O BLUR. O blur é bonito mas pesado: mandar os 427 na carga da
 * página custa +21,4 KB comprimidos e, medido num telemóvel a 1,6 Mbit/s,
 * atrasa a PRIMEIRA fotografia de 3,4 s para 4,2 s. As 427 cores custam ~2 KB
 * comprimidos e cobrem tudo. Fica o blur para a primeira janela (o que se vê
 * já) e a cor para as outras 300 e tal, em vez de rectângulo liso.
 *
 * É um ficheiro de código-fonte (versionado, como src/lib/blur-map.json), para
 * `tsc`/`eslint`/`vitest` funcionarem numa árvore acabada de clonar sem ter de
 * correr o build primeiro. Só se reescreve quando muda, para um build não
 * sujar a árvore de trabalho à toa.
 *
 * SÓ AS FOTOS DA GALERIA. O script gera miniaturas para os 557 ficheiros de
 * public/imagens/, mas este ficheiro fica-se pelas 427 de photos-data.ts: as
 * outras 130 nunca são desenhadas como mosaico, portanto a cor delas não serve
 * a ninguém — seria peso morto no bundle da página e entradas órfãs que o teste
 * "não tem entradas a mais" de gallery-image-loader.test.ts recusa, e bem.
 * (A cor continua a ser calculada e guardada no índice da cache para todas: é
 * derivada da miniatura de 384 que já se gerou, não custa um decode extra, e
 * poupa recalcular o dia em que uma foto entre na galeria.)
 */
const COLORS_FILE = path.join(
  ROOT,
  "src",
  "app",
  "[lang]",
  "(site)",
  "galeria",
  "tile-colors.json",
);
const colorsJson =
  JSON.stringify(
    Object.fromEntries(
      Object.keys(colors)
        .filter((src) => GALLERY_SRCS.has(src))
        .sort()
        .map((k) => [k, colors[k]]),
    ),
    null,
    2,
  ) + "\n";
let colorsChanged = false;
try {
  colorsChanged = (await fs.readFile(COLORS_FILE, "utf8")) !== colorsJson;
} catch {
  colorsChanged = true;
}
if (colorsChanged) await fs.writeFile(COLORS_FILE, colorsJson, "utf8");

/**
 * ════════════════════════════════════════════════════════════════════════════
 * gallery-meta.json — O QUE A GALERIA «VÊ» EM CADA FOTOGRAFIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela («espetacularmente inteligente»; para as quase iguais, «mostra
 * todas, afastadas»). Por foto da galeria, só o que é preciso, e só quando há:
 *
 *  · `c`  — a cena: as fotos com o mesmo `c` são o mesmo momento (ver
 *           `mesmaCena` em galeria-analise.mjs) e a ordem afasta-as;
 *  · `pb` — a preto e branco: nunca duas seguidas;
 *  · `d`  — serve para o mosaico grande do topo (deitada, a cores, nítida);
 *  · `f`  — o ponto de interesse (`"x,y"` em %), quando não é o centro: é para
 *           onde se recortam o mosaico e as miniaturas do lightbox.
 *
 * A impressão visual e a nitidez ficam no índice da cache, não aqui: o browser
 * não precisa delas. Versionado e só reescrito quando muda, como o
 * tile-colors.json, pelas mesmas razões.
 */
const META_FILE = path.join(ROOT, "src", "app", "[lang]", "(site)", "galeria", "gallery-meta.json");
const daGaleria = [...GALLERY_SRCS].filter((src) => analises[src]);
const cenas = agruparCenas(
  daGaleria.map((src) => ({ src, h: analises[src].h, cor: colors[src], pb: analises[src].pb })),
);
const nitidezMinima = quantil(
  daGaleria.map((src) => analises[src].n),
  0.25,
);
const meta = {};
for (const src of daGaleria.sort()) {
  const a = analises[src];
  const m = {};
  if (cenas.has(src)) m.c = cenas.get(src);
  if (a.pb) m.pb = 1;
  if (serveParaDestaque(a, a.r, nitidezMinima)) m.d = 1;
  if (a.f && a.f !== "50,50") m.f = a.f;
  if (Object.keys(m).length) meta[src] = m;
}
const metaJson = JSON.stringify(meta, null, 2) + "\n";
let metaChanged = false;
try {
  metaChanged = (await fs.readFile(META_FILE, "utf8")) !== metaJson;
} catch {
  metaChanged = true;
}
if (metaChanged) await fs.writeFile(META_FILE, metaJson, "utf8");
console.log(
  `  gallery-meta.json: ${daGaleria.length} fotos analisadas · ${new Set(cenas.values()).size} cenas` +
    ` (${cenas.size} fotos) · ${Object.values(meta).filter((m) => m.pb).length} P&B` +
    ` · ${Object.values(meta).filter((m) => m.d).length} servem o destaque`,
);

// (O `blur-galeria.json` — o desfocado das fotos fora da primeira janela —
// deixou de ser escrito a 2/11: a grelha da galeria já não mostra desfocado
// nenhum, só a cor média de cada foto. Ver a nota em `galeria/page.tsx`.)

const seconds = (Date.now() - t0) / 1000;
const totalBytes = Object.values(bytesByWidth).reduce((a, b) => a + b, 0);
console.log(
  `pregen-gallery: ${sources.length} fotos (${gallerySources.length} na galeria) x ` +
    `${WIDTHS.length} larguras = ${sources.length * WIDTHS.length} ficheiros ` +
    `(${(totalBytes / 1048576).toFixed(1)} MB) em ${seconds.toFixed(1)}s — ` +
    `${encoded} encodadas, ${reused} reaproveitadas da cache` +
    (pruned ? `, ${pruned} obsoletas removidas` : ""),
);
console.log(
  "  " +
    WIDTHS.map(
      (w) => `w=${w}: ${(bytesByWidth[w] / countByWidth[w] / 1024).toFixed(1)}KB média`,
    ).join("  "),
);
