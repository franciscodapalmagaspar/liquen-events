import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS 12 MESES DA POLÍTICA, EM CÓDIGO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A política PUBLICADA no sítio promete: «pedidos que não deem origem a
 * contrato são eliminados no prazo máximo de 12 meses após o último contacto».
 * Não havia nada a fazê-lo — dois trabalhos automáticos, e nenhum apagava seja
 * o que for.
 *
 * Isto apaga dados de clientes SOZINHO, todas as noites. Por isso a maior
 * parte destes testes não é sobre o que apaga: é sobre o que NÃO pode apagar.
 * Um erro nas datas aqui não é um teste vermelho — é o processo de um casal
 * que desaparece.
 */

const apagou = vi.hoisted(() => ({
  chamado: [] as string[],
  resposta: new Map<string, { apagado: boolean; motivo?: string }>(),
}));

vi.mock("@/lib/apagar-pedido", () => ({
  apagarPedido: async (id: string) => {
    apagou.chamado.push(id);
    const r = apagou.resposta.get(id) ?? { apagado: true };
    return {
      apagado: r.apagado,
      motivo: r.motivo,
      contou: { propostas: 0, fotos: 0, rascunhos: 0 },
      falhou: [],
    };
  },
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { correrRetencao, caducou, ultimoContacto, PRAZO_MS } = await import("./retencao");

const AGORA = Date.parse("2026-08-30T00:00:00.000Z");
const HA_DOIS_ANOS = new Date(AGORA - 2 * PRAZO_MS).toISOString();
const HA_SEIS_MESES = new Date(AGORA - PRAZO_MS / 2).toISOString();

function pedido(over: Partial<Quote> & { id: string }): Quote {
  return { submittedAt: HA_DOIS_ANOS, status: "novo", ...over } as Quote;
}

beforeEach(() => {
  apagou.chamado = [];
  apagou.resposta = new Map();
});

describe("o último contacto é o MAIS RECENTE que se sabe", () => {
  it("uma alteração recente no back office segura um pedido antigo", async () => {
    /**
     * Na dúvida entre duas datas, fica a mais tardia: guarda o pedido durante
     * mais tempo. O erro que se quer evitar é apagar cedo de mais.
     */
    const p = pedido({ id: "q1", submittedAt: HA_DOIS_ANOS, lastUpdated: HA_SEIS_MESES });
    expect(ultimoContacto(p)).toBe(Date.parse(HA_SEIS_MESES));
    expect(caducou(p, AGORA)).toBe(false);
  });

  it("uma mensagem recente também segura", async () => {
    const p = pedido({
      id: "q1",
      submittedAt: HA_DOIS_ANOS,
      messages: [{ at: HA_SEIS_MESES, body: "combinado" }],
    });
    expect(caducou(p, AGORA)).toBe(false);
  });

  it("datas ilegíveis não contam, mas não estragam as boas", async () => {
    const p = pedido({ id: "q1", submittedAt: "ontem à tarde", lastUpdated: HA_DOIS_ANOS });
    expect(ultimoContacto(p)).toBe(Date.parse(HA_DOIS_ANOS));
  });
});

describe("o que NUNCA se apaga", () => {
  it("um pedido SEM data nenhuma legível fica", async () => {
    /**
     * Não saber quando alguém falou com um casal não pode ser motivo para lhe
     * apagar o processo. É o travão mais importante deste ficheiro.
     */
    const p = pedido({ id: "q1", submittedAt: "", lastUpdated: undefined });
    expect(ultimoContacto(p)).toBeNull();
    expect(caducou(p, AGORA)).toBe(false);
  });

  it("um pedido GANHO fica, por muito antigo que seja", async () => {
    // Cinto e suspensórios sobre o travão do contrato que já vive no
    // apagamento: um evento ganho não se apaga por prazo.
    expect(caducou(pedido({ id: "q1", status: "aceite" }), AGORA)).toBe(false);
  });

  it("exactamente 12 meses AINDA NÃO passou", async () => {
    const p = pedido({ id: "q1", submittedAt: new Date(AGORA - PRAZO_MS).toISOString() });
    expect(caducou(p, AGORA)).toBe(false);
    // Um milissegundo depois, passou.
    expect(caducou(p, AGORA + 1)).toBe(true);
  });

  it("um pedido dentro do prazo nunca chega ao apagamento", async () => {
    const r = await correrRetencao([pedido({ id: "recente", submittedAt: HA_SEIS_MESES })], AGORA);
    expect(apagou.chamado).toEqual([]);
    expect(r.caducados).toBe(0);
  });
});

describe("a passagem", () => {
  it("apaga os que passaram do prazo", async () => {
    const r = await correrRetencao(
      [
        pedido({ id: "velho-1" }),
        pedido({ id: "recente", submittedAt: HA_SEIS_MESES }),
        pedido({ id: "velho-2" }),
      ],
      AGORA,
    );
    expect(apagou.chamado.sort()).toEqual(["velho-1", "velho-2"]);
    expect(r.apagados).toBe(2);
    expect(r.caducados).toBe(2);
  });

  it("corre por LOTES, e conta o que ficou para o dia seguinte", async () => {
    /**
     * A cópia de segurança tem 60 segundos e a retenção entra depois dela.
     * Apagar tudo de uma vez num arranque com anos por limpar estoirava o
     * tecto — e pior, estoirava-o A MEIO.
     */
    const muitos = Array.from({ length: 7 }, (_, i) => pedido({ id: `v${i}` }));
    const r = await correrRetencao(muitos, AGORA, 3);
    expect(apagou.chamado.length).toBe(3);
    expect(r.caducados).toBe(7);
    expect(r.apagados).toBe(3);
  });

  it("começa pelos MAIS ANTIGOS", async () => {
    // Havendo atraso, começa-se pelo que está há mais tempo a violar a
    // política.
    const r = await correrRetencao(
      [
        pedido({ id: "menos-velho", submittedAt: new Date(AGORA - 1.2 * PRAZO_MS).toISOString() }),
        pedido({ id: "mais-velho", submittedAt: new Date(AGORA - 5 * PRAZO_MS).toISOString() }),
      ],
      AGORA,
      1,
    );
    expect(apagou.chamado).toEqual(["mais-velho"]);
    expect(r.apagados).toBe(1);
  });

  it("um pedido com contrato é contado como caducado e NÃO apagado", async () => {
    /**
     * O travão está no `apagarPedido`, e a retenção respeita a
     * resposta em vez de insistir. Contar como ficado — e não como apagado — é
     * o que faz a diferença aparecer no registo em vez de desaparecer.
     */
    apagou.resposta.set("com-contrato", { apagado: false, motivo: "tem-contrato" });
    const r = await correrRetencao([pedido({ id: "com-contrato" })], AGORA);
    expect(r.apagados).toBe(0);
    expect(r.ficaram).toEqual([{ pedido: "com-contrato", motivo: "tem-contrato" }]);
  });

  it("um pedido que falha não trava os outros", async () => {
    apagou.resposta.set("mau", { apagado: false, motivo: "tem-contrato" });
    const r = await correrRetencao([pedido({ id: "mau" }), pedido({ id: "bom" })], AGORA);
    expect(apagou.chamado).toContain("bom");
    expect(r.apagados).toBe(1);
  });

  it("sem nada para apagar, não faz nada e não se queixa", async () => {
    const r = await correrRetencao([], AGORA);
    expect(r).toEqual({ caducados: 0, apagados: 0, ficaram: [] });
  });
});
