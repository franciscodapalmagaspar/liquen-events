import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A BARRA DE TOPO É VIDRO — E A FAIXA NÃO É UMA PEÇA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. A dona do negócio, a olhar para o back office: «nada está
 * igual em termos de design sobre os anexos que coloquei sobre o liquid glass».
 * Tinha razão, e a razão media-se: o material tinha sido aplicado a 27 sítios e
 * eram todos coisas que FLUTUAM — menus, listas de escolha, folhas, diálogos, a
 * paleta de comandos. O que ela olha o dia inteiro continuava a ser cor sólida:
 * a coluna da esquerda em `--bo-chao` e a barra de topo em `--bo-surface`.
 *
 * ── A BARRA ENTROU PRIMEIRO, E A COLUNA TEVE DE ESPERAR PELO CHÃO ───────
 *
 * Vidro só existe se houver alguma coisa por trás para atravessar.
 *
 * A barra de topo é `sticky top-0` e o conteúdo passa MESMO por baixo dela ao
 * rolar. Há o que compor, e o material leu-se logo — sem tocar em mais nada.
 *
 * A coluna da esquerda é uma coluna ao LADO do conteúdo: por trás dela só está
 * o chão, e o chão era branco por pedido dela. Vidro sobre branco liso vê-se
 * exactamente como branco, portanto pôr material na coluna era trabalho
 * invisível — e mudar o chão sem lho perguntar era desfazer uma decisão dela.
 *
 * Foi-lhe posta a escolha com as duas metades escritas, e ela respondeu «tinta
 * o chão, quero o vidro». O `--bo-chao` passou a `#f7f8f7`, e a coluna entrou
 * logo a seguir. As duas levam a faixa; o teste de cada uma está aqui em baixo.
 *
 * ── PORQUE É QUE A FAIXA É UMA CLASSE E NÃO A `.bo-material` COM AJUDAS ──
 *
 * A `.bo-material` desenha uma PEÇA: traz raio e moldura dos quatro lados. Uma
 * barra colada ao cimo da janela não tem cantos nem lados.
 *
 * E não se corrige com utilitários ao lado, porque a `.bo-material` vive FORA
 * de camadas e ganha sempre à `@layer utilities` — um `rounded-none` ou um
 * `border-x-0` não lhe chegavam. O que ela partiria é concreto: o fio de baixo
 * do cabeçalho troca entre transparente e visível conforme a página desceu (é o
 * que o `fio-do-cabecalho.test.ts` prende), e um `border: 1px solid
 * var(--bo-hairline-strong)` fora de camadas comia essa troca sem deixar rasto.
 */

// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS =
  readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8") +
  readFileSync(join(process.cwd(), "src/app/admin.css"), "utf8");
const ADMIN = readFileSync(
  join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin/AdminClient.tsx"),
  "utf8",
);

/** O corpo de uma regra, pelo selector — sem comentários pelo meio. */
function corpoDaRegra(css: string, selector: string): string | null {
  const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const i = semComentarios.indexOf(selector + " {");
  if (i < 0) return null;
  const abre = semComentarios.indexOf("{", i);
  const fecha = semComentarios.indexOf("}", abre);
  return semComentarios.slice(abre + 1, fecha);
}

