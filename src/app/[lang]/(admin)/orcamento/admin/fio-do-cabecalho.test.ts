import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FIO DO CABEÇALHO SÓ APARECE QUANDO HÁ COISA POR CIMA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Da análise que ela mandou do site de referência: lá o cabeçalho começa sem
 * moldura e ganha-a ao rolar, em 200 ms. A razão é boa, e aqui passou a ser
 * ainda melhor: com o chão do painel branco, um cabeçalho branco com um risco
 * por baixo desenha uma linha a separar o nada. O fio passa a DIZER uma coisa —
 * «há conteúdo escondido acima» — em vez de estar sempre lá.
 *
 * ── AS DUAS COISAS QUE ISTO GUARDA ────────────────────────────────────────
 *
 * 1. QUE O `border-b` FICA SEMPRE, e o que muda é só a cor. Ligar e desligar a
 *    moldura mudava a altura do cabeçalho em 1 px a cada vez que ela passa o
 *    limiar — e um salto de um pixel a meio de uma lista é pior do que um risco
 *    a mais. É a falha fácil de escrever («é só tirar o `border-b` quando está
 *    no topo») e não dá erro nenhum: vê-se como um tremor.
 *
 * 2. QUE O MOVIMENTO É `motion-safe`. Uma transição de cor não é grande coisa,
 *    mas a regra da casa não tem excepções pequenas.
 *
 * ── PORQUE É QUE ISTO LÊ O CÓDIGO E NÃO DESENHA O ECRÃ ────────────────────
 *
 * A mesma razão que o `AdminClient.menu-recolhido.test.tsx` escreve: o jsdom
 * não faz contas de layout, e um teste que aqui medisse a moldura media zero e
 * passava sempre. O que se prende é a DECISÃO — que a cor depende do estado de
 * rolagem e que a altura não depende de nada. Quem mede a sério é o passeio do
 * Playwright.
 */

const FONTE = readFileSync("src/app/[lang]/(admin)/orcamento/admin/AdminClient.tsx", "utf8");

/** O `<header>` colado ao topo, do `<header` até ao `>` que o fecha. */
function cabecalho(): string {
  const i = FONTE.indexOf("<header");
  expect(i, "o cabeçalho da vista desapareceu do AdminClient").toBeGreaterThan(-1);
  return FONTE.slice(i, FONTE.indexOf(">", FONTE.indexOf("className", i)) + 1);
}

describe("o fio do cabeçalho", () => {
  it("a moldura existe sempre, para a altura não saltar", () => {
    const h = cabecalho();
    expect(h, "o cabeçalho deixou de ser colado ao topo").toContain("sticky top-0");
    // `border-b` sem cor agarrada: a largura fica reservada, a cor é que muda.
    expect(
      h,
      "o `border-b` passou a depender do estado — isto faz o cabeçalho saltar 1 px",
    ).toMatch(/border-b(?![-\w])/);
    expect(h, "o `border-b` ficou dentro do ramo condicional").not.toMatch(
      /\?[^:]*border-b(?![-\w])/,
    );
  });

  it("e a cor dela depende de já se ter descido", () => {
    const h = cabecalho();
    expect(h, "o fio deixou de responder à rolagem").toContain("desceu");
    expect(h, "no topo o fio já não é transparente").toContain("border-transparent");
    expect(h, "depois de descer o fio já não é o da casa").toContain("border-[var(--bo-hairline)]");
  });

  it("e a mudança respeita o movimento reduzido", () => {
    expect(cabecalho(), "a transição do fio deixou de ser `motion-safe`").toContain(
      "motion-safe:transition-colors",
    );
  });

  it("o estado de rolagem é o que já existia, com histerese", () => {
    // Nenhum ouvinte novo: o `desceu` é o mesmo que faz o cabeçalho encolher, e
    // traz a histerese (desce aos 24, volta aos 8) que evita o tremor de quem
    // pára o dedo em cima do limiar. Um segundo ouvinte de rolagem para isto
    // seria trabalho a mais no fio principal, a cada gesto.
    expect(FONTE, "o `desceu` deixou de vir do gancho da casa").toContain("useDesceu()");
    const adaptativo = readFileSync(
      "src/app/[lang]/(admin)/orcamento/admin/ui/adaptativo.ts",
      "utf8",
    );
    expect(adaptativo, "a histerese do `useDesceu` desapareceu").toMatch(
      /useDesceu\(limiar = \d+, voltaAos = \d+\)/,
    );
  });
});
