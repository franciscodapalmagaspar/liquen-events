import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MaterialRule } from "./material-rules";
import type { MaterialItem } from "./material-types";
import { totaisDaProposta } from "./proposal-budget";
import { depositPercentOf } from "./proposal-doc";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * FAKES — um armazém pequeno por loja, exactamente com o que semear-producao.ts
 * usa. Os motores de negócio (regras de material, orçamento) ficam REAIS: o que
 * se testa aqui é a COLA (o quê e o quando de cada escrita), não reimplementar
 * a matemática do dinheiro ou do motor de regras — essas já têm os seus
 * próprios testes.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const quotesDb = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>() }));
vi.mock("./quotes-store", () => ({
  updateQuoteWith: vi.fn(async (id: string, mutate: (q: Record<string, unknown>) => unknown) => {
    const current = quotesDb.rows.get(id);
    if (!current) return null;
    const merged = mutate(current) as Record<string, unknown>;
    quotesDb.rows.set(id, merged);
    return merged;
  }),
}));

const cal = vi.hoisted(() => ({ events: [] as Record<string, unknown>[] }));
vi.mock("./calendar-store", () => {
  const tag = (quoteId: string, chave: string) => `#gerado:${quoteId}:${chave}`;
  return {
    createCalendarEvent: vi.fn(async (input: Record<string, unknown>) => {
      const e = {
        id: `cal-${cal.events.length + 1}`,
        createdAt: "2026-01-01T00:00:00.000Z",
        ...input,
      };
      cal.events.push(e);
      return e;
    }),
    notaDeDataChaveGerada: (quoteId: string, chave: string) =>
      `Gerado automaticamente ao marcar como ganho. ${tag(quoteId, chave)}`,
    chavesDeDatasJaGeradas: async (quoteId: string) => {
      const prefixo = tag(quoteId, "");
      const chaves = new Set<string>();
      for (const e of cal.events) {
        const nota = String(e.note ?? "");
        const i = nota.indexOf(prefixo);
        if (i === -1) continue;
        chaves.add(nota.slice(i + prefixo.length));
      }
      return chaves;
    },
  };
});

const propostasDb = vi.hoisted(() => ({
  byQuote: new Map<string, Record<string, unknown>>(),
  /** Todas as propostas de um pedido, da mais nova para a mais velha, quando o teste as dá. */
  listas: new Map<string, Record<string, unknown>[]>(),
}));
vi.mock("./proposals-store", () => ({
  getProposalByQuote: vi.fn(async (quoteId: string) => propostasDb.byQuote.get(quoteId) ?? null),
  listProposalsForQuote: vi.fn(async (quoteId: string) => {
    const todas = propostasDb.listas.get(quoteId);
    if (todas) return todas;
    const p = propostasDb.byQuote.get(quoteId);
    return p ? [p] : [];
  }),
}));

const matDb = vi.hoisted(() => ({
  catalogo: [] as MaterialItem[],
  listas: [] as unknown[],
  linhasDeLista: [] as unknown[],
  regras: [] as MaterialRule[],
}));
vi.mock("./material-store", () => ({ listMaterial: async () => matDb.catalogo }));
vi.mock("./material-lists-store", () => ({ listLists: async () => matDb.listas }));
vi.mock("./material-list-items-store", () => ({
  listAllListItems: async () => matDb.linhasDeLista,
}));
vi.mock("./material-rules-store", () => ({ listRules: async () => matDb.regras }));

