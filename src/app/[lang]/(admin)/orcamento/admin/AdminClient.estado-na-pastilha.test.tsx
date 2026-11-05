// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";
import { escolherJa } from "./ui/escolher.testkit";

/**
 * O ESTADO MUDA-SE NA PRÓPRIA PASTILHA (14/10). Palavras dela, com a captura da
 * coluna «Estado» da lista: «eu quero a mudança de estado para ser feita ao
 * carregar em cima do estado em que está».
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
  };
});

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

const pedidos: { url: string; metodo?: string; corpo: Record<string, unknown> }[] = [];

beforeEach(() => {
  seq = 0;
  pedidos.length = 0;
  localStorage.clear();
  // No computador a lista é uma tabela, com a coluna «Estado» (ver
  // «Pedidos — cartões no telemóvel, tabela no computador»).
  vi.stubGlobal("matchMedia", (mq: string) => {
    const min = /min-width:\s*(\d+)px/.exec(mq);
    return {
      matches: min ? 1440 >= Number(min[1]) : mq.includes("hover: hover"),
      media: mq,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const u = String(url);
      const corpo = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      pedidos.push({ url: u, metodo: init?.method, corpo });
      const m = /^\/api\/orcamento\/([^/?]+)$/.exec(u);
      if (m && init?.method === "PATCH") {
        const id = decodeURIComponent(m[1]);
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: () =>
            Promise.resolve({
              ...makeQuote({ id, name: "Ana Marques" }),
              id,
              status: corpo.status ?? "cotado",
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve([]),
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mudar o estado na pastilha da lista", () => {
  it("escolher outro estado grava-o com a linha no histórico, não abre o pedido, e oferece «Anular»", async () => {
    render(
      <ToastProvider>
        <AdminClient
          initialQuotes={[makeQuote({ id: "LQ-201", name: "Ana Marques", status: "cotado" })]}
          userName="Catarina"
        />
      </ToastProvider>,
    );
    fireEvent.click(
      within(screen.getByRole("complementary")).getByRole("button", { name: /Pedidos/ }),
    );
    // Espera pela forma de destino — o menu de vidro, e não o `<select>` do
    // primeiro fotograma (ver o `escolher.testkit`). Lê-se outra vez depois:
    // o elemento do primeiro fotograma já não é o que está no ecrã.
    const nome = { name: "Estado do pedido de Ana Marques" };
    await waitFor(() => expect(screen.getByRole("combobox", nome).tagName).toBe("BUTTON"));
    const pastilha = screen.getByRole("combobox", nome);
    expect(pastilha).toHaveTextContent("Proposta enviada");

    escolherJa(pastilha, "Ganho");

    await waitFor(() =>
      expect(pedidos.some((p) => p.metodo === "PATCH" && p.url === "/api/orcamento/LQ-201")).toBe(
        true,
      ),
    );
    const gravado = pedidos.find((p) => p.metodo === "PATCH")!.corpo;
    expect(gravado.status).toBe("aceite");
    const linha = (
      gravado.activityLogAppend as { kind: string; summary: string; actor: string }[]
    )[0];
    expect(linha).toMatchObject({
      kind: "status_change",
      summary: "Proposta enviada → Ganho",
      actor: "Catarina",
    });
    // O pedido não abriu: a escolha do estado não é um toque na linha.
    expect(screen.queryByRole("dialog")).toBeNull();
    // A pastilha já diz o estado novo, e há «Anular».
    await waitFor(() => expect(pastilha).toHaveTextContent("Ganho"));
    expect(await screen.findByRole("button", { name: /Anular/ })).toBeInTheDocument();
  });
});
