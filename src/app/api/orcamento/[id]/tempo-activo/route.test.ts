import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * A porta do tempo activo: o guarda de admin, a validação do corpo, e a coisa
 * que este endpoint existe para fazer — SOMAR pedaços em vez de aceitar totais.
 */
const st = vi.hoisted(() => ({
  authed: true,
  acumulado: 0,
  /** O armazenamento a ATIRAR (não a devolver «não gravei»): sem `try/catch`
   *  isto saía como 500 anónimo por causa de meio minuto de uma MEDIÇÃO. */
  rebenta: false,
  acrescentar: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/tempo-activo-servidor", () => ({
  getTempoActivo: vi.fn(async () => {
    if (st.rebenta) throw new Error("app_state em baixo");
    return { ms: st.acumulado, updatedAt: "2026-01-01T00:00:00.000Z" };
  }),
  acrescentarTempoActivo: vi.fn(async (id: string, ms: number, seccao?: string) => {
    st.acrescentar(id, ms, seccao);
    if (st.rebenta) throw new Error("app_state em baixo");
    st.acumulado += ms;
    return {
      tempo: { ms: st.acumulado, updatedAt: "2026-01-01T00:00:00.000Z" },
      persistencia: { gravado: true, duradouro: true, onde: "supabase" },
    };
  }),
}));

const { GET, POST } = await import("./route");

const params = Promise.resolve({ id: "LIQ-1" });
const post = (body: unknown) =>
  ({
    json: async () => body,
  }) as unknown as NextRequest;

beforeEach(() => {
  st.authed = true;
  st.acumulado = 0;
  st.rebenta = false;
  st.acrescentar.mockClear();
});

describe("POST /api/orcamento/[id]/tempo-activo", () => {
  it("recusa quem não entrou", async () => {
    st.authed = false;
    const res = await POST(post({ ms: 1000 }), { params });
    expect(res.status).toBe(401);
    expect(st.acrescentar).not.toHaveBeenCalled();
  });

  it("soma os envios sucessivos — não os substitui", async () => {
    await POST(post({ ms: 60_000 }), { params });
    const res = await POST(post({ ms: 30_000 }), { params });
    expect((await res.json()).tempo.ms).toBe(90_000);
  });

  it("leva a secção quando ela vem", async () => {
    await POST(post({ ms: 1000, seccao: "mood-boards" }), { params });
    expect(st.acrescentar).toHaveBeenCalledWith("LIQ-1", 1000, "mood-boards");
  });

  it("ignora uma secção que não seja texto, em vez de rebentar", async () => {
    await POST(post({ ms: 1000, seccao: { nao: "é texto" } }), { params });
    expect(st.acrescentar).toHaveBeenCalledWith("LIQ-1", 1000, undefined);
  });

  it("recusa o que não é tempo", async () => {
    for (const mau of [undefined, null, "60000", -1, Number.NaN, {}]) {
      const res = await POST(post({ ms: mau }), { params });
      expect(res.status, String(mau)).toBe(400);
    }
    expect(st.acrescentar).not.toHaveBeenCalled();
  });

  it("aguenta um corpo que não é JSON", async () => {
    const mau = {
      json: async () => {
        throw new Error("não é JSON");
      },
    } as unknown as NextRequest;
    const res = await POST(mau, { params });
    expect(res.status).toBe(400);
  });

  it("o armazenamento a rebentar não parte o estúdio — diz que não guardou", async () => {
    st.rebenta = true;
    const res = await POST(post({ ms: 1000 }), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).guardado).toBe(false);
  });
});

describe("GET /api/orcamento/[id]/tempo-activo", () => {
  it("recusa quem não entrou", async () => {
    st.authed = false;
    expect((await GET({} as NextRequest, { params })).status).toBe(401);
  });

  it("devolve o acumulado", async () => {
    st.acumulado = 120_000;
    const res = await GET({} as NextRequest, { params });
    expect((await res.json()).tempo.ms).toBe(120_000);
  });

  it("uma leitura que rebenta devolve zero e diz que não leu — não um 500", async () => {
    st.rebenta = true;
    const res = await GET({} as NextRequest, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tempo.ms).toBe(0);
    expect(body.lido).toBe(false);
  });
});
