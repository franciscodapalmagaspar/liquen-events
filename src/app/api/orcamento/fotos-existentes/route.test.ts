import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const st = vi.hoisted(() => ({
  authed: false,
  procurar: vi.fn(async (_r: unknown[], _q: string | null) => new Map<string, string>()),
  parecidas: vi.fn(
    async (_i: unknown[], _q: string | null, _l?: Map<string, number>) =>
      new Map<string, unknown>(),
  ),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/fotos-resumo", () => ({
  MAX_RESUMOS_POR_PERGUNTA: 60,
  procurarExistentes: (r: unknown[], q: string | null) => st.procurar(r, q),
}));
vi.mock("@/lib/fotos-parecidas", () => ({
  MAX_IMPRESSOES_POR_PERGUNTA: 60,
  procurarParecidas: (i: unknown[], q: string | null, l: Map<string, number>) =>
    st.parecidas(i, q, l),
}));
vi.mock("@/lib/ocupacao-do-armazenamento", () => ({
  lerEspaco: async () => ({
    conhecido: true,
    sobra: 123,
    ocupado: 1,
    travao: 2,
    limite: 3,
    medidoEm: null,
  }),
}));
vi.mock("@/lib/proposal-assinaturas", () => ({
  signProposalThumbs: async (p: string[]) => new Map(p.map((c) => [c, `https://x/${c}`])),
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { POST } from "./route";

function pedido(corpo: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento/fotos-existentes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  st.authed = true;
  vi.clearAllMocks();
});

describe("POST /api/orcamento/fotos-existentes", () => {
  it("recusa sem sessão e nem chega a ler o índice", async () => {
    st.authed = false;
    const res = await POST(pedido({ resumos: ["a".repeat(32)] }));
    expect(res.status).toBe(401);
    expect(st.procurar).not.toHaveBeenCalled();
  });

  it("devolve só os resumos conhecidos, com o caminho", async () => {
    st.procurar.mockResolvedValueOnce(new Map([["a".repeat(32), "tema:t1/x.jpg"]]));
    const res = await POST(pedido({ resumos: ["a".repeat(32), "b".repeat(32)] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      existentes: { ["a".repeat(32)]: "tema:t1/x.jpg" },
      parecidas: {},
      espaco: { conhecido: true, sobra: 123 },
    });
    // Sem pedido: só a Biblioteca conta.
    expect(st.procurar).toHaveBeenCalledWith(["a".repeat(32), "b".repeat(32)], null);
  });

  it("recusa um corpo sem lista e uma lista acima do tecto", async () => {
    expect((await POST(pedido({}))).status).toBe(400);
    expect((await POST(pedido({ resumos: Array(61).fill("a".repeat(32)) }))).status).toBe(400);
    expect(st.procurar).not.toHaveBeenCalled();
  });

  it("um índice ilegível é «nada se sabe» — nunca um erro que trave a importação", async () => {
    st.procurar.mockRejectedValueOnce(new Error("base de dados em baixo"));
    const res = await POST(pedido({ resumos: ["a".repeat(32)] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, existentes: {} });
  });

  it("pelo que mostram: devolve a parecida com o veredicto e a miniatura para comparar", async () => {
    const imp = "1".repeat(86);
    st.parecidas.mockResolvedValueOnce(
      new Map([
        [
          imp,
          {
            caminho: "tema:t1/y.jpg",
            veredicto: "talvez",
            distancias: { grossa: 8, fina: 40, cor: 1 },
          },
        ],
      ]),
    );
    const res = await POST(pedido({ resumos: [], impressoes: [imp], lados: [1800] }));
    expect(res.status).toBe(200);
    expect((await res.json()).parecidas).toEqual({
      [imp]: {
        caminho: "tema:t1/y.jpg",
        veredicto: "talvez",
        distancias: { grossa: 8, fina: 40, cor: 1 },
        miniatura: "https://x/tema:t1/y.jpg",
      },
    });
    // O lado de que a foto precisa vai com ela (uma guardada mais pequena não serve).
    expect(st.parecidas).toHaveBeenCalledWith([imp], null, new Map([[imp, 1800]]));
  });

  it("recusa mais impressões do que o tecto", async () => {
    const res = await POST(pedido({ resumos: [], impressoes: Array(61).fill("1".repeat(86)) }));
    expect(res.status).toBe(400);
  });
});
