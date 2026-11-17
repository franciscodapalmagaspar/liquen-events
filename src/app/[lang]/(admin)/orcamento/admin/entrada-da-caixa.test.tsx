// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CalendarEvent } from "@/lib/orcamento/types";
import type { ThemeImage } from "@/lib/theme-types";
import Calendario from "./Calendario";
import CriarAPartirDe from "./CriarAPartirDe";
import PhotoLightbox from "./PhotoLightbox";
import RestoreDialog from "./RestoreDialog";
import SessaoExpirada from "./SessaoExpirada";
import { ToastProvider } from "./Toast";
import { RegistoDeGravacoesProvider } from "./registo-de-gravacoes";
import { __resetListCache } from "./useCachedList";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O VÉU ERA TRATADO E A CAIXA ERA ESQUECIDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A varredura dos fundos (`entrada-dos-fundos.test.ts`) pôs a `.bo-entrada-fundo`
 * em todos os véus escuros do back office e guarda-os desde então. O que ela
 * NÃO vê é a caixa que cada véu traz: o fundo escurecia em 240 ms e o diálogo
 * aparecia com a opacidade final no primeiro fotograma deles. Lê-se como meio
 * gesto — e a parte que se lê a saltar é precisamente aquela em que se vai
 * carregar.
 *
 * Este ficheiro conta a outra metade, e conta-a ONDE ELA SE VÊ: monta cada
 * ecrã e olha para o elemento, em vez de procurar um nome de classe no
 * ficheiro. Um teste de fonte diz que a palavra lá está; só um teste montado
 * diz que ela está no elemento certo — que era exactamente o defeito.
 *
 * A regra, em duas linhas:
 *
 *   · a caixa entra com a `.bo-entrada` (240 ms, 4 px, a curva de quem
 *     apresenta) e o véu com a `.bo-entrada-fundo`, que é a mesma coisa com
 *     zero de deslocação — um fundo não vem de sítio nenhum;
 *   · quando o véu e a caixa são o MESMO elemento, há uma entrada só (é o caso
 *     do visualizador de fotos, e o `LupaDeFotos` já o tinha resolvido assim).
 */

/** As classes, uma a uma: `bo-entrada-fundo` contém `bo-entrada` como texto. */
const classes = (el: Element) => el.className.split(/\s+/).filter(Boolean);

/** O véu de um diálogo desta casa é o irmão que vem antes da caixa. */
const veuDe = (caixa: Element) => caixa.previousElementSibling as HTMLElement;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a caixa de repor a cópia entra com o véu que a traz", () => {
  it("acende e desce quatro píxeis, em vez de aparecer feita", () => {
    render(<RestoreDialog open onClose={vi.fn()} />);
    const caixa = screen.getByRole("dialog", { name: "Repor cópia de segurança" });

    expect(classes(caixa)).toContain("bo-entrada");
    // E é a da CAIXA, não a do fundo: quatro píxeis, e não zero.
    expect(classes(caixa)).not.toContain("bo-entrada-fundo");

    // O véu já era tratado — é a assimetria entre os dois que este teste
    // guarda. Sem esta linha, alguém que tirasse a entrada ao fundo punha os
    // dois a aparecer de repente e este ficheiro continuava verde.
    expect(classes(veuDe(caixa))).toContain("bo-entrada");
    expect(classes(veuDe(caixa))).toContain("bo-entrada-fundo");
  });
});

describe("a barreira da sessão expirada", () => {
  let respostas: number[] = [];
  beforeEach(() => {
    respostas = [];
    sessionStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const status = respostas.shift() ?? 200;
        return { ok: status < 400, status, json: async () => ({}) } as unknown as Response;
      }),
    );
  });

  it("a caixa entra com o fundo — e aqui isso conta duas vezes", async () => {
    render(
      <ToastProvider>
        <RegistoDeGravacoesProvider>
          <SessaoExpirada />
        </RegistoDeGravacoesProvider>
      </ToastProvider>,
    );
    respostas = [401];
    await fetch("/api/tarefas");
    const caixa = await screen.findByRole("dialog");

    // Conta duas vezes porque esta é a única superfície da casa desenhada sem
    // saída nenhuma: o fundo não fecha e não há «×». O que aparece é tudo o
    // que há, e aparecia de repente por cima de um ecrã a escurecer devagar.
    expect(classes(caixa)).toContain("bo-entrada");
    expect(classes(caixa)).not.toContain("bo-entrada-fundo");
    expect(classes(veuDe(caixa))).toContain("bo-entrada-fundo");
  });
});

describe("o diálogo «Criar a partir de…» — o único com os DOIS por tratar", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }) as unknown as Response),
    );
  });

  it("o véu acende e a caixa desce, sendo o véu a própria moldura", async () => {
    render(
      <CriarAPartirDe
        open
        onClose={vi.fn()}
        quoteId="q2"
        clienteAtual="Ana Marques"
        onEscolhido={vi.fn()}
      />,
    );
    const caixa = await screen.findByRole("dialog", { name: "Criar a partir de…" });
    // Aqui a tinta escura e o `flex` que centra a caixa vivem no mesmo
    // elemento — é a moldura que faz de véu, e por isso é a MÃE da caixa e não
    // uma irmã dela.
    const moldura = caixa.parentElement as HTMLElement;

    expect(classes(moldura)).toContain("bo-entrada");
    expect(classes(moldura)).toContain("bo-entrada-fundo");
    expect(classes(caixa)).toContain("bo-entrada");
    expect(classes(caixa)).not.toContain("bo-entrada-fundo");
  });
});