const eventMaterialDb = vi.hoisted(() => ({
  byQuote: new Map<string, Record<string, unknown>>(),
  byId: new Map<string, Record<string, unknown>>(),
  seq: 0,
}));
vi.mock("./event-material-store", () => ({
  getForQuote: vi.fn(async (quoteId: string) => eventMaterialDb.byQuote.get(quoteId) ?? null),
  obterOuCriarParaPedido: vi.fn(async (quoteId: string) => {
    let e = eventMaterialDb.byQuote.get(quoteId);
    if (!e) {
      e = {
        id: `evt-${++eventMaterialDb.seq}`,
        quoteId,
        status: "preparada",
        generatedAt: "2026-01-01T00:00:00.000Z",
        vehicles: [],
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      eventMaterialDb.byQuote.set(quoteId, e);
      eventMaterialDb.byId.set(e.id as string, e);
    }
    return e;
  }),
  updateEventMaterial: vi.fn(async (id: string, patch: Record<string, unknown>) => {
    const e = eventMaterialDb.byId.get(id);
    if (!e) return null;
    Object.assign(e, patch);
    return e;
  }),
}));

const itemsDb = vi.hoisted(() => ({ all: [] as Record<string, unknown>[], seq: 0 }));
vi.mock("./event-material-items-store", () => ({
  listItemsOfEvent: vi.fn(async (eventId: string) =>
    itemsDb.all.filter((i) => i.eventId === eventId),
  ),
  addEventItem: vi.fn(async (input: Record<string, unknown> & { id?: string }) => {
    const it = { ...input, id: input.id || `item-${++itemsDb.seq}` };
    itemsDb.all.push(it);
    return it;
  }),
  removeItemsOfEvent: vi.fn(async (eventId: string) => {
    itemsDb.all = itemsDb.all.filter((i) => i.eventId !== eventId);
  }),
}));

import {
  semearProducaoAoGanhar,
  preverGeracaoDoEvento,
  gerarEventoAoGanhar,
  ANTECEDENCIAS_DATAS_CHAVE,
} from "./semear-producao";

beforeEach(() => {
  quotesDb.rows.clear();
  cal.events = [];
  propostasDb.byQuote.clear();
  propostasDb.listas.clear();
  matDb.catalogo = [];
  matDb.listas = [];
  matDb.linhasDeLista = [];
  matDb.regras = [];
  eventMaterialDb.byQuote.clear();
  eventMaterialDb.byId.clear();
  eventMaterialDb.seq = 0;
  itemsDb.all = [];
  itemsDb.seq = 0;
  vi.clearAllMocks();
});

/** Um pedido base, com só os campos que semear-producao.ts lê. */
function quoteBase(over: Record<string, unknown> = {}) {
  return {
    id: "Q1",
    date: "2026-09-19",
    guests: 100,
    notes: "",
    decorPoints: [],
    category: "particulares",
    checklist: [],
    productionPlan: [],
    payments: [],
    activityLog: [],
    ...over,
  };
}

function seedQuote(over: Record<string, unknown> = {}) {
  const q = quoteBase(over);
  quotesDb.rows.set(q.id as string, q);
  return q;
}

/** Uma regra simples de material: "sempre" leva um escadote. */
function seedMaterialEngine() {
  matDb.catalogo = [
    {
      id: "escada-1",
      name: "Escadote",
      category: "Ferramentas",
      kind: "reutilizavel",
      unit: "un",
      stock: 2,
    } as MaterialItem,
  ];
  matDb.regras = [
    {
      id: "r1",
      name: "Essenciais",
      enabled: true,
      matchKind: "sempre",
      action: "add_item",
      itemId: "escada-1",
      qty: 1,
      position: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
}

/** Uma proposta com total resolvido, para a geração de sinal/saldo. */
function seedProposal(quoteId: string, over: Record<string, unknown> = {}) {
  const doc = {
    budgetItems: ["Decoração floral"],
    budgetAmounts: [1000],
    totalAmount: 1000,
    totalVatMode: "acrescer",
    vatRate: 0.23,
    depositPercent: 30,
    serviceGroups: [{ title: "Decoração", items: [{ label: "Arco floral" }] }],
    ...over,
  };
  propostasDb.byQuote.set(quoteId, { id: "prop-1", quoteId, doc });
  return doc;
}

// ═══════════════════════════════════════════════════════════════════════════
// semearProducaoAoGanhar — o plano de montagem passa a ACRESCENTAR
// ═══════════════════════════════════════════════════════════════════════════
describe("semearProducaoAoGanhar — plano de montagem acrescenta, nunca substitui", () => {
  it("pedido em branco: semeia a checklist geral e o plano completo", async () => {
    seedQuote();
    await semearProducaoAoGanhar("Q1", "2026-08-14T09:00:00.000Z");
    const q = quotesDb.rows.get("Q1")!;
    expect((q.checklist as unknown[]).length).toBeGreaterThan(0);
    expect((q.productionPlan as unknown[]).length).toBeGreaterThan(0);
  });

  /**
   * PROVA DE VERMELHO (decisão #1 de PROPOSTA-ACEITE.md): com o código ANTERIOR
   * a esta tarefa, um plano já escrito à mão fazia a sementeira desistir de
   * vez — `if (!productionPlan?.length)` era falso e nada era acrescentado.
   * Revertida a mudança («if (!plano.length)» em vez de «acrescentarTarefas…»)
   * este teste falhava com:
   *
   *   expect(received).toHaveLength(2)   // Received length: 1
   *   Expected: 2
   *   Received: ["Nota da noiva: velas baixas"]
   *
   * porque a tarefa do template nunca era acrescentada. Com a mudança em
   * vigor, o teste passa: a tarefa manual continua na posição 0, a do
   * template entra a seguir.
   */
  it("plano já escrito à mão: acrescenta só o que falta, no FIM, sem tocar no que já lá estava", async () => {
    seedQuote({
      productionPlan: [{ id: "manual-1", label: "Nota da noiva: velas baixas", done: false }],
    });
    await semearProducaoAoGanhar("Q1", "2026-08-14T09:00:00.000Z");
    const plano = quotesDb.rows.get("Q1")!.productionPlan as { id: string; label: string }[];
    expect(plano[0]).toMatchObject({ id: "manual-1", label: "Nota da noiva: velas baixas" });
    expect(plano.length).toBeGreaterThan(1);
    // A entrada do histórico diz "novas", não o total do template.
    const log = quotesDb.rows.get("Q1")!.activityLog as { summary: string }[];
    expect(log.at(-1)!.summary).toMatch(/plano de montagem \(\d+ tarefas? nova/);
  });

  it("marcar 'Ganho' duas vezes seguidas não duplica nenhuma tarefa", async () => {
    seedQuote();
    await semearProducaoAoGanhar("Q1", "2026-08-14T09:00:00.000Z");
    const depoisDaPrimeira = (quotesDb.rows.get("Q1")!.productionPlan as unknown[]).length;
    await semearProducaoAoGanhar("Q1", "2026-08-14T09:05:00.000Z");
    const depoisDaSegunda = (quotesDb.rows.get("Q1")!.productionPlan as unknown[]).length;
    expect(depoisDaSegunda).toBe(depoisDaPrimeira);
    // E não ganhou uma segunda entrada no histórico a dizer que semeou de novo.
    const log = quotesDb.rows.get("Q1")!.activityLog as unknown[];
    expect(log).toHaveLength(1);
  });

  it("um plano que já tem TODAS as tarefas do template não ganha uma segunda cópia", async () => {
    seedQuote();
    await semearProducaoAoGanhar("Q1", "2026-08-14T09:00:00.000Z"); // semeia tudo
    const labels = (quotesDb.rows.get("Q1")!.productionPlan as { label: string }[]).map(
      (i) => i.label,
    );
    expect(new Set(labels).size).toBe(labels.length); // sem repetidos
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// preverGeracaoDoEvento — o que o painel mostra ANTES de gerar
// ═══════════════════════════════════════════════════════════════════════════
describe("preverGeracaoDoEvento — a prévia não escreve nada", () => {
  it("um pedido novo mostra contagens > 0 nos quatro artefactos, e não escreve nada", async () => {
    const q = seedQuote();
    seedMaterialEngine();
    seedProposal("Q1");
    const previa = await preverGeracaoDoEvento(q as never);
    expect(previa.material).toEqual({ linhas: 1, jaExiste: false });
    expect(previa.montagem.linhas).toBeGreaterThan(0);
    expect(previa.calendario.linhas).toBe(4);
    expect(previa.pagamentos.linhas).toBe(2);
    expect(previa.haQualquerCoisaAGerar).toBe(true);
    // Nada foi escrito: nem calendário, nem material, nem o pedido.
    expect(cal.events).toHaveLength(0);
    expect(itemsDb.all).toHaveLength(0);
    expect(eventMaterialDb.byQuote.size).toBe(0);
  });

  it("sem data de evento, não há datas-chave a propor (nada para calcular a antecedência)", async () => {
    const q = seedQuote({ date: "" });
    seedProposal("Q1");
    const previa = await preverGeracaoDoEvento(q as never);
    expect(previa.calendario.linhas).toBe(0);
  });

  it("sem proposta (ou sem total resolvido), não há sinal/saldo a propor", async () => {
    const q = seedQuote();
    const previa = await preverGeracaoDoEvento(q as never);
    expect(previa.pagamentos.linhas).toBe(0);
  });

  it("chamar a prévia depois de já ter gerado mostra tudo a zero", async () => {
    const q = seedQuote();
    seedMaterialEngine();
    seedProposal("Q1");
    await gerarEventoAoGanhar(q as never, "2026-08-14T09:00:00.000Z");
    const previa = await preverGeracaoDoEvento(quotesDb.rows.get("Q1") as never);
    expect(previa).toMatchObject({
      material: { linhas: 1, jaExiste: true }, // regenerar dá sempre o que a regra propõe agora
      montagem: { linhas: 0 },
      calendario: { linhas: 0 },
      pagamentos: { linhas: 0 },
      haQualquerCoisaAGerar: false,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// gerarEventoAoGanhar — o botão "Gerar"
// ═══════════════════════════════════════════════════════════════════════════
describe("gerarEventoAoGanhar — o dinheiro é o da proposta", () => {
  it("o sinal e o saldo são exactamente os que totaisDaProposta/depositPercentOf calculam", async () => {
    const q = seedQuote();
    const doc = seedProposal("Q1");
    const esperado = totaisDaProposta(doc as never, depositPercentOf(doc as never));

    await gerarEventoAoGanhar(q as never, "2026-08-14T09:00:00.000Z");

    const payments = quotesDb.rows.get("Q1")!.payments as {
      kind: string;
      amount: number;
      date: string;
      paid: boolean;
    }[];
    const sinal = payments.find((p) => p.kind === "sinal")!;
    const saldo = payments.find((p) => p.kind === "saldo")!;
    expect(sinal.amount).toBe(esperado.sinal);
    expect(saldo.amount).toBe(esperado.saldo);
    // Sinal na data em que se gerou (aceite); saldo um mês antes do evento —
    // é o prazo do contrato (achado n.º 8; era a data do próprio evento).
    expect(sinal.date).toBe("2026-08-14");
    expect(saldo.date).toBe("2026-08-19");
    // Nunca marcado como pago automaticamente.
    expect(sinal.paid).toBe(false);
    expect(saldo.paid).toBe(false);
  });

  it("gera da proposta ACEITE, pela versão base — nunca da revisão mais recente (auditoria de 13/11, n.os 1 e 3)", async () => {
    const q = seedQuote();
    const docAceite = {
      budgetItems: ["Decoração floral", "Arco extra"],
      budgetAmounts: [1000, 200],
      budgetOpcional: [false, true],
      totalAmount: 1200,
      totalVatMode: "acrescer",
      vatRate: 0.23,
      depositPercent: 30,
    };
    propostasDb.listas.set("Q1", [
      // A mais recente: uma revisão de 5.000 € que o casal nunca viu.
      { id: "prop-2", quoteId: "Q1", status: "rascunho", doc: { ...docAceite, totalAmount: 5000 } },
      { id: "prop-1", quoteId: "Q1", status: "aceite", versaoEscolhida: "base", doc: docAceite },
    ]);

    await gerarEventoAoGanhar(q as never, "2026-08-14T09:00:00.000Z");

    const payments = quotesDb.rows.get("Q1")!.payments as { kind: string; amount: number }[];
    // A base são 1.000 € + IVA = 1.230 €: 369 € de sinal, 861 € de saldo — o
    // mesmo total que a faturação manda ao Moloni.
    expect(payments.find((p) => p.kind === "sinal")!.amount).toBe(369);
    expect(payments.find((p) => p.kind === "saldo")!.amount).toBe(861);
  });

  it("as quatro datas-chave nascem com as antecedências aprovadas", async () => {
    const q = seedQuote({ date: "2026-09-19" });
    await gerarEventoAoGanhar(q as never, "2026-08-14T09:00:00.000Z");
    const porTitulo = new Map(cal.events.map((e) => [e.title, e]));
    expect(porTitulo.get(ANTECEDENCIAS_DATAS_CHAVE.reuniao.titulo)).toMatchObject({
      date: "2026-08-20",
    });
    expect(porTitulo.get(ANTECEDENCIAS_DATAS_CHAVE.flores.titulo)).toMatchObject({
      date: "2026-09-05",
    });
    expect(porTitulo.get(ANTECEDENCIAS_DATAS_CHAVE.montagem.titulo)).toMatchObject({
      date: "2026-09-18",
    });
    expect(porTitulo.get(ANTECEDENCIAS_DATAS_CHAVE.desmontagem.titulo)).toMatchObject({
      date: "2026-09-20",
    });
  });

  it("gera a checklist de material a partir do motor de regras já existente", async () => {
    const q = seedQuote();
    seedMaterialEngine();
    const resultado = await gerarEventoAoGanhar(q as never, "2026-08-14T09:00:00.000Z");
    expect(resultado.material.linhas).toBe(1);
    expect(itemsDb.all).toHaveLength(1);
    expect(itemsDb.all[0]).toMatchObject({ name: "Escadote", origin: "regra" });
  });

  /**
   * PROVA DE VERMELHO — "gerar duas vezes não pode duplicar" (calendário).
   * Comentando a verificação `chavesDeDatasJaGeradas` dentro de
   * `datasChaveEmFalta` (fazendo-a devolver sempre as 4 chaves, como se nunca
   * nada tivesse sido gerado) faz este teste falhar com:
   *
   *   expect(received).toHaveLength(4)   // Received length: 8
   *
   * porque a segunda chamada voltava a criar as quatro datas. Com a
   * verificação no seu lugar, a segunda chamada não cria nada.
   */
  it("gerar duas vezes seguidas não duplica as datas-chave", async () => {
    const q = seedQuote();
    await gerarEventoAoGanhar(q as never, "2026-08-14T09:00:00.000Z");
    expect(cal.events).toHaveLength(4);
    const segundo = await gerarEventoAoGanhar(
      quotesDb.rows.get("Q1") as never,
      "2026-08-14T09:10:00.000Z",
    );
    expect(cal.events).toHaveLength(4);
    expect(segundo.calendario.linhas).toBe(0);
  });

  it("gerar duas vezes seguidas não duplica o sinal nem o saldo", async () => {
    const q = seedQuote();
    seedProposal("Q1");
    await gerarEventoAoGanhar(q as never, "2026-08-14T09:00:00.000Z");
    const depoisDaPrimeira = quotesDb.rows.get("Q1")!.payments as unknown[];
    expect(depoisDaPrimeira).toHaveLength(2);
    const segundo = await gerarEventoAoGanhar(
      quotesDb.rows.get("Q1") as never,
      "2026-08-14T09:10:00.000Z",
    );
    expect(quotesDb.rows.get("Q1")!.payments).toHaveLength(2);
    expect(segundo.pagamentos.linhas).toBe(0);
  });

  it("gerar duas vezes seguidas não cria um segundo evento de material (reaproveita a checklist)", async () => {
    const q = seedQuote();
    seedMaterialEngine();
    await gerarEventoAoGanhar(q as never, "2026-08-14T09:00:00.000Z");
    expect(eventMaterialDb.byQuote.size).toBe(1);
    await gerarEventoAoGanhar(quotesDb.rows.get("Q1") as never, "2026-08-14T09:10:00.000Z");
    expect(eventMaterialDb.byQuote.size).toBe(1);
  });

  /**
   * PROVA DE VERMELHO — "não apaga o que estava escrito à mão" (pagamentos).
   * Trocando `if (!existentes.has(p.kind))` por nada (sempre acrescentar) faz
   * este teste falhar com:
   *
   *   expect(received).toHaveLength(2)   // Received length: 3
   *
   * — uma segunda linha de sinal nasce ao lado da que ela já tinha corrigido
   * à mão (500 €, um desconto combinado ao telefone), duplicando o sinal na
   * conta corrente. Com a verificação no lugar, o sinal escrito à mão fica
   * intacto e só o saldo (que faltava) é acrescentado.
   */
  it("um sinal já escrito/corrigido à mão não é substituído nem duplicado", async () => {
    const q = seedQuote({
      payments: [{ id: "manual-1", kind: "sinal", amount: 500, date: "2026-06-01", paid: true }],
    });
    seedProposal("Q1");
    await gerarEventoAoGanhar(q as never, "2026-08-14T09:00:00.000Z");
    const payments = quotesDb.rows.get("Q1")!.payments as {
      id: string;
      kind: string;
      amount: number;
    }[];
    expect(payments).toHaveLength(2);
    const sinal = payments.find((p) => p.kind === "sinal")!;
    expect(sinal).toMatchObject({ id: "manual-1", amount: 500 });
    expect(payments.find((p) => p.kind === "saldo")).toBeTruthy();
  });

  it("uma checklist de material já carregada/marcada sobrevive a uma nova geração", async () => {
    const q = seedQuote();
    seedMaterialEngine();
    await gerarEventoAoGanhar(q as never, "2026-08-14T09:00:00.000Z");
    // Alguém carrega o escadote na carrinha.
    const item = itemsDb.all[0];
    item.loadedAt = "2026-09-18T10:00:00.000Z";
    item.loadedBy = "Catarina";
    // Regenera (ex.: a proposta ganhou mais um serviço e ela carrega outra vez).
    await gerarEventoAoGanhar(quotesDb.rows.get("Q1") as never, "2026-08-14T09:10:00.000Z");
    expect(itemsDb.all).toHaveLength(1);
    expect(itemsDb.all[0]).toMatchObject({
      loadedAt: "2026-09-18T10:00:00.000Z",
      loadedBy: "Catarina",
    });
  });

  it("uma linha de material acrescentada à mão sobrevive a uma nova geração", async () => {
    const q = seedQuote();
    seedMaterialEngine();
    await gerarEventoAoGanhar(q as never, "2026-08-14T09:00:00.000Z");
    const evento = eventMaterialDb.byQuote.get("Q1")!;
    itemsDb.all.push({
      id: "manual-item",
      eventId: evento.id,
      itemId: undefined,
      name: "Vela extra (pedido da noiva)",
      category: "Decoração",
      kind: "consumivel",
      qty: 3,
      critical: false,
      origin: "manual",
      originLabel: "à mão",
      missing: false,
    });
    await gerarEventoAoGanhar(quotesDb.rows.get("Q1") as never, "2026-08-14T09:10:00.000Z");
    expect(itemsDb.all.some((i) => i.name === "Vela extra (pedido da noiva)")).toBe(true);
  });

  it("uma data-chave que cai em cima de um dia já ocupado gera-se na mesma (não bloqueia)", async () => {
    cal.events.push({
      id: "ocupado-1",
      date: "2026-08-20",
      title: "Outro casamento",
      kind: "evento",
      note: "",
    });
    const q = seedQuote({ date: "2026-09-19" });
    await gerarEventoAoGanhar(q as never, "2026-08-14T09:00:00.000Z");
    const reuniao = cal.events.find((e) => e.title === ANTECEDENCIAS_DATAS_CHAVE.reuniao.titulo);
    expect(reuniao).toBeTruthy();
    expect(reuniao!.date).toBe("2026-08-20");
  });

  it("marca no histórico do pedido o que gerou, com as contagens", async () => {
    const q = seedQuote();
    seedProposal("Q1");
    await gerarEventoAoGanhar(q as never, "2026-08-14T09:00:00.000Z");
    const log = quotesDb.rows.get("Q1")!.activityLog as { summary: string; actor: string }[];
    expect(log.at(-1)!.actor).toBe("Sistema");
    expect(log.at(-1)!.summary).toContain("pagamentos (2 linhas)");
  });
});

/** Achado n.º 8: o saldo nascia com a data do próprio dia do casamento. */
describe("prazoDoSaldo — um mês antes do evento", () => {
  it("o mesmo dia, no mês anterior", async () => {
    const { prazoDoSaldo } = await import("./semear-producao");
    expect(prazoDoSaldo("2027-06-12", "2026-10-08")).toBe("2027-05-12");
  });

  it("encosta ao fim do mês quando o dia não existe", async () => {
    const { prazoDoSaldo } = await import("./semear-producao");
    expect(prazoDoSaldo("2027-03-31", "2026-10-08")).toBe("2027-02-28");
    expect(prazoDoSaldo("2028-03-31", "2026-10-08")).toBe("2028-02-29");
  });

  it("Janeiro volta a Dezembro do ano anterior", async () => {
    const { prazoDoSaldo } = await import("./semear-producao");
    expect(prazoDoSaldo("2027-01-15", "2026-10-08")).toBe("2026-12-15");
  });

  it("nunca antes do dia do sinal", async () => {
    const { prazoDoSaldo } = await import("./semear-producao");
    expect(prazoDoSaldo("2026-10-29", "2026-10-08")).toBe("2026-10-08");
  });

  it("sem data de evento, fica a que lá estava", async () => {
    const { prazoDoSaldo } = await import("./semear-producao");
    expect(prazoDoSaldo("", "2026-10-08")).toBe("");
  });
});
