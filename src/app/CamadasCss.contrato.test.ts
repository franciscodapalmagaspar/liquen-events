import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ARMADILHA DAS CAMADAS: CSS À MÃO GANHA SEMPRE AO TAILWIND
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. No Tailwind v4, o `@import "tailwindcss"` declara as camadas
 * da cascata — `theme, base, components, utilities` — e mete lá dentro TODOS os
 * utilitários. Regra do CSS: **o que está fora de camadas ganha sempre ao que
 * está dentro**, por mais específico que este seja. Ou seja, uma regra escrita
 * à mão no `globals.css` (que está todo fora de camadas) vence qualquer
 * `w-12`, `w-24`, `w-full` — e vence EM SILÊNCIO. Não há aviso, não há linha
 * riscada nas ferramentas do browser à primeira vista; a classe simplesmente
 * não faz nada.
 *
 * NÃO É HIPOTÉTICO. O `.bo-input` declarava `width: 100%`. Resultado:
 *
 *   · a letra do grupo no estúdio de propostas (`bo-input w-12`) media 267 px
 *     em vez de 48, comia a linha inteira, e o campo do título ao lado ficava
 *     com **22 px** — um campo onde se escreve "Decoração Floral de Casamento";
 *   · as quantidades do inventário (`w-24`, `w-20`), as horas do alinhamento
 *     (`w-[100px]`), a mesa da lista de convidados (`w-14`) e o filtro de
 *     categoria (`sm:w-44`) estavam todos a 100% sem ninguém dar por isso.
 *
 * Levou uma medição do DOM a apanhar, porque no código está tudo certo: a
 * grelha de classes lê-se bem, e o CSS à mão também. O defeito só existe no
 * encontro dos dois.
 *
 * O QUE ESTE FICHEIRO GARANTE. Se uma classe do `globals.css` decide uma
 * LARGURA, e essa mesma classe é usada num `className` ao lado de um utilitário
 * de largura do Tailwind, então a declaração tem de viver dentro de um
 * `@layer` — senão o utilitário é decorativo.
 *
 * COMO SE CORRIGE quando este teste falha: passar SÓ a declaração de largura
 * para dentro de `@layer components { … }` (é o que o `.bo-input` faz). O resto
 * da regra pode ficar onde está — o que se quer arrumar é a cascata da largura,
 * não a aparência.
 */

const CSS = join(process.cwd(), "src/app/globals.css");
// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. A armadilha das camadas vale
// nas duas folhas, por isso lê-se o par, pela ordem em que o browser os aplica.
const CSS_DO_BACK_OFFICE = join(process.cwd(), "src/app/admin.css");
const RAIZ = join(process.cwd(), "src");

/** `width`, mas não `min-width` nem `max-width` — essas não colidem com `w-*`
 *  (o Tailwind escreve-as em `min-w-*`/`max-w-*`, propriedades diferentes). */
const DECLARA_LARGURA = /(^|[^-\w])width\s*:/;

/**
 * As regras de estilo do ficheiro, cada uma com a informação de estar ou não
 * dentro de um `@layer`.
 *
 * Percorre à mão em vez de usar uma expressão regular: `@media` dentro de
 * `@layer`, `@supports` dentro de `@media` e regras aninhadas são todos casos
 * normais aqui, e uma expressão regular sobre chavetas erra em todos.
 */
function lerRegras(css: string): { seletor: string; corpo: string; emCamada: boolean }[] {
  const regras: { seletor: string; corpo: string; emCamada: boolean }[] = [];
  const pilha: string[] = [];
  let prelúdio = "";
  let corpo = "";

  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    // Comentários não contam para nada — e contêm chavetas e `width:` em prosa.
    if (c === "/" && css[i + 1] === "*") {
      const fim = css.indexOf("*/", i + 2);
      i = fim < 0 ? css.length : fim + 1;
      continue;
    }
    if (c === "{") {
      pilha.push(prelúdio.trim());
      prelúdio = "";
      corpo = "";
      continue;
    }
    if (c === "}") {
      const seletor = pilha.pop() ?? "";
      if (seletor && !seletor.startsWith("@")) {
        regras.push({
          seletor,
          corpo,
          emCamada: pilha.some((p) => p.startsWith("@layer")),
        });
      }
      prelúdio = "";
      corpo = "";
      continue;
    }
    if (c === ";") {
      corpo += prelúdio + ";";
      prelúdio = "";
      continue;
    }
    prelúdio += c;
  }
  return regras;
}

