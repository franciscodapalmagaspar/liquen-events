// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import { __resetListCache, prefetchList } from "./useCachedList";
import AdminClient from "./AdminClient";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * BO 4 — ATALHOS, ACÇÕES EM VÁRIOS PEDIDOS E A PROCURA ⌘K «EM TUDO»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que se prende aqui, ao nível do back office inteiro:
 *  · o ⌘K procura nas listas que já estão na memória, SEM pedido nenhum, e
 *    cada resultado abre a vista certa com o pedido certo;
 *  · os comandos novos (Nova tarefa, Novo evento, Fazer proposta, Atalhos);
 *  · o acorde «G» leva aos destinos novos e deixou de levar aos escondidos;
 *  · o «/» foca a procura da vista onde se está (ou abre o ⌘K);
 *  · nos Pedidos: ⌘A, Esc, «Arquivar (N)» e «Restaurar (N)», com «Anular».
 */

/** As vistas preguiçosas viram uma etiqueta que diz o que lhes chegou. */
vi.mock("./lazy", () => {
  const stub = (name: string) => {
    const C = (props: Record<string, unknown>) => (
      <div data-testid={`view-${name}`} data-pedido={JSON.stringify(props.pedidoDaPaleta ?? null)}>
        {name} stub
        {name === "propostas" && <input aria-label="Procurar propostas" />}
      </div>
    );
    C.displayName = `Lazy(${name})`;
    return C;
  };
  const nomes = [
    "Overview",
    "Kanban",
    "Clientes",
    "Calendario",
    "FazerProposta",
    "Propostas",
    "Pagamentos",
    "Acompanhamento",
    "DefinicoesProposta",
    "Servicos",
    "Reciclagem",
    "Tarefas",
    "Fornecedores",
    "StatsDashboard",
    "FechosMeta",
    "EmailTemplates",
    "Contratos",
    "Inventario",
    "Material",
    "Temas",
    "Guioes",
    "MapaDeMesas",
    "ImportarProposta",
    "ProposalStudio",
    "ClientMessenger",
    "EventChecklist",
    "EventMaterial",
    "ProductionPlan",
    "EventTimeline",
    "PaymentsPanel",
    "EventCosts",
    "GuestList",
    "TagsField",
    "FollowUpField",
    "ActivityLog",
    "EventTasks",
  ];
  return {
    ...Object.fromEntries(nomes.map((n) => [n, stub(n.toLowerCase())])),
    WARM_ORDER: [],
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

const resposta = (body: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 500, headers: new Headers(), json: async () => body }) as Response;

const TAREFAS = [
  { id: "t1", title: "Ligar ao florista do Sado", done: false, priority: "normal", createdAt: "" },
];
const PROPOSTAS_LEVES = [
  { id: "p1", quoteId: "LQ-900", clientName: "Joana e Pedro", status: "enviada" },
];

let fetchMock: ReturnType<typeof vi.fn>;
let escritas: { url: string; metodo: string; corpo: Record<string, unknown> }[] = [];
let arquivados = new Map<string, boolean>();
/** Os pedidos como o servidor os tem — a resposta de um PATCH é o pedido inteiro. */
let noServidor = new Map<string, Quote>();

beforeEach(() => {
  seq = 0;
  escritas = [];
  arquivados = new Map();
  noServidor = new Map();
  localStorage.clear();
  __resetListCache();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const metodo = init?.method ?? "GET";
    if (metodo !== "GET") {
      const corpo = JSON.parse(String(init?.body ?? "{}"));
      escritas.push({ url: u, metodo, corpo });
      const m = /^\/api\/orcamento\/(.+)$/.exec(u);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (typeof corpo.archived === "boolean") arquivados.set(id, corpo.archived);
        return resposta({ ...noServidor.get(id)!, archived: arquivados.get(id) ?? false });
      }
      return resposta({ ok: true });
    }
    if (u.startsWith("/api/tarefas")) return resposta(TAREFAS);
    if (u.startsWith("/api/propostas")) return resposta(PROPOSTAS_LEVES);
    return resposta([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderAdmin(quotes: Quote[] = []) {
  for (const q of quotes) noServidor.set(q.id, q);
  return render(
    <ToastProvider>
      <AdminClient initialQuotes={quotes} userName="Catarina" />
    </ToastProvider>,
  );
}

const tecla = (key: string, extra: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(document.body, { key, ...extra });

function abrirPaleta() {
  tecla("k", { metaKey: true });
  return screen.findByRole("combobox", { name: "Pesquisar ou navegar" });
}

describe("⌘K — os comandos novos", () => {
  it("Nova tarefa, Novo evento, Fazer proposta e Atalhos estão nas Ações; o «Fazer proposta» só uma vez", async () => {
    renderAdmin();
    await abrirPaleta();
    const accoes = screen.getByRole("group", { name: "Ações" });
    for (const nome of ["Nova tarefa", "Novo evento", "Fazer proposta", "Atalhos de teclado"]) {
      expect(within(accoes).getByRole("option", { name: new RegExp(nome) })).toBeTruthy();
    }
    expect(screen.getAllByRole("option", { name: /Fazer proposta/ })).toHaveLength(1);
  });

  it("«Novo evento» leva ao Calendário com o pedido de uma marcação nova", async () => {
    renderAdmin();
    await abrirPaleta();
    fireEvent.click(screen.getByRole("option", { name: /Novo evento/ }));
    const vista = await screen.findByTestId("view-calendario");
    expect(JSON.parse(vista.dataset.pedido!)).toEqual({ novo: true });
  });

  it("«Atalhos de teclado» abre a folha dos atalhos", async () => {
    renderAdmin();
    await abrirPaleta();
    fireEvent.click(screen.getByRole("option", { name: /Atalhos de teclado/ }));
    expect(await screen.findByRole("dialog", { name: "Atalhos de teclado" })).toBeTruthy();
  });
});

describe("⌘K — procura em tudo, só com o que está na memória", () => {
  it("encontra uma tarefa e uma proposta já em cache, sem pedido nenhum, e abre-as no sítio", async () => {
    prefetchList("tarefas", "/api/tarefas");
    prefetchList("propostas-leves", "/api/propostas?semDoc=1");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    renderAdmin();
    // O aquecimento em ociosidade do back office (propostas leves, tarefas,
    // calendário) corre por si, com ou sem paleta. Espera-se por ele para a
    // conta de baixo medir só a procura.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]) === "/api/calendario")).toBe(true),
    );
    await act(async () => {});

    const antes = fetchMock.mock.calls.length;
    const campo = await abrirPaleta();
    fireEvent.change(campo, { target: { value: "florista" } });
    const opcao = within(screen.getByRole("group", { name: "Tarefas" })).getByRole("option", {
      name: /Ligar ao florista do Sado/,
    });
    fireEvent.change(campo, { target: { value: "joana" } });
    expect(
      within(screen.getByRole("group", { name: "Propostas" })).getByRole("option", {
        name: /Joana e Pedro/,
      }),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.slice(antes).map((c) => String(c[0])),
      "procurar não pode pedir nada ao servidor",
    ).toEqual([]);
    expect(opcao).toBeTruthy();

    fireEvent.change(campo, { target: { value: "florista" } });
    fireEvent.click(screen.getByRole("option", { name: /Ligar ao florista do Sado/ }));
    const vista = await screen.findByTestId("view-tarefas");
    expect(JSON.parse(vista.dataset.pedido!)).toEqual({ id: "t1" });
  });

  it("o que não está na memória não aparece — e não se vai buscar", async () => {
    renderAdmin();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]) === "/api/calendario")).toBe(true),
    );
    await act(async () => {});
    const antes = fetchMock.mock.calls.length;
    const campo = await abrirPaleta();
    fireEvent.change(campo, { target: { value: "escadote" } });
    expect(screen.queryByRole("group", { name: "Material" })).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(antes);
  });
});

