import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DOIS MOMENTOS QUE SE VIAM SALTAR TODOS OS DIAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero animações em tudo o que seja para ir de uma coisa à
 * outra».
 *
 * Nem tudo o que muda de estado é uma vista a chegar. Estes dois não são — e
 * eram os dois saltos mais vistos do back office.
 *
 * 1. **O recibo do desfecho.** «Marcado como ganho — 4.600 €» é o fim de um
 *    percurso que começou num pedido e passou por uma proposta inteira.
 *    Aparecia num fotograma, no lugar onde estavam os botões.
 *
 * 2. **O botão «Guardar tudo».** Passa de pílula verde a caixa cinzenta com
 *    canto diferente, no cabeçalho, várias vezes por hora. O `ESTADO` já dava
 *    transição às cores, mas a lista dele é FECHADA de propósito e não tem
 *    `border-radius`: as cores deslizavam e o canto saltava, no mesmo elemento
 *    e no mesmo instante.
 *
 * ── O QUE ESTE FICHEIRO PRENDE, E O QUE NÃO ───────────────────────────────
 *
 * Prende que o gesto existe e que é o da casa. Não prende que se veja — isso é
 * o browser. E prende, com nome, o que NÃO deve levar entrada: o painel do
 * valor combinado tem `autoFocus`, e uma entrada ali arrastava o campo quatro
 * píxeis debaixo do cursor que já lá está. É a armadilha mais fácil de cair
 * quando alguém decide «acabar o trabalho» e animar o painel todo.
 */

const DESFECHO = readFileSync(
  "src/app/[lang]/(admin)/orcamento/admin/PerguntaDeDesfecho.tsx",
  "utf8",
);
const GUARDAR = readFileSync("src/app/[lang]/(admin)/orcamento/admin/GuardarTudo.tsx", "utf8");
// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS = readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");

describe("dois momentos que não saltam", () => {
  it("o recibo do desfecho aparece de algum sítio", () => {
    expect(DESFECHO).toMatch(/fase\.tipo === "marcado" \? \(/);
    expect(DESFECHO).toMatch(/<div className="bo-entrada flex flex-col gap-2">/);
  });

  /**
   * O controlo que dá sentido ao de cima: o painel com `autoFocus` continua SEM
   * entrada. Se alguém lha puser, o campo passa a mexer-se debaixo do cursor.
   */
  it("o painel do valor combinado, que tem `autoFocus`, continua sem entrada", () => {
    const painel = DESFECHO.slice(DESFECHO.indexOf('fase.tipo === "quanto"'));
    const ate = painel.slice(0, painel.indexOf("autoFocus"));
    expect(ate).not.toMatch(/bo-entrada|bo-cena|view-in/);
  });

  /**
   * ── UMA LISTA, E NÃO DUAS — E A ANTIGA FAZIA O CONTRÁRIO DO QUE DIZIA ─────
   *
   * Estava assim: `transition-[border-radius]` no elemento e o `${ESTADO}` (com
   * a lista dele) lá dentro, nos dois ramos do ternário. São DUAS declarações
   * de `transition-property` no mesmo elemento, com a mesma especificidade —
   * ganha a que o Tailwind emitir mais abaixo na folha, não a que está escrita
   * primeiro no atributo.
   *
   * COMPILADO nesta casa (Tailwind 4.3) para não ficar por dedução: os
   * utilitários `transition-[…]` saem por ordem alfabética do valor, portanto
   *
   *     .transition-[background-color,border-color,color,box-shadow,opacity,scale]   ← linha 4443
   *     .transition-[border-radius]                                                  ← linha 4463
   *
   * e o `border-radius` fica DEPOIS. Resultado real: `transition-property:
   * border-radius` e mais nada — o canto deslizava e as cores é que saltavam,
   * ao contrário do que o comentário deste ficheiro descrevia. A avaria que se
   * queria corrigida estava viva, só que virada do avesso.
   *
   * A lista passa a ser UMA, escrita por extenso: a do `ESTADO` mais
   * `border-radius`. O `${ESTADO}` sai dos ramos (era ele a segunda
   * declaração); o `${PRESSAO}` fica, porque é o toque e não uma lista.
   */
  it("o botão «Guardar tudo» muda de forma com a mesma cadência da cor", () => {
    // Uma só declaração, com as duas coisas lá dentro e os 120 ms do `ESTADO`.
    expect(GUARDAR).toMatch(
      /motion-safe:transition-\[background-color,border-color,color,box-shadow,opacity,scale,border-radius\] motion-safe:duration-\[120ms\]/,
    );
    // E NENHUMA segunda lista no mesmo elemento — era isso que partia.
    // Os comentários saem primeiro: a prosa deste ficheiro CITA a lista antiga
    // para explicar a avaria, e sem isto o próprio texto que a conta chumbava.
    const semProsa = GUARDAR.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const listas = [...semProsa.matchAll(/transition-\[[^\]]+\]/g)].map((m) => m[0]);
    expect(new Set(listas).size, `mais do que uma lista no botão: ${listas.join(" · ")}`).toBe(1);
    // Controlo positivo: o toque continua a ser o gesto da casa.
    expect(GUARDAR).toMatch(/\$\{PRESSAO\}/);
  });

  it("a `.bo-entrada` continua a ser 240 ms e a calar-se com movimento reduzido", () => {
    expect(CSS).toMatch(/\.bo-entrada\s*\{\s*animation:\s*bo-entrada\s+240ms/);
    expect(CSS).toMatch(
      /prefers-reduced-motion:\s*reduce\)\s*\{\s*\.bo-entrada\s*\{\s*animation:\s*none/,
    );
  });
});
