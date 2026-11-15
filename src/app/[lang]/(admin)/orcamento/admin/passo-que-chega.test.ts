import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PASSO QUE CHEGA APRESENTA-SE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «imagina, estamos na fazer proposta, passamos para a parte
 * seguinte — o que é que metes de animação aí?».
 *
 * Até aqui, nada. Os três passos do estúdio — «1 Conteúdo», «2 Pré-visualizar»,
 * «3 Enviar» — trocavam com `hidden`: o conteúdo seguinte aparecia no mesmo
 * fotograma em que o anterior desaparecia. É o gesto mais repetido de uma tarde
 * a escrever propostas, e era o único ecrã grande do back office sem uma classe
 * de movimento (o `ProposalStudio.tsx` tinha ZERO ocorrências de `bo-cena`,
 * `view-in` ou `bo-entrada` em treze mil linhas).
 *
 * ── O QUE ESTE FICHEIRO PRENDE, E O QUE NÃO PRENDE ────────────────────────
 *
 * Prende o MECANISMO, que é a parte que se pode partir sem ninguém dar por
 * isso: a `.view-in` entra e sai com o passo, em vez de vir de um `key`.
 *
 * A diferença não é de estilo. Um `key` remonta, e estes dois passos não podem
 * remontar: ficam montados de propósito (só `hidden`) porque o passo 1 guarda o
 * formulário inteiro e o passo 3 guarda o estado do envio. Alguém que troque
 * isto por `key={step}` a pensar que é a mesma coisa faz o estúdio perder o
 * foco, o rolo e o trabalho a meio — e o ecrã continua a animar, portanto o
 * defeito passa despercebido.
 *
 * Não prende que a animação SE VEJA: isso é o browser, e mede-se num browser.
 */

const FONTE = readFileSync("src/app/[lang]/(admin)/orcamento/admin/ProposalStudio.tsx", "utf8");
const CSS = readFileSync("src/app/globals.css", "utf8");

describe("o passo que chega apresenta-se", () => {
  it("os passos 1 a 4 entram com a classe, e o formulário continua montado quando sai", () => {
    // A classe depende do passo, e o `hidden` também: os dois no mesmo nó.
    expect(FONTE).toMatch(
      /className=\{`@container\/estudio [^`]*\$\{noFormulario \? "view-in" : ""\}`\}\s*hidden=\{!noFormulario\}/,
    );
  });

  it("o passo 3 entra com a classe, e continua montado quando sai", () => {
    expect(FONTE).toMatch(
      /className=\{`[^`]*\$\{step === "enviar" \? "view-in" : ""\}`\}\s+hidden=\{step !== "enviar"\}/,
    );
  });

  it("o resumo do «Rever e enviar» monta de raiz, portanto a classe basta-lhe", () => {
    expect(FONTE).toMatch(/\{step === "enviar" && \(\n(?:.*\n)*?\s*<div className="view-in">/);
  });

  /**
   * O controlo que dá sentido aos três de cima: nenhum dos passos pode passar a
   * remontar. Se alguém puser um `key` num destes nós, o formulário do passo 1
   * volta a nascer a cada ida ao passo 2.
   */
  it("nenhum dos passos troca a classe por um `key` que remonta", () => {
    expect(FONTE).not.toMatch(/hidden=\{!noFormulario\}[\s\S]{0,200}?key=\{step\}/);
    expect(FONTE).not.toMatch(/key=\{step\}[\s\S]{0,200}?hidden=\{step !== "enviar"\}/);
  });

  /**
   * E a classe que os três pedem tem de continuar a ser o que a casa diz: a
   * banda dos estados, a curva de quem apresenta, `backwards` (para não deixar
   * transform pendurado a quebrar o `position: fixed` de uma folha aberta lá
   * dentro), e calada com movimento reduzido.
   */
  it("a `.view-in` continua a ser 240 ms, `backwards`, e cala-se com movimento reduzido", () => {
    expect(CSS).toMatch(
      /\.view-in\s*\{[\s\S]{0,2400}?animation:\s*view-in\s+240ms\s+cubic-bezier\(0,\s*0,\s*0\.2,\s*1\)\s+backwards/,
    );
    expect(CSS).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]{0,600}?\.view-in\s*\{\s*animation:\s*none/,
    );
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * E O FIM DA JORNADA DESENHA-SE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Depois de uma barra a encher durante dezenas de segundos numa quinta com 4G,
 * a proposta dava-se por enviada num fotograma: um `✓` de texto aparecia, e
 * mais nada. É o único momento do estúdio que pertence à banda de apresentação
 * (600–1500 ms) — e era o único sem nada.
 *
 * O gesto não é novo: é o mesmo que o CASAL vê ao pedir orçamento. Passar a
 * usá-lo dos dois lados é uma decisão sobre a casa, não sobre esta tela — e é
 * isso que este bloco prende, para ninguém os deixar divergir.
 */
/*
 * O PASSO QUE CHEGA MOSTRA-SE PELO PRINCÍPIO (auditoria do telemóvel, 14/11)
 * já não se prende aqui com expressões sobre o código: uma regex passava com
 * um quinto caminho a fazer `setStep` ao lado (o «Voltar e corrigir» fazia-o).
 * Prende-se a EXERCER o `irParaPasso` — em `ProposalStudio.casos.test.tsx`,
 * os casos com «INÍCIO» no nome (barra, «Seguinte», «Voltar e corrigir»,
 * «Repor esta versão», «Limpar rascunho», com `comOPassoLaEmCima`) — e com o
 * dedo no passeio `e2e/o-iphone-com-barras.spec.ts`.
 */
describe("o fim da jornada desenha-se", () => {
  it("a confirmação do envio usa o mesmo visto que o casal vê", () => {
    // No estúdio.
    expect(FONTE).toMatch(/className="confirm-ring"/);
    expect(FONTE).toMatch(/className="confirm-check"/);
    // Controlo positivo: e o ecrã do casal continua a usar o mesmo — se ele
    // mudar de gesto, este caso avisa antes de os dois divergirem.
    const doCasal = readFileSync(
      "src/app/[lang]/(site)/orcamento/confirmacao/[id]/ConfirmacaoClient.tsx",
      "utf8",
    );
    expect(doCasal).toMatch(/className="confirm-ring"/);
    expect(doCasal).toMatch(/className="confirm-check"/);
  });

  it("o cartão da confirmação entra na banda de apresentação", () => {
    // `bo-cena` (600 ms) e não `view-in` (240): isto é uma apresentação, não
    // uma troca de estado.
    expect(FONTE).toMatch(/<div className="bo-cena flex flex-col items-start gap-3 rounded-2xl/);
  });

  it("o visto desenha-se em traço, e fica desenhado com movimento reduzido", () => {
    expect(CSS).toMatch(/\.confirm-ring\s*\{[^}]*animation:\s*confirm-draw\s+0\.7s/);
    expect(CSS).toMatch(/\.confirm-check\s*\{[^}]*animation:\s*confirm-draw\s+0\.45s/);
    // Com movimento reduzido não desaparece: aparece JÁ desenhado.
    expect(CSS).toMatch(
      /prefers-reduced-motion:\s*reduce\)\s*\{\s*\.confirm-ring,\s*\.confirm-check\s*\{\s*animation:\s*none;\s*stroke-dashoffset:\s*0/,
    );
  });
});
