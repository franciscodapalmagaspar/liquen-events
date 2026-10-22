// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ToastProvider, useToast } from "./Toast";
import { SAIDA_MS } from "./ui/saida";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O AVISO GANHA SAÍDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O `Toast` entrava com 240 ms de animação e saía num fotograma: desaparecia do
 * array, e os avisos que ficavam mudavam de sítio de repente. Estava escrito
 * como dívida e tinha duas razões concretas — animar a altura é layout a cada
 * fotograma, e uma caixa a desvanecer-se por cima da barra de acção do estúdio
 * continua a comer os toques do botão «Gerar e enviar».
 *
 * Este ficheiro guarda as duas. A SEGUNDA tem teste só para ela, e é a que
 * interessa mais: é a que decide se a proposta chega a ser enviada.
 *
 * Porque é que a geometria não está aqui: o jsdom não tem layout, e todo o
 * `getBoundingClientRect` dá zero. O deslize dos irmãos foi MEDIDO num
 * Chromium a sério — o instrumento é o `e2e/saida-do-aviso.mjs`, corre com
 * `node e2e/saida-do-aviso.mjs` e conta os recálculos de layout do browser.
 * O que se pode prender aqui é o CICLO DE VIDA (o nó fica montado a sair) e o
 * VOCABULÁRIO (a classe certa, no primeiro fotograma), e é isso que está.
 */

function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

function Disparador({ quantos = 1 }: { quantos?: number }) {
  const { toast } = useToast();
  return (
    <button
      onClick={() => {
        for (let i = 1; i <= quantos; i++) toast(`Aviso ${i}`, "info");
      }}
    >
      disparar
    </button>
  );
}

/** A caixa do aviso é o pai do parágrafo com a mensagem. */
function caixaDe(texto: string): HTMLElement {
  const p = screen.getByText(texto);
  if (!p.parentElement) throw new Error("o aviso não tem caixa");
  return p.parentElement;
}

function avancar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function dispararUm() {
  render(
    <ToastProvider>
      <Disparador />
    </ToastProvider>,
  );
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "disparar" }));
  });
  // Um fotograma para a ENTRADA assentar, senão o aviso está a entrar e a sair
  // ao mesmo tempo e o que se mede deixa de ser uma coisa só.
  avancar(20);
}

function fechar() {
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
  });
}

describe("a saída do aviso", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("segura o aviso montado a sair — não desaparece no fotograma", () => {
    dispararUm();
    fechar();

    // O ponto todo: a seguir ao clique o aviso AINDA está no ecrã. Antes disto
    // saía do array no mesmo instante e não havia nada para animar.
    expect(screen.queryByText("Aviso 1")).not.toBeNull();

    // E continua montado até ao último fotograma da saída.
    avancar(SAIDA_MS - 20);
    expect(screen.queryByText("Aviso 1")).not.toBeNull();

    avancar(40);
    expect(screen.queryByText("Aviso 1")).toBeNull();
  });

  it("sai com a palavra da casa — `.bo-saida`, e já não com a transição de entrada", () => {
    dispararUm();
    const caixa = caixaDe("Aviso 1");
    expect(caixa.className).toContain("motion-safe:transition-[opacity,translate]");

    fechar();

    expect(caixa.className).toContain("bo-saida");
    // Oito píxeis, que é a distância de um aviso — a variante, não o valor por
    // omissão de quatro.
    expect(caixa.className).toContain("bo-saida-folha");
    // E a transição da entrada larga o elemento: duas maneiras de animar a
    // mesma opacidade ao mesmo tempo é como se pede um gesto sujo.
    expect(caixa.className).not.toContain("motion-safe:transition-[opacity,translate]");
  });

  it("também quando é o relógio dos 4 s a fechá-lo, e não o botão", () => {
    dispararUm();
    const caixa = caixaDe("Aviso 1");

    avancar(4000);
    expect(screen.queryByText("Aviso 1")).not.toBeNull();
    expect(caixa.className).toContain("bo-saida");

    avancar(SAIDA_MS + 20);
    expect(screen.queryByText("Aviso 1")).toBeNull();
  });

  it("e os avisos que ficam não são levados com ele", () => {
    render(
      <ToastProvider>
        <Disparador quantos={3} />
      </ToastProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "disparar" }));
    });
    avancar(20);

    const botoes = screen.getAllByRole("button", { name: "Fechar" });
    act(() => {
      fireEvent.click(botoes[1]);
    });

    // O do meio sai; os outros dois ficam, e ficam montados e clicáveis.
    avancar(SAIDA_MS + 20);
    expect(screen.queryByText("Aviso 2")).toBeNull();
    expect(screen.queryByText("Aviso 1")).not.toBeNull();
    expect(screen.queryByText("Aviso 3")).not.toBeNull();
    expect(caixaDe("Aviso 1").className).toContain("pointer-events-auto");
    expect(caixaDe("Aviso 3").className).toContain("pointer-events-auto");
  });
});

