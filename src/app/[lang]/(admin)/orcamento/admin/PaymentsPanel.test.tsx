// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import PaymentsPanel from "./PaymentsPanel";
import type { Payment, Quote } from "@/lib/orcamento/types";

/**
 * REGISTAR UM PAGAMENTO TEM DE CUSTAR UMA MÃO NO TECLADO.
 *
 * A dona usa este painel dezenas de vezes por proposta, muitas vezes com o
 * cliente ao telefone. O que estes testes fixam é o caminho curto:
 *   · Enter em QUALQUER campo regista (o <form> dá submissão implícita);
 *   · depois de registar, o foco volta ao PRIMEIRO campo (encadear sem rato);
 *   · uma sugestão preenche o valor com um clique;
 *   · o valor de uma linha edita-se ali mesmo, sem modal;
 *   · e se o servidor recusar, o ecrã reverte E mostra a linha marcada com
 *     "Repetir" — o dinheiro no ecrã nunca pode divergir da base de dados.
 */

const okResponse = () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

/** Total c/ IVA = 1230 € → sinal 30% = 369 €. */
function makeQuote(payments: Payment[] = []): Quote {
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

/** Corpo `payments` do último PATCH ao orçamento. */
function lastSavedPayments(): Payment[] {
  const calls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/orcamento/"));
  const last = calls[calls.length - 1];
  return JSON.parse(String((last[1] as RequestInit).body)).payments as Payment[];
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

describe("PaymentsPanel — linha única de registo", () => {
  it("Enter no campo Valor regista o pagamento", async () => {
    const user = userEvent.setup();
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 100, date: "2026-01-10", paid: true }]),
    );

    const valor = screen.getByLabelText("Valor em euros");
    await user.clear(valor);
    await user.type(valor, "1.500{Enter}");

    await waitFor(() => expect(lastSavedPayments()).toHaveLength(2));
    // "1.500" é hábito pt-PT: mil e quinhentos, não 1,5 €.
    expect(lastSavedPayments()[1].amount).toBe(1500);
  });

  it("Enter no campo Método também regista (submissão implícita do <form>)", async () => {
    const user = userEvent.setup();
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 100, date: "2026-01-10", paid: true }]),
    );

    await user.type(screen.getByLabelText("Valor em euros"), "250,50");
    await user.type(screen.getByLabelText("Método ou nota (opcional)"), "MB Way{Enter}");

    await waitFor(() => expect(lastSavedPayments()).toHaveLength(2));
    expect(lastSavedPayments()[1]).toMatchObject({ amount: 250.5, note: "MB Way", paid: true });
  });

  it("depois de registar, o foco volta ao primeiro campo e o valor fica limpo", async () => {
    const user = userEvent.setup();
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 100, date: "2026-01-10", paid: true }]),
    );

    const valor = screen.getByLabelText("Valor em euros");
    await user.type(valor, "300{Enter}");

    await waitFor(() => expect(lastSavedPayments()).toHaveLength(2));
    expect(screen.getByLabelText("Tipo de pagamento")).toHaveFocus();
    expect(valor).toHaveValue("");
  });

  it("um clique numa sugestão preenche o valor", async () => {
    const user = userEvent.setup();
    // 300 € já recebidos de 1230 € → em falta 930 €.
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 300, date: "2026-01-10", paid: true }]),
    );

    const valor = screen.getByLabelText("Valor em euros");
    expect(valor).toHaveValue("");

    await user.click(screen.getByRole("button", { name: /Em falta/ }));
    expect(valor).toHaveValue("930,00");

    await user.click(screen.getByRole("button", { name: /Sinal 30%/ }));
    expect(valor).toHaveValue("369,00");
  });

  it("com o painel vazio, a linha já traz o sinal sugerido (nenhuma caixa de aviso)", () => {
    renderPanel(makeQuote());
    expect(screen.getByLabelText("Valor em euros")).toHaveValue("369,00");
  });

  it("carregar em Registar sem valor não bloqueia o botão — aponta o erro e devolve o foco", async () => {
    const user = userEvent.setup();
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 100, date: "2026-01-10", paid: true }]),
    );

    const registar = screen.getByRole("button", { name: "Registar" });
    expect(registar).toBeEnabled();
    await user.click(registar);

    expect(await screen.findByText(/Escreve um valor maior que zero/)).toBeInTheDocument();
    expect(screen.getByLabelText("Valor em euros")).toHaveFocus();
  });
});

