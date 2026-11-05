// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Pagamentos from "./Pagamentos";
import type { Payment, Quote } from "@/lib/orcamento/types";

/**
 * A ÁREA DE PAGAMENTOS (5/11): os clientes que aceitaram, em três colunas, e o
 * lembrete pronto a copiar. As contas estão provadas em `cobrancas.test.ts`;
 * aqui prova-se o que se vê e o que se grava.
 */

const propostas = [
  { id: "p1", quoteId: "q1", status: "aceite", total: 5317.29, subtotal: 4323, pctSinal: 30 },
  { id: "p2", quoteId: "q2", status: "aceite", total: 1000, subtotal: 813.01, pctSinal: 30 },
];

function resposta(corpo: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => corpo,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function pedido(id: string, extra: Partial<Quote> = {}, payments: Payment[] = []): Quote {
  return {
    id,
    name: `TESTE ${id}`,
    status: "aceite",
    date: "2030-06-12",
    payments,
    activityLog: [],
    ...extra,
  } as unknown as Quote;
}

function desenhar(quotes: Quote[], onQuoteUpdated = vi.fn()) {
  return render(
    <ToastProvider>
      <Pagamentos quotes={quotes} userName="TESTE" onQuoteUpdated={onQuoteUpdated} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  __resetListCache();
  fetchMock = vi.fn(async (url: string) =>
    String(url).startsWith("/api/propostas") ? resposta(propostas) : resposta({}),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Pagamentos — o quadro por fases", () => {
  it("só os aceites entram, cada um na sua coluna, com o total da proposta aceite", async () => {
    desenhar([
      // O caso de 5/11: «Preço final» estragado, proposta aceite certa.
      pedido("q1", { quotedPrice: 4.323 }),
      pedido("q2", {}, [{ id: "a", kind: "sinal", amount: 300, date: "2026-10-01", paid: true }]),
      pedido("q3", { status: "cotado", quotedPrice: 2000 }),
    ]);
    const sinal = await screen.findByRole("region", { name: /Sinal por receber/ });
    await waitFor(() => expect(within(sinal).getByText("TESTE q1")).toBeInTheDocument());
    expect(within(sinal).getByText(/1595,19/)).toBeInTheDocument();
    expect(screen.queryByText(/5,32/)).not.toBeInTheDocument();
    const saldo = screen.getByRole("region", { name: /Saldo por receber/ });
    expect(within(saldo).getByText("TESTE q2")).toBeInTheDocument();
    // Um pedido só cotado não é uma cobrança.
    expect(screen.queryByText("TESTE q3")).not.toBeInTheDocument();
  });

  it("o atraso diz-se com palavra, não só com cor", async () => {
    desenhar([
      pedido("q2", {}, [{ id: "x", kind: "sinal", amount: 300, date: "2020-01-01", paid: false }]),
    ]);
    expect(await screen.findByText(/em atraso ·/)).toBeInTheDocument();
    expect(screen.getByText(/Em atraso · 1 cliente/)).toBeInTheDocument();
  });

  it("sem clientes aceites, diz porquê em vez de três colunas vazias", () => {
    desenhar([pedido("q3", { status: "cotado" })]);
    expect(screen.getByText("Ainda não há clientes com a proposta aceite")).toBeInTheDocument();
  });
});

describe("Pagamentos — o lembrete", () => {
  it("copia a mensagem e regista no histórico que foi preparada (nunca envia)", async () => {
    const user = userEvent.setup();
    const escrever = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: escrever },
    });
    const onQuoteUpdated = vi.fn();
    desenhar([pedido("q1")], onQuoteUpdated);
    await user.click(await screen.findByRole("button", { name: /TESTE q1/ }));
    await user.click(await screen.findByRole("button", { name: "Copiar mensagem" }));

    expect(escrever).toHaveBeenCalledTimes(1);
    const texto = String((escrever.mock.calls as unknown as string[][])[0][0]);
    expect(texto).toContain("o sinal de 30%");
    expect(texto).toContain("1595,19");

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url) === "/api/orcamento/q1" && String(init?.body).includes("activityLogAppend"),
        ),
      ).toBe(true),
    );
    const chamada = fetchMock.mock.calls.find(
      (c: unknown[]) => String(c[0]) === "/api/orcamento/q1",
    ) as [string, RequestInit];
    const init = chamada[1];
    const corpo = JSON.parse(String(init.body));
    expect(corpo.activityLogAppend[0]).toMatchObject({ kind: "message_sent", actor: "TESTE" });
    expect(corpo.activityLogAppend[0].summary).toMatch(/preparado/);
    // O lembrete não mexe em mais nada do pedido.
    expect(Object.keys(corpo)).toEqual(["activityLogAppend"]);
  });
});