describe("o visualizador de fotos da biblioteca", () => {
  const FOTO: ThemeImage = {
    path: "temas/lavanda/1.jpg",
    url: "https://exemplo/1-original.jpg",
    thumbUrl: "https://exemplo/1-mini.jpg",
  };

  it("entra com UMA entrada só, porque o véu e a caixa são o mesmo ecrã", () => {
    render(
      <PhotoLightbox
        images={[FOTO]}
        index={0}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    const visor = screen.getByRole("dialog", { name: "Foto 1 de 1" });

    expect(classes(visor)).toContain("bo-entrada");
    // E SEM a variante do fundo: aqui a tinta preta não está por trás de nada,
    // É o visualizador. `--bo-entrada-y: 0px` tirava a deslocação a tudo o que
    // está lá dentro. É a decisão que o `LupaDeFotos` já tinha tomado, e a
    // mesma razão por que a varredura dos véus isenta os dois.
    expect(classes(visor)).not.toContain("bo-entrada-fundo");
  });
});

describe("o calendário", () => {
  const hoje = new Date();
  const DIA = 10;
  const diaDesteMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(DIA).padStart(2, "0")}`;
  const PROVA: CalendarEvent = {
    id: "e1",
    date: diaDesteMes,
    title: "Prova de bolo",
    kind: "reuniao",
    createdAt: "2026-08-01T09:00:00.000Z",
  };

  beforeEach(() => {
    __resetListCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => [PROVA],
          }) as unknown as Response,
      ),
    );
  });

  /** Desenha o mês e toca no dia que tem marcações. */
  async function espreitarODia() {
    render(
      <ToastProvider>
        <Calendario quotes={[]} onOpen={vi.fn()} />
      </ToastProvider>,
    );
    const dia = await screen.findByRole("gridcell", { name: new RegExp(`, ${DIA} de `) });
    fireEvent.click(dia);
    const fechar = await screen.findByRole("button", { name: "Fechar dia" });
    // O painel é o cartão que envolve o cabeçalho onde este botão vive.
    return (fechar.parentElement as HTMLElement).closest("[class*='rounded-xl']") as HTMLElement;
  }

  it("espreitar o dia entra em vez de aparecer, e sem animar a altura", async () => {
    const painel = await espreitarODia();

    expect(painel).not.toBeNull();
    expect(classes(painel)).toContain("bo-entrada");

    // O painel empurra a grelha para baixo, e é aí que está a tentação: animar
    // `height` é remedir a página a cada fotograma. A `.bo-entrada` só mexe em
    // `opacity` e `transform` — e nenhuma classe de altura entra na conta.
    expect(painel.className).not.toMatch(/\btransition-\[?[^\s]*height/);
    expect(painel.style.height).toBe("");
  });

  it("e o diálogo «Novo no calendário» entra com o fundo que o traz", async () => {
    const painel = await espreitarODia();
    fireEvent.click(within(painel).getByRole("button", { name: "Adicionar" }));

    const caixa = await screen.findByRole("dialog", { name: /^Adicionar ao calendário/ });
    await waitFor(() => expect(classes(caixa)).toContain("bo-entrada"));
    expect(classes(caixa)).not.toContain("bo-entrada-fundo");
    expect(classes(veuDe(caixa))).toContain("bo-entrada-fundo");
  });
});

/**
 * ── E A FOTO EM GRANDE DO SELETOR DE TEMAS ────────────────────────────────
 *
 * Esta é a excepção do ficheiro: lê-se a fonte em vez de se montar o ecrã.
 *
 * Não é preguiça, é proporção — pôr o `ThemePicker` de pé custa a biblioteca
 * inteira em duplos de `fetch`, e o que aqui se afirma é uma decisão de
 * VOCABULÁRIO e não um comportamento: qual das duas palavras da casa é que
 * este painel usa. Ele não APARECE por cima da página (isso é a `.bo-entrada`)
 * — o cromado do diálogo fica onde está e o que muda é o conteúdo dentro dele,
 * que é a definição da `.view-in`. O comportamento do painel (abre no V, o Esc
 * volta à grelha, puxa o original) já tem quem o guarde no `ThemePicker.test.tsx`.
 */
describe("a foto em grande é uma vista a substituir outra", () => {
  // `process.cwd()` e não o `import.meta.url`: em ambiente jsdom o segundo
  // chega relativo e o `readFileSync` procurava na raiz do disco.
  const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");
  const fonte = readFileSync(join(RAIZ, "ThemePicker.tsx"), "utf8");

  it("usa a `.view-in`, e não a entrada do que aparece por cima da página", () => {
    // A chapa que tapa a grelha: `absolute inset-0` dentro do mesmo diálogo.
    const chapa = /className="([^"]*\babsolute inset-0 z-10[^"]*)"/.exec(fonte);
    expect(chapa, "a chapa da foto em grande mudou de forma — confirma à mão").not.toBeNull();
    expect(chapa![1].split(/\s+/)).toContain("view-in");
    expect(chapa![1]).not.toContain("bo-entrada");
  });

  it("e a `.view-in` da casa continua a não deixar `transform` pendurado", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    // `backwards` e não `both`: um `transform` persistente cria bloco de
    // contenção e parte um `position: fixed` lá dentro.
    expect(css).toMatch(/\.view-in\s*\{[^}]*animation:\s*view-in 240ms[^;]*backwards/);
  });
});
