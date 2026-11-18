import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Auditoria externa, C5: o texto do aviso de cookies estava em `text-white/80`
 * — 4,48:1 sobre a página branca, abaixo dos 4,5 do AA. Passa a branco
 * e fica em 12,5 px para a barra não crescer além da reserva medida.
 *
 * 17/11 — a barra passou a Liquid Glass («os cookies eu quero colocar
 * transparente iphone»), e a tinta do vidro é o que segura o contraste: a
 * refracção e o desfoque não clareiam uma página branca lisa, que é o pior
 * fundo para letra branca. A tinta antiga (`sage-700` a 75 %) MEDIA 4,39:1 na
 * captura — chumbava. Este ficheiro refaz a conta a partir dos tokens, para
 * que nenhuma «mais transparente» futura passe sem a fazer.
 */
const raiz = process.cwd();
const fonte = readFileSync(join(raiz, "src/components/ConsentBanner.tsx"), "utf8");
const tema = readFileSync(join(raiz, "src/app/tema.css"), "utf8");
const css = readFileSync(join(raiz, "src/app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

type Rgb = [number, number, number];

function token(nome: string): Rgb {
  const m = tema.match(new RegExp(`--color-${nome}:\\s*#([0-9a-f]{6})`, "i"));
  if (!m) throw new Error(`o token --color-${nome} não está no tema.css`);
  const h = m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

/** Luminância relativa da WCAG 2. */
function luminancia([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contraste(a: Rgb, b: Rgb): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** A tinta translúcida composta por cima de um fundo, como o browser a pinta. */
function sobre(tinta: Rgb, alfa: number, fundo: Rgb): Rgb {
  return tinta.map((c, i) => Math.round(alfa * c + (1 - alfa) * fundo[i])) as Rgb;
}

const BRANCO: Rgb = [255, 255, 255];
const PRETO: Rgb = [0, 0, 0];

/** A tinta da barra, lida da própria classe (`bg-<token>/<alfa>`). */
function tintaDaBarra(): { nome: string; rgb: Rgb; alfa: number } {
  const classe = fonte.match(/barra-consentimento [^"]*?\bbg-([a-z]+-\d{3})\/(\d{2})\b/);
  if (!classe) throw new Error("a barra deixou de ter uma tinta `bg-<token>/<alfa>`");
  return { nome: classe[1], rgb: token(classe[1]), alfa: Number(classe[2]) / 100 };
}

describe("aviso de cookies — contraste do texto (C5)", () => {
  it("o parágrafo é branco inteiro, no mesmo corpo", () => {
    expect(fonte).toContain('<p className="text-[12.5px] leading-relaxed text-white">');
    expect(fonte).not.toContain("leading-relaxed text-white/80");
  });

  it("a letra branca passa 4,5:1 sobre a tinta do vidro em cima de uma página BRANCA", () => {
    const t = tintaDaBarra();
    const fundo = sobre(t.rgb, t.alfa, BRANCO);
    // 4,6 e não 4,5: a captura real mediu 0,05 abaixo da conta com a tinta antiga.
    expect(contraste(BRANCO, fundo)).toBeGreaterThanOrEqual(4.6);
  });

  it("e por cima de uma página preta, que é o outro extremo", () => {
    const t = tintaDaBarra();
    expect(contraste(BRANCO, sobre(t.rgb, t.alfa, PRETO))).toBeGreaterThanOrEqual(4.5);
  });

  it("a tinta antiga (sage-700 a 75 %) chumbava — e não volta", () => {
    expect(contraste(BRANCO, sobre(token("sage-700"), 0.75, BRANCO))).toBeLessThan(4.5);
    expect(fonte).not.toMatch(/barra-consentimento [^"]*bg-sage-700\/75/);
  });

  it("os botões e a ligação são letra branca na mesma tinta, sem véu mais claro por baixo", () => {
    // Um `bg-white/…` por baixo de letra branca baixava o contraste sem se ver.
    const botoes = [...fonte.matchAll(/<button[\s\S]*?className="([^"]+)"/g)].map((m) => m[1]);
    expect(botoes).toHaveLength(2);
    for (const c of botoes) {
      expect(c).toMatch(/(^|\s)text-white(\s|$)/);
      expect(c).not.toMatch(/(^|\s)bg-white\/\d+/);
    }
  });

  it("sem transparência (e com mais contraste) a barra fica opaca, no mesmo verde", () => {
    const t = tintaDaBarra();
    const bloco = css.match(
      /@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\)\s*\{\s*\.barra-consentimento\s*\{([^}]*)\}/,
    );
    expect(bloco?.[1]).toContain(`background-color: var(--color-${t.nome})`);
    expect(contraste(BRANCO, t.rgb)).toBeGreaterThanOrEqual(7);
  });

  it("nas cores forçadas fica com as do sistema", () => {
    const forcadas = [...css.matchAll(/@media \(forced-colors: active\)\s*\{([\s\S]*?)\n\}/g)]
      .map((m) => m[1])
      .join("\n");
    expect(forcadas).toMatch(/\.barra-consentimento\s*\{[^}]*background-color:\s*Canvas/);
  });
});