describe("PaymentsPanel — lista", () => {
  it("edição inline do valor grava (clico, altero, Enter)", async () => {
    const user = userEvent.setup();
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 369, date: "2026-01-10", paid: true }]),
    );

    await user.click(screen.getByRole("button", { name: /Editar valor de Sinal/ }));
    const editor = screen.getByLabelText("Valor de Sinal em euros");
    expect(editor).toHaveFocus();

    await user.clear(editor);
    await user.type(editor, "400{Enter}");

    await waitFor(() => expect(lastSavedPayments()[0].amount).toBe(400));
    // Volta a ser texto — sem modal, sem campo aberto por engano.
    expect(screen.queryByLabelText("Valor de Sinal em euros")).not.toBeInTheDocument();
  });

  it("o badge de estado alterna pago/pendente", async () => {
    const user = userEvent.setup();
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 369, date: "2026-01-10", paid: false }]),
    );

    const badge = screen.getByRole("switch");
    expect(badge).toHaveAttribute("aria-checked", "false");
    await user.click(badge);

    await waitFor(() => expect(lastSavedPayments()[0].paid).toBe(true));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("se o servidor recusar, reverte E deixa a linha com um Repetir", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith("/api/orcamento/")
        ? ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
        : okResponse(),
    );
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 300, date: "2026-01-10", paid: true }]),
    );

    await user.type(screen.getByLabelText("Valor em euros"), "930{Enter}");

    // Reverteu (só o pagamento antigo continua na lista)…
    const repetir = await screen.findByRole("button", { name: "Repetir" });
    expect(screen.getByText("Não guardado")).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(1);

    // …e o Repetir volta a tentar a MESMA gravação.
    fetchMock.mockImplementation(async () => okResponse());
    await user.click(repetir);
    await waitFor(() => expect(lastSavedPayments()).toHaveLength(2));
    expect(screen.queryByText("Não guardado")).not.toBeInTheDocument();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ATALHO DO SINAL TEM DE DAR O MESMO NÚMERO QUE A FACTURA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A percentagem do sinal é uma caixa editável na proposta, e é ela que as
 * rotas de facturação usam (`depositPercentOf`). Este painel dividia sempre
 * 30/70: numa proposta de 50%, o botão oferecia 369 € e a factura emitida era
 * de 615 €. Ela regista o que o botão diz, e o «Em falta» fica errado a partir
 * daí — sem nada no ecrã a denunciá-lo.
 */
