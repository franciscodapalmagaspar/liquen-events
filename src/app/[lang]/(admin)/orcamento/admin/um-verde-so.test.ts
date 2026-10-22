import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O VERDE DESTA CASA É UM SÓ — E ESTE É O GUARDA DISSO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. Havia dois: `#4c6350` no token `--bo-accent`, que chegava a 12
 * sítios, e `#4d6350` escrito à mão em 458. Medidos, 6,55:1 e 6,53:1 sobre
 * branco — invisíveis ao olho, indistinguíveis a ler o código, e exactamente a
 * família de bifurcação que já custou um defeito nesta sessão.
 *
 * Agora há um valor, em três formas, e cada forma existe por uma razão:
 *
 *   · `--color-sage-600`, no `@theme` do `tema.css`, é o que gera as CLASSES
 *     (`bg-sage-600`, `ring-sage-600/55`). Tem de estar no `@theme` porque é
 *     de lá que o Tailwind gera utilitários — e tem de ser um token nomeado e
 *     não um valor entre parênteses, senão o sufixo de opacidade não pega.
 *
 *   · `--bo-accent`, no `:root` do `globals.css`, é o que o CSS escrito à mão
 *     usa. É um HEXADECIMAL e não um `var()` a apontar para o de cima, e isso
 *     é deliberado: três testes de contraste desta casa lêem este token e
 *     fazem a conta da norma com ele, e não têm como seguir uma indirecção.
 *
 *   · O mesmo hexadecimal aparece em ~26 sítios de JavaScript — estilos
 *     inline, atributos SVG, os mapas de estado. Ali `var()` partia o
 *     `corDeTexto` e as duas varreduras que ele alimenta, que trabalham sobre
 *     hexadecimais.
 *
 * Três formas é o preço de o CSS e o JavaScript não falarem a mesma língua. UM
 * VALOR é o que não se negoceia, e é o que este ficheiro mede.
 */

const RAIZ = process.cwd();
// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const GLOBAIS =
  readFileSync(join(RAIZ, "src/app/globals.css"), "utf8") +
  readFileSync(join(RAIZ, "src/app/admin.css"), "utf8");
const TEMA = readFileSync(join(RAIZ, "src/app/tema.css"), "utf8");

/** Os ficheiros de PRODUTO — sem testes, que podem nomear o verde antigo. */
function ficheirosDeProduto(): string[] {
  return execSync("find src/app src/components -name '*.tsx' -o -name '*.css' || true", {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.includes(".test."))
    .map((f) => join(RAIZ, f));
}

/** O valor de um token, sem os comentários pelo meio. */
function token(css: string, nome: string): string | null {
  const m = css.replace(/\/\*[\s\S]*?\*\//g, "").match(new RegExp(`${nome}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim().toLowerCase() : null;
}

describe("o verde da casa", () => {
  const acento = token(GLOBAIS, "--bo-accent");
  const sage = token(TEMA, "--color-sage-600");

  it("existe nos dois sítios", () => {
    expect(acento, "`--bo-accent` desapareceu do `globals.css`").toBeTruthy();
    expect(sage, "`--color-sage-600` desapareceu do `@theme` do `tema.css`").toBeTruthy();
  });

  it("é o MESMO valor nos dois", () => {
    expect(
      acento,
      `o verde bifurcou outra vez: --bo-accent = ${acento}, --color-sage-600 = ${sage}`,
    ).toBe(sage);
  });

  /**
   * O `--bo-accent` é lido por testes de contraste que fazem a conta da norma.
   * Um `var()` aqui não parte a página — parte os testes, em silêncio, porque
   * eles recebem a cadeia `var(--color-sage-600)` e tentam lê-la como cor.
   */
  it("o `--bo-accent` é um hexadecimal, não uma indirecção", () => {
    expect(
      acento,
      "`--bo-accent` deixou de ser um hexadecimal — os testes de contraste lêem-no e não seguem `var()`",
    ).toMatch(/^#[0-9a-f]{6}$/);
  });

  /**
   * O verde antigo não pode voltar por uma cópia distraída. Só se olha para
   * ficheiros de PRODUTO: os testes podem nomeá-lo para contar esta história,
   * e este ficheiro é o primeiro a fazê-lo.
   */
  it("o verde antigo não voltou a nenhum ecrã", () => {
    const achados: string[] = [];
    for (const ficheiro of ficheirosDeProduto()) {
      // Os COMENTÁRIOS podem nomear o verde antigo, e devem: é assim que a
      // história de porque é que ele saiu fica ao lado do código que a explica
      // — incluindo o cabeçalho deste ficheiro. O que não pode voltar é o
      // valor a pintar alguma coisa.
      const semComentarios = readFileSync(ficheiro, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      semComentarios.split("\n").forEach((linha, i) => {
        if (/#4[cd]63[59]0/i.test(linha)) {
          achados.push(`${ficheiro.replace(RAIZ + "/", "")}:${i + 1} — ${linha.trim()}`);
        }
      });
    }
    expect(achados, `o verde antigo voltou:\n${achados.join("\n")}`).toEqual([]);
  });
});
