// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { escolherJa } from "./ui/escolher.testkit";
import { render, screen, within, cleanup, fireEvent, act } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";
import { ATRASO_DA_GRAVACAO } from "./useGravacaoAutomatica";
import { RegistoDeGravacoesProvider } from "./registo-de-gravacoes";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PAINEL DO PEDIDO GRAVA SOZINHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que acontecia: escreviam-se três mil caracteres nas notas internas, tocava
 * o telefone, fechava-se o separador — e não tinha sido enviado nada. As
 * alterações viviam em estado do React até alguém carregar em «Guardar», o
 * `discardGuard` só corria em gestos DENTRO da aplicação, e um `beforeunload`
 * não havia nenhum.
 *
 * Estes testes prendem as quatro coisas que passam a valer:
 *   · o que se ESCREVE grava-se sozinho, e só o que foi tocado é enviado;
 *   · o que é uma DECISÃO (o estado do pedido) continua a exigir um clique;
 *   · fechar o separador com coisa por gravar avisa;
 *   · uma gravação recusada é DITA — nunca um visto verde a mentir.
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

function makeQuote(over: Partial<Quote> = {}): Quote {
  return {
    id: "LQ-001",
    submittedAt: "2026-05-01T10:00:00.000Z",
    lastUpdated: "2026-05-01T10:00:00.000Z",
    status: "pendente",
    name: "Ana Marques",
    email: "ana@example.com",
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
    adminNotes: "",
    priceBreakdown: PRICE,
    ...over,
  } as Quote;
}

const cabecalhos = (mapa: Record<string, string>) => ({ get: (k: string) => mapa[k] ?? null });

/** Os PATCH que chegaram ao "servidor", pela ordem em que chegaram. */
let gravacoes: { id: string; corpo: Record<string, unknown> }[] = [];
/** O que o PATCH seguinte responde. `null` = responde bem. */
let recusarCom: number | null = null;
/** Quantas das próximas gravações caem por REDE — não por recusa do servidor.
 *  É o caso da quinta com 4G: a ligação aceita e nunca responde. */
let falharPorRede = 0;

function montar(quote: Quote, comRegisto = false) {
  const servidor = new Map<string, Quote>([[quote.id, quote]]);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const m = /^\/api\/orcamento\/([^?]+)$/.exec(String(url));
      const id = m ? decodeURIComponent(m[1]) : null;
      const pedido = id ? servidor.get(id) : undefined;

      if (init?.method === "PATCH" && pedido) {
        const corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
        gravacoes.push({ id: pedido.id, corpo });
        if (falharPorRede > 0) {
          falharPorRede -= 1;
          return Promise.reject(new TypeError("Failed to fetch"));
        }
        if (recusarCom) {
          return Promise.resolve({
            ok: false,
            status: recusarCom,
            headers: cabecalhos({}),
            json: () => Promise.resolve({ error: "não deu" }),
          });
        }
        const { activityLogAppend, ...campos } = corpo;
        void activityLogAppend;
        const actualizado = { ...pedido, ...campos } as Quote;
        servidor.set(pedido.id, actualizado);
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: cabecalhos({}),
          json: () => Promise.resolve(actualizado),
        });
      }

      if (pedido) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: cabecalhos({ "x-pedido": "completo" }),
          json: () => Promise.resolve(pedido),
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

  const painel = <AdminClient initialQuotes={[quote]} userName="Teste" />;
  return render(
    <ToastProvider>
      {comRegisto ? (
        // Exactamente como a página o monta: o registo POR FORA do painel. O
        // botão «Guardar tudo» já vive no cabeçalho, lá dentro — sem registo
        // não se desenha, e é por isso que os outros testes deste ficheiro
        // continuam a ver o cabeçalho tal e qual como o viam.
        <RegistoDeGravacoesProvider>{painel}</RegistoDeGravacoesProvider>
      ) : (
        painel
      )}
    </ToastProvider>,
  );
}

/** Abre o painel de detalhe do pedido — é onde tudo isto acontece. */
async function abrirPedido(nome = "Ana Marques") {
  const sidebar = screen.getByRole("complementary");
  fireEvent.click(within(sidebar).getByRole("button", { name: /Pedidos/ }));
  await act(async () => {
    fireEvent.click(screen.getByText(nome));
  });
  // Carregar no cliente leva ao ecrã de fazer a proposta; o painel abre-se daí.
  // Ver o duplo do `FazerProposta` no topo deste ficheiro.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Abrir o pedido$/ }));
  });
}

