// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Tarefas from "./Tarefas";
import type { PedidoDaPaleta } from "./procura-em-tudo";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS ACÇÕES EM VÁRIAS TAREFAS (BO 4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Escolhe-se com ⇧/⌘+clique no título (como nos Temas), com ⌘A, ou — no
 * telemóvel — com o botão «Selecionar». A barra tem «Concluir (N)», «Adiar uma
 * semana» e «Eliminar (N)», e cada uma tem «Anular». O pedido da paleta abre
 * uma tarefa ou a linha de escrever, uma vez.
 */

const HOJE = new Date(2026, 10, 17, 10, 0, 0);

const t = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  title,
  done: false,
  priority: "normal" as const,
  createdAt: `2026-11-0${id.slice(1)}T09:00:00.000Z`,
  ...over,
});
const A = t("t1", "Confirmar florista", { dueDate: "2026-11-20" });
const B = t("t2", "Rever seating plan");
const C = t("t3", "Carregar carrinha", { dueDate: "2026-11-01" });

const resposta = (body: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 500, headers: new Headers(), json: async () => body }) as Response;

let escritas: { url: string; metodo: string; corpo: Record<string, unknown> }[] = [];
let falhar: (url: string, metodo: string) => boolean = () => false;

beforeEach(() => {
  __resetListCache();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(HOJE);
  escritas = [];
  falhar = () => false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? "GET";
      const u = String(url);
      if (u.includes("/api/admin/equipa")) return resposta({ ok: true, nomes: [] });
      if (metodo === "GET") return resposta([A, B, C]);
      escritas.push({ url: u, metodo, corpo: JSON.parse(String(init?.body ?? "{}")) });
      if (falhar(u, metodo)) return resposta({ error: "não" }, false);
      if (metodo === "DELETE")
        return resposta({ ok: true, reciclagem: { id: `r-${u.slice(-2)}` } });
      return resposta({ ok: true });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function montar(
  props: {
    pedidoDaPaleta?: PedidoDaPaleta;
    pedidoDeNova?: number;
    pedidoDeNovaServido?: number;
    onPedidoDeNovaServido?: (n: number) => void;
  } = {},
) {
  return render(
    <ToastProvider>
      <Tarefas {...props} />
    </ToastProvider>,
  );
}

const titulo = (nome: string) =>
  screen.getByRole("button", { name: new RegExp(`^(Abrir|Selecionar) «${nome}»$`) });
const barra = () => screen.queryByRole("toolbar", { name: "Ações nas tarefas selecionadas" });

describe("escolher várias", () => {
  it("⌘+clique soma, ⇧+clique estende, e a barra conta o que se vê", async () => {
    montar();
    await screen.findByText(A.title);
    expect(barra()).toBeNull();

    fireEvent.click(titulo(A.title), { metaKey: true });
    expect(within(barra()!).getByText("1 selecionada")).toBeTruthy();
    // Com um lote começado, o título diz que escolhe — e diz se está escolhido.
    expect(titulo(A.title)).toHaveAttribute("aria-pressed", "true");
    expect(titulo(B.title)).toHaveAttribute("aria-pressed", "false");

    const ordem = [...document.querySelectorAll("[data-tarefa]")].map(
      (l) => (l as HTMLElement).dataset.tarefa,
    );
    const ultima = ordem[ordem.length - 1]!;
    const nomeDa = { t1: A.title, t2: B.title, t3: C.title } as Record<string, string>;
    fireEvent.click(titulo(nomeDa[ultima]), { shiftKey: true });
    // Da âncora (A) até à última, pela ordem do ecrã.
    const desde = ordem.indexOf("t1");
    expect(within(barra()!).getByText(`${ordem.length - desde} selecionadas`)).toBeTruthy();
  });

  it("sem lote, um clique simples continua a abrir o detalhe", async () => {
    montar();
    await screen.findByText(A.title);
    fireEvent.click(titulo(A.title));
    expect(barra()).toBeNull();
    expect(document.querySelector('[data-tarefa="t1"]')).toHaveAttribute("aria-current", "true");
  });

  it("⌘A escolhe as que estão à vista e Esc larga o lote", async () => {
    montar();
    await screen.findByText(A.title);
    fireEvent.keyDown(document.body, { key: "a", metaKey: true });
    expect(within(barra()!).getByText("3 selecionadas")).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(barra()).toBeNull();
  });

  it("⌘A dentro de um campo é do campo", async () => {
    montar();
    await screen.findByText(A.title);
    fireEvent.click(screen.getByRole("button", { name: "Nova tarefa" }));
    const campo = await screen.findByLabelText("Nova tarefa");
    fireEvent.keyDown(campo, { key: "a", metaKey: true });
    expect(barra()).toBeNull();
  });

  it("no telemóvel: «Selecionar» e depois toques simples escolhem, sem abrir o detalhe", async () => {
    montar();
    await screen.findByText(A.title);
    fireEvent.click(screen.getByRole("button", { name: "Selecionar" }));
    expect(within(barra()!).getByText("Toca nas tarefas para as escolher")).toBeTruthy();
    fireEvent.click(titulo(B.title));
    fireEvent.click(titulo(C.title));
    expect(within(barra()!).getByText("2 selecionadas")).toBeTruthy();
    expect(document.querySelector("[aria-current]")).toBeNull();
    // «Cancelar» sai do modo.
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(barra()).toBeNull();
  });
});

describe("as três acções, com «Anular»", () => {
  async function escolherTodas() {
    montar();
    await screen.findByText(A.title);
    fireEvent.keyDown(document.body, { key: "a", metaKey: true });
    // Com a máquina carregada (CI), a barra do lote desenha-se um ciclo depois
    // do ⌘A: espera-se por ela em vez de a ler logo (falhou assim a 17/11).
    await screen.findByRole("toolbar", { name: "Ações nas tarefas selecionadas" });
  }

  it("«Concluir (N)» marca as por fazer e «Anular» desmarca-as", async () => {
    await escolherTodas();
    fireEvent.click(within(barra()!).getByRole("button", { name: "Concluir (3)" }));
    await waitFor(() => expect(escritas.filter((e) => e.metodo === "PATCH")).toHaveLength(3));
    expect(escritas.every((e) => e.corpo.done === true)).toBe(true);
    expect(barra()).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Anular" }));
    await waitFor(() => expect(escritas.filter((e) => e.corpo.done === false)).toHaveLength(3));
    expect(await screen.findByText("Anulado.")).toBeTruthy();
  });

  it("«Adiar uma semana» conta do prazo, ou de hoje se já passou, e «Anular» repõe", async () => {
    await escolherTodas();
    fireEvent.click(within(barra()!).getByRole("button", { name: "Adiar uma semana" }));
    await waitFor(() => expect(escritas).toHaveLength(3));
    const prazo = (id: string) => escritas.find((e) => e.url.endsWith(id))?.corpo.dueDate;
    expect(prazo("t1")).toBe("2026-11-27"); // 20 + 7
    expect(prazo("t2")).toBe("2026-11-24"); // sem prazo: hoje + 7
    expect(prazo("t3")).toBe("2026-11-24"); // já passou: hoje + 7

    escritas = [];
    fireEvent.click(await screen.findByRole("button", { name: "Anular" }));
    await waitFor(() => expect(escritas).toHaveLength(3));
    expect(prazo("t1")).toBe("2026-11-20");
    expect(prazo("t2")).toBeNull(); // quem não tinha prazo volta a não ter
    expect(prazo("t3")).toBe("2026-11-01");
  });

  it("«Eliminar (N)» pergunta com os nomes, vai à Reciclagem, e «Anular» repõe todas", async () => {
    await escolherTodas();
    fireEvent.click(within(barra()!).getByRole("button", { name: "Eliminar (3)" }));
    const caixa = await screen.findByRole("dialog");
    expect(within(caixa).getByText(A.title)).toBeTruthy();
    expect(escritas).toHaveLength(0); // perguntar não apaga nada
    fireEvent.click(within(caixa).getByRole("button", { name: "Eliminar 3 tarefas" }));
    await waitFor(() => expect(escritas.filter((e) => e.metodo === "DELETE")).toHaveLength(3));
    await waitFor(() => expect(screen.queryByText(A.title)).toBeNull());

    fireEvent.click(await screen.findByRole("button", { name: "Anular" }));
    await waitFor(() =>
      expect(escritas.filter((e) => e.url.includes("/api/reciclagem/"))).toHaveLength(3),
    );
  });

  it("se uma falhar, a linha volta, diz-se UMA vez, e as que ficaram têm «Anular»", async () => {
    falhar = (u, m) => m === "PATCH" && u.endsWith("t2");
    await escolherTodas();
    fireEvent.click(within(barra()!).getByRole("button", { name: "Concluir (3)" }));
    expect(await screen.findByText(/2 concluída\(s\), 1 não/)).toBeTruthy();
    const caixaDeB = screen.getByRole("checkbox", { name: B.title });
    expect(caixaDeB).not.toBeChecked();
    // O «Anular» é das duas que ficaram concluídas (2.ª revisão · 10).
    expect(await screen.findByRole("button", { name: "Anular" })).toBeTruthy();
  });
});

describe("o pedido da paleta", () => {
  it("abre a tarefa pedida no detalhe", async () => {
    montar({ pedidoDaPaleta: { id: "t2" } });
    await screen.findByText(A.title);
    await waitFor(() =>
      expect(document.querySelector('[data-tarefa="t2"]')).toHaveAttribute("aria-current", "true"),
    );
  });

  it("«Nova tarefa» abre a linha de escrever com o cursor lá", async () => {
    montar({ pedidoDaPaleta: { novo: true } });
    await screen.findByText(A.title);
    await waitFor(() => expect(screen.getByLabelText("Nova tarefa")).toHaveFocus());
  });

  it("voltar às Tarefas com um ⌘N antigo no contador NÃO reabre a linha", async () => {
    montar({ pedidoDeNova: 3 });
    await screen.findByText(A.title);
    expect(screen.queryByLabelText("Nova tarefa")).toBeNull();
  });

  it("voltar com o pedido já servido (guardado por quem monta) também NÃO reabre", async () => {
    montar({ pedidoDeNova: 3, pedidoDeNovaServido: 3 });
    await screen.findByText(A.title);
    expect(screen.queryByLabelText("Nova tarefa")).toBeNull();
  });

  it("um toque em «Nova tarefa» dado ANTES de as Tarefas montarem abre a linha quando montam (lote de 17/11)", async () => {
    const servido = vi.fn();
    montar({ pedidoDeNova: 1, pedidoDeNovaServido: 0, onPedidoDeNovaServido: servido });
    expect(await screen.findByLabelText("Nova tarefa")).toBeTruthy();
    expect(servido).toHaveBeenCalledWith(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   REVISÃO INDEPENDENTE DO BO 4 (PR #480)
   ══════════════════════════════════════════════════════════════════════════ */

const listas = () => screen.getByRole("navigation", { name: "Listas de tarefas" });

describe("revisão · 4 — um Esc fecha só a camada de cima", () => {
  it("com o detalhe aberto e um lote escolhido, o Esc fecha o detalhe e deixa o lote", async () => {
    montar();
    await screen.findByText(A.title);
    fireEvent.click(titulo(A.title)); // abre o detalhe
    fireEvent.click(titulo(B.title), { metaKey: true }); // começa um lote
    expect(within(barra()!).getByText("1 selecionada")).toBeTruthy();
    fireEvent.keyDown(titulo(B.title), { key: "Escape" });
    await waitFor(() => expect(document.querySelector("[data-tarefa][aria-current]")).toBeNull());
    expect(barra()).not.toBeNull();
    // O segundo Esc já é do lote.
    fireEvent.keyDown(titulo(B.title), { key: "Escape" });
    await waitFor(() => expect(barra()).toBeNull());
  });
});

describe("revisão · 5 — um lote escondido não deixa o ecrã preso a escolher", () => {
  it("mudar para uma lista onde as escolhidas não estão larga-as", async () => {
    montar();
    await screen.findByText(A.title);
    fireEvent.click(titulo(A.title), { metaKey: true }); // A tem prazo
    expect(barra()).not.toBeNull();
    fireEvent.click(within(listas()).getByRole("button", { name: /Sem data/ }));
    await waitFor(() => expect(barra()).toBeNull());
    expect(titulo(B.title)).toHaveAccessibleName(`Abrir «${B.title}»`);
  });
});

describe("revisão · 6 — «Adiar uma semana» deixa as concluídas de fora", () => {
  it("as feitas não mudam de prazo", async () => {
    montar();
    await screen.findByText(A.title);
    // C passa a feita, e as concluídas abrem-se para entrarem no ⌘A.
    fireEvent.click(screen.getByRole("checkbox", { name: C.title }));
    await waitFor(() => expect(escritas).toHaveLength(1));
    escritas = [];
    fireEvent.click(
      await screen.findByRole("button", { name: /Concluídas \(1\)/ }, { timeout: 4000 }),
    );
    fireEvent.keyDown(document.body, { key: "a", metaKey: true });
    expect(within(barra()!).getByText("3 selecionadas")).toBeTruthy();
    fireEvent.click(within(barra()!).getByRole("button", { name: "Adiar uma semana" }));
    await waitFor(() => expect(escritas).toHaveLength(2));
    expect(escritas.some((e) => e.url.endsWith("t3"))).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SEGUNDA REVISÃO
   ══════════════════════════════════════════════════════════════════════════ */

describe("2.ª revisão · 3 — a selecção sobrevive aos filtros, como nos Pedidos", () => {
  it("escolhida em «Todas», escondida em «Sem data», volta escolhida em «Todas»", async () => {
    montar();
    await screen.findByText(A.title);
    fireEvent.click(titulo(A.title), { metaKey: true }); // A tem prazo
    fireEvent.click(within(listas()).getByRole("button", { name: /Sem data/ }));
    await waitFor(() => expect(barra()).toBeNull());
    // A âncora (A) não está à vista: um ⇧+clique aqui é um clique simples.
    fireEvent.click(titulo(B.title), { shiftKey: true });
    expect(within(barra()!).getByText("1 selecionada")).toBeTruthy();
    fireEvent.click(within(listas()).getByRole("button", { name: /^Todas/ }));
    expect(await within(barra()!).findByText("2 selecionadas")).toBeTruthy();
  });
});

describe("2.ª revisão · 10 — adiar com uma falha: as que ficaram têm «Anular»", () => {
  it("o aviso diz a falha, e o «Anular» repõe as que mudaram", async () => {
    falhar = (u, m) => m === "PATCH" && u.endsWith("t2") && escritas.length <= 3;
    montar();
    await screen.findByText(A.title);
    fireEvent.keyDown(document.body, { key: "a", metaKey: true });
    fireEvent.click(within(barra()!).getByRole("button", { name: "Adiar uma semana" }));
    expect(await screen.findByText(/2 adiada\(s\), 1 não/)).toBeTruthy();
    escritas = [];
    falhar = () => false;
    fireEvent.click(await screen.findByRole("button", { name: "Anular" }));
    await waitFor(() => expect(escritas).toHaveLength(2));
    expect(escritas.some((e) => e.url.endsWith("t2"))).toBe(false);
  });
});
