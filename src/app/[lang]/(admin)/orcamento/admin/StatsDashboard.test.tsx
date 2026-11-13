// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { __resetListCache } from "./useCachedList";
import StatsDashboard from "./StatsDashboard";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «PRÓXIMOS PAGAMENTOS (60 DIAS)» COMEÇA HOJE — NO CALENDÁRIO DELA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A janela ia de `now.toISOString()` (UTC) até 60 dias depois, também em UTC.
 * À 00:30 de um dia de Verão em Portugal (UTC+1) o "hoje" de UTC ainda é o dia
 * anterior, portanto a janela abria e fechava um dia fora do sítio: o
 * pagamento marcado para o último dia do horizonte caía fora da lista sem
 * ninguém dar por isso. A regra — nunca derivar o dia de `toISOString()` —
 * está escrita em `util.ts`.
 */

const response = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ ETag: `W/"${Math.random()}"` }),
  json: async () => body,
});

const TZ_ORIGINAL = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "Europe/Lisbon";
});
afterAll(() => {
  process.env.TZ = TZ_ORIGINAL;
});

beforeEach(() => {
  __resetListCache();
  // A "Análise de propostas" desta página vai à rede; aqui não interessa.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response([])),
  );
  // 00:30 de 15 de Julho em Lisboa = 23:30 de 14 de Julho em UTC.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-07-14T23:30:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const comPagamentoEm = (date: string, name: string): Quote =>
  ({
    id: `q-${date}`,
    name,
    email: "a@b.pt",
    guests: 100,
    status: "aceite",
    quotedPrice: 10000,
    submittedAt: "2026-06-01T10:00:00.000Z",
    lastUpdated: "2026-06-01T10:00:00.000Z",
    payments: [{ id: `p-${date}`, kind: "saldo", amount: 1000, paid: false, date }],
  }) as unknown as Quote;

describe("StatsDashboard — a janela dos 60 dias conta dias locais", () => {
  it("o de hoje entra; o de ONTEM já não é «próximo»", () => {
    render(
      <StatsDashboard
        quotes={[
          comPagamentoEm("2026-07-15", "Paga Hoje"),
          comPagamentoEm("2026-07-14", "Já Passou"),
        ]}
      />,
    );
    expect(screen.getByText("Paga Hoje")).toBeTruthy();
    // Em UTC ainda era dia 14 — e um pagamento já vencido aparecia na lista do
    // que está por vir, que é a lista pela qual ela decide a semana.
    expect(screen.queryByText("Já Passou")).toBeNull();
  });

  it("o pagamento no ÚLTIMO dia do horizonte ainda entra; o do dia seguinte não", () => {
    // 15/07 + 60 dias = 13/09 (o horizonte é `hoje + 60`).
    render(
      <StatsDashboard
        quotes={[
          comPagamentoEm("2026-09-13", "No limite"),
          comPagamentoEm("2026-09-14", "Fora do limite"),
        ]}
      />,
    );
    expect(screen.getByText("No limite")).toBeTruthy();
    expect(screen.queryByText("Fora do limite")).toBeNull();
  });
});

/**
 * N.º 7 da auditoria de 13/11: «Tempo de fecho» e «Resposta média» contavam
 * até ao `lastUpdated`, que muda a cada gravação. Uma nota escrita meses depois
 * do Ganho punha o casamento a «demorar» meses a fechar.
 */
describe("StatsDashboard — os tempos contam do que aconteceu, não da última gravação", () => {
  it("n.º 7: o fecho conta até ao Ganho e a resposta até ao primeiro contacto", () => {
    const pedido = {
      ...comPagamentoEm("2026-09-30", "Ana"),
      submittedAt: "2026-06-01T10:00:00.000Z",
      // Uma nota escrita a 14/07 — 43 dias depois de chegar.
      lastUpdated: "2026-07-14T10:00:00.000Z",
      activityLog: [
        {
          id: "c1",
          at: "2026-06-01T13:00:00.000Z",
          kind: "call_logged",
          summary: "Ligámos",
        },
        {
          id: "g1",
          at: "2026-06-11T10:00:00.000Z",
          kind: "status_change",
          summary: "Proposta enviada → Ganho",
        },
      ],
    } as unknown as Quote;
    render(<StatsDashboard quotes={[pedido]} />);
    const fecho = screen.getByText("Tempo de fecho").parentElement!;
    expect(fecho.textContent).toContain("10d");
    const resposta = screen.getByText("Resposta média").parentElement!;
    expect(resposta.textContent).toContain("3.0h");
  });
});
