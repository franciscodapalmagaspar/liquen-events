import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Os erros do browser do site público. Prende-se o que esta porta aberta NÃO
 * pode fazer: encher o registo, levar um token de proposta, aceitar um corpo
 * grande, ou responder com erro (que aparecia a vermelho na consola do
 * visitante).
 */
const st = vi.hoisted(() => ({
  ritmoOk: true,
  registado: [] as Array<{ mensagem: string; contexto: Record<string, unknown> }>,
  avisos: 0,
  erroPassado: [] as unknown[],
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "1.2.3.4",
  rateLimit: async () => ({ ok: st.ritmoOk }),
}));
vi.mock("@/lib/logger", async (orig) => ({
  // A chave de travão é a verdadeira: é ela que faz destes erros UM alerta por
  // janela, e não um por mensagem.
  chaveDeTravao: (await orig<typeof import("@/lib/logger")>()).chaveDeTravao,
  log: {
    // `log.error` é o que avisa (webhook, Sentry) — revisão de 16/11, n.º 5: um
    // erro no telemóvel de um visitante tem de chegar a quem o pode resolver.
    error: (mensagem: string, erro: unknown, contexto: Record<string, unknown>) => {
      st.registado.push({ mensagem, contexto });
      st.erroPassado.push(erro);
    },
    warn: () => {
      st.avisos += 1;
    },
    info: vi.fn(),
  },
}));

import { POST } from "./route";

const req = (corpo: unknown) =>
  new Request("https://liquen.test/api/erro-do-site", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  }) as unknown as NextRequest;

beforeEach(() => {
  st.ritmoOk = true;
  st.registado = [];
  st.avisos = 0;
  st.erroPassado = [];
});

describe("POST /api/erro-do-site", () => {
  it("escreve o erro no registo, com o caminho sem o token da proposta", async () => {
    const r = await POST(
      req({ mensagem: "x is undefined", onde: "/proposta/abc.def", marca: "window.error" }),
    );
    expect(r.status).toBe(204);
    expect(st.registado).toHaveLength(1);
    expect(st.registado[0]!.mensagem).toBe("site no browser: x is undefined");
    expect(st.registado[0]!.contexto.onde).toBe("/proposta/[token]");
  });

  it("vai como ERRO, para avisar — mas com a chave de travão partilhada", async () => {
    const { chaveDeTravao } = await import("@/lib/logger");
    await POST(req({ mensagem: "x is undefined" }));
    await POST(req({ mensagem: "y is not a function" }));
    expect(st.avisos).toBe(0);
    expect(st.registado).toHaveLength(2);
    // As duas mensagens diferentes partilham a MESMA chave: um alerta por
    // janela, não um por mensagem que um browser invente.
    const chaves = new Set(st.registado.map((r) => chaveDeTravao(r.mensagem)));
    expect(chaves).toEqual(new Set(["site no browser:"]));
  });

  it("não passa `null` como erro — ia como «null» para o canal e juntava tudo no Sentry", async () => {
    await POST(req({ mensagem: "x is undefined" }));
    expect(st.erroPassado).toEqual([undefined]);
  });

  it("só leva os cinco campos, e cortados", async () => {
    await POST(req({ mensagem: "m".repeat(900), nome: "Ana", email: "ana@exemplo.pt" }));
    const { mensagem, contexto } = st.registado[0]!;
    expect(mensagem.length).toBeLessThanOrEqual("site no browser: ".length + 300);
    expect(Object.keys(contexto).sort()).toEqual(["aparelho", "marca", "onde", "rasto"]);
    expect(JSON.stringify(contexto)).not.toContain("ana@");
  });

  it("acima do tecto, corpo grande ou malformado: 204 e nada no registo", async () => {
    st.ritmoOk = false;
    expect((await POST(req({ mensagem: "a" }))).status).toBe(204);
    st.ritmoOk = true;
    expect((await POST(req({ mensagem: "x".repeat(5000) }))).status).toBe(204);
    expect((await POST(req("{nao é json"))).status).toBe(204);
    expect(st.registado).toHaveLength(0);
  });
  it("não regista o que a aplicação anfitriã injecta na página (registos de 14–16/11)", async () => {
    await POST(
      req({
        mensagem: "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
        rasto: "setupIosCallbackHandler@https://liquen-events.com/:1:7358",
        marca: "unhandledrejection",
      }),
    );
    await POST(req({ mensagem: "ra", rasto: "qh@\nph@\nPr@\n@https://liquen-events.com/:415:45" }));
    await POST(req({ mensagem: "ResizeObserver loop limit exceeded" }));
    expect(st.registado).toHaveLength(0);
  });
});
