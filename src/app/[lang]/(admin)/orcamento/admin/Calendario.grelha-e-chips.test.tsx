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
 * AS FASES 02, 03 E 04 DO `docs/APPLE-CALENDARIO.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que este ficheiro guarda, por ordem do documento:
 *
 *  · **02 — a grelha a toda a largura.** Fora o cartão (ponto 7: «o cartão com
 *    raio e padding rouba cerca de 60 px de cada lado»), as semanas a repartir
 *    a altura em vez de deixar ~200 px de página em branco por baixo (ponto 8),
 *    e os dias dos meses ao lado esbatidos (ponto 10).
 *  · **03 — as etiquetas.** O nome inteiro em vez de «An» (ponto 11), a cor do
 *    tipo (ponto 12), a hora antes do título (ponto 15) e o «+N mais» a abrir
 *    o resto num popover.
 *  · **04 — os quatro calendários.** A legenda que era só legenda (ponto 13)
 *    passou a quatro caixas de marcar que ligam e desligam a grelha.
 *
 * Janeiro de 2026 começa a uma QUINTA-FEIRA: com a semana a começar à segunda,
 * as três primeiras células da grelha são 29, 30 e 31 de Dezembro — os dias do
 * mês ao lado que o ponto 10 manda esbater. É por isso que o mês é este.
 */

const PEDIDO: Quote = {
  id: "LIQ-1",
  name: "An & Patrick",
  status: "aceite",
  date: "2026-01-09",
  guests: 80,
} as unknown as Quote;

const marcacao = (
  id: string,
  kind: CalendarEvent["kind"],
  title: string,
  date: string,
  time?: string,
) => ({ id, date, title, kind, time, createdAt: "2026-01-01T00:00:00.000Z" }) as CalendarEvent;

const MONTAGEM = marcacao("EV-1", "reuniao", "Montagem Torre de Palma", "2026-01-09", "09:00");

/**
 * Uma marcação de cada tipo, cada uma no SEU dia.
 *
 * Espalhadas de propósito: uma célula só mostra três linhas e manda o resto
 * para o «+N mais», portanto quatro marcações no mesmo dia esconderiam duas —
 * e um teste de FILTROS que não vê o que filtrou passa por acaso, tanto antes
 * como depois. O dia cheio é o caso do popover, aqui em baixo, e tem os seus.
 */
const UMA_DE_CADA = [
  MONTAGEM,
  marcacao("EV-2", "evento", "Prova de menu", "2026-01-12"),
  marcacao("EV-3", "bloqueio", "Férias da equipa", "2026-01-13"),
  marcacao("EV-4", "nota", "Confirmar flores", "2026-01-14"),
];

/** Cinco entradas no MESMO dia — o pedido mais quatro marcações. */
const DIA_CHEIO = [
  MONTAGEM,
  marcacao("EV-5", "evento", "Prova de menu", "2026-01-09"),
  marcacao("EV-6", "bloqueio", "Férias da equipa", "2026-01-09"),
  marcacao("EV-7", "nota", "Confirmar flores", "2026-01-09"),
];

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

beforeEach(() => {
  __resetListCache();
  window.localStorage.clear();
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

async function montar(quotes: Quote[], marcacoes: CalendarEvent[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => resposta(marcacoes)),
  );
  render(
    <ToastProvider>
      <Calendario quotes={quotes} onOpen={() => {}} />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText("Janeiro 2026")).toBeInTheDocument());
  // A lista das marcações chega por `fetch`; sem esperar por ela, metade dos
  // casos aqui em baixo estaria a medir uma grelha só com pedidos.
  if (marcacoes.length > 0) {
    await waitFor(() =>
      expect(screen.getAllByLabelText(new RegExp(marcacoes[0].title)).length).toBeGreaterThan(0),
    );
  }
}

const grelha = () => screen.getByRole("grid", { name: /Calendário de Janeiro 2026/ });

describe("fase 02 — a grelha a toda a largura", () => {
  it("não vive dentro de um cartão", async () => {
    await montar([PEDIDO], []);
    // O `Card` desta casa é `rounded-2xl` com moldura. Se a grelha voltar a
    // ter um por cima, voltam os 60 px de cada lado que o ponto 7 mediu.
    expect(grelha().closest(".rounded-2xl"), "a grelha voltou para dentro de um cartão").toBeNull();
  });

  it("as semanas repartem a altura disponível, em vez de a deixarem sobrar", async () => {
    await montar([PEDIDO], []);
    // Janeiro de 2026: 3 dias de Dezembro + 31 = 34 células → cinco semanas.
    expect(grelha().style.gridTemplateRows).toBe("repeat(5, minmax(var(--celula), 1fr))");
  });

  it("os dias dos meses ao lado ficam esbatidos", async () => {
    await montar([PEDIDO], []);
    const esbatidos = [...grelha().querySelectorAll('[class*="bo-surface-sunken"]')];
    // 29, 30 e 31 de Dezembro à cabeça, e 1 de Fevereiro na cauda: a grelha é
    // sempre um rectângulo de semanas inteiras.
    expect(
      esbatidos.map((c) => c.textContent),
      "os dias dos meses ao lado deixaram de se distinguir de Janeiro",
    ).toEqual(["29", "30", "31", "1"]);
  });
});

describe("fase 03 — as etiquetas", () => {
  it("o nome do casal aparece inteiro, e é o CSS que o trunca", async () => {
    await montar([PEDIDO], []);
    const etiqueta = screen.getAllByLabelText(/Abrir pedido de An & Patrick/)[0];
    // Era `q.name.split(" ")[0]` — «An». Duas letras não transportam
    // informação nenhuma, e o corte era à palavra e sem reticências.
    expect(etiqueta.textContent).toContain("An & Patrick");
    expect(
      etiqueta.querySelector(".truncate"),
      "o título perdeu a truncatura com reticências",
    ).not.toBeNull();
  });

  it("a hora vem ANTES do título, e em `tabular-nums`", async () => {
    await montar([], [MONTAGEM]);
    const etiqueta = screen.getAllByLabelText(/Abrir Reunião: Montagem Torre de Palma/)[0];
    const hora = etiqueta.querySelector(".tabular-nums");
    expect(hora?.textContent).toBe("09:00");
    // A ordem no documento (Parte 4) é «▍09:00 Montagem Torre de Palma»: quem
    // procura as nove varre a coluna das horas, e ela tem de estar à esquerda.
    expect(
      hora!.compareDocumentPosition(etiqueta.querySelector(".truncate")!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("cada tipo leva a sua cor E o seu glifo — nunca só a cor", async () => {
    await montar([], [MONTAGEM]);
    const etiqueta = screen.getAllByLabelText(/Abrir Reunião: Montagem Torre de Palma/)[0];
    expect(etiqueta.getAttribute("style")).toContain("--tipo: var(--bo-info)");
    expect(
      etiqueta.querySelector("svg"),
      "a etiqueta ficou a distinguir o tipo só pela cor",
    ).not.toBeNull();
  });

  it("o que não cabe na célula abre no popover do «+N mais»", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await montar([PEDIDO], DIA_CHEIO);

    // Cinco entradas no mesmo dia, três linhas de célula: duas etiquetas e o
    // «+3 mais». Nada se perde em silêncio.
    const mais = screen.getByRole("button", { name: /Ver os outros 3 de/ });
    expect(mais.textContent).toBe("+3mais");

    await user.click(mais);
    const popover = await screen.findByRole("dialog");
    expect(within(popover).getByText("Férias da equipa")).toBeInTheDocument();
    expect(within(popover).getByText("Confirmar flores")).toBeInTheDocument();

    // «Fecha com Esc», e o foco volta a quem o abriu — Parte 4 do documento.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(mais);
  });
});

describe("fase 04 — os quatro calendários", () => {
  it("a legenda passou a quatro caixas de marcar, todas ligadas", async () => {
    await montar([], UMA_DE_CADA);
    for (const nome of ["Reunião", "Evento", "Data fechada", "Nota"]) {
      expect(screen.getByRole("checkbox", { name: new RegExp(nome) })).toBeChecked();
    }
  });

  it("desligar «Data fechada» tira as datas fechadas da grelha — e diz quantas escondeu", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await montar([], UMA_DE_CADA);

    const caixa = screen.getByRole("checkbox", { name: /Data fechada/ });
    await user.click(caixa);

    await waitFor(() => expect(screen.queryByLabelText(/Férias da equipa/)).toBeNull());
    // As reuniões ficam: desligou-se um calendário, não a grelha.
    expect(screen.getAllByLabelText(/Montagem Torre de Palma/).length).toBeGreaterThan(0);
    // E o número ao lado continua a dizer que há lá uma — contar só o que está
    // ligado seria esconder a informação duas vezes.
    expect(caixa.closest("label")!.textContent).toContain("1");

    await user.click(screen.getByRole("button", { name: "Mostrar todos" }));
    await waitFor(() =>
      expect(screen.getAllByLabelText(/Férias da equipa/).length).toBeGreaterThan(0),
    );
  });

  it("um mês inteiro filtrado não se lê como um mês vazio", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await montar([], [MONTAGEM]);

    await user.click(screen.getByRole("checkbox", { name: /Reunião/ }));

    // «Mês sem eventos» seria o ecrã a mentir sobre a agenda dela.
    await waitFor(() =>
      expect(screen.getByText("Nada nos calendários ligados")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Mês sem eventos")).toBeNull();
  });
});
