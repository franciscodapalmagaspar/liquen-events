import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A vigia do registo dos espaços está mesmo no caminho das leituras (P2): o
 * valor fora da forma fica registado, e quem lê recebe-o tal e qual — nesta
 * fase nunca se recusa nada.
 */

const st = vi.hoisted(() => ({ resposta: { error: null as unknown, data: null as unknown } }));
const warn = vi.hoisted(() => vi.fn());

vi.mock("./logger", () => ({ log: { error: vi.fn(), warn, info: vi.fn() } }));
vi.mock("./supabase", () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => st.resposta }),
      }),
    }),
  }),
}));

import { getState, lerEstadoComVersao } from "./app-state";
import { esquecerAvisos } from "./app-state/vigiar";

beforeEach(() => {
  warn.mockReset();
  esquecerAvisos();
});

describe("ler o app_state passa pela vigia", () => {
  it("getState: o valor estragado chega igual a quem lê, e fica registado", async () => {
    const estragado = { ms: "muito" };
    st.resposta = { error: null, data: { value: estragado } };
    expect(await getState("tempo-activo:q1")).toEqual(estragado);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/fora da forma/),
      expect.objectContaining({ espaco: "tempoActivo" }),
    );
  });

  it("lerEstadoComVersao: o mesmo, e a versão continua a ser o updated_at", async () => {
    st.resposta = {
      error: null,
      data: { value: { codigo: 7 }, updated_at: "2026-11-17T00:00:00Z" },
    };
    expect(await lerEstadoComVersao("ligacao-de-proposta:p1", 1000)).toEqual({
      valor: { codigo: 7 },
      versao: "2026-11-17T00:00:00Z",
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("um valor certo não diz nada", async () => {
    st.resposta = { error: null, data: { value: { codigo: "abc" } } };
    await getState("ligacao-de-proposta:p1");
    expect(warn).not.toHaveBeenCalled();
  });
});
