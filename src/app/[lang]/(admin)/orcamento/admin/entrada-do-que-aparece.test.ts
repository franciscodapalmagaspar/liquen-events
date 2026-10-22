import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE APARECE, APARECE DE ALGUM SÍTIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «em termos de design e animações ou seja coisas a olho nu não
 * vi mesmo diferenças nenhumas».
 *
 * O CENSO. Contei os sinais de entrada — uma deslocação, uma opacidade a subir,
 * uma transição à montagem — nos nove sítios do back office que APARECEM por
 * cima da página. Oito dos nove não tinham nenhum: piscavam para lá de existir.
 * O nono, o aviso, deslocava-se 12 px.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * E DEPOIS ELA OLHOU OUTRA VEZ: «NÃO VEJO QUE HÁ ANIMAÇÕES EM TUDO»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A primeira versão deste ficheiro chamava-se «desloca QUATRO píxeis, e não
 * mais», e cumpria o que prometia. O problema é que cumpria bem demais: quatro
 * píxeis num telemóvel são a espessura de um cabelo, e a resposta dela a quatro
 * rondas de trabalho foi «não vejo que há animações em tudo de forma a tornar o
 * back office algo incrível».
 *
 * O que mudou entretanto, e que justifica gastar a margem: o
 * `e2e/60-fotogramas-no-telemovel.mjs` mediu estas animações com o CPU travado
 * 4× e 6× e deu **zero** fotogramas perdidos, zero layouts e zero recálculos de
 * estilo nas que são só `transform`/`opacity`. Havia folga e estava a ser gasta
 * em prudência.
 *
 * A escada de proporções mantém-se — rótulo < aviso/folha < cena < página —, e
 * o topo, que já se via, não se mexeu:
 *
 *     um item de menu      10 px   (eram 4)
 *     um aviso / folha     18 px   (eram 8)
 *     uma cena             28 px   (eram 12)
 *     uma página inteira   32 px   (o tecto, inalterado)
 *
 * Os números vivem UMA vez, no `:root` do `globals.css`
 * (`--bo-percurso-rotulo`, `--bo-percurso-folha`, `--bo-percurso-cena`), pela
 * mesma razão por que os cinzentos vivem numa escada e não em quarenta e sete
 * grafias. Este ficheiro prende a escada, e não cada sítio onde ela é usada.
 *
 * «O movimento serve para indicar direcção e origem, não para chamar atenção.»
 * E a curva não é qualquer uma: quando é o SISTEMA que apresenta — que é o caso
 * de tudo o que está nesta lista — a curva SÓ DESACELERA,
 * `cubic-bezier(0, 0, 0.2, 1)`. A única excepção é a caixa que o UTILIZADOR
 * convocou, que passou a chegar com mola; está guardada mais abaixo, e o
 * argumento inteiro está no `movimento-da-casa.test.ts`.
 *
 * MEDIDO na aplicação a correr (Web Animations API, geometria em t=0 e em
 * t=fim, 390×844 e 1440×900), antes e depois:
 *
 *                        antes            depois
 *     .bo-entrada        4 px, sem escala   10 px, sem escala
 *     .bo-entrada-folha  8 px, sem escala   18 px + 3% de escala
 *     .view-in           8 px               18 px
 *     .bo-cena          12 px               28 px
 *
 * E os dois tamanhos de ecrã dão o MESMO percurso, de propósito: o píxel de CSS
 * é uma medida angular, não uma medida do écran. O que difere entre 390 e 1440
 * é o tamanho do objecto, e essa metade é a escala que a carrega.
 *
 * ── PORQUE É QUE ISTO NÃO ATRASA NADA ────────────────────────────────────
 *
 * Regra dela: «nenhuma animação pode atrasar uma tarefa». O elemento está no
 * sítio e clicável desde o primeiro fotograma — só lá chega com dez píxeis de
 * deslocação, e os 240 ms não mudaram. Só `transform`, `opacity` e `scale`, que
 * é o que o telemóvel compõe a 60 fps sem tocar no layout, e
 * `prefers-reduced-motion` desliga tudo.
 */

// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS = readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");
const RAIZ = "src/app/[lang]/(admin)/orcamento/admin/";

/** Os nove que aparecem por cima da página. Um décimo entra aqui à mão. */
const APARECEM = [
  "ui/MenuDeAccoes.tsx",
  "ui/Ajuda.tsx",
  "ui/FolhaOuDialogo.tsx",
  "MoreMenu.tsx",
  "ModelosParciais.tsx",
  "CommandPalette.tsx",
  "GuardarTudo.tsx",
  "RichEmailEditor.tsx",
];

function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

