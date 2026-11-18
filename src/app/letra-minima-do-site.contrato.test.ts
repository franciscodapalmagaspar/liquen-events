import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { LETRA_MIUDA } from "@/lib/letra-miuda";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NENHUMA LETRA ABAIXO DE 12 px NAS PÁGINAS PÚBLICAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 17/11: um júri contou 104 textos de 9 a 11 px no site (o fim legal, os
 * sobretítulos, os botões em maiúsculas, as etiquetas da galeria), e as «Boas
 * práticas» do Lighthouse desceram de 100 para 96 em seis páginas. O dono
 * aprovou o chão: 12 px, e um degrau só para tudo o que é miúdo — o token
 * `--text-miuda` do `tema.css`.
 *
 * Este ficheiro guarda as duas pontas:
 *   1. o token existe e vale 12 px, e o valor de reserva de quem desenha em
 *      `style` sem a folha (`LETRA_MIUDA`) é o mesmo;
 *   2. nenhum ficheiro do site volta a escrever um tamanho abaixo disso — nem
 *      numa classe do Tailwind (`text-[10px]`), nem no CSS (`font-size: 11px`),
 *      nem num `style` (`fontSize: 10`), nem com o degrau de 11 px do back
 *      office (`text-caption2`).
 *
 * O back office fica de fora: tem o seu próprio chão, medido no browser
 * (`e2e/chao-da-letra.spec.ts`), e uma densidade de tabela decidida à parte.
 * As rotas da API, os e-mails e o PDF também: não são páginas. O passeio
 * `e2e/chao-da-letra-do-site.spec.ts` mede o mesmo chão no browser, com a
 * cascata toda aplicada.
 */

const RAIZ = process.cwd();
const CHAO_PX = 12;
const PX_POR_REM = 16;

/** As pastas onde vivem as páginas públicas e as peças que elas montam. */
const PASTAS = ["src/app", "src/components"];

function fora(caminho: string): boolean {
  return (
    caminho.includes("(admin)") ||
    caminho.startsWith("src/app/api/") ||
    caminho.endsWith("admin.css") ||
    /\.test\.tsx?$/.test(caminho)
  );
}

