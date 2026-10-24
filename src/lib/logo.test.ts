import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  caixaNaParede,
  ESCALA_DA_FITA,
  logoDimsFor,
  logoHeight,
  logoCssWidth,
  logoSizes,
} from "./logo";
import logoDims from "./logo-dims.json";
import { clientLogos } from "@/data";
import { LOGO_WIDTHS, snapLogoWidth } from "./site-image-loader";

const WIDE = "/logos/clientes/aernnova.avif"; // [304, 36] — thin wordmark
const TALL = "/logos/clientes/convento-espinheiro.avif"; // [316, 378] — upright mark
const UNKNOWN = "/logos/clientes/__missing__.avif";

describe("logoDimsFor", () => {
  it("returns the real dimensions for a known logo", () => {
    expect(logoDimsFor(WIDE)).toEqual([304, 36]);
  });

  it("returns a sensible default for an unknown logo", () => {
    expect(logoDimsFor(UNKNOWN)).toEqual([400, 120]);
  });
});

describe("logoHeight", () => {
  it("clamps a very wide logo down to the minimum height", () => {
    expect(logoHeight(WIDE)).toBe(26);
  });

  it("gives an upright logo a taller height, never above the max", () => {
    const h = logoHeight(TALL);
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThan(40);
    expect(h).toBeLessThanOrEqual(46);
  });

  it("uses sqrt(targetArea) when dimensions are unknown", () => {
    expect(logoHeight(UNKNOWN)).toBe(40); // round(sqrt(1600))
  });

  it("honours custom min/max bounds", () => {
    expect(logoHeight(WIDE, 1600, 30, 50)).toBe(30);
  });

  // Ela (17/10): «a José de Mello tem o logo muito mais pequeno… tudo ao mesmo
  // tamanho». Os dois têm quase a mesma forma; o que muda é a tinta.
  it("um logótipo de traço fino fica maior do que um de letra grossa com a mesma forma", () => {
    const fino = "/logos/clientes/jose-de-mello.png"; // tinta 0,11
    const grosso = "/logos/clientes/palacio-cadaval.avif"; // 0,20, forma parecida
    const [wf, hf] = logoDimsFor(fino);
    const [wg, hg] = logoDimsFor(grosso);
    // Mesma área de caixa daria quase a mesma altura; com a tinta, o fino sobe.
    const semTinta = (w: number, h: number) => Math.sqrt(3000 / (w / h));
    expect(logoHeight(fino, 3000, 0, 999) / semTinta(wf, hf)).toBeGreaterThan(
      logoHeight(grosso, 3000, 0, 999) / semTinta(wg, hg),
    );
  });

  it("a letra grossa (Deloitte) desce em relação à caixa", () => {
    const deloitte = "/logos/clientes/deloitte.png";
    const [w, h] = logoDimsFor(deloitte);
    expect(logoHeight(deloitte, 3000, 0, 999)).toBeLessThan(Math.sqrt(3000 / (w / h)));
  });
});

/**
 * O `sizes` é o que decide QUANTOS BYTES de logótipo a página descarrega. Estes
 * testes protegem as duas propriedades de que isso depende:
 *
 *   1. NUNCA declarar MENOS do que se desenha (declarar a menos = logótipo
 *      desfocado, e tipografia fina desfocada vê-se logo);
 *   2. os dois componentes declararem O MESMO para o mesmo logótipo (declarar
 *      diferente = a mesma marca descarregada duas vezes em /clientes).
 */
