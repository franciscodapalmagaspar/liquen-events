// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";
import { BARRA_INFERIOR, CORE_NAV, MORE_NAV, NAV } from "./nav";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A BARRA É O MENU — E O MENU DEIXOU DE SER UMA COLUNA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, com duas capturas — a Dock do Mac e a barra do iOS 26:
 * «quero isto tudo em liquid glass também no desktop (…) e quero que o menu
 * fique igual ao do mac ios em baixo com a barra liquid glass».
 *
 * Posta a escolha entre a barra CONVIVER com a coluna da esquerda ou
 * SUBSTITUÍ-LA, ela escolheu substituir. A cápsula que flutua deixou de ser do
 * telemóvel e passou a ser o menu do back office nas duas larguras; a coluna
 * passou a uma gaveta com o logótipo, a conta, a ajuda e as quatro acções.
 *
 * ── O QUE ESTE FICHEIRO ERA, E PORQUE É QUE MUDOU DE NOME ─────────────────
 *
 * Era o `AdminClient.menu-recolhido.test.tsx`, e guardava uma cruz que
 * encolhia a coluna a zero no computador — pedido dela: «quando carregamos em
 * fazer proposta o menu oculte-se automaticamente», porque os 256 px da coluna
 * comiam o ecrã do estúdio.
 *
 * Esse pedido está agora cumprido SEMPRE e sem estado nenhum: não há coluna
 * para recolher, portanto o estúdio tem a largura toda em todas as vistas. O
 * `menuRecolhido`, as duas gravações por aparelho, o efeito que o ligava e as
 * duas cruzes saíram inteiros. O ficheiro fica, com o nome do que passou a
 * guardar — a promessa é a mesma vista do outro lado.
 *
 * ── PORQUE É QUE LÊ CLASSES E NÃO MEDE PÍXEIS ────────────────────────────
 *
 * O jsdom não faz contas de layout: `getBoundingClientRect` devolve zeros e
 * `lg:` nunca é verdade. Um teste que aqui medisse larguras media zero e
 * passava sempre. O que se prende é a DECISÃO — que destino nenhum aparece
 * duas vezes no mesmo ecrã, e que a barra os tem todos. Quem mede a sério é o
 * passeio do Playwright.
 */

