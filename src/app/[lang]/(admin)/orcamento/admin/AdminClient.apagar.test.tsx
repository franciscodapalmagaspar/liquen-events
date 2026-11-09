// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminClient from "./AdminClient";
import type { Quote } from "@/lib/orcamento/types";

/**
 * O ORÇAMENTO DE TEMPO DOS CASOS QUE PASSAM PELO ECRÃ DA PROPOSTA.
 *
 * A lista de Pedidos deixou de abrir o painel de detalhe: leva ao ecrã de fazer
 * a proposta, na página toda (`irFazerAProposta`, no `AdminClient.tsx`). O
 * painel ficou a uma tecla, no «Abrir o pedido» desse ecrã — e esse ecrã é
 * preguiçoso (`./lazy`). Em jsdom o `import()` a resolver não cabe nos 5 s por
 * omissão.
 */
vi.setConfig({ testTimeout: 20_000 });

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «TENS A CERTEZA?» NÃO É UMA PERGUNTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do inventário: 63 acções irreversíveis, 39 sem uma pergunta que diga o que se
 * perde. Aqui estavam três das piores, e todas no mesmo ecrã:
 *
 *  · **apagar um pedido** perguntava — e não dizia QUAL, nem o que ia atrás
 *    dele (as propostas, os pagamentos, os convidados, o histórico);
 *  · **apagar em lote** dizia quantos, nunca quais. Quem lê «12 pedidos» não
 *    tem como saber se a selecção é a que pensa que é;
 *  · **sair** não perguntava nada — nem com trabalho por gravar. Fechar o
 *    painel de UM pedido perguntava; sair do back office inteiro, não.
 *
 * E as três eram `window.confirm`, que num telemóvel de 375 px é uma caixa do
 * sistema onde não cabe uma lista e onde o botão diz «OK» — a última palavra
 * que se quer debaixo de um gesto que apaga um casamento inteiro.
 */

const avisos = vi.hoisted(() => ({ ditos: [] as string[] }));
vi.mock("./Toast", () => ({
  useToast: () => ({ toast: (texto: string) => avisos.ditos.push(texto) }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const PEDIDO = {
  id: "LIQ-7",
  name: "Ana Marques",
  email: "ana@exemplo.pt",
  status: "novo",
  submittedAt: "2026-05-01T10:00:00.000Z",
  priceBreakdown: { total: 0 },
  quotedPrice: 4500,
  payments: [{ id: "p1" }, { id: "p2" }],
  guestList: Array.from({ length: 148 }, (_, i) => ({ id: `g${i}` })),
  activityLog: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
} as unknown as Quote;

function resposta(status: number, body: unknown, completo = true) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(completo ? { "x-pedido": "completo" } : {}),
    json: async () => body,
  } as unknown as Response;
}

/** Regista os métodos usados, para se provar que cancelar NÃO escreve. */
let chamadas: { metodo: string; url: string }[] = [];

function servidor() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    chamadas.push({ metodo, url: String(url) });
    if (String(url).includes("/api/orcamento/LIQ-7") && metodo === "GET") {
      return resposta(200, PEDIDO);
    }
    if (metodo === "GET") return resposta(200, []);
    return resposta(200, { ok: true });
  });
}

/**
 * Abre o pedido e o menu de acções («Mais»).
 *
 * `noPainel` leva-o até ao menu do PAINEL DE DETALHE, que é outro sítio: a
 * lista leva agora ao ecrã de fazer a proposta, e o painel abre-se de lá, no
 * «Abrir o pedido».
 */
