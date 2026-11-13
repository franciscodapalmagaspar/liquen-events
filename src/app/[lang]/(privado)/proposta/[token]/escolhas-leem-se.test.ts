import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS ESCOLHAS LEEM-SE NA PROPOSTA ONLINE — NO CLARO E NO ESCURO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Auditoria de 13/11: no telemóvel em modo escuro, o título, os rótulos e as
 * descrições das alternativas eram #2a2620 (o `--color-foreground` do site)
 * sobre o #191714 desta página — 1,2:1. É a única coisa que o casal FAZ na
 * página. E no claro, a descrição (`/60`, 3,9:1) e o «Escolhida» em `moss`
 * (4,1:1) também ficavam por baixo da norma, sobre o papel #f4efe6.
 *
 * A conta resolve cada cor como o browser a resolve: o token do site, a não
 * ser que a secção `.pw-escolhas` o redefina para aquele tema. Com o alfa
 * achatado ANTES de medir, sobre o fundo da página e sobre o da opção
 * escolhida (o verde a 8%).
 */

const RAIZ = process.cwd();
const AQUI = "src/app/[lang]/(privado)/proposta/[token]";
const ler = (f: string) => readFileSync(join(RAIZ, f), "utf8");

const CSS = ler(`${AQUI}/proposta-web.css`);
const TEMA = ler("src/app/tema.css");
const GLOBAL = ler("src/app/globals.css");
const COMPONENTE = ler(`${AQUI}/Escolhas.tsx`);

/** As declarações `--x: valor` do primeiro bloco que abre em `inicio`. */
function bloco(css: string, inicio: RegExp): Record<string, string> {
  const m = inicio.exec(css);
  if (!m) return {};
  const corpo = css.slice(m.index + m[0].length, css.indexOf("}", m.index + m[0].length));
  return Object.fromEntries(
    [...corpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()]),
  );
}

const pwClaro = bloco(CSS, /^\.pw \{(?=[^}]*--tinta)/m);
const pwEscuro = bloco(CSS, /@media \(prefers-color-scheme: dark\) \{\s*\.pw \{/);
const escolhasClaro = bloco(CSS, /^\.pw-escolhas \{/m);
const escolhasEscuro = {
  ...escolhasClaro,
  ...bloco(CSS, /@media \(prefers-color-scheme: dark\) \{\s*\.pw-escolhas \{/),
};
const tema = bloco(TEMA, /@theme \{/);
const raiz = bloco(GLOBAL, /^:root \{/m);

type Tema = "claro" | "escuro";
const PAPEL: Record<Tema, Record<string, string>> = {
  claro: { ...pwClaro },
  escuro: { ...pwClaro, ...pwEscuro },
};
const SECCAO: Record<Tema, Record<string, string>> = {
  claro: escolhasClaro,
  escuro: escolhasEscuro,
};

/** Uma cor como o browser a vê dentro de `.pw-escolhas`, num tema. */
function resolver(valor: string, t: Tema, fundo = 0): string {
  if (fundo > 10) throw new Error(`ciclo em ${valor}`);
  const v = valor.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  const m = /^var\((--[\w-]+)\)$/.exec(v);
  if (!m) throw new Error(`não sei resolver «${v}»`);
  const nome = m[1];
  const achado = SECCAO[t][nome] ?? PAPEL[t][nome] ?? tema[nome] ?? raiz[nome];
  if (!achado) throw new Error(`${nome} não existe`);
  return resolver(achado, t, fundo + 1);
}

const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = (p: number[]) =>
  0.2126 * canal(p[0] / 255) + 0.7152 * canal(p[1] / 255) + 0.0722 * canal(p[2] / 255);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const achatar = (frente: number[], alfa: number, fundo: number[]) =>
  frente.map((c, i) => c * alfa + fundo[i] * (1 - alfa));
const racio = (a: number[], b: number[]) => {
  const [alto, baixo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (baixo + 0.05);
};

/** As cores de texto do componente: `[token, alfa]`. */
function coresDoTexto(): [string, number][] {
  const cores: [string, number][] = [];
  for (const m of COMPONENTE.matchAll(/\btext-(foreground|moss)(?:\/(\d+))?(?=[\s"`])/g))
    cores.push([`var(--color-${m[1]})`, m[2] ? Number(m[2]) / 100 : 1]);
  for (const m of COMPONENTE.matchAll(/\btext-\[color:(var\(--[\w-]+\))\]/g)) cores.push([m[1], 1]);
  return cores;
}

describe("as escolhas do casal, dentro da proposta online", () => {
  it("não escrevem cores à mão (senão o escuro não as alcança)", () => {
    expect(COMPONENTE.match(/text-\[#[0-9a-f]{3,8}\]/gi) ?? []).toEqual([]);
    expect(coresDoTexto().length).toBeGreaterThanOrEqual(5);
  });

  for (const t of ["claro", "escuro"] as const) {
    it(`todo o texto passa 4,5:1 no tema ${t}, no papel e na opção escolhida`, () => {
      const papel = rgb(resolver("var(--bg)", t));
      const verde = rgb(resolver("var(--color-moss)", t));
      const escolhida = achatar(verde, 0.08, papel);
      const fracos: string[] = [];
      for (const [token, alfa] of coresDoTexto()) {
        const cor = rgb(resolver(token, t));
        for (const [nome, fundo] of [
          ["papel", papel],
          ["escolhida", escolhida],
        ] as const) {
          const r = racio(achatar(cor, alfa, fundo), fundo);
          if (r < 4.5) fracos.push(`${token}/${alfa} sobre ${nome}: ${r.toFixed(2)}:1`);
        }
      }
      expect(fracos).toEqual([]);
    });
  }
});
