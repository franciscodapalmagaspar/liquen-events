import { useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { ViewSkeleton } from "./Skeleton";
import { onIdle } from "@/lib/onIdle";
import { CORE_NAV, MORE_NAV, type View } from "./nav";

/**
 * Code-split back-office surfaces. Each top-level view and each detail-panel
 * tool is its own chunk, loaded on demand so the admin bundle stays small.
 * Extracted from AdminClient to keep the container focused on behaviour.
 *
 * While a chunk arrives, a layout-shaped skeleton stands in so the page settles
 * instead of flashing a spinner.
 */
function ViewLoading() {
  return <ViewSkeleton />;
}

// Detail-panel tools — a shimmering eyebrow+bar holds the layout while loading.
//
// O esqueleto NÃO leva entrada, de propósito: um esqueleto é a espera, não uma
// apresentação, e uma entrada aqui somava-se aos 300 ms que o React já segura
// um fallback pintado. Isto continua verdade e não se mexe.
//
// ── E A FRASE QUE VINHA A SEGUIR ERA FALSA ────────────────────────────────
//
// Dizia que quem se apresenta é a ferramenta que chega, e que cada uma delas
// traz a sua própria entrada de apresentação. CONTADO nas catorze ferramentas
// desta lista, no dia em que isto se escreveu: duas trazem `.bo-cena`
// (`EventTasks` e `ProposalStudio`); as outras doze — `ProposalBuilder`, `ClientMessenger`,
// `EventChecklist`, `EventMaterial`, `ProductionPlan`, `EventTimeline`,
// `PaymentsPanel`, `EventCosts`, `GuestList`, `ActivityLog`, `TagsField` e
// `FollowUpField` — não trazem nada. Onde o esqueleto sai, o painel assenta
// num fotograma.
//
// Fica escrito porque a frase, como estava, mandava a pessoa seguinte concluir
// que a metade da CHEGADA já estava feita e ir tratar da outra — a do
// esqueleto —, que é precisamente a que não se pode tocar. As duas metades são
// coisas diferentes: a saída do esqueleto é a espera a acabar, a chegada da
// ferramenta é o sistema a apresentar-se.
//
// Não se resolveu aqui de propósito, e a razão vive neste ficheiro para quem
// vier a seguir a poder pesar: estas doze ferramentas são desenhadas DENTRO de
// um separador que já entra com a `.view-in` (240 ms), cada uma com o seu
// próprio limite `<Suspense>` — chegam desencontradas —, e várias são
// remontadas por `key={…-${selected.id}}` a cada pedido que se abre. Pôr doze
// apresentações de 600 ms lá dentro é uma decisão de desenho sobre quanto
// movimento cabe num separador, e não uma linha que falte.
const PanelLoading = () => (
  <div className="border-t border-[var(--bo-hairline-strong)] pt-5">
    <div className="bo-skeleton h-2.5 w-40 mb-4" aria-hidden />
    <div className="bo-skeleton h-9 w-full" aria-hidden />
  </div>
);

/* ── Vistas de topo: dividir sem pagar o esqueleto ─────────────────────────
 *
 * Medido (CPU 4x mais lenta, 60 ms de latência, 6 sessões × 9 vistas): o
 * primeiro clique numa vista mostrava o esqueleto durante 303 ms (mediana) e só
 * assentava aos 381 ms — em 54 de 54 cliques. Voltar mais tarde à mesma vista
 * custava 57 ms, sem esqueleto nenhum.
 *
 * A diferença não é a rede: é o React. `next/dynamic` desenha sempre através de
 * um limite <Suspense> e, quando um fallback chega a ser pintado, o React
 * segura-o por FALLBACK_THROTTLE_MS = 300 ms antes de revelar o conteúdo (para
 * não piscar). Ou seja: pré-carregar o chunk sozinho NÃO tornaria o clique
 * instantâneo — trocaria espera de rede por espera do React.
 *
 * `splitView` trata das duas coisas:
 *   • fora do caminho crítico, aquece o módulo — o chunk deixa de ser pedido ao
 *     clique (medido: 0 pedidos de rede por clique, contra 1 antes);
 *   • ao montar, se o módulo já cá está, desenha-o DIRECTAMENTE, sem passar
 *     pelo <Suspense>: não há fallback, logo não há os 300 ms.
 * Se ainda não tiver chegado, cai no `dynamic()` de sempre, com o esqueleto.
 *
 * A escolha é fixada no arranque de cada montagem (`useState` com inicializador)
 * de propósito: trocar de componente a meio da vida da vista remontá-la-ia e
 * apagaria o que estivesse preenchido — um filtro, texto meio escrito.
 */
type ViewModule<P> = { default: ComponentType<P> };

interface SplitView<P> {
  /** O componente a desenhar (idêntico ao original em props e comportamento). */
  View: ComponentType<P>;
  /** Traz o módulo para memória. Idempotente; um erro de rede não fica colado. */
  warm: () => Promise<void>;
}

export function splitView<P extends object>(load: () => Promise<ViewModule<P>>): SplitView<P> {
  let Resolved: ComponentType<P> | null = null;
  let inFlight: Promise<void> | null = null;

  /* ── UMA FALHA DE REDE NÃO PODE FICAR COLADA À VISTA ─────────────────────
   *
   * O `dynamic()` desenha através de um `React.lazy`, e um `React.lazy` guarda
   * a promessa do `import()` PARA SEMPRE — a que resolveu e também a que
   * rejeitou. O Wi-Fi da quinta a cair a meio do descarregamento de um chunk
   * ficava, por isso, gravado no componente: ela voltava à vista e o React
   * voltava a atirar o MESMO erro, sem sequer tocar na rede, até alguém
   * recarregar a página inteira. Um chunk que não chegou é um acidente; o que
   * não pode é ser definitivo.
   *
   * Quando o `import()` falha deitamos fora o componente falhado e fazemos
   * outro. A montagem seguinte lê esta variável de novo (`View` escolhe ao
   * montar), portanto volta à vista = tentativa nova. */
  let Deferred = adiar();

  function adiar(): ComponentType<P> {
    return dynamic(
      () =>
        load().catch((erro: unknown) => {
          Deferred = adiar();
          throw erro;
        }),
      { loading: ViewLoading },
    ) as ComponentType<P>;
  }

  const warm = (): Promise<void> => {
    if (Resolved) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = load().then(
      (mod) => {
        Resolved = mod.default;
        inFlight = null;
      },
      () => {
        inFlight = null;
      },
    );
    return inFlight;
  };

  function View(props: P) {
    const [Chosen] = useState<ComponentType<P>>(() => Resolved ?? Deferred);
    return <Chosen {...props} />;
  }
  View.displayName = "SplitView";

  return { View, warm };
}

/* `Overview` é a única vista desenhada no servidor à chegada (o AdminClient
 * arranca sempre em "overview"), e é a forma literal `dynamic(() => import(…))`
 * que o Next reconhece para emitir no HTML o `<link rel="preload">` do chunk.
 * Fica portanto como está: nem precisa de aquecimento — chega no primeiro
 * pedido — e, uma vez montada, o React já a tem resolvida para as próximas. */
export const Overview = dynamic(() => import("./Overview"), { loading: ViewLoading });

/* Nas restantes, cada `import()` aparece UMA só vez. Não é cosmético: o
 * Turbopack cria um grupo de chunks POR EXPRESSÃO `import()`, por isso duas
 * expressões para o mesmo módulo geram dois ficheiros com o mesmo código, e
 * aquecer um deixava o outro por descarregar (medido: com dois locais de
 * importação, cada clique continuava a ir buscar um chunk à rede). */
const kanban = splitView(() => import("./Kanban"));
const clientes = splitView(() => import("./Clientes"));
const calendario = splitView(() => import("./Calendario"));
const fazerProposta = splitView(() => import("./FazerProposta"));
const propostas = splitView(() => import("./Propostas"));
const pagamentos = splitView(() => import("./Pagamentos"));
const acompanhamento = splitView(() => import("./Acompanhamento"));
const definicoes = splitView(() => import("./DefinicoesProposta"));
const servicos = splitView(() => import("./Servicos"));
const reciclagem = splitView(() => import("./Reciclagem"));
const tarefas = splitView(() => import("./Tarefas"));
const fornecedores = splitView(() => import("./Fornecedores"));
const estatisticas = splitView(() => import("./StatsDashboard"));
const fechosMeta = splitView(() => import("./FechosMeta"));
const modelosEmail = splitView(() => import("./EmailTemplates"));
const contratos = splitView(() => import("./Contratos"));
const inventario = splitView(() => import("./Inventario"));
const material = splitView(() => import("./Material"));
const temas = splitView(() => import("./Temas"));
const guioes = splitView(() => import("./Guioes"));
const mesas = splitView(() => import("./MapaDeMesas"));

export const Kanban = kanban.View;
export const Clientes = clientes.View;
export const Calendario = calendario.View;
export const FazerProposta = fazerProposta.View;
export const Propostas = propostas.View;
export const Pagamentos = pagamentos.View;
export const Acompanhamento = acompanhamento.View;
export const DefinicoesProposta = definicoes.View;
export const Servicos = servicos.View;
export const Reciclagem = reciclagem.View;
export const Tarefas = tarefas.View;
export const Fornecedores = fornecedores.View;
export const StatsDashboard = estatisticas.View;
export const FechosMeta = fechosMeta.View;
export const EmailTemplates = modelosEmail.View;
export const Contratos = contratos.View;
export const Inventario = inventario.View;
export const Material = material.View;
export const Temas = temas.View;
export const Guioes = guioes.View;
export const MapaDeMesas = mesas.View;

// ── Detail-panel tools (only needed once a quote is opened) ──
export const ProposalBuilder = dynamic(() => import("./ProposalBuilder"), {
  loading: PanelLoading,
});
export const ProposalStudio = dynamic(() => import("./ProposalStudio"), {
  loading: PanelLoading,
});
export const ClientMessenger = dynamic(() => import("./ClientMessenger"), {
  loading: PanelLoading,
});
export const EventChecklist = dynamic(() => import("./EventChecklist"), { loading: PanelLoading });
export const EventMaterial = dynamic(() => import("./EventMaterial"), { loading: PanelLoading });
export const ProductionPlan = dynamic(() => import("./ProductionPlan"), { loading: PanelLoading });
export const EventTimeline = dynamic(() => import("./EventTimeline"), { loading: PanelLoading });
export const PaymentsPanel = dynamic(() => import("./PaymentsPanel"), { loading: PanelLoading });
export const EventCosts = dynamic(() => import("./EventCosts"), { loading: PanelLoading });
export const GuestList = dynamic(() => import("./GuestList"), { loading: PanelLoading });
export const TagsField = dynamic(() => import("./TagsField"), {
  loading: () => <div className="bo-skeleton h-9 w-full" aria-hidden />,
});
export const FollowUpField = dynamic(() => import("./FollowUpField"), {
  loading: () => <div className="bo-skeleton h-9 w-full" aria-hidden />,
});
export const ActivityLog = dynamic(() => import("./ActivityLog"), { loading: PanelLoading });
export const EventTasks = dynamic(() => import("./EventTasks"), { loading: PanelLoading });

/* ─────────────────────────── Pré-carregamento ────────────────────────────
 *
 * O back office já aquecia os DADOS em janelas de inatividade (`prefetchList`,
 * no AdminClient) mas nunca o CÓDIGO. Aqui aquecemos os módulos das vistas, um
 * de cada vez, pela ordem em que aparecem na barra lateral.
 *
 * Regras de segurança: nunca antes do primeiro desenho (espera-se pelo `load` e
 * só depois por uma janela de inatividade), nunca em ligações medidas ou muito
 * lentas (Save-Data, 2g) e nunca em desenvolvimento — em dev, importar todas as
 * vistas obrigaria o servidor a compilá-las todas, tornando o trabalho do dia-a-
 * dia MAIS lento, não mais rápido. Tudo junto são ~250 KB, menos do que o
 * runtime do React, e ficam em cache imutável durante um ano.
 *
 * O QUE ISTO NÃO FAZ — medido, para ninguém voltar a assumir o contrário:
 * aquecer os módulos **não** encurta o tempo de mudar de vista. Com tudo
 * aquecido (zero pedidos à rede ao clicar), o marcador de posição continuava no
 * ecrã os mesmos ~300 ms. O que esses 300 ms são não é descarregamento nem
 * dados (8–21 ms e 9–31 ms): é o custo de MONTAR a vista dividida em chunk —
 * importar a mesma vista normalmente baixou a mudança de 370 para 258 ms.
 *
 * Isto continua a valer a pena pela razão certa: numa ligação lenta ou instável
 * não há ida à rede no momento do clique. Mas é robustez, não velocidade — e a
 * decisão de desdobrar (ou não) as vistas diárias é que mexe no tempo.
 */
const VIEW_WARMERS: Partial<Record<View, () => Promise<void>>> = {
  kanban: kanban.warm,
  clientes: clientes.warm,
  calendario: calendario.warm,
  "fazer-proposta": fazerProposta.warm,
  propostas: propostas.warm,
  pagamentos: pagamentos.warm,
  acompanhamento: acompanhamento.warm,
  definicoes: definicoes.warm,
  servicos: servicos.warm,
  reciclagem: reciclagem.warm,
  tarefas: tarefas.warm,
  fornecedores: fornecedores.warm,
  inventario: inventario.warm,
  material: material.warm,
  temas: temas.warm,
  guioes: guioes.warm,
  mesas: mesas.warm,
  // Dois módulos para uma vista só: as Estatísticas desenham o painel dos
  // fechos da Meta por baixo dos gráficos, e aquecer só metade deixava o
  // clique a ir buscar a outra metade à rede — que é justamente o que este
  // aquecimento existe para evitar.
  estatisticas: async () => {
    await Promise.all([estatisticas.warm(), fechosMeta.warm()]);
  },
  contratos: contratos.warm,
  "modelos-email": modelosEmail.warm,
};

/**
 * Ordem de aquecimento: exactamente a ordem da barra lateral (as diárias
 * primeiro, depois as de "Mais"), para que o módulo mais provável esteja pronto
 * primeiro. No fim ficam as vistas que estão fora do menu — só se lá chega por
 * link directo.
 */
export const WARM_ORDER: View[] = (() => {
  const inMenu = [...CORE_NAV, ...MORE_NAV].filter((v) => v in VIEW_WARMERS);
  const hidden = (Object.keys(VIEW_WARMERS) as View[]).filter((v) => !inMenu.includes(v));
  return [...inMenu, ...hidden];
})();

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

/** Ligação medida ou muito lenta → não se gastam os dados dela em antecipação. */
function connectionAllowsPrefetch(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!conn) return true;
  if (conn.saveData) return false;
  return !/(^|-)2g$/.test(conn.effectiveType ?? "");
}

