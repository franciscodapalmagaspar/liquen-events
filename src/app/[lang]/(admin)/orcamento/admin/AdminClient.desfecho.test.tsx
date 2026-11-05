// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { escolher } from "./ui/escolher.testkit";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O GESTO ONDE ELA JÁ ESTÁ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A pergunta «já responderam?» não vale nada se estiver escondida atrás de um
 * menu. Estes testes prendem os dois sítios onde ela tem de aparecer sozinha —
 * o cartão da lista e o painel do pedido aberto — e prendem o que os números
 * fazem a seguir: a lista tem de acertar-se, senão o ecrã fica a dizer o
 * contrário do que o servidor gravou.
 */

vi.mock("./lazy", () => {
  const stub = (name: string) => {
    const C = () => <div data-testid={`view-${name}`}>{name} stub</div>;
    C.displayName = `Lazy(${name})`;
    return C;
  };
  return {
    /**
     * ── O ECRÃ DE FAZER PROPOSTA, EM DUPLO ────────────────────────────────
     *
     * A lista de Pedidos deixou de abrir o painel de detalhe: leva ao ecrã de
     * fazer a proposta, na página toda (palavras dela: «não apenas ali de
     * lado» — ver `irFazerAProposta` no `AdminClient.tsx`). O painel ficou a
     * uma tecla, no «Abrir o pedido» desse ecrã.
     *
     * Estes casos medem o PAINEL, não esse ecrã — por isso ele entra aqui em
     * duplo, com a única porta de que precisam. O ecrã a sério é medido no
     * `FazerProposta.*.test.tsx` e no passeio `fazer-proposta-cliente.spec.ts`.
     */
    FazerProposta: ({
      quotes,
      selectedId,
      onAbrirPedido,
    }: {
      quotes: Quote[];
      selectedId: string | null;
      onAbrirPedido: (q: Quote) => void;
    }) => (
      <div data-testid="view-fazer-proposta">
        <button
          type="button"
          onClick={() => {
            const q = quotes.find((x) => x.id === selectedId);
            if (q) onAbrirPedido(q);
          }}
        >
          Abrir o pedido
        </button>
      </div>
    ),
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
  };
});

/**
 * ABRIR O PAINEL DO PEDIDO — pelo caminho que ela faz.
 *
 * Carregar num cliente na lista de Pedidos leva ao ecrã de fazer a proposta
 * (ver `irFazerAProposta` no `AdminClient.tsx`); o painel — Produção,
 * Financeiro, mensagens — abre-se daí, no «Abrir o pedido». O duplo desse ecrã
 * está no `vi.mock("./lazy")` aqui em cima.
 */
function abrirOPainelDoPedido(nome: string) {
  fireEvent.click(screen.getByText(nome));
  fireEvent.click(screen.getByRole("button", { name: /^Abrir o pedido$/ }));
}

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

let seq = 0;
function makeQuote(over: Partial<Quote> = {}): Quote {
  seq += 1;
  return {
    id: `LQ-${String(seq).padStart(3, "0")}`,
    submittedAt: "2026-05-01T10:00:00.000Z",
    lastUpdated: "2026-05-01T10:00:00.000Z",
    status: "cotado",
    name: `Cliente ${seq}`,
    email: `cliente${seq}@example.com`,
    category: "particulares",
    eventType: "casamentos",
    date: "2026-09-20",
    location: "Évora",
    guests: 80,
    quotedPrice: 4600,
    acceptTerms: true,
    ...over,
  } as Quote;
}

const servidor = new Map<string, Quote>();
const cabecalhos = (mapa: Record<string, string>) => ({ get: (k: string) => mapa[k] ?? null });
/** Os PATCH observados, para se poder afirmar o que foi gravado. */
let patches: { url: string; corpo: Record<string, unknown> }[] = [];

function renderAdmin(quotes: Quote[]) {
  servidor.clear();
  for (const q of quotes) servidor.set(q.id, q);
  return render(
    <ToastProvider>
      <AdminClient initialQuotes={quotes} userName="Catarina" />
    </ToastProvider>,
  );
}

function navTo(label: RegExp) {
  const sidebar = screen.getByRole("complementary");
  let btn = within(sidebar).queryByRole("button", { name: label });
  if (!btn) {
    fireEvent.click(within(sidebar).getByRole("button", { name: /^Mais$/ }));
    btn = within(sidebar).getByRole("button", { name: label });
  }
  fireEvent.click(btn);
}