/** As classes que a regra decide — `.bo-input:focus` → `bo-input`. */
function classesDe(seletor: string): string[] {
  return [...seletor.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
}

function ficheirosTsx(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) ficheirosTsx(p, acc);
    else if (nome.endsWith(".tsx") && !nome.includes(".test.")) acc.push(p);
  }
  return acc;
}

/**
 * Um utilitário de LARGURA do Tailwind, com ou sem prefixo de ecrã ou de
 * estado: `w-12`, `sm:w-44`, `lg:w-full`, `pointer-coarse:w-16`. Exclui
 * `min-w-…` e `max-w-…` (propriedades diferentes) — daí o `(?<![\w-])`.
 */
const UTILITARIO_LARGURA = /(?<![\w-])(?:[a-z-]+:)*w-[\w./[\]%-]+/;

describe("camadas do CSS — o que se escreve à mão não pode calar o Tailwind", () => {
  const css = readFileSync(CSS, "utf-8") + readFileSync(CSS_DO_BACK_OFFICE, "utf-8");
  const regras = lerRegras(css);

  const classesQueDecidemLargura = new Set<string>();
  for (const r of regras) {
    if (r.emCamada || !DECLARA_LARGURA.test(r.corpo)) continue;
    for (const c of classesDe(r.seletor)) classesQueDecidemLargura.add(c);
  }

  it("nenhuma classe fora de camada decide a largura de um elemento que também pede `w-*`", () => {
    // Sem candidatas, o teste não tem nada a dizer — e é isso que se quer, não
    // um verde por não ter procurado. A leitura do ficheiro é verificada abaixo.
    const conflitos: string[] = [];

    for (const ficheiro of ficheirosTsx(RAIZ)) {
      const src = readFileSync(ficheiro, "utf-8");
      for (const classe of classesQueDecidemLargura) {
        if (!src.includes(classe)) continue;
        // Só interessa quando as duas coisas estão na MESMA lista de classes:
        // é aí que uma cala a outra.
        for (const m of src.matchAll(/class(?:Name)?\s*=\s*[{"'`]([^"'`}]*)/g)) {
          const lista = m[1];
          if (!new RegExp(`(^|\\s)${classe}(\\s|$)`).test(lista)) continue;
          const util = lista.match(UTILITARIO_LARGURA);
          if (!util) continue;
          // A LINHA, e não só o ficheiro: sem ela, oito conflitos no mesmo
          // `AdminClient.tsx` (2900 linhas) mandam quem corrige à procura.
          const linha = src.slice(0, m.index).split("\n").length;
          conflitos.push(
            `  ${ficheiro.replace(process.cwd() + "/", "")}:${linha}\n` +
              `    "${util[0]}" não faz nada: ".${classe}" declara \`width\` fora de @layer`,
          );
        }
      }
    }

    expect(
      conflitos,
      `${conflitos.length} utilitário(s) de largura calados por CSS à mão fora de camada.\n` +
        `Passe a declaração \`width\` dessas classes para dentro de \`@layer components { … }\` ` +
        `em globals.css — é o que o \`.bo-input\` faz, e a razão está escrita lá.\n\n` +
        conflitos.join("\n"),
    ).toEqual([]);
  });

  /**
   * A rede acima só vale se o leitor de CSS estiver mesmo a ler. Sem isto, um
   * `lerRegras` partido (ou um caminho errado) dava zero conflitos e passava
   * a verde para sempre.
   */
  it("o leitor de CSS encontra mesmo regras, e distingue as que estão em camada", () => {
    expect(regras.length).toBeGreaterThan(100);
    expect(regras.some((r) => r.emCamada)).toBe(true);
    expect(regras.some((r) => !r.emCamada)).toBe(true);
    // O caso concreto que motivou tudo isto: a largura do `.bo-input` está
    // dentro de uma camada, e é lá que tem de ficar.
    const larguraDoCampo = regras.filter(
      (r) => classesDe(r.seletor).includes("bo-input") && DECLARA_LARGURA.test(r.corpo),
    );
    expect(larguraDoCampo).toHaveLength(1);
    expect(larguraDoCampo[0].emCamada).toBe(true);
  });
});
