import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DUAS SOMBRAS, E NENHUMA DELAS NO CONTEÚDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma análise de craft mediu a apple.com e a pixelmatters.com folha de estilo a
 * folha de estilo e conta, nos dois sites, o mesmo número: **zero** `box-shadow`
 * no conteúdo. A elevação faz-se a mudar a cor da superfície — #F5F5F7 →
 * #FFFFFF na Apple, #000 → #141414 → #1F1F1F na Pixelmatters — e a sombra fica
 * reservada ao que está mesmo por cima da página.
 *
 * O CENSO desta casa, no dia em que este ficheiro nasceu:
 *
 *     39  shadow-sm                              9  shadow-xl
 *     11  shadow-[0_1px_2px_…0.04]               6  shadow-[var(--bo-shadow-sm)]
 *      5  shadow-lg                              5  shadow-md
 *      4  shadow-[0_1px_2px_…0.08]               3  shadow-2xl
 *      1  cada uma de mais sete sombras escritas à mão entre parênteses rectos
 *
 *   90 chamadas, DEZASSEIS valores distintos — e ainda dois tokens em
 *   `globals.css` (`--bo-shadow-sm` e `--bo-shadow`), o segundo dos quais não
 *   tinha um único consumidor.
 *
 * ── O QUE SE APAGOU, E PORQUE É QUE NADA DESAPARECEU ───────────────────────
 *
 * Sessenta e quatro dessas chamadas eram sombra em CONTEÚDO: cartões, painéis,
 * linhas de lista, campos, botões. Foram todas. A pergunta óbvia — «e o que
 * ficava só de pé por causa da sombra?» — respondeu-se a contar:
 *
 *   · 23 das 39 `shadow-sm` tinham `border` na mesma classe. Ficam com o fio.
 *   · as OUTRAS 16 estavam todas em botões de fundo cheio (`bg-[#4d6350]`,
 *     `bg-[#1b2119]`, `bg-[#8a2a22]`, texto branco). Um botão preenchido não
 *     precisa de sombra para se ver: o preenchimento já é o contraste todo.
 *
 * Nenhuma caixa ficou sem forma. E o chão da página passou de branco para
 * `--bo-surface-sunken` (#f7f7f8) — que é o mecanismo da Apple, e é o que faz
 * um cartão branco continuar a ler-se como estando por cima.
 *
 * ── AS DUAS QUE FICARAM ────────────────────────────────────────────────────
 *
 *   SUSPENSA  o que flutua e volta a fechar — menus, avisos, barras coladas ao
 *             fundo, o cartão em arrasto.
 *   MODAL     o que TAPA a página — diálogos, folhas, a gaveta do menu no
 *             telemóvel.
 *
 * ── O QUE ESTE TESTE GUARDA ────────────────────────────────────────────────
 *
 * Que não volta a entrar sombra em conteúdo. Uma `shadow-sm` nova num cartão
 * chumba aqui, com o nome do ficheiro e a linha. Não é gosto: é a diferença
 * entre duas sombras com uma regra e dezasseis que alguém foi escrevendo.
 */

const FICHEIROS = execSync(
  "grep -rl 'shadow' --include=*.tsx --include=*.ts src/app/'[lang]'/'(admin)' | grep -v '\\.test\\.'",
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);

/**
 * As duas do que flutua — e, desde a Fase 02 dos temas, as duas do cartão que
 * se abre (repouso e erguida). Os documentos dela pedem-nas por escrito: «em
 * claro a elevação faz-se por sombra» (Parte 5.3 do `docs/DESIGN-SYSTEM.md`) e,
 * no cartão de tema, «sombra, sem borda», com «borda a marcar elevação» nas
 * proibições (`docs/APPLE-TEMAS.md`, Partes 3 e 9). O que este teste guardava
 * continua guardado: nenhum valor escrito à mão, nenhuma `shadow-sm` solta —
 * só tokens com nome, todos feitos das mesmas tintas (ver o caso de baixo).
 */
const PERMITIDAS = new Set([
  "shadow-[var(--bo-sombra-suspensa)]",
  "shadow-[var(--bo-sombra-modal)]",
  "shadow-[var(--bo-sombra-repouso)]",
  "shadow-[var(--bo-sombra-erguida)]",
  // `shadow-none` é o contrário de uma sombra: é o que desliga a de cima num
  // ponto de quebra onde o elemento deixa de flutuar (a gaveta do menu e o
  // painel de detalhe fazem exactamente isso ao passar para ecrã largo).
  "shadow-none",
]);

/**
 * Uma classe de sombra tal como aparece escrita, com o prefixo de variante se
 * o tiver (`hover:`, `lg:`, `xl:`…). O prefixo não muda a decisão — uma sombra
 * em `hover:` continua a ser uma sombra —, por isso é retirado antes de
 * comparar, mas fica no relatório para o erro dizer onde está.
 */
const SOMBRA = /(?:[a-z@-]+:)*shadow-(?:\[[^\]]*\]|[a-z0-9-]+)/g;

function semComentarios(fonte: string): string {
  // A lição já custou três testes que passavam a olhar para a prosa dos meus
  // próprios comentários: o que se procura é CÓDIGO.
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^\S\n]*\/\/.*$/gm, "");
}

