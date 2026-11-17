// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";

/**
 * «POSSÍVEL SPAM» NA LISTA (17/11): o pedido suspeito aparece na lista como os
 * outros, com uma etiqueta discreta ao pé do nome. Nunca some, nunca se conta.
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

describe("a marca «Possível spam» na lista de pedidos", () => {
  it("o pedido marcado continua na lista, com a etiqueta; os outros não a levam", async () => {
    render(
      <ToastProvider>
        <AdminClient
          initialQuotes={[
            makeQuote({ id: "LQ-301", name: "Ana Marques" }),
            makeQuote({
              id: "LQ-302",
              name: "Robo Seo",
              possivelSpam: { motivo: "palavras-de-spam" },
            }),
          ]}
          userName="Catarina"
        />
      </ToastProvider>,
    );
    fireEvent.click(
      within(screen.getByRole("complementary")).getByRole("button", { name: /Pedidos/ }),
    );
    await waitFor(() => expect(screen.getAllByText("Robo Seo").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Ana Marques").length).toBeGreaterThan(0);
    // Uma etiqueta só — a do pedido marcado.
    const etiquetas = screen.getAllByText("Possível spam");
    expect(etiquetas).toHaveLength(1);
    expect(etiquetas[0].closest("[title]")).toHaveAttribute(
      "title",
      "Possível spam: palavras típicas de spam",
    );
  });
});
