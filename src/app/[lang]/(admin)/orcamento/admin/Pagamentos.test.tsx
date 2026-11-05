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

/** Os PATCH ao pedido, por ordem, já lidos. */
function patches(id: string) {
  return fetchMock.mock.calls
    .filter(
      (c: unknown[]) =>
        String(c[0]) === `/api/orcamento/${id}` && (c[1] as RequestInit)?.method === "PATCH",
    )
    .map((c: unknown[]) => JSON.parse(String((c[1] as RequestInit).body)));
}

describe("Pagamentos — «Recebido» no cartão", () => {
  it("passa a prevista a recebida, grava com a base, e «Anular» repõe", async () => {
    const user = userEvent.setup();
    const prevista: Payment = {
      id: "s1",
      kind: "sinal",
      amount: 1595.19,
      date: "2030-01-10",
      paid: false,
    };
    const onQuoteUpdated = vi.fn();
    desenhar([pedido("q1", {}, [prevista])], onQuoteUpdated);
    const cartao = await screen.findByRole("article", { name: "TESTE q1" });
    await user.click(within(cartao).getByRole("button", { name: /Recebido/ }));

    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Recebido o sinal")).toBeInTheDocument();
    expect(within(dialogo).getByRole("textbox")).toHaveValue("1595,19");
    await user.click(within(dialogo).getByRole("button", { name: /MB Way/ }));
    await user.click(within(dialogo).getByRole("button", { name: "Registar" }));

    await waitFor(() => expect(patches("q1")).toHaveLength(1));
    const [corpo] = patches("q1");
    expect(corpo.base).toEqual({ payments: [prevista] });
    expect(corpo.payments).toHaveLength(1);
    expect(corpo.payments[0]).toMatchObject({
      id: "s1",
      kind: "sinal",
      amount: 1595.19,
      paid: true,
      note: "MB Way",
    });
    expect(onQuoteUpdated).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "q1", payments: corpo.payments }),
    );

    await user.click(await screen.findByRole("button", { name: "Anular" }));
    await waitFor(() => expect(patches("q1")).toHaveLength(2));
    const volta = patches("q1")[1];
    expect(volta.payments).toEqual([prevista]);
    expect(volta.base).toEqual({ payments: corpo.payments });
    await waitFor(() =>
      expect(onQuoteUpdated).toHaveBeenLastCalledWith(
        expect.objectContaining({ payments: [prevista] }),
      ),
    );
  });

  it("Enter no valor regista, sem ter de ir ao botão", async () => {
    const user = userEvent.setup();
    desenhar([pedido("q1")]);
    const cartao = await screen.findByRole("article", { name: "TESTE q1" });
    await user.click(within(cartao).getByRole("button", { name: /Recebido/ }));
    const campo = within(await screen.findByRole("dialog")).getByRole("textbox");
    await user.clear(campo);
    await user.type(campo, "500{Enter}");
    await waitFor(() => expect(patches("q1")).toHaveLength(1));
    expect(patches("q1")[0].payments[0]).toMatchObject({ kind: "sinal", amount: 500, paid: true });
  });

  it("um valor vazio não grava, e diz porquê", async () => {
    const user = userEvent.setup();
    desenhar([pedido("q1")]);
    const cartao = await screen.findByRole("article", { name: "TESTE q1" });
    await user.click(within(cartao).getByRole("button", { name: /Recebido/ }));
    const dialogo = await screen.findByRole("dialog");
    await user.clear(within(dialogo).getByRole("textbox"));
    await user.click(within(dialogo).getByRole("button", { name: "Registar" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(/maior do que zero/);
    expect(patches("q1")).toHaveLength(0);
  });

  it("se alguém mexeu entretanto (409), não escreve por cima: adopta a versão guardada", async () => {
    const user = userEvent.setup();
    const doServidor: Payment[] = [
      { id: "z", kind: "sinal", amount: 1595.19, date: "2026-11-01", paid: true },
    ];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/propostas")) return resposta(propostas);
      if (init?.method === "PATCH")
        return {
          ok: false,
          status: 409,
          headers: new Headers(),
          json: async () => ({ current: { payments: doServidor } }),
        } as unknown as Response;
      return resposta({});
    });
    const onQuoteUpdated = vi.fn();
    desenhar([pedido("q1")], onQuoteUpdated);
    const cartao = await screen.findByRole("article", { name: "TESTE q1" });
    await user.click(within(cartao).getByRole("button", { name: /Recebido/ }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Registar" }),
    );
    expect(await screen.findByText(/mudaram noutro sítio/)).toBeInTheDocument();
    expect(onQuoteUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ id: "q1", payments: doServidor }),
    );
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
  });
});

describe("Pagamentos — filtro, procura e previsão", () => {
  it("«Precisa de mim» deixa só os atrasados e os que vencem esta semana", async () => {
    const user = userEvent.setup();
    desenhar([
      // Em atraso.
      pedido("q2", {}, [{ id: "x", kind: "sinal", amount: 300, date: "2020-01-01", paid: false }]),
      // Com prazo longe.
      pedido("q1", {}, [{ id: "y", kind: "sinal", amount: 300, date: "2099-01-01", paid: false }]),
    ]);
    await screen.findByRole("article", { name: "TESTE q1" });
    await user.click(screen.getByRole("radio", { name: /Precisa de mim · 1/ }));
    expect(screen.getByRole("article", { name: "TESTE q2" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "TESTE q1" })).not.toBeInTheDocument();
    // A coluna dos pagos não faz sentido aqui.
    expect(screen.queryByRole("region", { name: /Pago/ })).not.toBeInTheDocument();
  });

  it("procurar ignora maiúsculas e acentos", async () => {
    const user = userEvent.setup();
    desenhar([pedido("q1", { name: "TESTE Conceição" }), pedido("q2", { name: "TESTE Rui" })]);
    await screen.findByRole("article", { name: "TESTE Rui" });
    await user.type(screen.getByRole("searchbox", { name: "Procurar cliente" }), "conceicao");
    expect(screen.getByRole("article", { name: "TESTE Conceição" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "TESTE Rui" })).not.toBeInTheDocument();
  });

  it("a previsão mostra seis meses, com o que se espera em cada um", async () => {
    desenhar([
      pedido("q2", {}, [{ id: "x", kind: "sinal", amount: 300, date: "2020-01-01", paid: false }]),
    ]);
    const lista = await screen.findByRole("list", { name: "Previsão por mês" });
    const meses = within(lista).getAllByRole("listitem");
    expect(meses).toHaveLength(6);
    // O sinal em atraso conta já, no mês de hoje.
    expect(meses[0]).toHaveTextContent(/300/);
  });
});
