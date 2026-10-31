import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ANEL DE FOCO: ONDE ELE TEM DE ESTAR, E O ÚNICO SÍTIO ONDE NÃO ESTÁ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, com uma captura do «Local / Região» do formulário de
 * orçamento: «no orçamento eu não quero ao carregar nas coisas fique com esse
 * quadrado verde à volta. retira isso.»
 *
 * MEDIDO num Chromium, a clicar com o rato nesse campo: três indicadores de
 * foco ao mesmo tempo — o anel global (`outline: solid 2px`, offset 2), a borda
 * de baixo já passada a moss, e o filete de 2 px desenhado a toda a largura.
 * O «quadrado verde» é o primeiro; os outros dois são os que o `globals.css`
 * desenhou de propósito para este formulário.
 *
 * E aparece ao RATO e não só ao teclado, porque o `:focus-visible` casa sempre
 * num campo de escrever, por especificação. Não havia gesto em que ela não o
 * visse.
 *
 * ── O QUE ESTE FICHEIRO GUARDA, E PORQUE SÃO AS DUAS PONTAS ───────────────
 *
 * Tirar um anel de foco é a correcção mais fácil de fazer mal: cala a queixa e
 * deixa quem navega por teclado sem saber onde está. A Parte 18 do
 * `docs/DESIGN-SYSTEM.md` proíbe `outline: none` SEM SUBSTITUTO, e é essa a
 * palavra que importa.
 *
 * Por isso guardam-se as duas pontas ao mesmo tempo:
 *
 *   1. que a excepção existe só no `.field-line` — a classe do formulário de
 *      orçamento, e de mais lado nenhum;
 *   2. que o SUBSTITUTO continua lá (o filete de 2 px a toda a largura);
 *   3. que o anel global continua a valer para o resto do sítio inteiro;
 *   4. que o modo de contraste forçado repõe um `outline` do sistema.
 *
 * Sem a 2 e a 3, apagar o anel de toda a gente passava neste ficheiro.
 */

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** O CSS sem comentários: eles contam a história e mencionam o que se tirou. */
const codigo = CSS.replace(/\/\*[\s\S]*?\*\//g, " ");

describe("o anel de foco", () => {
  it("continua a existir, em verde e afastado, para o sítio inteiro", () => {
    expect(
      /(^|\})\s*:focus-visible\s*\{[^}]*outline:\s*2px solid/m.test(codigo),
      "o anel global desapareceu — quem navega por teclado deixou de saber onde está",
    ).toBe(true);
    expect(/(^|\})\s*:focus-visible\s*\{[^}]*outline-offset:/m.test(codigo)).toBe(true);
  });

  it("sai apenas nos campos do formulário de orçamento — e na caixa dos anúncios", () => {
    expect(
      /\.field-line:focus-visible,\s*\.campo-apple:focus-visible\s*\{\s*outline:\s*none/.test(codigo),
      "o «quadrado verde» voltou aos campos do orçamento ou dos anúncios",
    ).toBe(true);
  });

  /**
   * Desde 31/10 há duas caixas: o sublinhado do orçamento (`.field-line`, de
   * volta a pedido dela) e a caixa redonda dos anúncios (`.campo-apple`). A
   * dos anúncios também só sai do anel porque tem indicador próprio — e não
   * verde.
   */
  it("e a caixa dos anúncios tem o seu indicador próprio, que não é verde", () => {
    const foco = codigo.match(/\.campo-apple:focus\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(/border-color:\s*var\(--fg-secondary\)/.test(foco)).toBe(true);
    expect(/box-shadow:\s*inset/.test(foco)).toBe(true);
    expect(/moss|--accent/.test(foco), "o foco da caixa dos anúncios voltou a ser verde").toBe(false);
  });

  /**
   * A regra que interessa, e a razão de este ficheiro não ser só cosmético:
   * a excepção só é legítima porque há substituto. Se alguém apagar o filete,
   * a excepção passa a ser um `outline: none` nu — o que a Parte 18 proíbe.
   */
  it("e só porque o campo tem indicador PRÓPRIO, que continua lá", () => {
    expect(
      /\.field-line:focus\s*\{\s*background-size:\s*100%\s+2px/.test(codigo),
      "o filete de foco do campo desapareceu — a excepção ao anel ficou sem substituto",
    ).toBe(true);
    // E o filete é moss, não uma cor qualquer que se perca no fundo.
    expect(/\.field-line\s*\{[^}]*linear-gradient\(var\(--color-moss\)/.test(codigo)).toBe(true);
  });

  it("e o contraste forçado repõe um anel do sistema, também no campo", () => {
    const blocos = [...codigo.matchAll(/@media\s*\(forced-colors:\s*active\)\s*\{([\s\S]*?)\n\}/g)];
    const cobreOCampo = blocos.some((b) => /\.field-line:focus-visible/.test(b[1]));
    expect(
      cobreOCampo,
      "em contraste forçado o campo ficou sem anel nenhum — aí não há filete que se veja",
    ).toBe(true);
  });

  /**
   * O CONTROLO NEGATIVO DA EXCEPÇÃO: que ela é NOMEADA e não uma varredura.
   *
   * Um `input:focus-visible { outline: none }` ou um `*:focus-visible` calava a
   * queixa dela e apagava o anel de todos os campos do sítio — incluindo os que
   * não têm filete nenhum para o substituir.
   */
  it("a excepção é nomeada, e não uma varredura que apanhe tudo", () => {
    const largas = [
      /\*\s*:focus-visible\s*\{\s*outline:\s*none/,
      /(^|[\s,}])input:focus-visible\s*\{\s*outline:\s*none/m,
      /(^|[\s,}])textarea:focus-visible\s*\{\s*outline:\s*none/m,
    ];
    for (const r of largas) {
      expect(
        r.test(codigo),
        `o anel passou a ser apagado em massa por «${r.source}» — a excepção devia ser só do \`.field-line\``,
      ).toBe(false);
    }
  });
});
