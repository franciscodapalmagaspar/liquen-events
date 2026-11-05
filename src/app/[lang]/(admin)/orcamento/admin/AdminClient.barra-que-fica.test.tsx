// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A BARRA DE DESTINOS FICA QUANDO O DETALHE É UMA COLUNA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma colaboradora dela disse que o menu «nem sempre aparece» e que «às vezes
 * não está em lado nenhum». Era isto:
 *
 * A barra saía do ecrã com uma condição só — haver um pedido aberto. Está certo
 * abaixo de 1280 px, onde o detalhe é uma folha MODAL que toma conta do ecrã.
 * A partir de 1280 o detalhe é uma COLUNA ao lado da lista: o ecrã não fica
 * modal, fica com duas colunas. E a barra saía nos dois casos.
 *
 * Como a barra é hoje a ÚNICA navegação do back office — «a barra substitui o
 * menu», e a coluna da esquerda passou a gaveta —, abrir um pedido no portátil
 * apagava o menu do ecrã inteiro.
 *
 * ── PORQUE É QUE ESTE FICHEIRO É EM `jsdom` E NÃO UM PASSEIO ──────────────
 *
 * Porque o que decide não é geometria, é uma pergunta ao `matchMedia`, e o
 * jsdom deixa responder as duas coisas à ordem. Num browser eu teria de
 * confiar que 1279 e 1280 caem dos lados certos de uma linha que não vejo —
 * e a primeira vez que tentei medir isto num Chromium fiquei a medir o ecrã
 * errado durante quatro tentativas, a dizer que provava uma coisa que não
 * estava a provar.
 *
 * O que um browser tem de dizer — que a cápsula está mesmo à vista — está
 * medido à parte, e é geometria; isto aqui é a REGRA.
 */

vi.mock("./lazy", () => {
  const stub = (name: string) => {
    const C = () => <div data-testid={`view-${name}`}>{name} stub</div>;
    C.displayName = `Lazy(${name})`;
    return C;
  };
  return {
    /**
     * O caminho dela até ao painel: lista → ecrã da proposta → «Abrir o
     * pedido». O duplo dá essa porta sem montar o estúdio inteiro — é o mesmo
     * que o `AdminClient.saida-da-gaveta.test.tsx` usa, e pela mesma razão.
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

const servidor = new Map<string, Quote>();
const cabecalhos = (mapa: Record<string, string>) => ({ get: (k: string) => mapa[k] ?? null });

function pedido(over: Partial<Quote> = {}): Quote {
  return {
    id: "LQ-001",
    submittedAt: "2026-05-01T10:00:00.000Z",
    lastUpdated: "2026-05-01T10:00:00.000Z",
    status: "pendente",
    name: "Daniela Silva",
    email: "daniela@example.com",
    category: "particulares",
    eventType: "casamentos",
    date: "2026-09-20",
    location: "Évora",
    guests: 80,
    ...over,
  } as Quote;
}

/**
 * A ÚNICA pergunta que decide isto é `(max-width: 1279px)`. Damos a resposta
 * que queremos a essa, e `false` a tudo o resto — que é o que um computador
 * responde a um `max-width` estreito e a um `prefers-reduced-motion`.
 */
function ecraDe(largura: "telemovel" | "computador") {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: largura === "telemovel" && /max-width/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function montar(pedidos: Quote[]) {
  servidor.clear();
  for (const q of pedidos) servidor.set(q.id, q);
  return render(
    <ToastProvider>
      <AdminClient initialQuotes={pedidos} userName="Catarina" vistaInicial="pedidos" />
    </ToastProvider>,
  );
}

async function abrirOPainel(nome: string) {
  await act(async () => {
    fireEvent.click(screen.getByText(nome));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Abrir o pedido$/ }));
  });
}

/** A barra, pelo nome com que se anuncia — o mesmo que os passeios já usam. */
function barra(): HTMLElement {
  const n = document.querySelector('nav[aria-label="Navegação do back office"]');
  if (!(n instanceof HTMLElement)) throw new Error("não encontrei a barra de destinos");
  return n;
}

/** Está fora do ecrã? É o que a translação de uma altura inteira quer dizer. */
const foraDoEcra = () => barra().className.includes("translate-y-full");

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const m = /^\/api\/orcamento\/(.+)$/.exec(String(url));
      const q = m ? servidor.get(decodeURIComponent(m[1])) : undefined;
      if (q)
        return Promise.resolve({
          ok: true,
          headers: cabecalhos({ "x-pedido": "completo" }),
          json: () => Promise.resolve(q),
        });
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
});

describe("a barra de destinos com um pedido aberto", () => {
  it("FICA no computador, onde o detalhe é uma coluna ao lado da lista", async () => {
    ecraDe("computador");
    montar([pedido()]);
    expect(foraDoEcra(), "a barra já estava escondida antes de abrir nada").toBe(false);

    await abrirOPainel("Daniela Silva");

    expect(
      foraDoEcra(),
      "abrir um pedido no computador apagou a navegação — é o defeito que ela relatou",
    ).toBe(false);
  });

  it("SAI no telemóvel, onde o detalhe é uma folha modal", async () => {
    ecraDe("telemovel");
    montar([pedido()]);
    expect(foraDoEcra()).toBe(false);

    await abrirOPainel("Daniela Silva");

    expect(foraDoEcra(), "a folha modal tomou conta do ecrã e a barra ficou por baixo dela").toBe(
      true,
    );
  });

  /**
   * O CONTROLO NEGATIVO DESTE FICHEIRO.
   *
   * Sem ele, uma regra que nunca escondesse a barra passava no primeiro caso e
   * parecia uma correcção — e seria uma segunda avaria, com a barra a sobrepor
   * o rodapé de uma folha modal.
   */
  it("e sem pedido aberto está lá nas duas larguras", async () => {
    for (const largura of ["computador", "telemovel"] as const) {
      ecraDe(largura);
      montar([pedido()]);
      expect(foraDoEcra(), `sem pedido aberto, a ${largura}, a barra devia estar`).toBe(false);
      cleanup();
    }
  });
});
