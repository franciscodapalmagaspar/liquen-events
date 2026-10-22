import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CHÃO DO PAINEL É BRANCO, E O ENCAIXE CONTINUA A NÃO SER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela, a olhar para a referência: «eu quero branco».
 *
 * O chão do back office era o mesmo cinzento dos encaixes, e um cartão
 * distinguia-se do que estava por baixo por ser branco sobre esse cinzento.
 * Passa a ser branco, e quem separa as coisas passa a ser o FIO.
 *
 * ── O QUE ISTO GUARDA, E PORQUÊ CADA UMA ──────────────────────────────────
 *
 * 1. QUE O CHÃO É BRANCO. Um token só, `--bo-chao`, para não haver duas
 *    respostas à mesma pergunta.
 *
 * 2. QUE O CINZENTO DO ENCAIXE NÃO FOI ARRASTADO ATRÁS. Eram o mesmo valor por
 *    acaso, não por serem a mesma ideia: um `<code>` num ecrã de erro e o
 *    painel afundado do estúdio precisam de tom para se lerem como encaixe.
 *    Branco dentro de branco não é encaixe nenhum. Se alguém «simplificar» os
 *    dois tokens num só, isto reprova.
 *
 * 3. QUE O ESQUELETO E O PAINEL TÊM O MESMO CHÃO. O `loading.tsx` é o que ela
 *    vê primeiro, e é servido antes de o React montar. Se ficasse com o chão
 *    antigo, cada entrada no back office começava cinzenta e saltava para
 *    branca — o mesmo defeito de cor que o `layout.tsx` do grupo `(admin)`
 *    conta por extenso a propósito do menu que piscava.
 */

// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS = readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");
const RAIZ = "src/app/[lang]/(admin)/";

/** Comentários fora, com as linhas de pé. */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

describe("o chão do painel", () => {
  /**
   * ── O CHÃO DEIXOU DE SER BRANCO, E FOI ELA QUE O DECIDIU ────────────────
   *
   * Era branco a pedido dela. Deixou de ser quando esse pedido colidiu com
   * outro: o back office no material da Apple. Vidro só existe se houver o que
   * atravessar, e por trás da coluna da esquerda só está o chão — sobre branco
   * liso, uma superfície translúcida vê-se exactamente como branco.
   *
   * Posta a escolha com as duas metades, ela respondeu «tinta o chão, quero o
   * vidro». O valor é o `--bg-base` do sistema de design que aprovou.
   *
   * E melhorou uma coisa que estava mal e ninguém tinha medido: o cartão branco
   * não se distinguia do chão de todo — 1,000 de contraste, que é a definição
   * de invisível. Quem separava as coisas era só o fio. Agora há fio e degrau
   * (1,065).
   *
   * ── A COINCIDÊNCIA QUE FICA VIGIADA ────────────────────────────────────
   *
   * O chão novo (`#f7f8f7`) fica a UM DÍGITO do cinzento do encaixe
   * (`#f7f7f8`). São ideias diferentes com valores quase iguais — a mesma
   * forma de bifurcação que custou um defeito nesta casa quando dois verdes
   * ficaram a um dígito um do outro.
   *
   * Aqui não é acidente e não é problema: um encaixe dentro de um cartão
   * branco passa a ler-se como um buraco até ao chão, que é o que um encaixe
   * é. Mas os dois tokens continuam a ser DOIS, e o teste seguinte continua a
   * exigir que ninguém os funda «porque são iguais».
   */
  it("é o chão do sistema de design, e continua a ter um nome só", () => {
    expect(
      semComentarios(CSS),
      "`--bo-chao` desapareceu ou deixou de ser o `--bg-base` do sistema",
    ).toMatch(/--bo-chao:\s*#f7f8f7\b/i);
  });

  it("o cinzento do encaixe continua a ser cinzento", () => {
    const css = semComentarios(CSS);
    const m = css.match(/--bo-surface-sunken:\s*(#[0-9a-f]{3,6})/i);
    expect(m, "`--bo-surface-sunken` desapareceu").not.toBeNull();
    const valor = (m?.[1] ?? "").toLowerCase();
    expect(
      ["#fff", "#ffffff"].includes(valor),
      "o cinzento do encaixe passou a branco: um encaixe branco dentro de um cartão branco não é encaixe",
    ).toBe(false);
  });

  it("nenhum ecrã inteiro se pinta com o cinzento do encaixe", () => {
    // Um `min-h-screen` com o tom de encaixe é o chão antigo a voltar por uma
    // porta lateral, num ecrã só — que é pior do que voltar em todos, porque
    // só se vê quando se lá chega.
    const soltos = execSync(`grep -rn "min-h-screen" --include=*.tsx "${RAIZ}" || true`, {
      encoding: "utf8",
    })
      .split("\n")
      .filter((l) => l && !l.includes(".test.") && l.includes("--bo-surface-sunken"));
    expect(soltos, `chão de encaixe em:\n  ${soltos.join("\n  ")}`).toEqual([]);
  });

  it("o esqueleto começa no mesmo chão em que o painel acaba", () => {
    const esqueleto = semComentarios(readFileSync(`${RAIZ}orcamento/admin/loading.tsx`, "utf8"));
    const painel = semComentarios(readFileSync(`${RAIZ}orcamento/admin/AdminClient.tsx`, "utf8"));
    expect(esqueleto, "o esqueleto ficou com outro chão e a entrada passa a piscar").toContain(
      "bg-[var(--bo-chao)]",
    );
    expect(painel, "o painel ficou com outro chão e a entrada passa a piscar").toContain(
      "bg-[var(--bo-chao)]",
    );
  });

  it("e o encaixe continua a ser usado — senão o caso de cima não guarda nada", () => {
    // Controlo positivo: se o token do encaixe deixar de ser usado, guardar o
    // seu valor deixa de querer dizer alguma coisa.
    const usos = execSync(`grep -rn "bo-surface-sunken" --include=*.tsx "${RAIZ}" || true`, {
      encoding: "utf8",
    })
      .split("\n")
      .filter((l) => l && !l.includes(".test.")).length;
    expect(usos).toBeGreaterThan(0);
  });
});
