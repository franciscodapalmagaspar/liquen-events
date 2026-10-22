#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE CADA ROTA MANDA PARA O TELEMÓVEL DELA — COM TECTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Eu quero mesmo que trabalhes de forma a ficarem ultra rápidas.»
 *
 * ── O BURACO QUE ISTO TAPA ────────────────────────────────────────────────
 *
 * Os orçamentos de desempenho da casa (`lighthouserc.json`) medem seis páginas,
 * todas do sítio público. O back office ganhou o seu tecto no browser
 * (`e2e/peso-do-back-office.spec.ts`). A PÁGINA DA PROPOSTA — a que o casal
 * abre, e a segunda das duas que ela diz serem lentas — nunca teve nenhum.
 *
 * E não podia ter, pela via do browser: para a medir é preciso uma proposta
 * pública gravada, e o servidor de produção RECUSA escritas sem Supabase, de
 * propósito (`assertWritableInProd` — gravar para um ficheiro efémero seria
 * perder dados em silêncio no próximo deploy). Sem escrita não há proposta; um
 * token inválido desenha outra árvore e mediria outra coisa.
 *
 * ── O QUE SE MEDE AQUI, E O QUE NÃO SE MEDE ───────────────────────────────
 *
 * Lê-se o manifesto que o próprio build escreve por rota
 * (`page_client-reference-manifest.js`) e somam-se os pacotes de JavaScript
 * que ele nomeia. Não precisa de servidor, nem de dados, nem de rede — e por
 * isso mede a proposta tão bem como mede o painel.
 *
 * São BYTES CRUS no disco, não bytes na linha. O browser mediu 274 KB
 * comprimidos no back office onde isto conta 429 KB — a diferença é o gzip, e
 * é por isso que os dois tectos são números diferentes e não se comparam um
 * com o outro.
 *
 * E é um tecto POR ROTA: conta os módulos de cliente que a rota nomeia, não
 * tudo o que o browser acaba por descarregar (o painel pede 18 ficheiros de JS
 * e aqui contam-se 9 — os outros são a moldura partilhada). Complementa o
 * passeio do browser; não o substitui. Para a proposta, é o único que há.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * As rotas com tecto, em kilobytes de JavaScript cru.
 *
 * Os números de partida, medidos contra `npm run build` nesta máquina:
 *
 *     proposta        5 pacotes    112 KB
 *     back office     9 pacotes    429 KB
 *
 * Os tectos têm folga sobre eles — o suficiente para uma funcionalidade nova
 * não os pôr vermelhos por dar, e apertado o bastante para uma biblioteca a
 * entrar sem querer não passar despercebida.
 */
const ROTAS = [
  {
    nome: "a proposta que o casal abre",
    dir: ".next/server/app/[lang]/(privado)/proposta/[token]",
    tecto: 160,
  },
  {
    nome: "o painel que ela abre todos os dias",
    dir: ".next/server/app/[lang]/(admin)/orcamento/admin",
    tecto: 520,
  },
];

/** Os pacotes de JS que uma rota nomeia, sem repetidos. */
function pacotesDaRota(dir) {
  const ficheiro = path.join(dir, "page_client-reference-manifest.js");
  if (!existsSync(ficheiro)) return null;
  const cru = readFileSync(ficheiro, "utf8");
  const corte = cru.indexOf("] = ");
  if (corte === -1) return null;
  const dados = JSON.parse(
    cru
      .slice(corte + 4)
      .trim()
      .replace(/;$/, ""),
  );
  const pacotes = new Set();
  for (const modulo of Object.values(dados.clientModules ?? {})) {
    for (const c of modulo.chunks ?? []) {
      if (typeof c === "string" && c.endsWith(".js")) pacotes.add(c);
    }
  }
  return pacotes;
}

