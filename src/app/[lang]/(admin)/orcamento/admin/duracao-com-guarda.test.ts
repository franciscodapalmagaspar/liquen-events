import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA DURAÇÃO SEM GUARDA FAZ O CONTRÁRIO DO QUE PARECE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Escrever `motion-safe:transition-transform duration-300` parece prudente: a
 * transição está guardada, só a duração é que não. Não é prudente — é pior do
 * que não guardar nada, e a razão está em COMO o Tailwind compila as duas.
 *
 * O `motion-safe:transition-transform` sai DENTRO de
 * `@media (prefers-reduced-motion: no-preference)`. O `duration-300` sai no
 * topo, sem media query nenhuma. Portanto, com a preferência ligada:
 *
 *   · o `transition-property` não é declarado por ninguém e cai no valor
 *     inicial do CSS, que é `all`;
 *   · o `transition-duration` continua lá, a 300 ms;
 *   · e a curva cai no `ease` por omissão, que não é a da casa.
 *
 * Resultado: quem pediu MENOS movimento recebe `all 300ms ease` — tudo a
 * animar, inclusive o que nunca se quis animar, e com a curva errada.
 *
 * Medido num Chromium, não deduzido:
 *
 *   no-preference → property=transform, translate, scale, rotate  0.3s  cubic-bezier(0.4, 0, 0.2, 1)
 *   reduce        → property=all                                  0.3s  ease
 *
 * Foram quatro sítios no `AdminClient.tsx` — a gaveta do telemóvel, o fio do
 * cabeçalho, e as duas transições de disposição do cabeçalho (essas saíram de
 * vez, por outra razão: animar `padding` e `font-size` remede a página a cada
 * fotograma, e faziam-no ENQUANTO se rola).
 *
 * Esta varredura existe porque o erro volta sozinho: escreve-se
 * `motion-safe:` na transição, esquece-se na duração, e nada parece partido.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)");

function ficheiros(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) ficheiros(caminho, achados);
    else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

/**
 * Tira comentários de bloco e de linha: o que lá se cita é história, não código.
 *
 * As quebras de linha ficam. Apagar o comentário inteiro encurtava o ficheiro e
 * o número de linha do relatório passava a apontar para outro sítio — foi o que
 * aconteceu à primeira versão desta varredura, e mandou-me procurar um defeito
 * a duzentas linhas de onde ele estava.
 */
function semComentarios(fonte: string): string {
  const guardaQuebras = (t: string) => t.replace(/[^\n]/g, " ");
  return fonte.replace(/\/\*[\s\S]*?\*\//g, guardaQuebras).replace(/^\s*\/\/.*$/gm, guardaQuebras);
}

describe("uma duração animada anda sempre com a sua guarda", () => {
  it("não há `duration-*` sem `motion-safe:` em nenhum ficheiro do back office", () => {
    const faltas: string[] = [];

    for (const caminho of ficheiros(RAIZ)) {
      const linhas = semComentarios(readFileSync(caminho, "utf8")).split("\n");
      linhas.forEach((linha, i) => {
        // `duration-150`, `duration-[250ms]` — mas não `motion-safe:duration-…`,
        // nem `group-hover:duration-…` e afins, que já herdam a guarda de quem
        // os embrulha só quando escrita; por isso a regra é a mais simples que
        // funciona: se aparece `duration-` sem `motion-safe:` colado antes, cai.
        // A classe inteira, com a cadeia de modificadores à frente — e não
        // só o `duration-…`. A primeira versão olhava para o que estava COLADO
        // ao `duration-`, e por isso acusou `motion-safe:lg:duration-200` e
        // `motion-safe:active:duration-[20ms]`, que estão as duas certas: a
        // guarda lá está, só que com outro modificador pelo meio.
        const classes = linha.match(/[\w:[\]./-]*\bduration-\[?\d+m?s?\]?/g) ?? [];
        const semGuarda = classes.filter((c) => !c.includes("motion-safe:"));
        if (semGuarda.length) {
          faltas.push(
            `${caminho.replace(process.cwd() + "/", "")}:${i + 1}  ${semGuarda.join(" ")}`,
          );
        }
      });
    }

    expect(
      faltas,
      "uma duração sem `motion-safe:` compila FORA da media query: com movimento reduzido " +
        "o `transition-property` cai em `all` e a duração fica — quem pediu menos movimento " +
        "recebe mais, com a curva errada",
    ).toEqual([]);
  });

  it("o cabeçalho não anima disposição enquanto se rola", () => {
    const fonte = semComentarios(
      readFileSync(join(RAIZ, "orcamento/admin/AdminClient.tsx"), "utf8"),
    );

    // `padding` e `font-size` remedem a página a cada fotograma, e estas duas
    // corriam ligadas ao scroll — o pior sítio possível, no telemóvel dela.
    expect(fonte, "o cabeçalho voltou a animar `padding` ao rolar").not.toMatch(
      /transition-\[padding/,
    );
    expect(fonte, "o cabeçalho voltou a animar `font-size` ao rolar").not.toMatch(
      /transition-\[font-size/,
    );
  });
});
