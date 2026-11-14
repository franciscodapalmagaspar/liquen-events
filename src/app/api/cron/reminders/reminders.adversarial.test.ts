import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Adversarial: the daily digest anchors "today" with the WRONG timezone ────
// The route did `today.setHours(0,0,0,0)` (LOCAL midnight) and then keyed the
// day with `toISOString()` (UTC). In any timezone east of UTC — e.g.
// Europe/Lisbon, the app's own locale, which is UTC+1 in summer — local
// midnight is 23:00 of the PREVIOUS UTC day, so `todayKey` (and the whole
// +3 / +7 window) slips a full calendar day. Consequences:
//   · a follow-up due *today* is not `<= todayKey` → it fires a day LATE
//   · the top of the "next 3 days" window is cut short → an event exactly 3
//     days out is silently dropped from the digest
// We pin the wall clock AND force a positive-offset zone to prove it.
const data = vi.hoisted(() => ({
  quotes: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
  sent: 4,
  authed: false,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => data.authed }));
vi.mock("@/lib/quotes-store", () => ({ listQuotes: vi.fn(async () => data.quotes) }));
vi.mock("@/lib/calendar-store", () => ({ listCalendarEvents: vi.fn(async () => data.events) }));
vi.mock("@/lib/push", () => ({ sendPushToAll: vi.fn(async () => ({ sent: data.sent })) }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { GET } from "./route";
import { sendPushToAll } from "@/lib/push";

function req(): NextRequest {
  return new Request("https://liquen.test/api/cron/reminders", {
    headers: {},
  }) as unknown as NextRequest;
}

function pushBody(): string {
  const calls = (sendPushToAll as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls.length ? (calls[0][0] as { body: string }).body : "";
}

const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  // Force a UTC+1 (summer) zone so local midnight lands on the PREVIOUS UTC day.
  process.env.TZ = "Europe/Lisbon";
});

afterAll(() => {
  // Never let the forced zone leak into sibling test files (env is process-wide).
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

beforeEach(() => {
  data.quotes = [];
  data.events = [];
  data.sent = 4;
  data.authed = false;
  vi.clearAllMocks();
  // Noon UTC on 2026-07-20 → 13:00 local (Lisbon, UTC+1). The local calendar
  // date is unambiguously 2026-07-20 — so is the UTC one. "Today" is 07-20.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-20T12:00:00Z"));
  // Ambient NODE_ENV "test" + no CRON_SECRET → authorized() runs free.
  vi.stubEnv("CRON_SECRET", "");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("GET /api/cron/reminders — timezone anchoring (Europe/Lisbon, UTC+1)", () => {
  it("fires a follow-up due TODAY (not a day late)", async () => {
    data.quotes = [{ id: "a", name: "Ativo", followUpAt: "2026-07-20", status: "pendente" }];
    await GET(req());
    // Due exactly today must be counted now, not tomorrow.
    expect(pushBody()).toContain("1 seguimento para hoje");
  });

  it("includes an event exactly 3 days out in the 'next 3 days' window", async () => {
    // 2026-07-20 + 3 = 2026-07-23, the inclusive top of the window.
    data.quotes = [{ id: "e", name: "Casamento", date: "2026-07-23", status: "aceite" }];
    await GET(req());
    expect(pushBody()).toContain("1 evento nos próximos 3 dias");
  });
});
