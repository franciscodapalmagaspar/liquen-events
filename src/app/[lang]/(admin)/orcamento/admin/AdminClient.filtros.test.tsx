// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";
import { escolher } from "./ui/escolher.testkit";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * METADE DO ECRÃ ANTES DE APARECER UM PEDIDO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Medido a 390×844, antes: o primeiro cartão de pedido começava a 436 px — 52%
 * do telemóvel gasto em controlos antes de se ver aquilo a que se veio. Quatro
 * filtros de larguras diferentes em três filas irregulares, mais seis pastilhas
 * de estado a quebrar em duas linhas.
 *
 * A regra deste trabalho: filtros que ninguém usa em todas as sessões não podem
 * gastar meio ecrã. A procura fica à vista — essa usa-se sempre. O resto recolhe
 * atrás de um botão que DIZ QUANTOS ESTÃO ACTIVOS, que é a única forma de
 * esconder um filtro sem mentir: escondido e calado, uma lista filtrada parece
 * uma lista vazia, e é assim que se perde um pedido.
 *
 * As pastilhas de estado ficam à vista: são a triagem, não um filtro de
 * ocasião. O que muda é passarem a uma fila só, que se arrasta.
 *
 * ── O COMPUTADOR NÃO REGRIDE ─────────────────────────────────────────────
 * No `lg:` os controlos são sempre visíveis e o botão «Filtros» nem existe.
 * Isso não se afirma aqui (o jsdom não tem media queries) — está nas classes
 * `lg:` e no retrato de 1440 que acompanha o relatório.
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

/**
 * A ÚNICA REGRA DE CSS DE QUE ESTAS ASSERÇÕES DEPENDEM.
 *
 * O painel recolhe com o `hidden` do Tailwind, que é `display: none` — e é por
 * isso que fechado também não é percorrido por teclado nem lido em voz alta.
 * O jsdom não carrega a folha do Tailwind, portanto sem esta linha o
 * `toBeVisible()` daria sempre verde e o teste não afirmava nada.
 *
 * Declará-la aqui é preferível a trocar a asserção por «a classe `hidden` está
 * na string»: o que interessa é o EFEITO (não se vê, não se ouve), e é o efeito
 * que fica escrito.
 *
 * Vai PRESA AO PAINEL pelo id, e não solta como `.hidden`. À primeira estava
 * solta e apagou meio back office dentro do teste: a barra lateral é
 * `hidden lg:flex`, e sem media queries no jsdom o `lg:` nunca chega — deixou
 * de haver por onde navegar até aos Pedidos, e as seis asserções falharam a
 * dizer «não encontro o botão Pedidos», que não tem nada a ver com filtros.
 */
function carregarRegraDoHidden() {
  const s = document.createElement("style");
  s.textContent = "#painel-filtros-pedidos.hidden { display: none; }";
  document.head.appendChild(s);
}

