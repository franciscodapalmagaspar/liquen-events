import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ARESTA DE ROLAGEM, MEDIDA ONDE ELA EXISTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * F-09 da auditoria pede «um sombreado no fundo a indicar que há mais». A
 * implementação não tem JavaScript nenhum: é uma faixa `sticky bottom-0` como
 * última filha do que rola. Enquanto há conteúdo por baixo ela fica colada à
 * aresta e o esbatido paira por cima do conteúdo; ao chegar ao fim, a posição
 * natural coincide com a aresta, ela DESCOLA, e passa a esbater fundo sobre
 * fundo — ou seja, desaparece.
 *
 * ── PORQUE É QUE ISTO NÃO SE MEDE PELA POSIÇÃO DA FAIXA ───────────────────
 *
 * Foi o meu primeiro instinto e está errado — medi-o e vi. Em cima e no fim a
 * faixa está NO MESMO SÍTIO do ecrã (fundo 299 px num rolo de 300, nos dois
 * casos), porque no fim a aresta de baixo É a posição natural dela. Um teste
 * pela posição passava sempre, incluindo com a regra apagada.
 *
 * O que distingue os dois estados é o que está POR BAIXO da faixa:
 *
 *   · colada → ela flutua por cima do conteúdo (`faixa.top < conteúdo.bottom`);
 *   · em repouso → assenta a seguir ao conteúdo (`faixa.top >= conteúdo.bottom`).
 *
 * ── E PORQUE É QUE A PÁGINA É MONTADA AQUI EM VEZ DE SE ABRIR O BACK OFFICE ─
 *
 * O painel de detalhe precisa de um PEDIDO aberto, e este passeio corre contra
 * o servidor de produção que não grava (a razão está por extenso no
 * `playwright.config.ts`). Sem dados não há painel para medir.
 *
 * O que está em risco aqui não é o painel — é a REGRA de CSS, e é ela que este
 * ficheiro carrega do `globals.css` verdadeiro, sem a reescrever. Que a faixa
 * está no sítio certo dentro do painel é o que o
 * `aresta-de-rolagem.test.ts` guarda, do outro lado.
 */

/** A regra verdadeira, lida do `admin.css` — não uma cópia que envelhece. (Vivia
 *  no `globals.css`; saiu com o resto do CSS do back office escrito à mão.) */
function regraDaCasa(): string {
  const css = readFileSync("src/app/admin.css", "utf8");
  const i = css.indexOf(".bo-ha-mais-abaixo {");
  if (i === -1) throw new Error("a regra `.bo-ha-mais-abaixo` não está no admin.css");
  return css.slice(i, css.indexOf("\n}", i) + 2);
}

const PAGINA = (regra: string) => `<!doctype html><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root { --bo-surface: #ffffff; }
  #rolo { height: 300px; overflow-y: auto; background: #fff; }
  #conteudo { height: 900px; background: linear-gradient(#eef, #fee); }
  ${regra}
</style>
<div id="rolo"><div id="conteudo"></div><div class="bo-ha-mais-abaixo"></div></div>`;

test("a faixa paira sobre o conteúdo enquanto há mais, e assenta no fim", async ({ page }) => {
  await page.setViewportSize({ width: 500, height: 400 });
  await page.setContent(PAGINA(regraDaCasa()));

  const medir = () =>
    page.evaluate(() => {
      const rolo = document.getElementById("rolo")!;
      const conteudo = document.getElementById("conteudo")!;
      const faixa = document.querySelector<HTMLElement>(".bo-ha-mais-abaixo")!;
      const f = faixa.getBoundingClientRect();
      return {
        sobrepoe: f.top < conteudo.getBoundingClientRect().bottom,
        altura: Math.round(f.height),
        noFim: rolo.scrollTop >= rolo.scrollHeight - rolo.clientHeight - 1,
      };
    });

  const emCima = await medir();
  expect(emCima.altura, "a faixa não tem altura — não há esbatido nenhum").toBeGreaterThan(8);
  expect(
    emCima.sobrepoe,
    "com conteúdo por baixo, a faixa devia estar colada a pairar sobre ele",
  ).toBe(true);

  await page.evaluate(() => {
    const r = document.getElementById("rolo")!;
    r.scrollTop = r.scrollHeight;
  });
  await page.waitForTimeout(50);

  const noFim = await medir();
  expect(noFim.noFim, "não cheguei ao fim do rolo — a medição não vale").toBe(true);
  expect(
    noFim.sobrepoe,
    "no fim a faixa continua por cima do conteúdo — esbate a última linha para sempre",
  ).toBe(false);
});

test("a faixa não apanha cliques do que está por baixo", async ({ page }) => {
  await page.setViewportSize({ width: 500, height: 400 });
  await page.setContent(
    PAGINA(regraDaCasa()).replace(
      '<div id="conteudo"></div>',
      '<div id="conteudo"><button id="alvo" style="position:absolute;top:270px;left:10px">x</button></div>',
    ),
  );
  // O botão está debaixo da faixa colada. Se ela apanhasse o clique, o alvo
  // devolvido pelo browser era a faixa — e um botão do painel deixava de se
  // poder carregar sem ninguém perceber porquê.
  const alvo = await page.evaluate(() => {
    const b = document.getElementById("alvo")!.getBoundingClientRect();
    const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return el?.id || el?.className || "nada";
  });
  expect(alvo).toBe("alvo");
});