/** Deixa correr o relógio e as promessas que ele destranca. */
async function passar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const notas = () => screen.getByLabelText("Notas internas");

/** Põe no telemóvel um rascunho deste pedido, com os campos que se quiser
 *  diferentes do que o servidor tem. */
function semearRascunho(q: Quote, mudancas: Record<string, string>) {
  localStorage.setItem(
    `liquen-pedido-${q.id}`,
    JSON.stringify({
      id: q.id,
      em: new Date(Date.now() - 12 * 60000).toISOString(),
      campos: {
        preco: q.quotedPrice ? String(q.quotedPrice) : "",
        notas: q.adminNotes ?? "",
        estado: q.status,
        responsavel: q.assignedTo ?? "",
        motivoDePerda: q.lostReason ?? "",
        data: q.date ?? "",
        convidados: String(q.guests ?? ""),
        local: q.location ?? "",
        nome: q.name ?? "",
        email: q.email ?? "",
        telefone: q.phone ?? "",
        ...mudancas,
      },
    }),
  );
}

beforeEach(() => {
  gravacoes = [];
  recusarCom = null;
  falharPorRede = 0;
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Painel do pedido — o que se escreve grava-se sozinho", () => {
  it("escrever nas notas internas grava sem ninguém carregar em Guardar", async () => {
    montar(makeQuote());
    await abrirPedido();

    fireEvent.change(notas(), { target: { value: "Ligou a pedir mais mesas." } });
    expect(gravacoes).toHaveLength(0);

    await passar(ATRASO_DA_GRAVACAO + 50);

    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].corpo.adminNotes).toBe("Ligou a pedir mais mesas.");
  });

  /**
   * Duas pessoas no mesmo pedido escrevem por cima uma da outra porque o PATCH
   * aceita valores inteiros vindos do cliente. Gravar sozinho torna isso mais
   * frequente — por isso o que ninguém tocou não vai no pedido.
   */
  it("só vai o que foi tocado — o resto do pedido não segue na gravação", async () => {
    montar(makeQuote({ quotedPrice: 12500, assignedTo: "Catarina" }));
    await abrirPedido();

    fireEvent.change(notas(), { target: { value: "uma linha" } });
    await passar(ATRASO_DA_GRAVACAO + 50);

    const corpo = gravacoes[0].corpo;
    expect(Object.keys(corpo).filter((k) => k !== "activityLogAppend")).toEqual(["adminNotes"]);
    expect(corpo).not.toHaveProperty("status");
    expect(corpo).not.toHaveProperty("quotedPrice");
    expect(corpo).not.toHaveProperty("assignedTo");
    expect(corpo).not.toHaveProperty("guests");
  });

  it("escrever seguido não paga um pedido por tecla", async () => {
    montar(makeQuote());
    await abrirPedido();

    fireEvent.change(notas(), { target: { value: "u" } });
    fireEvent.change(notas(), { target: { value: "um" } });
    fireEvent.change(notas(), { target: { value: "uma" } });
    await passar(ATRASO_DA_GRAVACAO + 50);

    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].corpo.adminNotes).toBe("uma");
  });

  /**
   * O gesto que perdia trabalho: escrever a última linha e fechar o painel (ou
   * trocar de cliente) dentro dos 800 ms. O temporizador era cancelado com o
   * painel, e a linha nunca chegava a sair do ecrã.
   */
  it("fechar o painel dentro do adiamento grava o que ficou por gravar", async () => {
    montar(makeQuote());
    await abrirPedido();

    fireEvent.change(notas(), { target: { value: "a última linha" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });

    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].corpo.adminNotes).toBe("a última linha");
  });

  /**
   * Mudar o ESTADO de um pedido é uma decisão — muda a coluna do quadro, o que
   * conta como ganho, e o que a automação pode ou não fazer a seguir. Continua
   * a exigir um clique, e este teste é o que impede que isso mude por distração.
   */
  it("mudar o estado NÃO grava sozinho — é uma decisão, não um rascunho", async () => {
    montar(makeQuote());
    await abrirPedido();

    escolherJa(screen.getByLabelText("Estado"), "Proposta enviada");
    await passar(ATRASO_DA_GRAVACAO * 4);
    expect(gravacoes).toHaveLength(0);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Guardar alterações/ }));
    });
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].corpo.status).toBe("cotado");
  });
});

