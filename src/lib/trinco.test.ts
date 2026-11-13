import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Uma `app_state` em memória com a única garantia que o trinco usa: o INSERT
 * de uma chave que já existe falha com 23505, como no Postgres.
 */
const linhas = new Map<string, { value: unknown; updated_at: string }>();
let emBaixo = false;

function fake() {
  return {
    from() {
      return {
        async insert(row: { key: string; value: unknown; updated_at: string }) {
          if (emBaixo) return { error: new Error("rede") };
          if (linhas.has(row.key)) {
            return { error: { code: "23505", message: "duplicate key value" } };
          }
          linhas.set(row.key, { value: row.value, updated_at: row.updated_at });
          return { error: null };
        },
        select() {
          let key = "";
          const b = {
            eq(_c: string, v: string) {
              key = v;
              return b;
            },
            async maybeSingle() {
              return { data: linhas.get(key) ?? null, error: null };
            },
          };
          return b;
        },
        delete() {
          const filtro: Record<string, string> = {};
          const b = {
            eq(c: string, v: string) {
              filtro[c] = v;
              return b;
            },
            then(resolve: (v: { error: null }) => unknown) {
              const l = linhas.get(filtro.key);
              if (l && (!filtro.updated_at || l.updated_at === filtro.updated_at)) {
                linhas.delete(filtro.key);
              }
              return Promise.resolve(resolve({ error: null }));
            },
          };
          return b;
        },
      };
    },
  };
}

let comSupabase = true;
vi.mock("./supabase", () => ({ getSupabase: () => (comSupabase ? fake() : null) }));

const { fecharTrinco, __limparTrincosEmMemoria } = await import("./trinco");

beforeEach(() => {
  linhas.clear();
  emBaixo = false;
  comSupabase = true;
  __limparTrincosEmMemoria();
});

describe("trinco (Supabase)", () => {
  it("o segundo não entra enquanto o primeiro não solta; depois entra", async () => {
    const a = await fecharTrinco("envio:1", 60_000);
    expect(a.ok).toBe(true);
    expect((await fecharTrinco("envio:1", 60_000)).ok).toBe(false);
    // Outro nome não é afectado.
    expect((await fecharTrinco("envio:2", 60_000)).ok).toBe(true);
    if (a.ok) await a.soltar();
    expect((await fecharTrinco("envio:1", 60_000)).ok).toBe(true);
  });

  it("um trinco vencido (a função morreu a meio) não trava para sempre", async () => {
    linhas.set("trinco:envio:1", {
      value: { ate: new Date(Date.now() - 1000).toISOString() },
      updated_at: "2026-11-13T10:00:00.000Z",
    });
    expect((await fecharTrinco("envio:1", 60_000)).ok).toBe(true);
  });

  it("o soltar de um trinco antigo não apaga o trinco novo de outro pedido", async () => {
    const a = await fecharTrinco("envio:1", 60_000);
    // Simula: o de `a` venceu e outro pedido ficou com a chave.
    linhas.set("trinco:envio:1", {
      value: { ate: new Date(Date.now() + 60_000).toISOString() },
      updated_at: "outra-data",
    });
    if (a.ok) await a.soltar();
    expect(linhas.has("trinco:envio:1")).toBe(true);
  });

  it("com a base de dados em baixo, o trinco abre (não trava o envio dela)", async () => {
    emBaixo = true;
    expect((await fecharTrinco("envio:1", 60_000)).ok).toBe(true);
  });
});

describe("trinco (sem Supabase, em memória)", () => {
  it("trava e solta", async () => {
    comSupabase = false;
    const a = await fecharTrinco("x", 60_000);
    expect((await fecharTrinco("x", 60_000)).ok).toBe(false);
    if (a.ok) await a.soltar();
    expect((await fecharTrinco("x", 60_000)).ok).toBe(true);
  });
});