async function abrirMenuDoPedido(pedido: Quote = PEDIDO, noPainel = false) {
  render(<AdminClient initialQuotes={[pedido]} userName="Catarina" />);
  const alvos = await screen.findAllByText(pedido.name);
  await userEvent.click(alvos[0]);
  if (noPainel) {
    // O ecrã da proposta é preguiçoso; espera-se por ele antes de lhe tocar.
    await userEvent.click(
      await screen.findByRole("button", { name: /^Abrir o pedido$/ }, { timeout: 10_000 }),
    );
  }
  // A lista pode aterrar no ecrã «Fazer proposta» em vez do painel (é o que
  // faz hoje com um pedido novo); nesse caso abre-se o pedido por lá — o mesmo
  // caminho do `noPainel`. Sem isto, o teste que corresse primeiro sem o
  // `noPainel` não encontrava o «Mais» e falhava sempre (CI do #233, 16/10).
  if (!noPainel) {
    const abrir = await screen
      .findByRole("button", { name: /^Abrir o pedido$/ }, { timeout: 5_000 })
      .catch(() => null);
    if (abrir && screen.queryAllByRole("button", { name: /^Mais$/i }).length === 0) {
      await userEvent.click(abrir);
    }
  }
  await waitFor(() => expect(screen.queryByText(/a abrir o pedido de/i)).toBeNull());
  // Há mais do que um «Mais» no ecrã (a lista tem o seu); o do painel de
  // detalhe é o último a ser desenhado.
  const menus = await screen.findAllByRole("button", { name: /^Mais$/i });
  await userEvent.click(menus[menus.length - 1]);
}

