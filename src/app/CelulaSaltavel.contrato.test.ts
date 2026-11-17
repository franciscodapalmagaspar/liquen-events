import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS CÉLULAS QUE O BROWSER PODE SALTAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma grelha de fotos com centenas de células pagava layout, pintura e
 * descodificação por TODAS elas, incluindo as que estão a mil pixéis abaixo do
 * ecrã. `content-visibility: auto` diz ao browser que pode saltar as que não
 * estão à vista.
 *
 * Isto perde-se de três maneiras, e nenhuma delas dá erro:
 *
 *  1. a classe desaparecer de uma das grelhas num refactor;
 *  2. a regra sair da `@layer utilities` — este projecto já foi mordido quatro
 *     vezes pela mesma coisa (ver o cabeçalho longo em `globals.css`): em
 *     Tailwind v4, CSS sem camada ganha SEMPRE aos utilitários, em silêncio;
 *  3. o `aspect-square` sair do INVÓLUCRO. `content-visibility: auto` implica
 *     `contain: size`, portanto uma célula saltada dimensiona-se como se não
 *     tivesse conteúdo. Se a altura vinha do conteúdo, a célula colapsa e a
 *     página inteira salta debaixo do dedo enquanto se rola.
 *
 * Nenhuma delas aparece num teste de comportamento — a grelha continua a
 * desenhar-se, só que devagar (1 e 2) ou aos saltos (3). Por isso são fixadas
 * aqui, na forma.
 */

const raiz = process.cwd();

/**
 * Lê um ficheiro SEM comentários.
 *
 * Sem isto, um comentário que EXPLIQUE a classe (que é precisamente o que se
 * quer que exista) conta como uma utilização e o teste passa a acusar a
 * explicação. Apagar a explicação para calar o teste é o oposto do que ele
 * serve. O mesmo vale para o CSS, onde o cabeçalho longo sobre camadas fala de
 * `@layer utilities` muito antes de a camada existir de facto.
 */
const ler = (...p: string[]) =>
  readFileSync(join(raiz, ...p), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const GRELHAS = [
  {
    onde: "seletor de temas (ThemePicker.tsx)",
    fonte: ler("src", "app", "[lang]", "(admin)", "orcamento", "admin", "ThemePicker.tsx"),
  },
  {
    onde: "grelha de fotos de um tema (Temas.tsx)",
    fonte: ler("src", "app", "[lang]", "(admin)", "orcamento", "admin", "Temas.tsx"),
  },
];

describe("content-visibility nas grelhas de fotos", () => {
  it("as duas grelhas marcam as células como saltáveis", () => {
    for (const { onde, fonte } of GRELHAS) {
      expect(
        fonte.includes("celula-saltavel"),
        `${onde} deixou de saltar células fora do ecrã`,
      ).toBe(true);
    }
  });

  /**
   * A altura tem de vir do INVÓLUCRO, não do que está lá dentro. É a diferença
   * entre uma célula saltada que ocupa o mesmo espaço de sempre e uma que
   * colapsa para zero e faz a barra de deslocamento dar um coice.
   */
  it("a célula saltável traz proporção fixa no próprio invólucro", () => {
    /*
     * Fixa-se a PROPRIEDADE, não um valor.
     *
     * Este caso já chumbou uma vez por dizer `aspect-square` à letra, quando a
     * grelha dos temas passou a 4:3 — uma mudança pedida pelo documento, e o
     * teste a acusá-la como defeito. O que impede o colapso não é ser
     * quadrada: é a célula ter uma proporção qualquer, porque `contain: size`
     * faz o browser dimensionar a célula saltada COMO SE não tivesse conteúdo,
     * e é da proporção que sai a altura.
     *
     * O `aspect-auto` fica de fora de propósito: é o valor que devolve a
     * altura ao conteúdo, e é exactamente o defeito que este caso apanha.
     */
    const PROPORCAO = /\baspect-(?!auto\b)[\w[\]/.-]+/;
    for (const { onde, fonte } of GRELHAS) {
      // Todas as ocorrências da classe, com o resto do `className` à volta.
      const usos = [...fonte.matchAll(/celula-saltavel[^"`]*/g)].map((m) => m[0]);
      expect(usos.length, `${onde} não usa a classe`).toBeGreaterThan(0);
      for (const uso of usos) {
        expect(
          PROPORCAO.test(uso),
          `${onde}: célula saltável sem proporção fixa no próprio invólucro — colapsa ao ser saltada. Encontrei «${uso.trim()}»`,
        ).toBe(true);
      }
    }
  });

  it("a regra está declarada, e DENTRO de @layer utilities", () => {
    const css = ler("src", "app", "globals.css");
    expect(css).toContain("content-visibility: auto");

    // A camada em que a regra cai decide se ela é um utilitário normal ou uma
    // regra que ganha a toda a gente. Contam-se as chavetas desde cada `@layer
    // utilities` até à declaração: se sairmos do bloco antes de lá chegar, a
    // regra ficou de fora daquele.
    //
    // ── TODOS OS BLOCOS, E NÃO SÓ O PRIMEIRO ────────────────────────────
    //
    // Esta procura olhava só para o PRIMEIRO `@layer utilities` do ficheiro, e
    // isso valia enquanto houvesse um só. No dia em que apareceu um segundo —
    // a entrelinha da legenda, dentro do `@media` do chão da letra — este teste
    // chumbou por uma razão que não era a dele: a `.celula-saltavel` continuava
    // dentro de uma camada, só que da outra.
    //
    // O que ele guarda é «está dentro de ALGUMA `@layer utilities`». É isso que
    // passa a medir, e continua a chumbar se ela sair de todas.
    const blocosDeUtilitarios: string[] = [];
    for (let inicio = css.indexOf("@layer utilities"); inicio !== -1; ) {
      let profundidade = 0;
      let fim = css.length;
      for (let i = css.indexOf("{", inicio); i < css.length; i++) {
        if (css[i] === "{") profundidade++;
        else if (css[i] === "}") {
          profundidade--;
          if (profundidade === 0) {
            fim = i;
            break;
          }
        }
      }
      blocosDeUtilitarios.push(css.slice(inicio, fim));
      inicio = css.indexOf("@layer utilities", fim);
    }
    expect(blocosDeUtilitarios.length, "não há `@layer utilities` em globals.css").toBeGreaterThan(
      0,
    );
    expect(
      blocosDeUtilitarios.some((bloco) => bloco.includes(".celula-saltavel")),
      "`.celula-saltavel` está fora de QUALQUER @layer utilities — em Tailwind v4 " +
        "isso faz uma regra sem camada ganhar a todos os utilitários, em silêncio",
    ).toBe(true);
  });
});
