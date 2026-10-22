import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ABERTURA TEM DE SAIR NO MESMO JACTO QUE A CORTINA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela pediu animações espetaculares pela proposta. O que se encontrou foi que
 * a que já lá estava era INVISÍVEL, e por duas razões independentes.
 *
 * ── 1. O GESTO FAZIA-SE DEBAIXO DO PANO ───────────────────────────────────
 *
 * A entrada arrancava no mesmo instante que a cortina (`--cortina-sobe`) e
 * durava 520 ms. Só que o pano leva 270 ms a sair — e é opaco.
 *
 * A conta, com a curva real (`cubic-bezier(0.16, 1, 0.3, 1)`, que gasta quase
 * tudo no princípio): quando o pano sai do ecrã, a entrada já fez 97,6% do
 * percurso. Dos 18 px, sobravam 0,44 px para o casal ver.
 *
 * ── 2. E O RELÓGIO ESTAVA NO SÍTIO ERRADO ─────────────────────────────────
 *
 * Este é o que nenhum teste de resultado podia apanhar, porque a animação
 * está lá, corre, e acaba certa. O que estava errado era ONDE ela vivia.
 *
 * `animation-delay` conta-se a partir do instante em que o ELEMENTO existe. A
 * entrada estava declarada na `page.tsx` — que é `force-dynamic` e tem
 * `loading.tsx` — portanto saía num jacto POSTERIOR ao do layout, onde a
 * cortina vive. Os dois relógios afastavam-se por tanto tempo quanto o
 * servidor demorasse a ir buscar a proposta.
 *
 * Numa rede lenta: o pano sai, a proposta fica à vista fora do sítio, e só
 * depois — com o casal já a ler — é que ela desliza para o lugar. Uma coisa a
 * mexer-se debaixo do polegar de quem lê é o que o briefing dela proíbe.
 *
 * Por isso este ficheiro prende o SÍTIO, e não o resultado.
 */
const LAYOUT = readFileSync("src/app/[lang]/(privado)/layout.tsx", "utf8");
const PAGINA = readFileSync("src/app/[lang]/(privado)/proposta/[token]/page.tsx", "utf8");
const CSS = readFileSync("src/app/globals.css", "utf8");

/** O código sem comentários — senão as próprias explicações disparavam os casos. */
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("a abertura da proposta", () => {
  it("o relógio dela sai no primeiro jacto, no layout, e não com o documento", () => {
    const codigo = semComentarios(LAYOUT);
    expect(codigo, "o invólucro da abertura saiu do layout").toContain('className="prop-abertura"');
    expect(
      semComentarios(PAGINA),
      "a entrada voltou para a página, que chega num jacto posterior",
    ).not.toMatch(/\bprop-folha\b/);
  });

  it("sem cortina na proposta, a entrada não espera por ela (22/10, «Sai só na proposta»)", () => {
    /**
     * Esperar por `--cortina-sobe` sem pano à frente era a página ficar 2 s
     * deslocada à vista e mexer-se quando o casal já lia.
     */
    expect(semComentarios(LAYOUT), "a cortina voltou à proposta").not.toMatch(/<Cortina\b/);
    const regra = /\.prop-abertura \{[\s\S]*?\n {2}\}/.exec(CSS)?.[0] ?? "";
    expect(regra, "desapareceu a regra da abertura").not.toBe("");
    expect(regra).not.toMatch(/--cortina/);
  });

  it("`backwards` e nunca `forwards` — não fica um bloco de contenção montado", () => {
    /**
     * Este invólucro é agora o pai de TUDO o que está no ramo privado. Uma
     * animação com `forwards` deixa um `transform` calculado no fim, e com ele
     * qualquer `position: fixed` lá dentro passa a ser medido por ele em vez
     * do ecrã. Está medido no `nada-fixo-preso-numa-seccao.test.ts`: uma lupa
     * de fotografias mediu 3202 px num ecrã de 780 quando isto aconteceu.
     */
    const regra = /\.prop-abertura \{[\s\S]*?\n {2}\}/.exec(CSS)?.[0] ?? "";
    expect(regra).toContain("backwards");
    expect(regra, "`forwards` deixava o bloco de contenção montado").not.toContain("forwards");
  });

  it("só `transform` — nada que obrigue a repintar, e nada que esconda", () => {
    /**
     * Duas razões, e a segunda é a que manda. A primeira são os 60 fps num
     * iPhone em 4G. A segunda é que uma rampa de opacidade por cima desta
     * página apagaria o borrão da capa — que é a chegada dela — e deixaria a
     * proposta a depender de a animação acabar para se poder ler.
     */
    const quadros = /@keyframes prop-entrada \{[\s\S]*?\n\}/.exec(CSS)?.[0] ?? "";
    expect(quadros, "desapareceram os fotogramas da entrada").not.toBe("");
    const propriedades = [...quadros.matchAll(/^\s{4}([a-z-]+):/gm)].map((m) => m[1]);
    expect(propriedades.length, "os fotogramas ficaram sem declarações").toBeGreaterThan(0);
    expect(propriedades, "a entrada passou a animar coisa que não é `transform`").toEqual(
      Array(propriedades.length).fill("transform"),
    );
  });

  it("quem pediu menos movimento não leva abertura nenhuma — e nada fica fora do sítio", () => {
    /**
     * A regra que manda em tudo: o estado escondido NÃO PODE EXISTIR sem que
     * alguém o ponha. Aqui não existe de todo — a deslocação inicial vem do
     * `backwards` da própria animação, e sem animação não há deslocação.
     */
    const semNoPreference = CSS.replace(
      /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g,
      "",
    );
    expect(
      /\.prop-abertura \{[^}]*(opacity|transform|animation)\s*:/.test(semNoPreference),
      "há um estado fora do sítio declarado fora do `no-preference`",
    ).toBe(false);
  });
});