describe("as sombras do back office", () => {
  it("não põe sombra nenhuma em conteúdo — só as duas do que flutua", () => {
    const intrusas: string[] = [];
    for (const ficheiro of FICHEIROS) {
      const linhas = semComentarios(readFileSync(ficheiro, "utf8")).split("\n");
      linhas.forEach((linha, i) => {
        for (const bruta of linha.match(SOMBRA) ?? []) {
          const classe = bruta.replace(/^(?:[a-z@-]+:)+/, "");
          // As de COR (`shadow-black/10`) não elevam nada — só tingem a que já
          // lá está. Não são uma decisão de elevação e não entram na conta.
          if (/^shadow-(?:black|white|foreground|transparent|current)\b/.test(classe)) continue;
          if (PERMITIDAS.has(classe)) continue;
          intrusas.push(`${ficheiro.replace(/^.*admin\//, "")}:${i + 1}  ${bruta}`);
        }
      });
    }
    expect(intrusas).toEqual([]);
  });

  it("define as sombras com nome, e mais nenhuma, em globals.css", () => {
    // O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
    // todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
    // o browser os aplica no back office.
    const css = semComentarios(
      readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8"),
    );
    expect(css).toContain("--bo-sombra-suspensa:");
    expect(css).toContain("--bo-sombra-modal:");
    // As do cartão são feitas das MESMAS tintas: é isso que lhes dá o modo
    // escuro (o `light-dark()` troca as tintas, não a geometria) e o que
    // impede uma família de sombras paralela de nascer ao lado desta.
    for (const nome of ["--bo-sombra-repouso", "--bo-sombra-erguida"]) {
      const m = css.match(new RegExp(`${nome}:([^;]+);`));
      expect(m, `${nome} não existe`).not.toBeNull();
      const camadas = m![1].split(/,(?![^(]*\))/);
      for (const camada of camadas) {
        expect(camada, `${nome} tem uma cor escrita à mão`).toMatch(/var\(--bo-sombra-tinta-\d\)/);
      }
    }
    // Os dois tokens antigos foram-se: um era a sombra de repouso que este
    // bloco apagou, o outro não tinha um único consumidor.
    expect(css).not.toContain("--bo-shadow-sm");
    expect(css).not.toContain("--bo-shadow:");
  });

  it("deixa `.bo-card` e `.bo-input` sem sombra — a moldura é que os desenha", () => {
    // O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
    // todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
    // o browser os aplica no back office.
    const css = semComentarios(
      readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8"),
    );
    for (const nome of [".bo-card", ".bo-input"]) {
      // O bloco da regra, do nome até à chaveta que a fecha.
      const inicio = css.indexOf(`${nome} {`);
      expect(inicio, `${nome} não existe`).toBeGreaterThan(-1);
      const bloco = css.slice(inicio, css.indexOf("}", inicio));
      expect(bloco, `${nome} voltou a ter sombra`).not.toContain("box-shadow");
    }
  });

  /**
   * ── O QUE MUDOU AQUI, E PORQUÊ ──────────────────────────────────────────
   *
   * Este caso exigia que o chão da página NÃO fosse branco, e a razão era boa:
   * sem sombra no conteúdo, o que fazia um cartão ler-se como estando por cima
   * era a área branca sobre o cinzento (#F7F7F8 → #FFFFFF, o mecanismo da
   * Apple) MAIS o fio da moldura.
   *
   * Ela pediu o chão branco — «eu quero branco» —, e isso tira uma das duas
   * metades. A decisão não foi ignorar este teste: foi dar à metade que ficou
   * o peso das duas. O fio subiu um degrau (8% → 10%) e a moldura de um cartão
   * passou a pedir o degrau forte.
   *
   * Por isso o que se guarda deixou de ser a cor do chão e passou a ser a
   * COMPENSAÇÃO. Se alguém puser o fio outra vez fraco, volta-se ao problema
   * que este caso sempre teve medo: branco sobre branco sem nada a separar.
   */
  it("com o chão branco, é o fio que separa — e por isso não pode ser fraco", () => {
    // O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
    // todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
    // o browser os aplica no back office.
    const css =
      readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");

    // O fio de omissão, que serve molduras e separadores.
    const fio = css.match(/--bo-hairline:\s*var\(--bo-tinta-(\d+)\)/);
    expect(fio, "`--bo-hairline` deixou de vir da escala da tinta").not.toBeNull();
    expect(
      Number(fio?.[1]),
      "o fio do back office voltou a ser fraco, e com o chão branco é a única coisa que separa",
    ).toBeGreaterThanOrEqual(10);

    // A moldura de um cartão: o degrau forte, porque é uma fronteira e não um
    // separador.
    const inicio = css.indexOf(".bo-card {");
    expect(inicio, "`.bo-card` desapareceu").toBeGreaterThan(-1);
    const bloco = css.slice(inicio, css.indexOf("}", inicio));
    expect(bloco, "a moldura do cartão deixou de pedir o degrau forte").toContain(
      "--bo-hairline-strong",
    );
  });
});
