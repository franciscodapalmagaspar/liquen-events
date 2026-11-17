import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDictionary } from "@/lib/i18n";

/**
 * O PRIMEIRO ECRÃ DIZ O QUÊ E O ONDE — E NÃO INVENTA (17/11)
 *
 * A frase por baixo do título da entrada (`home.heroLead`) foi aprovada pelo
 * dono com uma condição: nada inventado, só o que o site já diz. Este teste
 * prende-a a essa origem — cada palavra com peso tem de estar já nos títulos e
 * nas descrições do próprio site (`meta`), na mesma língua. Se alguém a
 * reescrever com uma promessa nova, cai aqui antes de chegar ao ecrã.
 */

const PALAVRAS_DE_LIGACAO = new Set([
  "e",
  "de",
  "em",
  "o",
  "a",
  "os",
  "as",
  "do",
  "da",
  "and",
  "for",
  "of",
  "the",
]);

function palavras(texto: string): string[] {
  return texto
    .toLocaleLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((p) => p && !PALAVRAS_DE_LIGACAO.has(p));
}

describe("a frase do primeiro ecrã", () => {
  for (const lingua of ["pt", "en"] as const) {
    const t = getDictionary(lingua);

    it(`${lingua}: existe, é curta e só usa palavras que o site já diz`, () => {
      const frase = t.home.heroLead;
      expect(frase.length).toBeGreaterThan(0);
      expect(frase.length).toBeLessThanOrEqual(80);
      const fonte = new Set(palavras(Object.values(t.meta).join(" ")));
      const novas = palavras(frase).filter((p) => !fonte.has(p));
      expect(novas, `palavras que o site ainda não dizia: ${novas.join(", ")}`).toEqual([]);
    });
  }

  it("está na entrada, entre o título e os botões", () => {
    const pagina = readFileSync(join(process.cwd(), "src/app/[lang]/(site)/page.tsx"), "utf8");
    const h1 = pagina.indexOf("</h1>");
    const frase = pagina.indexOf("{t.home.heroLead}");
    const botoes = pagina.indexOf('trackProps={{ source: "home-hero" }}');
    expect(h1).toBeGreaterThan(0);
    expect(frase).toBeGreaterThan(h1);
    expect(botoes).toBeGreaterThan(frase);
  });
});
