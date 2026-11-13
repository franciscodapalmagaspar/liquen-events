// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote, TimelineItem } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import Guioes from "./Guioes";
import { __resetListCache } from "./useCachedList";
import { MODELOS_DA_CASA } from "@/lib/orcamento/guiao-modelos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LISTA DE GUIÕES TEM DE DIZER A VERDADE SEM SE ABRIR NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que esta vista promete é uma coisa só: **olhar uma vez e saber quais dos
 * eventos que aí vêm têm um problema.** Tudo o resto — a régua, os modelos, o
 * editor — é maquinaria ao serviço disso.
 *
 * Por isso o que se prende aqui é o que faz essa promessa falhar em silêncio:
 *
 *  · uma pastilha que diga o estado só com COR (a regra da casa, e já houve
 *    aqui um calendário a fazê-lo);
 *  · um filtro que mostre linhas que não pertencem ao filtro;
 *  · um evento sem guião que não se distinga de um evento com guião pronto;
 *  · e o caminho inteiro do modelo: escolher, gravar, e o guião ficar com os
 *    momentos do modelo.
 *
 * A régua em si não se mede aqui, e é deliberado: em jsdom não há disposição
 * nenhuma (`getBoundingClientRect` devolve zeros), portanto medir larguras de
 * blocos era medir zero e passar sempre. A geometria da régua está presa em
 * `lib/orcamento/guioes.test.ts` — os carris, os vazios e a janela são funções
 * puras — e o que se vê no browser é o passeio `e2e/guiao-do-dia.spec.ts`.
 */

const HOJE = new Date("2026-06-10T14:00:00");

const momento = (
  id: string,
  time: string,
  title: string,
  duracao?: number,
  owner?: string,
): TimelineItem => ({
  id,
  time,
  title,
  ...(duracao != null ? { duracao } : {}),
  ...(owner ? { owner } : {}),
});

const GUIOES = [
  {
    id: "q-pronto",
    cliente: "Ana e Rui",
    evento: "Casamento",
    data: "2026-06-20",
    local: "Herdade da Maridona",
    aceite: true,
    momentos: [momento("a1", "09:00", "Montagem", 120), momento("a2", "11:00", "Cerimónia", 60)],
  },
  {
    id: "q-choque",
    cliente: "Beatriz e Tomás",
    evento: "Casamento",
    data: "2026-06-15",
    local: "Quinta do Sobral",
    aceite: true,
    momentos: [
      momento("b1", "09:00", "Montagem", 180, "Rita"),
      momento("b2", "10:00", "Ir buscar as flores", 60, "Rita"),
    ],
  },
  {
    id: "q-vazio",
    cliente: "Carla e Diogo",
    evento: "Batizado",
    data: "2026-07-01",
    local: "Igreja de Évora",
    aceite: true,
    momentos: [],
  },
];

function resposta(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

/** Os PATCH do guião que chegaram ao servidor, por ordem. */
let gravados: { url: string; corpo: Record<string, unknown> }[] = [];

function ligarOServidor() {
  gravados = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/guioes/modelos")) {
        return resposta({ modelos: MODELOS_DA_CASA });
      }
      if (url.startsWith("/api/guioes")) {
        return resposta({ guioes: GUIOES });
      }
      /* ── SÓ AS ESCRITAS, QUE É O QUE O NOME DIZ ─────────────────────────
         Isto guardava TUDO o que não fosse `/api/guioes` — incluindo leituras.
         Passou despercebido enquanto esta vista só lia os guiões; no dia em
         que passou a ler também o directório de fornecedores (para a folha
         mostrar os contactos), o GET entrou na lista das gravações e um caso
         que esperava UMA gravação viu duas.

         O defeito era do ajudante e não do código: um contador de escritas que
         conta leituras mede outra coisa. */
      if ((init?.method ?? "GET").toUpperCase() !== "GET") {
        gravados.push({
          url,
          corpo: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
        });
      }
      return resposta({ ok: true });
    }),
  );
}