function ficheiros(pasta: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(join(RAIZ, pasta))) {
    const caminho = `${pasta}/${nome}`;
    if (fora(caminho)) continue;
    if (statSync(join(RAIZ, caminho)).isDirectory()) saida.push(...ficheiros(caminho));
    else if (/\.(tsx?|css)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

/** Mais as classes partilhadas dos botões, que vivem em `src/lib`. */
const FICHEIROS = [...PASTAS.flatMap(ficheiros), "src/lib/ui-classes.ts"];

/** Tira os comentários, para um comentário que conta a história não contar. */
function semComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function emPx(valor: number, unidade: string): number {
  return unidade === "rem" ? valor * PX_POR_REM : valor;
}

/** As três maneiras de escrever um tamanho de letra, e quanto vale cada uma. */
const PADROES: [RegExp, (m: RegExpMatchArray) => number][] = [
  // Tailwind: text-[10px], sm:text-[0.6rem]
  [/text-\[(\d*\.?\d+)(px|rem)\]/g, (m) => emPx(Number(m[1]), m[2])],
  // CSS: font-size: 11px / 0.65rem
  [/font-size:\s*(\d*\.?\d+)(px|rem)\b/g, (m) => emPx(Number(m[1]), m[2])],
  // CSS, o atalho: font: 400 10px/1 var(--sans) (escapou à primeira varredura)
  [/\bfont:[^;{}]*?(?<![\w./-])(\d*\.?\d+)(px|rem)\b/g, (m) => emPx(Number(m[1]), m[2])],
  // style do React: fontSize: 10, fontSize: "11px"
  [
    /fontSize:\s*["'`]?(\d*\.?\d+)(px|rem)?["'`]?\s*[,}\n]/g,
    (m) => emPx(Number(m[1]), m[2] ?? "px"),
  ],
];

/** Cada tamanho de letra abaixo do chão num texto, com o sítio e o que lá está. */
function abaixoDoChaoNoTexto(texto: string, caminho: string): string[] {
  const achados: string[] = [];
  for (const [re, px] of PADROES) {
    for (const m of texto.matchAll(re)) {
      if (px(m) < CHAO_PX) achados.push(`${caminho}: ${m[0].trim()}`);
    }
  }
  // O degrau de 11 px da escala do back office não serve ao site. (No CSS é
  // a definição dele, no `tema.css` partilhado; o que conta é quem o usa.)
  if (!caminho.endsWith(".css")) {
    for (const m of texto.matchAll(/\btext-caption2\b/g)) achados.push(`${caminho}: ${m[0]}`);
  }
  return achados;
}

function abaixoDoChao(caminho: string): string[] {
  return abaixoDoChaoNoTexto(semComentarios(readFileSync(join(RAIZ, caminho), "utf8")), caminho);
}

describe("a letra mínima do site público", () => {
  const TEMA = readFileSync(join(RAIZ, "src/app/tema.css"), "utf8");

  it("o token `--text-miuda` existe e vale 12 px", () => {
    const m = TEMA.match(/--text-miuda:\s*(\d*\.?\d+)(px|rem);/);
    expect(m, "falta o --text-miuda no tema.css").not.toBeNull();
    expect(emPx(Number(m![1]), m![2])).toBe(CHAO_PX);
  });

  it("o token não traz entrelinha nem espaçamento: cada sítio mantém os seus", () => {
    expect(TEMA).not.toMatch(/--text-miuda--/);
  });

  it("a reserva de quem desenha em `style` sem a folha é o mesmo valor do token", () => {
    const token = TEMA.match(/--text-miuda:\s*([^;]+);/)![1].trim();
    expect(LETRA_MIUDA).toBe(`var(--text-miuda, ${token})`);
  });

  it("varre os ficheiros que devia varrer (o fim legal, o rodapé, a proposta, os anúncios)", () => {
    for (const f of [
      "src/components/AvisoLegal.tsx",
      "src/components/Footer.tsx",
      "src/app/globals.css",
      "src/app/global-error.tsx",
      "src/app/[lang]/(privado)/proposta/[token]/proposta-web.css",
      "src/app/[lang]/s/[slug]/page.tsx",
    ]) {
      expect(FICHEIROS).toContain(f);
    }
    expect(FICHEIROS.some((f) => f.includes("(admin)"))).toBe(false);
  });

  it("nenhum ficheiro do site escreve letra abaixo de 12 px", () => {
    const achados = FICHEIROS.flatMap(abaixoDoChao);
    expect(
      achados,
      `${achados.length} tamanhos abaixo de 12 px — usa \`text-miuda\` ou \`var(--text-miuda)\`:\n` +
        achados.join("\n"),
    ).toEqual([]);
  });

  it("e o detector apanha o que tem de apanhar, e deixa passar os 12 px", () => {
    // Sem isto, um padrão partido passava em verde para sempre.
    for (const mau of [
      'className="text-[10px] uppercase"',
      "font-size: 11px;",
      "font: 400 10px/1 var(--sans);",
      "style={{ fontSize: 10 }}",
      'style={{ fontSize: "11px", color: "red" }}',
      "sm:text-[0.6rem]",
      "text-caption2",
    ]) {
      expect(abaixoDoChaoNoTexto(mau, "amostra"), mau).toHaveLength(1);
    }
    for (const bom of [
      "text-[12px]",
      "font-size: 0.75rem;",
      "font: 400 var(--text-miuda)/1 var(--sans);",
      "font: 300 13px/1 var(--sans);",
      "style={{ fontSize: 13 }}",
      "fontSize: LETRA_MIUDA,",
      "text-miuda",
    ]) {
      expect(abaixoDoChaoNoTexto(bom, "amostra"), bom).toEqual([]);
    }
  });
});