describe("o acorde «G»", () => {
  it.each([
    ["d", "pagamentos"],
    ["i", "temas"],
    ["m", "material"],
    ["c", "contratos"],
    ["f", "fazerproposta"],
    ["k", "kanban"],
  ])("G, %s leva a %s", async (letra, vista) => {
    renderAdmin();
    tecla("g");
    tecla(letra);
    expect(await screen.findByTestId(`view-${vista}`)).toBeTruthy();
  });

  it("deixou de levar aos Fornecedores escondidos", async () => {
    renderAdmin();
    tecla("g");
    tecla("p"); // vai aos Pedidos primeiro, para haver de onde não sair
    tecla("g");
    tecla("f");
    expect(await screen.findByTestId("view-fazerproposta")).toBeTruthy();
    expect(screen.queryByTestId("view-fornecedores")).toBeNull();
  });
});

describe("o «/»", () => {
  it("nas Propostas foca a procura das Propostas, e não salta para os Pedidos", async () => {
    renderAdmin();
    tecla("g");
    tecla("r");
    await screen.findByTestId("view-propostas");
    tecla("/");
    expect(screen.getByLabelText("Procurar propostas")).toHaveFocus();
    expect(screen.getByTestId("view-propostas")).toBeTruthy();
  });

  it("numa vista sem procura abre a procura em tudo", async () => {
    renderAdmin();
    tecla("g");
    tecla("e");
    await screen.findByTestId("view-statsdashboard");
    tecla("/");
    expect(await screen.findByRole("combobox", { name: "Pesquisar ou navegar" })).toBeTruthy();
  });

  it("a escrever num campo, o «/» é uma barra e não um atalho", async () => {
    renderAdmin([makeQuote()]);
    tecla("g");
    tecla("p");
    const procura = await screen.findByLabelText("Procurar pedidos por nome, email, local ou ID");
    fireEvent.keyDown(procura, { key: "/" });
    expect(screen.queryByRole("combobox", { name: "Pesquisar ou navegar" })).toBeNull();
  });
});

