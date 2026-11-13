import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «NÃO CONSEGUI LER» NÃO É «NÃO HÁ NADA» (auditoria de 13/11)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Um erro passageiro do Supabase (o PGRST303 do relógio, uma ligação que cai)
 * fazia o `getState` devolver `null` — e quem lia para mudar e voltar a gravar
 * gravava uma lista VAZIA por cima: as palavras-passe redefinidas, os modelos
 * de proposta e de guião, o histórico dos envios.
 */

const st = vi.hoisted(() => ({ respostas: [] as { error: unknown; data?: unknown }[] }));

vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("./supabase", () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => st.respostas.shift() ?? { error: null, data: null },
        }),
      }),
    }),
  }),
}));

import { getState, LeituraFalhou } from "./app-state";

const ERRO = { code: "PGRST303", message: "JWT issued at future" };

beforeEach(() => {
  st.respostas = [];
});

describe("ler o app_state", () => {
  it("um erro passageiro repete-se — e à segunda dá o valor", async () => {
    st.respostas = [{ error: ERRO }, { error: null, data: { value: ["a"] } }];
    expect(await getState<string[]>("x")).toEqual(["a"]);
  });

  it("só para ler: depois das tentativas, uma falha dá `null` (como antes)", async () => {
    st.respostas = [{ error: ERRO }, { error: ERRO }, { error: ERRO }];
    expect(await getState("x")).toBeNull();
  });

  it("para MUDAR ({ ouFalha }): uma falha LANÇA — nunca se grava por cima do que não se leu", async () => {
    st.respostas = [{ error: ERRO }, { error: ERRO }, { error: ERRO }];
    await expect(getState("x", { ouFalha: true })).rejects.toBeInstanceOf(LeituraFalhou);
  });

  it("para mudar: «não há nada» continua a ser `null`", async () => {
    st.respostas = [{ error: null, data: null }];
    expect(await getState("x", { ouFalha: true })).toBeNull();
  });
});

describe("o relógio adiantado (PGRST303) é passageiro, não uma permissão recusada", () => {
  it("repete — a mensagem diz «JWT», e isso não o faz uma permissão", async () => {
    st.respostas = [{ error: ERRO }, { error: ERRO }, { error: null, data: { value: 1 } }];
    expect(await getState<number>("x", { ouFalha: true })).toBe(1);
  });
});
