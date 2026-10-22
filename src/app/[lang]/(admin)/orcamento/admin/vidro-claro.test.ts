import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { achatar, racioDeContraste } from "./contraste-do-texto.test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O VIDRO CLARO — A SEGUNDA VARIANTE, E O ÚNICO SÍTIO ONDE ELA VIVE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A investigação que ela mandou tem duas variantes e só duas: a REGULAR (o
 * `.bo-material`, tudo o que tem texto) e a CLEAR, muito mais translúcida, só
 * para controlos que flutuam sobre média rica.
 *
 * Aqui isso é um sítio: os chips que pousam na miniatura de um tema.
 *
 * ── O QUE ESTE FICHEIRO GUARDA, E PORQUE É QUE PRECISA DE EXISTIR ─────────
 *
 * O vidro claro é, por construção, o desenho mais fácil de partir que há: a
 * legibilidade dele não vem da superfície (que quase não existe) — vem do VÉU
 * de escurecimento por trás. Baixar o véu «porque estava escuro de mais» é uma
 * edição de dois caracteres que apaga a única coisa que fazia o glifo ler-se, e
 * não deixa rasto nenhum. Por isso o véu mede-se a partir do token, contra o
 * pior fundo, e não se afirma.
 *
 * O pior fundo aqui NÃO é preto — é BRANCO. É a diferença entre esta variante e
 * a regular, e é a razão de as duas terem contas separadas: o glifo do vidro
 * claro é branco, portanto o que o apaga é uma fotografia clara.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");
// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS =
  readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8") +
  readFileSync(join(process.cwd(), "src/app/admin.css"), "utf8");

/** WCAG 2.1 §1.4.11 — ícones e outros elementos não-textuais. */
const NAO_TEXTO = 3;
/** §1.4.3 — a barra que passaria a valer se ali entrasse uma palavra. */
const AA = 4.5;

type RGB = [number, number, number];
const BRANCO: RGB = [255, 255, 255];
const PRETO: RGB = [0, 0, 0];

const SELECTOR_ADMIN = "body:is(.admin-mode, :has([data-admin-mode]))";
function token(nome: string): string {
  const inicio = CSS.indexOf(`${SELECTOR_ADMIN} {`);
  expect(inicio, `desapareceu o bloco \`${SELECTOR_ADMIN}\``).toBeGreaterThan(-1);
  const bloco = CSS.slice(inicio, CSS.indexOf("\n}", inicio));
  const m = bloco.match(new RegExp(`${nome}\\s*:\\s*([^;]+);`));
  expect(m, `o token ${nome} desapareceu`).not.toBeNull();
  return m![1].trim();
}

function corComAlpha(valor: string): { cor: RGB; alpha: number } {
  const rgba = valor.match(/rgba?\(([^)]+)\)/);
  if (rgba) {
    const p = rgba[1].split(",").map((x) => parseFloat(x.trim()));
    return { cor: [p[0], p[1], p[2]], alpha: p[3] ?? 1 };
  }
  const s = valor.match(/#([0-9a-fA-F]{6})/);
  if (!s) throw new Error(`valor de cor que não sei ler: ${valor}`);
  const h = s[1];
  return { cor: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB, alpha: 1 };
}

/** A pilha do chip: fotografia → véu → vidro claro. */
function superficie(foto: RGB): RGB {
  const veu = corComAlpha(token("--bo-vidro-claro-veu"));
  const vidro = corComAlpha(token("--bo-vidro-claro"));
  return achatar(vidro.cor, vidro.alpha, achatar(veu.cor, veu.alpha, foto));
}

function semComentarios(fonte: string): string {
  const guarda = (t: string) => t.replace(/[^\n]/g, " ");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, guarda)
    .replace(/\/\*[\s\S]*?\*\//g, guarda)
    .replace(/^[^\S\n]*\/\/.*$/gm, guarda);
}

const TEMAS = () => semComentarios(readFileSync(join(RAIZ, "Temas.tsx"), "utf8"));