const pedidoInteiro = (id: string): Quote =>
  ({
    id,
    name: GUIOES.find((g) => g.id === id)?.cliente ?? "",
    date: GUIOES.find((g) => g.id === id)?.data ?? "",
    timeline: GUIOES.find((g) => g.id === id)?.momentos ?? [],
  }) as Quote;

function montar(
  carregar: (
    id: string,
  ) => Promise<{ ok: true; quote: Quote } | { ok: false; porque: string }> = async (id) => ({
    ok: true,
    quote: pedidoInteiro(id),
  }),
) {
  return render(
    <ToastProvider>
      <Guioes carregarPedido={carregar} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  __resetListCache();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(HOJE);
  ligarOServidor();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * Escolher um modelo no controlo que está lá AGORA, com o relógio a andar.
 *
 * Falhou na passagem completa do CI a 16/10 (zero gravações), e reproduz-se
 * aqui com seis cópias deste ficheiro ao mesmo tempo. Medido, a causa é esta:
 * o painel volta a desenhar-se quando chega a leitura dos fornecedores, e o
 * `Escolha` em que o teste carregou JÁ NÃO ESTÁ na página (`isConnected`
 * falso). O clique ia para um botão órfão, a lista nunca abria, e o `escolher`
 * do kit — que guarda o elemento e espera no relógio falso — não tinha como
 * dar por isso.
 *
 * Aqui volta-se a procurar o controlo a cada volta, carrega-se nele se a
 * lista estiver fechada, e faz-se o relógio andar (a lição do comentário dos
 * testes de baixo) até a opção aparecer. É o que ela faz: carrega no campo
 * que vê.
 */
async function escolherModelo(user: ReturnType<typeof userEvent.setup>, nome: string) {
  let opcao: HTMLElement | null = null;
  for (let i = 0; i < 40 && !opcao; i++) {
    const controlo = await screen.findByRole("combobox", {
      name: "Juntar um modelo a esta timeline",
    });
    if (controlo.getAttribute("aria-expanded") !== "true") await user.click(controlo);
    await vi.advanceTimersByTimeAsync(25);
    opcao = screen.queryByRole("option", { name: nome });
  }
  expect(opcao, `a lista dos modelos não abriu com «${nome}»`).not.toBeNull();
  await user.click(opcao!);
}

/** A linha de um evento na lista, encontrada pelo nome acessível. */
function linhaDe(cliente: string | RegExp) {
  return screen.getByRole("button", {
    name: typeof cliente === "string" ? new RegExp(cliente) : cliente,
  });
}

describe("Timelines — a lista", () => {
  it("mostra um evento por linha, os que aí vêm primeiro", async () => {
    montar();
    await screen.findByRole("button", { name: /Beatriz e Tomás/ });

    const linhas = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? "")
      .filter((n) => n.includes("Daqui a"));
    // 15 de Junho antes de 20, e 20 antes de 1 de Julho.
    expect(linhas[0]).toContain("Beatriz e Tomás");
    expect(linhas[1]).toContain("Ana e Rui");
    expect(linhas[2]).toContain("Carla e Diogo");
  });

  it("o estado de cada timeline é COR, FORMA e PALAVRA — nunca só cor", async () => {
    montar();
    const linha = await screen.findByRole("button", { name: /Beatriz e Tomás/ });
    const pastilha = within(linha).getByText("Choque");

    // A palavra está lá…
    expect(pastilha.textContent).toBe("Choque");
    // …a forma também (um ícone dentro da mesma pastilha)…
    expect(pastilha.parentElement?.querySelector("svg")).toBeTruthy();
    // …e a frase inteira chega a quem ouve o ecrã, e não um «Choque, 1» solto.
    expect(linha.getAttribute("aria-label")).toContain("dois sítios ao mesmo tempo");
  });

  it("um evento sem timeline distingue-se de uma timeline pronta", async () => {
    montar();
    const semGuiao = await screen.findByRole("button", { name: /Carla e Diogo/ });
    const pronto = linhaDe("Ana e Rui");
    expect(within(semGuiao).getByText("Sem timeline")).toBeTruthy();
    expect(within(pronto).getByText("Pronto")).toBeTruthy();
    // CONTROLO NEGATIVO: se a linha vazia herdasse o estado da outra, isto
    // passava a encontrar «Pronto» nas duas.
    expect(within(semGuiao).queryByText("Pronto")).toBeNull();
  });

  it("o filtro «Com problema» deixa só quem tem uma pessoa em dois sítios", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar();
    await screen.findByRole("button", { name: /Beatriz e Tomás/ });

    await user.click(screen.getByRole("radio", { name: /Com problema/ }));

    expect(screen.getByRole("button", { name: /Beatriz e Tomás/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ana e Rui/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Carla e Diogo/ })).toBeNull();
  });

  it("por omissão só mostra os eventos fechados, e dá para ver os outros", async () => {
    /**
     * ── DUAS COISAS DELA, COM DIAS DE DIFERENÇA, E AS DUAS VALEM ──────────
     *
     *  1. «Quero que dê para fazer timelines APENAS das propostas que já foram
     *     aceites.» A lista tinha quinze eventos e treze diziam «Sem timeline»,
     *     porque a maior parte ainda eram propostas por responder.
     *  2. «Aqui quero que dê TAMBÉM para escolher aqueles que quero fazer um
     *     timeline» — com a lista a mostrar UM evento, que é o que sobrou do
     *     corte da primeira.
     *
     * Não se contradizem: a primeira é sobre o que se vê por omissão, a
     * segunda é sobre poder ver o resto. Houve aqui, durante umas horas, um
     * corte no SERVIDOR — e um corte no servidor só sabe fazer a primeira: ao
     * fazê-la, tirava a segunda sem deixar porta nenhuma.
     *
     * Este caso guarda as duas ao mesmo tempo, que é a única maneira de não se
     * perder uma a arranjar a outra.
     */
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/guioes/modelos")
          ? resposta({ modelos: [] })
          : resposta({
              guioes: [
                { ...GUIOES[0], aceite: true },
                { ...GUIOES[1], id: "q-por-fechar", cliente: "Ainda a pensar", aceite: false },
              ],
            }),
      ),
    );
    montar();

    // 1. Por omissão, só o fechado.
    await screen.findByRole("button", { name: /Ana e Rui/ });
    expect(screen.queryByRole("button", { name: /Ainda a pensar/ })).toBeNull();

    // 2. E o outro está a um toque, não atrás de uma parede.
    await user.click(screen.getByRole("radio", { name: /^Todos os eventos · 2$/ }));
    expect(screen.getByRole("button", { name: /Ainda a pensar/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ana e Rui/ })).toBeTruthy();
  });

  /** Achado n.º 21: sem eventos fechados, abria a dizer «Mudou o filtro, não os
   *  dados» a quem não tinha mudado nada. */
  it("sem nenhum evento fechado, diz isso e leva aos outros", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/guioes/modelos")
          ? resposta({ modelos: [] })
          : resposta({ guioes: [{ ...GUIOES[0], aceite: false }] }),
      ),
    );
    montar();
    expect(await screen.findByText("Ainda nenhum evento fechado")).toBeTruthy();
    expect(screen.queryByText(/Mudou o filtro/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Ver todos os eventos" }));
    expect(await screen.findByRole("button", { name: /Ana e Rui/ })).toBeTruthy();
  });

  it("um filtro sem resultados diz que foi o filtro que mudou, não os dados", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/guioes/modelos")
          ? resposta({ modelos: [] })
          : resposta({ guioes: [GUIOES[0]] }),
      ),
    );
    montar();
    await screen.findByRole("button", { name: /Ana e Rui/ });

    await user.click(screen.getByRole("radio", { name: /Com problema/ }));
    expect(screen.getByText(/Mudou o filtro, não os dados/)).toBeTruthy();
  });
});

