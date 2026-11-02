// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";
import type { CalendarEvent, Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * FASE 10 — MENUS E TECLADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os pontos 17 e 18 da auditoria dela, os dois numa linha cada: «Não há menu de
 * contexto no evento nem no dia» e «Não há atalhos».
 *
 * O que este ficheiro guarda, e a razão de cada coisa:
 *
 *  · que `⌘1–4`, `⌘T`/`T` e as setas fazem o que dizem;
 *  · que NÃO disparam por cima do que já existe — a paleta (`⌘K`), o acorde
 *    `g`+destino do `AdminClient`, e o que se está a escrever num campo. Um
 *    atalho novo que come uma tecla antiga não dá erro nenhum: dá um ecrã que
 *    de repente deixou de obedecer, e ninguém liga as duas coisas;
 *  · e que o menu do botão direito abre no evento E no dia, com as acções que
 *    a API desta casa consegue mesmo cumprir.
 */

const CASAMENTO: Quote = {
  id: "LIQ-1",
  name: "Marta Nunes",
  status: "aceite",
  date: "2026-09-10",
  guests: 120,
} as unknown as Quote;

const MARCACAO: CalendarEvent = {
  id: "ev-1",
  date: "2026-09-10",
  title: "Prova de bolo",
  kind: "reuniao",
  time: "10:00",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => resposta([MARCACAO])),
  );
  process.env.TZ = "Europe/Lisbon";
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-10T14:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete process.env.TZ;
  vi.unstubAllGlobals();
});

async function montar() {
  render(
    <ToastProvider>
      <Calendario quotes={[CASAMENTO]} onOpen={() => {}} />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText("Setembro 2026")).toBeInTheDocument());
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

/** Uma tecla na janela, que é onde o ouvinte global deste ecrã vive. */
const tecla = (key: string, extra: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(window, { key, ...extra });

describe("⌘1 a ⌘4 — as quatro vistas", () => {
  it("trocam de vista pela ordem da app do Mac", async () => {
    await montar();

    tecla("1", { metaKey: true });
    await waitFor(() => expect(screen.getByRole("radio", { name: "Dia" })).toBeChecked());

    tecla("2", { metaKey: true });
    await waitFor(() => expect(screen.getByRole("radio", { name: "Semana" })).toBeChecked());

    tecla("4", { metaKey: true });
    await waitFor(() => expect(screen.getByRole("radio", { name: "Ano" })).toBeChecked());

    tecla("3", { metaKey: true });
    await waitFor(() => expect(screen.getByRole("radio", { name: "Mês" })).toBeChecked());
  });

  it("valem também com `Ctrl`, que é o que um teclado de PC tem", async () => {
    await montar();
    tecla("2", { ctrlKey: true });
    await waitFor(() => expect(screen.getByRole("radio", { name: "Semana" })).toBeChecked());
  });

  it("um número SOLTO não troca de vista — ou escrever «3» num campo mudava o ecrã", async () => {
    await montar();
    tecla("3");
    tecla("1");
    expect(screen.getByRole("radio", { name: "Mês" })).toBeChecked();
  });
});

describe("voltar a hoje", () => {
  it("o `T` solto traz as duas âncoras de volta — o mês E o dia", async () => {
    const user = await montar();
    await user.click(screen.getByRole("radio", { name: "Dia" }));
    await user.click(screen.getByRole("button", { name: "Dia seguinte" }));
    expect(screen.getByRole("heading", { name: "11 de setembro de 2026" })).toBeInTheDocument();

    tecla("t");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "10 de setembro de 2026" })).toBeInTheDocument(),
    );
  });

  it("o ⌘T também — é o atalho que o documento nomeia, e o browser é que o come", async () => {
    const user = await montar();
    await user.click(screen.getByRole("button", { name: "Mês seguinte" }));
    expect(screen.getByRole("heading", { name: "Outubro 2026" })).toBeInTheDocument();

    tecla("t", { metaKey: true });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Setembro 2026" })).toBeInTheDocument(),
    );
  });

  it("um `t` logo a seguir a um `g` é o acorde das Tarefas, e passa ao lado", async () => {
    const user = await montar();
    await user.click(screen.getByRole("button", { name: "Mês seguinte" }));

    tecla("g");
    tecla("t");
    // O calendário não se mexeu: quem trata este `t` é o `AdminClient`, que o
    // usa para navegar para outra secção.
    expect(screen.getByRole("heading", { name: "Outubro 2026" })).toBeInTheDocument();
  });
});

describe("as setas", () => {
  it("andam na unidade que está à vista — o mês no mês, o dia no dia", async () => {
    const user = await montar();

    tecla("ArrowRight");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Outubro 2026" })).toBeInTheDocument(),
    );
    tecla("ArrowLeft");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Setembro 2026" })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("radio", { name: "Dia" }));
    tecla("ArrowRight");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "11 de setembro de 2026" })).toBeInTheDocument(),
    );
  });

  it("`⌥←`/`⌥→` saltam de MÊS — e na vista de dia levam o DIA atrás", async () => {
    const user = await montar();
    await user.click(screen.getByRole("radio", { name: "Dia" }));

    // Mexer só no cursor do mês com a vista de dia à frente mudava um número
    // que não está desenhado em lado nenhum: a tecla parecia avariada.
    tecla("ArrowRight", { altKey: true });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "10 de outubro de 2026" })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("radio", { name: "Mês" }));
    tecla("ArrowLeft", { altKey: true });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Setembro 2026" })).toBeInTheDocument(),
    );
  });

  it("não roubam as setas a quem está a escrever num campo", async () => {
    const user = await montar();
    // O «Novo no calendário» fecha o ouvinte global por inteiro (tem teclado
    // próprio), portanto o caso a medir é um campo FORA dele: não há nenhum
    // nesta vista, e por isso simula-se o alvo.
    await user.click(screen.getByRole("radio", { name: "Dia" }));
    const campo = document.createElement("input");
    document.body.appendChild(campo);
    campo.focus();

    fireEvent.keyDown(campo, { key: "ArrowRight", bubbles: true });
    expect(screen.getByRole("heading", { name: "10 de setembro de 2026" })).toBeInTheDocument();
    campo.remove();
  });
});

