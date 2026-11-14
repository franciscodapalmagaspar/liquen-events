import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * O duplo do SDK: `beta.messages.stream(params, { signal })` com um
 * `finalMessage()` que demora o que o teste quiser — e que pára, como o
 * verdadeiro, quando o sinal é interrompido.
 */
const sdk = vi.hoisted(() => ({
  opcoes: [] as unknown[],
  chamadas: [] as { params: unknown; signal?: AbortSignal }[],
  resposta: null as null | { stop_reason: string; content: unknown[]; usage: unknown },
  demoraMs: 0,
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        stream: (params: unknown, opts: { signal?: AbortSignal } = {}) => {
          sdk.chamadas.push({ params, signal: opts.signal });
          return {
            finalMessage: () =>
              new Promise((resolve, reject) => {
                const t = setTimeout(() => resolve(sdk.resposta), sdk.demoraMs);
                opts.signal?.addEventListener("abort", () => {
                  clearTimeout(t);
                  reject(Object.assign(new Error("Request was aborted."), { name: "AbortError" }));
                });
              }),
          };
        },
      },
    };
    constructor(o: unknown) {
      sdk.opcoes.push(o);
    }
  },
}));

import { chamarModeloSeHouverChave } from "./cliente";
import { importarDocumento } from "./importar";
import { leituraCerta, propostaDeTeste } from "./fixtures.testkit";

const chaveAntes = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "chave-de-teste-que-nao-existe";
  Object.assign(sdk, { opcoes: [], chamadas: [], demoraMs: 0 });
  sdk.resposta = {
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(leituraCerta()) }],
    usage: { input_tokens: 1000, output_tokens: 1000 },
  };
});
afterEach(() => {
  if (chaveAntes === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = chaveAntes;
});

const reservar = async () => ({ ok: true, usadas: 1, maximo: 30, dolares: 0, maxDolares: 5 });

describe("o cliente verdadeiro (com o SDK em duplo)", () => {
  it("sem chave não existe", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(chamarModeloSeHouverChave()).toBeNull();
  });

  it("sem novas tentativas, e o sinal do prazo segue para o stream", async () => {
    const chamar = chamarModeloSeHouverChave()!;
    const r = await importarDocumento(propostaDeTeste(), { chamar, reservar });
    expect(r.revisao?.via).toBe("ia");
    expect(sdk.opcoes[0]).toMatchObject({ maxRetries: 0 });
    expect(sdk.chamadas[0].signal).toBeInstanceOf(AbortSignal);
    expect((sdk.chamadas[0].params as { max_tokens: number }).max_tokens).toBeLessThanOrEqual(
      32_000,
    );
  });

  it("uma resposta que não chega a tempo é INTERROMPIDA, e cai nas regras a dizer porquê", async () => {
    sdk.demoraMs = 10_000;
    const acertar = vi.fn();
    const r = await importarDocumento(propostaDeTeste(), {
      chamar: chamarModeloSeHouverChave()!,
      reservar,
      acertar,
      prazoMs: 30,
    });
    expect(sdk.chamadas[0].signal?.aborted).toBe(true);
    expect(r.revisao?.via).toBe("regras");
    expect(r.revisao?.porque).toMatch(/passou do prazo/);
    // Não se sabe quanto se gastou: a reserva fica.
    expect(acertar).not.toHaveBeenCalled();
  });

  it.each([
    ["refusal", /recusou/],
    ["max_tokens", /cortada a meio/],
  ])("«%s» vindo do SDK não preenche nada", async (stop, msg) => {
    sdk.resposta = { ...sdk.resposta!, stop_reason: stop };
    const r = await importarDocumento(propostaDeTeste(), {
      chamar: chamarModeloSeHouverChave()!,
      reservar,
    });
    expect(r.revisao?.via).toBe("regras");
    expect(r.revisao?.porque).toMatch(msg);
  });
});
