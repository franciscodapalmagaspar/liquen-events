/**
 * ════════════════════════════════════════════════════════════════════════════
 * SÓ OS ORIGINAIS QUE ALGUÉM PEDE VÃO NA PUBLICAÇÃO — 9/11
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela: «melhorar ainda mais os custos da Vercel», e depois «sim, faz isso dos
 * originais». Cada publicação levava os 1 058 originais de `public/imagens/`
 * (342 MB), e a Vercel cobra o armazenamento de cada publicação guardada.
 *
 * Ninguém os pede: o site serve sempre as versões de `/_img/g/` (o
 * `site-image-loader` troca `/imagens/…` por elas), e medido página a página —
 * a lupa da galeria incluída — nenhuma página pede um original. O sitemap
 * passou a declarar as versões (`imagemDoSitemap`).
 *
 * Ficam os originais que o CÓDIGO cita pelo nome: as imagens de partilha
 * (og:image), os anúncios, o JSON-LD, as capas das variantes. Esses são
 * pedidos por quem está fora do site (o WhatsApp, o Facebook, o Google), e
 * nem passam pelo carregador. Medido a 9/11: 128 ficheiros, 59 MB.
 *
 * ── QUANDO CORRE ─────────────────────────────────────────────────────────
 * Último passo da construção, depois do `next build` (que ainda os lê pelo
 * `pregen-gallery`), e SÓ na Vercel (`VERCEL=1`). Numa máquina local ou no CI
 * não apaga nada: lá os originais são a fonte das miniaturas.
 *
 * E nunca tira um original cuja versão de 1280 px não exista — sem ela, a
 * fotografia deixava de existir de todo.
 */
import { readdirSync, readFileSync, rmSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = process.cwd();
const ORIGINAIS = join(RAIZ, "public", "imagens");
const VERSOES = join(RAIZ, "public", "_img", "g");

/** Os ficheiros de código onde se procuram nomes de originais. */
function ficheirosDeCodigo(pasta, lista = []) {
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) ficheirosDeCodigo(caminho, lista);
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\./.test(nome)) lista.push(caminho);
  }
  return lista;
}

/**
 * Os originais citados pelo nome no código. A galeria (`photos-data.ts`) fica
 * de fora de propósito: as fotografias dela só chegam ao ecrã pelo carregador.
 */
export function originaisCitados(codigo) {
  const citados = new Set();
  for (const texto of codigo) {
    for (const m of texto.matchAll(/\/imagens\/([^"'`\s)]+)/g)) citados.add(decodeURI(m[1]));
  }
  return citados;
}

/** A chave das versões — a mesma de `galleryKey` (gallery-image-loader.ts). */
export function chaveDaVersao(ficheiro) {
  const base = (ficheiro.split("/").pop() ?? ficheiro).replace(/\.[^.]+$/, "");
  return base.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function todosOsOriginais(pasta, lista = []) {
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) todosOsOriginais(caminho, lista);
    else lista.push(caminho);
  }
  return lista;
}

const correDirecto =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (correDirecto) {
  if (process.env.VERCEL !== "1") {
    console.log("so-originais-precisos: fora da Vercel — nada se apaga");
    process.exit(0);
  }
  const codigo = ficheirosDeCodigo(join(RAIZ, "src"))
    .filter((f) => !f.endsWith("photos-data.ts"))
    .map((f) => readFileSync(f, "utf8"));
  const citados = originaisCitados(codigo);
  let apagados = 0;
  let bytes = 0;
  let semVersao = 0;
  for (const caminho of todosOsOriginais(ORIGINAIS)) {
    const nome = relative(ORIGINAIS, caminho).split("\\").join("/");
    if (citados.has(nome)) continue;
    if (!existsSync(join(VERSOES, `${chaveDaVersao(nome)}-1280.webp`))) {
      semVersao += 1;
      continue;
    }
    bytes += statSync(caminho).size;
    rmSync(caminho);
    apagados += 1;
  }
  console.log(
    `so-originais-precisos: ${apagados} originais fora da publicação (${(bytes / 1e6).toFixed(0)} MB); ` +
      `${citados.size} citados pelo código ficam; ${semVersao} sem versão de 1280 px ficam`,
  );
}
