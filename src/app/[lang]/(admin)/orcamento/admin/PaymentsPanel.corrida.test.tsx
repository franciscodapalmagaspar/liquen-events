// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import PaymentsPanel from "./PaymentsPanel";
import type { Payment, Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DOIS PATCH NO AR, E A RESPOSTA QUE CHEGA ATRASADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A reversão deste painel guardava `const snapshot = payments` ANTES do pedido
 * e repunha esse instante quando o servidor recusava. Entre o envio e a
 * resposta cabe outra gravação inteira — e neste painel cabe mesmo: dar um
 * sinal por recebido e registar o saldo a seguir são dois toques seguidos.
 *
 * O CENÁRIO, com dinheiro: ela dá o sinal de 300 € por recebido e, sem
 * esperar, regista o saldo de 930 €. O segundo pedido leva a lista INTEIRA —
 * já com o sinal recebido lá dentro — e é aceite. O primeiro volta com um 503
 * do balanceador e repunha o snapshot: o saldo de 930 € desaparecia do ecrã
 * apesar de estar gravado, o «Em falta» passava a mentir, e o toque seguinte
 * dela gravava esse ecrã por cima da verdade.
 *
 * O que estes testes fixam é o contador (`gravacoes`) e a referência ao último
 * estado CONFIRMADO pelo servidor (`gravado`): uma resposta atrasada de uma
 * gravação já ultrapassada não mexe no ecrã, não marca linha nenhuma e não
 * diz nada — porque o que a gravação mais recente levou CONTÉM o que ela
 * levava.
 */

const okResponse = () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response;
const falha = (status: number) =>
  ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

const SINAL: Payment = { id: "p0", kind: "sinal", amount: 300, date: "2026-01-10", paid: false };

/** Total c/ IVA = 1230 €, como no resto dos testes deste painel. */
function makeQuote(payments: Payment[]): Quote {
  return {
    id: "q1",
    name: "Ana & Rui",
    email: "ana@exemplo.pt",
    priceBreakdown: { subtotal: 1000, iva: 230, total: 1230 },
    payments,
  } as unknown as Quote;
}

function renderPanel(quote: Quote, onChange = vi.fn()) {
  return render(
    <ToastProvider>
      <PaymentsPanel quote={quote} onChange={onChange} />
    </ToastProvider>,
  );
}

/** Os PATCH ao orçamento, pela ordem por que saíram. */
function patches(): { payments: Payment[]; base?: { payments?: Payment[] } }[] {
  return (
    fetchMock.mock.calls
      // Só as gravações: o cartão do Moloni (ao fundo do painel) também lê
      // `/api/orcamento/<id>/moloni` quando abre, sem corpo.
      .filter((c) => String(c[0]).startsWith("/api/orcamento/") && !!(c[1] as RequestInit)?.body)
      .map((c) => JSON.parse(String((c[1] as RequestInit).body)))
  );
}

beforeEach(() => {
  fetchMock = vi.fn(async () => okResponse());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PaymentsPanel — duas gravações no ar, respostas fora de ordem", () => {
  /**
   * Põe a primeira gravação em espera e deixa passar as seguintes. Devolve a
   * torneira que a faz falhar, para a resposta chegar DEPOIS da segunda.
   */
  function primeiraEmEspera(status = 503) {
    let recusar: () => void = () => {};
    const pendente = new Promise<Response>((resolve) => {
      recusar = () => resolve(falha(status));
    });
    let n = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (!String(url).startsWith("/api/orcamento/")) return okResponse();
      return ++n === 1 ? pendente : okResponse();
    });
    return () => recusar();
  }

  it("a que falha não apaga do ecrã o pagamento que o servidor aceitou", async () => {
    const recusarPrimeira = primeiraEmEspera();
    const user = userEvent.setup();
    renderPanel(makeQuote([SINAL]));

    // 1º toque: o sinal passa a recebido (pedido no ar, sem resposta).
    await user.click(screen.getByRole("switch", { name: /Estado de Sinal 300/ }));
    // 2º toque: regista o saldo de 930 € — este é aceite.
    await user.type(screen.getByLabelText("Valor em euros"), "930{Enter}");
    await waitFor(() => expect(screen.getAllByRole("switch")).toHaveLength(2));

    recusarPrimeira();
    await new Promise((r) => setTimeout(r, 0));

    expect(
      screen.getAllByRole("switch"),
      "o pagamento que o servidor aceitou desapareceu do ecrã",
    ).toHaveLength(2);
    expect(
      screen.getByRole("switch", { name: /Estado de Sinal 300/ }).getAttribute("aria-checked"),
      "o sinal seguiu no segundo PATCH (aceite) e foi desmarcado à mesma",
    ).toBe("true");
    // Nem linha marcada nem «Repetir»: repetir mandaria a lista velha, sem o
    // saldo — e o aviso falaria de uma gravação que já está feita.
    expect(screen.queryByText("Não guardado")).toBeNull();
    expect(screen.queryByRole("button", { name: "Repetir" })).toBeNull();
  });

  it("e a base da gravação seguinte é a que o servidor aceitou, não a de antes da falha", async () => {
    const recusarPrimeira = primeiraEmEspera();
    const user = userEvent.setup();
    renderPanel(makeQuote([SINAL]));

    await user.click(screen.getByRole("switch", { name: /Estado de Sinal 300/ }));
    await user.type(screen.getByLabelText("Valor em euros"), "930{Enter}");
    await waitFor(() => expect(patches()).toHaveLength(2));
    const aceite = patches()[1].payments;

    recusarPrimeira();
    await new Promise((r) => setTimeout(r, 0));

    // Terceiro gesto: a base declarada tem de ser a lista que ficou gravada.
    // Repor a base para antes da gravação falhada dava um 409 inventado — e o
    // 409 apaga do ecrã o que ela estava a escrever.
    await user.type(screen.getByLabelText("Valor em euros"), "100{Enter}");
    await waitFor(() => expect(patches()).toHaveLength(3));
    expect(patches()[2].base?.payments).toEqual(aceite);
  });

  it("sozinha, uma gravação falhada continua a reverter, a marcar a linha e a avisar", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith("/api/orcamento/") ? falha(500) : okResponse(),
    );
    const user = userEvent.setup();
    renderPanel(makeQuote([SINAL]));

    await user.type(screen.getByLabelText("Valor em euros"), "930{Enter}");

    // Controlo positivo: sem gravação mais recente por cima, o caminho antigo
    // é o mesmo — o dinheiro no ecrã não pode divergir da base de dados.
    expect(await screen.findByRole("button", { name: "Repetir" })).toBeTruthy();
    expect(screen.getByText("Não guardado")).toBeTruthy();
    expect(screen.getAllByRole("switch")).toHaveLength(1);
  });

  it("e o caso feliz continua mudo", async () => {
    const user = userEvent.setup();
    renderPanel(makeQuote([SINAL]));

    await user.click(screen.getByRole("switch", { name: /Estado de Sinal 300/ }));
    await user.type(screen.getByLabelText("Valor em euros"), "930{Enter}");
    await waitFor(() => expect(patches()).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText("Não guardado")).toBeNull();
    expect(screen.queryByRole("button", { name: "Repetir" })).toBeNull();
    expect(screen.queryByText(/não deu para|alterados noutro sítio/i)).toBeNull();
    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });
});