describe("a entrada do que aparece por cima da página", () => {
  it("a escada do percurso tem os três degraus, e por esta ordem", () => {
    const css = semComentarios(CSS);
    // Os números vivem UMA vez. Um degrau novo escrito à mão noutro sítio não
    // aparece aqui — aparece na leitura, quando duas coisas iguais se movem
    // distâncias diferentes.
    expect(css).toContain("--bo-percurso-rotulo: 10px");
    expect(css).toContain("--bo-percurso-folha: 18px");
    expect(css).toContain("--bo-percurso-cena: 28px");

    const px = (nome: string) =>
      Number(
        /(\d+)px/.exec(
          /:\s*(\d+px)/.exec(css.slice(css.indexOf(`--bo-percurso-${nome}:`)))![1],
        )![1],
      );
    const [rotulo, folha, cena] = ["rotulo", "folha", "cena"].map(px);
    // A ESCADA. É ela que faz isto parecer um sistema e não três números.
    expect(rotulo, "um rótulo passou a andar tanto como um aviso").toBeLessThan(folha);
    expect(folha, "uma folha passou a andar tanto como uma cena").toBeLessThan(cena);
    // E o tecto: 32 px são de uma PÁGINA inteira a apresentar-se, e uma cena
    // dentro de uma página não é a página.
    expect(cena, "a cena passou o tecto reservado a uma página inteira").toBeLessThan(32);
    // E o chão: abaixo disto não se vê, que é o defeito que isto veio tirar.
    expect(rotulo, "voltámos aos píxeis que não se viam").toBeGreaterThanOrEqual(10);
  });

  it("desloca DEZ píxeis, e a folha dezoito", () => {
    const css = semComentarios(CSS);
    expect(css).toContain("@keyframes bo-entrada");
    // O degrau vem da escada, não de um número escrito aqui: é isso que impede
    // que afinar a escada deixe esta entrada para trás.
    expect(css).toMatch(
      /transform:\s*translateY\(var\(--bo-entrada-y,\s*calc\(-1 \* var\(--bo-percurso-rotulo\)\)\)\)/,
    );
    // A folha do telemóvel sobe de baixo, e é a distância de um aviso.
    expect(css).toMatch(/\.bo-entrada-folha\s*\{[^}]*--bo-entrada-y:\s*var\(--bo-percurso-folha\)/);
  });

  /**
   * ── A ESCALA, E PORQUE É QUE ELA NÃO É DE TODA A GENTE ────────────────────
   *
   * Um percurso é absoluto: dez píxeis são dez píxeis num menu de 65 px e numa
   * folha de 390 px. Era por isso que uma caixa grande a andar oito píxeis não
   * se via — medido, a folha do telemóvel mede 390×743 e oito píxeis são 1,1%
   * dela.
   *
   * A escala é proporcional por construção, e é essa a sua virtude. Medida:
   *
   *     folha do telemóvel   390×743  →  5,9 px e 11,1 px de bordo
   *     diálogo do portátil  672×736  →  10,1 px e 11,0 px de bordo
   *     aviso de campo        65×19   →  1,0 px e  0,3 px  — nada
   *
   * A última linha é a que decide: num objecto pequeno a escala não vale nada.
   * Por isso ela é só das CAIXAS que o utilizador convocou, e o valor por
   * omissão da variável é 1 — ou seja, nenhuma.
   */
  it("a escala vem pelo NOME da propriedade, e por omissão não existe", () => {
    const css = semComentarios(CSS);
    // No Tailwind v4 e em CSS puro, `scale` é propriedade AUTÓNOMA: não é
    // `transform`, não entra numa lista `transition-[…,transform]`, e não se
    // anima escrevendo `transform: scale(…)`. Já tropeçámos nisto duas vezes.
    expect(css).toMatch(
      /@keyframes bo-entrada\s*\{[\s\S]*?scale:\s*var\(--bo-entrada-escala,\s*1\)/,
    );
    expect(css).toMatch(/@keyframes bo-entrada[\s\S]*?to\s*\{[^}]*scale:\s*1/);
  });

  it("e é a caixa convocada que a leva — a folha e o diálogo modal", () => {
    const css = semComentarios(CSS);
    const i = css.indexOf(".bo-entrada-folha:not(");
    expect(i, "a regra da caixa convocada desapareceu").toBeGreaterThan(-1);
    const regra = css.slice(i, css.indexOf("}", i));
    // O diálogo do computador não tem classe própria — vai-se buscar pela
    // semântica, e a filho DIRECTO: um aviso de campo lá dentro também usa a
    // `.bo-entrada`, e um aviso a saltitar dentro de uma caixa que já chegou
    // é ruído.
    expect(regra).toContain('.bo-entrada[aria-modal="true"]:not(.bo-entrada-fundo)');
    // E quem declara a sua própria distância no `style` fica de fora: a gaveta
    // do pedido é `fixed inset-y-0` e uma caixa de sangria inteira a encolher
    // mostra o que devia tapar. A medição está no `e2e/entrada-da-gaveta.mjs`.
    expect(regra).toContain(':not([style*="--bo-entrada-y"])');
    expect(regra).toContain("--bo-entrada-escala: var(--bo-escala-chegada)");
    expect(css).toContain("--bo-escala-chegada: 0.97");
  });

  it("um fundo não encolhe — mostraria o ecrã à volta dele", () => {
    const css = semComentarios(CSS);
    // O véu é IRMÃO da caixa dentro da mesma moldura `aria-modal`. Sem o
    // `:not`, encolhia com ela e abria uma fresta em toda a volta.
    expect(css).toContain(":not(.bo-entrada-fundo)");
    expect(css).toMatch(/\.bo-entrada-fundo\s*\{[^}]*--bo-entrada-y:\s*0px/);
  });

  /**
   * ── E A CENA E A TROCA DE VISTA NÃO LEVAM ESCALA, DE PROPÓSITO ────────────
   *
   * Não é esquecimento nem prudência: foi medido o que estas duas classes
   * cobrem. Na aplicação a correr, os nós com `.bo-cena` numa vista vão de
   * 36 px a 9 823 px de altura, e o nó com `.view-in` mede 1 184×3 331 px no
   * computador e 390×9 980 px no telemóvel. São INVÓLUCROS, não caixas.
   *
   * Três por cento de escala num invólucro de 3 024 px são 45 px de bordo a
   * mexer-se, com o centro de transformação fora do ecrã: não é uma caixa a
   * ganhar presença, é a página a fazer zoom. A escala fica onde o objecto tem
   * um tecto de altura por construção (`max-h-[88dvh]`), que são as caixas.
   */
  it("nem a cena nem a troca de vista escalam — são invólucros, não caixas", () => {
    const css = semComentarios(CSS);
    const cena = css.slice(css.indexOf("@keyframes bo-cena"));
    expect(cena.slice(0, cena.indexOf("\n}")), "a `.bo-cena` ganhou escala").not.toMatch(
      /\bscale:/,
    );
    const vista = css.slice(css.indexOf("@keyframes view-in"));
    expect(vista.slice(0, vista.indexOf("\n}")), "a `.view-in` ganhou escala").not.toMatch(
      /\bscale:/,
    );
  });

  it("dura 240 ms e a curva só desacelera — é o sistema que apresenta", () => {
    const css = semComentarios(CSS);
    expect(css).toMatch(
      /\.bo-entrada\s*\{\s*animation:\s*bo-entrada 240ms cubic-bezier\(0, 0, 0\.2, 1\)/,
    );
    // Nenhuma curva com salto ou recuo: um valor fora de 0–1 no eixo do tempo
    // ou uma saída acima de 1 é overshoot, e os dois sites medidos têm zero.
    const curva = /cubic-bezier\(\s*0,\s*0,\s*0\.2,\s*1\s*\)/;
    expect(curva.test(css)).toBe(true);
  });

  it("desliga-se para quem pediu menos movimento", () => {
    const css = semComentarios(CSS);
    const i = css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf(".bo-entrada {"));
    expect(i).toBeGreaterThan(-1);
    expect(css.slice(i, i + 160)).toMatch(/\.bo-entrada\s*\{\s*animation:\s*none/);
  });

  it("e todos os nove a usam — um menu novo sem entrada chumba aqui", () => {
    const sem = APARECEM.filter(
      (f) => !semComentarios(readFileSync(RAIZ + f, "utf8")).includes("bo-entrada"),
    );
    expect(sem).toEqual([]);
  });

  it("a troca de vista usa o MESMO número e a MESMA curva", () => {
    // A análise escreve «06 · trocas de secção SEM TRANSIÇÃO». Sobre esta casa
    // está errada: havia transição e corria — MEDIDO, 0,4 s com
    // `cubic-bezier(0.16, 1, 0.3, 1)`, a 3,39 px e 0,577 de opacidade aos
    // 60 ms. O que estava desalinhado era o número: 400 ms hesita entre as
    // duas bandas da regra 1 (200–320 para estados, 600–1500 para
    // apresentações), e «se uma animação hesitar entre as duas, está no sítio
    // errado».
    const css = semComentarios(CSS);
    expect(css).toMatch(
      /\.view-in\s*\{[^}]*animation:\s*view-in 240ms cubic-bezier\(0, 0, 0\.2, 1\) backwards/,
    );
    // A troca de vista fica no degrau da FOLHA (18 px). Os 32 px continuam a
    // ser de uma PÁGINA inteira, e aqui o cromado não sai do sítio — muda o
    // conteúdo dentro dele. Eram 8, e oito não se viam.
    expect(css).toMatch(/@keyframes view-in\s*\{[^}]*translateY\(var\(--bo-percurso-folha\)\)/);
  });

  it("o aviso desloca oito, que é a distância de um aviso", () => {
    // `translate-y-2` = 0.5rem = 8 px. Eram 12 (`translate-y-3`).
    const toast = semComentarios(readFileSync(RAIZ + "Toast.tsx", "utf8"));
    expect(toast).toContain('"opacity-0 translate-y-2"');
    expect(toast).not.toContain("translate-y-3");
  });
});
