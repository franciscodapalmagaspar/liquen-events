import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * «CRIAR NO MOLONI»: as contas são do servidor, a partir da proposta ACEITE; um
 * rascunho por fase; e nada sai sem a ligação configurada. O Moloni é de
 * mentira (o módulo tem testes próprios em `lib/moloni.test.ts`).
 */

const authed = vi.hoisted(() => ({ ok: true }));
const estado = vi.hoisted(() => ({
  quote: null as Record<string, unknown> | null,
  propostas: [] as Record<string, unknown>[],
  gravado: null as Record<string, unknown> | null,
  config: true,
}));
const moloni = vi.hoisted(() => ({
  criar: vi.fn(async (_cfg: unknown, _p: unknown) => ({ documentId: 77, valorSemIva: 3000 })),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: vi.fn(async () => estado.quote),
  updateQuoteWith: vi.fn(
    async (_id: string, f: (q: Record<string, unknown>) => Record<string, unknown>) => {
      estado.gravado = f(estado.quote!);
      estado.quote = estado.gravado;
      return estado.gravado;
    },
  ),
}));
vi.mock("@/lib/proposals-store", () => ({
  listProposalsForQuote: vi.fn(async () => estado.propostas),
}));
vi.mock("@/lib/moloni", async (orig) => {
  const real = await orig<typeof import("@/lib/moloni")>();
  return {
    ...real,
    configDoMoloni: () => (estado.config ? { companyId: 1 } : null),
    variaveisEmFalta: () => (estado.config ? [] : ["MOLONI_CLIENT_ID"]),
    criarRascunhoDeFatura: moloni.criar,
  };
});

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "LIQ-1" }) };
const req = (body: unknown) =>
  new Request("https://liquen.test/api/orcamento/LIQ-1/moloni", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;

const DOC = {
  eventType: "Casamento",
  eventDate: "12/06/2027",
  budgetItems: ["Decor Cerimónia", "Montagem"],
  repartoPorArtigo: { flores: 8000, servico: 2000 },
  budgetExtras: [],
  totalAmount: 10000,
  totalVatMode: "acrescer",
  vatRate: 0.23,
};

beforeEach(() => {
  authed.ok = true;
  estado.config = true;
  estado.gravado = null;
  estado.quote = { id: "LIQ-1", name: "TESTE", nif: "123456789", activityLog: [] };
  estado.propostas = [
    { id: "p2", status: "enviada", doc: { ...DOC, totalAmount: 99 } },
    { id: "p1", status: "aceite", doc: DOC },
  ];
  moloni.criar.mockClear();
});

describe("POST /api/orcamento/[id]/moloni", () => {
  it("cria o rascunho do sinal a partir da proposta ACEITE, 30% por artigo", async () => {
    const res = await POST(req({ fase: "sinal", actor: "Catarina" }), ctx);
    expect(res.status).toBe(200);
    const pedido = moloni.criar.mock.calls[0][1] as {
      partes: { artigo: string; valor: number }[];
      fase: string;
      cliente: { nif: string };
    };
    expect(pedido.fase).toBe("sinal");
    expect(pedido.partes).toEqual([
      { artigo: "flores", nome: "Flores e Elementos de Decoração", valor: 2400 },
      { artigo: "servico", nome: "Serviço", valor: 600 },
    ]);
    expect(pedido.cliente.nif).toBe("123456789");
    // Fica registado no pedido, para não se repetir sem querer.
    const g = estado.gravado as {
      faturasMoloni: { sinal: { documentId: number; por: string } };
      activityLog: { summary: string }[];
    };
    expect(g.faturasMoloni.sinal).toMatchObject({ documentId: 77, por: "Catarina" });
    expect(g.activityLog.at(-1)!.summary).toMatch(
      /Rascunho da fatura do sinal \(30%\) criado no Moloni/,
    );
  });

  it("um segundo rascunho da mesma fase só se for pedido de propósito", async () => {
    estado.quote = {
      ...estado.quote!,
      faturasMoloni: { sinal: { documentId: 5, em: "x", valorSemIva: 1 } },
    };
    const res = await POST(req({ fase: "sinal" }), ctx);
    expect(res.status).toBe(409);
    expect(moloni.criar).not.toHaveBeenCalled();
    const outra = await POST(req({ fase: "sinal", denovo: true }), ctx);
    expect(outra.status).toBe(200);
    // O rascunho anterior não se perde: fica em `anteriores`.
    expect(
      (estado.gravado as { faturasMoloni: { sinal: { anteriores: number[] } } }).faturasMoloni.sinal
        .anteriores,
    ).toEqual([5]);
  });

  it("dois cliques ao mesmo tempo não dão dois rascunhos: a marca vem antes do Moloni", async () => {
    estado.quote = {
      ...estado.quote!,
      faturasMoloni: { sinal: { em: "x", aCriarDesde: new Date().toISOString() } },
    };
    const res = await POST(req({ fase: "sinal" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).codigo).toBe("a-criar");
    expect(moloni.criar).not.toHaveBeenCalled();
  });

  it("uma marca esquecida (pedido que morreu a meio) caduca ao fim de 2 minutos", async () => {
    estado.quote = {
      ...estado.quote!,
      faturasMoloni: {
        sinal: { em: "x", aCriarDesde: new Date(Date.now() - 3 * 60_000).toISOString() },
      },
    };
    expect((await POST(req({ fase: "sinal" }), ctx)).status).toBe(200);
  });

  it("se o Moloni recusa, a marca sai — e pode-se tentar outra vez", async () => {
    const { ErroDoMoloni } = await import("@/lib/moloni");
    moloni.criar.mockRejectedValueOnce(
      new ErroDoMoloni("O artigo «Transporte» não existe no Moloni.", "artigo"),
    );
    const res = await POST(req({ fase: "sinal" }), ctx);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Transporte/);
    expect(
      (estado.gravado as { faturasMoloni?: Record<string, unknown> }).faturasMoloni?.sinal,
    ).toBeUndefined();
  });

  it("uma proposta que não fecha por artigo não chega ao Moloni, e diz porquê", async () => {
    estado.propostas = [
      {
        id: "p1",
        status: "aceite",
        doc: { ...DOC, repartoPorArtigo: { flores: 8000 } },
      },
    ];
    const res = await POST(req({ fase: "saldo" }), ctx);
    expect(res.status).toBe(422);
    const j = await res.json();
    expect(j.porque.join(" ")).toMatch(/Falta repartir 2\s?000,00\s€/);
    expect(moloni.criar).not.toHaveBeenCalled();
  });

  it("sem proposta aceite, não há fatura", async () => {
    estado.propostas = [{ id: "p2", status: "enviada", doc: DOC }];
    const res = await POST(req({ fase: "sinal" }), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).codigo).toBe("sem-proposta");
  });

  it("sem a ligação configurada, diz quais variáveis faltam", async () => {
    estado.config = false;
    const res = await POST(req({ fase: "sinal" }), ctx);
    expect(res.status).toBe(503);
    expect((await res.json()).faltam).toEqual(["MOLONI_CLIENT_ID"]);
  });

  it("à mão: sem a ligação, regista que a fase já está no Moloni — sem lhe falar", async () => {
    estado.config = false;
    const res = await POST(req({ fase: "sinal", manual: true, actor: "Catarina" }), ctx);
    expect(res.status).toBe(200);
    expect(moloni.criar).not.toHaveBeenCalled();
    const g = estado.gravado as {
      faturasMoloni: { sinal: Record<string, unknown> };
      activityLog: { summary: string }[];
    };
    expect(g.faturasMoloni.sinal).toMatchObject({
      manual: true,
      valorSemIva: 3000,
      por: "Catarina",
    });
    expect(g.faturasMoloni.sinal).not.toHaveProperty("documentId");
    expect(g.activityLog.at(-1)!.summary).toBe(
      "Fatura do sinal (30%) passada ao Moloni à mão — 3000,00 € sem IVA.",
    );
  });

  it("uma fase passada à mão também trava o rascunho pela API (e o contrário)", async () => {
    estado.quote = {
      ...estado.quote!,
      faturasMoloni: { saldo: { em: "x", valorSemIva: 7000, manual: true } },
    };
    const api = await POST(req({ fase: "saldo" }), ctx);
    expect(api.status).toBe(409);
    expect((await api.json()).error).toMatch(/à mão/);
    expect(moloni.criar).not.toHaveBeenCalled();
    expect((await POST(req({ fase: "saldo", manual: true }), ctx)).status).toBe(409);

    estado.quote = {
      ...estado.quote!,
      faturasMoloni: { sinal: { documentId: 5, em: "x" } },
    };
    expect((await POST(req({ fase: "sinal", manual: true }), ctx)).status).toBe(409);
  });

  it("à mão não fura uma proposta que não fecha", async () => {
    estado.propostas = [
      { id: "p1", status: "aceite", doc: { ...DOC, repartoPorArtigo: { flores: 8000 } } },
    ];
    expect((await POST(req({ fase: "sinal", manual: true }), ctx)).status).toBe(422);
  });

  it("«Anular» tira só a marca feita à mão — um rascunho da API não sai do registo", async () => {
    estado.quote = {
      ...estado.quote!,
      faturasMoloni: {
        sinal: { em: "x", valorSemIva: 3000, manual: true },
        saldo: { documentId: 9, em: "x" },
      },
    };
    expect((await POST(req({ fase: "sinal", desmarcar: true }), ctx)).status).toBe(200);
    expect(
      (estado.quote as { faturasMoloni: Record<string, unknown> }).faturasMoloni,
    ).not.toHaveProperty("sinal");
    const r = await POST(req({ fase: "saldo", desmarcar: true }), ctx);
    expect(r.status).toBe(409);
    expect(
      (estado.quote as { faturasMoloni: Record<string, unknown> }).faturasMoloni.saldo,
    ).toMatchObject({ documentId: 9 });
  });

  it("fora do back office, nada", async () => {
    authed.ok = false;
    expect((await POST(req({ fase: "sinal" }), ctx)).status).toBe(401);
  });
});