/**
 * ── E ESTE É O TESTE QUE IMPEDE UMA PROPOSTA DE NÃO SER ENVIADA ────────────
 *
 * A pilha de avisos pousa em cima da barra de acção do estúdio de propostas
 * (`--bo-barra-accao`). Um aviso a desvanecer-se por cima do botão «Gerar e
 * enviar» continua a ser o alvo do toque enquanto lá estiver: ela carrega, e
 * não acontece nada — durante toda a saída, e sem sinal nenhum de porquê. Foi
 * por causa deste risco que a saída ficou por fazer da primeira vez.
 *
 * Por isso o `pointer-events` não se larga quando a animação acaba, nem num
 * `setTimeout`, nem num `requestAnimationFrame`: larga-se no MESMO commit do
 * React que marca o aviso como «a sair», antes de o browser pintar o primeiro
 * fotograma. Este teste não avança um único milissegundo depois do clique — é
 * essa a sua razão de ser, e é o que o faz falhar se alguém adiar a largada
 * um fotograma que seja.
 */
describe("os `pointer-events` largam-se no primeiro fotograma da saída", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("no instante do clique, e não quando a animação acaba", () => {
    dispararUm();
    const caixa = caixaDe("Aviso 1");
    expect(caixa.className).toContain("pointer-events-auto");

    fechar();

    // NADA de `advanceTimersByTime` aqui. É o primeiro fotograma.
    expect(caixa.className).toContain("pointer-events-none");
    expect(caixa.className).not.toContain("pointer-events-auto");

    // E o perigo continua no ecrã: se já não estivesse montado, este teste não
    // estaria a medir coisa nenhuma.
    expect(caixa.isConnected).toBe(true);
  });

  it("e o mesmo quando quem fecha é o relógio dos 4 s", () => {
    dispararUm();
    const caixa = caixaDe("Aviso 1");

    avancar(4000);

    expect(caixa.className).toContain("pointer-events-none");
    expect(caixa.isConnected).toBe(true);
  });

  it("a classe da casa traz a mesma regra, para quem a usar noutro sítio", () => {
    // O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
    // todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
    // o browser os aplica no back office.
    const css = semComentarios(
      readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8") +
        readFileSync(join(process.cwd(), "src/app/admin.css"), "utf8"),
    );
    const regra = /\.bo-saida\s*\{([^}]*)\}/.exec(css);
    expect(regra, "a regra `.bo-saida` desapareceu do globals.css").not.toBeNull();
    expect(regra![1]).toMatch(/pointer-events:\s*none/);
  });
});

/**
 * ── O VOCABULÁRIO, E NÃO SÓ ESTE AVISO ────────────────────────────────────
 *
 * A saída nasceu aqui mas não é daqui: o mesmo buraco está em todas as folhas
 * e diálogos do back office. Estes testes prendem a palavra do lado do CSS ao
 * lado do JavaScript, para as duas pontas não poderem afinar-se sozinhas — a
 * mesma rede que o `duracoes-da-casa.test.ts` já põe à entrada.
 */