describe("o vidro claro lê-se sobre a pior fotografia que há", () => {
  it("a rede está armada: o véu escurece mesmo, e o vidro é quase nada", () => {
    const veu = corComAlpha(token("--bo-vidro-claro-veu"));
    const vidro = corComAlpha(token("--bo-vidro-claro"));
    expect(veu.cor, "o véu deixou de ser preto").toEqual(PRETO);
    expect(veu.alpha).toBeGreaterThan(0);
    expect(vidro.cor, "o vidro claro deixou de ser branco").toEqual(BRANCO);
    // «Clear» quer dizer clear: acima de 0,2 já é a variante regular com outro nome.
    expect(vidro.alpha, "o vidro claro deixou de ser claro").toBeLessThanOrEqual(0.2);
    // E sobre branco tem de ficar mais escuro do que branco, senão nada disto mede nada.
    expect(superficie(BRANCO)[0]).toBeLessThan(200);
  });

  it("o glifo branco passa os 3:1 sobre uma fotografia BRANCA, que é o pior caso", () => {
    const racio = racioDeContraste(BRANCO, superficie(BRANCO));
    expect(
      racio,
      `o glifo branco mede ${racio.toFixed(2)}:1 sobre o chip assente numa fotografia ` +
        "branca. O documento propunha um véu de 0,35, que dá 2,20:1 — a conta está no " +
        "`globals.css`",
    ).toBeGreaterThanOrEqual(NAO_TEXTO);
  });

  it("e sobre uma fotografia PRETA continua a ler-se (o chip não desaparece)", () => {
    expect(racioDeContraste(BRANCO, superficie(PRETO))).toBeGreaterThanOrEqual(NAO_TEXTO);
  });

  /**
   * A linha que este ficheiro não deixa atravessar sem se dar por ela. Um véu
   * de 0,50 chega a um ÍCONE; a uma PALAVRA não chega — faltam-lhe os 4,5:1, e
   * o véu teria de subir a 0,61. Enquanto não houver palavra nenhuma no chip, o
   * véu pode ficar onde está; no dia em que houver, isto diz onde ele tem de ir.
   */
  it("não entrou texto no chip — se entrar, o véu tem de subir", () => {
    const bloco = TEMAS();
    const i = bloco.indexOf("bo-vidro-claro");
    expect(i, "o chip do tema deixou de usar o vidro claro").toBeGreaterThan(-1);
    const veu = corComAlpha(token("--bo-vidro-claro-veu")).alpha;
    const paraTexto = (() => {
      for (let v = 0; v <= 100; v++) {
        const vidro = corComAlpha(token("--bo-vidro-claro"));
        const s = achatar(vidro.cor, vidro.alpha, achatar(PRETO, v / 100, BRANCO));
        if (racioDeContraste(BRANCO, s) >= AA) return v / 100;
      }
      throw new Error("nenhum véu chega a AA — o vidro claro está claro de mais");
    })();
    expect(paraTexto, "a conta do véu para texto mudou de sítio").toBeGreaterThan(veu);
  });
});

describe("o vidro claro não traz filtro, e é isso que o mantém dentro do tecto", () => {
  /**
   * O tecto é do próprio documento: menos de cinco superfícies com
   * `backdrop-filter` por ecrã. Este chip existe uma vez POR ACÇÃO E POR
   * CARTÃO — com quatro temas eram doze, com trinta seriam noventa. Medido no
   * browser antes de mexer: catorze superfícies filtradas na vista de Temas.
   */
  it("a classe não pede `backdrop-filter` nenhum", () => {
    const i = CSS.indexOf(".bo-vidro-claro {");
    expect(i, "`.bo-vidro-claro` desapareceu do globals.css").toBeGreaterThan(-1);
    const bloco = CSS.slice(i, CSS.indexOf("}", i));
    expect(
      bloco,
      "o vidro claro ganhou um filtro: numa grelha de temas isso é um filtro por cartão",
    ).not.toContain("backdrop-filter");
  });

  it("e os chips dos temas deixaram de trazer o seu próprio desfoque", () => {
    const bloco = TEMAS();
    const i = bloco.indexOf("bo-vidro-claro");
    // A janela do chip, à volta da classe.
    const janela = bloco.slice(Math.max(0, i - 600), i + 600);
    expect(
      janela.match(/\bbackdrop-blur(?:-\[[^\]]*\]|-[a-z0-9]+)?\b/g) ?? [],
      "o chip do tema voltou a ter desfoque próprio",
    ).toEqual([]);
  });

  /**
   * E o fixado. Deixou de ser `#8a6d2f` — que nesta casa é a cor de AVISO, e
   * usá-la para dizer «este está fixado» era dar-lhe um segundo significado no
   * mesmo ecrã — e passou a ser o acento, que é como a casa inteira marca uma
   * escolha.
   *
   * ── PORQUE É QUE ISTO DEIXOU DE MEDIR UMA JANELA À VOLTA DO CHIP ────────
   *
   * Media-se numa janela de 400 caracteres à volta do `bo-vidro-claro` porque
   * o fixado ERA um dos chips: uma pastilha cheia de acento por cima da
   * fotografia, ao lado do chip de arquivar. Deixou de ser — o ponto 9 do
   * `docs/APPLE-TEMAS.md` manda UM botão só sobre a miniatura, e a Parte 9
   * proíbe à letra «mais de um botão flutuante sobre uma miniatura». A estrela
   * desceu para o rasto de números do cartão, que é onde o desenho do
   * `ThemeCard` (Parte 3) a põe.
   *
   * O que este caso guarda é a decisão de COR, e essa não mudou: o fixado
   * marca-se com o acento e nunca com a cor de aviso. Passa a medir-se no
   * ficheiro inteiro, que é o âmbito da decisão.
   */
  it("o tema fixado usa o acento e não a cor de aviso", () => {
    const bloco = TEMAS();
    expect(bloco).toContain("var(--bo-accent)");
    expect(bloco, "a cor de aviso voltou a marcar o tema fixado").not.toContain("#8a6d2f");
  });
});
