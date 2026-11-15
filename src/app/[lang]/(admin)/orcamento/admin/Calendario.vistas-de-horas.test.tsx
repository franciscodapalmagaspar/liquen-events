// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";
import type { CalendarEvent, Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS VISTAS DE DIA E DE SEMANA — FASES 06 E 08
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ponto 9 da auditoria dela: «Só existe a vista de mês. […] a vista de dia é
 * onde o trabalho acontece — montagem, horários, equipa.» E o ponto 15: «Não há
 * horas, num negócio em que a hora de montagem é metade do trabalho.»
 *
 * Este ficheiro mede as três coisas que fazem a diferença entre uma vista de
 * dia e uma lista com um título:
 *
 *  · que a HORA está lá, e que a coluna a escreve;
 *  · que os quatro CALENDÁRIOS filtram estas vistas como filtram as outras
 *    duas — um filtro aplicado só em três delas seria o mesmo dia a dizer
 *    coisas diferentes conforme o botão em que se carregou por último;
 *  · e que se chega lá e se volta, que é o que o `nada-fica-por-montar` não
 *    consegue ver.
 */

const CASAMENTO: Quote = {
  id: "LIQ-1",
  name: "Marta Nunes",
  status: "aceite",
  date: "2026-09-10",
  guests: 120,
} as unknown as Quote;

const MARCACOES: CalendarEvent[] = [
  {
    id: "ev-montagem",
    date: "2026-09-10",
    title: "Montagem Torre de Palma",
    kind: "evento",
    time: "09:00",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ev-prova",
    date: "2026-09-10",
    title: "Prova de bolo",
    kind: "reuniao",
    time: "09:30",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    // Noutro dia da MESMA semana — é o que separa a vista de dia da de semana.
    id: "ev-ferias",
    date: "2026-09-12",
    title: "Férias da equipa",
    kind: "bloqueio",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => resposta(MARCACOES)),
  );
  process.env.TZ = "Europe/Lisbon";
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Uma quinta-feira, 10 de Setembro de 2026, às 15:00 de Lisboa.
  vi.setSystemTime(new Date("2026-09-10T14:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete process.env.TZ;
  vi.unstubAllGlobals();
});

async function montar(quotes: Quote[] = [CASAMENTO]) {
  render(
    <ToastProvider>
      <Calendario quotes={quotes} onOpen={() => {}} />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText("Setembro 2026")).toBeInTheDocument());
  // O `userEvent` tem de partilhar o relógio falso com o resto do ficheiro.
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

describe("a vista de dia", () => {
  it("abre-se pelo comutador, e o título passa a ser o DIA", async () => {
    const user = await montar();
    await user.click(screen.getByRole("radio", { name: "Dia" }));

    expect(screen.getByRole("heading", { name: "10 de setembro de 2026" })).toBeInTheDocument();
    // O estado da vista diz de que dia da semana se trata — a informação que o
    // número sozinho não dá, e que ela precisa para saber se é um sábado.
    expect(screen.getByText(/^Quinta-feira · 3 eventos$/)).toBeInTheDocument();
  });

  it("tem coluna de horas das 07:00 às 23:00 — e não uma lista sem horas", async () => {
    const user = await montar();
    await user.click(screen.getByRole("radio", { name: "Dia" }));

    expect(screen.getByText("07:00")).toBeInTheDocument();
    expect(screen.getByText("14:00")).toBeInTheDocument();
    expect(screen.getByText("23:00")).toBeInTheDocument();
    // 24:00 não é uma faixa: é o fim da última. Escrevê-lo dava dezoito
    // números para dezassete horas.
    expect(screen.queryByText("24:00")).toBeNull();
  });

  it("a linha do momento atual aparece, e diz a hora por palavras", async () => {
    const user = await montar();
    await user.click(screen.getByRole("radio", { name: "Dia" }));

    // «sem animação; atualiza a cada minuto» (Parte 6). O que se mede aqui é
    // que ela existe e que NÃO é só uma linha de cor: tem nome acessível.
    await waitFor(() =>
      expect(screen.getByRole("separator", { name: "Agora, 15:00" })).toBeInTheDocument(),
    );
  });

  it("o casamento não tem hora e fica na faixa de dia inteiro; a montagem tem e desce", async () => {
    const user = await montar();
    await user.click(screen.getByRole("radio", { name: "Dia" }));

    // O pedido é a etiqueta de dia inteiro — um casamento tem data e não tem
    // hora de início na ficha.
    expect(screen.getByLabelText(/Abrir pedido de Marta Nunes/)).toBeInTheDocument();
    // A marcação com hora leva-a à frente do título, como na grelha do mês.
    const montagem = screen.getByLabelText("Abrir Evento: Montagem Torre de Palma");
    expect(within(montagem).getByText("09:00")).toBeInTheDocument();
  });

  it("as setas ‹ › andam de DIA, e dizem-no", async () => {
    const user = await montar();
    await user.click(screen.getByRole("radio", { name: "Dia" }));

    await user.click(screen.getByRole("button", { name: "Dia seguinte" }));
    expect(screen.getByRole("heading", { name: "11 de setembro de 2026" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dia anterior" }));
    expect(screen.getByRole("heading", { name: "10 de setembro de 2026" })).toBeInTheDocument();
  });

  it("voltar ao mês cai no mês do dia em que se estava, e não onde o cursor ficou", async () => {
    const user = await montar();
    await user.click(screen.getByRole("radio", { name: "Dia" }));
    // Vinte e cinco dias à frente atravessam a virada do mês.
    for (let i = 0; i < 25; i += 1) {
      await user.click(screen.getByRole("button", { name: "Dia seguinte" }));
    }
    expect(screen.getByRole("heading", { name: "5 de outubro de 2026" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Mês" }));
    expect(screen.getByRole("heading", { name: "Outubro 2026" })).toBeInTheDocument();
  });
});

describe("a vista de semana", () => {
  it("mostra os sete dias da semana do dia âncora, de segunda a domingo", async () => {
    const user = await montar();
    await user.click(screen.getByRole("radio", { name: "Semana" }));

    // 10 de Setembro de 2026 é uma quinta: a semana é 7 → 13.
    expect(screen.getByRole("heading", { name: "7 – 13 Set 2026" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Segunda-feira, 7 — abrir na vista de dia" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Domingo, 13 — abrir na vista de dia" }),
    ).toBeInTheDocument();
  });

  it("junta o que está marcado em dias diferentes da mesma semana", async () => {
    const user = await montar();
    await user.click(screen.getByRole("radio", { name: "Semana" }));

    expect(screen.getByLabelText("Abrir Evento: Montagem Torre de Palma")).toBeInTheDocument();
    expect(screen.getByLabelText("Abrir Data fechada: Férias da equipa")).toBeInTheDocument();
    expect(screen.getByText("4 eventos esta semana")).toBeInTheDocument();
  });

  it("carregar no cabeçalho de um dia abre esse dia", async () => {
    const user = await montar();
    await user.click(screen.getByRole("radio", { name: "Semana" }));
    await user.click(screen.getByRole("button", { name: /^Sábado, 12/ }));

    expect(screen.getByRole("heading", { name: "12 de setembro de 2026" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Dia" })).toBeChecked();
  });

  it("as setas saltam SETE dias de cada vez", async () => {
    const user = await montar();
    await user.click(screen.getByRole("radio", { name: "Semana" }));
    await user.click(screen.getByRole("button", { name: "Semana seguinte" }));

    expect(screen.getByRole("heading", { name: "14 – 20 Set 2026" })).toBeInTheDocument();
  });
});

describe("os quatro calendários filtram as vistas novas como filtram as outras", () => {
  it("desligar «Data fechada» tira as férias da semana", async () => {
    const user = await montar();
    await user.click(screen.getByRole("radio", { name: "Semana" }));
    expect(screen.getByLabelText("Abrir Data fechada: Férias da equipa")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /Data fechada/ }));

    await waitFor(() =>
      expect(screen.queryByLabelText("Abrir Data fechada: Férias da equipa")).toBeNull(),
    );
    // E a reunião fica — desligou-se um calendário, não a semana.
    expect(screen.getByLabelText("Abrir Reunião: Prova de bolo")).toBeInTheDocument();
  });
});
