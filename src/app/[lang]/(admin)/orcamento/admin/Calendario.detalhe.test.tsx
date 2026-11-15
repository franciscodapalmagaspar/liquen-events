// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CalendarEvent } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM TOQUE NUMA MARCAÇÃO ABRE O DETALHE — E NÃO «REMOVER …?» (15/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: tocar numa marcação abria logo a pergunta de remover. Um toque
 * é a forma de PERGUNTAR o que é aquilo, e a resposta era destrutiva. Passa a
 * abrir o detalhe (título, dia, hora, tipo, nota), com «Remover» lá dentro —
 * pela mesma pergunta da casa e pela mesma Reciclagem.
 *
 * O que fica como estava, e está preso aqui também: a tecla Delete numa
 * marcação com foco abre a pergunta directamente, e o botão direito abre o
 * menu de contexto (que também tem «Remover»).
 */

const hoje = new Date();
const diaDesteMes = (d: number) =>
  `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const PROVA: CalendarEvent = {
  id: "e1",
  date: diaDesteMes(10),
  title: "TESTE Prova de bolo",
  kind: "reuniao",
  time: "15:30",
  note: "Levar a lista",
  createdAt: "2026-08-01T09:00:00.000Z",
};

const resposta = (status: number, body: unknown = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  }) as Response;

const escritas = () =>
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
    (c) => (c[1] as RequestInit | undefined)?.method && (c[1] as RequestInit).method !== "GET",
  );

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
});

function desenhar() {
  render(
    <ToastProvider>
      <Calendario quotes={[]} onOpen={() => {}} />
    </ToastProvider>,
  );
  return screen.findByLabelText(/Abrir Reunião: TESTE Prova de bolo/);
}

describe("um toque numa marcação", () => {
  it("abre o detalhe, com o título, o dia, a hora, o tipo e a nota — e não a pergunta", async () => {
    const user = userEvent.setup();
    await user.click(await desenhar());

    const detalhe = await screen.findByRole("dialog", { name: /TESTE Prova de bolo/ });
    expect(within(detalhe).queryByText(/do calendário\?/)).toBeNull();
    expect(within(detalhe).getByText("15:30")).toBeInTheDocument();
    expect(within(detalhe).getAllByText("Reunião").length).toBeGreaterThan(0);
    expect(within(detalhe).getByText("Levar a lista")).toBeInTheDocument();
    expect(within(detalhe).getByText(/10 de /)).toBeInTheDocument();
    expect(within(detalhe).getByRole("button", { name: /^Remover$/ })).toBeInTheDocument();
    expect(escritas(), "abrir o detalhe não escreve nada").toHaveLength(0);
  });

  it("«Remover» lá dentro passa pela pergunta da casa, e só o «Remover» da pergunta apaga", async () => {
    const user = userEvent.setup();
    await user.click(await desenhar());
    const detalhe = await screen.findByRole("dialog", { name: /TESTE Prova de bolo/ });
    await user.click(within(detalhe).getByRole("button", { name: /^Remover$/ }));

    const pergunta = await screen.findByRole("dialog", {
      name: "Remover «TESTE Prova de bolo» do calendário?",
    });
    expect(within(pergunta).getByText(/Reciclagem/)).toBeInTheDocument();
    expect(escritas(), "a pergunta ainda não apagou nada").toHaveLength(0);

    await user.click(within(pergunta).getByRole("button", { name: /^Remover$/ }));
    await waitFor(() =>
      expect(escritas().map((c) => (c[1] as RequestInit).method)).toEqual(["DELETE"]),
    );
  });

  // Revisão de 15/11, n.º 8: «Remover» → confirmar fecha o detalhe, e ele não
  // volta — nem quando o servidor recusa e a marcação regressa à grelha.
  it("«Remover» → confirmar fecha o detalhe, e ele não volta mesmo que o servidor recuse", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init?: RequestInit) =>
        Promise.resolve(
          !init?.method || init.method === "GET"
            ? resposta(200, [PROVA])
            : resposta(500, { error: "TESTE falhou" }),
        ),
    );
    const user = userEvent.setup();
    await user.click(await desenhar());
    const detalhe = await screen.findByRole("dialog", { name: /TESTE Prova de bolo/ });
    await user.click(within(detalhe).getByRole("button", { name: /^Remover$/ }));
    const pergunta = await screen.findByRole("dialog", {
      name: "Remover «TESTE Prova de bolo» do calendário?",
    });
    // Uma folha só: a pergunta entra, o detalhe sai.
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
    await user.click(within(pergunta).getByRole("button", { name: /^Remover$/ }));
    await waitFor(() =>
      expect(escritas().map((c) => (c[1] as RequestInit).method)).toEqual(["DELETE"]),
    );
    // A recusa devolve a marcação à grelha…
    expect(await screen.findByLabelText(/Abrir Reunião: TESTE Prova de bolo/)).toBeInTheDocument();
    // …e o detalhe continua fechado.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByRole("dialog", { name: /TESTE Prova de bolo/ })).toBeNull();
  });

  it("«Fechar» fecha o detalhe e não mexe em nada", async () => {
    const user = userEvent.setup();
    await user.click(await desenhar());
    const detalhe = await screen.findByRole("dialog", { name: /TESTE Prova de bolo/ });
    await user.click(within(detalhe).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText(/Abrir Reunião: TESTE Prova de bolo/)).toBeInTheDocument();
    expect(escritas()).toHaveLength(0);
  });

  it("«Mudar de dia…» do detalhe abre o «Mudar de dia» da casa", async () => {
    const user = userEvent.setup();
    await user.click(await desenhar());
    const detalhe = await screen.findByRole("dialog", { name: /TESTE Prova de bolo/ });
    await user.click(within(detalhe).getByRole("button", { name: "Mudar de dia…" }));
    expect(
      await screen.findByRole("dialog", { name: "Mudar «TESTE Prova de bolo» de dia" }),
    ).toBeInTheDocument();
  });

  it("na vista de dia, o toque também abre o detalhe", async () => {
    const user = userEvent.setup();
    await desenhar();
    await user.click(screen.getByRole("radio", { name: "Dia" }));
    // A vista de dia abre em hoje: vai ao dia 10 pelo menu da marcação seria
    // outro gesto; pelas setas chega-se lá.
    const alvo = Number(PROVA.date.slice(8));
    const diaDeHoje = hoje.getDate();
    const nome = alvo >= diaDeHoje ? "Dia seguinte" : "Dia anterior";
    for (let i = 0; i < Math.abs(alvo - diaDeHoje); i += 1) {
      await user.click(screen.getByRole("button", { name: nome }));
    }
    await user.click(screen.getByLabelText("Abrir Reunião: TESTE Prova de bolo"));
    expect(await screen.findByRole("dialog", { name: /TESTE Prova de bolo/ })).toBeInTheDocument();
    expect(screen.queryByText(/Remover «TESTE Prova de bolo» do calendário\?/)).toBeNull();
  });
});

describe("o que fica como estava", () => {
  it("a tecla Delete numa marcação com foco abre a pergunta directamente", async () => {
    const chip = await desenhar();
    chip.focus();
    fireEvent.keyDown(chip, { key: "Delete" });
    expect(
      await screen.findByRole("dialog", { name: "Remover «TESTE Prova de bolo» do calendário?" }),
    ).toBeInTheDocument();
  });

  it("o botão direito abre o menu de contexto, com «Remover»", async () => {
    const chip = await desenhar();
    fireEvent.contextMenu(chip);
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Remover" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
