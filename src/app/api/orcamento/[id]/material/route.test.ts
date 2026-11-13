import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { EventMaterialItem } from "@/lib/event-material-types";
import type { LinhaGerada } from "@/lib/material-rules";

const authed = vi.hoisted(() => ({ ok: true }));
const dados = vi.hoisted(() => ({
  /** As linhas que já estavam na checklist antes de se voltar a gerar
   *  (escrever aqui é escrever na checklist da base). */
  get anteriores(): unknown[] {
    return dados.linhas;
  },
  set anteriores(v: unknown[]) {
    dados.linhas = (v as Record<string, unknown>[]).map((l) => ({ ...l }));
  },
  /** O que o motor de regras devolve nesta geração. */
  geradas: [] as unknown[],
  /** A checklist como está na base, depois de cada escrita. */
  linhas: [] as Record<string, unknown>[],
  /** A ordem das escritas: é ela que diz se algo saiu antes de o novo entrar. */
  passos: [] as string[],
  addEventItem: vi.fn(async (input: Record<string, unknown>) => {
    const linha = { ...input, id: `novo-${String(input.itemId ?? input.name)}` };
    dados.linhas.push(linha);
    dados.passos.push(`add:${String(input.itemId)}`);
    return linha;
  }),
  removeEventItem: vi.fn(async (id: string) => {
    dados.linhas = dados.linhas.filter((l) => l.id !== id);
    dados.passos.push(`remove:${id}`);
  }),
  updateEventMaterial: vi.fn(async () => null),
  /**
   * Os dois duplos que ficam entre o PEDIDO e as REGRAS. Gravam o que lhes
   * chega: um duplo que deitasse fora os argumentos deixava a rota alimentar o
   * motor com o pedido errado — ou com o campo do lado — sem nenhum teste poder
   * dar por isso.
   */
  rotular: vi.fn((_pontos: readonly string[], _locale: string) => [] as string[]),
  gerar: vi.fn((_ctx: unknown, _fontes: unknown) => dados.geradas),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: vi.fn(async (id: string) => ({
    id,
    guests: 80,
    decorPoints: ["arco-floral"],
    notes: "querem velas nas mesas",
  })),
}));
vi.mock("@/lib/proposals-store", () => ({ getProposalByQuote: vi.fn(async () => null) }));
vi.mock("@/lib/orcamento/decoracao", () => ({ rotularPontos: dados.rotular }));
vi.mock("@/lib/material-store", () => ({ listMaterial: vi.fn(async () => []) }));
vi.mock("@/lib/material-lists-store", () => ({ listLists: vi.fn(async () => []) }));
vi.mock("@/lib/material-list-items-store", () => ({ listAllListItems: vi.fn(async () => []) }));
vi.mock("@/lib/material-rules-store", () => ({ listRules: vi.fn(async () => []) }));
vi.mock("@/lib/material-rules", () => ({ gerarChecklist: dados.gerar }));
vi.mock("@/lib/event-material-store", () => ({
  getForQuote: vi.fn(async () => ({ id: "ev1", quoteId: "q1" })),
  obterOuCriarParaPedido: vi.fn(async () => ({ id: "ev1", quoteId: "q1" })),
  updateEventMaterial: dados.updateEventMaterial,
}));
vi.mock("@/lib/event-material-items-store", () => ({
  listItemsOfEvent: vi.fn(async () => dados.linhas.map((l) => ({ ...l }))),
  addEventItem: dados.addEventItem,
  removeEventItem: dados.removeEventItem,
  // A primitiva de apagar tudo — que a regeneração já NÃO pode usar.
  removeItemsOfEvent: vi.fn(async () => {
    for (const l of dados.linhas) dados.passos.push(`remove:${String(l.id)}`);
    dados.linhas = [];
  }),
  obterEventItem: vi.fn(async (id: string) => dados.linhas.find((l) => l.id === id) ?? null),
  updateEventItemWith: vi.fn(
    async (id: string, mutate: (c: Record<string, unknown>) => Record<string, unknown>) => {
      const i = dados.linhas.findIndex((l) => l.id === id);
      if (i < 0) return null;
      dados.linhas[i] = mutate(dados.linhas[i]);
      dados.passos.push(`update:${id}`);
      return dados.linhas[i];
    },
  ),
}));