beforeEach(() => {
  avisos.ditos = [];
  chamadas = [];
  localStorage.clear();
  vi.stubGlobal("fetch", servidor());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminClient — apagar um pedido", () => {
  it("a pergunta nomeia o pedido e enumera o que vai atrás dele", async () => {
    await abrirMenuDoPedido(PEDIDO, true);
    const apagar = await screen.findByText(/^Apagar pedido$/i);
    await userEvent.click(apagar);

    const caixa = await screen.findByRole("dialog");
    // Nomeia.
    expect(within(caixa).getByText(/Apagar o pedido de Ana Marques\?/i)).toBeInTheDocument();
    // E diz o que se perde, com números.
    expect(within(caixa).getByText(/2 pagamentos registados/i)).toBeInTheDocument();
    expect(within(caixa).getByText(/148 convidados/i)).toBeInTheDocument();
    expect(within(caixa).getByText(/3 entradas no histórico/i)).toBeInTheDocument();
    // O separador de milhares em pt-PT é um espaço estreito, não um ponto —
    // por isso o padrão não o fixa.
    expect(within(caixa).getByText(/valor combinado/i).textContent).toMatch(/4.?500,00/);
    // O botão repete o verbo — nunca «OK» nem «Confirmar».
    expect(within(caixa).getByRole("button", { name: /^Apagar o pedido$/i })).toBeInTheDocument();
  });

  it("oferece a alternativa não destrutiva", async () => {
    await abrirMenuDoPedido();
    await userEvent.click(await screen.findByText(/^Apagar pedido$/i));
    const caixa = await screen.findByRole("dialog");
    // Quem quer tirar da lista quase sempre quer arquivar, e não apagar.
    expect(within(caixa).getByText(/arquivar/i)).toBeInTheDocument();
  });

  it("cancelar não escreve nada", async () => {
    await abrirMenuDoPedido();
    await userEvent.click(await screen.findByText(/^Apagar pedido$/i));
    const caixa = await screen.findByRole("dialog");
    await userEvent.click(within(caixa).getByRole("button", { name: /^Cancelar$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(chamadas.filter((c) => c.metodo === "DELETE")).toEqual([]);
    // E o pedido continua na lista.
    expect(screen.getAllByText("Ana Marques").length).toBeGreaterThan(0);
  });

  it("confirmar apaga, e o aviso de sucesso também nomeia", async () => {
    await abrirMenuDoPedido();
    await userEvent.click(await screen.findByText(/^Apagar pedido$/i));
    const caixa = await screen.findByRole("dialog");
    await userEvent.click(within(caixa).getByRole("button", { name: /^Apagar o pedido$/i }));

    await waitFor(() => expect(chamadas.some((c) => c.metodo === "DELETE")).toBe(true));
    await waitFor(() => expect(avisos.ditos.join(" ")).toContain("Ana Marques"));
  });

  it("a pergunta diz que fica 30 dias na Reciclagem, e o aviso também (R3b)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        chamadas.push({ metodo, url: String(url) });
        if (String(url).includes("/api/orcamento/LIQ-7") && metodo === "GET") {
          return resposta(200, PEDIDO);
        }
        if (metodo === "DELETE") return resposta(200, { ok: true, reciclagem: { id: "r7" } });
        if (metodo === "GET") return resposta(200, []);
        return resposta(200, { ok: true });
      }),
    );
    await abrirMenuDoPedido();
    await userEvent.click(await screen.findByText(/^Apagar pedido$/i));
    const caixa = await screen.findByRole("dialog");
    expect(within(caixa).getByText(/Fica 30 dias na Reciclagem/)).toBeTruthy();
    await userEvent.click(within(caixa).getByRole("button", { name: /^Apagar o pedido$/i }));
    await waitFor(() =>
      expect(avisos.ditos.join(" ")).toContain(
        "Pedido de Ana Marques apagado. Fica 30 dias na Reciclagem.",
      ),
    );
  });

  it("uma falha ao apagar diz porquê e nomeia o pedido", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        if (metodo === "DELETE") return resposta(503, { error: "Erro interno" });
        if (String(url).includes("/api/orcamento/LIQ-7")) return resposta(200, PEDIDO);
        return resposta(200, []);
      }),
    );
    await abrirMenuDoPedido();
    await userEvent.click(await screen.findByText(/^Apagar pedido$/i));
    const caixa = await screen.findByRole("dialog");
    await userEvent.click(within(caixa).getByRole("button", { name: /^Apagar o pedido$/i }));

    await waitFor(() => expect(avisos.ditos.join(" ")).toMatch(/não está a aceitar gravações/i));
    expect(avisos.ditos.join(" ")).toContain("Ana Marques");
    // E o pedido NÃO saiu da lista.
    expect(screen.getAllByText("Ana Marques").length).toBeGreaterThan(0);
  });

  /**
   * ── UM PEDIDO SEM NADA POR BAIXO ─────────────────────────────────────
   *
   * A lista só leva o que existe: «0 pagamentos» a meio de uma pergunta
   * destrutiva é ruído, e ruído numa pergunta destas é o que ensina a
   * saltá-la.
   */
  it("um pedido vazio não enumera zeros", async () => {
    const vazio = {
      id: "LIQ-8",
      name: "João Sousa",
      email: "j@exemplo.pt",
      status: "novo",
      submittedAt: "2026-05-01T10:00:00.000Z",
      priceBreakdown: { total: 0 },
    } as unknown as Quote;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/api/orcamento/LIQ-8") ? resposta(200, vazio) : resposta(200, []),
      ),
    );
    await abrirMenuDoPedido(vazio);
    await userEvent.click(await screen.findByText(/^Apagar pedido$/i));

    const caixa = await screen.findByRole("dialog");
    expect(within(caixa).queryByText(/^0 /)).toBeNull();
    expect(within(caixa).queryByText(/Desaparece com isto/i)).toBeNull();
    // Mas o título e o aviso continuam lá.
    expect(within(caixa).getByText(/Apagar o pedido de João Sousa\?/i)).toBeInTheDocument();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SAIR NÃO PERGUNTAVA NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Nem sequer com trabalho por gravar. Fechar o painel de UM pedido perguntava
 * (o `discardGuard`); sair do back office inteiro — que fecha o painel e mais
 * tudo o resto — não perguntava. Era o buraco maior dos dois, e o mais fácil de
 * encontrar por acidente: o «Sair» está na barra, ao lado de tudo.
 *
 * E o contrapeso, que vale tanto como a pergunta: **sem nada por gravar, sai
 * sem perguntar.** Uma confirmação que aparece sempre é uma confirmação que se
 * carrega sem ler — e a seguir já não protege nada.
 */
describe("AdminClient — sair", () => {
  it("sem nada por gravar, sai sem perguntar", async () => {
    render(<AdminClient initialQuotes={[PEDIDO]} userName="Catarina" />);
    await userEvent.click(await screen.findByRole("button", { name: /^Sair$/i }));

    await waitFor(() =>
      expect(chamadas.some((c) => c.url.includes("/api/admin/logout"))).toBe(true),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
