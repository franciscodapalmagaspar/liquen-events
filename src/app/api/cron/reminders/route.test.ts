import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Adversarial coverage for the daily digest cron ─────────────────────────
// Focus: the CRON_SECRET Bearer guard (missing/wrong/right, fail-closed in
// prod), resilience to empty/broken stores, and the date-window logic pinned
// to 2026-07-20 so "today / +3 / +7" are deterministic. We mock the push layer
// and assert it fires ONLY when there is something to report.
const data = vi.hoisted(() => ({
  quotes: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
  proposals: [] as Record<string, unknown>[],
  sent: 4,
  authed: false,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => data.authed }));
vi.mock("@/lib/quotes-store", () => ({ listQuotes: vi.fn(async () => data.quotes) }));
vi.mock("@/lib/calendar-store", () => ({ listCalendarEvents: vi.fn(async () => data.events) }));
vi.mock("@/lib/proposals-store", () => ({ listAllProposals: vi.fn(async () => data.proposals) }));
vi.mock("@/lib/push", () => ({ sendPushToAll: vi.fn(async () => ({ sent: data.sent })) }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { GET } from "./route";
import { listQuotes } from "@/lib/quotes-store";
import { sendPushToAll } from "@/lib/push";

const SECRET = "cron-top-secret";

function req(authHeader?: string, deFora = false): NextRequest {
  // O `fetch` da campainha é do próprio site; `deFora` é um link noutra página.
  const headers: Record<string, string> = {
    "sec-fetch-site": deFora ? "cross-site" : "same-origin",
  };
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new Request("https://liquen.test/api/cron/reminders", {
    headers,
  }) as unknown as NextRequest;
}

// A quote awaiting a first reply for >24h at the pinned "now".
function awaitingQuote(): Record<string, unknown> {
  return {
    id: "q-await",
    name: "Sem resposta",
    status: "pendente",
    messages: [],
    submittedAt: "2026-07-18T09:00:00.000Z",
  };
}

beforeEach(() => {
  data.quotes = [];
  data.events = [];
  data.proposals = [];
  data.sent = 4;
  data.authed = false;
  vi.clearAllMocks();
  // Pin the clock: todayKey = 2026-07-20, +3 = 2026-07-23, +7 = 2026-07-27.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-20T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("GET /api/cron/reminders — auth guard", () => {
  it("401s with no secret configured in production (fails closed) and never scans", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(listQuotes).not.toHaveBeenCalled();
    expect(sendPushToAll).not.toHaveBeenCalled();
  });

  it("401s when CRON_SECRET is set but no Authorization header is sent", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(listQuotes).not.toHaveBeenCalled();
  });

  it("401s on a wrong Bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await GET(req("Bearer nope"));
    expect(res.status).toBe(401);
    expect(listQuotes).not.toHaveBeenCalled();
  });

  it("runs with the correct Bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(listQuotes).toHaveBeenCalledTimes(1);
  });

  it("a logged-in admin can trigger it without any secret header", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    data.authed = true;
    const res = await GET(req());
    expect(res.status).toBe(200);
  });

  it("but not from a link on another site, even with her session (10/11)", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    data.authed = true;
    const res = await GET(req(undefined, true));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/cron/reminders — digest logic (clock pinned 2026-07-20)", () => {
  beforeEach(() => {
    // Ambient NODE_ENV is "test" and CRON_SECRET unset → authorized() runs free.
    vi.stubEnv("CRON_SECRET", "");
  });

  it("returns 200 with sent:0 and does not push when there is nothing to report", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 0, reason: "nada a notificar" });
    expect(sendPushToAll).not.toHaveBeenCalled();
  });

  // Auditoria de 13/11, n.º 12: antes respondia 200 «nada a notificar» — a
  // frase de um dia sossegado — com a base de dados em baixo.
  it("a store that rejects is NOT «nothing to notify»: it is logged and reported as a failure", async () => {
    (
      listQuotes as unknown as { mockRejectedValueOnce: (e: unknown) => void }
    ).mockRejectedValueOnce(new Error("db down"));
    const { log } = await import("@/lib/logger");
    const res = await GET(req());
    expect(res.status).toBe(502);
    const corpo = await res.json();
    expect(corpo).toMatchObject({ sent: 0, incompleto: ["pedidos"] });
    expect(corpo.reason).not.toBe("nada a notificar");
    expect(log.error).toHaveBeenCalled();
    expect(sendPushToAll).not.toHaveBeenCalled();
  });

  it("with something to say but the subscriptions list unreadable, the failure shows", async () => {
    data.quotes = [awaitingQuote()];
    vi.mocked(sendPushToAll).mockResolvedValueOnce({ sent: 0, failed: 0, semLista: true });
    const res = await GET(req());
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ sent: 0, subscricoes: "não foi possível ler" });
  });

  it("counts events in the next 3 days (from quotes + calendar) and excludes those beyond", async () => {
    data.quotes = [
      { id: "a", name: "Casamento", date: "2026-07-22" }, // in window
      { id: "b", name: "Longínquo", date: "2026-07-25" }, // beyond +3
    ];
    data.events = [{ date: "2026-07-20", title: "Sessão hoje" }];
    const res = await GET(req());
    expect(res.status).toBe(200);
    const push = (sendPushToAll as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as {
      body: string;
    };
    // 2 upcoming (one quote in-window + one calendar event), not the far one.
    expect(push.body).toContain("2 eventos nos próximos 3 dias");
  });

  it("ignores archived quotes entirely", async () => {
    data.quotes = [{ id: "a", name: "Arquivado", date: "2026-07-21", archived: true }];
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 0, reason: "nada a notificar" });
    expect(sendPushToAll).not.toHaveBeenCalled();
  });

  it("flags unpaid payments due within 7 days and pushes the summary", async () => {
    data.quotes = [
      {
        id: "a",
        name: "Cliente",
        payments: [
          { paid: false, date: "2026-07-21", amount: 500 }, // due within 7
          { paid: true, date: "2026-07-22", amount: 999 }, // already paid → ignored
          { paid: false, date: "2026-08-30", amount: 200 }, // beyond +7 → ignored
        ],
      },
    ];
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sendPushToAll).toHaveBeenCalledTimes(1);
    const push = (sendPushToAll as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as {
      body: string;
    };
    expect(push.body).toContain("1 pagamento");
  });

  it("flags a quote awaiting a first reply for 24h+ but not a fresh one", async () => {
    data.quotes = [
      awaitingQuote(),
      {
        id: "q-fresh",
        name: "Recente",
        status: "pendente",
        messages: [],
        submittedAt: "2026-07-20T09:00:00.000Z",
      },
    ];
    await GET(req());
    const push = (sendPushToAll as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as {
      body: string;
    };
    expect(push.body).toContain("1 pedido por responder");
  });

  it("flags follow-ups due today/overdue on active deals only", async () => {
    data.quotes = [
      { id: "a", name: "Ativo", followUpAt: "2026-07-20", status: "pendente" }, // due today
      { id: "b", name: "Fechado", followUpAt: "2026-07-10", status: "aceite" }, // closed → ignored
    ];
    await GET(req());
    const push = (sendPushToAll as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as {
      body: string;
    };
    expect(push.body).toContain("1 seguimento para hoje");
  });

  it("returns the push count from the delivery layer", async () => {
    data.sent = 7;
    data.quotes = [awaitingQuote()];
    const res = await GET(req());
    expect(await res.json()).toMatchObject({ sent: 7 });
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * O SEGUIMENTO MARCADO NA PROPOSTA TEM DE CHEGAR AO RESUMO DA MANHÃ
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `followUpAt` existe em dois sítios com o mesmo nome — no pedido e na proposta.
 * O botão que ela usa («Marcar seguimento», no Acompanhamento) grava na
 * PROPOSTA; este resumo lia só o do pedido. Ela marcava, confiava, e não era
 * avisada de nada.
 *
 * É uma falha que não dá erro: dá esquecimento. Por isso o teste é pelo
 * comportamento — o que o resumo diz — e não pelo campo que foi lido.
 */
describe("GET /api/cron/reminders — seguimentos marcados na proposta", () => {
  const pedidoVivo = {
    id: "q-1",
    name: "Casal do seguimento",
    status: "em_revisao",
    messages: [{ id: "m1" }],
    submittedAt: "2026-07-01T09:00:00.000Z",
  };

  it("conta o seguimento marcado na PROPOSTA, que antes era invisível", async () => {
    data.authed = true;
    data.quotes = [pedidoVivo];
    data.proposals = [{ id: "p-1", quoteId: "q-1", status: "enviada", followUpAt: "2026-07-20" }];
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      summary: expect.arrayContaining([expect.stringContaining("1 seguimento")]),
    });
  });

  it("não conta o mesmo casal duas vezes quando está marcado nos dois sítios", async () => {
    data.authed = true;
    data.quotes = [{ ...pedidoVivo, followUpAt: "2026-07-19" }];
    data.proposals = [{ id: "p-1", quoteId: "q-1", status: "enviada", followUpAt: "2026-07-20" }];
    const res = await GET(req());
    const { summary } = (await res.json()) as { summary: string[] };
    expect(
      summary.find((l) => l.includes("seguimento")),
      "é a mesma chamada a fazer — contar duas vezes só a faria desconfiar do número",
    ).toContain("1 seguimento");
  });

  it("ignora seguimentos de propostas já respondidas", async () => {
    data.authed = true;
    data.quotes = [pedidoVivo];
    data.proposals = [
      { id: "p-1", quoteId: "q-1", status: "aceite", followUpAt: "2026-07-20" },
      { id: "p-2", quoteId: "q-1", status: "rejeitada", followUpAt: "2026-07-20" },
    ];
    const res = await GET(req());
    const body = (await res.json()) as { summary?: string[]; reason?: string };
    expect(body.summary?.some((l) => l.includes("seguimento")) ?? false).toBe(false);
  });

  it("ignora seguimentos de propostas cujo pedido já foi aceite ou arquivado", async () => {
    data.authed = true;
    data.quotes = [{ ...pedidoVivo, status: "aceite" }];
    data.proposals = [{ id: "p-1", quoteId: "q-1", status: "enviada", followUpAt: "2026-07-20" }];
    const res = await GET(req());
    const body = (await res.json()) as { summary?: string[]; reason?: string };
    expect(body.summary?.some((l) => l.includes("seguimento")) ?? false).toBe(false);
  });

  it("um seguimento marcado para depois de hoje não entra no resumo de hoje", async () => {
    data.authed = true;
    data.quotes = [pedidoVivo];
    data.proposals = [{ id: "p-1", quoteId: "q-1", status: "enviada", followUpAt: "2026-07-25" }];
    const res = await GET(req());
    const body = (await res.json()) as { summary?: string[]; reason?: string };
    expect(body.summary?.some((l) => l.includes("seguimento")) ?? false).toBe(false);
  });
});
