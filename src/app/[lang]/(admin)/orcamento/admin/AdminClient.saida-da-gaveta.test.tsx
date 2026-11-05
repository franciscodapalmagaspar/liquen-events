// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";
import { SAIDA_MS } from "./ui/saida";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GAVETA DO PEDIDO DEIXA DE FECHAR A SECO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O véu acendia em 240 ms e a gaveta desaparecia num fotograma — os dois, no
 * instante em que `selected` passava a `null`. Este ficheiro guarda o CICLO DE
 * VIDA da saída, que é a parte que o CSS não pode fazer sozinho: o nó fica
 * montado os 200 ms, com a classe certa desde o PRIMEIRO fotograma, e só
 * depois desaparece.
 *
 * A geometria não está aqui — o jsdom não tem disposição nenhuma e todo o
 * `getBoundingClientRect` dá zero. O que se vê está medido num Chromium, no
 * `e2e/entrada-da-gaveta.mjs`. O vocabulário está no
 * `entrada-do-painel-do-pedido.test.ts`.
 *
 * ── PORQUE É QUE ESTE FICHEIRO PRECISA DE UM ECRÃ DE TELEMÓVEL ────────────
 *
 * Porque a saída é da GAVETA e não da coluna do computador, e essa é uma
 * decisão e não um acidente: abaixo de `xl` o painel está FORA de fluxo e não
 * deixa espaço atrás de si; a partir de `xl` é uma coluna dentro da grelha, e
 * segurá-la 200 ms só adiava o salto da lista para a largura toda. A razão por
 * extenso está no `sairDoPainel`, no `AdminClient.tsx`.
 *
 * Sem o duplo do `matchMedia` este ficheiro media o ecrã errado e passava com
 * e sem a correcção — que é a pior espécie de teste, porque parece que prova.
 */

vi.mock("./lazy", () => {
  const stub = (name: string) => {
    const C = () => <div data-testid={`view-${name}`}>{name} stub</div>;
    C.displayName = `Lazy(${name})`;
    return C;
  };
  return {
    /**
     * A lista de Pedidos leva ao ecrã de fazer a proposta; o painel abre-se de
     * lá, no «Abrir o pedido». O duplo dá essa porta sem montar o ecrã inteiro
     * — é o mesmo que o `AdminClient.test.tsx` usa, e pela mesma razão.
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

let seq = 0;
function pedido(over: Partial<Quote> = {}): Quote {
  seq += 1;
  return {
    id: `LQ-${String(seq).padStart(3, "0")}`,
    submittedAt: "2026-05-01T10:00:00.000Z",
    lastUpdated: "2026-05-01T10:00:00.000Z",
    status: "pendente",
    name: `Cliente ${seq}`,
    email: `cliente${seq}@example.com`,
    category: "particulares",
    eventType: "casamentos",
    date: "2026-09-20",
    location: "Évora",
    guests: 80,
    ...over,
  } as Quote;
}

const servidor = new Map<string, Quote>();
const cabecalhos = (mapa: Record<string, string>) => ({ get: (k: string) => mapa[k] ?? null });

/**
 * Um `matchMedia` que diz «isto é um telemóvel».
 *
 * O que o `AdminClient` pergunta e que aqui importa é `(max-width: 1279px)` —
 * é essa que decide se o painel é gaveta ou coluna.
 */
function ecraDeTelemovel() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: /max-width/.test(query),
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

/**
 * A gaveta — pelo DOM, e NÃO pelo `getByRole`.
 *
 * ── PORQUE É QUE ISTO MUDOU ────────────────────────────────────────────────
 *
 * Chegava aqui pelo botão «Fechar» (`screen.getByRole`), e isso deixou de
 * funcionar a partir do gesto de fechar — de propósito. A gaveta que sai passou
 * a levar `aria-hidden` (e a largar o `role="dialog"`, o `aria-modal` e o
 * nome), portanto SAI DA ÁRVORE DE ACESSIBILIDADE no fotograma do gesto e o
 * `getByRole` deixa de a encontrar. É exactamente o defeito que o
 * `a-saida-sai-da-arvore.test.ts` nomeava neste ficheiro, agora corrigido.
 *
 * Ou seja: os três casos que passavam a chamar isto DEPOIS do clique passavam
 * porque a gaveta ainda se anunciava. Eram verdes por causa da avaria.
 *
 * A gaveta continua MONTADA e continua a ver-se — é o que a saída existe para
 * fazer —, portanto o que muda é só o instrumento com que se lhe chega: uma
 * consulta ao DOM, que não passa pela árvore de acessibilidade. A classe é a
 * mesma âncora que já se usava (`max-h-[100dvh]`, o tecto de altura da folha).
 */
function gaveta(): HTMLElement {
  const caixa = document.querySelector("[class*='max-h-[100dvh]']");
  if (!(caixa instanceof HTMLElement)) throw new Error("não encontrei a gaveta");
  return caixa;
}

/** Abre o painel pelo caminho dela: lista → ecrã da proposta → «Abrir o pedido». */
async function abrirOPainel(nome: string) {
  await act(async () => {
    fireEvent.click(screen.getByText(nome));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Abrir o pedido$/ }));
  });
}