beforeEach(() => {
  seq = 0;
  patches = [];
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const m = /^\/api\/orcamento\/([^/?]+)$/.exec(String(url));
      const id = m ? decodeURIComponent(m[1]) : null;
      const pedido = id ? servidor.get(id) : undefined;
      if (id && pedido) {
        if (init?.method === "PATCH") {
          const corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
          patches.push({ url: String(url), corpo });
          const { activityLogAppend: _ignora, ...campos } = corpo;
          const actualizado = { ...pedido, ...campos } as Quote;
          servidor.set(id, actualizado);
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: cabecalhos({}),
            json: () => Promise.resolve(actualizado),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: cabecalhos({ "x-pedido": "completo" }),
          json: () => Promise.resolve(servidor.get(id)),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: cabecalhos({}),
        json: () => Promise.resolve([]),
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("o cartão da lista", () => {
  it("um pedido com proposta enviada pergunta ali mesmo", () => {
    renderAdmin([makeQuote({ name: "Ana e Rui" })]);
    navTo(/Pedidos/);
    expect(screen.getByRole("button", { name: /^ganho$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^perdido$/i })).toBeInTheDocument();
  });

  it("um pedido novo não é interrogado", () => {
    renderAdmin([makeQuote({ name: "Sofia", status: "pendente" })]);
    navTo(/Pedidos/);
    expect(screen.queryByRole("button", { name: /^ganho$/i })).toBeNull();
  });

  it("marcar ganho grava o estado e o valor, e a lista acerta-se", async () => {
    const user = userEvent.setup();
    renderAdmin([makeQuote({ id: "LQ-042", name: "Ana e Rui", quotedPrice: 4600 })]);
    navTo(/Pedidos/);

    await user.click(screen.getByRole("button", { name: /^ganho$/i }));
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].corpo).toMatchObject({ status: "aceite", quotedPrice: 4600 });
    // O histórico leva a linha da decisão — é por ele que se sabe quem marcou.
    expect(patches[0].corpo.activityLogAppend).toEqual([
      expect.objectContaining({ kind: "status_change", actor: "Catarina" }),
    ]);
    // E o cartão passa a dizer «Ganho»: sem isto o ecrã contradiz o servidor.
    await waitFor(() => expect(screen.getAllByText("Ganho").length).toBeGreaterThan(0));
  });

  it("tocar em «Perdido» não abre o pedido por baixo", async () => {
    const user = userEvent.setup();
    renderAdmin([makeQuote({ id: "LQ-050", name: "Ana e Rui" })]);
    navTo(/Pedidos/);

    await user.click(screen.getByRole("button", { name: /^perdido$/i }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].corpo).toMatchObject({ status: "rejeitado" });
    expect(screen.queryByRole("button", { name: "Fechar" })).toBeNull();
  });
});

/**
 * No computador a lista de pedidos NÃO é uma pilha de cartões — é uma tabela
 * (ver `TabelaOuCartoes`). Sem isto, o gesto existia no telemóvel e desaparecia
 * no portátil onde ela trabalha o dia inteiro, e ninguém daria pela diferença
 * até os números voltarem a mentir.
 */
describe("a tabela do computador", () => {
  /** Um `matchMedia` que diz «isto é um ecrã de computador». */
  function comEcraLargo() {
    vi.stubGlobal("matchMedia", (mq: string) => ({
      matches: /min-width:\s*(640|1024)px/.test(mq),
      media: mq,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }));
  }

  it("pergunta na própria linha, sem se abrir o pedido", async () => {
    comEcraLargo();
    renderAdmin([makeQuote({ id: "LQ-300", name: "Ana e Rui" })]);
    navTo(/Pedidos/);

    const linha = await screen.findByRole("row", { name: /ana e rui/i });
    expect(within(linha).getByRole("button", { name: /^ganho$/i })).toBeInTheDocument();
    expect(within(linha).getByRole("button", { name: /^perdido$/i })).toBeInTheDocument();
  });

  it("um pedido novo não é interrogado na tabela", async () => {
    comEcraLargo();
    renderAdmin([makeQuote({ id: "LQ-301", name: "Sofia", status: "pendente" })]);
    navTo(/Pedidos/);

    const linha = await screen.findByRole("row", { name: /sofia/i });
    expect(within(linha).queryByRole("button", { name: /^ganho$/i })).toBeNull();
  });
});

describe("o painel do pedido", () => {
  it("também pergunta, sem se ir a menu nenhum", async () => {
    renderAdmin([makeQuote({ id: "LQ-100", name: "Ana e Rui" })]);
    navTo(/Pedidos/);
    // Fechado, a pergunta existe uma vez: no cartão da lista.
    expect(screen.getAllByRole("button", { name: /^ganho$/i })).toHaveLength(1);

    abrirOPainelDoPedido("Ana e Rui");
    await screen.findByRole("button", { name: "Fechar" });

    // Aberto, existe DUAS: o cartão continua na lista (no computador o painel
    // é uma coluna ao lado, não uma cortina por cima) e o painel traz a sua.
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /^ganho$/i })).toHaveLength(2),
    );
    expect(screen.getAllByRole("button", { name: /^perdido$/i })).toHaveLength(2);
  });

  /**
   * O gesto novo é para a MARCAÇÃO, não para a correcção. Um pedido perdido por
   * engano — ou que voltou atrás — corrige-se onde sempre se corrigiu: no
   * selector de estado. Isto guarda que o gesto novo não roubou esse caminho.
   */
  it("um pedido perdido corrige-se para ganho pelo selector de estado", async () => {
    const user = userEvent.setup();
    renderAdmin([
      makeQuote({ id: "LQ-200", name: "Voltaram Atrás", status: "rejeitado", quotedPrice: 4600 }),
    ]);
    navTo(/Pedidos/);
    abrirOPainelDoPedido("Voltaram Atrás");
    await screen.findByRole("button", { name: "Fechar" });

    await escolher(user, screen.getByLabelText("Estado"), "Ganho");
    await user.click(await screen.findByRole("button", { name: /guardar alterações/i }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].corpo).toMatchObject({ status: "aceite" });
  });

  it("um pedido já ganho não é interrogado no painel — corrige-se no estado", async () => {
    renderAdmin([makeQuote({ id: "LQ-101", name: "Já Ganho", status: "aceite" })]);
    navTo(/Pedidos/);
    abrirOPainelDoPedido("Já Ganho");
    await screen.findByRole("button", { name: "Fechar" });

    expect(screen.queryByRole("button", { name: /^ganho$/i })).toBeNull();
    // O selector de estado continua lá, que é por onde se corrige.
    expect(screen.getByLabelText("Estado")).toBeInTheDocument();
  });
});