describe("PaymentsPanel — o sinal sugerido é o da proposta", () => {
  beforeEach(() => {
    __resetListCache();
  });

  const comProposta = (pctSinal: number) =>
    vi.fn(async (url: string) =>
      String(url).startsWith("/api/propostas")
        ? ({
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => [{ id: "p1", quoteId: "q1", pctSinal }],
          } as unknown as Response)
        : okResponse(),
    );

  /**
   * ── O TOTAL É O DA PROPOSTA ACEITE (5/11) ─────────────────────────────────
   * Ela: o cliente aceitou a proposta por 4.500 € e o painel dizia «5 €» a
   * pagar. O painel fazia as contas pelo «Preço final (sem IVA)» do pedido, e
   * num cliente esse campo tinha 4,323 € em vez de 4.323 €. O total que o
   * cliente aceitou está na proposta, e é esse que manda.
   */
  it("com uma proposta aceite, o total é o dela — não o preço do pedido", async () => {
    fetchMock = vi.fn(async (url: string) =>
      String(url).startsWith("/api/propostas")
        ? ({
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => [
              // Uma revisão mais nova, por aceitar, não passa à frente da aceite.
              { id: "p2", quoteId: "q1", status: "enviada", total: 9071.25, subtotal: 7375 },
              {
                id: "p1",
                quoteId: "q1",
                status: "aceite",
                total: 5317.29,
                subtotal: 4323,
                vatRate: 0.23,
                pctSinal: 30,
              },
            ],
          } as unknown as Response)
        : okResponse(),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPanel({
      ...makeQuote(),
      priceBreakdown: undefined,
      quotedPrice: 4.323,
    } as unknown as Quote);

    await waitFor(() => expect(screen.getAllByText("5317,29 €").length).toBeGreaterThan(0));
    expect(screen.queryByText("5,32 €")).not.toBeInTheDocument();
    // O sinal de 30% sai do total aceite.
    expect(screen.getByRole("button", { name: /Sinal 30%/ }).textContent).toMatch(/1595,19/);
  });

  it("os meios habituais aparecem com ícone, e um clique escreve o método", async () => {
    const user = userEvent.setup();
    renderPanel(makeQuote());
    const mbway = screen.getByRole("button", { name: "MB Way" });
    expect(mbway.querySelector('svg[data-meio="mbway"]')).not.toBeNull();
    await user.click(mbway);
    expect(screen.getByLabelText("Método ou nota (opcional)")).toHaveValue("MB Way");
    expect(mbway).toHaveAttribute("aria-pressed", "true");
  });

  it("uma proposta de 50% sugere metade do total", async () => {
    fetchMock = comProposta(50);
    vi.stubGlobal("fetch", fetchMock);
    renderPanel(makeQuote());

    // Total c/ IVA = 1230 € → 50% = 615 €.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Sinal 50%/ }).textContent).toMatch(/615,00/),
    );
  });

  /**
   * ── E O CAMPO TEM DE SEGUIR O ATALHO QUE ESTÁ AO LADO ────────────────────
   * O painel vazio abre com o sinal já escrito no campo, para bastar carregar
   * em Registar. Só que a percentagem da proposta chega DEPOIS do primeiro
   * desenho (vem da lista leve, por rede), e o pré-preenchimento era feito uma
   * única vez, com a percentagem da casa: o campo ficava com 369,00 € e o
   * atalho logo ao lado dizia «Sinal 50% · 615,00 €».
   *
   * Dois números diferentes para a mesma coisa, no mesmo ecrã, e o que ela
   * carrega é o botão Registar — que grava o que está NO CAMPO. É a mesma
   * divergência que já se corrigiu no atalho, a acabar no mesmo sítio: um
   * sinal de 369 € num evento cuja factura de sinal é de 615 €.
   */
  it("o campo pré-preenchido acompanha a percentagem da proposta quando ela chega", async () => {
    fetchMock = comProposta(50);
    vi.stubGlobal("fetch", fetchMock);
    renderPanel(makeQuote());

    // A espera é pelo CAMPO, e não pelo botão ao lado: o botão desenha-se com a
    // percentagem nova no mesmo instante em que ela chega, mas quem escreve no
    // campo é um `useEffect` — corre DEPOIS desse desenho. Há por isso um
    // desenho intermédio, verdadeiro e curto, em que o botão já diz «Sinal 50% ·
    // 615,00 €» e o campo ainda tem os 369,00 € da percentagem da casa. Esperar
    // pelo botão e só então olhar para o campo era apanhar essa fresta: passava
    // na máquina de quem escreveu o teste e falhava na integração, com a
    // máquina cheia. Falhou mesmo, no CI, com «expected 615,00, received
    // 369,00». O que este teste quer dizer é «o campo acaba por acompanhar» —
    // então é pelo campo que se espera.
    await waitFor(() => expect(screen.getByLabelText("Valor em euros")).toHaveValue("615,00"));
    expect(screen.getByRole("button", { name: /Sinal 50%/ })).toBeInTheDocument();
  });

  it("mas o que ela escreveu no campo manda sempre — nada lho apaga por baixo", async () => {
    fetchMock = comProposta(50);
    vi.stubGlobal("fetch", fetchMock);
    renderPanel(makeQuote());

    const user = userEvent.setup();
    const valor = screen.getByLabelText("Valor em euros");
    await user.clear(valor);
    await user.type(valor, "1.000");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Sinal 50%/ })).toBeInTheDocument(),
    );
    expect(valor).toHaveValue("1.000");
  });

  it("sem proposta que diga outra coisa, continua a ser 30%", async () => {
    renderPanel(makeQuote());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Sinal 30%/ }).textContent).toMatch(/369,00/),
    );
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DE ONDE ESTA LISTA FOI COPIADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel copia `quote.payments` uma vez, ao montar, e ao gravar manda a lista
 * INTEIRA — portanto a gravação é «substitui a lista de pagamentos por esta».
 * Uma cópia de há duas horas escrevia por cima do que entretanto aconteceu: um
 * sinal dado por recebido no portátil voltava a «por receber» quando ela tocava
 * o telemóvel à tarde, com as duas gravações a responder 200.
 *
 * O ecrã passa a DIZER de onde copiou; o servidor recusa com 409 quando essa
 * base já não é a que tem guardada (ver `api/orcamento/[id]/route.ts`).
 */
