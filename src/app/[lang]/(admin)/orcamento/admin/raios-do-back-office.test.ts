import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * O SELECTOR COM QUE O BACK OFFICE SE PINTA.
 *
 * Deixou de ser só `body.admin-mode`: a classe entra num efeito e chegava
 * tarde de mais para o primeiro pixel. Agora é
 * `body:is(.admin-mode, :has([data-admin-mode]))`, com o atributo servido pelo
 * `layout.tsx` do grupo `(admin)`. A razão por extenso está no `globals.css`.
 */
const SELECTOR_ADMIN = "body:is(.admin-mode, :has([data-admin-mode]))";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM RAIO PARA CONTEÚDO, OUTRO PARA ACÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O CENSO, no dia em que este ficheiro nasceu — 664 chamadas, NOVE valores:
 *
 *     164  rounded-xl (12 px)      42  rounded (4 px)
 *     157  rounded-full            8   rounded-sm (4 px)
 *     140  rounded-lg (8 px)       6   rounded-none
 *     84   rounded-md (6 px)       3   rounded-t-2xl
 *     60   rounded-2xl (16 px)
 *
 * Nove valores é o mesmo que valor nenhum: um cartão a 16, o painel ao lado a
 * 12 e o campo lá dentro a 8 não são uma hierarquia — são três pessoas a
 * escrever a mesma coisa em três dias diferentes.
 *
 * A análise mediu os dois sites de referência e ambos têm DOIS. A Apple:
 * `border-radius: 980px` em 33 elementos («os botões são TODOS pílulas») e
 * raio ZERO nos tiles e nas imagens. A Pixelmatters: 8 px em cartões e
 * imagens, 32 px (pílula) em botões e navegação. A regra é a mesma nos dois —
 * «o raio máximo está reservado ao elemento clicável».
 *
 * Aqui:  CONTEÚDO 8 px  ·  ACÇÃO pílula.
 *
 * ── AS TRÊS COISAS QUE ESTE TESTE GUARDA ──────────────────────────────────
 *
 * 1. Que a escala continua colapsada NUM sítio. No Tailwind v4 o `.rounded-lg`
 *    compila para `border-radius: var(--radius-lg)`, e é por isso que 456
 *    chamadas mudam de valor sem se tocar num ficheiro de ecrã.
 * 2. Que os dois primitivos da acção — `ui/Button.tsx` e `ui/Segmented.tsx` —
 *    continuam em pílula. Uma linha do primeiro vale 151 botões.
 * 3. Que nenhum botão de FUNDO CHEIO volta a ter o canto do cartão onde
 *    assenta. São 23 escritos à mão fora do primitivo, e é exactamente aí que
 *    a distinção se perde sem ninguém dar por ela.
 *
 * ── O QUE ELE NÃO GUARDA, DE PROPÓSITO ────────────────────────────────────
 *
 * O `rounded` seco, 4 px, 42 chamadas. Fui vê-las uma a uma: são TODAS
 * miudezas com menos de 20 px de altura — teclas de atalho («⌘K»), pegas de
 * arrasto de 4×4, etiquetas de 9 px em maiúsculas, barras do esqueleto,
 * miniaturas de 9×9. A 8 px, uma etiqueta de 16 px fica quase pílula e uma
 * miniatura de 9 px fica quase círculo: o raio deixa de ser proporção e passa
 * a ser deformação. É um terceiro valor, e digo-o — a própria Apple, além da
 * pílula, tem «5, 6, 8 e 14 px em casos pontuais». A regra que este ficheiro
 * fecha é a das SUPERFÍCIES e dos CONTROLOS.
 */

// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS = readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");
const RAIZ = "src/app/[lang]/(admin)/orcamento/admin/";

/**
 * A lição já custou três testes que passavam a olhar para a minha prosa.
 *
 * As linhas SOBREVIVEM: um comentário de bloco é substituído pelas suas
 * próprias mudanças de linha, e não por nada. Sem isto, o número de linha que
 * o erro aponta é o do ficheiro encolhido — e mandar alguém à linha 3608 de um
 * ficheiro onde ela está na 3690 é pior do que não dar linha nenhuma.
 */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

/** O bloco de uma regra, do selector até à chaveta que a fecha. */
function bloco(selector: string): string {
  const css = semComentarios(CSS);
  const i = css.indexOf(`${selector} {`);
  expect(i, `não encontrei a regra \`${selector}\``).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf("\n}", i));
}