/**
 * Traz uma vista para memória sem a desenhar, para que o clique seguinte não
 * espere nem pela rede nem pelo esqueleto. Exportada também para quem quiser
 * antecipar um clique concreto (por exemplo ao passar o rato sobre um item da
 * barra lateral).
 */
export function prefetchView(view: View): Promise<void> {
  return VIEW_WARMERS[view]?.() ?? Promise.resolve();
}

export interface WarmOptions {
  /** Agendador de janelas ociosas (injectável nos testes). */
  schedule?: (cb: () => void) => () => void;
  /** Aquecedor de uma vista (injectável nos testes). */
  prefetch?: (view: View) => Promise<void>;
  /** Ordem a aquecer. Por omissão, a ordem da barra lateral. */
  order?: View[];
}

/**
 * Aquece as vistas, uma de cada vez, em janelas de inatividade. Devolve um
 * cancelador — nada fica agendado depois de o chamar.
 */
export function warmViewChunks(options: WarmOptions = {}): () => void {
  if (typeof window === "undefined") return () => {};

  const schedule = options.schedule ?? ((cb: () => void) => onIdle(cb, 4000));
  const prefetch = options.prefetch ?? prefetchView;
  const queue = [...(options.order ?? WARM_ORDER)];

  let cancelled = false;
  let cancelIdle: () => void = () => {};

  const step = () => {
    if (cancelled) return;
    const next = queue.shift();
    if (!next) return;
    const again = () => {
      if (!cancelled) cancelIdle = schedule(step);
    };
    void prefetch(next).then(again, again);
  };

  const start = () => {
    if (cancelled || !connectionAllowsPrefetch()) return;
    cancelIdle = schedule(step);
  };

  // Nunca competir com o primeiro desenho: só depois de a página carregar.
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });

  return () => {
    cancelled = true;
    cancelIdle();
    window.removeEventListener("load", start);
  };
}

// Arranque automático no browser. Em desenvolvimento fica desligado de propósito
// (ver nota acima); os testes chamam `warmViewChunks` directamente, com um
// agendador falso.
if (typeof window !== "undefined" && process.env.NODE_ENV === "production") {
  warmViewChunks();
}
