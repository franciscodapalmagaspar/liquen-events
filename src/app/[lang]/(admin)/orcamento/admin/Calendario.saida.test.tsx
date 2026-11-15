// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CalendarEvent } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O «NOVO NO CALENDÁRIO» TAMBÉM SAI — E O PAINEL DO DIA, DE PROPÓSITO, NÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro prende as DUAS respostas desta vista, porque são duas e são
 * diferentes:
 *
 *  1. O diálogo de adicionar uma marcação está FORA de fluxo — flutua por cima
 *     do mês e não ocupa espaço nenhum. Ganha a saída da casa, como qualquer
 *     outra caixa: 200 ms, `.bo-saida`, e o toque largado no primeiro
 *     fotograma.
 *
 *  2. O painel de espreitar o dia está EM FLUXO, por baixo da grelha. Quando
 *     sai, a grelha sobe e o documento encolhe — e a resposta, medida, é NÃO
 *     ANIMAR. Os números estão no comentário do painel e o arnês em
 *     `e2e/saida-do-espreitar-o-dia.mjs`. A parte de baixo deste ficheiro
 *     prende essa decisão para que não se desfaça sozinha.
 */

const hoje = new Date();
const diaDesteMes = (d: number) =>
  `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const PROVA: CalendarEvent = {
  id: "e1",
  date: diaDesteMes(10),
  title: "Prova de bolo",
  kind: "reuniao",
  createdAt: "2026-08-01T09:00:00.000Z",
};

const resposta = (status: number, body: unknown = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  }) as Response;

const classes = (el: Element) => el.className.split(/\s+/).filter(Boolean);

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(
        !init?.method || init.method === "GET" ? resposta(200, [PROVA]) : resposta(200, {}),
      ),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.style.overflow = "";
});

/** Desenha o mês e abre o painel do dia 10, onde está a prova de bolo. */
async function abrirODia() {
  render(
    <ToastProvider>
      <Calendario quotes={[]} onOpen={() => {}} />
    </ToastProvider>,
  );
  // Espera que as marcações do mês cheguem, e carrega no DIA — é isso que abre
  // o painel por baixo da grelha.
  await screen.findByLabelText(/Abrir Reunião: Prova de bolo/);
  fireEvent.click(screen.getByRole("gridcell", { name: /, 10 de .*Enter para ver/ }));
  return screen.getByRole("button", { name: "Fechar dia" });
}

/** Abre o «Novo no calendário» a partir do painel do dia. */
async function abrirODialogo() {
  await abrirODia();
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  return await screen.findByRole("dialog", { name: /Adicionar ao calendário/ });
}

describe("o «Novo no calendário» fica montado a sair", () => {
  it("não desaparece no fotograma do gesto, e deixa de ser um diálogo já", async () => {
    const caixa = await abrirODialogo();
    // Controlo negativo: aberto, é uma caixa a sério e com a ENTRADA da casa.
    expect(classes(caixa)).toContain("bo-entrada");
    expect(classes(caixa)).not.toContain("bo-saida");
    expect(caixa.hasAttribute("inert")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    // Para quem ouve o ecrã acabou já; para os olhos, fica 200 ms de imagem.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(caixa.isConnected).toBe(true);
    expect(classes(caixa)).toContain("bo-saida");
    expect(classes(caixa)).not.toContain("bo-entrada");
    expect(caixa.hasAttribute("inert")).toBe(true);
    expect(caixa.getAttribute("aria-hidden")).toBe("true");

    await waitFor(() => expect(caixa.isConnected).toBe(false));
  });

  it("e o véu apaga-se com ela, no mesmo nó", async () => {
    const caixa = await abrirODialogo();
    const veu = caixa.previousElementSibling as HTMLElement;
    expect(classes(veu)).toContain("bo-entrada-fundo");

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(classes(veu)).toContain("bo-saida");
    expect(classes(veu)).toContain("bo-saida-fundo");
    expect(veu.isConnected).toBe(true);
  });
});

/**
 * ── O TESTE QUE IMPEDE UM TOQUE DE SE PERDER ──────────────────────────────
 *
 * A moldura deste diálogo é um `fixed inset-0` por cima da grelha do mês, e o
 * gesto seguinte de quem acabou de adicionar uma marcação é, quase sempre,
 * carregar noutro dia. Uma caixa a desvanecer-se por cima da grelha continuava
 * a ser o alvo do toque enquanto lá estivesse: a pessoa carrega num dia, não
 * acontece nada, e não há sinal nenhum de porquê.
 *
 * E este diálogo tem uma armadilha própria: a moldura dele FECHA-O (o
 * `onClick={onClose}` no fundo). Sem largar o toque, o clique num dia durante a
 * saída ia parar ao fundo de uma caixa que já estava fechada.
 */
describe("o diálogo a sair não apanha um único toque", () => {
  it("a moldura larga-os no primeiro fotograma, e o fundo deixa de fechar nada", async () => {
    const caixa = await abrirODialogo();
    const moldura = caixa.parentElement as HTMLElement;

    /* Controlo negativo, e é a sério: aberto, um clique nesta moldura FECHA o
       diálogo — é o clique no fundo. Sem esta parte, o que vem a seguir passava
       com uma moldura que nunca tinha apanhado toque nenhum. */
    expect(moldura.className).toContain("inset-0");
    expect(classes(moldura)).not.toContain("pointer-events-none");
    fireEvent.click(moldura);
    expect(screen.queryByRole("dialog")).toBeNull();

    // Agora está a sair — e continua no ecrã, que é o que faz isto medir algo.
    expect(caixa.isConnected).toBe(true);
    expect(classes(moldura)).toContain("pointer-events-none");
    // E o mesmo gesto no mesmo sítio já não faz nada.
    fireEvent.click(moldura);
    expect(caixa.isConnected).toBe(true);
  });

  it("a página destranca no instante, com o diálogo ainda no ecrã", async () => {
    const caixa = await abrirODialogo();
    // Controlo negativo: com o diálogo aberto, o mês por trás não rola.
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    // Zero espera. O trinco segue o `aberto`, e não a montagem: uma animação a
    // atrasar a devolução da página era uma animação a atrasar uma tarefa.
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(caixa.isConnected).toBe(true);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * E O PAINEL DO DIA SAI A SECO — PORQUE FOI MEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este é o único da lista que FECHA ESPAÇO ATRÁS DE SI: está em fluxo, dentro
 * do cartão, e quando sai a grelha sobe e o documento encolhe. As três formas
 * de animar isso foram medidas com o instrumento da casa (contadores do CDP,
 * `e2e/saida-do-espreitar-o-dia.mjs`), e a conclusão foi não animar:
 *
 *     A · `height`              17,0 layouts    C · FLIP    4,0 layouts
 *     B · `grid-template-rows`  15,0 layouts    D · nada    1,0 layout
 *
 * A e B custam quinze a dezassete recálculos de layout por saída. C é barato em
 * layouts e caro em tudo o resto: o `transform` no invólucro do que vem a
 * seguir descola o cabeçalho `sticky` (medido: de 0 px do topo para 24 px), e
 * tirar o painel de fluxo encolhe o documento 291 px — com a página no fundo, o
 * browser trava o `scrollTop` e a grelha do mês SALTA 291 px no fotograma zero.
 *
 * Este teste não prova a medição (isso é do arnês). Prova que a decisão está
 * ESCRITA no sítio onde alguém a vai desfazer, e que o painel continua a
 * desaparecer no instante — porque uma saída meia-feita aqui seria pior do que
 * nenhuma: um painel a apagar-se por cima de uma página que já saltou.
 */
describe("o painel de espreitar o dia sai a seco, e está escrito porquê", () => {
  it("desaparece no fotograma do gesto — sem 200 ms de imagem por cima do mês", async () => {
    const fechar = await abrirODia();
    const painel = fechar.closest("div.overflow-hidden") as HTMLElement;
    expect(painel, "o painel do dia mudou de forma").toBeTruthy();
    // Controlo negativo: ele existe, entra com a `.bo-entrada`, e está no ecrã.
    expect(classes(painel)).toContain("bo-entrada");
    expect(painel.isConnected).toBe(true);

    fireEvent.click(fechar);

    // Zero espera, e vai-se embora inteiro: o espaço fecha de uma vez.
    expect(painel.isConnected).toBe(false);
    expect(screen.queryByRole("button", { name: "Fechar dia" })).toBeNull();
  });

  it("e a razão está no código, com os números que a sustentam", () => {
    const fonte = readFileSync("src/app/[lang]/(admin)/orcamento/admin/Calendario.tsx", "utf8");
    // O arnês tem de continuar a existir, e a ser apontado de onde a decisão foi
    // tomada: sem ele, o número seguinte que alguém escrever aqui é um palpite.
    expect(fonte).toContain("e2e/saida-do-espreitar-o-dia.mjs");
    expect(fonte, "a decisão perdeu os números que a sustentam").toMatch(/layouts/);
    expect(fonte, "a razão do `sticky` desapareceu").toMatch(/sticky/);
  });
});
