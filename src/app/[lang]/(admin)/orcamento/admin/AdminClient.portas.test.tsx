// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminClient from "./AdminClient";
import { RegistoDeGravacoesProvider } from "./registo-de-gravacoes";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TODAS AS PORTAS PARA UM CLIENTE PASSAM PELA MESMA REGRA (2/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela: o painel antigo do pedido «já não existe no back office» — e,
 * perguntada, decidiu: fica SÓ atrás do «Abrir o pedido» da página da
 * proposta, e um evento JÁ GANHO abre o Dossier. Aqui prende-se a regra pelas
 * portas mais usadas (o Kanban e as Propostas Aceites) e o caminho que fica
 * para o painel.
 */

const navegar = vi.hoisted(() => vi.fn());
vi.mock("./navegar", () => ({ navegarPara: navegar }));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

const r = (b: unknown) =>
  ({
    ok: true,
    status: 200,
    headers: new Headers({ "x-pedido": "completo" }),
    json: async () => b,
  }) as unknown as Response;

const pedido = (over: Partial<Quote>) =>
  ({
    submittedAt: "2026-05-01T10:00:00.000Z",
    payments: [],
    activityLog: [],
    ...over,
  }) as unknown as Quote;

const POR_GANHAR = pedido({ id: "LIQ-1", name: "TESTE Ana Serra", status: "cotado" });
const GANHO = pedido({ id: "LIQ-2", name: "TESTE Rui Lobo", status: "aceite" });

beforeEach(() => {
  navegar.mockClear();
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? "GET";
      const q = [POR_GANHAR, GANHO].find((x) => String(url).includes(`/api/orcamento/${x.id}`));
      if (q && metodo === "GET") return r(q);
      if (metodo === "GET") return r([]);
      return r({ ok: true });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function montar(vista: "kanban" | "pedidos") {
  render(
    <RegistoDeGravacoesProvider>
      <AdminClient initialQuotes={[POR_GANHAR, GANHO]} userName="Catarina" vistaInicial={vista} />
    </RegistoDeGravacoesProvider>,
  );
}

// O «Abrir o pedido» vive DENTRO do estúdio desde 9/11 (era o cartão por cima
// dele), e o estúdio chega por um `import()` preguiçoso: no CI, mais lento, o
// segundo de espera por omissão não chegava. Daí os 10 s.
describe("as portas para um cliente (2/11)", () => {
  it("no Kanban, um pedido por ganhar abre a página da proposta — não o painel", async () => {
    montar("kanban");
    await userEvent.click((await screen.findAllByText("TESTE Ana Serra"))[0]);
    // A página da proposta tem o «Abrir o pedido»; o painel antigo, a «Gestão do pedido».
    await screen.findByRole("button", { name: /^Abrir o pedido$/ }, { timeout: 10_000 });
    expect(screen.queryByText("Gestão do pedido")).toBeNull();
    expect(navegar).not.toHaveBeenCalled();
  });

  it("no Kanban, um pedido GANHO abre o Dossier do evento", async () => {
    montar("kanban");
    await userEvent.click((await screen.findAllByText("TESTE Rui Lobo"))[0]);
    await waitFor(() => expect(navegar).toHaveBeenCalledTimes(1));
    expect(navegar.mock.calls[0][0]).toMatch(/\/orcamento\/admin\/evento\/LIQ-2$/);
    expect(screen.queryByText("Gestão do pedido")).toBeNull();
  });

  it("o painel continua lá, atrás do «Abrir o pedido» da página", async () => {
    montar("kanban");
    await userEvent.click((await screen.findAllByText("TESTE Ana Serra"))[0]);
    await userEvent.click(
      await screen.findByRole("button", { name: /^Abrir o pedido$/ }, { timeout: 10_000 }),
    );
    expect(await screen.findByText("Gestão do pedido")).toBeInTheDocument();
  });

  it("a lista de Pedidos leva SEMPRE à página — mesmo um ganho (é por lá que se chega ao painel dele)", async () => {
    montar("pedidos");
    await userEvent.click((await screen.findAllByText("TESTE Rui Lobo"))[0]);
    await screen.findByRole("button", { name: /^Abrir o pedido$/ }, { timeout: 10_000 });
    expect(navegar).not.toHaveBeenCalled();
  });
});
