// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, within, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";
import { escolher, escolherJa } from "./ui/escolher.testkit";
import userEvent from "@testing-library/user-event";

/**
 * Behavioural safety net for the back-office shell.
 *
 * AdminClient is a large stateful container that the owner uses daily. Before we
 * carve its state logic into hooks, these tests pin the behaviours a refactor
 * could silently break: it renders, view navigation switches the surface,
 * opening a quote reveals its detail, and bulk selection is tracked. The heavy
 * code-split views (./lazy) are stubbed so the test exercises the shell — the
 * exact part that stays in AdminClient after the hooks move out — not their
 * innards, which have their own coverage.
 */

// Each code-split view/panel becomes a tiny marker so we can assert which
// surface is mounted without pulling in charts, next/image, or data panels.
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
    // O estúdio devolve o pedido gravado pelo `onQuoteUpdated` — é por aí que o
    // painel volta a ler o preço. O botão do duplo dá esse caminho a um teste
    // sem montar as 384 KB do estúdio a sério.
    ProposalStudio: Object.assign(
      ({ quote, onQuoteUpdated }: { quote: Quote; onQuoteUpdated: (q: Quote) => void }) => (
        <div data-testid="view-proposal-studio">
          proposal-studio stub
          <button onClick={() => onQuoteUpdated({ ...quote, quotedPrice: 0 })}>
            estúdio gravou 0 €
          </button>
        </div>
      ),
      { displayName: "Lazy(proposal-studio)" },
    ),
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

// next/image renders a plain <img> in jsdom; strip framework-only props.
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

const PRICE = {
  basePrice: 5000,
  guestCost: 3000,
  packageMultiplier: 1,
  locationSurcharge: 0,
  weekendSurcharge: 0,
  seasonSurcharge: 0,
  urgencySurcharge: 0,
  addonsCost: 0,
  subtotal: 8000,
  iva: 1840,
  total: 9840,
  rangeMin: 8000,
  rangeMax: 12000,
  isEstimate: true,
};

let seq = 0;
function makeQuote(over: Partial<Quote> = {}): Quote {
  seq += 1;
  return {
    id: `LQ-${String(seq).padStart(3, "0")}`,
    submittedAt: "2026-05-01T10:00:00.000Z",
    lastUpdated: "2026-05-01T10:00:00.000Z",
    status: "pendente",
    name: `Cliente ${seq}`,
    email: `cliente${seq}@example.com`,
    phone: "910000000",
    company: "",
    nif: "",
    category: "particulares",
    eventType: "casamentos",
    eventName: "Evento",
    date: "2026-09-20",
    endDate: "",
    location: "Évora",
    locationType: "pequena_cidade",
    guests: 80,
    duration: 8,
    isMultiDay: false,
    packageTier: "completo",
    addons: [],
    budgetRange: "15k_30k",
    urgency: "standard",
    notes: "",
    referralSource: "",
    acceptTerms: true,
    acceptMarketing: false,
    priceBreakdown: PRICE,
    ...over,
  } as Quote;
}

/**
 * Os pedidos que o "servidor" tem, por id.
 *
 * A lista chega em RESUMO (ver `resumirQuote`), sem as colecções que só o
 * pedido aberto mostra, e abrir um pedido vai buscar o resto a
 * `/api/orcamento/<id>`. O `fetch` de mentira lê daqui para que abrir um
 * pedido funcione nos testes como funciona no produto.
 */
const servidor = new Map<string, Quote>();

/** Cabeçalhos de resposta com a interface que o código usa (`.get`). */
const cabecalhos = (mapa: Record<string, string>) => ({ get: (k: string) => mapa[k] ?? null });

function renderAdmin(quotes: Quote[]) {
  servidor.clear();
  for (const q of quotes) servidor.set(q.id, q);
  return render(
    <ToastProvider>
      <AdminClient initialQuotes={quotes} userName="Teste" />
    </ToastProvider>,
  );
}

