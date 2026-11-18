import { describe, it, expect, vi, beforeEach } from "vitest";

const avisos = vi.hoisted(() => [] as { msg: string; ctx: Record<string, unknown> }[]);
vi.mock("./logger", () => ({
  log: {
    warn: (msg: string, ctx: Record<string, unknown>) => avisos.push({ msg, ctx }),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const { registarSeForaDoEsquema } = await import("./esquemas-de-leitura");
const { pedidoLidoSchema } = await import("./orcamento/pedido.esquema");
const { documentoLidoSchema } = await import("./proposal-doc.esquema");

/** Um pedido mínimo como os de produção (25 dos 47 não têm `priceBreakdown`). */
const PEDIDO = {
  id: "LIQ-AAA-1",
  submittedAt: "2026-03-01T09:00:00.000Z",
  status: "pendente",
  name: "Ana",
  email: "ana@exemplo.pt",
  payments: [{ amount: 500, date: "2026-04-01" }],
  tags: ["VIP"],
  umaChaveQueOCodigoAindaNaoConhece: { qualquer: "coisa" },
};

const DOCUMENTO = {
  ref: "PO Decoração Casamento",
  clientNames: "Ana & João",
  eventType: "Casamento",
  eventDate: "16 de maio de 2026",
  location: "Évora",
  guests: "120 pax",
  serviceGroups: [{ letter: "a)", title: "Decoração", items: [] }],
  moodBoards: [{ title: "Cerimónia", images: [] }],
  budgetItems: ["Decor Cerimónia"],
  budgetAmounts: [1200, null],
};

beforeEach(() => {
  avisos.length = 0;
});

describe("o pedido lido (P6, só registo)", () => {
  it("um pedido bom passa, sem priceBreakdown e com chaves desconhecidas", () => {
    expect(pedidoLidoSchema.safeParse(PEDIDO).success).toBe(true);
    expect(registarSeForaDoEsquema("pedido", "LIQ-AAA-1", PEDIDO)).toBe(true);
    expect(avisos).toEqual([]);
  });

  it("um pedido com forma inesperada é registado com o CAMINHO, nunca com o valor", () => {
    const estragado = { ...PEDIDO, status: "inventado", payments: [{ amount: "500 €" }] };
    expect(registarSeForaDoEsquema("pedido", "LIQ-AAA-1", estragado)).toBe(false);
    expect(avisos).toHaveLength(1);
    const problemas = String(avisos[0].ctx.problemas);
    expect(problemas).toContain("status:");
    expect(problemas).toContain("payments.0.amount:");
    expect(JSON.stringify(avisos[0])).not.toContain("500 €");
    expect(JSON.stringify(avisos[0])).not.toContain("inventado");
  });

  it("a mesma forma estragada do mesmo pedido vai ao registo uma vez só", () => {
    const estragado = { ...PEDIDO, tags: "VIP" };
    registarSeForaDoEsquema("pedido", "LIQ-REPETIDO", estragado);
    registarSeForaDoEsquema("pedido", "LIQ-REPETIDO", estragado);
    expect(avisos).toHaveLength(1);
  });

  it("não muda nem recusa nada: só diz se passou", () => {
    const copia = structuredClone(PEDIDO);
    registarSeForaDoEsquema("pedido", "x", copia);
    expect(copia).toEqual(PEDIDO);
    expect(registarSeForaDoEsquema("pedido", "y", null)).toBe(false);
  });
});

describe("o documento do estúdio lido (P6, só registo)", () => {
  it("um documento bom passa", () => {
    expect(documentoLidoSchema.safeParse(DOCUMENTO).success).toBe(true);
  });

  it("um documento sem as listas passa (o withProposalDefaults repõe-nas), com a forma errada é registado", () => {
    const { moodBoards: _sem, ...semMoodBoards } = DOCUMENTO;
    expect(registarSeForaDoEsquema("documento-do-estudio", "p0", semMoodBoards)).toBe(true);
    expect(
      registarSeForaDoEsquema("documento-do-estudio", "p1", { ...DOCUMENTO, moodBoards: "x" }),
    ).toBe(false);
    expect(String(avisos[0].ctx.problemas)).toContain("moodBoards:");
  });
});

describe("o custo: cada versão de um registo verifica-se uma vez", () => {
  it("a mesma versão não volta a ser verificada; uma versão nova volta", () => {
    expect(registarSeForaDoEsquema("pedido", "LIQ-V", PEDIDO, "2026-11-18T10:00:00Z")).toBe(true);
    // Mesma versão: não se volta a olhar (o valor nem chega ao esquema).
    expect(registarSeForaDoEsquema("pedido", "LIQ-V", null, "2026-11-18T10:00:00Z")).toBe(true);
    // Versão nova: verifica-se outra vez.
    expect(registarSeForaDoEsquema("pedido", "LIQ-V", null, "2026-11-18T11:00:00Z")).toBe(false);
  });

  it("uma versão que falhou continua a dizer que falhou (e só vai ao registo uma vez)", () => {
    expect(registarSeForaDoEsquema("pedido", "LIQ-M", null, "v1")).toBe(false);
    expect(registarSeForaDoEsquema("pedido", "LIQ-M", null, "v1")).toBe(false);
    expect(avisos).toHaveLength(1);
  });

  it("sem id não se guarda nada: dois registos sem id com a mesma data verificam-se os dois", () => {
    expect(registarSeForaDoEsquema("pedido", "", PEDIDO, "v1")).toBe(true);
    expect(registarSeForaDoEsquema("pedido", "", null, "v1")).toBe(false);
  });
});
