// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CalendarEvent } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";
import { abrirAPerguntaPeloDetalhe } from "./calendario.testkit";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * REMOVER UMA MARCAÇÃO DEIXA DE PASSAR PELA CAIXA DO BROWSER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As razões gerais estão por extenso no `Tarefas.perguntas.test.tsx`. Este é o
 * ecrã onde a pergunta faz mais falta de todos: o alvo de remoção É a própria
 * marcação na grelha do mês — uma etiqueta de 9 px de letra —, e o comentário
 * que lá estava dizia-o já: «single-click delete is a footgun on a tiny
 * target».
 *
 * Ou seja: o sítio onde é mais fácil apagar por engano era o sítio onde a
 * pergunta era a do browser — a que aparece no TOPO, longe do dedo que acabou
 * de tocar numa etiqueta minúscula lá em baixo.
 *
 * O caso que interessa é o primeiro: que o `confirm()` não é chamado. Sem ele,
 * repor a caixa antiga passava os outros na mesma.
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

/** Desenha o calendário e toca na marcação para a remover. */
async function pedirParaRemover(user: ReturnType<typeof userEvent.setup>) {
  render(
    <ToastProvider>
      <Calendario quotes={[]} onOpen={() => {}} />
    </ToastProvider>,
  );
  const marcacao = await screen.findByLabelText(/Abrir Reunião: Prova de bolo/);
  // O toque abre o detalhe (15/11); a pergunta está no «Remover» de lá.
  await abrirAPerguntaPeloDetalhe(user, marcacao);
}

describe("a pergunta de remover uma marcação", () => {
  it("nunca abre a caixa do browser", async () => {
    const espia = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    await pedirParaRemover(user);
    expect(
      espia,
      "voltou a usar-se o `confirm()` do browser — no alvo mais pequeno do painel",
    ).not.toHaveBeenCalled();
  });

  it("pergunta na janela da casa, e diz qual marcação", async () => {
    const user = userEvent.setup();
    await pedirParaRemover(user);
    const caixa = await screen.findByRole("dialog");
    // Numa grelha de mês, a marcação em que ela tocou não é óbvia depois de a
    // caixa abrir: o título tem de vir na pergunta.
    expect(within(caixa).getByText(/Prova de bolo/)).toBeTruthy();
    expect(within(caixa).getByRole("button", { name: /^Remover$/ })).toBeTruthy();
    expect(within(caixa).getByRole("button", { name: /^Cancelar$/ })).toBeTruthy();
  });

  it("cancelar deixa a marcação no calendário, e não manda nada ao servidor", async () => {
    const user = userEvent.setup();
    await pedirParaRemover(user);
    const caixa = await screen.findByRole("dialog");
    await user.click(within(caixa).getByRole("button", { name: /^Cancelar$/ }));
    expect(screen.getByLabelText(/Abrir Reunião: Prova de bolo/)).toBeInTheDocument();
    const chamadas = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(
      chamadas.some((c) => (c[1] as RequestInit | undefined)?.method === "DELETE"),
      "cancelar mandou um DELETE — a pergunta não estava a segurar nada",
    ).toBe(false);
  });

  it("confirmar remove-a", async () => {
    const user = userEvent.setup();
    await pedirParaRemover(user);
    const caixa = await screen.findByRole("dialog");
    await user.click(within(caixa).getByRole("button", { name: /^Remover$/ }));
    await waitFor(() =>
      expect(screen.queryByLabelText(/Abrir Reunião: Prova de bolo/)).not.toBeInTheDocument(),
    );
  });
});
