// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «PRÓXIMOS EVENTOS» — OS QUE VÃO MESMO ACONTECER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Achado F-10. O painel filtrava só por data, e uma auditoria em produção
 * contou TRÊS das seis entradas como pedidos PERDIDOS.
 *
 * Um trabalho que se perdeu não é um evento que se aproxima: é um casamento
 * que vai acontecer sem a Líquen lá. Com perdidos lá dentro, metade do que o
 * painel diz é falso — e é o tipo de erro que faz alguém deixar de olhar para
 * ele.
 *
 * A segunda metade do achado é o ANO. A lista lia-se «10 Set · 24 Out · 22 Mai»
 * e parecia desordenada. Estava certa — são anos diferentes —, e faltava a
 * única coisa que o dizia.
 */

const pedido = (over: Partial<Quote>): Quote =>
  ({
    id: "LIQ-1",
    name: "Ana e João",
    status: "cotado",
    date: "2026-09-10",
    guests: 80,
    ...over,
  }) as unknown as Quote;

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
  vi.setSystemTime(new Date("2026-08-26T12:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete process.env.TZ;
  vi.unstubAllGlobals();
});

async function montar(quotes: Quote[]) {
  render(
    <ToastProvider>
      <Calendario quotes={quotes} onOpen={() => {}} />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText("Próximos eventos")).toBeInTheDocument());
  // O painel dos próximos, e não a grelha — o mesmo nome aparece nos dois.
  return screen.getByText("Próximos eventos").parentElement as HTMLElement;
}

describe("os próximos eventos", () => {
  it("um pedido perdido não é um evento que se aproxima", async () => {
    const painel = await montar([
      pedido({ id: "LIQ-1", name: "Ana e João", date: "2026-09-10" }),
      pedido({ id: "LIQ-2", name: "Tara e Marty", date: "2026-09-12", status: "rejeitado" }),
    ]);

    expect(within(painel).getByText("Ana e João")).toBeTruthy();
    expect(within(painel).queryByText("Tara e Marty")).toBeNull();
  });

  /**
   * E os outros estados FICAM. Um pedido ainda por responder é precisamente o
   * que convém ver com a data a chegar — filtrar por «aceite» esvaziava o
   * painel de tudo o que ainda dá para ganhar.
   */
  it("mas um pedido por responder fica — é o que convém ver a aproximar-se", async () => {
    const painel = await montar([
      pedido({ id: "LIQ-3", name: "Margarida Serra", date: "2026-09-20", status: "pendente" }),
    ]);
    expect(within(painel).getByText("Margarida Serra")).toBeTruthy();
  });

  it("o ano aparece quando não é este — no cabeçalho do mês (fase 05)", async () => {
    const painel = await montar([
      pedido({ id: "LIQ-4", name: "Casamento deste ano", date: "2026-10-24" }),
      pedido({ id: "LIQ-5", name: "Casamento do ano seguinte", date: "2027-05-22" }),
    ]);
    // «Mai» sozinho lia-se antes de «Out» e parecia fora de ordem. Agora o
    // salto de sete meses vê-se à primeira: «Outubro» · «Maio 2027».
    expect(within(painel).getByRole("group", { name: "Maio 2027" })).toBeTruthy();
    expect(within(painel).getByRole("group", { name: "Outubro" })).toBeTruthy();
  });

  it("e não aparece no ano corrente — escrevê-lo em todas as linhas é ruído", async () => {
    const painel = await montar([pedido({ id: "LIQ-6", date: "2026-10-24" })]);
    expect(within(painel).queryByRole("group", { name: /2026/ })).toBeNull();
    expect(within(painel).queryByText("’26")).toBeNull();
  });

  it("agrupados por mês, pela ordem das datas (ponto 22)", async () => {
    const painel = await montar([
      pedido({ id: "A", name: "Um", date: "2026-09-26" }),
      pedido({ id: "B", name: "Dois", date: "2026-10-03" }),
      pedido({ id: "C", name: "Três", date: "2027-05-29" }),
    ]);
    const grupos = within(painel)
      .getAllByRole("group")
      .map((g) => g.getAttribute("aria-label"));
    expect(grupos).toEqual(["Setembro", "Outubro", "Maio 2027"]);
  });

  it("zero convidados é dado em falta, não um zero (ponto 24)", async () => {
    const painel = await montar([pedido({ id: "Z", guests: 0 })]);
    expect(within(painel).getByText(/Convidados por confirmar/)).toBeTruthy();
    expect(within(painel).queryByText(/0 convidados/)).toBeNull();
  });

  it("passar por um próximo realça o dia dele na grelha (ponto 25)", async () => {
    const painel = await montar([pedido({ id: "H", name: "Realçado", date: "2026-08-28" })]);
    const linha = within(painel).getByText("Realçado").closest("button")!;
    linha.focus();
    await waitFor(() =>
      expect(document.querySelector('[data-dia="2026-08-28"]')?.hasAttribute("data-realcado")).toBe(
        true,
      ),
    );
    linha.blur();
    await waitFor(() =>
      expect(document.querySelector('[data-dia="2026-08-28"]')?.hasAttribute("data-realcado")).toBe(
        false,
      ),
    );
  });
});