beforeEach(() => {
  seq = 0;
  localStorage.clear();
  carregarRegraDoHidden();
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

/**
 * O painel recolhível dos filtros.
 *
 * Vai pelo `id` e não por `getByRole("group", { name })`, e a razão é
 * instrutiva: com o painel fechado (`display: none`) o algoritmo do nome
 * acessível não desce à árvore, e o painel aparece com nome VAZIO — mesmo com
 * `hidden: true`, que o encontra mas não lhe devolve o rótulo. Procurá-lo pelo
 * nome só funcionaria aberto, que é metade do que aqui se quer afirmar.
 *
 * O `id` não é um pormenor de teste: é o mesmo que o botão aponta em
 * `aria-controls`. Que o painel exista com este id É parte do contrato.
 * O rótulo confirma-se à parte, com o painel aberto.
 */
const painel = () => {
  const el = document.getElementById("painel-filtros-pedidos");
  if (!el) throw new Error("não há painel de filtros com o id que o botão aponta");
  return el;
};
const botaoFiltros = () => screen.getByRole("button", { name: /^Filtros/ });

describe("os filtros da lista de pedidos", () => {
  it("a procura fica sempre à vista — é a que se usa em todas as sessões", () => {
    renderAdmin([makeQuote()]);
    irParaPedidos();
    expect(screen.getByLabelText(/Procurar pedidos por nome/i)).toBeVisible();
  });

  it("os restantes filtros começam recolhidos", () => {
    renderAdmin([makeQuote()]);
    irParaPedidos();
    // `hidden` no sentido da acessibilidade: quem ouve a página também não os
    // percorre enquanto estiverem fechados.
    expect(painel()).not.toBeVisible();
    expect(botaoFiltros()).toHaveAttribute("aria-expanded", "false");
  });

  it("o botão abre e fecha o painel", async () => {
    const user = userEvent.setup();
    renderAdmin([makeQuote()]);
    irParaPedidos();

    await user.click(botaoFiltros());
    expect(painel()).toBeVisible();
    expect(botaoFiltros()).toHaveAttribute("aria-expanded", "true");
    // Aberto, anuncia-se — um grupo de controlos sem nome é «grupo» e mais nada.
    expect(screen.getByRole("group", { name: /filtros dos pedidos/i })).toBe(painel());
    expect(within(painel()).getByLabelText(/Filtrar por categoria/i)).toBeVisible();
    expect(within(painel()).getByLabelText(/Ordenar pedidos/i)).toBeVisible();

    await user.click(botaoFiltros());
    expect(painel()).not.toBeVisible();
  });

  it("diz quantos filtros estão activos, para uma lista filtrada não parecer vazia", async () => {
    const user = userEvent.setup();
    renderAdmin([makeQuote(), makeQuote({ category: "empresas" })]);
    irParaPedidos();

    // Nenhum activo: o botão não inventa um contador.
    expect(botaoFiltros()).toHaveAccessibleName(/^Filtros$/);

    await user.click(botaoFiltros());
    await escolher(
      user,
      within(painel()).getByLabelText(/Filtrar por categoria/i),
      /Eventos Empresariais/i,
    );
    expect(botaoFiltros()).toHaveAccessibleName(/1/);

    await user.click(within(painel()).getByRole("button", { name: /Atribuídos a mim/i }));
    expect(botaoFiltros()).toHaveAccessibleName(/2/);
  });

  it("a contagem não conta a ordenação — ordenar não esconde pedidos", async () => {
    const user = userEvent.setup();
    renderAdmin([makeQuote()]);
    irParaPedidos();

    await user.click(botaoFiltros());
    await escolher(user, within(painel()).getByLabelText(/Ordenar pedidos/i), /Mais recentes/i);
    // Mudar a ordem não tira nada da lista: contá-la como filtro activo seria
    // dar um alarme falso, e um alarme falso gasta-se depressa.
    expect(botaoFiltros()).toHaveAccessibleName(/^Filtros$/);
  });

  it("uma lista esvaziada por um filtro NÃO se anuncia como «sem pedidos ainda»", async () => {
    const user = userEvent.setup();
    // Há pedidos — só nenhum nesta categoria.
    renderAdmin([makeQuote({ category: "particulares" })]);
    irParaPedidos();

    await user.click(botaoFiltros());
    await escolher(
      user,
      within(painel()).getByLabelText(/Filtrar por categoria/i),
      /Eventos Empresariais/i,
    );

    /**
     * Este é o outro lado da moeda do contador do botão, e o mais perigoso.
     *
     * Com os filtros recolhidos, um ecrã que diz «Sem pedidos ainda» sobre uma
     * lista que na verdade está FILTRADA é uma mentira com consequências: ela
     * conclui que não entrou nada, fecha o telemóvel, e o pedido fica sem
     * resposta. O ecrã já distinguia a procura e o estado — mas não os seis
     * filtros do painel, que são justamente os que estão escondidos.
     */
    expect(screen.getByText(/Nenhum pedido corresponde/i)).toBeVisible();
    expect(screen.queryByText(/Sem pedidos ainda/i)).toBeNull();
    // E não convida a criar um pedido novo: o que falta é limpar um filtro.
    expect(screen.queryByRole("button", { name: /\+ Novo pedido/ })).toBeNull();
  });

  it("as pastilhas de estado ficam à vista, numa fila que se arrasta", () => {
    renderAdmin([makeQuote()]);
    irParaPedidos();
    const todos = screen.getByRole("button", { name: /^Todos · \d+$/ });
    expect(todos).toBeVisible();
    // A fila é um contentor com scroll próprio — é isso que a mantém numa
    // linha só sem cortar nada, e é a única forma de sair da margem que a
    // auditoria de toque aceita (ver `ergonomia-tactil.mjs`).
    const fila = todos.parentElement!;
    expect(fila.className).toMatch(/overflow-x-auto/);
    expect(fila.className).toMatch(/flex-nowrap/);
    expect(fila.className).toMatch(/lg:flex-wrap/);
  });
});
