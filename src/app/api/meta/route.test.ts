import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const capi = vi.hoisted(() => ({ enviar: vi.fn(async () => ({ enviado: true })) }));
vi.mock("@/lib/meta/capi", () => ({
  enviarEventos: capi.enviar,
  ipDoPedido: () => "203.0.113.1",
}));
vi.mock("@/lib/meta/consentimento", () => ({ podeEnviarDoServidor: () => true }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ ok: true }),
  clientIp: () => "203.0.113.1",
  sweep: () => {},
}));
vi.mock("@/lib/logger", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { POST } from "./route";

const evento = (nome: string) => ({
  nome,
  eventId: "evt-teste-123",
  quando: Date.now(),
  url: "https://liquen.test/",
});
const pedir = (nome: string) =>
  POST(
    new Request("https://liquen.test/api/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consentido: true, eventos: [evento(nome)] }),
    }) as unknown as NextRequest,
  );

describe("/api/meta — o que o browser NÃO pode mandar (10/11)", () => {
  it("recusa o Lead: só sai pelo servidor, atrás de um pedido gravado", async () => {
    capi.enviar.mockClear();
    const res = await pedir("Lead");
    expect(await res.json()).toMatchObject({ enviado: false, motivo: "evento-nao-permitido" });
    expect(capi.enviar).not.toHaveBeenCalled();
  });

  it("recusa o Purchase, como antes", async () => {
    capi.enviar.mockClear();
    const res = await pedir("Purchase");
    expect(await res.json()).toMatchObject({ enviado: false, motivo: "evento-nao-permitido" });
    expect(capi.enviar).not.toHaveBeenCalled();
  });

  it("dados pessoais vindos do browser descartam-se — só os eventos do servidor os levam (16/11)", async () => {
    capi.enviar.mockClear();
    await POST(
      new Request("https://liquen.test/api/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentido: true,
          eventos: [
            {
              ...evento("Contact"),
              fbp: "fb.1.123.456",
              email: "alguem@exemplo.pt",
              telefone: "912345678",
              nomeDaPessoa: "Alguém",
            },
          ],
        }),
      }) as unknown as NextRequest,
    );
    expect(capi.enviar).toHaveBeenCalledTimes(1);
    const [enviados] = capi.enviar.mock.calls[0] as unknown as [
      Array<{ pessoa: Record<string, unknown> }>,
    ];
    const pessoa = enviados[0].pessoa;
    expect(pessoa.email).toBeUndefined();
    expect(pessoa.telefone).toBeUndefined();
    expect(pessoa.nome).toBeUndefined();
    // O que não identifica ninguém por si continua a seguir.
    expect(pessoa.fbp).toBe("fb.1.123.456");
  });
});
