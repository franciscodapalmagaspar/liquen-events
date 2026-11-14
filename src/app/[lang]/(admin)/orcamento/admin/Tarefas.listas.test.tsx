// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import { escolher } from "./ui/escolher.testkit";
import Tarefas from "./Tarefas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS LISTAS E OS GRUPOS, MONTADOS — fases 05 e 06
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As REGRAS — o que cai em «Hoje», o que conta como atrasada, como se reparte —
 * estão provadas em `src/lib/tarefas/listas.test.ts`, sem React pelo meio. O
 * que este ficheiro mede é a outra metade, a que aquele não vê: que o ecrã
 * CHAMA essas regras, e que a barra, os cabeçalhos e os selectores mexem
 * mesmo.
 *
 * ── PORQUE É QUE O RELÓGIO ESTÁ PARADO NUMA QUARTA-FEIRA ──────────────────
 *
 * Porque o ecrã lê o dia de hoje ao relógio (`todayKey`), e um teste de datas
 * que corre no dia em que é escrito passa nesse dia e falha nos outros. Fica
 * parado a 16 de setembro de 2026 — quarta-feira, o único dia em que «ontem»,
 * «hoje», «amanhã», «ainda esta semana» e «para a semana» são cinco dias
 * diferentes.
 *
 * Só o `Date` é falso (`toFake: ["Date"]`). Os temporizadores continuam a ser
 * os verdadeiros, porque este ecrã tem um de segundo e meio a decidir quando é
 * que uma tarefa marcada desce para as Concluídas — parar esse relógio era
 * medir outra coisa.
 */

const HOJE = new Date(2026, 8, 16, 10, 0, 0);

const ATRASADA = {
  id: "t1",
  title: "Pedir orçamento ao florista",
  done: false,
  priority: "alta" as const,
  dueDate: "2026-09-10",
  quoteId: "q1",
  clientName: "Melanie",
  createdAt: "2026-09-01T09:00:00.000Z",
};
const DE_HOJE = {
  id: "t2",
  title: "Confirmar florista",
  done: false,
  priority: "normal" as const,
  dueDate: "2026-09-16",
  assignee: "Ana",
  createdAt: "2026-09-02T09:00:00.000Z",
};
const DE_AMANHA = {
  id: "t3",
  title: "Carregar carrinha",
  done: false,
  priority: "normal" as const,
  dueDate: "2026-09-17",
  clientName: "Daniela",
  createdAt: "2026-09-03T09:00:00.000Z",
};
const SEM_PRAZO = {
  id: "t4",
  title: "Rever seating plan",
  done: false,
  priority: "baixa" as const,
  createdAt: "2026-09-04T09:00:00.000Z",
};

const TODAS = [ATRASADA, DE_HOJE, DE_AMANHA, SEM_PRAZO];

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

let tarefas: unknown[] = [];

