import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ARESTA QUE DIZ «HÁ MAIS POR BAIXO»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * F-09 da auditoria: «O cartão termina a meio do campo "Preço final (sem IVA)
 * €", com o campo cortado pela borda e um grande vazio branco por baixo. O
 * conteúdo continua com scroll, mas visualmente parece que a ficha acabou ali.»
 *
 * A auditoria propõe duas coisas. A primeira — dar altura de ecrã à coluna com
 * `overflow-y` interno — já estava feita, e medida: ver `alturaDoDetalhe` no
 * `AdminClient`, com a conta escrita («341 + 788 dá 1129 num ecrã de 900»).
 * A segunda é esta: «um sombreado no fundo a indicar que há mais».
 *
 * ── O QUE ESTE FICHEIRO GUARDA, E O QUE NÃO PODE GUARDAR ──────────────────
 *
 * O comportamento — aparecer quando há mais, desaparecer no fim — é geometria
 * de `position: sticky`, e num jsdom não há geometria nenhuma. Isso mede-se num
 * browser: `e2e/aresta-de-rolagem.spec.ts`.
 *
 * Aqui guardam-se as três condições SEM as quais essa geometria não acontece, e
 * que se partem em silêncio:
 *
 *   1. a regra continua a ser `sticky` colada a `bottom: 0`;
 *   2. a faixa continua a ser a ÚLTIMA filha do que rola — se alguém lhe puser
 *      um irmão por baixo, ela deixa de descolar no fim e passa a esbater a
 *      última linha da ficha para sempre;
 *   3. não volta a haver margem negativa a cancelar-lhe a altura, pela mesma
 *      razão.
 */

// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS = readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");
const ADMIN = readFileSync("src/app/[lang]/(admin)/orcamento/admin/AdminClient.tsx", "utf8");

/** Comentários fora, com as linhas de pé — a regra da casa. */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

/** O corpo da regra `.bo-ha-mais-abaixo`. */
function regra(): string {
  const css = semComentarios(CSS);
  const i = css.indexOf(".bo-ha-mais-abaixo {");
  expect(i, "a regra `.bo-ha-mais-abaixo` desapareceu do globals.css").toBeGreaterThan(-1);
  return css.slice(i, css.indexOf("\n}", i));
}

describe("a aresta de rolagem do painel de detalhe", () => {
  it("é `sticky` colada à aresta de baixo", () => {
    const r = regra();
    expect(r).toMatch(/position:\s*sticky/);
    expect(r).toMatch(/bottom:\s*0/);
  });

  it("não intercepta o que está vivo por baixo dela", () => {
    // Enquanto está colada tem campos e botões por baixo. Uma faixa que os
    // apanhe é pior do que faixa nenhuma.
    expect(regra()).toMatch(/pointer-events:\s*none/);
  });

  it("ocupa altura em vez de a roubar ao conteúdo", () => {
    // Com margem negativa a faixa cancelava a própria altura — e ao chegar ao
    // fim ficava por cima das últimas linhas da ficha, a esbatê-las para
    // sempre. Trocava um defeito por outro.
    const r = regra();
    expect(r).toMatch(/height:\s*[^;]+/);
    expect(r, "voltou a haver margem negativa a cancelar a altura").not.toMatch(
      /margin(-top)?:\s*-/,
    );
  });

  it("é a última filha da caixa que rola, no painel de detalhe", () => {
    // Se alguém lhe puser um irmão por baixo, a posição natural da faixa deixa
    // de ser o fim do conteúdo — e ela nunca mais descola.
    const src = semComentarios(ADMIN);
    const abre = src.indexOf('className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto');
    expect(abre, "não encontrei a caixa que rola do painel de detalhe").toBeGreaterThan(-1);
    const faixa = src.indexOf('className="bo-ha-mais-abaixo"', abre);
    expect(faixa, "a faixa saiu do painel de detalhe").toBeGreaterThan(abre);

    // Entre a faixa e o fecho da caixa não pode haver mais nenhum elemento.
    const depois = src.slice(src.indexOf("/>", faixa) + 2);
    const proximo = depois.search(/<[A-Za-z]/);
    const fecho = depois.indexOf("</div>");
    expect(fecho, "não encontrei o fecho da caixa que rola").toBeGreaterThan(-1);
    expect(
      proximo === -1 || proximo > fecho,
      "alguém pôs um elemento DEPOIS da faixa dentro da caixa que rola",
    ).toBe(true);
  });
});
