import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O SELECTOR COM QUE O BACK OFFICE SE PINTA.
 *
 * Deixou de ser só `body.admin-mode`: a classe entra num efeito e chegava
 * tarde de mais para o primeiro pixel. Agora é
 * `body:is(.admin-mode, :has([data-admin-mode]))`, com o atributo servido pelo
 * `layout.tsx` do grupo `(admin)`. A razão por extenso está no `globals.css`.
 */
const SELECTOR_ADMIN = "body:is(.admin-mode, :has([data-admin-mode]))";

/** Tira todos os `:where(…)` de um selector, contando os parêntesis. */
function semWhere(selector: string): string {
  let fora = "";
  for (let i = 0; i < selector.length; ) {
    if (!selector.startsWith(":where(", i)) {
      fora += selector[i];
      i += 1;
      continue;
    }
    let nivel = 0;
    i += ":where".length;
    for (; i < selector.length; i += 1) {
      if (selector[i] === "(") nivel += 1;
      else if (selector[i] === ")") {
        nivel -= 1;
        if (nivel === 0) {
          i += 1;
          break;
        }
      }
    }
  }
  return fora;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ENTRELINHA VAI COM O TAMANHO — 3,2 px por linha, no telemóvel dela
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Padrão 02 da análise de craft: «entrelinha por tamanho — sem regra visível».
 * Não havia mesmo, e o preço pagava-se onde ela trabalha.
 *
 * ── A CONTA, QUE É O QUE FAZ ISTO VALER A PENA ────────────────────────────
 *
 * O chão da letra levanta 7, 8, 9, 10 e 11 px para 12 px abaixo de 1024 — no
 * telemóvel, 649 chamadas desenham-se a 12 px. Mas só o TAMANHO mudava:
 *
 *     herda o `--bo-lh-body` (1,6)   →   19,2 px de entrelinha
 *     o `text-xs`, a MESMA medida    →   16,0 px
 *     ──────────────────────────────────────────────────────
 *     diferença por linha            →    3,2 px
 *
 * Numa lista de vinte linhas são 64 px de altura a mais, decididos por qual das
 * duas grafias alguém calhou de escrever. É a queixa dela — «está tudo enorme»,
 * «pouco prático» — com um número em cima.
 *
 * ── PORQUE É QUE ESTE TESTE LÊ O CSS E NÃO O BROWSER ──────────────────────
 *
 * Porque já se aprendeu, nesta mesma casa e por escrito, que a verificação com
 * Playwright não é de confiança aqui: o servidor de desenvolvimento é
 * reaproveitado entre execuções e a reconstrução do CSS não é síncrona com a
 * gravação — a cor computada saía igual com a alteração revertida. Um sinal que
 * tanto pode ser verdadeiro como uma corrida não é sinal.
 *
 * O que este ficheiro prende é o CONTRATO da regra, e é onde ele se pode
 * partir sem ninguém dar por isso: a especificidade.
 */

// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS =
  readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8") +
  readFileSync(join(process.cwd(), "src/app/admin.css"), "utf8");

/**
 * O bloco do chão da letra, INTEIRO — do `@media` à chaveta que o fecha.
 *
 * Contando chavetas e não uma janela de N caracteres: a primeira versão levava
 * 3000, e bastou acrescentar um comentário lá dentro para a regra ficar de fora
 * da janela e três testes chumbarem por uma razão que não era a deles.
 */
function chaoDoTelemovel(): string {
  const i = CSS.indexOf("@media (max-width: 1023.98px)");
  expect(i, "desapareceu o bloco do chão da letra").toBeGreaterThan(-1);
  const semComentarios = CSS.replace(/\/\*[\s\S]*?\*\//g, (c) => " ".repeat(c.length));
  let d = 0;
  for (let j = i; j < CSS.length; j++) {
    if (semComentarios[j] === "{") d++;
    else if (semComentarios[j] === "}") {
      d--;
      if (d === 0) return CSS.slice(i, j + 1);
    }
  }
  throw new Error("o bloco do chão da letra não fecha");
}

describe("a entrelinha da legenda", () => {
  it("existe como token, ao lado das outras duas", () => {
    expect(CSS).toMatch(/--bo-lh-caption:\s*1\.35;/);
    // E as irmãs continuam lá — se alguém as tirar, isto passa a apontar para
    // um token que não existe e o Tailwind cala-se (já aconteceu com as durações).
    expect(CSS).toMatch(/--bo-lh-tight:/);
    expect(CSS).toMatch(/--bo-lh-body:/);
  });

  it("é aplicada aos cinco degraus que o chão levanta", () => {
    const bloco = chaoDoTelemovel();
    const regra = bloco.slice(bloco.indexOf(`:where(${SELECTOR_ADMIN})`));
    for (const px of [7, 8, 9, 10, 11]) {
      expect(regra, `o degrau de ${px}px ficou de fora da entrelinha`).toContain(
        `.text-\\[${px}px\\]`,
      );
    }
    expect(regra).toMatch(/line-height:\s*var\(--bo-lh-caption\)/);
  });

  /**
   * O CONTRATO QUE MAIS FACILMENTE SE PARTE.
   *
   * A regra do TAMANHO, três linhas acima desta, ganha de propósito a quem
   * escreveu um tamanho à mão — o comentário dela explica que sem isso o
   * `text-[9px]` da chamada voltava a ganhar.
   *
   * Para a ENTRELINHA isso estaria errado: quem escreveu `leading-relaxed` num
   * sítio quis aquilo, e são 102 sítios. `:where()` nos dois lados zera a
   * especificidade e deixa-os ganhar.
   *
   * Basta alguém tirar um `:where(` — a regra continua a funcionar, e passa a
   * atropelar silenciosamente as 102 escolhas. É por isso que isto é um teste.
   */
  /**
   * A METADE QUE EU HAVIA ESQUECIDO, E QUE SOZINHA ANULAVA A OUTRA.
   *
   * `:where()` zera a especificidade — mas a especificidade só decide DENTRO da
   * mesma camada. Uma declaração normal FORA de camadas ganha a qualquer uma
   * que esteja dentro de uma, por mais específica que seja. E os utilitários do
   * Tailwind vivem em `@layer utilities` — compilado e confirmado: a
   * `.leading-snug` sai lá dentro.
   *
   * Escrita fora de camada, como a regra do TAMANHO três linhas acima, esta
   * regra atropelava as 102 chamadas com `leading-*` à mão, por mais `:where()`
   * que levasse. Escrevi exactamente isso na primeira versão, e estava errado.
   *
   * As duas regras querem coisas opostas: o tamanho é um CHÃO e tem de ganhar à
   * chamada; a entrelinha é uma OMISSÃO e tem de perder para ela.
   */
  it("vive dentro da camada dos utilitários — senão o `:where()` não vale nada", () => {
    // SEM COMENTÁRIOS, e desta vez pela terceira: o comentário que explica esta
    // regra CITA `@layer utilities` duas vezes, e a primeira versão deste teste
    // encontrava a citação e passava a verde com a camada removida. Verificado
    // à mão — tirei a camada do `globals.css` e ele não deu por nada.
    const bloco = chaoDoTelemovel().replace(/\/\*[\s\S]*?\*\//g, "");
    const i = bloco.indexOf("line-height: var(--bo-lh-caption)");
    expect(i).toBeGreaterThan(-1);
    const antes = bloco.slice(0, i);
    const camada = antes.lastIndexOf("@layer utilities");
    expect(
      camada,
      "a regra da entrelinha saiu de `@layer utilities` — fora de camada ela " +
        "ganha a qualquer `leading-*` da chamada, que é o contrário do que se quer",
    ).toBeGreaterThan(-1);
    // E a camada continua ABERTA quando a declaração chega: entre o `@layer` e
    // ela só pode haver a chaveta do próprio selector, nunca uma que feche.
    const entre = antes.slice(camada);
    expect(
      (entre.match(/\}/g) ?? []).length,
      "a camada fecha antes da regra — a regra ficou de fora dela",
    ).toBe(0);
  });

  it("tem especificidade ZERO, para não atropelar um `leading-` escrito à mão", () => {
    // SEM COMENTÁRIOS: o comentário que explica a regra vive entre a chaveta
    // anterior e o selector, e a primeira versão deste teste apanhou-o como se
    // fosse selector. Um teste que lê CSS tem de saber onde acaba a prosa.
    // Sem comentários (o comentário que explica a regra vive entre a chaveta
    // anterior e o selector) e sem a abertura da camada — que é uma regra-mãe,
    // não faz parte do selector, e a primeira versão deste teste apanhou as
    // duas coisas como se fossem.
    const bloco = chaoDoTelemovel()
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@layer\s+utilities\s*\{/g, "");
    const i = bloco.indexOf("line-height: var(--bo-lh-caption)");
    expect(i).toBeGreaterThan(-1);
    // O selector é tudo o que está entre a chaveta anterior e esta declaração.
    const selector = bloco.slice(bloco.lastIndexOf("}", i) + 1, bloco.lastIndexOf("{", i));
    expect(selector).toContain(`:where(${SELECTOR_ADMIN})`);
    expect(selector).toMatch(/:where\(\s*\.text-/);
    // Nada fora de um `:where()`: nem uma classe, nem um elemento solto.
    //
    // O corte conta os parêntesis em vez de parar no primeiro `)`. Tem de o
    // fazer desde que o selector do back office passou a
    // `:where(body:is(.admin-mode, :has([data-admin-mode])))`: com um regex
    // não-guloso sobravam dois `))` e o teste acusava especificidade que não
    // existe.
    const foraDeWhere = semWhere(selector).trim();
    expect(
      foraDeWhere,
      `sobrou selector fora de :where() — «${foraDeWhere}» — e isso dá-lhe ` +
        "especificidade suficiente para ganhar a um `leading-*` da chamada",
    ).toBe("");
  });

  /**
   * A fronteira dos 1024 px é uma decisão medida e guardada noutro teste: é aí
   * que a lista passa a tabela, e a tabela é densa porque tem de ser. Esta
   * regra não pode escapar-se dela.
   */
  it("não passa dos 1024 px", () => {
    const antes = CSS.slice(0, CSS.indexOf("line-height: var(--bo-lh-caption)"));
    const media = antes.lastIndexOf("@media");
    expect(CSS.slice(media, media + 40)).toContain("max-width: 1023.98px");
  });
});
