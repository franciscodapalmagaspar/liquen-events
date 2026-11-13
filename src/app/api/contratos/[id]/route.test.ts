import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Contract } from "@/lib/contract-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUM CONTRATO CONSEGUIA FICAR «ACEITE»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Nasciam `pendente` e não havia porta nenhuma para os mudar: o
 * `updateContract` existia sem um único chamador de produção. O que isso
 * apagava, medido nos ecrãs: o portal do casal dizia «Aceitação pendente» e
 * NUNCA mostrava o botão do contrato em PDF; o filtro «Aceite» ficava vazio
 * para sempre; o contador dizia sempre 0; e o congelamento da proposta aceite
 * era código que não podia correr, porque nunca havia aceite com que comparar.
 *
 * O que esta rota grava NÃO é uma assinatura electrónica — o botão de aceitar
 * pelo link foi retirado, «um casamento não se fecha num botão». É o REGISTO
 * de um sim que aconteceu noutro sítio: quem o registou (lido da sessão),
 * quando, e como a casa soube.
 */

const authed = vi.hoisted(() => ({ ok: false }));
const dados = vi.hoisted(() => ({
  contrato: null as Contract | null,
  proposta: null as Record<string, unknown> | null,
  gravado: null as Record<string, unknown> | null,
  falhaAoLerProposta: false,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/email-quem-assina", () => ({ nomeDeQuemEnvia: () => "Catarina Gaspar" }));
vi.mock("@/lib/contracts-store", () => ({
  getContract: async () => dados.contrato,
  updateContract: async (_id: string, patch: Record<string, unknown>) => {
    dados.gravado = patch;
    return { ...(dados.contrato as object), ...patch };
  },
}));
vi.mock("@/lib/proposals-store", () => ({
  getProposal: async () => {
    if (dados.falhaAoLerProposta) throw new Error("base em baixo");
    return dados.proposta;
  },
}));

const { PATCH } = await import("./route");

const params = Promise.resolve({ id: "c1" });
const pedido = (corpo: unknown) =>
  new Request("https://liquen.test/api/contratos/c1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  }) as unknown as NextRequest;

const contratoPendente = (): Contract =>
  ({
    id: "c1",
    quoteId: "q1",
    proposalId: "p1",
    clientName: "Maria Silva",
    clientEmail: "maria@example.com",
    termsVersion: "2026-01",
    termsSnapshot: "…",
    status: "pendente",
    createdAt: "2026-05-01T10:00:00.000Z",
  }) as Contract;

beforeEach(() => {
  authed.ok = true;
  dados.contrato = contratoPendente();
  dados.proposta = { id: "p1", quoteId: "q1", versaoSelo: "a".repeat(64), versaoNumero: 2 };
  dados.gravado = null;
  dados.falhaAoLerProposta = false;
});

describe("PATCH /api/contratos/[id] — registar o aceite", () => {
  it("recusa quem não tem sessão, e não grava nada", async () => {
    authed.ok = false;
    const res = await PATCH(pedido({ como: "papel" }), { params });
    expect(res.status).toBe(401);
    expect(dados.gravado).toBe(null);
  });

  it("marca como aceite, com quem registou e como", async () => {
    const res = await PATCH(pedido({ como: "Assinado em papel, entregue a 12/05" }), { params });
    expect(res.status).toBe(200);
    expect(dados.gravado).toMatchObject({
      status: "aceite",
      registadoPor: "Catarina Gaspar",
      registadoComo: "Assinado em papel, entregue a 12/05",
    });
    expect(Number.isNaN(Date.parse(String(dados.gravado?.acceptedAt)))).toBe(false);
  });

  it("copia a versão da proposta — é o que faz o congelamento funcionar", async () => {
    await PATCH(pedido({ como: "por email" }), { params });
    expect(dados.gravado).toMatchObject({
      propostaVersaoSelo: "a".repeat(64),
      propostaVersaoNumero: 2,
    });
  });

  it("NÃO inventa nome nem IP do casal — isto não é um aceite electrónico", async () => {
    await PATCH(pedido({ como: "por email" }), { params });
    expect(dados.gravado).not.toHaveProperty("acceptedName");
    expect(dados.gravado).not.toHaveProperty("acceptedIp");
  });

  it("sem o «como», recusa — um estado sem prova por trás não vale nada", async () => {
    const res = await PATCH(pedido({ como: "   " }), { params });
    expect(res.status).toBe(400);
    expect(dados.gravado).toBe(null);
    expect((await res.json()).error).toMatch(/como é que o aceite aconteceu/i);
  });

  it("um contrato já aceite não se volta a marcar", async () => {
    dados.contrato = { ...contratoPendente(), status: "aceite" } as Contract;
    const res = await PATCH(pedido({ como: "outra vez" }), { params });
    expect(res.status).toBe(409);
    // Reescrever apagava a data e o nome do registo original — que é a prova.
    expect(dados.gravado).toBe(null);
  });

  it("um contrato que não existe dá 404", async () => {
    dados.contrato = null;
    const res = await PATCH(pedido({ como: "papel" }), { params });
    expect(res.status).toBe(404);
  });

  it("uma proposta de outro pedido não empresta a sua versão", async () => {
    dados.proposta = { id: "p1", quoteId: "OUTRO", versaoSelo: "b".repeat(64), versaoNumero: 9 };
    await PATCH(pedido({ como: "papel" }), { params });
    expect(dados.gravado).not.toHaveProperty("propostaVersaoSelo");
    // …e o aceite grava-se à mesma: o que se perde é a comparação, não o negócio.
    expect(dados.gravado).toMatchObject({ status: "aceite" });
  });

  it("se a leitura da proposta falhar, o aceite grava-se na mesma", async () => {
    dados.falhaAoLerProposta = true;
    const res = await PATCH(pedido({ como: "papel" }), { params });
    expect(res.status).toBe(200);
    expect(dados.gravado).toMatchObject({ status: "aceite" });
  });
});

describe("PATCH /api/contratos/[id] — desfazer o registo («voltar atrás»)", () => {
  /**
   * Palavras dela: «tem que haver no site todo, em tudo aquilo que se faz, uma
   * forma de voltar atrás». Marcar como assinado por engano tinha de ter volta.
   */
  const registado = () =>
    ({
      ...contratoPendente(),
      status: "aceite",
      acceptedAt: "2026-10-10T11:47:00.000Z",
      registadoPor: "Catarina Gaspar",
      registadoComo: "assinado em papel",
    }) as Contract;

  it("volta a pendente e limpa o registo", async () => {
    dados.contrato = registado();
    const res = await PATCH(pedido({ desfazer: true }), { params });
    expect(res.status).toBe(200);
    expect(dados.gravado).toEqual({
      status: "pendente",
      acceptedAt: "",
      acceptedName: "",
      registadoPor: "",
      registadoComo: "",
      propostaVersaoSelo: "",
      propostaVersaoNumero: null,
    });
  });

  /** Auditoria 6, n.º 18: o selo da versão aceite ia com o registo, e ficava. */
  it("leva o selo da versão da proposta com o registo", async () => {
    dados.contrato = {
      ...registado(),
      propostaVersaoSelo: "abc123",
      propostaVersaoNumero: 3,
    } as Contract;
    await PATCH(pedido({ desfazer: true }), { params });
    expect(dados.gravado).toMatchObject({ propostaVersaoSelo: "", propostaVersaoNumero: null });
  });

  it("um aceite electrónico do casal (com IP) não se desfaz — é a prova", async () => {
    dados.contrato = { ...registado(), acceptedIp: "1.2.3.4" } as Contract;
    const res = await PATCH(pedido({ desfazer: true }), { params });
    expect(res.status).toBe(409);
    expect(dados.gravado).toBe(null);
  });

  it("desfazer um contrato que já está pendente não grava nada", async () => {
    const res = await PATCH(pedido({ desfazer: true }), { params });
    expect(res.status).toBe(200);
    expect(dados.gravado).toBe(null);
  });

  it("sem sessão, 401", async () => {
    authed.ok = false;
    dados.contrato = registado();
    const res = await PATCH(pedido({ desfazer: true }), { params });
    expect(res.status).toBe(401);
    expect(dados.gravado).toBe(null);
  });
});
