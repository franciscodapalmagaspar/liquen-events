// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import Overview from "./Overview";
import { __resetListCache } from "./useCachedList";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS NÚMEROS QUE ELA NÃO PERCEBE, E O QUE ESTÁ PENDURADO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Não dá para perceber qual é o dinheiro que ganhamos.» Os
 * números existiam todos — o que não existia era o rótulo por baixo a dizer o
 * que cada um conta. Um número em que ela não confia vale zero.
 *
 * E a lista do que está à espera de resposta: propostas enviadas há mais de uma
 * semana em que ninguém marcou nada. É onde o dinheiro está pendurado.
 */

const HOJE = new Date("2026-08-14T09:00:00.000Z");

const enviadaEm = (iso: string) => [
  { id: `e-${iso}`, at: iso, kind: "proposal_sent" as const, summary: "Proposta enviada" },
];

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "q1",
    submittedAt: "2026-07-01T10:00:00.000Z",
    status: "cotado",
    name: "Ana e Rui",
    email: "ana@exemplo.pt",
    category: "particulares",
    eventType: "casamentos",
    guests: 100,
    ...over,
  }) as Quote;

function desenhar(quotes: Quote[], extra: Partial<React.ComponentProps<typeof Overview>> = {}) {
  return render(
    <Overview
      quotes={quotes}
      userName="Catarina"
      onOpen={vi.fn()}
      onGoStats={vi.fn()}
      onGo={vi.fn()}
      onNew={vi.fn()}
      {...extra}
    />,
  );
}