describe("a `.bo-saida` é vocabulário da casa", () => {
  // O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
  // todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
  // o browser os aplica no back office.
  const css = semComentarios(
    readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8") +
      readFileSync(join(process.cwd(), "src/app/admin.css"), "utf8"),
  );

  it("dura o que o `SAIDA_MS` diz, e menos do que a entrada", () => {
    const saida = /\.bo-saida\s*\{\s*animation:\s*bo-saida (\d+)ms/.exec(css);
    expect(saida, "a regra `.bo-saida` desapareceu do globals.css").not.toBeNull();
    expect(Number(saida![1])).toBe(SAIDA_MS);

    const entrada = /\.bo-entrada\s*\{\s*animation:\s*bo-entrada (\d+)ms/.exec(css);
    expect(entrada).not.toBeNull();
    // Quem chega apresenta-se; quem se vai embora não.
    expect(Number(saida![1])).toBeLessThan(Number(entrada![1]));
    // E continua dentro da banda dos estados (200–320 ms): mais curta do que
    // isto lê-se como um corte, não como uma saída.
    expect(Number(saida![1])).toBeGreaterThanOrEqual(200);
  });

  it("e usa a curva de quem SAI, que a casa já tinha declarada", () => {
    expect(css).toMatch(/\.bo-saida\s*\{\s*animation:\s*bo-saida \d+ms var\(--ease-in\)/);
    expect(css).toMatch(/--ease-in:\s*cubic-bezier\(0\.4, 0, 1, 1\)/);
  });

  it("sai pelo sítio por onde entrou — os mesmos números da `.bo-entrada`", () => {
    // Desde que a escada do percurso subiu (10 / 18 / 28 px), os dois lados
    // deixaram de ter o número escrito e passaram a ler o mesmo degrau. É mais
    // forte do que comparar dois literais: agora não podem divergir, em vez de
    // divergirem e serem apanhados.
    const saida =
      /@keyframes bo-saida\s*\{[\s\S]*?translateY\(var\(--bo-saida-y,\s*([^)]+\)\))\)/.exec(css);
    const entrada =
      /@keyframes bo-entrada\s*\{[\s\S]*?translateY\(var\(--bo-entrada-y,\s*([^)]+\)\))\)/.exec(
        css,
      );
    expect(saida, "a `@keyframes bo-saida` deixou de ler o degrau da escada").not.toBeNull();
    expect(entrada).not.toBeNull();
    expect(saida![1]).toBe(entrada![1]);
    expect(saida![1]).toContain("--bo-percurso-rotulo");

    // E as variantes espelham-se uma a uma: o degrau da folha para uma folha
    // ou um aviso, 0 px para um fundo, que não vem nem vai a sítio nenhum.
    expect(css).toMatch(/\.bo-saida-folha\s*\{\s*--bo-saida-y:\s*var\(--bo-percurso-folha\)/);
    expect(css).toMatch(/\.bo-entrada-folha\s*\{\s*--bo-entrada-y:\s*var\(--bo-percurso-folha\)/);
    expect(css).toMatch(/\.bo-saida-fundo\s*\{\s*--bo-saida-y:\s*0px/);
  });

  /**
   * ── E O QUE NÃO ESPELHA, E PORQUÊ ──────────────────────────────────────────
   *
   * A entrada de uma caixa convocada ganhou ESCALA e MOLA. A saída não ganhou
   * nenhuma das duas, e isso é uma decisão, não um esquecimento — este caso
   * existe para que ninguém a «complete» por simetria.
   *
   * A regra que a casa já tinha escrita para a duração (240 vs 200) e para a
   * curva (`--ease-out` vs `--ease-in`) é a mesma: quem chega apresenta-se,
   * quem se vai embora não. A escala é a metade de APRESENTAÇÃO do vocabulário
   * — é ela que faz uma caixa ganhar presença — e uma caixa a encolher enquanto
   * se apaga lê-se como sugada. E em 200 ms uma mola não tem onde assentar:
   * seria um estremecimento.
   *
   * O que TEM de espelhar é a direcção, e essa espelha — está no caso acima.
   */
  it("mas não leva escala nem mola: quem se vai embora não se apresenta", () => {
    const saida = css.slice(css.indexOf("@keyframes bo-saida"));
    const corpo = saida.slice(0, saida.indexOf("\n}"));
    expect(corpo, "a saída ganhou escala").not.toMatch(/\bscale:/);
    const regra = css.slice(css.indexOf(".bo-saida {"));
    expect(regra.slice(0, regra.indexOf("}")), "a saída ganhou mola").not.toContain(
      "--bo-mola-chegada",
    );
  });

  it("desliga-se para quem pediu menos movimento", () => {
    const i = css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf(".bo-saida {"));
    expect(i).toBeGreaterThan(-1);
    expect(css.slice(i, i + 200)).toMatch(/\.bo-saida\s*\{\s*animation:\s*none/);
  });
});

describe("quem pediu para não animar não espera pela saída", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (consulta: string) => ({
        matches: consulta.includes("reduce"),
        media: consulta,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("o aviso sai no próprio instante, sem ficar 200 ms parado em cima do botão", () => {
    dispararUm();
    fechar();
    expect(screen.queryByText("Aviso 1")).toBeNull();
  });
});

/**
 * ── E NADA DISTO PODE VOLTAR A SER LAYOUT ─────────────────────────────────
 *
 * A razão por que a saída ficou por fazer foi esta: fechar o espaço do aviso
 * que sai parecia obrigar a animar a ALTURA, e altura é layout a cada
 * fotograma. Medido num Chromium (`e2e/saida-do-aviso.mjs`), transicionar
 * `height` e transicionar `grid-template-rows: 1fr → 0fr` custam o MESMO —
 * ~19 recálculos de layout, um por fotograma — contra ~4 do FLIP em
 * `transform`, que são as medições feitas à mão e não por fotograma.
 *
 * Este teste é a rede: se alguém voltar a escrever altura (ou faixas de
 * grelha) neste ficheiro, fica vermelho aqui em vez de ficar lento no
 * telemóvel dela, que é onde ninguém está a olhar.
 */
describe("a pilha nunca anima layout", () => {
  const fonte = semComentarios(
    readFileSync(join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin/Toast.tsx"), "utf8"),
  );

  it("não escreve altura nem faixas de grelha", () => {
    expect(fonte).not.toMatch(/style\.height/);
    expect(fonte).not.toMatch(/gridTemplateRows|grid-template-rows/);
    expect(fonte).not.toMatch(/transition-all/);
  });

  it("e a única transição que escreve à mão é de `transform`", () => {
    const escritas = [...fonte.matchAll(/style\.transition\s*=\s*`([^`]*)`/g)].map((m) => m[1]);
    expect(escritas.length).toBeGreaterThan(0);
    for (const escrita of escritas) expect(escrita).toMatch(/^transform /);
  });
});
