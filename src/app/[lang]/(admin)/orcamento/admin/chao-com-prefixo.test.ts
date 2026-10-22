import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CHÃOS TÊM DE APANHAR AS VARIANTES, NÃO SÓ A CLASSE NUA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `globals.css` tem dois chãos escritos por extenso, com a razão de cada um:
 * nenhum texto do painel desce abaixo de 12 px «em ecrã nenhum», e o painel
 * inteiro lê-se em caixa de frase. Os dois estavam escritos com a classe NUA —
 * `.text-\[9px\]`, `.uppercase` — e uma classe nua não apanha as variantes: o
 * Tailwind compila `lg:text-[9px]` para `.lg\:text-\[9px\]`, que é outro nome,
 * dentro de uma media query.
 *
 * MEDIDO num browser a sério, a 1280, com a Visão Geral montada — os três
 * primeiros rótulos que ela vê ao abrir o painel:
 *
 *                        antes                      depois
 *     «Pedidos ativos»    9 px, MAIÚSCULAS          12 px, caixa de frase
 *     «Por responder»     9 px, MAIÚSCULAS          12 px, caixa de frase
 *     «Próximos 7 dias»   9 px, MAIÚSCULAS          12 px, caixa de frase
 *
 * Nove píxeis é o tamanho que o próprio comentário do chão diz que esta casa
 * não manda para ecrã nenhum, «porque abaixo disso não é texto denso: é texto
 * que não se lê». A regra dizia-o e não o fazia.
 *
 * ── PORQUE É QUE O TESTE ANTIGO NÃO APANHAVA ISTO ────────────────────────
 *
 * O `escala-movel.test.ts` varre os `.tsx` à procura de `text-\[(\d+)px\]` — e
 * esse padrão CASA dentro de `lg:text-[9px]`. Vê o «9», confirma que
 * `.text-\[9px\]` está na regra, e passa a verde enquanto o elemento real
 * escapa. Tinha exactamente o mesmo buraco que a CSS que guardava.
 *
 * Aqui pergunta-se a coisa certa: a regra está escrita numa FORMA que apanhe um
 * nome de classe com prefixo?
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");

/**
 * A folha SEM COMENTÁRIOS, e isto não é gosto: apanhou-me.
 *
 * A primeira versão procurava a subcadeia no ficheiro inteiro. Verifiquei ao
 * contrário — repus a classe nua — e o teste das maiúsculas PASSOU na mesma,
 * porque o comentário que eu tinha escrito ao lado da regra menciona
 * `[class*="uppercase"]` em prosa. Um teste que se satisfaz com um comentário
 * não guarda nada; guarda a memória de alguém ter escrito a coisa certa uma vez.
 */
// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS = (
  readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8") +
  readFileSync(join(process.cwd(), "src/app/admin.css"), "utf8")
).replace(/\/\*[\s\S]*?\*\//g, "");

function ficheirosDoBackOffice(dir = RAIZ, achados: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) ficheirosDoBackOffice(p, achados);
    else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) achados.push(p);
  }
  return achados;
}

/** Qualquer prefixo de variante: largura (`lg:`) ou contentor (`@min-[36rem]:`). */
const COM_PREFIXO = /(?:[a-z0-9]+|@min-\[[^\]]*\]|@max-\[[^\]]*\]):/;

describe("os chãos do back office e as variantes", () => {
  it("nenhum tamanho abaixo de 10 px escapa ao chão absoluto, nem com prefixo", () => {
    const pedidos = new Set<string>();
    for (const f of ficheirosDoBackOffice()) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/((?:[\w@[\]./-]+:)*)text-\[(\d+)px\]/g)) {
        const px = Number(m[2]);
        if (px < 10) pedidos.add(`${m[1]}text-[${px}px]`);
      }
    }

    // Se um dia não houver nenhum, este teste deixa de provar o que diz.
    expect(
      [...pedidos].some((c) => COM_PREFIXO.test(c)),
      "já não há nenhum tamanho sub-10 com prefixo — este teste deixou de medir o buraco que existia",
    ).toBe(true);

    /**
     * A pergunta certa: a regra apanha o nome de classe ONDE QUER que ele
     * apareça? Um `[class*="text-[9px]"]` apanha; um `.text-\[9px\]` só apanha
     * a classe nua.
     */
    const semCobertura = [...pedidos].filter((classe) => {
      const nu = classe.replace(/^.*:/, "");
      return !CSS.includes(`[class*="${nu}"]`);
    });

    expect(
      semCobertura,
      `estes tamanhos ficam por baixo do chão de 12 px, incluindo em ecrãs grandes: ` +
        `${semCobertura.join(", ")}. O chão tem de os apanhar por subcadeia — a classe nua ` +
        `não casa com a variante que o Tailwind compila.`,
    ).toEqual([]);
  });

  it("as maiúsculas com prefixo também caem na caixa de frase do painel", () => {
    const comPrefixo = new Set<string>();
    for (const f of ficheirosDoBackOffice()) {
      for (const m of readFileSync(f, "utf8").matchAll(/((?:[\w@[\]./-]+:)+)uppercase\b/g)) {
        comPrefixo.add(`${m[1]}uppercase`);
      }
    }

    expect(
      comPrefixo.size,
      "já não há `uppercase` com prefixo — este teste deixou de medir o buraco que existia",
    ).toBeGreaterThan(0);

    expect(
      CSS.includes('[class*="uppercase"]'),
      `há ${comPrefixo.size} usos de \`uppercase\` com prefixo (${[...comPrefixo].join(", ")}) e a ` +
        "regra que põe o painel em caixa de frase está escrita com a classe nua — eles gritam " +
        "em maiúsculas enquanto o resto do painel está calmo, e não por alguém ter decidido isso.",
    ).toBe(true);
  });
});
