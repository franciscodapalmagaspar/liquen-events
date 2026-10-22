import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CHÃO QUE NÃO TEM LARGURA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O chão do telemóvel (ver `escala-movel.test.ts`) levanta cinco tamanhos — 7 a
 * 11 px — e pára nos 1024, porque é aí que a lista passa a tabela e a tabela é
 * densa porque tem de ser. Essa fronteira está medida e continua a valer.
 *
 * Continua a valer para os 10 e 11 px. **Não vale para os 8 e 9.**
 *
 * Uma análise de craft mediu o CSS calculado da apple.com nó a nó: 208 blocos
 * de texto, oito degraus, e o mais baixo de todos é 12 px — num ecrã de
 * 1108 px, onde densidade não falta. A escala desta casa começa no mesmo sítio
 * (`--bo-fs-caption`). Nenhuma das duas desce abaixo disso em ecrã nenhum,
 * porque abaixo de 12 px não é texto denso: é texto que não se lê.
 *
 * Medido: 94 chamadas a `text-[8px]`/`text-[9px]` em 20 ficheiros do back
 * office, algumas a vestir etiquetas de estado e rótulos de destino.
 */

// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS =
  readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8") +
  readFileSync(join(process.cwd(), "src/app/admin.css"), "utf8");

/** O bloco do chão absoluto — do título dele até ao comentário seguinte. */
function bloco(): string {
  const i = CSS.indexOf("CHÃO ABSOLUTO");
  expect(i, "o bloco do chão absoluto desapareceu do globals.css").toBeGreaterThan(-1);
  const resto = CSS.slice(i);
  const fim = resto.indexOf("/* ──", 200);
  return fim === -1 ? resto : resto.slice(0, fim);
}

/**
 * O mesmo bloco, SEM COMENTÁRIOS.
 *
 * Sem isto as afirmações pelo negativo — «não levanta o 10 nem o 11» — leem a
 * prosa que está ao lado da regra, e essa prosa FALA do 10 e do 11 para
 * explicar porque é que ficam de fora. O teste dava-se por satisfeito com um
 * comentário em vez de olhar para a regra. Já me apanhou uma vez hoje, no
 * `chao-com-prefixo.test.ts`.
 */
function regra(): string {
  return bloco().replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("o chão absoluto da letra", () => {
  it("levanta o 7, o 8 e o 9 ao degrau que a casa já tinha", () => {
    const b = regra();
    /**
     * ── PELA SUBCADEIA, E NÃO PELA CLASSE NUA ──────────────────────────────
     *
     * Isto exigia `.text-\[9px\]` — a classe nua — e era essa a forma que a
     * regra tinha. MEDIDO num browser, a 1280, com a Visão Geral montada: três
     * rótulos («Pedidos ativos», «Por responder», «Próximos 7 dias») pediam
     * `lg:text-[9px]` e saíam mesmo a 9 px, porque o Tailwind compila essa
     * variante para `.lg\:text-\[9px\]` — outro nome de classe, dentro de uma
     * media query — e a classe nua não lhe toca.
     *
     * A regra passou a `[class*="text-[9px]"]`, que apanha o nome onde quer que
     * ele apareça. Este teste passa a exigir essa forma: é ela, e não a outra,
     * que cumpre o que o bloco promete.
     */
    for (const px of [7, 8, 9, 10, 11]) {
      expect(b, `o ${px}px ficou de fora`).toContain(`[class*="text-[${px}px]"]`);
    }
    // O degrau da casa, e não um número inventado ao lado dele.
    expect(b).toMatch(/font-size:\s*var\(--bo-fs-caption\)/);
  });

  /**
   * ── ESTA RÉGUA MUDOU DE ALVO, E A RAZÃO FICA ESCRITA ────────────────────
   *
   * Guardava o contrário: que o 10 e o 11 NÃO entravam aqui, porque eram «o
   * registo denso do computador» e levantá-los mudava a densidade da tabela do
   * portátil «sem ninguém pedir».
   *
   * A premissa dessa frase era ninguém ter pedido. Deixou de ser verdade: com
   * a medição à frente — 593 tamanhos escritos à mão contra onze usos da escala
   * declarada —, a dona do negócio disse «arruma em todo o back office».
   *
   * Uma guarda cuja premissa caiu não se contorna nem se apaga: muda de alvo e
   * diz porquê. O que ela agora guarda é o fim da escada — que o chão pára no
   * 11 e não continua a subir sozinho pela escala acima, engolindo o `label`
   * (13) e o `body` (15), que são degraus com trabalho a fazer e não erros.
   */
  it("e PÁRA no 11 — o 12 é o degrau, não mais um número a levantar", () => {
    // Pelo NÚMERO e não por uma grafia: escrito `.text-\[13px\]`, esta guarda
    // ficava cega assim que a regra mudasse de forma, e uma guarda cega passa a
    // verde por não estar a olhar. Lê a regra sem comentários.
    const b = regra();
    expect(b, "o 13px (o degrau `label`) foi engolido pelo chão").not.toMatch(/13px/);
    expect(b, "o 15px (o degrau `body`) foi engolido pelo chão").not.toMatch(/15px/);
  });

  it("não tem largura nenhuma — é um limite do olho, não do ecrã", () => {
    expect(bloco()).not.toMatch(/@media/);
  });

  it("é do back office e não pinta o site público", () => {
    expect(bloco()).toMatch(/body:is\(\.admin-mode, :has\(\[data-admin-mode\]\)\)/);
  });

  /**
   * A geometria que o bloco de cima já tinha aprendido: subir o corpo sem
   * desapertar o espacejamento troca letra pequena por texto transbordado.
   */
  it("desaperta o espacejamento junto com o tamanho", () => {
    expect(bloco()).toMatch(/letter-spacing:/);
  });

  /**
   * ── E O BLOCO DO TELEMÓVEL TEM DE CONTINUAR INTEIRO ────────────────────
   * O `escala-movel.test.ts` lê a regra dele a partir do título até ao
   * comentário seguinte. Pôr este bloco ANTES deixava-o a ler metade — e os
   * seis casos dele caíram todos à primeira tentativa, por isso.
   */
  it("vem depois do chão do telemóvel, e não antes", () => {
    const movel = CSS.indexOf("CHÃO DA LETRA NO TELEMÓVEL");
    const absoluto = CSS.indexOf("CHÃO ABSOLUTO");
    expect(movel).toBeGreaterThan(-1);
    expect(absoluto).toBeGreaterThan(movel);
    // E o `@media` do telemóvel fica entre os dois, que é o que prova que o
    // bloco dele não foi partido ao meio.
    expect(CSS.slice(movel, absoluto)).toMatch(/@media\s*\(max-width:\s*1023/);
  });
});