vi.mock("./lazy", () => {
  const stub = (name: string) => {
    const C = () => <div data-testid={`view-${name}`}>{name} stub</div>;
    C.displayName = `Lazy(${name})`;
    return C;
  };
  /** Um stub com UM campo de texto local: para provar que sobrevive a uma
   *  troca de separador (não voltaria a estar vazio se tivesse desmontado). */
  const stubComCampo = (name: string, rotulo: string) => {
    const C = () => (
      <div data-testid={`view-${name}`}>
        <label>
          {rotulo}
          <input aria-label={rotulo} defaultValue="" />
        </label>
      </div>
    );
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
    ClientMessenger: stubComCampo("client-messenger", "Rascunho da mensagem"),
    EventChecklist: stub("event-checklist"),
    EventMaterial: stub("event-material"),
    EventTimeline: stub("event-timeline"),
    PaymentsPanel: stub("payments-panel"),
    EventCosts: stub("event-costs"),
    GuestList: stub("guest-list"),
    TagsField: stub("tags-field"),
    FollowUpField: stub("follow-up-field"),
    ActivityLog: stub("activity-log"),
    EventTasks: stubComCampo("event-tasks", "Título da tarefa nova"),
    // A vista «Fazer proposta», que é o ecrã inteiro deste ficheiro.
    FazerProposta: stub("fazer-proposta"),
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

function montar(quote: Quote) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const m = /^\/api\/orcamento\/([^?]+)$/.exec(String(url));
      const id = m ? decodeURIComponent(m[1]) : null;
      if (id === quote.id) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: cabecalhos({ "x-pedido": "completo" }),
          json: () => Promise.resolve(quote),
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
      <AdminClient initialQuotes={[quote]} userName="Catarina" />
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * A cápsula que flutua. Chama-se «Navegação do back office» porque É a
 * navegação do back office — a coluna acabou, e o nome mudou-se atrás do
 * papel. Vinte sítios dos passeios do Playwright usam este nome para dizer
 * «já estou dentro»; deixá-lo na lista que passou a `lg:hidden` punha-os
 * todos à espera de uma coisa invisível.
 */
const barraDeBaixo = () => screen.getByRole("navigation", { name: "Navegação do back office" });
/** A gaveta. É `role="complementary"` — o `<aside>`. */
const gaveta = () => screen.getByRole("complementary");

/**
 * ── PELO NOME ACESSÍVEL, E NÃO PELO TEXTO VISÍVEL ─────────────────────────
 *
 * O rótulo visível da barra encurta no telemóvel («Visão» em vez de «Visão
 * Geral») para caber numa linha — é o que a faz ler-se como barra e não como
 * uma lista apertada, e é o que as referências que ela mandou fazem.
 *
 * O nome ACESSÍVEL não encurta: cada botão leva `aria-label` com o nome
 * inteiro, porque quem ouve o ecrã só tem a palavra. A identidade de um destino
 * é esse nome, e é por ele que estes casos passam a procurar.
 */
const nomeDe = (b: Element) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim();

describe("a barra de baixo é o menu do back office", () => {
  it("leva TODOS os destinos, e não só os quatro do dia", () => {
    montar(makeQuote());
    const naBarra = within(barraDeBaixo()).getAllByRole("button").map(nomeDe).filter(Boolean);
    const faltam = NAV.filter((n) => !naBarra.includes(n.label)).map((n) => n.label);
    expect(faltam, `destinos que a barra não tem: ${faltam.join(", ")}`).toEqual([]);
  });

  /**
   * ── E PELA ORDEM DA COLUNA, QUE É A QUE ELA TEM NOS DEDOS ──────────────
   *
   * Não é a ordem de declaração do `NAV`: medido no browser, essa dava «Visão
   * Geral · Pedidos · Calendário · Fazer proposta», e na coluna o «Fazer
   * proposta» é o terceiro. Mudar de sítio os destinos que ela toca de olhos
   * fechados era o custo mais caro desta mudança toda — e é um custo que não
   * era preciso pagar.
   */
  it("e pela ordem da coluna: primeiro o dia de trabalho, depois o resto", () => {
    montar(makeQuote());
    const naBarra = within(barraDeBaixo())
      .getAllByRole("button")
      .map(nomeDe)
      .filter((t): t is string => !!t);
    const esperada = [...CORE_NAV, ...MORE_NAV].map((id) => NAV.find((n) => n.id === id)!.label);
    expect(naBarra.slice(0, esperada.length)).toEqual(esperada);
  });

  /**
   * Os quatro do dia estão sempre visíveis; os outros oito nascem `hidden` e só
   * aparecem a partir de `lg`. É o que impede a cápsula de 390 px de tentar
   * repartir-se por doze.
   */
  it("e os que não são dos quatro do dia só aparecem no computador", () => {
    montar(makeQuote());
    // Por texto EXACTO e não por expressão: «Propostas» está dentro de
    // «Propostas Aceites», e uma busca solta devolvia duas.
    const botoes = within(barraDeBaixo()).getAllByRole("button");
    for (const item of NAV) {
      const botao = botoes.find((b) => nomeDe(b) === item.label);
      expect(botao, `«${item.label}» não está na barra`).toBeDefined();
      const soNoComputador = !BARRA_INFERIOR.includes(item.id);
      expect(
        botao!.className.includes("hidden lg:flex"),
        `«${item.label}» devia ${soNoComputador ? "" : "NÃO "}ser só do computador`,
      ).toBe(soNoComputador);
    }
  });

  /**
   * ── E A GAVETA DEIXOU DE REPETIR O QUE A BARRA JÁ TEM ──────────────────
   *
   * O mesmo destino em dois sítios do mesmo ecrã era a confusão que a regra do
   * `soNoComputador` já evitava do outro lado, quando a barra tinha quatro e a
   * gaveta o resto. Agora que a barra os tem todos, é a LISTA DA GAVETA que
   * desaparece a partir de `lg`.
   */
  it("a lista de destinos da gaveta esconde-se no computador", () => {
    montar(makeQuote());
    const lista = within(gaveta()).getByRole("navigation", { name: "Mais destinos" });
    expect(
      lista.className,
      "a gaveta voltou a mostrar destinos no computador — a barra já os tem",
    ).toContain("lg:hidden");
  });

  it("e a gaveta é uma gaveta nas duas larguras — já não é coluna", () => {
    montar(makeQuote());
    const c = gaveta().className;
    expect(c, "a gaveta voltou a ser coluna encostada no computador").not.toMatch(/lg:sticky/);
    expect(c, "a gaveta volta a ficar sempre aberta no computador").not.toMatch(/lg:translate-x-0/);
    expect(c, "voltou a existir a coluna que se encolhe a zero").not.toMatch(/lg:w-0/);
  });
});

describe("o destino onde ela está levanta-se do vidro", () => {
  /**
   * A cor NÃO muda com o relevo, e é de propósito: a lavagem opaca é o que faz
   * o acento medir 5,19:1 mesmo quando o que passa através do vidro é uma
   * fotografia escura, e essa conta está prendida no `barra-que-flutua`. O que
   * se acrescenta é sombra e fio — relevo, não repintura.
   */
  it("com sombra e fio, e sem trocar a cor que aguenta o contraste", () => {
    montar(makeQuote());
    const activo = within(barraDeBaixo()).getByRole("button", { name: /Visão Geral/i });
    expect(activo.getAttribute("aria-current")).toBe("page");
    expect(activo.className, "a pastilha activa deixou de se levantar").toMatch(
      /shadow-\[var\(--bo-sombra-suspensa\)\]/,
    );
    expect(activo.className, "a pastilha activa perdeu o fio que a recorta").toMatch(/ring-1/);
    expect(activo.className, "a lavagem que segura o contraste foi trocada").toContain(
      "bg-[var(--bo-accent-lavagem)]",
    );
  });
});
