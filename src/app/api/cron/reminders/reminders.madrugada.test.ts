import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A HORA A QUE O DIA MUDA É A DE LISBOA, E NÃO A DO SERVIDOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O resumo ancorava o «hoje» em UTC (`setUTCHours(0,0,0,0)`), e as datas com
 * que ele compara — a data do evento, o `followUpAt`, a data do pagamento —
 * são dias do CALENDÁRIO escritos por quem trabalha em Portugal.
 *
 * No Verão Lisboa está uma hora à frente de UTC. Entre a meia-noite e a uma da
 * manhã, portanto, o calendário de Lisboa já virou e o de UTC ainda não: às
 * 00h30 de 21 de Julho, para este código, «hoje» era ainda dia 20.
 *
 * O que isso produz, por extenso: ela acaba uma montagem, abre o painel à
 * 00h30 e carrega no sino para ver o resumo. O seguimento que marcou PARA HOJE
 * não aparece (é «amanhã» em UTC), o evento que é daqui a três dias fica de
 * fora da janela (que acaba um dia mais cedo) e o casamento de ONTEM ainda é
 * listado como «nos próximos 3 dias». Nada disto dá erro: dá um resumo que
 * descreve o dia errado, à hora em que ela menos tem paciência para desconfiar.
 *
 * Este ficheiro força o fuso do processo a UTC — que é o que a Vercel corre —
 * para provar que a conta é feita em Lisboa POR ESCRITO, e não por acaso do
 * fuso da máquina. O `reminders.adversarial.test.ts` faz o inverso (força
 * Lisboa e mede ao meio-dia): só passa nos dois quem usa o fuso explícito.
 */
const data = vi.hoisted(() => ({
  quotes: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
  sent: 4,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => false }));
vi.mock("@/lib/quotes-store", () => ({ listQuotes: vi.fn(async () => data.quotes) }));
vi.mock("@/lib/calendar-store", () => ({ listCalendarEvents: vi.fn(async () => data.events) }));
vi.mock("@/lib/proposals-store", () => ({ listAllProposals: vi.fn(async () => []) }));
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

const FUSO_ORIGINAL = process.env.TZ;

beforeAll(() => {
  // O fuso do alojamento, para o «hoje» não poder vir de lá por acidente.
  process.env.TZ = "UTC";
});

afterAll(() => {
  if (FUSO_ORIGINAL === undefined) delete process.env.TZ;
  else process.env.TZ = FUSO_ORIGINAL;
});

beforeEach(() => {
  data.quotes = [];
  data.events = [];
  data.sent = 4;
  vi.clearAllMocks();
  // 23h30 UTC de 20 de Julho = 00h30 de 21 de Julho em Lisboa (Verão, UTC+1).
  // O dia de trabalho é o 21; em UTC ainda é o 20.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-20T23:30:00Z"));
  vi.stubEnv("CRON_SECRET", "");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("GET /api/cron/reminders — à 00h30 de Lisboa o dia já virou", () => {
  it("o seguimento marcado para hoje aparece hoje", async () => {
    data.quotes = [{ id: "a", name: "Ativo", followUpAt: "2026-07-21", status: "pendente" }];
    await GET(req());
    expect(pushBody()).toContain("1 seguimento para hoje");
  });

  it("o evento que é daqui a três dias cabe na janela", async () => {
    // 21 de Julho + 3 = 24 de Julho, o topo inclusivo da janela.
    data.quotes = [{ id: "e", name: "Casamento", date: "2026-07-24", status: "aceite" }];
    await GET(req());
    expect(pushBody()).toContain("1 evento nos próximos 3 dias");
  });

  it("o casamento de ontem já não é «dos próximos 3 dias»", async () => {
    // Aconteceu no dia 20, que em Lisboa já passou. Anunciá-lo como futuro é
    // pior do que não dizer nada: manda-a preparar uma coisa que já foi.
    data.quotes = [{ id: "e", name: "Casamento de ontem", date: "2026-07-20", status: "aceite" }];
    const res = await GET(req());
    expect(await res.json()).toEqual({ sent: 0, reason: "nada a notificar" });
    expect(sendPushToAll).not.toHaveBeenCalled();
  });

  it("o pagamento que vence daqui a sete dias entra na conta", async () => {
    // 21 + 7 = 28 de Julho. Com a janela a fechar no 27, este desaparecia.
    data.quotes = [
      // Um cliente ACEITE (o resumo conta pelo quadro das Cobranças): 1.000 € +
      // IVA, o sinal de 30% previsto para o dia 28.
      {
        id: "p",
        name: "Cliente",
        status: "aceite",
        quotedPrice: 1000,
        date: "2026-12-12",
        payments: [{ id: "s", kind: "sinal", paid: false, date: "2026-07-28", amount: 369 }],
      },
    ];
    await GET(req());
    expect(pushBody()).toContain("1 pagamento");
  });
});
