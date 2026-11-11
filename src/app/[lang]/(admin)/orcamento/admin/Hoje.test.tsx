// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote, Task } from "@/lib/orcamento/types";
import { __resetListCache } from "./useCachedList";
import Hoje from "./Hoje";
import { todayKey } from "./util";

/** O bloco «Hoje» da Visão Geral (10/11): o que mostra e para onde leva. */

const resposta = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ ETag: `W/"${Math.random()}"` }),
  json: async () => body,
});

let tarefas: Task[] = [];
beforeEach(() => {
  __resetListCache();
  tarefas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => resposta(tarefas)),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pedido = (over: Partial<Quote>): Quote =>
  ({
    id: "q1",
    name: "TESTE Ana e Rui",
    email: "t@exemplo.test",
    guests: 100,
    status: "aceite",
    submittedAt: "2026-01-10T10:00:00.000Z",
    lastUpdated: "2026-01-10T10:00:00.000Z",
    payments: [],
    ...over,
  }) as Quote;

describe("«Hoje» na Visão Geral", () => {
  it("um dia sem nada diz que não há nada, sem inventar", async () => {
    render(<Hoje quotes={[]} propostas={[]} onOpen={vi.fn()} onGo={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Hoje" })).toBeTruthy();
    expect(screen.getByText("Nada urgente")).toBeTruthy();
  });

  it("o evento de hoje abre o pedido; a tarefa leva às Tarefas", async () => {
    const hoje = todayKey();
    tarefas = [
      { id: "t1", title: "Confirmar flores", done: false, priority: "alta", dueDate: hoje } as Task,
    ];
    const onOpen = vi.fn();
    const onGo = vi.fn();
    const q = pedido({ id: "q1", date: hoje });
    render(<Hoje quotes={[q]} propostas={[]} onOpen={onOpen} onGo={onGo} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Evento hoje.*TESTE Ana e Rui/ }));
    expect(onOpen).toHaveBeenCalledWith(q);

    const tarefa = await screen.findByRole("button", { name: /Tarefa para hoje.*Confirmar flores/ });
    await user.click(tarefa);
    expect(onGo).toHaveBeenCalledWith("tarefas");
    await waitFor(() => expect(screen.getByText("2 coisas")).toBeTruthy());
  });

  it("um sinal em atraso leva aos Pagamentos e diz há quantos dias", async () => {
    const onGo = vi.fn();
    const q = pedido({
      id: "q2",
      quotedPrice: 1000,
      date: "2099-06-12",
      payments: [{ id: "p", kind: "sinal", amount: 300, date: "2020-01-01", paid: false }],
    });
    render(<Hoje quotes={[q]} propostas={[]} onOpen={vi.fn()} onGo={onGo} />);
    const linha = screen.getByRole("button", { name: /Sinal em atraso há \d+ dias/ });
    await userEvent.setup().click(linha);
    expect(onGo).toHaveBeenCalledWith("pagamentos");
  });
});