function kilobytes(pacotes) {
  let bytes = 0;
  const perdidos = [];
  for (const p of pacotes) {
    const disco = path.join(".next", p.replace(/^\/_next\//, ""));
    if (existsSync(disco)) bytes += readFileSync(disco).byteLength;
    else perdidos.push(p);
  }
  return { kb: Math.round(bytes / 1024), perdidos };
}

let chumbou = false;
console.log("O que cada rota manda, em JavaScript cru:\n");

for (const { nome, dir, tecto } of ROTAS) {
  const pacotes = pacotesDaRota(dir);

  /**
   * Uma rota que desapareceu não é uma rota leve.
   *
   * Sem isto, mudar o caminho de uma pasta fazia este guião passar a verde para
   * sempre sem medir nada — que é a pior forma de uma rede falhar, porque
   * parece que está a funcionar.
   */
  if (!pacotes || pacotes.size === 0) {
    console.error(`  ✗ ${nome}\n      não encontrei pacotes em ${dir}`);
    console.error(
      "      Ou o build não correu, ou a rota mudou de sítio. Corrige o caminho aqui —\n" +
        "      um tecto que não encontra a rota deixa de ser um tecto.",
    );
    chumbou = true;
    continue;
  }

  const { kb, perdidos } = kilobytes(pacotes);
  if (perdidos.length > 0) {
    console.error(`  ✗ ${nome}: ${perdidos.length} pacotes nomeados mas ausentes do disco`);
    chumbou = true;
    continue;
  }

  const folga = tecto - kb;
  const marca = kb <= tecto ? "✓" : "✗";
  console.log(
    `  ${marca} ${nome}\n` +
      `      ${String(kb).padStart(4)} KB em ${pacotes.size} pacotes ` +
      `(tecto ${tecto} KB, folga ${folga} KB)`,
  );
  if (kb > tecto) {
    console.error(
      `      Passou o tecto em ${-folga} KB. Na linha dela, cada 100 KB são cerca de\n` +
        "      meio segundo. Vê o que entrou de novo antes de subir o número.",
    );
    chumbou = true;
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE CADA FUNÇÃO LEVA CONSIGO — E PORQUE É QUE ISTO SE LÊ DO BUILD
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Há um teste que guarda a configuração do `sharp` (`tracing-do-sharp.test.ts`)
 * e ele faz o que pode: compara duas listas de texto dentro do `next.config.ts`.
 * O que ele NÃO pode fazer é ver o resultado — e é no resultado que as avarias
 * vivem.
 *
 * Foi assim que a inclusão `"/**"` pôde crescer sem ninguém dar por ela: está
 * escrita para TODAS as rotas, e são 135. O `favicon.ico` leva 17,8 MB de
 * bibliotecas de imagem que não tem como usar.
 *
 * O que se lê aqui é o rastreio que o próprio build escreve por rota
 * (`*.nft.json`): a lista exacta dos ficheiros que vão viajar com cada função.
 * Sem servidor, sem rede, sem plataforma.
 *
 * ── AS DUAS REGRAS ────────────────────────────────────────────────────────
 *
 *  1. QUEM PRECISA, LEVA. Uma rota cujo rastreio traga o `sharp` tem de trazer
 *     também o vínculo nativo e o `libvips`. Sem isto, a avaria é a que já
 *     aconteceu em produção: o back office deixou de listar os temas com
 *     «Could not load the "sharp" module … libvips-cpp.so: No such file».
 *     Passa a ser vermelho no CI em vez de vermelho no telemóvel dela.
 *
 *  2. NINGUÉM LEVA O QUE NÃO CORRE AQUI. As variantes `musl` e `wasm32` são de
 *     outras plataformas e pesam 27 MB juntas. Já são excluídas; isto guarda
 *     que continuem a ser.
 *
 * A terceira regra — que uma rota que NÃO usa o `sharp` também não o carregue —
 * ainda não se pode exigir: hoje falhariam 135 de 135. Fica a contagem à vista,
 * que é o que torna o custo impossível de ignorar, e a regra entra quando a
 * inclusão for estreitada às rotas que dele precisam.
 */
const NATIVO = "@img/sharp-linux-x64/lib/";
const LIBVIPS = "@img/sharp-libvips-linux-x64/lib/libvips-cpp.so";
const FORASTEIRAS = [
  "sharp-wasm32",
  "sharp-linuxmusl-x64",
  "sharp-libvips-linuxmusl-x64",
  "canvas-linux-x64-musl",
];

/** Todos os rastreios que o build escreveu, um por rota. */
function rastreios(dir = path.join(".next", "server", "app"), fora = []) {
  if (!existsSync(dir)) return fora;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) rastreios(p, fora);
    else if (e.name.endsWith(".nft.json")) fora.push(p);
  }
  return fora;
}

const traços = rastreios();
if (traços.length === 0) {
  console.error(
    "\n  ✗ não encontrei um único rastreio em .next/server/app.\n" +
      "      Ou o build não correu, ou o Next mudou onde os escreve. Uma rede que\n" +
      "      não encontra nada para medir não é uma rede.",
  );
  chumbou = true;
} else {
  let comSharp = 0;
  let comPeso = 0;
  const semPar = [];
  const comForasteiras = [];

  for (const t of traços) {
    const ficheiros = JSON.parse(readFileSync(t, "utf8")).files ?? [];
    const rota = t.replace(/^\.next[/\\]server[/\\]app[/\\]/, "").replace(/\.nft\.json$/, "");
    const usaSharp = ficheiros.some((f) => f.includes("node_modules/sharp/"));
    const temNativo = ficheiros.some((f) => f.includes(NATIVO) && f.endsWith(".node"));
    const temLibvips = ficheiros.some((f) => f.includes(LIBVIPS));

    if (usaSharp) comSharp++;
    if (temNativo || temLibvips) comPeso++;
    if (usaSharp && !(temNativo && temLibvips)) {
      semPar.push(
        `${rota} (nativo: ${temNativo ? "sim" : "NÃO"}, libvips: ${temLibvips ? "sim" : "NÃO"})`,
      );
    }
    const intrusas = FORASTEIRAS.filter((n) => ficheiros.some((f) => f.includes(n)));
    if (intrusas.length > 0) comForasteiras.push(`${rota} → ${intrusas.join(", ")}`);
  }

  console.log(`\nO que cada função leva consigo (${traços.length} rotas):\n`);

  if (semPar.length > 0) {
    console.error(`  ✗ ${semPar.length} rota(s) trazem o \`sharp\` SEM o par que o faz correr:`);
    for (const r of semPar) console.error(`      ${r}`);
    console.error(
      "      É esta a avaria que tirou a lista dos temas em produção. A inclusão do\n" +
        "      `next.config.ts` tem de cobrir estas rotas.",
    );
    chumbou = true;
  } else {
    console.log(`  ✓ as ${comSharp} rotas que usam o \`sharp\` levam o nativo e o libvips`);
  }

  if (comForasteiras.length > 0) {
    console.error(`  ✗ ${comForasteiras.length} rota(s) levam variantes de outra plataforma:`);
    for (const r of comForasteiras) console.error(`      ${r}`);
    chumbou = true;
  } else {
    console.log("  ✓ nenhuma rota leva as variantes `musl`/`wasm32` (27 MB que não correm aqui)");
  }

  const aMais = comPeso - comSharp;
  console.log(
    `  · ${comPeso} de ${traços.length} rotas carregam as bibliotecas de imagem; ` +
      `${comSharp} podem usá-las.`,
  );
  if (aMais > 0) {
    /**
     * A frase sobre a proposta é CALCULADA e não escrita.
     *
     * Esteve escrita à mão — «e a proposta que o casal abre é uma delas» — e no
     * dia em que deixou de ser verdade continuou a sair, a dizer a um número
     * certo uma coisa errada. Um relatório que mente é pior do que um que
     * cala.
     */
    const daProposta = traços.find((t) => t.includes("proposta") && t.includes("[token]"));
    const propostaPaga =
      daProposta !== undefined &&
      JSON.parse(readFileSync(daProposta, "utf8")).files.some(
        (f) => f.includes(NATIVO) || f.includes(LIBVIPS),
      );
    console.log(
      `      ${aMais} rotas levam ~17,8 MB que não têm como usar — ~8 MB comprimidos a ir\n` +
        "      buscar e a descomprimir antes de a função escrever o primeiro byte." +
        (propostaPaga
          ? "\n      E a proposta que o casal abre é uma delas."
          : "\n      A proposta que o casal abre já NÃO é uma delas."),
    );
  }
}

process.exit(chumbou ? 1 : 0);