import { POST } from "./route";

function post(id = "q1") {
  const req = new Request(`https://liquen.test/api/orcamento/${id}/material`, {
    method: "POST",
  }) as unknown as NextRequest;
  return POST(req, { params: Promise.resolve({ id }) });
}

function gerada(over: Partial<LinhaGerada> = {}): LinhaGerada {
  return {
    itemId: "toalha",
    name: "Toalha de linho",
    category: "Mesa",
    unit: "un",
    kind: "reutilizavel",
    qty: 10,
    critical: false,
    origin: "base",
    originLabel: "Essenciais",
    ...over,
  };
}

function anterior(over: Partial<EventMaterialItem> = {}): EventMaterialItem {
  return {
    id: "linha-1",
    eventId: "ev1",
    itemId: "toalha",
    name: "Toalha de linho",
    category: "Mesa",
    unit: "un",
    kind: "reutilizavel",
    qty: 10,
    critical: false,
    origin: "base",
    originLabel: "Essenciais",
    missing: false,
    ...over,
  };
}

/** A linha que ficou na checklist, depois de regenerar, para um item do catálogo. */
function gravada(itemId: string) {
  return dados.linhas.find((l) => l.itemId === itemId) as Partial<EventMaterialItem> | undefined;
}

beforeEach(() => {
  authed.ok = true;
  dados.anteriores = [];
  dados.linhas = [];
  dados.passos = [];
  dados.geradas = [];
  vi.clearAllMocks();
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REGENERAR NÃO PODE APAGAR A DEVOLUÇÃO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A regeneração já se preocupava em não perder o que estava CARREGADO — mas
 * copiava apenas `loadedAt`, `note` e `vehicleId`, e escrevia `missing: false`
 * por cima de tudo. O fim da vida de uma linha (voltou do evento, quanto se
 * gastou, o que não voltou) ficava de fora.
 *
 * O ecrã do evento tem o botão «Gerar checklist» sempre à mão e não avisa de
 * nada. Carregá-lo depois do evento — para juntar um serviço que se acrescentou
 * — punha a checklist inteira por devolver: o material que já estava no
 * armazém aparecia como estando na carrinha, e as caixas que faltavam
 * desapareciam da conferência. O registo de quem devolveu e do que se gastou
 * não existe em mais lado nenhum.
 */
describe("POST /api/orcamento/[id]/material — o que a regeneração preserva", () => {
  it("mantém a devolução, quem a fez, o que se gastou e o que ficou em falta", async () => {
    dados.anteriores = [
      anterior({
        loadedAt: "2026-06-01T08:00:00.000Z",
        loadedBy: "Rita",
        vehicleId: "carrinha-1",
        returnedAt: "2026-06-02T19:00:00.000Z",
        returnedBy: "Nuno",
        usedQty: 7,
        missing: true,
        note: "faltaram 3",
      }),
    ];
    dados.geradas = [gerada()];

    expect((await post()).status).toBe(200);

    expect(gravada("toalha")).toMatchObject({
      loadedAt: "2026-06-01T08:00:00.000Z",
      loadedBy: "Rita",
      vehicleId: "carrinha-1",
      returnedAt: "2026-06-02T19:00:00.000Z",
      returnedBy: "Nuno",
      usedQty: 7,
      missing: true,
      note: "faltaram 3",
    });
  });

  /**
   * Uma linha marcada «em falta» ou com consumo apontado, mas nunca carregada
   * (o material não chegou a sair do armazém), não passava sequer o filtro do
   * que se preserva — perdia-se inteira, sem deixar rasto.
   */
  it("preserva também a linha que só tem 'em falta' marcado", async () => {
    dados.anteriores = [anterior({ missing: true })];
    dados.geradas = [gerada()];

    await post();

    expect(gravada("toalha")).toMatchObject({ missing: true });
  });

  it("preserva a linha que só tem consumo apontado", async () => {
    dados.anteriores = [anterior({ usedQty: 0 })];
    dados.geradas = [gerada()];

    await post();

    expect(gravada("toalha")).toMatchObject({ usedQty: 0 });
  });

  it("uma linha nova nasce limpa — sem marcas emprestadas de outra", async () => {
    dados.anteriores = [anterior({ itemId: "toalha", missing: true, returnedAt: "2026-06-02" })];
    dados.geradas = [gerada(), gerada({ itemId: "vela", name: "Vela" })];

    await post();

    expect(gravada("vela")).toMatchObject({ missing: false });
    expect(gravada("vela")?.returnedAt).toBeUndefined();
    expect(gravada("vela")?.usedQty).toBeUndefined();
  });

  /**
   * As regras só são tão boas como o contexto que lhes chega. O que o casal
   * marcou no formulário são PONTOS DE DECORAÇÃO (ids), e é `rotularPontos` que
   * os transforma nos rótulos que uma regra sabe reconhecer — em português, que
   * é a língua em que as regras estão escritas.
   */
  it("dá ao rotulador os pontos que o casal marcou, em português", async () => {
    await post();
    expect(dados.rotular).toHaveBeenCalledWith(["arco-floral"], "pt");
  });

  /**
   * E o motor recebe o contexto DESTE pedido: o número de convidados (é ele que
   * escala as quantidades) e o texto onde as regras de `texto` procuram.
   */
  it("alimenta o motor de regras com o contexto do pedido", async () => {
    await post();
    expect(dados.gerar.mock.calls[0][0]).toMatchObject({
      pax: 80,
      texto: expect.stringContaining("querem velas nas mesas"),
    });
  });

  it("401 sem sessão, e nada é regenerado", async () => {
    authed.ok = false;
    expect((await post()).status).toBe(401);
    expect(dados.removeEventItem).not.toHaveBeenCalled();
    expect(dados.addEventItem).not.toHaveBeenCalled();
  });

  /**
   * Auditoria 6, n.º 10. Uma regra mudou e a toalha deixou de ser gerada —
   * mas estava marcada «em falta» depois do evento. Apagar e reconstruir
   * deitava essa marca fora: era o único registo do material perdido.
   */
  it("uma linha marcada que deixou de ser gerada fica, com a sua marca", async () => {
    dados.anteriores = [anterior({ itemId: "toalha", missing: true })];
    dados.geradas = [gerada({ itemId: "vela", name: "Vela" })];

    expect((await post()).status).toBe(200);

    expect(gravada("toalha")).toMatchObject({ id: "linha-1", missing: true });
    expect(gravada("vela")).toBeDefined();
  });

  it("a linha que continua a ser gerada é a MESMA (mesmo id), e as novas entram antes de algo sair", async () => {
    dados.anteriores = [
      anterior({ id: "linha-1", itemId: "toalha", loadedAt: "2026-06-01T08:00:00.000Z" }),
      anterior({ id: "linha-2", itemId: "guardanapo" }),
    ];
    dados.geradas = [gerada({ qty: 12 }), gerada({ itemId: "vela", name: "Vela" })];

    await post();

    // A toalha não foi apagada e recriada: um «carregado» que chegasse a meio
    // da regeneração ia parar a um id que já não existia.
    expect(gravada("toalha")).toMatchObject({ id: "linha-1", qty: 12 });
    // O guardanapo, sem marca e sem par, sai — mas só depois de a vela entrar.
    expect(gravada("guardanapo")).toBeUndefined();
    expect(dados.passos.indexOf("add:vela")).toBeLessThan(dados.passos.indexOf("remove:linha-2"));
  });
});
