import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * O SELECTOR COM QUE O BACK OFFICE SE PINTA.
 *
 * Deixou de ser só `body.admin-mode`: a classe entra num efeito e chegava
 * tarde de mais para o primeiro pixel. Agora é
 * `body:is(.admin-mode, :has([data-admin-mode]))`, com o atributo servido pelo
 * `layout.tsx` do grupo `(admin)`. A razão por extenso está no `globals.css`.
 */
const SELECTOR_ADMIN = "body:is(.admin-mode, :has([data-admin-mode]))";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BACK OFFICE TEM UMA LETRA SÓ, E A SERIFA É DO CLIENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro já guardou o contrário, e vale a pena dizê-lo por extenso em
 * vez de o apagar.
 *
 * Guardava que a letra de DISPLAY do back office era o Playfair. Isso nasceu
 * de uma frase dela: «o back office está com a mesma estrutura, não me diz
 * nada». Estava certo para o que ela via nessa altura.
 *
 * Depois ela pôs à frente uma referência — um produto de letra única, títulos
 * grandes em sans apertada — e disse duas coisas seguidas, sem ambiguidade:
 * «não quero estes títulos com este tipo de letra» e «quero este tipo de letra
 * no back office todo». Não é uma hipótese de desenho: é uma instrução, e é
 * mais recente do que a que este ficheiro guardava.
 *
 * ── O QUE SE GUARDA AGORA ─────────────────────────────────────────────────
 *
 * 1. QUE A LETRA É UMA SÓ. `--font-display` dentro do back office aponta para
 *    a sans do trabalho. Os ~29 sítios que pedem `font-display` mudam por
 *    causa desta linha, sem se lhes tocar.
 *
 * 2. QUE NINGUÉM ESCREVE A FAMÍLIA À MÃO. Eram seis os sítios que pediam
 *    `var(--font-playfair)` num `style` — quatro na Visão Geral, um no título
 *    da vista, um no «À escolha do casal». Seis sítios escritos à mão são seis
 *    maneiras de ficar de fora da próxima decisão; passaram todos a pedir o
 *    token.
 *
 * 3. QUE A FOLHA DO CLIENTE NÃO MUDOU DE LETRA. A proposta que chega ao casal
 *    é em Playfair — está escrito no `Documento.tsx`, que vive em `(privado)`.
 *    A `PaginaEditorial` é a PRÉ-VISUALIZAÇÃO dessa folha (era a
 *    `FolhaDaProposta`, do PDF antigo). Se a prévia
 *    seguisse o back office, ela passava a conferir uma folha diferente da que
 *    sai — que é exactamente o defeito do `letra-da-previa.test.ts`, com as
 *    palavras dela por trás: «uma pré-visualização parcial dá falsa
 *    confiança».
 *
 *    A excepção não é uma lista de ficheiros: é um marcador,
 *    `data-folha-do-cliente`, e as duas metades — o marcador no componente e a
 *    regra no CSS — são guardadas aqui juntas, porque qualquer uma delas
 *    sozinha não pinta nada e não dá erro nenhum.
 *
 * 4. A FRONTEIRA DOS 16 px, agora só onde ainda há serifa. O Playfair tem
 *    altura-de-x baixa: a 14 px lê-se como um Inter de 12,5, e o chão desta
 *    casa são 12. Fora da folha do cliente isso deixou de poder acontecer,
 *    porque fora dela já não há Playfair.
 */

// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS = readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");
const RAIZ = "src/app/[lang]/(admin)/orcamento/admin/";
const FOLHA = `${RAIZ}PaginaEditorial.tsx`;

/** A regra que pinta a letra do painel, do selector até à chaveta que o fecha. */
function regraDaLetra(css: string): string {
  const i = css.indexOf("[data-admin-mode] {");
  if (i < 0) return "";
  const fim = css.indexOf("\n}", i);
  return css.slice(i, fim < 0 ? css.length : fim);
}

/**
 * O bloco do back office, do selector até à chaveta que o fecha.
 *
 * Antes isto era `indexOf(SELECTOR + ",")` com um `i >= 0 ? i : 0` a seguir —
 * e o selector com vírgula NÃO existe no ficheiro, portanto a busca começava
 * sempre em zero e a asserção passava por causa de um `var(--font-inter)`
 * qualquer do sítio público. Um teste que não conseguia reprovar.
 */
function blocoDoBackOffice(css: string): string {
  const i = css.indexOf(`${SELECTOR_ADMIN} {`);
  if (i < 0) return "";
  const fim = css.indexOf("\n}", i);
  return css.slice(i, fim < 0 ? css.length : fim);
}

/** Comentários fora, com as linhas de pé — a lição já custou seis testes. */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