describe("PaymentsPanel — a base de que a lista partiu", () => {
  /** Corpo `base` do último PATCH ao orçamento. */
  function lastBase(): { payments?: Payment[] } {
    const calls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/orcamento/"));
    const last = calls[calls.length - 1];
    return JSON.parse(String((last[1] as RequestInit).body)).base as { payments?: Payment[] };
  }

  const P0: Payment = { id: "p0", kind: "sinal", amount: 100, date: "2026-01-10", paid: true };

  it("manda a lista de que partiu, e não a que está a gravar", async () => {
    const user = userEvent.setup();
    renderPanel(makeQuote([P0]));

    await user.type(screen.getByLabelText("Valor em euros"), "1500{Enter}");

    await waitFor(() => expect(lastSavedPayments()).toHaveLength(2));
    // A base é o que estava ANTES desta gravação — uma linha, não duas.
    expect(lastBase().payments).toEqual([P0]);
  });

  it("dois registos seguidos: o segundo declara o que o primeiro deixou", async () => {
    const user = userEvent.setup();
    renderPanel(makeQuote([P0]));

    await user.type(screen.getByLabelText("Valor em euros"), "1500{Enter}");
    await waitFor(() => expect(lastSavedPayments()).toHaveLength(2));
    const primeira = lastSavedPayments();

    await user.type(screen.getByLabelText("Valor em euros"), "2500{Enter}");
    await waitFor(() => expect(lastSavedPayments()).toHaveLength(3));

    // Sem isto, o segundo pedido declarava a versão de antes do primeiro e o
    // servidor recusava-o — uma colisão inventada, dela consigo própria.
    expect(lastBase().payments).toEqual(primeira);
  });

  it("num 409, adopta a lista do servidor em vez de insistir", async () => {
    const user = userEvent.setup();
    const doServidor: Payment[] = [
      { ...P0, paid: true },
      { id: "outro", kind: "pagamento", amount: 500, date: "2026-02-01", paid: true },
    ];
    fetchMock.mockImplementation(
      async () =>
        ({
          ok: false,
          status: 409,
          json: async () => ({ error: "mudou", current: { payments: doServidor } }),
        }) as unknown as Response,
    );
    const onChange = vi.fn();
    renderPanel(makeQuote([P0]), onChange);

    await user.type(screen.getByLabelText("Valor em euros"), "1500{Enter}");

    // O painel fica com o que o SERVIDOR tem — não com o que ela tinha.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(doServidor));
    expect(await screen.findByText(/alterados noutro sítio/i)).toBeTruthy();
    // E NÃO oferece «Repetir»: repetir era escrever por cima do trabalho da
    // outra pessoa, que é o que este guarda existe para impedir.
    expect(screen.queryByRole("button", { name: /repetir/i })).toBeNull();
  });

  it("numa falha de rede continua a reverter e a oferecer «Repetir»", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async () => {
      throw new Error("rede");
    });
    renderPanel(makeQuote([P0]));

    await user.type(screen.getByLabelText("Valor em euros"), "1500{Enter}");

    // Controlo positivo do par acima: o caminho antigo não mudou.
    expect(await screen.findByRole("button", { name: /repetir/i })).toBeTruthy();
  });
});