beforeEach(() => {
  __resetListCache?.();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(HOJE);
  // O painel arrasta consigo os lembretes e a agenda, que lêem listas próprias.
  // Sem uma resposta por rota, o que rebenta é o vizinho e não o que se mede.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () =>
        String(url).startsWith("/api/visao-geral")
          ? {
              notas: { id: "notas", value: "", revision: 0, updatedAt: HOJE.toISOString() },
              meta: { id: "meta", value: "", revision: 0, updatedAt: HOJE.toISOString() },
            }
          : [],
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("os três números em cima", () => {
  const quotes = [
    pedido({ id: "ganho", status: "aceite", quotedPrice: 8000, lastUpdated: HOJE.toISOString() }),
    pedido({ id: "espera", status: "cotado", quotedPrice: 4600 }),
    pedido({
      id: "pago",
      status: "aceite",
      quotedPrice: 2000,
      payments: [
        { id: "p1", kind: "sinal", amount: 600, date: "2026-08-01", paid: true },
        { id: "p2", kind: "saldo", amount: 1400, date: "2026-09-20", paid: false },
      ],
    }),
  ];

  it("dá destaque a Ganho, À espera e Recebido", () => {
    desenhar(quotes);
    const painel = screen.getByRole("group", { name: /dinheiro/i });
    expect(within(painel).getByText("Ganho")).toBeInTheDocument();
    expect(within(painel).getByText("À espera")).toBeInTheDocument();
    expect(within(painel).getByText("Recebido")).toBeInTheDocument();
  });

  it("escreve por baixo de cada um o que está a contar", () => {
    desenhar(quotes);
    const painel = screen.getByRole("group", { name: /dinheiro/i });
    expect(within(painel).getByText(/propostas que marcaste como ganhas/i)).toBeInTheDocument();
    expect(within(painel).getByText(/propostas enviadas.*ainda sem resposta/i)).toBeInTheDocument();
    expect(within(painel).getByText(/pagamentos.*já.*recebidos/i)).toBeInTheDocument();
  });

  it("os três números estão todos com IVA, que é a unidade do Recebido", () => {
    desenhar(quotes);
    const painel = screen.getByRole("group", { name: /dinheiro/i });
    /**
     * O «Preço final» que ela escreve no ecrã é SEM IVA; as linhas de pagamento
     * são COM IVA. Enquanto o Ganho somava um e o Recebido somava o outro, um
     * casamento pago a 100% aparecia com Recebido 23% acima do Ganho — dois
     * números que não podem estar certos ao mesmo tempo, na mesma fila.
     *
     * Ganho = (8000 + 2000) x 1,23 = 12.300 €. À espera = 4600 x 1,23 = 5658 €.
     * Recebido = 600 €, que já era bruto e não muda.
     */
    expect(within(painel).getByText("12 300 €")).toBeInTheDocument();
    expect(within(painel).getByText("5 658 €")).toBeInTheDocument();
    expect(within(painel).getByText("600 €")).toBeInTheDocument();
  });

  it("um casamento pago por inteiro não mostra Recebido acima do Ganho", () => {
    // O caso que denunciava a mistura de unidades, escrito como asserção: o
    // sinal e o saldo somam exactamente o contratado com IVA.
    desenhar([
      pedido({
        id: "todo-pago",
        status: "aceite",
        quotedPrice: 10000,
        payments: [
          { id: "s", kind: "sinal", amount: 3690, date: "2026-06-01", paid: true },
          { id: "r", kind: "saldo", amount: 8610, date: "2026-08-01", paid: true },
        ],
      }),
    ]);
    const painel = screen.getByRole("group", { name: /dinheiro/i });
    // 10.000 x 1,23 = 12.300, dos dois lados. O mesmo número, duas vezes.
    expect(within(painel).getAllByText("12 300 €")).toHaveLength(2);
  });
});

describe("à espera de resposta", () => {
  it("lista as propostas enviadas há uma semana ou mais, com o valor ao lado", () => {
    desenhar([
      pedido({
        id: "velha",
        quotedPrice: 4600,
        activityLog: enviadaEm("2026-08-01T09:00:00.000Z"),
      }),
      pedido({
        id: "fresca",
        name: "Sofia",
        quotedPrice: 3000,
        activityLog: enviadaEm("2026-08-13T09:00:00.000Z"),
      }),
    ]);
    const seccao = screen.getByRole("region", { name: /à espera de resposta/i });
    const lista = within(seccao).getByRole("list");
    expect(within(lista).getByText("Ana e Rui")).toBeInTheDocument();
    expect(within(lista).queryByText("Sofia")).toBeNull();
    // Com IVA (4600 + 23 %), como o quadrado «À espera» lá em cima — pedido
    // dela de 14/10: os números de um ecrã têm de bater com os do outro.
    expect(within(lista).getByText("5 658 €")).toBeInTheDocument();
  });

  it("diz quantos dias espera cada uma e quanto está pendurado ao todo", () => {
    desenhar([
      pedido({ id: "a", quotedPrice: 4600, activityLog: enviadaEm("2026-08-01T09:00:00.000Z") }),
      pedido({
        id: "b",
        name: "Marta",
        quotedPrice: 2400,
        activityLog: enviadaEm("2026-08-04T09:00:00.000Z"),
      }),
    ]);
    const seccao = screen.getByRole("region", { name: /à espera de resposta/i });
    expect(within(seccao).getByText(/há 13 dias/i)).toBeInTheDocument();
    // (4600 + 2400) com IVA.
    expect(within(seccao).getByText(/8\s610 €/)).toBeInTheDocument();
  });

  it("sem nenhuma pendurada, a secção não aparece", () => {
    desenhar([pedido({ id: "fresca", activityLog: enviadaEm("2026-08-13T09:00:00.000Z") })]);
    expect(screen.queryByRole("region", { name: /à espera de resposta/i })).toBeNull();
  });

  it("cada linha traz o gesto — marcar ali mesmo, sem abrir o pedido", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onQuoteAtualizado = vi.fn();
    const q = pedido({
      id: "a",
      quotedPrice: 4600,
      activityLog: enviadaEm("2026-08-01T09:00:00.000Z"),
    });
    desenhar([q], { onQuoteAtualizado });

    const seccao = screen.getByRole("region", { name: /à espera de resposta/i });
    await user.click(within(seccao).getByRole("button", { name: /^ganho$/i }));
    expect(within(seccao).getByLabelText(/valor combinado/i)).toHaveValue("4600");
  });

  it("abrir a linha abre o pedido", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onOpen = vi.fn();
    const q = pedido({
      id: "a",
      quotedPrice: 4600,
      activityLog: enviadaEm("2026-08-01T09:00:00.000Z"),
    });
    desenhar([q], { onOpen });

    const seccao = screen.getByRole("region", { name: /à espera de resposta/i });
    await user.click(within(seccao).getByRole("button", { name: /abrir o pedido de ana e rui/i }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "a" })));
  });
});