describe("logoCssWidth / logoSizes", () => {
  const RAIZ = path.join(__dirname, "..", "..");
  const FITA = readFileSync(path.join(RAIZ, "src/components/ClientMarquee.tsx"), "utf8");
  const PAREDE = readFileSync(path.join(RAIZ, "src/components/ClientLogoGrid.tsx"), "utf8");

  /** A largura desenhada por um componente, com as suas travas de CSS. */
  function desenhada(
    src: string,
    area: number,
    min: number,
    max: number,
    alturaMax: number,
    larguraMax: number,
  ) {
    const [w, h] = logoDimsFor(src);
    return Math.min(larguraMax, Math.min(alturaMax, logoHeight(src, area, min, max)) * (w / h));
  }

  it("nunca declara menos do que a fita ou a parede desenham", () => {
    for (const src of Object.keys(logoDims)) {
      const declarada = logoCssWidth(src);
      // Fita: a caixa da parede à maior das escalas (24/10).
      const maior = Math.max(...Object.values(ESCALA_DA_FITA));
      expect(declarada, src).toBeGreaterThanOrEqual(caixaNaParede(src).largura * maior);
      // Parede: a célula mais larga (3 colunas a 1023px) e a mais estreita
      // (5 colunas dentro de max-w-7xl) — o `max-w-[68%]` de cada uma.
      expect(declarada, src).toBeGreaterThanOrEqual(desenhada(src, 3000, 22, 72, Infinity, 194));
      expect(declarada, src).toBeGreaterThanOrEqual(desenhada(src, 3000, 22, 72, Infinity, 129));
    }
  });

  it("a fita é a parede em ponto pequeno: a mesma proporção entre quaisquer dois (ela, 24/10)", () => {
    // A queixa: na fita a Deloitte e a Pérez-Llorca eram enormes e a EDIA e a
    // Universidade pequeninas. A razão de áreas entre dois logótipos tem de
    // ser a mesma na fita e na parede, e nenhuma escala passa de 1 (senão o
    // \`sizes\` mentia para menos).
    for (const e of Object.values(ESCALA_DA_FITA)) expect(e).toBeLessThan(1);
    const caixa = (nome: string) => {
      const c = clientLogos.find((x) => x.name === nome);
      if (!c) throw new Error(`cliente em falta: ${nome}`);
      return caixaNaParede(c.logo);
    };
    // Os wordmarks carregados (a Deloitte, a Pérez-Llorca) não ficam mais
    // altos do que os logótipos finos que ela viu pequeninos.
    for (const pesado of ["Deloitte", "Pérez-Llorca", "Mainova", "Aernnova"])
      for (const fino of [
        "Universidade de Évora",
        "Clínica Dentária Santa Madalena",
        "Hilton Garden Inn",
        "EDIA",
      ])
        expect(caixa(pesado).altura, `${pesado} vs ${fino}`).toBeLessThan(caixa(fino).altura);
    // E nenhum wordmark passa do dobro da largura da Universidade.
    for (const pesado of ["Deloitte", "Pérez-Llorca", "Mainova", "Aernnova"])
      expect(caixa(pesado).largura).toBeLessThanOrEqual(2 * caixa("Universidade de Évora").largura);
  });

  it("declara a largura real, não a do logótipo mais largo de todos", () => {
    // O ponto todo da mudança: estes dois são desenhados a larguras muito
    // diferentes e têm de declarar valores muito diferentes.
    // O Convento é leve (pouca tinta) e por isso cresce desde 17/10 — mas
    // continua muito mais estreito do que o wordmark.
    expect(logoCssWidth(TALL)).toBeLessThan(80);
    expect(logoCssWidth(WIDE)).toBeGreaterThan(150); // wordmark, vai aos 170px
    expect(logoSizes(TALL)).toBe(`${logoCssWidth(TALL)}px`);
    expect(logoSizes(TALL)).toMatch(/^\d+px$/);
  });

  it("não tem `vw` nenhum — senão o next/image apagava os candidatos pequenos", () => {
    // Com um `vw` na expressão, o getWidths do next/image filtra o srcset para
    // as larguras >= deviceSizes[0] * (menor vw). Os candidatos de 64 e 96px
    // desapareciam, e são precisamente os que estes logótipos precisam.
    for (const src of Object.keys(logoDims)) expect(logoSizes(src)).not.toContain("vw");
  });

  it("cai num degrau da escada pré-gerada, e a 1x nunca acima dos 256", () => {
    for (const src of Object.keys(logoDims)) {
      const declarada = logoCssWidth(src);
      // Nenhum logótipo pode declarar mais do que a célula mais larga da
      // parede: acima disso é o `max-w-[68%]` que manda, não a proporção.
      expect(declarada, src).toBeLessThanOrEqual(194);
      expect(LOGO_WIDTHS).toContain(snapLogoWidth(declarada));
      // Num ecrã 1x — o caso medido — nenhum destes logótipos justifica os
      // degraus de 384 ou 512 (esses existem para o wordmark do Navbar).
      expect(snapLogoWidth(declarada), src).toBeLessThanOrEqual(256);
    }
  });

  it("os dois componentes usam a MESMA função (senão descarregam-se duas cópias)", () => {
    expect(FITA).toContain("sizes={logoSizes(logo)}");
    expect(PAREDE).toContain("sizes={logoSizes(client.logo)}");
  });

  it("as travas de CSS que a conta assume ainda estão nos componentes", () => {
    // Se alguém mexer nestas classes sem mexer em CONTEXTOS (logo.ts), o
    // `sizes` passa a mentir — para menos, e os logótipos desfocam.
    expect(FITA).toContain("caixaNaParede(logo)");
    expect(FITA).toContain(`[--fita-escala:${ESCALA_DA_FITA.telemovel}]`);
    expect(FITA).toContain(`sm:[--fita-escala:${ESCALA_DA_FITA.sm}]`);
    expect(FITA).toContain(`lg:[--fita-escala:${ESCALA_DA_FITA.lg}]`);
    expect(PAREDE).toContain("max-w-[68%]");
    expect(PAREDE).toContain("logoHeight(client.logo, 3000, 22, 72)");
  });
});
