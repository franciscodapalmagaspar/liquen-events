import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A APANHA DAS DERIVADAS ANDA À BOLEIA — E NÃO PODE PAGAR A VIAGEM COM O RESUMO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «eu queria que isto gerasse de forma automática».
 *
 * As fotografias novas já nascem prontas. O que pode ficar para trás são as que
 * entraram por outro caminho, e sem uma varredura periódica essas só se
 * arranjam se alguém se lembrar de carregar num botão.
 *
 * Vive aqui, e não numa rotina própria, porque o alojamento permite DUAS
 * rotinas agendadas e as duas estão tomadas. Uma terceira faz a publicação do
 * site falhar — não é uma degradação, é o site a não sair.
 *
 * O que este ficheiro prende é a condição dessa boleia: o resumo é a razão de a
 * rotina existir, e o que a apanha faça — ou deixe de fazer — nunca lhe pode
 * tocar.
 */
const H = vi.hoisted(() => ({
  chamadas: [] as unknown[],
  rebenta: false,
  resultado: {
    geradas: 3,
    falhas: [] as string[],
    fotografiasFeitas: 1,
    retoma: null,
    restantes: 0,
    restantesEssenciais: 0,
    fotografiasRestantes: 0,
    papel: "essencial",
  },
}));

vi.mock("@/lib/derivadas", async (importOriginal) => ({
  // A regra verdadeira: a rotina usa-a para ler a retoma guardada.
  retomaValida: (await importOriginal<typeof import("@/lib/derivadas")>()).retomaValida,
  gerarLoteDeDerivadas: vi.fn(async (papel?: string, opcoes?: { tectoMs?: number }) => {
    H.chamadas.push({ papel, tectoMs: opcoes?.tectoMs });
    if (H.rebenta) throw new Error("storage em baixo");
    return H.resultado;
  }),
}));

// A rota cai no `isAuthed` quando não há `CRON_SECRET`, e o pedido destes
// testes é um `Request` cru sem `cookies`. O duplo fecha essa porta, como no
// teste irmão.
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => false }));
vi.mock("@/lib/quotes-store", () => ({ listQuotes: vi.fn(async () => []) }));
vi.mock("@/lib/calendar-store", () => ({ listCalendarEvents: vi.fn(async () => []) }));
vi.mock("@/lib/proposals-store", () => ({ listAllProposals: vi.fn(async () => []) }));
vi.mock("@/lib/push", () => ({ sendPushToAll: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { GET } from "./route";

const SECRET = "cron-top-secret";

function req(auth = `Bearer ${SECRET}`): NextRequest {
  return new Request("https://liquen.test/api/cron/reminders", {
    headers: { authorization: auth },
  }) as unknown as NextRequest;
}

beforeEach(() => {
  H.chamadas = [];
  H.rebenta = false;
  vi.stubEnv("CRON_SECRET", SECRET);
});

describe("a rotina diária apanha as derivadas em atraso", () => {
  it("corre a apanha, com o tempo que sobra da função", async () => {
    await GET(req());

    expect(H.chamadas).toHaveLength(1);
    const { papel, tectoMs } = H.chamadas[0] as { papel?: string; tectoMs: number };
    // SEM papel: faz as essenciais em toda a biblioteca antes de tocar no AVIF.
    // É a ordem que faz parar a meio deixar as coisas melhores do que estavam.
    expect(papel).toBeUndefined();
    // E com um tecto que deixa a resposta sair dentro dos 60 s da função.
    expect(tectoMs).toBeGreaterThan(0);
    expect(tectoMs).toBeLessThanOrEqual(50_000);
  });

  it("a apanha a rebentar NÃO estraga o resumo", async () => {
    // O resumo é a razão de esta rotina existir e é ele que a hora serve. Uma
    // avaria na boleia é uma linha no registo, não um dia sem notificação.
    H.rebenta = true;

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reason: "nada a notificar" });
  });

  it("a resposta do resumo sai igual, com ou sem apanha", async () => {
    const comApanha = await (await GET(req())).json();
    H.rebenta = true;
    const semApanha = await (await GET(req())).json();

    expect(comApanha).toEqual(semApanha);
  });

  it("um pedido sem autorização não chega a mexer em fotografia nenhuma", async () => {
    const res = await GET(req("Bearer errado"));

    expect(res.status).toBe(401);
    expect(H.chamadas).toHaveLength(0);
  });
});