// The desktop sidebar (an <aside>, role "complementary") and the mobile bottom
// bar both carry nav buttons; jsdom applies no CSS so neither is hidden. Scope
// nav clicks to the sidebar to keep the button label unambiguous. Secondary
// destinations now live behind a collapsed "Mais" group, so expand it first
// when the wanted entry isn't in the always-visible core list.
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
  localStorage.clear();
  // Nothing in the shell fetches on mount (NotificationBell self-guards on the
  // missing serviceWorker), but stub fetch so a stray call can never hit the network.
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const m = /^\/api\/orcamento\/(.+)$/.exec(String(url));
      const pedido = m ? servidor.get(decodeURIComponent(m[1])) : undefined;
      if (pedido)
        return Promise.resolve({
          ok: true,
          // O cabeçalho que a rota põe quando há sessão e a resposta é o
          // pedido INTEIRO. Sem sessão a mesma rota responde 200 com uma lista
          // curta e pública, e é isto que as distingue — ver `comPedidoInteiro`.
          headers: cabecalhos({ "x-pedido": "completo" }),
          json: () => Promise.resolve(pedido),
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

describe("AdminClient shell", () => {
  it("renders the back-office chrome on the default overview view", () => {
    renderAdmin([makeQuote()]);

    // Top-bar title + subtitle for the default view.
    expect(screen.getByRole("heading", { name: "Visão Geral" })).toBeInTheDocument();
    // The signed-in user's name from props.
    expect(screen.getByText("Teste")).toBeInTheDocument();
    // The overview surface (code-split, here stubbed) is mounted by default.
    expect(screen.getByTestId("view-overview")).toBeInTheDocument();
  });

  it("switches the active surface when a sidebar nav item is chosen", () => {
    renderAdmin([makeQuote({ name: "Ana Marques" }), makeQuote({ name: "Bruno Dias" })]);

    // The desktop sidebar exposes one button per nav entry (unique label text).
    navTo(/Pedidos/);

    // Header reflects the new view…
    expect(screen.getByRole("heading", { name: "Pedidos" })).toBeInTheDocument();
    // …and the inline "pedidos" list (not code-split) shows the seeded quotes.
    expect(screen.getByText("Ana Marques")).toBeInTheDocument();
    expect(screen.getByText("Bruno Dias")).toBeInTheDocument();
    // The overview stub is gone.
    expect(screen.queryByTestId("view-overview")).not.toBeInTheDocument();
  });

  it("persists the chosen view to localStorage", () => {
    renderAdmin([makeQuote()]);
    // Os Temas e não a Organização de propostas: esta prova é sobre GRAVAR a
    // vista escolhida, e serve com qualquer destino do menu. (Era a das
    // Faturas, que saiu com a facturação; o kanban saiu do menu a pedido dela e
    // continua a abrir por link directo, ver `nav.tsx`.)
    navTo(/Temas/);
    expect(localStorage.getItem("liquen-admin-view")).toBe("temas");
    // And the chosen surface is now mounted.
    expect(screen.getByTestId("view-temas")).toBeInTheDocument();
  });

  it("opens a quote's detail panel and closes it", async () => {
    const quote = makeQuote({ id: "LQ-042", name: "Carla Nunes" });
    renderAdmin([quote]);

    navTo(/Pedidos/);
    // A referência SAIU da lista — está só no painel de detalhe, por decisão
    // dela («retira a referência»). Com o painel fechado não aparece em lado
    // nenhum, o que torna esta contagem um sinal mais limpo do que era: 0 com o
    // painel fechado, 1 com ele aberto.
    expect(screen.queryAllByText(/LQ-042/)).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Fechar" })).not.toBeInTheDocument();

    // The list row is a button labelled by the client's name.
    abrirOPainelDoPedido("Carla Nunes");

    // The detail drawer is now open: its close control exists and the id is
    // echoed a second time inside the panel header. Abre depois de o pedido
    // INTEIRO chegar — a lista só traz o resumo, e o painel de convidados (e
    // os outros três) copia a colecção para estado interno no primeiro render:
    // aberto sobre o resumo ficava com uma lista vazia e a primeira edição
    // gravava-a por cima da verdadeira.
    expect(await screen.findByRole("button", { name: "Fechar" })).toBeInTheDocument();
    expect(screen.getAllByText(/LQ-042/)).toHaveLength(1);

    // Closing the drawer tears it down again.
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("button", { name: "Fechar" })).not.toBeInTheDocument();
    expect(screen.queryAllByText(/LQ-042/)).toHaveLength(0);
  });

  /**
   * ── ABRIR UM PEDIDO VAI BUSCAR O PEDIDO INTEIRO ─────────────────────────
   *
   * A lista chega em resumo: sem convidados, checklist, plano de produção nem
   * cronograma (ver `resumirQuote` — com 300 pedidos era isso que enchia o
   * HTML da página). O painel de detalhe é o dono desses quatro, e cada um
   * deles copia a colecção para estado interno no primeiro render, preso por
   * `key` ao id do pedido: aberto sobre o resumo ficava com uma lista VAZIA
   * que a primeira edição gravava por cima da verdadeira.
   *
   * Daí estes três testes: vai-se buscar, vai-se buscar UMA vez, e se não se
   * conseguir NÃO se abre um painel que parece completo e não está.
   */
  it("abre com a versão inteira do servidor, não com o resumo da lista", async () => {
    renderAdmin([makeQuote({ id: "LQ-777", name: "Sara Lopes" })]);
    navTo(/Pedidos/);
    abrirOPainelDoPedido("Sara Lopes");
    await screen.findByRole("button", { name: "Fechar" });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/orcamento/LQ-777", expect.anything());
  });

  it("reabrir o mesmo pedido não volta a pedi-lo ao servidor", async () => {
    renderAdmin([makeQuote({ id: "LQ-777", name: "Sara Lopes" })]);
    navTo(/Pedidos/);
    // O PEDIDO e mais nada. O painel também vai buscar a nota da proposta a
    // `/api/orcamento/<id>/proposta-rascunho`, e um `startsWith` contava-a —
    // o que este teste prende é o pedido inteiro não ser lido duas vezes, não
    // que o painel não fale com o servidor.
    const idas = () =>
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/orcamento/LQ-777").length;

    abrirOPainelDoPedido("Sara Lopes");
    fireEvent.click(await screen.findByRole("button", { name: "Fechar" }));
    abrirOPainelDoPedido("Sara Lopes");
    await screen.findByRole("button", { name: "Fechar" });
    expect(idas()).toBe(1);
  });

  it("se o pedido inteiro não vier, o painel NÃO abre com o resumo", async () => {
    renderAdmin([makeQuote({ id: "LQ-777", name: "Sara Lopes" })]);
    navTo(/Pedidos/);
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Erro interno" }),
    } as never);

    abrirOPainelDoPedido("Sara Lopes");
    // A falha é DITA, e NOMEIA o pedido: «Não foi possível abrir o pedido» era
    // a mesma frase para quatro avarias com respostas diferentes, e nenhuma
    // delas dizia de que pedido se tratava.
    const aviso = await screen.findByText(/não está a aceitar gravações/i);
    // E o aviso NOMEIA o pedido — «Não foi possível abrir o pedido» servia
    // quatro avarias diferentes e nenhuma dizia de qual se tratava.
    expect(aviso.textContent).toContain("Sara Lopes");
    // O painel ecoa a referência do pedido no cabeçalho, e é o ÚNICO sítio onde
    // ela aparece desde que saiu da lista. Com o painel fechado, zero.
    expect(screen.queryAllByText(/LQ-777/)).toHaveLength(0);
  });

  /**
   * ── SESSÃO EXPIRADA RESPONDE 200 ────────────────────────────────────────
   *
   * `/api/orcamento/<id>` é pública: a página de confirmação do casal lê-a. Sem
   * sessão devolve uma lista CURTA de factos do evento — que também traz `id` e
   * também vem com 200. Ela deixa o back office aberto horas seguidas, portanto
   * isto não é um caso de laboratório.
   *
   * Aceitá-la abria o painel sem nome, sem contacto, sem pagamentos e sem
   * convidados, e ainda substituía o pedido na lista por essa versão amputada.
   * O cabeçalho `x-pedido: completo` é o que distingue as duas respostas.
   */
  it("uma resposta 200 SEM a marca de pedido completo não abre o painel", async () => {
    renderAdmin([makeQuote({ id: "LQ-777", name: "Sara Lopes" })]);
    navTo(/Pedidos/);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: cabecalhos({}),
      // Exactamente a forma pública: tem `id`, e mais nada do que interessa.
      json: () => Promise.resolve({ id: "LQ-777", status: "novo", eventType: "Casamento" }),
    } as never);

    abrirOPainelDoPedido("Sara Lopes");

    // E aqui a frase certa é OUTRA: isto não é uma falha de ligação, é a
    // sessão caída — e mandar «verificar a ligação» era mandar fazer a única
    // coisa que não resolve nada.
    expect(await screen.findByText(/sessão expirou/i)).toBeInTheDocument();
    expect(screen.getByText(/volta a entrar/i)).toBeInTheDocument();
    // O painel não abriu, e a referência só existe DENTRO dele desde que saiu
    // da lista — portanto zero.
    expect(screen.queryAllByText(/LQ-777/)).toHaveLength(0);
  });

  /**
   * O botão "Atualizar" era o programa a perguntar a quem o usa se os dados
   * estariam velhos. Foi-se, e no lugar dele a lista revalida-se sozinha ao
   * voltar ao separador. Estes dois testes existem para o botão não voltar por
   * distração e para a revalidação não morrer em silêncio.
   */
  it("já não há botão de atualizar — a lista trata disso sozinha", () => {
    renderAdmin([makeQuote()]);
    expect(screen.queryByRole("button", { name: /Atualizar/i })).not.toBeInTheDocument();
  });

  it("volta a ler os pedidos ao regressar ao separador", async () => {
    const novo = makeQuote({ name: "Filipa Nova" });
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        status: 200,
        ok: true,
        headers: { get: () => 'W/"2"' },
        json: () => Promise.resolve([novo]),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderAdmin([makeQuote({ name: "Gabriel Antigo" })]);
    navTo(/Pedidos/);
    expect(screen.getByText("Gabriel Antigo")).toBeInTheDocument();
    expect(screen.queryByText("Filipa Nova")).not.toBeInTheDocument();

    // Sair e voltar ao separador é o gesto que dispara a revalidação.
    fireEvent(document, new Event("visibilitychange"));
    await screen.findByText("Filipa Nova");

    const pedidos = fetchMock.mock.calls.filter(
      (args) => (args as unknown as [string])[0] === "/api/orcamento?resumo=1",
    );
    expect(pedidos).toHaveLength(1);
    expect(screen.queryByText("Gabriel Antigo")).not.toBeInTheDocument();
  });

  it("ninguém a mexer há mais de 15 minutos: o relógio deixa de perguntar, e o primeiro gesto pergunta logo (4/11)", async () => {
    // Uma janela esquecida aberta continua «visível», e perguntava ao servidor
    // de cinco em cinco minutos durante horas. Ela pediu menos processador na
    // Vercel «mantendo tudo como está».
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        status: 304,
        ok: true,
        headers: { get: () => 'W/"1"' },
        json: () => Promise.resolve([]),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const pedidos = () =>
      fetchMock.mock.calls.filter(
        (args) => (args as unknown as [string])[0] === "/api/orcamento?resumo=1",
      ).length;
    try {
      renderAdmin([makeQuote()]);
      navTo(/Pedidos/);
      // Os primeiros quinze minutos ainda contam como «alguém a olhar».
      act(() => void vi.advanceTimersByTime(16 * 60_000));
      const antes = pedidos();
      expect(antes).toBeGreaterThan(0);
      // Mais meia hora sem um gesto: nenhuma pergunta.
      act(() => void vi.advanceTimersByTime(30 * 60_000));
      expect(pedidos()).toBe(antes);
      // O primeiro gesto pergunta logo.
      fireEvent.pointerDown(window);
      expect(pedidos()).toBe(antes + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * A lista mostrava tudo igual, com a mesma etiqueta "Novo" num pedido de
   * ontem e num de há nove dias. Estes testes prendem o que substitui isso.
   */
  describe("urgência e contexto na lista de pedidos", () => {
    /** Um pedido entrado há N dias, ainda sem resposta. */
    const hAtras = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString();

    it("põe à cabeça quem espera há mais tempo, sem ser preciso mexer na ordem", () => {
      renderAdmin([
        makeQuote({ name: "Recente", submittedAt: hAtras(1) }),
        makeQuote({ name: "Antigo", submittedAt: hAtras(12) }),
      ]);
      navTo(/Pedidos/);

      const nomes = screen.getAllByText(/^(Recente|Antigo)$/).map((n) => n.textContent);
      expect(nomes[0]).toBe("Antigo");
    });

    it("diz há quantos dias cada um espera", () => {
      renderAdmin([makeQuote({ name: "Ana", submittedAt: hAtras(4) })]);
      navTo(/Pedidos/);
      expect(screen.getByText("há 4 dias")).toBeInTheDocument();
    });

    it("não conta dias a quem já teve resposta — esse espera por eles", () => {
      renderAdmin([makeQuote({ name: "Com proposta", status: "cotado", submittedAt: hAtras(30) })]);
      navTo(/Pedidos/);
      expect(screen.queryByText(/há 30 dias/)).not.toBeInTheDocument();
    });

    it("marca o provável casamento à distância: sem data E sem local concreto", () => {
      renderAdmin([makeQuote({ name: "Longe", date: "", location: "Portugal" })]);
      navTo(/Pedidos/);
      expect(screen.getByText("Provável casamento à distância")).toBeInTheDocument();
    });

    it("uma ausência sozinha não faz um casamento à distância", () => {
      renderAdmin([makeQuote({ name: "Perto sem data", date: "", location: "Évora" })]);
      navTo(/Pedidos/);
      expect(screen.queryByText("Provável casamento à distância")).not.toBeInTheDocument();
    });

    it("mostra a região e a distância a Évora", () => {
      renderAdmin([makeQuote({ name: "Palmela", location: "Quinta X, Palmela" })]);
      navTo(/Pedidos/);
      expect(screen.getByText(/Palmela · ≈ \d+ km/)).toBeInTheDocument();
    });

    it("o filtro da espera esconde quem ainda não esperou o suficiente", async () => {
      renderAdmin([
        makeQuote({ name: "Ontem", submittedAt: hAtras(1) }),
        makeQuote({ name: "Ha Muito", submittedAt: hAtras(9) }),
      ]);
      navTo(/Pedidos/);

      // A `Escolha` já não é um `<select>` depois de montar: ver
      // `ui/escolher.testkit`. O `fireEvent.change` num botão não faz nada.
      await escolher(
        userEvent.setup(),
        screen.getByLabelText("Filtrar por tempo de espera"),
        /7\+/,
      );
      expect(screen.getByText("Ha Muito")).toBeInTheDocument();
      expect(screen.queryByText("Ontem")).not.toBeInTheDocument();
    });
  });

  it("tracks bulk selection via the row checkboxes", () => {
    renderAdmin([makeQuote({ name: "Diogo Reis" }), makeQuote({ name: "Eva Lopes" })]);
    navTo(/Pedidos/);

    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar pedido de Diogo Reis" }));

    // The bulk-action bar announces the count.
    expect(screen.getByText(/1 selecionado/)).toBeInTheDocument();
  });
});

/**
 * A LISTA DE PEDIDOS MUDA DE FORMA.
 *
 * É o ecrã onde ela passa mais tempo. Num monitor, uma pilha de cartões grandes
 * mostra oito pedidos onde cabiam vinte e cinco — e não deixa fazer a pergunta
 * que decide o dia: quem está à espera há mais tempo.
 */
describe("Pedidos — cartões no telemóvel, tabela no computador", () => {
  function simularComputador() {
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
  }

  afterEach(() => vi.unstubAllGlobals());

  it("no computador é uma tabela, com a coluna de quem espera há mais tempo", async () => {
    simularComputador();
    renderAdmin([makeQuote({ name: "Diogo Reis" }), makeQuote({ name: "Eva Lopes" })]);
    navTo(/Pedidos/);
    await waitFor(() => expect(screen.getByRole("table", { name: "Pedidos" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /À espera/ })).toBeInTheDocument();
  });

  /** A selecção em lote tem de continuar a funcionar nas DUAS formas — é o que
   *  permite responder a cinco pedidos de uma vez. */
  it("a selecção em lote continua a funcionar na tabela", async () => {
    simularComputador();
    renderAdmin([makeQuote({ name: "Diogo Reis" })]);
    navTo(/Pedidos/);
    await waitFor(() => expect(screen.getByRole("table", { name: "Pedidos" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar pedido de Diogo Reis" }));
    expect(screen.getByText(/1 selecionado/)).toBeInTheDocument();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CONTACTOS DO PEDIDO, CORRIGÍVEIS DEPOIS DE O PEDIDO EXISTIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «se criarmos um pedido novo e não colocarmos um email, depois
 * quando quisermos alterar para colocar o email para enviarmos a proposta, não
 * conseguimos editar».
 *
 * Um pedido nascido de um telefonema entra sem email. Quem dava pela falta era
 * a rota do envio — gravava a proposta, não a mandava a ninguém, e respondia
 * «acrescenta o email e reenvia». Não havia por onde.
 */
describe("os contactos do pedido", () => {
  const abrir = async (over: Partial<Quote> = {}) => {
    const quote = makeQuote({ id: "LQ-900", name: "Rui Costa", email: "", phone: "", ...over });
    renderAdmin([quote]);
    navTo(/Pedidos/);
    abrirOPainelDoPedido("Rui Costa");
    await screen.findByRole("button", { name: "Fechar" });
    return quote;
  };

  it("um pedido sem email diz o que isso custa, em vez de não dizer nada", async () => {
    await abrir();
    expect(
      screen.getByText(/não é enviada a ninguém/i),
      "o painel não avisa que a proposta não vai seguir",
    ).toBeInTheDocument();
  });

  it("o email escreve-se e grava-se — era isto que não havia", async () => {
    await abrir();
    const campo = screen.getByPlaceholderText("para onde a proposta segue…");
    fireEvent.change(campo, { target: { value: "rui@example.pt" } });

    const guardar = screen.getByRole("button", { name: /^Guardar alterações$/ });
    fireEvent.click(guardar);

    await waitFor(() => {
      const chamada = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => String(c[0]) === "/api/orcamento/LQ-900" && c[1]?.method === "PATCH",
      );
      expect(chamada, "não foi gravado nada").toBeTruthy();
      expect(JSON.parse(String(chamada![1].body)).email).toBe("rui@example.pt");
    });
  });

  it("com email, o aviso desaparece", async () => {
    await abrir({ email: "ja@tenho.pt" });
    expect(screen.queryByText(/não é enviada a ninguém/i)).not.toBeInTheDocument();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PAINEL NÃO PODE NASCER SUJO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Alterações por guardar» tem um custo: fecha o pedido com uma pergunta,
 * trava a saída da página, e acende a barra de gravação. Quando aparece sem
 * ninguém ter escrito nada, ensina-se a fechar a pergunta sem ler — e no dia
 * em que há mesmo trabalho por gravar, ela fecha-a na mesma.
 *
 * Dois caminhos davam isso, os dois por comparações que não batiam certo com
 * as que a gravação faz.
 */
describe("o painel do pedido e as «alterações por guardar»", () => {
  const abrir = async (over: Partial<Quote>) => {
    const quote = makeQuote({ id: "LQ-800", name: "Rita Nunes", ...over });
    renderAdmin([quote]);
    navTo(/Pedidos/);
    abrirOPainelDoPedido("Rita Nunes");
    await screen.findByRole("button", { name: "Fechar" });
  };

  /**
   * Um preço de ZERO é um preço escrito — a criação manual chega a gravá-lo,
   * ao aparar um valor negativo. Lido como «sem preço», o campo abria vazio e
   * a comparação dava diferente.
   */
  it("um pedido com preço zero abre limpo", async () => {
    await abrir({ quotedPrice: 0 });
    expect(screen.queryByText(/Alterações por guardar/)).not.toBeInTheDocument();
  });

  /**
   * O corpo do PATCH compara os contactos e o local TRIMADOS. Se a conta do
   * «por guardar» os comparasse crus, um espaço a mais deixava o painel a
   * pedir para gravar uma alteração que a gravação não encontrava: respondia
   * «já está tudo guardado» e a barra nunca limpava.
   */
  it("um espaço a mais no fim de um campo não conta como alteração", async () => {
    await abrir({ location: "Évora", name: "Rita Nunes", email: "", phone: "" });
    const local = screen.getByPlaceholderText("Local do evento…");
    fireEvent.change(local, { target: { value: "Évora " } });
    expect(screen.queryByText(/Alterações por guardar/)).not.toBeInTheDocument();

    // E uma alteração a sério continua a contar.
    fireEvent.change(local, { target: { value: "Estremoz" } });
    expect(await screen.findByText(/Alterações por guardar/)).toBeInTheDocument();
  });
});

/**
 * ── OS ATALHOS DE UMA TECLA E AS JANELAS ABERTAS ──────────────────────────
 *
 * Os atalhos globais só se calavam com o cursor dentro de um campo. Com uma
 * janela aberta — os atalhos, o glossário — o foco está num BOTÃO (o «×» de
 * fechar, para onde a armadilha de foco o leva), e um botão não é um campo:
 * o «n» chegava ao ouvinte global e abria o «Novo pedido» POR BAIXO da janela
 * que estava à frente. Ela via um formulário que não pediu, ao lado de um que
 * já não conseguia fechar de uma vez.
 *
 * A regra é a mesma para todas as janelas do turno: enquanto houver uma
 * aberta, uma tecla solta não muda o que está por trás dela.
 */
describe("atalhos de teclado com uma janela aberta", () => {
  const abrirJanela = async (nome: RegExp) => {
    renderAdmin([makeQuote({ name: "Sara Lopes" })]);
    const sidebar = screen.getByRole("complementary");
    fireEvent.click(within(sidebar).getByRole("button", { name: nome }));
    return await screen.findByRole("dialog");
  };

  it("o «n» não abre o «Novo pedido» por baixo dos atalhos", async () => {
    const janela = await abrirJanela(/^Atalhos$/);
    // O foco vai para o × de fechar — que é um <button>, não um campo.
    const fechar = within(janela).getByRole("button", { name: "Fechar" });
    fechar.focus();

    fireEvent.keyDown(fechar, { key: "n" });

    expect(screen.queryByRole("heading", { name: "Novo pedido" })).not.toBeInTheDocument();
    // E a janela que estava à frente continua a ser a única.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("o «n» não abre o «Novo pedido» por baixo do glossário", async () => {
    const janela = await abrirJanela(/^Ajuda e glossário$/);
    const fechar = within(janela).getByRole("button", { name: "Fechar" });
    fechar.focus();

    fireEvent.keyDown(fechar, { key: "n" });

    expect(screen.queryByRole("heading", { name: "Novo pedido" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  /**
   * O mesmo resíduo pela outra porta: o acorde «g» + destino trocava a vista
   * por trás da janela. Fechá-la devolvia-a a um sítio onde ela não pediu para
   * estar — e sem nada no ecrã a explicar porquê.
   */
  it("o acorde «g» não troca a vista por trás da janela", async () => {
    const janela = await abrirJanela(/^Atalhos$/);
    const fechar = within(janela).getByRole("button", { name: "Fechar" });
    fechar.focus();

    fireEvent.keyDown(fechar, { key: "g" });
    fireEvent.keyDown(fechar, { key: "t" });

    fireEvent.click(fechar);
    expect(screen.getByRole("heading", { name: "Visão Geral" })).toBeInTheDocument();
    expect(screen.queryByTestId("view-tarefas")).not.toBeInTheDocument();
  });

  /** E o Escape continua a fechar a janela — o atalho que tem de passar. */
  it("o Escape continua a fechar a janela", async () => {
    const janela = await abrirJanela(/^Atalhos$/);
    fireEvent.keyDown(within(janela).getByRole("button", { name: "Fechar" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SELECÇÃO EM LOTE NÃO PODE AGIR SOBRE O QUE ELA NÃO VÊ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A barra de lote contava `selectedIds` cru — a selecção inteira, incluindo os
 * pedidos que o filtro ou a procura tinham entretanto tirado do ecrã. As duas
 * acções inofensivas (exportar, email) já se limitavam ao que estava à vista;
 * as duas que MEXEM não: «Marcar como» e «Apagar (N)» corriam a lista toda.
 *
 * O percurso: escolhem-se três pedidos, escreve-se um nome na procura para
 * conferir um deles, e a barra continua a dizer «3 selecionados». O «Apagar»
 * pergunta «Apagar 3 pedidos definitivamente?» com um único pedido no ecrã — e
 * apaga, para sempre, dois que ela não vê. O número que a barra mostra tem de
 * ser o mesmo número sobre que os botões agem.
 */
describe("a selecção em lote e o que está à vista", () => {
  const seleccionar = (nome: string) =>
    fireEvent.click(screen.getByRole("checkbox", { name: `Selecionar pedido de ${nome}` }));

  const procurar = (texto: string) =>
    fireEvent.change(screen.getByLabelText(/Procurar pedidos/), { target: { value: texto } });

  beforeEach(() => {
    renderAdmin([
      makeQuote({ id: "LQ-101", name: "Ana Marques" }),
      makeQuote({ id: "LQ-102", name: "Bruno Dias" }),
      makeQuote({ id: "LQ-103", name: "Carla Nunes" }),
    ]);
    navTo(/Pedidos/);
    seleccionar("Ana Marques");
    seleccionar("Bruno Dias");
    seleccionar("Carla Nunes");
    expect(screen.getByText(/3 selecionados/)).toBeInTheDocument();
  });

  it("a contagem passa a ser a dos pedidos que continuam no ecrã", async () => {
    procurar("Ana");
    await waitFor(() => expect(screen.queryByText("Bruno Dias")).not.toBeInTheDocument());

    expect(screen.getByText(/1 selecionado$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apagar (1)" })).toBeInTheDocument();
  });

  it("apagar só apaga o que ela tem à frente", async () => {
    procurar("Ana");
    await waitFor(() => expect(screen.queryByText("Bruno Dias")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^Apagar \(/ }));

    /**
     * A pergunta deixou de ser um `window.confirm` e passou a NOMEAR os
     * pedidos — «Apagar 12 pedidos?» é um número que não se consegue
     * verificar, e a única maneira de o confirmar era cancelar e contar à
     * mão. Ver `PerguntaDestrutiva`.
     *
     * O que este teste mede continua a ser o mesmo, e fica melhor medido: o
     * lote alcança só o que está à frente dela, e agora isso lê-se na própria
     * pergunta.
     */
    const caixa = await screen.findByRole("dialog");
    expect(within(caixa).getByText(/Apagar 1 pedido\?/i)).toBeInTheDocument();
    expect(within(caixa).getByText("Ana Marques")).toBeInTheDocument();
    expect(within(caixa).queryByText("Bruno Dias")).toBeNull();
    fireEvent.click(within(caixa).getByRole("button", { name: /^Apagar 1 pedido$/i }));

    const apagados = () =>
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
        .filter((args) => (args[1] as RequestInit | undefined)?.method === "DELETE")
        .map((args) => String(args[0]));
    await waitFor(() => expect(apagados().length).toBeGreaterThan(0));
    expect(apagados()).toEqual(["/api/orcamento/LQ-101"]);
  });

  it("«marcar como» também não alcança o que saiu do ecrã", async () => {
    procurar("Ana");
    await waitFor(() => expect(screen.queryByText("Bruno Dias")).not.toBeInTheDocument());

    escolherJa(screen.getByLabelText("Marcar pedidos selecionados como"), "Proposta enviada");

    const tocados = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter((args) => (args[1] as RequestInit | undefined)?.method === "PATCH")
      .map((args) => String(args[0]));
    await waitFor(() => expect(tocados.length).toBeGreaterThan(0));
    expect(tocados).toEqual(["/api/orcamento/LQ-101"]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM PREÇO DE ZERO É UM PREÇO ESCRITO — TAMBÉM QUANDO VEM DO ESTÚDIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel já sabia disto ao ABRIR o pedido (ver `textoDoPreco`). O caminho de
 * volta do estúdio de propostas ficou com a conversão antiga, pela verdade do
 * valor: gravado um total de 0 €, o campo «Preço final» ficava VAZIO enquanto o
 * pedido tinha 0. Vazio não é 0, e a barra passava a dizer «Alterações por
 * guardar» sobre uma alteração que ela não fez — a pedir para gravar o que o
 * estúdio acabou de gravar, e a travar o fecho do separador por causa disso.
 */
describe("o preço que volta do estúdio de propostas", () => {
  it("um total de zero enche o campo com 0, e não deixa o painel sujo", async () => {
    renderAdmin([makeQuote({ id: "LQ-700", name: "Inês Prado", quotedPrice: 5000 })]);
    navTo(/Pedidos/);
    abrirOPainelDoPedido("Inês Prado");
    await screen.findByRole("button", { name: "Fechar" });
    expect(screen.queryByText(/Alterações por guardar/)).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "estúdio gravou 0 €" }));

    expect(screen.getByDisplayValue("0")).toBeInTheDocument();
    expect(screen.queryByText(/Alterações por guardar/)).not.toBeInTheDocument();
  });
});
