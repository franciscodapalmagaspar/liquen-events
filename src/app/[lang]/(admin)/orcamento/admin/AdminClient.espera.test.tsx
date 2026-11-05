// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM CASAMENTO JÁ GANHO NÃO ESTÁ «À ESPERA» DE NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A coluna contava os dias desde a submissão para TODOS os pedidos. Debaixo de
 * um cabeçalho que diz «À espera», um trabalho ganho em Maio aparecia com
 * «104d» — e um perdido também.
 *
 * O número não estava errado; a pergunta é que era outra. Esta coluna existe
 * para «a quem devo responder já», e é por ela que se ordena. Um trabalho
 * acabado no topo dessa lista é ruído no sítio de maior atenção.
 *
 * Apareceu a partir do achado F-12 da auditoria («a idade do pedido é diferente
 * em cada ecrã»). Esse, como está escrito, não consegui reproduzir — os dois
 * sítios lêem o mesmo campo. Este é o defeito que estava mesmo lá.
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

describe("a coluna «À espera»", () => {
  it("conta os dias de um pedido que ainda espera resposta nossa", async () => {
    montar([pedido({ status: "pendente" })]);
    expect(await comOPedidoNoEcra("Ana Marques")).toContain("30d");
  });

  it("e de um com proposta enviada — esse espera pelo casal", async () => {
    montar([pedido({ status: "cotado" })]);
    expect(await comOPedidoNoEcra("Ana Marques")).toContain("30d");
  });

  it("um trabalho GANHO não está à espera de ninguém", async () => {
    montar([pedido({ status: "aceite" })]);
    const ecra = await comOPedidoNoEcra("Ana Marques");
    expect(ecra).not.toContain("30d");
  });

  it("nem um PERDIDO", async () => {
    montar([pedido({ status: "rejeitado" })]);
    expect(await comOPedidoNoEcra("Ana Marques")).not.toContain("30d");
  });
});
