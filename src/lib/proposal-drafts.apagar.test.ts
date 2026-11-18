import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Limpar um rascunho APAGA a linha (docs/ESTRUTURA-DOS-DADOS.md, P3). Gravar
 * `null` lia-se igual («não há rascunho»), mas deixava a linha para sempre:
 * eram 103 lápides a 17/11.
 */

const ops = vi.hoisted(() => ({
  lista: [] as { op: string; key?: unknown; value?: unknown }[],
  erroDoApagar: null as unknown,
}));

vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("./supabase", () => ({
  getSupabase: () => ({
    from: () => ({
      upsert: async (linha: { key: string; value: unknown }) => {
        ops.lista.push({ op: "upsert", key: linha.key, value: linha.value });
        return { error: null };
      },
      delete: () => ({
        eq: async (_coluna: string, key: string) => {
          ops.lista.push({ op: "delete", key });
          return { error: ops.erroDoApagar };
        },
      }),
    }),
  }),
}));

import { clearProposalDraft } from "./proposal-drafts";

beforeEach(() => {
  ops.lista = [];
  ops.erroDoApagar = null;
});

describe("clearProposalDraft", () => {
  it("apaga a linha em vez de gravar null", async () => {
    const r = await clearProposalDraft("pedido-1");
    expect(r.gravado).toBe(true);
    expect(ops.lista).toEqual([{ op: "delete", key: "proposal-draft:pedido-1" }]);
  });

  it("e diz quando o apagar não chegou ao servidor", async () => {
    ops.erroDoApagar = { code: "42P01", message: "relation does not exist" };
    const r = await clearProposalDraft("pedido-1");
    expect(r).toMatchObject({ gravado: false, motivo: "tabela-em-falta" });
  });
});