describe("⌘N — criar no dia em que se está", () => {
  it("abre o «Novo no calendário» na vista de dia, com a data desse dia", async () => {
    const user = await montar();
    await user.click(screen.getByRole("radio", { name: "Dia" }));
    await user.click(screen.getByRole("button", { name: "Dia seguinte" }));

    tecla("n", { metaKey: true });
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: /Adicionar ao calendário — sexta-feira, 11/i }),
      ).toBeInTheDocument(),
    );
  });
});

describe("o botão direito", () => {
  it("num dia da grelha do mês abre as quatro acções do dia", async () => {
    await montar();
    fireEvent.contextMenu(screen.getByLabelText(/, 12 de Setembro de 2026 — /));

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Novo evento" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Nova nota…" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Fechar este dia…" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Ver na vista de dia" })).toBeInTheDocument();
  });

  it("«Fechar este dia…» abre a caixa JÁ com «Data fechada» escolhida", async () => {
    await montar();
    fireEvent.contextMenu(screen.getByLabelText(/, 12 de Setembro de 2026 — /));
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Fechar este dia…" }));

    const caixa = await screen.findByRole("dialog", { name: /Adicionar ao calendário/ });
    // Sem isto, o item do menu dizia uma coisa e a caixa que ele abre abria
    // noutra — e o tipo tinha de ser corrigido à mão em todas as vezes.
    expect(within(caixa).getByRole("button", { name: "Data fechada" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("«Ver na vista de dia» leva mesmo a esse dia", async () => {
    await montar();
    fireEvent.contextMenu(screen.getByLabelText(/, 12 de Setembro de 2026 — /));
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Ver na vista de dia" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "12 de setembro de 2026" })).toBeInTheDocument(),
    );
  });

  it("numa marcação abre o menu DELA, e não o do dia por baixo", async () => {
    await montar();
    fireEvent.contextMenu(screen.getByLabelText("Remover Reunião: Prova de bolo"));

    const menu = await screen.findByRole("menu");
    expect(menu).toHaveAttribute("aria-label", "Acções de Prova de bolo");
    expect(within(menu).getByRole("menuitem", { name: "Duplicar" })).toBeInTheDocument();
    // Um menu não é licença para apagar sem perguntar: «Remover» abre a
    // pergunta da casa, como o clique na etiqueta.
    expect(within(menu).getByRole("menuitem", { name: "Remover" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Novo evento" })).toBeNull();
  });

  it("«Remover» do menu passa pela pergunta, e não apaga logo", async () => {
    await montar();
    fireEvent.contextMenu(screen.getByLabelText("Remover Reunião: Prova de bolo"));
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Remover" }));

    await waitFor(() =>
      expect(screen.getByText(/Remover «Prova de bolo» do calendário\?/)).toBeInTheDocument(),
    );
    // Nada foi ao servidor — só a leitura inicial das marcações.
    const chamadas = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(chamadas.some((c) => String(c[0]).includes("/api/calendario/ev-1"))).toBe(false);
  });

  it("num pedido abre o menu do PEDIDO — abrir e ver o dia (uma porta só, 2/11)", async () => {
    await montar();
    fireEvent.contextMenu(screen.getAllByLabelText(/Abrir pedido de Marta Nunes/)[0]);

    const menu = await screen.findByRole("menu");
    expect(menu).toHaveAttribute("aria-label", "Acções de Marta Nunes");
    expect(within(menu).getByRole("menuitem", { name: "Abrir pedido" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Ver na vista de dia" })).toBeInTheDocument();
    // «Fazer proposta» era a segunda porta para o mesmo sítio.
    expect(within(menu).queryByRole("menuitem", { name: "Fazer proposta" })).toBeNull();
  });
});

describe("tocar num cliente abre a PÁGINA do pedido, não o painel antigo (2/11)", () => {
  it("na grelha do mês e no menu, é a porta de «Fazer proposta» que abre", async () => {
    const onOpen = vi.fn();
    const onFazerProposta = vi.fn();
    render(
      <ToastProvider>
        <Calendario quotes={[CASAMENTO]} onOpen={onOpen} onFazerProposta={onFazerProposta} />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByText("Setembro 2026")).toBeInTheDocument());

    fireEvent.click(screen.getAllByLabelText(/Abrir pedido de Marta Nunes/)[0]);
    expect(onFazerProposta).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(screen.getAllByLabelText(/Abrir pedido de Marta Nunes/)[0]);
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Abrir pedido" }));
    expect(onFazerProposta).toHaveBeenCalledTimes(2);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