describe("Painel do pedido — o ecrã diz a verdade", () => {
  it("depois de gravar, o indicador diz a hora e o botão mostra que está guardado", async () => {
    montar(makeQuote());
    await abrirPedido();

    fireEvent.change(notas(), { target: { value: "escrito" } });
    await passar(ATRASO_DA_GRAVACAO + 50);

    expect(screen.getByText(/guardado às \d{2}:\d{2}/)).toBeInTheDocument();
    // O botão não desaparece — e diz a verdade: já está guardado.
    const botao = screen.getByRole("button", { name: /Guardad/ });
    expect(botao).toBeDisabled();
  });

  it("uma gravação recusada é dita, e não fica um visto verde a mentir", async () => {
    montar(makeQuote());
    await abrirPedido();
    recusarCom = 500;

    fireEvent.change(notas(), { target: { value: "isto não vai chegar" } });
    // O adiamento, mais as duas pausas entre as três tentativas.
    await passar(ATRASO_DA_GRAVACAO + 400 + 800 + 100);

    expect(gravacoes.length).toBeGreaterThan(1);
    expect(screen.getByText(/não chegou ao servidor/)).toBeInTheDocument();
    expect(screen.queryByText(/guardado às/)).not.toBeInTheDocument();
    // E o botão volta a estar disponível: é por onde ela tenta outra vez.
    expect(screen.getByRole("button", { name: /Tentar de novo|Guardar/ })).toBeEnabled();
  });

  it("uma gravação recusada não deita fora o que ela escreveu", async () => {
    montar(makeQuote());
    await abrirPedido();
    recusarCom = 503;

    fireEvent.change(notas(), { target: { value: "texto que tem de ficar no ecrã" } });
    await passar(ATRASO_DA_GRAVACAO + 400 + 800 + 100);

    expect(notas()).toHaveValue("texto que tem de ficar no ecrã");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PAINEL DO PEDIDO NO GESTO ÚNICO DO BACK OFFICE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O botão «Guardar tudo» do cabeçalho só pode falar por quem está inscrito no
 * registo. Estes testes prendem a inscrição deste painel — pelo NOME do pedido,
 * e com as duas metades dentro: o que grava sozinho e o que ainda espera por um
 * clique. Sem a segunda, o gesto único passava ao lado de trabalho feito.
 */
describe("Painel do pedido — inscrito no «Guardar tudo»", () => {
  const guardarTudo = () => screen.getByRole("button", { name: /guardar tudo|tudo guardado/i });

  it("com notas por gravar, o botão do cabeçalho conta-o e nomeia o pedido", async () => {
    montar(makeQuote(), true);
    await abrirPedido();

    await act(async () => {
      fireEvent.change(notas(), { target: { value: "três mil caracteres" } });
    });

    const botao = guardarTudo();
    expect(botao).toHaveAccessibleName(/guardar tudo \(1\)/i);
    expect(botao.getAttribute("title") ?? "").toContain("LQ-001");
  });

  /**
   * O estado do pedido é uma DECISÃO e continua a exigir um clique — mas é
   * trabalho feito à espera de um gesto, e o gesto único do back office tem de
   * o levar também. Era esta metade que ficava de fora.
   */
  it("uma alteração que exige clique é gravada pelo mesmo gesto", async () => {
    montar(makeQuote(), true);
    await abrirPedido();

    // Fora do `act`: dentro dele a lista só abria no fim, e a opção
    // ainda não estava lá para se carregar.
    escolherJa(screen.getByLabelText("Estado"), "Proposta enviada");
    await act(async () => {});
    expect(guardarTudo()).toHaveAccessibleName(/guardar tudo \(1\)/i);

    await act(async () => {
      fireEvent.click(guardarTudo());
    });
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].corpo.status).toBe("cotado");
    // E a resposta é a do gesto único, com o nome do pedido lá dentro.
    expect(screen.getByText(/está tudo guardado no servidor/i)).toBeInTheDocument();
    expect(screen.getByText(/^Pedido LQ-001/)).toBeInTheDocument();
  });

  it("sem nada por gravar, o cabeçalho está calmo", async () => {
    montar(makeQuote(), true);
    await abrirPedido();
    expect(guardarTudo()).toHaveAccessibleName(/tudo guardado/i);
  });
});

describe("Painel do pedido — fechar o separador", () => {
  function fecharSeparador() {
    const evento = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(evento);
    return evento.defaultPrevented;
  }

  it("com notas por gravar, fechar o separador avisa", async () => {
    montar(makeQuote());
    await abrirPedido();

    await act(async () => {
      fireEvent.change(notas(), { target: { value: "três mil caracteres" } });
    });
    expect(fecharSeparador()).toBe(true);
  });

  it("com uma alteração que ainda exige clique, fechar o separador também avisa", async () => {
    montar(makeQuote());
    await abrirPedido();

    // Fora do `act`: dentro dele a lista só abria no fim, e a opção
    // ainda não estava lá para se carregar.
    escolherJa(screen.getByLabelText("Estado"), "Proposta enviada");
    await act(async () => {});
    expect(fecharSeparador()).toBe(true);
  });

  it("com tudo guardado, fechar o separador não pergunta nada", async () => {
    montar(makeQuote());
    await abrirPedido();

    fireEvent.change(notas(), { target: { value: "escrito e guardado" } });
    await passar(ATRASO_DA_GRAVACAO + 50);

    expect(fecharSeparador()).toBe(false);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE NÃO GRAVA SOZINHO NÃO PODE PERDER-SE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As notas gravam sozinhas. O preço, a data, os convidados, o local e os
 * contactos não — só saem do telemóvel quando ela carrega em «Guardar». E o
 * travão que havia, um `beforeunload`, é quase decorativo num iPhone: o Safari
 * descarta separadores em segundo plano sem o correr. Atender o telefone chega
 * para perder a tarde.
 *
 * Duas metades, e as duas são precisas: o botão passa a insistir quando a rede
 * falha, e o que está escrito fica no telemóvel até chegar mesmo ao servidor.
 */
describe("Painel do pedido — o que se perdia", () => {
  const preco = () => screen.getByPlaceholderText("Ex.: 12500");
  const guardar = () => screen.getByRole("button", { name: /^Guardar alterações$/ });

  it("uma falha de rede no «Guardar» não desiste à primeira", async () => {
    // O caso da quinta: a ligação aceita e não responde. Antes disto, o botão
    // fazia um `fetch` cru — uma falha e acabou, com o trabalho só no ecrã.
    montar(makeQuote());
    await abrirPedido();
    falharPorRede = 2;

    fireEvent.change(preco(), { target: { value: "4321" } });
    fireEvent.click(guardar());
    // A repetição espera entre tentativas (400ms, depois 800ms).
    await passar(3000);

    expect(gravacoes.length, "tentou uma vez só").toBeGreaterThanOrEqual(3);
    expect(gravacoes[gravacoes.length - 1].corpo.quotedPrice).toBe(4321);
  });

  it("o que se escreve fica no telemóvel antes de chegar ao servidor", async () => {
    const q = makeQuote();
    montar(q);
    await abrirPedido();

    fireEvent.change(preco(), { target: { value: "4321" } });
    await passar(1000);

    const guardado = JSON.parse(localStorage.getItem(`liquen-pedido-${q.id}`) ?? "null");
    expect(guardado?.campos?.preco).toBe("4321");
    expect(gravacoes, "nada foi para o servidor — é esse o ponto").toHaveLength(0);
  });

  it("e deixa de ficar quando chega mesmo", async () => {
    const q = makeQuote();
    montar(q);
    await abrirPedido();

    fireEvent.change(preco(), { target: { value: "4321" } });
    await passar(1000);
    expect(localStorage.getItem(`liquen-pedido-${q.id}`)).not.toBeNull();

    fireEvent.click(guardar());
    await passar(1000);

    // Uma rede de segurança que sobrevive ao perigo é um aviso falso na
    // abertura seguinte.
    expect(localStorage.getItem(`liquen-pedido-${q.id}`)).toBeNull();
  });

  it("ao reabrir, diz o que ficou por gravar — e diz QUAL campo", async () => {
    const q = makeQuote();
    semearRascunho(q, { preco: "9999" });
    montar(q);
    await abrirPedido();

    expect(screen.getByText(/Ficou por gravar o preço deste pedido/)).toBeInTheDocument();
  });

  /**
   * SE O SERVIDOR JÁ TEM O MESMO, NÃO SE PERGUNTA NADA.
   *
   * Ela pode ter gravado noutro sítio entretanto. Uma barra a perguntar por
   * uma diferença que não existe é ruído — e ruído numa barra destas ensina a
   * carregar em «Descartar» sem ler, que é como se perde a próxima a sério.
   */
  it("um rascunho igual ao que o servidor tem não incomoda ninguém", async () => {
    const q = makeQuote();
    semearRascunho(q, {});
    montar(q);
    await abrirPedido();

    expect(screen.queryByText(/Ficou por gravar/)).toBeNull();
  });

  it("«Recuperar» põe no ecrã e NÃO grava — a decisão continua a ser dela", async () => {
    const q = makeQuote();
    semearRascunho(q, { preco: "9999" });
    montar(q);
    await abrirPedido();

    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));

    expect(preco()).toHaveValue("9999");
    expect(gravacoes, "recuperar não é gravar").toHaveLength(0);
    expect(screen.queryByText(/Ficou por gravar/)).toBeNull();
  });

  it("«Descartar» esquece de vez", async () => {
    const q = makeQuote();
    semearRascunho(q, { preco: "9999" });
    montar(q);
    await abrirPedido();

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    await passar(1000);

    expect(screen.queryByText(/Ficou por gravar/)).toBeNull();
    expect(localStorage.getItem(`liquen-pedido-${q.id}`)).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CADA RÓTULO LIGADO AO SEU CAMPO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Eram dez rótulos soltos: por cima de um campo, a dizer o que ele é, e sem
 * nada que o dissesse ao browser. Duas consequências, e a segunda nota-se
 * todos os dias — quem usa leitor de ecrã ouvia «edit text» sem saber de quê,
 * e tocar no rótulo não fazia nada, quando um rótulo ligado põe o cursor no
 * campo. Num telemóvel isso duplica o alvo de cada campo sem mexer no desenho.
 *
 * Este teste consulta os campos como uma pessoa os vê: pelo que está escrito
 * por cima deles. Se alguém acrescentar um campo com o rótulo solto — ou puser
 * um `aria-label` a dizer outra coisa que o texto visível — fica vermelho aqui.
 */
describe("Painel do pedido — os rótulos", () => {
  it.each([
    "Estado",
    "Preço final (sem IVA) €",
    "Data do evento",
    "Convidados",
    "Responsável",
    "Local",
    "Nome do cliente",
    "Email",
    "Telefone",
    "Notas internas",
  ])("«%s» encontra o seu campo", async (rotulo) => {
    montar(makeQuote());
    await abrirPedido();
    expect(screen.getByLabelText(rotulo)).toBeInTheDocument();
  });

  it("e o que o leitor de ecrã diz é o que está escrito no ecrã", async () => {
    // Um `aria-label` SUBSTITUI o rótulo visível — e deixa os dois livres para
    // divergirem sem ninguém dar por isso. Era o caso: «Estado» no ecrã e
    // «Estado do pedido» no leitor.
    montar(makeQuote());
    await abrirPedido();
    const estado = screen.getByLabelText("Estado");
    expect(estado.getAttribute("aria-label")).toBeNull();
  });
});

/**
 * «Tem que haver no site todo, em tudo aquilo que se faz, uma forma de voltar
 * atrás» (10/10). O «Anular» do «Guardar» só repunha o estado; passa a repor
 * TODOS os campos que o gesto mudou, com os valores de antes.
 */
describe("Painel do pedido — «Anular» depois de «Guardar alterações»", () => {
  it("repõe o preço e o local que estavam, e escreve no histórico", async () => {
    montar(makeQuote({ quotedPrice: 1000, location: "Évora" }));
    await abrirPedido();

    fireEvent.change(screen.getByPlaceholderText("Ex.: 12500"), { target: { value: "4321" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Guardar alterações$/ }));
    });
    await passar(500);
    expect(gravacoes.at(-1)?.corpo.quotedPrice).toBe(4321);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anular" }));
    });
    await passar(500);
    const inverso = gravacoes.at(-1)?.corpo ?? {};
    expect(inverso.quotedPrice).toBe(1000);
    // Só volta o que o gesto mudou — o local não foi tocado, não viaja.
    expect(inverso).not.toHaveProperty("location");
    expect(inverso).not.toHaveProperty("status");
    expect(JSON.stringify(inverso.activityLogAppend)).toMatch(/anuladas/);
    expect(screen.getByText("Anulado.")).toBeInTheDocument();
  });
});
