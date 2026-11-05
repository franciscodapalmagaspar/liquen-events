// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM SINAL A MENOS NÃO PODE LEVAR O RESTO DA GRAVAÇÃO À FRENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que acontecia: escrever `-50` em Convidados e carregar em «Guardar
 * alterações» dava 400 (`Too small: expected number to be >=0`), o ecrã dizia
 * «Não foi possível guardar as alterações» — sem dizer qual campo nem o que
 * estava mal —, a barra voltava a «Alterações por guardar», e TODAS as outras
 * alterações da mesma gravação (o estado, o email acabado de acrescentar)
 * ficavam por gravar. Carregar outra vez repetia a falha para sempre. O
 * `min={0}` do input era decorativo: nada era validado no cliente.
 *
 * O que passa a valer é a mesma regra do ecrã das definições: o que não se
 * consegue gravar é dito ANTES, no campo — e o que se consegue gravar não é
 * arrastado abaixo pelo que não se consegue.
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
    ...over,
  } as Quote;
}

const cabecalhos = (mapa: Record<string, string>) => ({ get: (k: string) => mapa[k] ?? null });

/** Os PATCH que chegaram ao "servidor", e se foram aceites por ele. */
let gravacoes: { corpo: Record<string, unknown>; aceite: boolean }[] = [];

/**
 * O servidor a sério, na parte que interessa: `guests` negativo é recusado com
 * 400 e com a mensagem que a rota já devolve hoje (`firstError` sobre o
 * `quoteUpdateSchema`, que é do Zod e vem em inglês).
 */
function montar(quote: Quote) {
  const servidor = new Map<string, Quote>([[quote.id, quote]]);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const m = /^\/api\/orcamento\/([^?]+)$/.exec(String(url));
      const id = m ? decodeURIComponent(m[1]) : null;
      const pedido = id ? servidor.get(id) : undefined;

      if (init?.method === "PATCH" && pedido) {
        const corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
        const recusado = typeof corpo.guests === "number" && corpo.guests < 0;
        gravacoes.push({ corpo, aceite: !recusado });
        if (recusado) {
          return Promise.resolve({
            ok: false,
            status: 400,
            headers: cabecalhos({}),
            json: () => Promise.resolve({ error: "Too small: expected number to be >=0" }),
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
  return render(
    <ToastProvider>
      <AdminClient initialQuotes={[quote]} userName="Teste" />
    </ToastProvider>,
  );
}

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

/** O campo dos convidados — o único `number` do painel. */
const campoConvidados = () =>
  document.querySelector('input[type="number"]') as HTMLInputElement | null;

const campoEmail = () => document.querySelector('input[type="email"]') as HTMLInputElement;

async function guardar() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Guardar alterações/ }));
  });
}

/** Todos os `guests` que chegaram ao servidor nesta sessão. */
const convidadosEnviados = () =>
  gravacoes.filter((g) => "guests" in g.corpo).map((g) => g.corpo.guests);

