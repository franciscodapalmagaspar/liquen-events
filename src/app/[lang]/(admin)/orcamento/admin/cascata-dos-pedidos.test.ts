import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ENTRADA DO ECRÃ DOS PEDIDOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Mesmo tratamento da Visão Geral, no ecrã a seguir: os controlos, as pastilhas
 * de estado e a lista entram em cascata em vez de aparecerem todos de uma vez.
 *
 * ── PORQUE É QUE ISTO É UM TESTE E NÃO SÓ UMA CLASSE ─────────────────────
 *
 * Porque este defeito exacto já aconteceu uma vez, e nenhum teste o apanhou: na
 * Visão Geral a classe `bo-cena` caiu DENTRO de um `.map()` e três blocos
 * ficaram com a mesma vez (`0, 2, 2, 2, 3`). Animavam-se os filhos e não o
 * bloco. Quem o apanhou foi o browser, e só porque fui lá olhar.
 *
 * A regra que o define é simples e é esta: cada vez pertence a UM bloco, e as
 * vezes começam no princípio e não saltam.
 */

const FONTE = readFileSync("src/app/[lang]/(admin)/orcamento/admin/AdminClient.tsx", "utf8");

/** Comentários fora, com as linhas de pé — a regra da casa. */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

/** As vezes declaradas no ecrã dos Pedidos, pela ordem em que aparecem. */
function vezes(): number[] {
  const src = semComentarios(FONTE);
  const i = src.indexOf('view === "pedidos"');
  expect(i, "não encontrei o ecrã dos Pedidos").toBeGreaterThan(-1);
  const fim = src.indexOf('view === "kanban"', i);
  const bloco = src.slice(i, fim > i ? fim : undefined);
  return [...bloco.matchAll(/"--cena":\s*(\d+)/g)].map((m) => Number(m[1]));
}

describe("a cascata de entrada dos Pedidos", () => {
  it("existe, e tem pelo menos três tempos", () => {
    expect(vezes().length, "o ecrã dos Pedidos deixou de ser encenado").toBeGreaterThanOrEqual(3);
  });

  it("cada bloco tem a SUA vez — o defeito que a Visão Geral já teve", () => {
    const v = vezes();
    expect(v.length - new Set(v).size, `há blocos a partilhar a mesma vez: ${v.join(", ")}`).toBe(
      0,
    );
  });

  it("as vezes começam no princípio e não saltam", () => {
    // Uma cascata que comece no 2, ou que salte do 0 para o 3, tem buracos de
    // 70 ms que ninguém escolheu — e o primeiro bloco chega atrasado sem razão.
    const v = [...vezes()].sort((a, b) => a - b);
    expect(v[0]).toBe(0);
    v.forEach((n, i) => expect(n, `salto na cascata: ${v.join(", ")}`).toBe(i));
  });
});