describe("a faixa do cabeçalho", () => {
  it("existe, e assenta na superfície do material", () => {
    const corpo = corpoDaRegra(CSS, ".bo-material-faixa");
    expect(corpo, "`.bo-material-faixa` desapareceu do `globals.css`").not.toBeNull();
    expect(corpo, "a faixa deixou de usar o token do material").toMatch(/--bo-material\b/);
  });

  /**
   * O que a distingue da `.bo-material`, e a única razão de ela existir. Se um
   * dia alguém lhe acrescentar raio ou moldura, mais vale usar a `.bo-material`
   * — e é sinal de que o cabeçalho deixou de ser uma faixa.
   */
  it("não tem raio nem moldura — é isso que a faz faixa", () => {
    const corpo = corpoDaRegra(CSS, ".bo-material-faixa")!;
    expect(corpo, "a faixa ganhou um raio: já não é uma faixa, é uma peça").not.toMatch(
      /border-radius/,
    );
    expect(corpo, "a faixa ganhou moldura e come o fio que o cabeçalho acende").not.toMatch(
      /border(-\w+)?:/,
    );
  });

  /**
   * As mesmas três irmãs que a `.bo-material` respeita. Uma superfície nova que
   * esqueça os recuos é uma superfície que fica translúcida para quem pediu ao
   * sistema que não fosse.
   */
  it.each([
    ["prefers-reduced-transparency: reduce", /@media \(prefers-reduced-transparency: reduce\) \{/],
    ["prefers-contrast: more", /@media \(prefers-contrast: more\) \{/],
  ])("fica opaca quando o sistema pede (%s)", (_nome, abertura) => {
    const semComentarios = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const i = semComentarios.search(abertura);
    expect(i, "o bloco de recuo desapareceu").toBeGreaterThan(-1);
    // até ao fecho do @media: o primeiro `\n}` na coluna zero
    const fim = semComentarios.indexOf("\n}", i);
    const bloco = semComentarios.slice(i, fim);
    expect(bloco, "a faixa não entra neste recuo e fica translúcida contra a vontade").toMatch(
      /\.bo-material-faixa/,
    );
  });

  /**
   * ── E A COLUNA DA ESQUERDA, DEPOIS DE O CHÃO DEIXAR DE SER BRANCO ───────
   *
   * O cabeçalho deste ficheiro explicava porque é que a coluna NÃO entrava: por
   * trás dela só está o chão, e o chão era branco — vidro sobre branco liso
   * vê-se exactamente como branco.
   *
   * Essa condição deixou de valer. Posta a escolha, ela respondeu «tinta o
   * chão, quero o vidro», e o `--bo-chao` passou a `#f7f8f7` (ver
   * `chao-do-painel.test.ts`). Com alguma coisa por trás, a coluna passa a ler
   * como material em vez de como uma parede branca ao lado de outra.
   *
   * Leva a FAIXA e não a `.bo-material`, pela mesma razão que o cabeçalho: uma
   * coluna de ecrã inteiro não tem cantos, e o único fio que lhe faz sentido é
   * o da direita — que ela já acende sozinha.
   */
  it("a gaveta da esquerda também, agora que há chão por trás dela", () => {
    /**
     * ── E A COLUNA DEIXOU DE SER COLUNA ─────────────────────────────────
     *
     * O `lg:sticky` saiu do selector porque saiu do código: posta a escolha
     * entre conviver com a barra de vidro ou ser substituída por ela, ela
     * respondeu «a barra substitui o menu». Os destinos passaram todos para a
     * cápsula que flutua em baixo, e esta peça passou a ser uma GAVETA nas duas
     * larguras — com o logótipo, a conta, a ajuda e as quatro acções.
     *
     * O MATERIAL fica, e é por isso que este teste fica: uma gaveta que se abre
     * por cima do trabalho tem ainda mais razões para ser vidro do que uma
     * coluna encostada tinha.
     */
    const linha = ADMIN.split("\n").find(
      (l) => l.includes("fixed top-0") && l.includes("h-screen w-64"),
    );
    expect(linha, "não encontrei a gaveta — o selector desta busca envelheceu").toBeDefined();
    expect(linha, "a gaveta deixou de levar a faixa").toContain("bo-material-faixa");
    expect(linha, "a faixa sem desfoque não é vidro, é uma cor mais clara").toContain(
      "bo-material-desfoque",
    );
    expect(linha, "a gaveta voltou a pintar-se de sólido por cima do material").not.toContain(
      "bg-[var(--bo-chao)]",
    );
  });

  it("a barra de topo do back office usa-a, e já não se pinta de sólido", () => {
    const linha = ADMIN.split("\n").find(
      (l) => l.includes("sticky top-0") && l.includes("border-b") && l.includes("pt-safe"),
    );
    expect(
      linha,
      "não encontrei a barra de topo — o selector desta busca envelheceu",
    ).toBeDefined();
    expect(linha, "a barra de topo deixou de levar a faixa").toContain("bo-material-faixa");
    expect(linha, "a faixa sem desfoque não é vidro, é uma cor mais clara").toContain(
      "bo-material-desfoque",
    );
    expect(linha, "a barra voltou a pintar-se de sólido por cima do material").not.toContain(
      "bg-[var(--bo-surface",
    );
  });
});