beforeEach(() => {
  gravacoes = [];
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Convidados negativo", () => {
  it("é dito no campo enquanto se escreve, sem esperar pelo clique", async () => {
    montar(makeQuote());
    await abrirPedido();

    const campo = campoConvidados()!;
    await act(async () => {
      fireEvent.change(campo, { target: { value: "-50" } });
    });

    expect(screen.getByText(/não pode ser negativo/i)).toBeTruthy();
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    // Nada foi tentado — a frase chega antes de o pedido sair.
    expect(gravacoes).toHaveLength(0);
  });

  /**
   * O caso que ela viu: mudar o email E os convidados na mesma gravação. O
   * número não serve; o email serve. Perder o email por causa do sinal a menos
   * é desproporcionado — e é exactamente o que acontecia.
   */
  it("não leva o resto da gravação à frente: o email fica guardado", async () => {
    montar(makeQuote());
    await abrirPedido();

    await act(async () => {
      fireEvent.change(campoEmail(), { target: { value: "novo@example.com" } });
      fireEvent.change(campoConvidados()!, { target: { value: "-50" } });
    });
    await guardar();

    // 1) O email chegou ao servidor E foi aceite por ele. Ir no mesmo pedido
    //    que o servidor recusa não conta: era assim que se perdia.
    expect(gravacoes.some((g) => g.aceite && g.corpo.email === "novo@example.com")).toBe(true);
    // 2) O número recusado nunca foi enviado — nem o registo de atividade o
    //    anunciou como se tivesse acontecido.
    expect(convidadosEnviados()).toEqual([]);
    const registos = gravacoes.flatMap(
      (g) => (g.corpo.activityLogAppend as { summary?: string }[] | undefined) ?? [],
    );
    expect(registos.some((e) => (e.summary ?? "").includes("Convidados"))).toBe(false);
    // 3) O que ela escreveu continua no campo, com a frase que diz o que fazer
    //    (repetida no aviso do clique, daí o `getAll`).
    expect(campoConvidados()!.value).toBe("-50");
    expect(screen.getAllByText(/não pode ser negativo/i).length).toBeGreaterThan(0);
    // 4) E o recado nomeia o campo — nada de «Não foi possível guardar as
    //    alterações» sobre um pedido que gravou quase tudo.
    expect(screen.getByText(/Convidados não ficou guardado/)).toBeTruthy();
    expect(screen.queryByText("Não foi possível guardar as alterações")).toBeNull();
  });

  it("corrigido o número, grava-se como qualquer outro", async () => {
    montar(makeQuote());
    await abrirPedido();

    await act(async () => {
      fireEvent.change(campoConvidados()!, { target: { value: "-50" } });
    });
    await act(async () => {
      fireEvent.change(campoConvidados()!, { target: { value: "60" } });
    });
    expect(screen.queryByText(/não pode ser negativo/i)).toBeNull();

    await guardar();
    expect(convidadosEnviados()).toEqual([60]);
  });

  /**
   * ── O CAMPO EM BRANCO ────────────────────────────────────────────────────
   *
   * Apagar um número que lá estava é uma edição a meio, não uma instrução: se
   * o ecrã mostra o campo vazio e o servidor continua com 80, o ecrã está a
   * mentir. Diz-se, e não se grava o velho por baixo em silêncio.
   */
  it("apagar um número que lá estava é dito, não gravado por baixo", async () => {
    montar(makeQuote({ guests: 80 }));
    await abrirPedido();

    await act(async () => {
      fireEvent.change(campoConvidados()!, { target: { value: "" } });
    });
    expect(screen.getByText(/Escreve o número de convidados/)).toBeTruthy();

    await guardar();
    expect(convidadosEnviados()).toEqual([]);
    expect(campoConvidados()!.value).toBe("");
  });

  /**
   * Mas um pedido que ENTROU sem número de convidados (um telefonema, uma
   * referência de terceiros) continua a poder ficar assim: reclamar de um campo
   * que ninguém tocou seria travar gravações que não têm problema nenhum.
   */
  it("um pedido que nunca teve convidados não reclama de um campo vazio", async () => {
    montar(makeQuote({ guests: undefined as unknown as number }));
    await abrirPedido();

    expect(campoConvidados()!.value).toBe("");
    expect(screen.queryByText(/Escreve o número de convidados/)).toBeNull();

    await act(async () => {
      fireEvent.change(campoEmail(), { target: { value: "novo@example.com" } });
    });
    await guardar();

    expect(gravacoes.some((g) => g.aceite && g.corpo.email === "novo@example.com")).toBe(true);
    expect(convidadosEnviados()).toEqual([]);
  });

  /**
   * O servidor já sabe dizer o que está mal — `Too small: expected number to
   * be >=0`. Era deitada fora e substituída por uma frase que não diz nada.
   * Passa a ser aproveitada; em português, porque quem está a trabalhar não
   * tem de ler texto de biblioteca em inglês.
   */
  it("uma recusa do servidor é dita em português, e não em genérico", async () => {
    montar(makeQuote());
    await abrirPedido();

    // Pela porta do teclado: um valor que o cliente não apanha (o campo é
    // `number`, mas o estado é texto) e que o servidor recusa.
    await act(async () => {
      fireEvent.change(campoEmail(), { target: { value: "outro@example.com" } });
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          headers: cabecalhos({}),
          json: () => Promise.resolve({ error: "Too small: expected number to be >=0" }),
        }),
      ),
    );
    await guardar();

    expect(screen.queryByText(/expected number/i)).toBeNull();
    expect(screen.getByText(/não pode ser inferior a 0/i)).toBeTruthy();
  });
});