describe("Pedidos — o lote", () => {
  const tres = () => [
    makeQuote({ id: "LQ-101", name: "Ana Marques" }),
    makeQuote({ id: "LQ-102", name: "Bruno Dias" }),
    makeQuote({ id: "LQ-103", name: "Carla Nunes" }),
  ];

  it("⌘A selecciona os que estão à vista e Esc limpa", async () => {
    renderAdmin(tres());
    tecla("g");
    tecla("p");
    await screen.findByText("Ana Marques");
    tecla("a", { metaKey: true });
    expect(await screen.findByText(/3 selecionados/)).toBeTruthy();
    tecla("Escape");
    await waitFor(() => expect(screen.queryByText(/3 selecionados/)).toBeNull());
  });

  it("⌘A noutra vista não mexe na selecção dos Pedidos", async () => {
    renderAdmin(tres());
    tecla("g");
    tecla("t");
    await screen.findByTestId("view-tarefas");
    tecla("a", { metaKey: true });
    tecla("g");
    tecla("p");
    await screen.findByText("Ana Marques");
    expect(screen.queryByText(/selecionados/)).toBeNull();
  });

  it("«Arquivar (N)» arquiva os escolhidos e «Anular» devolve-os", async () => {
    renderAdmin(tres());
    tecla("g");
    tecla("p");
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Selecionar pedido de Ana Marques" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar pedido de Bruno Dias" }));
    fireEvent.click(screen.getByRole("button", { name: "Arquivar (2)" }));

    await waitFor(() => expect(escritas.filter((e) => e.corpo.archived === true)).toHaveLength(2));
    await waitFor(() => expect(screen.queryByText("Ana Marques")).toBeNull());
    expect(await screen.findByText("2 pedidos arquivados.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(escritas.filter((e) => e.corpo.archived === false)).toHaveLength(2));
    expect(await screen.findByText("Ana Marques")).toBeTruthy();
  });

  it("na lista dos arquivados o botão é «Restaurar (N)»", async () => {
    renderAdmin([
      makeQuote({ id: "LQ-201", name: "Dora Arquivada", archived: true }),
      makeQuote({ id: "LQ-202", name: "Eva Activa" }),
    ]);
    tecla("g");
    tecla("p");
    fireEvent.click(await screen.findByRole("button", { name: /Arquivados · 1/ }));
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Selecionar pedido de Dora Arquivada" }),
    );
    expect(screen.queryByRole("button", { name: /^Arquivar \(/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar (1)" }));
    await waitFor(() => expect(escritas.filter((e) => e.corpo.archived === false)).toHaveLength(1));
    expect(await screen.findByText("1 pedido restaurado.")).toBeTruthy();
  });
});
