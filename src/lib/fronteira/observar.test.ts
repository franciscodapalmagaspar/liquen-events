import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { log } from "@/lib/logger";
import { __esquecerDesviosDitos, CASOS_POR_DESVIO, observar } from "./observar";
import { esquemaDoDocumentoQueChega } from "./documento-da-proposta";
import { esquemaDoPedidoGuardado } from "./pedido-guardado";

const esquema = z.looseObject({ nome: z.string(), n: z.number().optional() });

beforeEach(() => {
  __esquecerDesviosDitos();
  vi.restoreAllMocks();
});

describe("a fronteira em modo de observar", () => {
  it("o que bate passa calado", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    expect(observar(esquema, { nome: "x", extra: 1 }, "teste")).toBe(true);
    expect(aviso).not.toHaveBeenCalled();
  });

  it("o que não bate é dito — o sítio e o tipo do desvio, NUNCA o valor", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    expect(observar(esquema, { nome: 42, n: "maria@exemplo.pt" }, "teste", { id: "q1" })).toBe(
      false,
    );
    expect(aviso).toHaveBeenCalledTimes(1);
    const [mensagem, contexto] = aviso.mock.calls[0];
    expect(mensagem).toContain("fronteira: teste não bate com o esquema");
    expect(contexto).toEqual({
      id: "q1",
      desvios: [
        { campo: "nome", problema: "invalid_type" },
        { campo: "n", problema: "invalid_type" },
      ],
    });
    // O valor (aqui um email) nunca chega ao registo.
    expect(JSON.stringify(aviso.mock.calls)).not.toContain("maria@exemplo.pt");
  });

  it("um corpo que nem é objecto também se diz, na raiz", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    observar(esquema, null, "teste");
    expect(aviso.mock.calls[0][1]).toEqual({
      desvios: [{ campo: "(raiz)", problema: "invalid_type" }],
    });
  });

  it("o mesmo desvio diz-se uma vez por processo e por caso — a lista de pedidos lê todos a cada vez", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    for (let i = 0; i < 50; i++) observar(esquema, { nome: 1 }, "teste", { id: "q1" });
    expect(aviso).toHaveBeenCalledTimes(1);
    // Outro caso com o mesmo desvio também se diz: a fase seguinte precisa de saber QUAIS.
    observar(esquema, { nome: 1 }, "teste", { id: "q2" });
    expect(aviso).toHaveBeenCalledTimes(2);
    // Um desvio diferente no mesmo caso é outra linha.
    observar(esquema, { nome: "ok", n: "x" }, "teste", { id: "q1" });
    expect(aviso).toHaveBeenCalledTimes(3);
  });

  it("cada desvio diz no máximo CASOS_POR_DESVIO casos", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    for (let i = 0; i < CASOS_POR_DESVIO + 30; i++) {
      observar(esquema, { nome: 1 }, "teste", { id: `q${i}` });
    }
    expect(aviso).toHaveBeenCalledTimes(CASOS_POR_DESVIO);
  });

  it("nunca muda o valor: quem chama continua com o objecto original", () => {
    vi.spyOn(log, "warn").mockImplementation(() => {});
    const original = { nome: 1, campoNovo: { a: 1 } };
    const copia = structuredClone(original);
    observar(esquema, original, "teste");
    expect(original).toEqual(copia);
  });
});

/**
 * ── O CUSTO (regra 7) ─────────────────────────────────────────────────────
 *
 * Medido aqui, e não estimado: um documento de proposta grande (80 fotos,
 * 12 grupos de 10 linhas, 20 linhas de orçamento) e a lista de pedidos inteira
 * (46 na base a 17/11; mede-se com 500). O tecto do teste é largo de propósito
 * (máquinas de CI lentas) — o número medido vai no documento.
 */
describe("o custo de conferir", () => {
  const docGrande = {
    ref: "PO",
    clientNames: "A & B",
    serviceGroups: Array.from({ length: 12 }, (_, g) => ({
      title: `Grupo ${g}`,
      items: Array.from({ length: 10 }, (_, i) => ({ label: `L${i}`, desc: "texto ".repeat(20) })),
    })),
    moodBoards: Array.from({ length: 10 }, (_, b) => ({
      title: `Board ${b}`,
      images: Array.from({ length: 8 }, (_, i) => `temas/${b}/foto-${i}.jpg`),
    })),
    budgetItems: Array.from({ length: 20 }, (_, i) => `Item ${i}`),
    budgetAmounts: Array.from({ length: 20 }, (_, i) => (i % 3 ? i * 100 : null)),
    coverImages: ["capa.jpg"],
  };
  const pedido = {
    id: "LIQ-X",
    status: "cotado",
    submittedAt: "2026-01-01T00:00:00.000Z",
    name: "N",
    email: "e@x.pt",
    phone: "1",
    date: "2027-01-01",
    location: "L",
    notes: "",
    activityLog: Array.from({ length: 30 }, () => ({ at: "x", kind: "nota" })),
  };

  it("um documento grande confere-se em bem menos de 1 ms", () => {
    for (let i = 0; i < 50; i++) esquemaDoDocumentoQueChega.safeParse(docGrande);
    const n = 500;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) esquemaDoDocumentoQueChega.safeParse(docGrande);
    const porDoc = (performance.now() - t0) / n;
    expect(esquemaDoDocumentoQueChega.safeParse(docGrande).success).toBe(true);
    expect(porDoc).toBeLessThan(2);
  });

  it("500 pedidos conferem-se em poucos milissegundos", () => {
    for (let i = 0; i < 50; i++) esquemaDoPedidoGuardado.safeParse(pedido);
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) esquemaDoPedidoGuardado.safeParse(pedido);
    expect(esquemaDoPedidoGuardado.safeParse(pedido).success).toBe(true);
    expect(performance.now() - t0).toBeLessThan(100);
  });
});
