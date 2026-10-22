import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * COMO É QUE UM TÍTULO SE PÕE NO BACK OFFICE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A letra mudou num bloco à parte. Isto é a outra metade, e foi ela que a
 * apontou, com estas palavras: «o traço estilístico mais marcante é o tracking
 * negativo agressivo nos títulos combinado com peso regular em vez de bold».
 *
 * ── PORQUE É QUE SÃO TRÊS APERTOS E NÃO UM ────────────────────────────────
 *
 * O `em` já acompanha o tamanho. O que ele não faz é acompanhá-lo DEPRESSA o
 * suficiente: um título de 40 px aguenta 4,5% de aperto e fica melhor com ele;
 * o mesmo valor num rótulo de 12 px cola as letras e quem paga é a leitura, num
 * ecrã que é para ser lido de relance e ao sol.
 *
 * Daí três degraus — trabalho, título, display — com a ordem guardada aqui.
 * Um número escrito à mão num ecrã fica de fora da próxima decisão; é a mesma
 * razão pela qual os cinzentos passaram a ter o número no nome.
 *
 * ── E O PESO ──────────────────────────────────────────────────────────────
 *
 * Os títulos deixam de ser negrito. Os que restam em `font-bold` são todos
 * miudezas — as iniciais de um cliente num círculo de 36 px, uma etiqueta VIP
 * de 8 px, o «N» do botão de negrito do editor de email. Nessas o negrito é o
 * desenho, e não ênfase: é o que faz uma inicial ler-se dentro de um círculo.
 *
 * O que este ficheiro impede é o negrito voltar a um TÍTULO. A regra guardada
 * é «só abaixo dos 16 px», porque é isso que separa uma etiqueta de um
 * cabeçalho, e é verificável linha a linha.
 *
 * ── ONDE É QUE ISTO NÃO SEGUE A REFERÊNCIA À RISCA, E PORQUÊ ──────────────
 *
 * Na referência os títulos são todos peso 400, e lá funciona: os mais pequenos
 * têm 27 px. Aqui um cabeçalho de secção anda nos 16 e o texto de trabalho nos
 * 15 — a 400 os dois pesariam o mesmo, e a hierarquia ficava a depender só de
 * um pixel de diferença de tamanho.
 *
 * Por isso a saudação da Visão Geral, que vai aos 40 px, é 400 como na
 * referência, e os cabeçalhos pequenos ficam a 500. É a mesma lógica dos três
 * apertos: o degrau escolhe-se pelo tamanho a que a coisa é vista.
 */

// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS = readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");
const RAIZ = "src/app/[lang]/(admin)/";

/**
 * O «N» do botão de negrito do editor de email. É um ícone desenhado com uma
 * letra, como o «I» inclinado ao lado dele — que já tem a mesma dispensa no
 * `letra-da-previa.test.ts`. Um botão de negrito que não esteja em negrito não
 * diz o que faz.
 */
const PERDOADOS = ["RichEmailEditor.tsx"];

/** As medidas que dizem «isto é miudeza, não é título». */
const PEQUENO = /text-\[(?:[0-9]|1[0-5])(?:\.\d+)?px\]|\btext-xs\b|\btext-sm\b/;

function numero(nome: string): number {
  const m = CSS.match(new RegExp(`${nome}:\\s*(-?[\\d.]+)em`));
  return m ? Number(m[1]) : NaN;
}

describe("o aperto e o peso de um título do back office", () => {
  it("há três degraus de aperto, e o de display é o mais apertado", () => {
    const trabalho = numero("--bo-tracking-tight");
    const titulo = numero("--bo-tracking-titulo");
    const display = numero("--bo-tracking-display");
    for (const [nome, v] of [
      ["trabalho", trabalho],
      ["título", titulo],
      ["display", display],
    ] as const) {
      expect(v, `o degrau «${nome}» desapareceu do globals.css`).not.toBeNaN();
    }
    // Mais negativo é mais apertado.
    expect(display, "o título grande deixou de ser o mais apertado").toBeLessThan(titulo);
    expect(titulo, "um título deixou de ser mais apertado do que o texto corrido").toBeLessThan(
      trabalho,
    );
  });

  it("a regra dos títulos pede o token e não um número", () => {
    expect(CSS, "o aperto dos títulos voltou a ser um número escrito à mão").toMatch(
      /:is\(h1, h2, h3, h4\),[\s\S]{0,200}?letter-spacing:\s*var\(--bo-tracking-titulo\)/,
    );
  });

  it("os títulos grandes pedem o degrau de display", () => {
    // São os dois que têm o tamanho escrito à mão porque crescem com o ecrã: a
    // saudação da Visão Geral e o nome da vista. Se um deles deixar de pedir o
    // degrau, fica com o aperto de um cabeçalho de secção a 40 px.
    const grandes = [
      `${RAIZ}orcamento/admin/Overview.tsx`,
      `${RAIZ}orcamento/admin/AdminClient.tsx`,
    ];
    for (const f of grandes) {
      expect(
        readFileSync(f, "utf8"),
        `${f} deixou de pedir o aperto de display no título grande`,
      ).toContain("var(--bo-tracking-display)");
    }
  });

  it("nenhum título do back office é negrito", () => {
    const linhas = execSync(`grep -rn "font-bold" --include=*.tsx "${RAIZ}" || true`, {
      encoding: "utf8",
    })
      .split("\n")
      .filter((l) => l && !l.includes(".test."));

    const titulos = linhas.filter((l) => {
      const ficheiro = l.split(":")[0].split("/").pop() ?? "";
      if (PERDOADOS.includes(ficheiro)) return false;
      return !PEQUENO.test(l);
    });

    expect(
      titulos,
      `negrito em texto de 16 px ou mais — é um título a gritar:\n  ${titulos.join("\n  ")}`,
    ).toEqual([]);
  });

  it("e há mesmo negrito no back office — senão o caso de cima não guarda nada", () => {
    // O controlo positivo: se o `font-bold` desaparecer todo, o caso de cima
    // passa por não ter nada que possa reprovar.
    const total = execSync(`grep -rn "font-bold" --include=*.tsx "${RAIZ}" || true`, {
      encoding: "utf8",
    })
      .split("\n")
      .filter((l) => l && !l.includes(".test.")).length;
    expect(total).toBeGreaterThan(2);
  });
});
