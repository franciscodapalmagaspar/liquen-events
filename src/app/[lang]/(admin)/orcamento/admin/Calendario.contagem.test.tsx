// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTADOR DO MÊS TEM DE CONTAR O QUE A GRELHA DESENHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A grelha ocupa TODOS os dias de um evento de vários dias (é para isso que o
 * `endDate` existe), mas a contagem do cabeçalho olhava só para a data de
 * início. Um evento de passagem de ano — 30 de Dezembro a 2 de Janeiro, que
 * nesta casa é o mais banal que há — pintava-se em Janeiro e, ao mesmo tempo,
 * Janeiro dizia "Sem eventos este mês" e abria o estado vazio POR BAIXO de uma
 * grelha que tinha lá o evento.
 *
 * Quem olha para aquele número está a decidir se aceita mais trabalho para o
 * mês. Dizer-lhe zero num mês que já tem uma montagem no dia 1 é a pior
 * resposta possível.
 */

const NATAL_A_ANO_NOVO: Quote = {
  id: "LIQ-1",
  name: "Marta Nunes",
  status: "aceite",
  date: "2025-12-30",
  endDate: "2026-01-02",
  guests: 60,
} as unknown as Quote;

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => resposta([])),
  );
  vi.useFakeTimers({ shouldAdvanceTime: true });
  process.env.TZ = "Europe/Lisbon";
  vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete process.env.TZ;
  vi.unstubAllGlobals();
});

function montar(quotes: Quote[]) {
  render(
    <ToastProvider>
      <Calendario quotes={quotes} onOpen={() => {}} />
    </ToastProvider>,
  );
  return waitFor(() => expect(screen.getByText("Janeiro 2026")).toBeInTheDocument());
}

describe("Calendário — contagem do mês", () => {
  it("um evento que entra pelo ano novo conta para Janeiro", async () => {
    await montar([NATAL_A_ANO_NOVO]);

    // A grelha desenha-o no dia 1 e no dia 2…
    expect(screen.getAllByLabelText(/Abrir pedido de Marta Nunes/).length).toBeGreaterThan(0);
    // … logo o cabeçalho não pode dizer que o mês está livre.
    expect(screen.getByText("1 evento este mês")).toBeInTheDocument();
    expect(screen.queryByText("Sem eventos este mês")).not.toBeInTheDocument();
    expect(screen.queryByText("Mês sem eventos")).not.toBeInTheDocument();
  });

  it("um evento de vários dias dentro do mês conta UMA vez, não uma por dia", async () => {
    await montar([
      { ...NATAL_A_ANO_NOVO, date: "2026-01-09", endDate: "2026-01-11" } as unknown as Quote,
    ]);

    expect(screen.getByText("1 evento este mês")).toBeInTheDocument();
  });

  it("um pedido perdido desenha-se mas não conta — como no cartão do mês na vista de ano (auditoria de 14/11)", async () => {
    await montar([
      { ...NATAL_A_ANO_NOVO, date: "2026-01-09", endDate: undefined } as unknown as Quote,
      {
        ...NATAL_A_ANO_NOVO,
        id: "LIQ-2",
        name: "Rita Perdida",
        status: "rejeitado",
        date: "2026-01-20",
        endDate: undefined,
      } as unknown as Quote,
    ]);

    expect(screen.getAllByLabelText(/Abrir pedido de Rita Perdida/).length).toBeGreaterThan(0);
    expect(screen.getByText("1 evento este mês · 1 perdido")).toBeInTheDocument();
  });

  it("um mês só com um perdido NÃO abre o «Mês sem eventos» por baixo do cartão dele", async () => {
    await montar([
      {
        ...NATAL_A_ANO_NOVO,
        id: "LIQ-2",
        name: "Rita Perdida",
        status: "rejeitado",
        date: "2026-01-20",
        endDate: undefined,
      } as unknown as Quote,
    ]);

    // A grelha desenha-o…
    expect(screen.getAllByLabelText(/Abrir pedido de Rita Perdida/).length).toBeGreaterThan(0);
    // … portanto o mês não está vazio — só não tem eventos que contem.
    expect(screen.queryByText("Mês sem eventos")).not.toBeInTheDocument();
    expect(screen.getByText("Sem eventos este mês · 1 perdido")).toBeInTheDocument();
  });

  it("uma data por marcar ('a definir') não entra na contagem — a grelha também não a desenha", async () => {
    await montar([
      { ...NATAL_A_ANO_NOVO, date: "a definir", endDate: undefined } as unknown as Quote,
    ]);

    expect(screen.getByText("Sem eventos este mês")).toBeInTheDocument();
  });
});