/** Os `.tsx` do back office que não são testes. */
function ficheiros(): string[] {
  return execSync(`grep -rl "font-display" --include=*.tsx "${RAIZ}" || true`, { encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !f.includes(".test."));
}

describe("a letra da casa no back office", () => {
  it("a letra do painel é a que ela escolheu, e é uma só", () => {
    const regra = regraDaLetra(semComentarios(CSS));
    expect(regra, "a regra `[data-admin-mode]` da letra desapareceu").not.toBe("");
    // O texto de trabalho E os títulos, na mesma família: é isso que ela pediu
    // — «este tipo de letra no back office todo».
    expect(regra, "o texto de trabalho deixou de ser o Geist").toMatch(
      /font-family:\s*\n?\s*var\(--font-geist\)/,
    );
    expect(regra, "a letra de título deixou de acompanhar a do trabalho").toMatch(
      /--font-display:\s*\n?\s*var\(--font-geist\)/,
    );
  });

  it("a letra é carregada no grupo do back office, e não na raiz do sítio", () => {
    // Se voltar para a raiz, o sítio público passa a pré-carregar um ficheiro
    // que nunca chega a pintar nada — no telemóvel de um casal, num 4G.
    const layoutAdmin = semComentarios(readFileSync("src/app/[lang]/(admin)/layout.tsx", "utf8"));
    expect(layoutAdmin, "o Geist deixou de ser carregado no grupo `(admin)`").toMatch(
      /Geist\(\{[^}]*variable:\s*"--font-geist"/,
    );
    /**
     * A lista de famílias do `import`, e não o texto do ficheiro.
     *
     * Aqui estava `semComentarios(...)` seguido de um `not.toContain`, e não
     * conseguia reprovar: as duas primeiras linhas do `layout.tsx` da raiz
     * falam de `/pt/*` e `/en/*` DENTRO de um comentário de linha, e esses
     * `/*` abrem um comentário de bloco de mentira que a função só fecha 200
     * linhas abaixo. As declarações das letras estão lá pelo meio — eram
     * apagadas antes de a asserção as ver. Posto o defeito de propósito (o
     * Geist declarado na raiz), o teste passou na mesma.
     *
     * Ler o `import` resolve os dois lados: é imune a comentários, e uma
     * frase em prosa que mencione o Geist deixa de chumbar o teste.
     */
    const layoutRaiz = readFileSync("src/app/[lang]/layout.tsx", "utf8");
    const familias = layoutRaiz.match(/import\s*\{([^}]*)\}\s*from\s*"next\/font\/google"/);
    expect(familias, "a raiz deixou de importar letras do `next/font/google`").not.toBeNull();
    expect(
      familias?.[1] ?? "",
      "o Geist subiu para a raiz e o sítio público passou a pagá-lo",
    ).not.toMatch(/\bGeist\b/);
  });

  it("e há uma rede por baixo, se a letra não chegar", () => {
    // Uma `font-family` cuja variável não existe é inválida, e a propriedade
    // herda. O que ela herda tem de ser UMA letra para tudo — senão uma rede
    // cortada a meio deixa o painel com títulos numa família e o resto noutra.
    const bloco = blocoDoBackOffice(semComentarios(CSS));
    expect(bloco, "o bloco do back office mudou de selector").not.toBe("");
    expect(bloco, "a rede por baixo deixou de ser uma letra só").toMatch(
      /--font-display:\s*\n?\s*var\(--font-inter\)/,
    );
  });

  it("o texto de trabalho continua todo em Inter", () => {
    // A `font-family` da raiz do back office não se toca — se um dia ela virar
    // serifa, o ecrã de trabalho fica ilegível numa densidade que é para ser
    // lida de relance.
    const bloco = blocoDoBackOffice(semComentarios(CSS));
    expect(bloco, "o bloco do back office mudou de selector").not.toBe("");
    expect(bloco).toMatch(/font-family:\s*\n?\s*var\(--font-inter\)/);
  });

  it("nenhum ecrã escreve a família à mão", () => {
    // Quem escreve `var(--font-playfair)` num `style` fica de fora do token —
    // e da próxima vez que a letra do back office mudar, fica para trás sem
    // dar erro nenhum. Quem precisa mesmo da serifa marca-se como folha do
    // cliente, que é o caso de baixo.
    const soltos = execSync(`grep -rn "var(--font-playfair)" --include=*.tsx "${RAIZ}" || true`, {
      encoding: "utf8",
    })
      .split("\n")
      .filter((l) => l && !l.includes(".test."));
    expect(soltos, `a família escrita à mão em:\n  ${soltos.join("\n  ")}`).toEqual([]);
  });

  it("a folha do cliente mantém a letra do documento que sai", () => {
    // As duas metades, juntas: sem o marcador a regra não apanha nada, e sem a
    // regra o marcador não pinta nada. Nenhuma das duas falhas dá erro.
    const css = semComentarios(CSS);
    expect(css, "a regra da folha do cliente desapareceu do globals.css").toMatch(
      /\[data-folha-do-cliente\][^{]*\{[^}]*--font-display:\s*\n?\s*var\(--font-playfair\)/,
    );
    expect(
      semComentarios(readFileSync(FOLHA, "utf8")),
      "a `PaginaEditorial` deixou de se marcar como folha do cliente",
    ).toContain("data-folha-do-cliente");
  });

  it("nenhum `font-display` da folha do cliente desce abaixo dos 16 px", () => {
    // Só na folha, porque só na folha é que `font-display` ainda dá Playfair.
    const proibidos = /text-\[(?:[0-9]|1[0-5])(?:\.\d+)?px\]|text-xs\b|text-sm\b/;
    const faltas: string[] = [];
    semComentarios(readFileSync(FOLHA, "utf8"))
      .split("\n")
      .forEach((l, n) => {
        if (!l.includes("font-display")) return;
        if (proibidos.test(l)) faltas.push(`${FOLHA}:${n + 1}`);
      });
    expect(
      faltas,
      `\`font-display\` com letra abaixo de 16 px em:\n  ${faltas.join("\n  ")}`,
    ).toEqual([]);
  });

  it("e há mesmo sítios a pedir a letra de display — senão isto não guarda nada", () => {
    // O controlo positivo. Se um dia alguém tirar o `font-display` de todo o
    // lado, os casos de cima passam por não haver nada que eles possam
    // reprovar.
    expect(ficheiros().length).toBeGreaterThan(5);
  });
});