/**
 * ── E O EDITOR VOLTOU A SER A PRIMEIRA COISA ────────────────────────────
 *
 * Durante uma ronda esta vista abriu no «Horário» (a grelha por pessoa) e
 * estes casos tiveram de dar um toque em «Editar» antes de editar. O
 * comutador saiu — «aqui basta apenas editar» —, porque a FOLHA passou a
 * estar ao lado do editor e já não é preciso trocar de vista para ver como
 * está a ficar. O toque a mais saiu com ele.
 */

describe("Timelines — abrir e editar", () => {
  it("abrir um evento vai buscar o pedido inteiro e monta o editor", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const pedidos: string[] = [];
    montar(async (id) => {
      pedidos.push(id);
      return { ok: true, quote: pedidoInteiro(id) };
    });
    await screen.findByRole("button", { name: /Ana e Rui/ });

    await user.click(linhaDe("Ana e Rui"));

    await waitFor(() => expect(screen.getByText("Cronograma do Dia")).toBeTruthy());
    expect(pedidos).toEqual(["q-pronto"]);
    // O guião que abre é o DAQUELE evento, e não o de outro.
    expect(screen.getByRole("button", { name: "Remover 09:00 Montagem" })).toBeTruthy();
  });

  it("uma falha a abrir diz o que se passou e oferece tentar de novo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar(async () => ({ ok: false, porque: "A sessão expirou — volta a entrar." }));
    await screen.findByRole("button", { name: /Ana e Rui/ });

    await user.click(linhaDe("Ana e Rui"));

    await waitFor(() => expect(screen.getByText(/A sessão expirou/)).toBeTruthy());
    // E NÃO monta um editor vazio por cima da falha: um painel que parece
    // completo e não está é pior do que um aviso.
    expect(screen.queryByText("Cronograma do Dia")).toBeNull();
  });

  it("juntar um modelo grava os momentos do modelo na timeline do evento", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar();
    await screen.findByRole("button", { name: /Carla e Diogo/ });
    await user.click(linhaDe("Carla e Diogo"));
    await waitFor(() => expect(screen.getByText("Cronograma do Dia")).toBeTruthy());

    const modelo = MODELOS_DA_CASA[0];
    await escolherModelo(user, modelo.nome);

    /* ── ESPERAR NÃO É A FERRAMENTA CERTA AQUI, E JÁ FALHOU TRÊS VEZES ───
         Este ficheiro corre com `useFakeTimers({ shouldAdvanceTime: true })`: o
         relógio é falso mas anda sozinho, movido por um intervalo no laço de
         eventos. O `waitFor` conta nesse relógio.

         Numa passagem completa — dez mil testes, vários processos — o laço fica
         esfomeado: o tempo REAL passa, o FALSO fica para trás, e o `waitFor`
         esgota o orçamento sem nunca ter chegado a esperar o que julga estar a
         esperar. Falhou em três passagens completas, sempre aqui.

         Subi o tecto do `waitFor` para 5 s: não serviu de nada, porque o do
         `it` eram 5 s. Subi os dois, para 15 e 20 s: falhou na mesma. É a
         lição — **quando o remédio é mais paciência e o vermelho volta, o
         diagnóstico estava errado.** O que falta não é tempo: é fazer o
         relógio ANDAR.

         `advanceTimersByTimeAsync` avança o relógio falso E esvazia as
         microtarefas, que é o que deixa a promessa do `fetch` fingido
         resolver. Deixa de depender de um intervalo esfomeado, e por isso
         deixa de depender da carga da máquina. A asserção é a mesma: UMA
         gravação, com o mesmo destino e o mesmo corpo. */
    for (let i = 0; i < 40 && gravados.length === 0; i++) {
      await vi.advanceTimersByTimeAsync(25);
    }
    expect(gravados).toHaveLength(1);
    expect(gravados[0].url).toBe("/api/orcamento/q-vazio");
    const timeline = gravados[0].corpo.timeline as TimelineItem[];
    expect(timeline.map((t) => t.title)).toEqual(modelo.momentos.map((t) => t.title));
    // Cada momento nasce com id próprio — sem isso, reaplicar o gesto depois de
    // um 409 punha uma segunda cópia no guião.
    expect(new Set(timeline.map((t) => t.id)).size).toBe(timeline.length);
  });

  it("a lista fica em dia com o que se editou, sem recarregar a página", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar();
    await screen.findByRole("button", { name: /Carla e Diogo/ });
    await user.click(linhaDe("Carla e Diogo"));
    await waitFor(() => expect(screen.getByText("Cronograma do Dia")).toBeTruthy());

    // Pelo `escolherModelo`, que faz o relógio andar até a lista abrir (ver lá).
    await escolherModelo(user, MODELOS_DA_CASA[0].nome);

    /**
     * Dois sítios a dizer coisas diferentes sobre o mesmo dia é o defeito que
     * esta vista existe para não ter. Sem a escrita de volta na lista, a
     * pastilha «Sem timeline» ficava colada à linha até alguém recarregar.
     *
     * Mesmo remédio que o caso de cima, pela mesma razão: falhava em passagens
     * completas (e já falhava na de 8 de outubro), porque o `waitFor` contava
     * num relógio falso que o laço esfomeado não fazia andar. Faz-se andar o
     * relógio, e depois olha-se — sem esperar.
     */
    for (let i = 0; i < 40 && gravados.length === 0; i++) {
      await vi.advanceTimersByTimeAsync(25);
    }
    expect(gravados, "a escolha do modelo não chegou a gravar").toHaveLength(1);
    // A timeline aberta ocupa a vista (14/10): volta-se à lista para a ver.
    await user.click(screen.getByRole("button", { name: "Voltar aos eventos" }));
    const linha = screen.getByRole("button", { name: /Carla e Diogo/ });
    expect(within(linha).queryByText("Sem timeline")).toBeNull();
  });
});

