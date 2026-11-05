// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { escolherJa } from "./ui/escolher.testkit";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LOTE TEM DE SE VER A ANDAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero estes detalhes de animações em imensas coisas
 * espalhadas pelo site» — onde ela carrega num botão e fica sem saber se aquilo
 * está a andar, tem de passar a ver que está.
 *
 * Os dois gestos de triagem diária desta lista não tinham nada:
 *
 *  · «Marcar como …» tinha, mas onde não se vê. O único sinal era o `<option>`
 *    vazio do selector passar de «—» a «A aplicar…» — texto dentro de um
 *    `<select>` FECHADO. Quem acabou de escolher um estado não volta a abrir o
 *    selector para ir espreitar se o que pediu está a correr;
 *  · «Apagar (N)» tinha só o `disabled`. Um botão apagado é indistinguível de
 *    um botão avariado, e com trinta pedidos e 4G fraco a espera é longa o
 *    suficiente para valer a pena carregar outra vez.
 *
 * Os dois são N pedidos ao mesmo tempo, portanto há uma contagem verdadeira
 * para mostrar — e o que se prende aqui é essa contagem: aparece, SOBE a cada
 * pedido que responde, e desaparece quando acaba. Não são as classes do
 * cartão: é o que ela lê.
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

/**
 * OS PEDIDOS QUE O SERVIDOR AINDA NÃO RESPONDEU.
 *
 * É isto que faz o teste ser sobre a espera: sem uma mão a segurar as
 * respostas, os N pedidos resolviam-se todos no mesmo instante e o cartão
 * nascia e morria dentro do mesmo `act` — que é exactamente o que não se
 * consegue observar.
 */
let porResponder: Array<{ url: string; metodo?: string; responder: () => void }> = [];

/** Deixa passar a resposta de `quantos` pedidos, pela ordem em que entraram. */
async function responder(quantos: number) {
  const lote = porResponder.splice(0, quantos);
  await act(async () => {
    for (const p of lote) p.responder();
  });
}

const cabecalhos = (mapa: Record<string, string>) => ({ get: (k: string) => mapa[k] ?? null });

/** Quanto é que o traço do `EmCurso` está cheio, lido do `scaleX`. */
function avanco(): number {
  const barra = document.querySelector("[data-barra=preenchimento]") as HTMLElement | null;
  const m = /scaleX\(([\d.]+)\)/.exec(barra?.style.transform ?? "");
  return m ? Number(m[1]) : NaN;
}

function renderAdmin(quotes: Quote[]) {
  return render(
    <ToastProvider>
      <AdminClient initialQuotes={quotes} userName="Catarina" />
    </ToastProvider>,
  );
}

function irParaPedidos() {
  const sidebar = screen.getByRole("complementary");
  fireEvent.click(within(sidebar).getByRole("button", { name: /Pedidos/ }));
}

const seleccionar = (nome: string) =>
  fireEvent.click(screen.getByRole("checkbox", { name: `Selecionar pedido de ${nome}` }));

beforeEach(() => {
  seq = 0;
  porResponder = [];
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const u = String(url);
      const metodo = init?.method;
      const m = /^\/api\/orcamento\/(.+)$/.exec(u);
      if (m && (metodo === "PATCH" || metodo === "DELETE")) {
        const id = decodeURIComponent(m[1]);
        return new Promise((resolve) => {
          porResponder.push({
            url: u,
            metodo,
            responder: () =>
              resolve({
                ok: true,
                headers: cabecalhos({}),
                json: () =>
                  Promise.resolve({
                    ...makeQuote({ id }),
                    id,
                    status: JSON.parse(String(init?.body ?? "{}")).status ?? "cotado",
                  }),
              }),
          });
        });
      }
      return Promise.resolve({
        ok: true,
        headers: cabecalhos({}),
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

/** O cartão da espera, ou `null` se não houver nenhum no ecrã. */
const espera = (titulo: string) => screen.queryByText(titulo);

describe("«Marcar como …» em lote", () => {
  beforeEach(() => {
    renderAdmin([
      makeQuote({ id: "LQ-101", name: "Ana Marques" }),
      makeQuote({ id: "LQ-102", name: "Bruno Dias" }),
      makeQuote({ id: "LQ-103", name: "Carla Nunes" }),
    ]);
    irParaPedidos();
    seleccionar("Ana Marques");
    seleccionar("Bruno Dias");
    seleccionar("Carla Nunes");
  });

  it("põe a contagem no ecrã, a sobe a cada pedido que responde, e some no fim", async () => {
    escolherJa(screen.getByLabelText("Marcar pedidos selecionados como"), "Aguardar resposta");

    // Está a andar, e diz quantos são — fora do `<select>`, à vista.
    expect(espera("A marcar os pedidos…")).toBeTruthy();
    expect(screen.getByText("0 de 3")).toBeTruthy();
    expect(avanco()).toBe(0);
    // Os três pedidos foram TODOS lançados: a contagem não serializa nada.
    expect(porResponder.filter((p) => p.metodo === "PATCH")).toHaveLength(3);

    await responder(1);
    expect(screen.getByText("1 de 3")).toBeTruthy();
    expect(avanco()).toBeCloseTo(1 / 3, 4);

    await responder(1);
    expect(screen.getByText("2 de 3")).toBeTruthy();
    expect(avanco()).toBeCloseTo(2 / 3, 4);

    await responder(1);
    await waitFor(() => expect(espera("A marcar os pedidos…")).toBeNull());
  });

  /**
   * O sinal antigo era este texto, dentro do `<option>` vazio de um `<select>`
   * fechado. Se voltar, é porque alguém repôs feedback num sítio onde ninguém
   * o lê.
   */
  it("já não esconde o sinal dentro de um `<option>`", () => {
    escolherJa(screen.getByLabelText("Marcar pedidos selecionados como"), "Aguardar resposta");
    expect(screen.queryByText("A aplicar…")).toBeNull();
  });
});

describe("«Apagar (N)» em lote", () => {
  it("mostra a mesma contagem enquanto os pedidos vão sendo apagados", async () => {
    renderAdmin([
      makeQuote({ id: "LQ-201", name: "Ana Marques" }),
      makeQuote({ id: "LQ-202", name: "Bruno Dias" }),
    ]);
    irParaPedidos();
    seleccionar("Ana Marques");
    seleccionar("Bruno Dias");

    fireEvent.click(screen.getByRole("button", { name: "Apagar (2)" }));
    // A pergunta passou a nomear os dois — ver `PerguntaDestrutiva`.
    const caixa = await screen.findByRole("dialog");
    fireEvent.click(within(caixa).getByRole("button", { name: /^Apagar 2 pedidos$/i }));
    await waitFor(() => expect(espera("A apagar os pedidos…")).toBeTruthy());

    expect(screen.getByText("0 de 2")).toBeTruthy();
    expect(porResponder.filter((p) => p.metodo === "DELETE")).toHaveLength(2);

    await responder(1);
    expect(screen.getByText("1 de 2")).toBeTruthy();
    expect(avanco()).toBeCloseTo(0.5, 4);

    await responder(1);
    await waitFor(() => expect(espera("A apagar os pedidos…")).toBeNull());
  });
});
