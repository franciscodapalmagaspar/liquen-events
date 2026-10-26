import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NO IPHONE, O DESLIZE NÃO ENCRAVA, NÃO SALTA E NÃO PUXA NO TOPO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (26/10): «o site no telemóvel ao fazer scroll está a travar e tipo a
 * voltar para baixo». Perguntada: iPhone, no Safari e pelo Instagram/WhatsApp
 * (o mesmo motor), em todas as páginas — «encrava e salta para baixo», «pára no
 * meio do gesto», «no topo, puxa e volta».
 *
 * Num Chromium não se reproduz (medido em seis páginas a 390 px com o
 * processador ÷4: zero recuos, CLS 0). As causas são as diferenças do WebKit do
 * iPhone, e cada uma tem aqui a sua regra presa:
 *
 *   1. o elástico das pontas lê-se no `html`, e a regra só estava no `body`;
 *   2. o Safari não tem âncora de scroll — um painel acima do dedo que se mede
 *      diferente da estimativa empurra a página inteira;
 *   3. as animações presas ao scroll correm a cada fotograma do deslize;
 *   4. o aviso de cookies (a quem chega pela primeira vez, ou seja de quem vem
 *      do Instagram) desfocava, à largura do ecrã, tudo o que lhe passava por
 *      trás.
 *
 * Os comentários do `globals.css` dizem o porquê de cada uma por extenso.
 */

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** O corpo de um bloco `{…}` que começa em `inicio` (o índice do `{`). */
function corpo(inicio: number): string {
  let fundo = 0;
  for (let i = inicio; i < css.length; i++) {
    if (css[i] === "{") fundo++;
    else if (css[i] === "}" && --fundo === 0) return css.slice(inicio + 1, i);
  }
  throw new Error("bloco por fechar");
}

/** Todos os blocos cuja regra-mãe casa com `cabeca`. */
function blocos(cabeca: RegExp): string[] {
  const fora: string[] = [];
  const re = new RegExp(cabeca.source + "\\s*\\{", "g");
  for (let m = re.exec(css); m; m = re.exec(css)) fora.push(corpo(m.index + m[0].length - 1));
  return fora;
}

describe("o scroll no iPhone", () => {
  it("1. o elástico desliga-se no html, e não só no body", () => {
    const doHtml = blocos(/(^|\n)html/).some((b) => /overscroll-behavior-y:\s*none/.test(b));
    expect(doHtml).toBe(true);
  });

  it("2. no iOS os painéis desenham-se todos: nada muda de altura acima do dedo", () => {
    const ios = blocos(/@supports \(-webkit-touch-callout: none\)/).join("\n");
    expect(ios).toMatch(/\.cv-panel\s*\{[^}]*content-visibility:\s*visible/);
  });

  it("3. a deriva da capa e a barra de progresso só existem com rato", () => {
    const comRato = blocos(/@media[^{]*\(pointer: fine\)/).join("\n");
    expect(comRato).toMatch(/\.parallax-drift\s*\{[^}]*animation-timeline:\s*scroll/);
    expect(comRato).toMatch(/\.scroll-progress-bar\[data-css-driven="true"\]/);

    // E fora desses blocos nenhuma das duas volta a ganhar uma linha de tempo.
    let fora = css;
    for (const b of blocos(/@media[^{]*\(pointer: fine\)/)) fora = fora.replace(b, "");
    expect(fora).not.toMatch(/\.parallax-drift\s*\{[^}]*animation-timeline/);
    expect(fora).not.toMatch(
      /\.scroll-progress-bar\[data-css-driven="true"\]\s*\{[^}]*animation-timeline/,
    );
  });

  it("3b. no toque a barra de progresso nem aparece", () => {
    const toque = blocos(/@media \(pointer: coarse\)/).join("\n");
    expect(toque).toMatch(/\.scroll-progress\s*\{[^}]*display:\s*none/);
  });

  it("4. no toque o aviso de cookies não desfoca o que passa por trás", () => {
    const toque = blocos(/@media \(pointer: coarse\)/).join("\n");
    const aviso = toque.match(/\.barra-consentimento\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(aviso).toMatch(/(^|[^-])backdrop-filter:\s*none/);
    expect(aviso).toMatch(/-webkit-backdrop-filter:\s*none/);
  });
});
