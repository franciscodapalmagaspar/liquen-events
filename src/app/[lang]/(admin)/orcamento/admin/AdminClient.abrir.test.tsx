// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
 * O ESTÚDIO FICA DE FORA.
 *
 * O caminho até ao painel passa agora pelo ecrã de fazer a proposta, e esse
 * ecrã monta o estúdio — que lê o rascunho da proposta em
 * `/api/orcamento/<id>/proposta-rascunho`. Neste ficheiro o servidor é falso e
 * responde às avarias por `id`, portanto essa leitura apanha a MESMA avaria que
 * o caso está a montar, e o que se mede deixa de ser o que se queria medir.
 *
 * O que estes casos medem é como o PAINEL diz que não conseguiu abrir. O
 * estúdio não entra nisso.
 */
vi.mock("./lazy", async (original) => ({
  ...(await original<typeof import("./lazy")>()),
  ProposalStudio: () => null,
}));

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ABRIR UM PEDIDO ERA MUDO — SEIS VEZES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do inventário de esperas: seis portas para abrir um pedido — a lista, o
 * Kanban, o Calendário, os Clientes, o Acompanhamento e a Visão Geral — e todas
 * mudas. Toca-se, e não acontece nada visível enquanto o servidor não responde.
 * Num 4G de quinta são segundos, e o gesto seguinte é tocar outra vez.
 *
 * O painel espera de propósito (abrir com o resumo apagava listas de
 * convidados — ver `comPedidoInteiro`). O que não pode é esperar em silêncio.
 *
 * E a falha tinha o segundo defeito: **quatro avarias diferentes com a mesma
 * frase.** A pior é a sessão caída, que responde **200** com um corpo curto —
 * dizer-lhe «Verifica a ligação e tenta de novo» é mandar fazer a única coisa
 * que não resolve nada.
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
} as unknown as Quote;

function resposta(status: number, body: unknown, completo = true) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(completo ? { "x-pedido": "completo" } : {}),
    json: async () => body,
  } as unknown as Response;
}

/** As leituras de arranque das outras vistas respondem vazio. */
function servidor(aoAbrir: () => Response | Promise<Response>) {
  return vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/orcamento/LIQ-7")) return aoAbrir();
    // Tudo o resto que o painel lê ao arrancar (tarefas, lembretes, avisos)
    // responde uma lista vazia: um objecto rebentava o `for…of` dos
    // `Reminders` e o teste falhava por uma razão que não é a que mede.
    return resposta(200, []);
  });
}

async function abrir() {
  render(<AdminClient initialQuotes={[PEDIDO]} userName="Catarina" />);
  // O nome aparece em mais do que um sítio (a lista e os recentes); o que
  // interessa é tocar num deles.
  const alvos = await screen.findAllByText("Ana Marques");
  await userEvent.click(alvos[0]);
  /**
   * ── A LISTA JÁ NÃO ESPERA; QUEM ESPERA É O PAINEL ────────────────────────
   *
   * Carregar num cliente na lista leva ao ecrã de fazer a proposta e não espera
   * por nada: o estúdio trabalha sobre o pedido que já está na lista, e a
   * versão completa entra por trás (`irFazerAProposta`). A espera COM NOME — e
   * as quatro avarias que este ficheiro distingue — passaram a ser as do
   * PAINEL, atrás do «Abrir o pedido».
   *
   * O clique de cima pode cair em qualquer uma das portas: o nome do cliente
   * aparece na lista E nos «vistos recentemente», e essa segunda abre o painel
   * directamente. Por isso a passagem pelo ecrã da proposta é CONDICIONAL —
   * dá-se o passo só quando ele existe. O que este ajudante promete é uma
   * coisa só: no fim, é o painel que está aberto.
   */
  const pelaProposta = await screen
    .findByRole("button", { name: /^Abrir o pedido$/ }, { timeout: 8_000 })
    .catch(() => null);
  if (pelaProposta) await userEvent.click(pelaProposta);
}

beforeEach(() => {
  avisos.ditos = [];
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminClient — abrir um pedido", () => {
  it("diz que está a abrir, e diz de quem", async () => {
    // O pedido fica pendurado: é este o instante que interessa ver.
    // Uma lista e não uma variável: atribuída dentro de um `new Promise`, o
    // TypeScript não vê a atribuição e estreita o tipo para `null`.
    const soltar: Array<() => void> = [];
    vi.stubGlobal(
      "fetch",
      servidor(
        () =>
          new Promise<Response>((r) => {
            soltar.push(() => r(resposta(200, { ...PEDIDO, guestList: [] })));
          }),
      ),
    );

    await abrir();

    await waitFor(() => expect(screen.getByText(/a abrir o pedido de ana marques/i)).toBeTruthy());
    soltar[0]?.();
    // E some-se quando chega.
    await waitFor(() => expect(screen.queryByText(/a abrir o pedido de/i)).toBeNull());
  });

  /**
   * ── O 200 QUE NÃO É UM 200 ────────────────────────────────────────────
   *
   * A rota é pública (a página do casal lê-a) e sem sessão devolve uma lista
   * curta de factos do evento, com `id` e com 200. Só o cabeçalho
   * `x-pedido: completo` a distingue.
   */
  it("uma sessão caída manda entrar, e não «verifica a ligação»", async () => {
    vi.stubGlobal(
      "fetch",
      servidor(() => resposta(200, { id: "LIQ-7" }, false)),
    );

    await abrir();

    await waitFor(() => expect(avisos.ditos.join(" ")).toMatch(/sessão expirou/i));
    expect(avisos.ditos.join(" ")).toMatch(/volta a entrar/i);
    expect(avisos.ditos.join(" ")).not.toMatch(/verifica a ligação/i);
  });

  it("sem rede, nomeia o pedido e diz que nada se perdeu", async () => {
    vi.stubGlobal(
      "fetch",
      servidor(() => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await abrir();

    await waitFor(() => expect(avisos.ditos.join(" ")).toMatch(/sem ligação/i));
    expect(avisos.ditos.join(" ")).toContain("Ana Marques");
  });

  it("o servidor em baixo diz para esperar, não para voltar a entrar", async () => {
    vi.stubGlobal(
      "fetch",
      servidor(() => resposta(503, { error: "Erro interno" })),
    );

    await abrir();

    await waitFor(() => expect(avisos.ditos.join(" ")).toMatch(/não está a aceitar/i));
    expect(avisos.ditos.join(" ")).not.toMatch(/volta a entrar/i);
  });

  it("a espera não fica presa quando a abertura falha", async () => {
    vi.stubGlobal(
      "fetch",
      servidor(() => resposta(503, {})),
    );

    await abrir();

    await waitFor(() => expect(avisos.ditos.length).toBeGreaterThan(0));
    expect(screen.queryByText(/a abrir o pedido de/i)).toBeNull();
  });
});
