// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A HIERARQUIA DO CARTÃO DE PEDIDO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre a lista no telemóvel: o nome do casal tem o mesmo peso
 * visual que o email, que a categoria e que a referência — não há hierarquia.
 * Medido: nome a 14 px, email a 12, a fila de contexto a 10 e a referência a 9,
 * todos no mesmo cinzento a rondar `/70`. Quatro coisas quase iguais.
 *
 * O que o cartão tem de dizer, por ordem:
 *
 *   1. o NOME do casal — é o que se procura;
 *   2. o ESTADO e o TEMPO DE ESPERA — é o que decide o que se faz a seguir;
 *   3. o contexto (categoria, convidados, quando é) — confirma;
 *   4. a REFERÊNCIA — é um detalhe, e só serve quando já se sabe qual é.
 *
 * ── PORQUE É QUE ISTO SE MEDE EM PÍXEIS DECLARADOS ───────────────────────
 *
 * Não há layout no jsdom, mas o TAMANHO PEDIDO está na classe e é uma decisão
 * de desenho como outra qualquer. O teste lê a escala em vez de a adivinhar:
 * se alguém voltar a pôr o email do tamanho do nome, cai aqui. É a diferença
 * entre «achamos que tem hierarquia» e «tem, e é esta».
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

const PEDIDO = {
  id: "LIQ-B4C98A11-E12F",
  submittedAt: "2026-08-14T10:00:00.000Z",
  lastUpdated: "2026-08-14T10:00:00.000Z",
  status: "pendente",
  name: "Rita e Tomás",
  email: "rita.tomas@example.pt",
  category: "particulares",
  eventType: "casamentos",
  date: "2028-06-17",
  location: "Évora",
  guests: 80,
  acceptTerms: true,
} as Quote;

function renderAdmin() {
  return render(
    <ToastProvider>
      <AdminClient initialQuotes={[PEDIDO]} userName="Catarina" />
    </ToastProvider>,
  );
}

function irParaPedidos() {
  const sidebar = screen.getByRole("complementary");
  fireEvent.click(within(sidebar).getByRole("button", { name: /Pedidos/ }));
}

/**
 * O tamanho de letra PEDIDO por um elemento, em píxeis.
 *
 * Lê `text-[Npx]` e os degraus nomeados do Tailwind que o back office usa. É
 * deliberadamente pequeno: se aparecer uma classe que não conheça, devolve
 * `null` e o teste falha a dizer qual — melhor do que assumir um valor e dar
 * verde sobre uma classe que ninguém leu.
 */
const DEGRAUS: Record<string, number> = {
  "text-xs": 12,
  "text-sm": 14,
  "text-base": 16,
  "text-lg": 18,
  "text-xl": 20,
};
function tamanhoPedido(el: Element): number | null {
  for (const c of el.className.split(/\s+/)) {
    // Só as classes sem prefixo de corte: são as que valem no telemóvel.
    if (c.includes(":")) continue;
    const m = /^text-\[(\d+)px\]$/.exec(c);
    if (m) return Number(m[1]);
    if (c in DEGRAUS) return DEGRAUS[c];
  }
  return null;
}

function tamanhoDe(texto: RegExp | string): number {
  const el = screen.getByText(texto);
  const px = tamanhoPedido(el);
  expect(
    px,
    `sem tamanho legível na classe de «${el.textContent}»: ${el.className}`,
  ).not.toBeNull();
  return px!;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve([]),
      }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("o que o cartão de pedido põe à frente", () => {
  it("o nome do casal é o maior de todos", () => {
    renderAdmin();
    irParaPedidos();

    const nome = tamanhoDe("Rita e Tomás");
    const email = tamanhoDe("rita.tomas@example.pt");

    expect(nome).toBeGreaterThan(email);
    // E o nome não é «um bocadinho maior»: 14 contra 12 não se lê como
    // hierarquia nenhuma a meio de uma lista.
    expect(nome).toBeGreaterThanOrEqual(17);
  });

  it("o nome tem também o peso, e não só o tamanho", () => {
    renderAdmin();
    irParaPedidos();
    expect(screen.getByText("Rita e Tomás").className).toMatch(/font-(semibold|bold)/);
  });

  it("nada no cartão desce abaixo do chão de 12 px", () => {
    renderAdmin();
    irParaPedidos();
    for (const t of ["Rita e Tomás", "rita.tomas@example.pt"] as const) {
      expect(tamanhoDe(t)).toBeGreaterThanOrEqual(12);
    }
  });

  it("a referência já não está na lista — está no pedido aberto", () => {
    // ── ISTO ERA O CONTRÁRIO, E MUDOU POR DECISÃO DELA ────────────────────
    //
    // Este caso exigia que a referência estivesse no cartão, no degrau mais
    // apagado. A defesa que aqui estava escrita dizia, sem dar por isso, que
    // ela não pertencia à lista: «quando SE PRECISA dela é para a ler letra a
    // letra ao telefone» — ou seja, com o pedido já aberto.
    //
    // Perguntei-lhe se precisava dela de relance, e a resposta foi «retira a
    // referência». Saiu de vinte linhas de lista e ficou onde se usa: no painel
    // de detalhe.
    //
    // O caso fica, ao contrário: a referência NÃO volta ao cartão. É a maneira
    // fácil de desfazer isto sem querer — basta alguém achar que «ficava bem
    // ali um identificador».
    renderAdmin();
    irParaPedidos();
    expect(screen.queryByText(/^Ref\./), "a referência voltou à lista de pedidos").toBeNull();
    expect(screen.getByText("Rita e Tomás")).toBeInTheDocument();
  });
});