function avancar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  seq = 0;
  localStorage.clear();
  ecraDeTelemovel();
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
  vi.useRealTimers();
});

describe("a saída da gaveta do pedido", () => {
  it("segura a gaveta montada a sair — não desaparece no fotograma", async () => {
    montar([pedido({ id: "LQ-042", name: "Carla Nunes" })]);
    await abrirOPainel("Carla Nunes");
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });

    /**
     * Ainda lá está, e já a sair — e agora há DUAS coisas a dizer, não uma.
     *
     * A gaveta continua MONTADA (é o que a saída existe para fazer: sem nó não
     * há o que animar), e é isso que a primeira asserção mede, pelo DOM.
     *
     * Mas já não se ANUNCIA: leva `aria-hidden` e largou o `role="dialog"`, o
     * `aria-modal` e o nome, portanto o `getByRole` deixa de a alcançar. Esta
     * asserção estava escrita ao contrário — `getByRole(…"Fechar")` a seguir ao
     * clique — e passava por causa da avaria que o
     * `a-saida-sai-da-arvore.test.ts` nomeava aqui. Fica agora a dizer a coisa
     * certa: montada para os olhos, fora da árvore para quem não olha.
     */
    expect(gaveta(), "a gaveta desmontou no fotograma do gesto").toBeInTheDocument();
    expect(gaveta().className).toContain("bo-saida");
    expect(
      screen.queryByRole("button", { name: "Fechar" }),
      "a gaveta que sai continua a anunciar-se — é o defeito, não a garantia",
    ).not.toBeInTheDocument();

    avancar(SAIDA_MS);
    expect(document.querySelector("[class*='max-h-[100dvh]']")).toBeNull();
  });

  it("a classe entra no PRIMEIRO fotograma, com ela os toques e o teclado saem", async () => {
    /**
     * O ponto mais importante da `.bo-saida`, e está escrito na regra: o
     * `pointer-events` larga-se DENTRO da classe, na mesma renderização que
     * marca o nó como «a sair» — aplicá-lo num `setTimeout` abre exactamente a
     * janela que ele existe para fechar. O `inert` é a mesma frase dita ao
     * teclado e ao leitor de ecrã.
     */
    montar([pedido({ id: "LQ-043", name: "Rita Sousa" })]);
    await abrirOPainel("Rita Sousa");

    vi.useFakeTimers();
    const antes = gaveta();
    expect(antes.hasAttribute("inert")).toBe(false);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });

    // Sem avançar relógio nenhum: é o mesmo commit do React.
    expect(gaveta().className).toContain("bo-saida");
    expect(gaveta().hasAttribute("inert")).toBe(true);
  });

  it("o foco volta NO GESTO, e não 200 ms depois", async () => {
    /**
     * ══════════════════════════════════════════════════════════════════════
     * NENHUMA ANIMAÇÃO PODE ATRASAR UMA TAREFA — E O FOCO É A TAREFA
     * ══════════════════════════════════════════════════════════════════════
     *
     * A armadilha de foco (`useFocusTrap`) só larga o que segura quando o seu
     * `active` passa a falso, e o `active` era `!!selected && isDetailOverlay`.
     * Nenhum dos dois cai no gesto: o `isDetailOverlay` é a LARGURA DO ECRÃ, e
     * o `selected` só é limpo ao fim dos 200 ms da saída. Resultado medido: a
     * gaveta já está a desaparecer e o foco continua LÁ DENTRO — o
     * `previouslyFocused?.focus?.()` da limpeza da armadilha só corre um quinto
     * de segundo mais tarde.
     *
     * Quem fecha com Escape fica esse tempo sem sítio para o teclado. Uma
     * animação de saída pode demorar o que quiser a apagar-se; o que não pode é
     * ficar com uma coisa de que a pessoa precisa já.
     *
     * ── PORQUE É QUE ISTO NÃO ESTÁ NA VARREDURA ────────────────────────────
     *
     * O `a-saida-sai-da-arvore.test.ts` lê ATRIBUTOS no JSX — vê o `inert` e o
     * `aria-hidden`, e é por isso que nomeou a outra metade deste mesmo
     * defeito. Não vê para onde o foco foi parar, que é comportamento e mede-se
     * a correr. São as duas metades da mesma linha (`&& !painelASair`), e ficam
     * guardadas pelos dois lados.
     */
    montar([pedido({ id: "LQ-046", name: "Sofia Pinto" })]);
    await abrirOPainel("Sofia Pinto");

    /**
     * O QUE A ARMADILHA SEGURA, e é isto que se mede.
     *
     * O `useFocusTrap` faz duas coisas ao armar-se: leva o foco para dentro, e
     * marca os IRMÃOS de cada nível entre a gaveta e o `<body>` com
     * `aria-hidden` e `inert` — o fundo inteiro sai do alcance. A limpeza dele
     * desfaz as duas.
     *
     * Enquanto a limpeza esperava pelo `selected` (200 ms), o que ficava
     * bloqueado não era só o foco: era **o resto do ecrã**. A lista de pedidos
     * por trás, a barra de baixo, o menu — tudo `inert` durante um quinto de
     * segundo depois de ela já ter fechado a gaveta. É a tarefa seguinte a
     * esperar pelo fim de uma animação.
     *
     * Mede-se pelos irmãos e não pelo `document.activeElement` porque quem tira
     * o foco de um nó marcado `inert` é o BROWSER, e o jsdom não implementa esse
     * comportamento — aqui uma asserção sobre o foco mediria o jsdom e não o
     * produto. Os atributos são do React e estão no DOM nos dois sítios.
     */
    /* A BARRA DE BAIXO é um dos irmãos que a armadilha marca ao subir, e é
       um nó com nome e endereço — melhor âncora do que uma contagem. Lê-se pelo
       DOM e não por `getByRole`: a partir do momento em que leva `aria-hidden`,
       o seu papel deixa de a encontrar, que é o ponto.

       E lê-se o `aria-hidden` e não o `inert`: a armadilha põe o primeiro com
       `setAttribute` (fica no DOM) e o segundo pela PROPRIEDADE
       (`sibling.inert = true`), e o jsdom não reflecte essa propriedade em
       atributo nenhum — um `[inert]` aqui media o jsdom e não o produto. */
    const barraDeBaixo = () =>
      document.querySelector('nav[aria-label="Navegação do back office"]')!;
    expect(
      barraDeBaixo().getAttribute("aria-hidden"),
      "com a gaveta aberta o fundo tem de estar fora do alcance — sem isso este caso não mede nada",
    ).toBe("true");

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });

    // Sem avançar relógio nenhum: é o mesmo commit do gesto.
    expect(
      barraDeBaixo().getAttribute("aria-hidden"),
      "a barra de baixo continua fora do alcance depois de ela fechar a gaveta — o " +
        "ecrã só volta a responder 200 ms mais tarde, quando a animação acabar",
    ).toBeNull();

    // E a gaveta que sai deixa de ser um diálogo modal com nome: a promessa do
    // `aria-modal` é «só isto conta», e isto já não está cá.
    expect(gaveta().getAttribute("role")).toBeNull();
    expect(gaveta().getAttribute("aria-modal")).toBeNull();
    expect(gaveta().getAttribute("aria-hidden")).toBe("true");
  });

  it("e o véu vai-se com ela, e não fica um fotograma para trás", async () => {
    montar([pedido({ id: "LQ-044", name: "Inês Faria" })]);
    await abrirOPainel("Inês Faria");

    // O véu da gaveta, e não outro qualquer: é o único `inset-0` com esta
    // tinta e este `z-index` (o do menu lateral é `z-30` e mais escuro).
    const veu = () => document.querySelector('[class*="bg-black/50"][class*="z-40"]');
    expect(veu()?.className).toContain("bo-entrada-fundo");

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });
    expect(veu()?.className).toContain("bo-saida-fundo");
  });

  it("o relógio da saída NÃO fecha um pedido aberto entretanto", async () => {
    /**
     * Durante os 200 ms a lista continua viva — a saída larga os toques da
     * gaveta, não os da página. Ela fecha um pedido e abre logo outro; o
     * relógio do primeiro não pode levar o segundo à frente.
     *
     * Foi por causa disto que a saída ganhou um porteiro no fim, e é o caso que
     * o `useSaidaAdiada` sozinho não resolve: ele sabe quando o tempo acaba,
     * não sabe se ainda é o mesmo sujeito.
     *
     * ── O RELÓGIO É FALSO DO PRINCÍPIO AO FIM, E ISSO É O CASO ───────────────
     *
     * Duas versões deste caso passaram com E sem o porteiro, que é a pior
     * espécie de teste. A primeira armava o relógio falso e voltava aos
     * verdadeiros a seguir — e voltar aos verdadeiros DEITA FORA a fila dos
     * falsos, portanto o relógio da saída nunca tocava. A segunda esperava em
     * tempo real, e abrir o segundo pedido no jsdom demora mais do que os
     * 200 ms: quando chegava lá, a saída do primeiro já tinha acabado sozinha e
     * não havia sobreposição nenhuma para medir.
     *
     * Com o relógio falso do princípio ao fim a sobreposição é EXACTA: 50 ms
     * de saída corrida, o segundo pedido a abrir dentro dela, e só depois o
     * tempo todo a passar.
     */
    vi.useFakeTimers();
    montar([
      pedido({ id: "LQ-045", name: "Ana Marques" }),
      pedido({ id: "LQ-046", name: "Bruno Dias" }),
    ]);
    await abrirOPainel("Ana Marques");

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });
    avancar(50);
    expect(gaveta().className, "a saída já tinha acabado — não há sobreposição").toContain(
      "bo-saida",
    );

    // A meio da saída do primeiro, abre o segundo.
    await abrirOPainel("Bruno Dias");
    expect(gaveta().className, "o painel novo nasceu já a desaparecer").not.toContain("bo-saida");

    // E o relógio do primeiro passa sem levar este à frente.
    avancar(SAIDA_MS * 3);
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
  });

  it("quem pediu para não animar não espera 200 ms por uma gaveta a apagar-se", async () => {
    /**
     * A guarda tem de ser em JavaScript e não só no CSS: o que muda é o CICLO
     * DE VIDA. Com a animação desligada e o nó segurado à mesma, ficava uma
     * caixa parada e morta 200 ms em cima do que está por baixo dela.
     */
    montar([pedido({ id: "LQ-047", name: "Sara Lopes" })]);
    await abrirOPainel("Sara Lopes");

    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: /max-width/.test(query) || query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });
    // Sem avançar relógio nenhum: fecha no próprio instante.
    expect(screen.queryByRole("button", { name: "Fechar" })).not.toBeInTheDocument();
  });
});

describe("e a coluna do computador continua a fechar de uma vez", () => {
  /**
   * A partir de `xl` o painel é uma coluna DENTRO da grelha. Segurá-la 200 ms a
   * desvanecer-se não animava a mudança de duas faixas para uma: a lista ficava
   * estreita durante a saída e SALTAVA no fim. Mesmo corte seco, 200 ms mais
   * tarde e com uma animação por cima a dizer que não era.
   */
  it("sem gaveta, sem saída adiada", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: /min-width/.test(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    montar([pedido({ id: "LQ-048", name: "Marta Reis" })]);
    await abrirOPainel("Marta Reis");

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });
    expect(screen.queryByRole("button", { name: "Fechar" })).not.toBeInTheDocument();
  });
});
