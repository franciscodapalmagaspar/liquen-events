import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NO SITE PÚBLICO HÁ UMA CAMADA DE VIDRO POR ECRÃ — E É A BARRA DE COOKIES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A regra 1 da Parte 5 do `docs/LIQUID-GLASS.md`: vidro sobre vidro duplica o
 * custo e transforma o fundo em papa cinzenta. O `<Glass>` não a consegue
 * fazer cumprir sozinho (ver o comentário dele), e por isso conta-se aqui.
 *
 * Desde 17/11 a barra de cookies é Liquid Glass. Enquanto ela está no ecrã:
 *
 *  · é o ÚNICO `<Glass>` do site público;
 *  · todo o outro `backdrop-blur`/`backdrop-filter` desenhado num componente
 *    público leva `vidro-cede`, e o `globals.css` tira-lho enquanto a barra
 *    está lá;
 *  · o «Pedir orçamento» flutuante sai do ecrã (já saía — auditoria A1);
 *  · e o motor não viaja no JavaScript do arranque: chega por `import()`.
 */

const raiz = process.cwd();
const ler = (f: string) => readFileSync(join(raiz, f), "utf8");
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

function ficheiros(dir: string): string[] {
  const fora: string[] = [];
  for (const n of readdirSync(join(raiz, dir))) {
    const p = join(dir, n);
    if (statSync(join(raiz, p)).isDirectory()) fora.push(...ficheiros(p));
    else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) fora.push(p);
  }
  return fora;
}

/** O código que o site público desenha: os componentes e as rotas fora do back office. */
const publicos = [...ficheiros("src/components"), ...ficheiros("src/app/[lang]")].filter(
  (f) => !f.includes("(admin)") && !relative("src", f).startsWith("app/[lang]/(privado)"),
);

const css = semComentarios(ler("src/app/globals.css"));

describe("o vidro do site público", () => {
  it("só a barra de cookies usa o <Glass>", () => {
    const comVidro = publicos.filter((f) => !f.endsWith("/Glass.tsx") && /<Glass\b/.test(ler(f)));
    expect(comVidro).toEqual(["src/components/ConsentBanner.tsx"]);
  });

  it("todo o outro desfoque de fundo cede enquanto a barra está no ecrã", () => {
    const semCeder: string[] = [];
    for (const f of publicos) {
      if (f.endsWith("Glass.tsx")) continue;
      // As classes vivem em `className="…"` ou em `` className={`…`} ``: cada
      // string que pede desfoque de fundo tem de pedir também para ceder.
      for (const m of ler(f).matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`)/g)) {
        // (Os comentários `// …` dentro de uma expressão não são classes.)
        const classes = (m[1] ?? m[2]).replace(/\/\/.*$/gm, "");
        if (
          /\bbackdrop-(blur|saturate|brightness|filter)/.test(classes) &&
          !/\bvidro-cede\b/.test(classes)
        )
          semCeder.push(`${f}: ${classes.slice(0, 80)}`);
      }
    }
    expect(semCeder).toEqual([]);
  });

  it("o globals.css tira-lhes o desfoque enquanto a barra existe e ninguém escolheu", () => {
    const regra = css.match(
      /html:not\(\.consentimento-decidido\) body:has\(\.barra-consentimento\) \.vidro-cede\s*\{([^}]*)\}/,
    );
    expect(regra?.[1]).toMatch(/(^|[^-])backdrop-filter:\s*none/);
    expect(regra?.[1]).toMatch(/-webkit-backdrop-filter:\s*none/);
  });

  it("e o «Pedir orçamento» flutuante sai do ecrã enquanto a barra lá está", () => {
    expect(css).toMatch(
      /html:not\(\.consentimento-decidido\) body:has\(\.barra-consentimento\) \.cta-flutuante\s*\{\s*display:\s*none/,
    );
  });

  it("a barra monta o vidro só com rato, e depois de o browser ficar livre", () => {
    const barra = ler("src/components/ConsentBanner.tsx");
    const glass = barra.match(/<Glass\b([\s\S]*?)>/)?.[1] ?? "";
    expect(glass).toContain('quando="(pointer: fine)"');
    expect(glass).toMatch(/\badiar\b/);
    expect(glass).toContain('superficie="painel"');
  });

  it("o motor não entra no JavaScript do arranque: nem a barra nem o <Glass> o importam de forma estática", () => {
    const importEstatico = /^import\s+(?!type\b)[^;]*["']@\/lib\/liquid-glass["']/m;
    expect(ler("src/components/ConsentBanner.tsx")).not.toMatch(importEstatico);
    expect(ler("src/components/Glass.tsx")).not.toMatch(importEstatico);
    expect(ler("src/components/Glass.tsx")).toContain('import("@/lib/liquid-glass")');
  });

  it("o rebordo e as guardas de acessibilidade do vidro estão na folha que o site carrega", () => {
    expect(css).toMatch(/\.lg::after\s*\{/);
    expect(semComentarios(ler("src/app/admin.css"))).not.toMatch(/\.lg::after\s*\{/);
    const guarda = css.match(
      /@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\), \(forced-colors: active\)\s*\{\s*\.lg\s*\{([^}]*)\}/,
    );
    expect(guarda?.[1]).toMatch(/(^|[^-])backdrop-filter:\s*none !important/);
  });
});
