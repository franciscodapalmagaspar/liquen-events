import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * O TECTO DE TENTATIVAS dos códigos de 8 (pedido dela, 25/10: os nomes no
 * endereço e um código mais curto). Quarenta bits sozinhos adivinham-se com
 * paciência; por isso, acima do tecto por IP, um código de 8 deixa de abrir —
 * mesmo o certo. Os de 16 (80 bits) não contam.
 */
const gaveta = new Map<string, unknown>();
const st = { ritmoOk: true, ip: "203.0.113.7" as string | null };

vi.mock("./app-state", () => ({
  getState: vi.fn(async (k: string) => gaveta.get(k) ?? null),
  setState: vi.fn(async (k: string, v: unknown) => {
    gaveta.set(k, v);
    return { gravado: true, duradouro: true, onde: "teste" };
  }),
}));
vi.mock("./proposals-store", () => ({ getProposal: vi.fn(async () => null) }));
const contados: string[] = [];
vi.mock("./rate-limit", () => ({
  rateLimit: vi.fn(async (k: string) => {
    contados.push(k);
    return { ok: st.ritmoOk };
  }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(st.ip ? { "x-vercel-forwarded-for": st.ip } : {}),
}));

const { lerLigacaoCurta } = await import("./proposta-link-curto");

const guardar = (codigo: string) =>
  gaveta.set(`ligacao-proposta:${codigo}`, {
    propostaId: "p1",
    pedidoId: "q1",
    criadaEm: new Date().toISOString(),
    expiraEm: new Date(Date.now() + 86_400_000).toISOString(),
  });

beforeEach(() => {
  gaveta.clear();
  contados.length = 0;
  st.ritmoOk = true;
  st.ip = "203.0.113.7";
});

describe("o tecto de tentativas", () => {
  it("dentro do tecto, um código de 8 abre — e conta por IP", async () => {
    guardar("k7m2q9xd");
    expect((await lerLigacaoCurta("k7m2q9xd"))?.propostaId).toBe("p1");
    expect(contados).toEqual(["proposta-codigo:203.0.113.7"]);
  });

  it("acima do tecto, nem o código certo abre", async () => {
    guardar("k7m2q9xd");
    st.ritmoOk = false;
    expect(await lerLigacaoCurta("k7m2q9xd")).toBeNull();
  });

  it("os códigos de 16 não contam (80 bits não precisam)", async () => {
    guardar("njwwrj4m7tyz6x62");
    st.ritmoOk = false;
    expect((await lerLigacaoCurta("njwwrj4m7tyz6x62"))?.propostaId).toBe("p1");
    expect(contados).toEqual([]);
  });

  it("fora de um pedido (sem IP) não se conta nem se bloqueia", async () => {
    guardar("k7m2q9xd");
    st.ip = null;
    st.ritmoOk = false;
    expect((await lerLigacaoCurta("k7m2q9xd"))?.propostaId).toBe("p1");
  });
});