describe("os raios do back office", () => {
  /**
   * ── E A ESCADA VOLTOU, MAS COM UMA CONTA POR TRÁS ────────────────────────
   *
   * Este caso exigia os cinco degraus todos em `0.5rem`, e a razão estava
   * certa para o dia em que nasceu: o censo tinha achado NOVE valores, o que é
   * o mesmo que valor nenhum. Colapsar tudo num só tirou o ruído.
   *
   * A Parte 3.7 do `docs/DESIGN-SYSTEM.md` traz a peça que faltava — e não é
   * uma escala nova, é uma REGRA que gera a escala:
   *
   *     raio_interior = raio_do_container − distância_entre_os_cantos
   *
   * A diferença face aos nove valores de então é que estes CASAM: uma folha a
   * 26 com 8 de folga dá cartões a 18; um cartão a 16 com 12 de folga dá
   * controlos a 4 — e é aí que se percebe que a folga é grande de mais.
   * Nenhuma dessas leituras existe com um valor único.
   *
   * O que este caso passa a guardar não é «um valor», é que os cinco degraus
   * estão declarados NO MESMO SÍTIO (para as 456 chamadas mudarem juntas), que
   * sobem sem nunca descer, e que os degraus do meio são o mesmo — porque um
   * controlo é um controlo, quer se escreva `rounded-md` ou `rounded-lg`.
   *
   * A segunda metade da regra antiga fica intacta e continua guardada aqui em
   * baixo: a pílula é da ACÇÃO, e só dela.
   */
  it("declara a escada concêntrica num sítio só, e no primeiro pixel", () => {
    // `body:has([data-admin-mode])` e NÃO `body.admin-mode`: a classe só entra
    // num efeito, e um raio que muda depois do primeiro desenho é o mesmo
    // piscar que o `data-admin-mode` veio cá tirar.
    const b = bloco("body:has([data-admin-mode])");

    const rem = (degrau: string): number => {
      const m = b.match(new RegExp(`--radius-${degrau}:\\s*([\\d.]+)rem;`));
      expect(m, `--radius-${degrau} não está declarado no bloco do back office`).not.toBeNull();
      return Number(m![1]);
    };

    const escada = ["sm", "md", "lg", "xl", "2xl"].map(rem);
    // Sobe, e nunca desce. Um degrau menor do que o anterior é a hierarquia ao
    // contrário — um cartão mais redondo do que o painel que o contém.
    for (let i = 1; i < escada.length; i += 1) {
      expect(
        escada[i],
        `a escada desce entre o degrau ${i - 1} e o ${i}: ${escada[i - 1]} → ${escada[i]}`,
      ).toBeGreaterThanOrEqual(escada[i - 1]);
    }

    // `md` e `lg` são o mesmo degrau — o do CONTROLO. Dois nomes para a mesma
    // coisa é o que se quer aqui: quem escreve `rounded-md` num campo e
    // `rounded-lg` noutro não está a pedir dois raios, está a escrever o mesmo
    // de duas maneiras.
    expect(rem("md"), "`md` e `lg` deixaram de ser o mesmo degrau (o do controlo)").toBe(rem("lg"));

    // E os extremos são os do documento: 6 px no distintivo, 20 px no painel.
    expect(rem("sm") * 16, "o degrau do distintivo saiu dos 6 px").toBe(6);
    expect(rem("2xl") * 16, "o degrau do painel saiu dos 20 px").toBe(20);
  });

  /**
   * A CONTA DA CONCENTRICIDADE, ESCRITA UMA VEZ SÓ NO CSS.
   *
   * `max(0px, …)` não é defensivo: é a segunda metade da regra do documento
   * («se raio_interior < 0 → 0»). Sem ele, um filho com folga maior do que o
   * raio do pai pede um `border-radius` negativo — que o browser ignora em
   * silêncio, e o canto fica a 90° sem ninguém perceber porquê.
   */
  it("tem o filho concêntrico, com o chão a zero", () => {
    // O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
    // todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
    // o browser os aplica no back office.
    const css =
      readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");
    const m = css.match(/\.bo-concentrico\s*\{([^}]*)\}/);
    expect(m, "a classe `.bo-concentrico` desapareceu").not.toBeNull();
    const corpo = m![1];
    expect(corpo, "a conta da concentricidade deixou de subtrair a folga do pai").toMatch(
      /calc\(\s*var\(--pai-raio[^)]*\)\s*-\s*var\(--pai-folga/,
    );
    expect(corpo, "o chão a zero saiu — um raio negativo é ignorado em silêncio").toContain(
      "max(0px",
    );
  });

  it("põe os três tokens próprios no mesmo valor", () => {
    const b = bloco(SELECTOR_ADMIN);
    for (const nome of ["--bo-radius-sm", "--bo-radius", "--bo-radius-lg"]) {
      expect(b, `${nome} saiu dos 8 px`).toContain(`${nome}: 0.5rem;`);
    }
  });

  it("deixa a pílula nos dois primitivos que servem a acção", () => {
    const botao = semComentarios(readFileSync(`${RAIZ}ui/Button.tsx`, "utf8"));
    expect(botao, "o primitivo Button deixou de ser pílula").toMatch(/\brounded-full\b/);
    expect(botao, "o primitivo Button voltou a ter o canto do cartão").not.toMatch(
      /\brounded-(?:sm|md|lg|xl|2xl)\b/,
    );
    const seg = semComentarios(readFileSync(`${RAIZ}ui/Segmented.tsx`, "utf8"));
    expect(seg.match(/\brounded-full\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(seg).not.toMatch(/\brounded-(?:sm|md|lg|xl|2xl)\b/);
  });

  it("não deixa um botão de fundo cheio com o canto do cartão", () => {
    // O fundo cheio é o que faz de um elemento uma ACÇÃO e não uma superfície:
    // as três tintas da casa com texto branco por cima. Fora do primitivo há
    // 23 escritos à mão, e é aí que a regra se perde em silêncio.
    const ficheiros = execSync(
      "grep -rl --include=*.tsx -e 'bg-\\[#1b2119\\]' -e 'bg-\\[#4d6350\\]' -e 'bg-\\[#8a2a22\\]' " +
        "src/app/'[lang]'/'(admin)' || true",
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((f) => !f.includes(".test."));

    const CHEIO = /bg-\[#(?:1b2119|4d6350|8a2a22)\]/;
    const BRANCO = /\btext-white\b|\btext-white\//;
    const CANTO = /\brounded-(?:sm|md|lg|xl|2xl)\b/;
    const culpados: string[] = [];
    for (const f of ficheiros) {
      semComentarios(readFileSync(f, "utf8"))
        .split("\n")
        .forEach((linha, i) => {
          if (CHEIO.test(linha) && BRANCO.test(linha) && CANTO.test(linha)) {
            culpados.push(`${f.replace(/^.*admin\//, "")}:${i + 1}  ${CANTO.exec(linha)?.[0]}`);
          }
        });
    }
    expect(culpados).toEqual([]);
  });
});
