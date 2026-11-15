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
 * R2b — «ANULAR» NO CALENDÁRIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Tem que haver no site todo, em tudo aquilo que se faz, uma forma de voltar
 * atrás» (10/10, `docs/TUDO-REVERSIVEL.md`).
 *
 *  · acrescentar (e duplicar, que passa pelo mesmo sítio) anula-se APAGANDO a
 *    marcação que se criou;
 *  · remover anula-se RECRIANDO-A com o mesmo título, tipo, hora, nota e dia —
 *    com um id novo, que nada aponta para o id de uma marcação.
 */

const hoje = new Date();
const diaDesteMes = (d: number) =>
  `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const PROVA: CalendarEvent = {
  id: "e1",
  date: diaDesteMes(10),
  title: "Prova de bolo",
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

let escritas: { url: string; method: string; body: Record<string, unknown> | null }[] = [];

beforeEach(() => {
  __resetListCache();
  escritas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return Promise.resolve(resposta(200, [PROVA]));
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      escritas.push({ url, method, body });
      if (method === "POST") {
        return Promise.resolve(
          resposta(200, { ...body, id: `novo-${escritas.length}`, createdAt: "2026-10-10" }),
        );
      }
      return Promise.resolve(resposta(200, {}));
    }),
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
}

describe("«Anular» no calendário", () => {
  it("remover anula-se recriando a marcação com tudo o que tinha", async () => {
    const user = userEvent.setup();
    desenhar();
    const caixa = await abrirAPerguntaPeloDetalhe(
      user,
      await screen.findByLabelText(/Abrir Reunião: Prova de bolo/),
    );
    await user.click(within(caixa).getByRole("button", { name: /^Remover$/ }));
    expect(await screen.findByText(/«Prova de bolo» removido do calendário/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(escritas.filter((e) => e.method === "POST")).toHaveLength(1));
    expect(escritas.map((e) => e.method)).toEqual(["DELETE", "POST"]);
    expect(escritas[1].body).toEqual({
      title: "Prova de bolo",
      kind: "reuniao",
      time: "15:30",
      note: "Levar a lista",
      date: PROVA.date,
    });
    expect(await screen.findByText("Anulado.")).toBeTruthy();
    expect(await screen.findByLabelText(/Abrir Reunião: Prova de bolo/)).toBeInTheDocument();
  });

  it("acrescentar anula-se apagando a que se criou", async () => {
    const user = userEvent.setup();
    desenhar();
    await screen.findByLabelText(/Abrir Reunião: Prova de bolo/);
    await user.click(screen.getByLabelText(new RegExp(`^Adicionar a 12 de `)));
    const caixa = await screen.findByRole("dialog");
    await user.type(within(caixa).getByLabelText("Título"), "Visita à quinta");
    await user.click(within(caixa).getByRole("button", { name: "Adicionar ao calendário" }));
    expect(await screen.findByText(/«Visita à quinta» adicionado ao calendário/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(escritas.map((e) => e.method)).toEqual(["POST", "DELETE"]));
    expect(escritas[1].url).toBe("/api/calendario/novo-1");
    expect(await screen.findByText("Anulado.")).toBeTruthy();
  });

  it("se o «Anular» falhar, diz-se — e não diz «Anulado.»", async () => {
    const user = userEvent.setup();
    desenhar();
    const pergunta = await abrirAPerguntaPeloDetalhe(
      user,
      await screen.findByLabelText(/Abrir Reunião: Prova de bolo/),
    );
    await user.click(within(pergunta).getByRole("button", { name: /^Remover$/ }));
    await screen.findByText(/removido do calendário/);
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(resposta(500, { error: "A base de dados não respondeu." })),
    );
    await user.click(screen.getByRole("button", { name: "Anular" }));
    expect(
      await screen.findByText(/não deu para repor «Prova de bolo» no calendário/),
    ).toBeTruthy();
    expect(screen.queryByText("Anulado.")).toBeNull();
  });
});
