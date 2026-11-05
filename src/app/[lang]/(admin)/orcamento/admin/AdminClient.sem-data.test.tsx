// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM PEDIDO QUE ANDA PARA A FRENTE SEM DATA DE EVENTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * F-15 da auditoria: «Maria João Fernandes e Marlon Valadares não têm data de
 * evento ("—") e mesmo assim contam como pedidos ativos com proposta enviada.
 * Não há sinal a dizer que falta o dado mais importante para reservar a data.»
 *
 * Na tabela estava «—»; no cartão não estava nada — a fila de factos
 * simplesmente não mencionava a data, e um facto que não aparece lê-se como um
 * facto que está bem.
 *
 * A aritmética da fronteira está em `lib/orcamento/data-em-falta.ts` e tem os
 * seus próprios testes. O que se guarda AQUI é que o aviso chega mesmo ao ecrã
 * — e que não chega onde não deve.
 */

vi.mock("./lazy", () => {
  const stub = (name: string) => {
    const C = () => <div data-testid={`view-${name}`}>{name} stub</div>;
    C.displayName = `Lazy(${name})`;
    return C;
  };
  return {
    Overview: stub("overview"),
    Kanban: stub("kanban"),
    Clientes: stub("clientes"),
    Calendario: stub("calendario"),
    Propostas: stub("propostas"),
    Tarefas: stub("tarefas"),
    Fornecedores: stub("fornecedores"),
    StatsDashboard: stub("estatisticas"),
    EmailTemplates: stub("modelos-email"),
    Contratos: stub("contratos"),
    Temas: stub("temas"),
    Inventario: stub("inventario"),
    ProposalStudio: stub("proposal-studio"),
    ProductionPlan: stub("production-plan"),
    ClientMessenger: stub("client-messenger"),
    EventChecklist: stub("event-checklist"),
    EventMaterial: stub("event-material"),
    EventTimeline: stub("event-timeline"),
    PaymentsPanel: stub("payments-panel"),
    EventCosts: stub("event-costs"),
    GuestList: stub("guest-list"),
    TagsField: stub("tags-field"),
    FollowUpField: stub("follow-up-field"),
    ActivityLog: stub("activity-log"),
    EventTasks: stub("event-tasks"),
    FazerProposta: stub("fazer-proposta"),
    Acompanhamento: stub("acompanhamento"),
    AnalisePropostas: stub("analise-propostas"),
  };
});

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

/** Submetido há 30 dias, para o número ser inconfundível. */
const HA_30_DIAS = new Date(Date.now() - 30 * 86400000).toISOString();

const pedido = (over: Partial<Quote>): Quote =>
  ({
    id: "LIQ-1",
    name: "Ana Marques",
    email: "ana@example.com",
    status: "pendente",
    submittedAt: HA_30_DIAS,
    lastUpdated: HA_30_DIAS,
    date: "2027-09-18",
    guests: 80,
    ...over,
  }) as unknown as Quote;

/**
 * ── O ECRÃ TEM DE ESTAR EM MODO COMPUTADOR, SENÃO NÃO HÁ COLUNA ──────────
 *
 * A lista de pedidos desenha-se em TABELA no computador e em CARTÕES abaixo
 * disso (`TabelaOuCartoes` → `useAdaptativo`). No jsdom não há `matchMedia`,
 * portanto a largura resolve para «telemovel» e a coluna «À espera» nem chega
 * a ser desenhada.
 *
 * Isto apanhou-me: a primeira versão deste teste passava com e sem a
 * correcção, porque estava a afirmar sobre um ecrã onde a coluna não existe.
 * Um teste que passa nos dois lados não prova nada — e é pior do que não ter
 * teste nenhum, porque parece que prova.
 *
 * O duplo responde às consultas de largura, e só a essas.
 */
function ecraDeComputador() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: /min-width/.test(query) || query.includes("hover: hover"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function montar(quotes: Quote[]) {
  ecraDeComputador();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [],
    })),
  );
  return render(
    <ToastProvider>
      <AdminClient initialQuotes={quotes} userName="Catarina" vistaInicial="pedidos" />
    </ToastProvider>,
  );
}

/**
 * Espera pelo pedido no ecrã e devolve o texto todo.
 *
 * Afirma-se sobre o ecrã inteiro e não sobre a linha: monta-se com UM pedido
 * só, portanto «30d» só pode vir dele — e o back office desenha a lista em
 * tabela ou em cartões conforme a largura, que no jsdom não existe. Prender a
 * forma seria prender o ambiente de teste em vez do comportamento.
 */
async function comOPedidoNoEcra(nome: string): Promise<string> {
  await screen.findByText(nome);
  return document.body.textContent ?? "";
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  localStorage.clear();
});

describe("o aviso de data em falta na lista de pedidos", () => {
  it("aparece num pedido com proposta enviada e sem data", async () => {
    montar([pedido({ status: "cotado", date: null as unknown as string })]);
    expect(await comOPedidoNoEcra("Ana Marques")).toContain("Sem data do evento");
  });

  it("aparece também num pedido já ganho — é aí que custa dinheiro", async () => {
    montar([pedido({ status: "aceite", date: null as unknown as string })]);
    expect(await comOPedidoNoEcra("Ana Marques")).toContain("Sem data do evento");
  });

  it("NÃO aparece num pedido acabado de chegar — datas por marcar há às dezenas", async () => {
    // O controlo que impede este ficheiro de aprovar uma etiqueta que estivesse
    // em todo o lado. Uma etiqueta em todo o lado deixa de se ver.
    montar([pedido({ status: "pendente", date: null as unknown as string })]);
    expect(await comOPedidoNoEcra("Ana Marques")).not.toContain("Sem data do evento");
  });

  it("NÃO aparece quando há data", async () => {
    montar([pedido({ status: "cotado", date: "2027-09-18" })]);
    const ecra = await comOPedidoNoEcra("Ana Marques");
    expect(ecra).not.toContain("Sem data do evento");
    // E a data continua lá, escrita em português e não no formato da base de
    // dados — a correcção não pode ter comido a célula.
    expect(ecra).not.toContain("2027-09-18");
  });
});