/**
 * A lista em cartões, com o desenho do mapa de mesas (14/10): o próximo
 * evento à cabeça, a procura, e abrir um evento ocupa a vista inteira.
 */
describe("Timelines — a lista em cartões", () => {
  it("o próximo evento vem à cabeça, num cartão à parte", async () => {
    montar();
    await screen.findByRole("button", { name: /Beatriz e Tomás/ });
    const proximo = screen.getByText("Próximo evento").closest("button")!;
    expect(proximo.getAttribute("aria-label")).toContain("Beatriz e Tomás");
  });

  it("o cartão diz quantos momentos tem, e um evento sem timeline di-lo", async () => {
    montar();
    const pronto = await screen.findByRole("button", { name: /Ana e Rui/ });
    expect(within(pronto).getByText(/2 momentos · 09:00–12:00/)).toBeTruthy();
    expect(within(linhaDe("Carla e Diogo")).getByText("Sem timeline")).toBeTruthy();
  });

  it("a procura filtra pelo nome ou pelo local", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar();
    await screen.findByRole("button", { name: /Ana e Rui/ });
    await user.type(screen.getByRole("searchbox", { name: "Procurar eventos" }), "sobral");
    await waitFor(() => expect(screen.queryByRole("button", { name: /Ana e Rui/ })).toBeNull());
    expect(screen.getByRole("button", { name: /Beatriz e Tomás/ })).toBeTruthy();
  });

  it("abrir ocupa a vista; «Eventos» volta à lista, com o cartão marcado", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar();
    await user.click(await screen.findByRole("button", { name: /Ana e Rui/ }));
    await waitFor(() => expect(screen.getByText("Cronograma do Dia")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Carla e Diogo/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Voltar aos eventos" }));
    const cartao = await screen.findByRole("button", { name: /Ana e Rui/ });
    expect(cartao.getAttribute("aria-current")).toBe("true");
    expect(screen.queryByText("Cronograma do Dia")).toBeNull();
  });
});