beforeEach(() => {
  __resetListCache();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(HOJE);
  tarefas = TODAS;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("/api/admin/equipa")
        ? resposta({ ok: true, nomes: [] })
        : resposta(tarefas),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function montar() {
  render(
    <ToastProvider>
      <Tarefas />
    </ToastProvider>,
  );
  // Pela contagem, e não por uma tarefa concreta: há casos aqui que montam
  // outra lista de tarefas, e a espera tem de valer para todos.
  await waitFor(() => expect(screen.getByText(/por fazer/)).toBeInTheDocument());
}

/**
 * O selector, já na forma final.
 *
 * A `Escolha` TROCA DE FORMA depois de montar — `<select>` nativo no primeiro
 * fotograma, combobox do padrão APG a seguir (ver o cabeçalho do
 * `escolher.testkit`). Agarrar o `<select>` transitório dá uma referência que
 * o React já substituiu: o `selectOptions` corre sobre um nó que saiu da
 * árvore, não acontece nada, e o teste falha a dizer que o ecrã não reagiu.
 *
 * E `findByRole("combobox")` sozinho NÃO chega: um `<select>` nativo também é
 * um combobox aos olhos do papel, portanto a consulta acerta nos dois e
 * devolve o que estiver lá quando corre. Deu um ficheiro que falhava ora num
 * caso ora noutro — a mesma corrida que o `Tarefas.equipa.test.tsx` já
 * apanhou. A espera é pela FORMA FINAL, e é por isso que ela é explícita.
 */
async function selector(nome: string): Promise<HTMLElement> {
  let controlo: HTMLElement | null = null;
  await waitFor(() => {
    const el = screen.getByRole("combobox", { name: nome });
    expect(el.tagName, "ainda não assentou na forma final").toBe("BUTTON");
    controlo = el;
  });
  return controlo!;
}

/** Os títulos das linhas que estão à vista, pela ordem em que se lêem. */
function titulosVisiveis(): string[] {
  return TODAS.map((t) => t.title).filter((t) => screen.queryByText(t) !== null);
}

/** Os cabeçalhos de grupo, pela ordem em que se lêem. */
function cabecalhosDeGrupo(): string[] {
  return (
    screen
      .queryAllByRole("heading", { level: 2 })
      .map((h) => h.textContent ?? "")
      // O nome da lista escolhida é também um `h2` no cimo do cartão, e não é um
      // cabeçalho de grupo: distingue-se por não ter contagem colada ao nome.
      .filter((t) => /\d$/.test(t))
  );
}

describe("a barra das listas (fase 05)", () => {
  it("desenha as cinco listas inteligentes, com a contagem do que está por fazer", async () => {
    await montar();
    const barra = screen.getByRole("navigation", { name: "Listas de tarefas" });
    for (const [rotulo, conta] of [
      ["Hoje", "2"],
      ["Esta semana", "3"],
      ["Atrasadas", "1"],
      ["Sem data", "1"],
      ["Todas", "4"],
    ] as const) {
      const botao = within(barra).getByRole("button", { name: new RegExp(`^${rotulo}`) });
      expect(within(botao).getByText(conta), `${rotulo} contou mal`).toBeInTheDocument();
    }
  });

  it("abre em «Todas», e nenhuma tarefa fica escondida no primeiro desenho", async () => {
    // A escolha está justificada em `LISTA_POR_OMISSAO`: nesta casa o prazo é
    // opcional, e abrir em «Hoje» dava um ecrã vazio por cima de uma lista cheia.
    await montar();
    expect(titulosVisiveis()).toHaveLength(4);
    expect(screen.getByRole("button", { name: /^Todas/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("escolher «Atrasadas» deixa só o que já passou do prazo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await montar();
    await user.click(screen.getByRole("button", { name: /^Atrasadas/ }));
    expect(titulosVisiveis()).toEqual([ATRASADA.title]);
    expect(screen.getByRole("heading", { name: "Atrasadas", level: 2 })).toBeInTheDocument();
  });

  it("«Hoje» apanha o dia de hoje E o que já passou — as duas, e não uma", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await montar();
    await user.click(screen.getByRole("button", { name: /^Hoje/ }));
    expect(titulosVisiveis().sort()).toEqual([ATRASADA.title, DE_HOJE.title].sort());
  });

  it("a selecção não se diz só com cor: leva `aria-pressed` e peso", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await montar();
    const semData = screen.getByRole("button", { name: /^Sem data/ });
    await user.click(semData);
    expect(semData).toHaveAttribute("aria-pressed", "true");
    expect(semData.className).toContain("font-semibold");
    expect(screen.getByRole("button", { name: /^Todas/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("há uma lista por evento com trabalho — e filtra por esse evento", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await montar();
    const barra = screen.getByRole("navigation", { name: "Listas de tarefas" });
    // Duas tarefas com cliente, dois eventos, por ordem alfabética.
    expect(within(barra).getByRole("button", { name: /^Daniela/ })).toBeInTheDocument();
    await user.click(within(barra).getByRole("button", { name: /^Melanie/ }));
    expect(titulosVisiveis()).toEqual([ATRASADA.title]);
  });

  it("sem tarefas de evento nenhum não há cabeçalho «Eventos» à espera", async () => {
    tarefas = [DE_HOJE, SEM_PRAZO];
    await montar();
    const barra = screen.getByRole("navigation", { name: "Listas de tarefas" });
    expect(within(barra).queryByText("Eventos")).toBeNull();
    expect(within(barra).getByText("Listas")).toBeInTheDocument();
  });

  it("uma lista sem nada mostra o estado vazio — sem cabeçalho e sem selectores", async () => {
    // Parte 8: «contador de zero como cabeçalho» e «separador por baixo de um
    // cabeçalho sem conteúdo». Com a lista vazia não fica lá nada disso.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    tarefas = [DE_HOJE];
    await montar();
    await user.click(screen.getByRole("button", { name: /^Sem data/ }));
    expect(screen.getByText("Nada por fazer nesta lista")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Agrupar por" })).toBeNull();
    expect(cabecalhosDeGrupo()).toEqual([]);
  });
});

describe("agrupar e ordenar (fase 06)", () => {
  it("por omissão agrupa por data, com as atrasadas à frente e os cabeçalhos pegados ao topo", async () => {
    await montar();
    expect(cabecalhosDeGrupo()).toEqual(["Atrasadas1", "Hoje1", "Amanhã1", "Sem data1"]);
    // `sticky` é o que faz a lista longa continuar a dizer onde se está.
    for (const h of screen.getAllByRole("heading", { level: 2 })) {
      if (/\d$/.test(h.textContent ?? "")) expect(h.className).toContain("sticky");
    }
  });

  it("um grupo sem tarefas não desenha cabeçalho nenhum", async () => {
    tarefas = [DE_HOJE];
    await montar();
    expect(cabecalhosDeGrupo()).toEqual(["Hoje1"]);
  });

  it("agrupar por responsável junta quem não tem ninguém no fim", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await montar();
    await escolher(user, await selector("Agrupar por"), /Responsável/);
    expect(cabecalhosDeGrupo()).toEqual(["Ana1", "Sem responsável3"]);
  });

  it("agrupar por evento junta quem não tem evento no fim", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await montar();
    await escolher(user, await selector("Agrupar por"), /Evento/);
    expect(cabecalhosDeGrupo()).toEqual(["Daniela1", "Melanie1", "Sem evento2"]);
  });

  it("«Nenhum» tira os cabeçalhos e deixa a lista corrida", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await montar();
    await escolher(user, await selector("Agrupar por"), /Nenhum/);
    expect(cabecalhosDeGrupo()).toEqual([]);
    expect(titulosVisiveis()).toHaveLength(4);
  });

  it("ordenar por prioridade põe a alta à frente dentro do grupo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await montar();
    await escolher(user, await selector("Agrupar por"), /Nenhum/);
    await escolher(user, await selector("Ordenar por"), /Prioridade/);
    const linhas = screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"));
    expect(linhas[0]).toBe(ATRASADA.title);
    expect(linhas.at(-1)).toBe(SEM_PRAZO.title);
  });

  describe("«Manual» — a costura que a fase 09 vai puxar", () => {
    it("marca as linhas como arrastáveis, e só quando está escolhida", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await montar();
      expect(document.querySelectorAll("[data-arrastavel]")).toHaveLength(0);
      await escolher(user, await selector("Ordenar por"), /Manual/);
      expect(document.querySelectorAll("[data-arrastavel]")).toHaveLength(4);
    });

    it("desfaz o agrupamento, porque arrastar entre dois dias seria mudar a data", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await montar();
      await escolher(user, await selector("Ordenar por"), /Manual/);
      expect(cabecalhosDeGrupo()).toEqual([]);
    });

    it("e escolher um agrupamento devolve a ordem à data — os dois selectores dizem-no", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await montar();
      await escolher(user, await selector("Ordenar por"), /Manual/);
      await escolher(user, await selector("Agrupar por"), /Data/);
      expect(document.querySelectorAll("[data-arrastavel]")).toHaveLength(0);
      expect(cabecalhosDeGrupo()).toEqual(["Atrasadas1", "Hoje1", "Amanhã1", "Sem data1"]);
    });

    it("escolher «Manual» não faz a lista saltar — a ordem de arranque é a que está no ecrã", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await montar();
      const antes = screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"));
      await escolher(user, await selector("Ordenar por"), /Manual/);
      expect(screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual(
        antes,
      );
    });
  });
});

/**
 * Revisão de 14/11: a LINHA de uma tarefa sem `clientName` mostrava-se sem
 * nome, com o grupo por cima já a dizer o do pedido. Lêem o mesmo sítio.
 */
describe("a linha da tarefa mostra o nome do pedido", () => {
  it("sem `clientName`, vai buscar o nome ao pedido", async () => {
    tarefas = [{ ...ATRASADA, clientName: undefined }];
    render(
      <ToastProvider>
        <Tarefas nomesDosPedidos={new Map([["q1", "Melanie e Sebastien"]])} />
      </ToastProvider>,
    );
    const linha = (await screen.findByText("Pedir orçamento ao florista")).closest("li")!;
    expect(within(linha).getByText("Melanie e Sebastien")).toBeInTheDocument();
  });
});
