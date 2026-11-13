// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { __resetListCache } from "./useCachedList";
import Reminders from "./Reminders";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS LEMBRETES SÃO SOBRE DINHEIRO E SOBRE DIAS — E ERRAVAM NOS DOIS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este painel é o primeiro que ela lê de manhã, e cada linha é uma afirmação:
 * «Faltam X €», «é hoje», «Seguimento em atraso». Os dois defeitos que estes
 * testes prendem faziam-no afirmar números e dias errados — em silêncio, com
 * o mesmo ar de certeza.
 */

const TZ_ORIGINAL = process.env.TZ;

const response = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ ETag: `W/"${Math.random()}"` }),
  json: async () => body,
});

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response([])),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pedido = (over: Partial<Quote>): Quote =>
  ({
    id: "q1",
    name: "Ana e Rui",
    email: "a@b.pt",
    guests: 100,
    status: "aceite",
    submittedAt: "2026-01-10T10:00:00.000Z",
    lastUpdated: "2026-01-10T10:00:00.000Z",
    ...over,
  }) as Quote;

/**
 * ── «Faltam X €» soma tudo com IVA, ou não soma nada ──────────────────────
 *
 * `quotedPrice` é o «Preço final (SEM IVA)»; os pagamentos são brutos. Somar
 * os dois dava um «em falta» ~23% abaixo do real — e calava o lembrete por
 * completo mal os pagamentos chegassem ao líquido.
 */
describe("Reminders — o que falta receber", () => {
  const DEZ_MIL_MAIS_IVA = pedido({
    status: "aceite",
    quotedPrice: 10000, // 12.300 € com IVA
    vatRate: 0.23,
    payments: [{ id: "s", kind: "sinal", amount: 3690, paid: true, date: "2026-02-01" }],
  } as Partial<Quote>);

  it("com o sinal de 3.690 € pago, faltam 8.610 € e não 6.310 €", () => {
    render(<Reminders quotes={[DEZ_MIL_MAIS_IVA]} onOpen={() => {}} />);
    const linha = screen.getByText(/^Faltam/).textContent ?? "";
    expect(linha).toMatch(/8\D?610/);
    expect(linha, "6.310 € é o líquido menos o bruto — peras menos maçãs").not.toMatch(/6\D?310/);
  });

  it("pago o líquido todo, o lembrete NÃO desaparece: ainda faltam os 2.300 € de IVA", () => {
    const quase = pedido({
      status: "aceite",
      quotedPrice: 10000,
      vatRate: 0.23,
      payments: [{ id: "t", kind: "pagamento", amount: 10000, paid: true, date: "2026-02-01" }],
    } as Partial<Quote>);
    render(<Reminders quotes={[quase]} onOpen={() => {}} />);
    expect(screen.getByText(/^Faltam/).textContent ?? "").toMatch(/2\D?300/);
  });

  it("pago o bruto todo, aí sim o lembrete cala-se", () => {
    const pago = pedido({
      status: "aceite",
      quotedPrice: 10000,
      vatRate: 0.23,
      payments: [{ id: "t", kind: "pagamento", amount: 12300, paid: true, date: "2026-02-01" }],
    } as Partial<Quote>);
    const { container } = render(<Reminders quotes={[pago]} onOpen={() => {}} />);
    expect(container.textContent ?? "").not.toMatch(/pagamento em falta/);
  });
});

/**
 * ── «Hoje» é o dia de quem está a olhar ───────────────────────────────────
 *
 * 00:30 de um dia de Verão em Portugal (UTC+1) ainda é ONTEM em UTC. Com o dia
 * tirado de `toISOString()`, um seguimento marcado para hoje simplesmente não
 * aparecia — e o lembrete que existe para ela pegar no telefone nesse dia
 * ficava mudo até depois da uma da manhã.
 */
describe("Reminders — «hoje» é o dia local, não o de UTC", () => {
  beforeAll(() => {
    process.env.TZ = "Europe/Lisbon";
  });
  afterAll(() => {
    process.env.TZ = TZ_ORIGINAL;
  });

  beforeEach(() => {
    // 00:30 de 15 de Julho em Lisboa = 23:30 de 14 de Julho em UTC.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-14T23:30:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("um seguimento marcado para hoje aparece, e diz «hoje»", () => {
    const q = pedido({ status: "cotado", followUpAt: "2026-07-15" });
    render(<Reminders quotes={[q]} onOpen={() => {}} />);
    expect(screen.getByText("Seguir Ana e Rui")).toBeTruthy();
    expect(screen.getByText("Seguimento hoje")).toBeTruthy();
  });

  it("o evento de ONTEM não volta à lista dos próximos («em -1 dias»)", () => {
    // 14 de Julho já passou para quem está em Lisboa — mas era ainda "hoje"
    // em UTC, por isso o evento reentrava na lista com uma contagem negativa.
    const ontem = pedido({ status: "cotado", date: "2026-07-14" });
    const hoje = pedido({ id: "q2", name: "Hoje", status: "cotado", date: "2026-07-15" });
    render(<Reminders quotes={[ontem, hoje]} onOpen={() => {}} />);
    expect(screen.getByText(/Evento de Hoje é hoje/)).toBeTruthy();
    expect(screen.queryByText(/Evento de Ana e Rui/)).toBeNull();
  });
});

/**
 * Achado n.º 8 da auditoria 6: uma mensagem que NÃO saiu (pedido sem email, o
 * correio em baixo) tirava o pedido da lista «aguarda resposta» para sempre.
 */
describe("Reminders — só uma mensagem que saiu é resposta", () => {
  const velho = { status: "pendente" as const, submittedAt: "2020-01-01T10:00:00.000Z" };

  it("uma mensagem que não saiu deixa o pedido na lista", () => {
    const q = pedido({ ...velho, messages: [{ at: "t", body: "Olá", emailed: false }] });
    render(<Reminders quotes={[q]} onOpen={() => {}} />);
    expect(screen.getByText("Ana e Rui aguarda resposta")).toBeTruthy();
  });

  it("uma que saiu (ou uma antiga, sem o campo) tira-o", () => {
    const saiu = pedido({ ...velho, messages: [{ at: "t", body: "Olá", emailed: true }] });
    const antiga = pedido({
      ...velho,
      id: "q2",
      name: "Antiga",
      messages: [{ at: "t", body: "Olá" }],
    });
    render(<Reminders quotes={[saiu, antiga]} onOpen={() => {}} />);
    expect(screen.queryByText(/aguarda resposta/)).toBeNull();
  });
});
