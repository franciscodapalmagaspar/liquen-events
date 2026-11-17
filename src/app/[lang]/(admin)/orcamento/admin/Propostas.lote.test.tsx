// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Propostas from "./Propostas";

/**
 * Propostas: escolher várias e «Exportar CSV» (BO 4). E SÓ isso — mudar o
 * estado de várias propostas de uma vez não existe aqui, de propósito: o aceite
 * cria contratos e é um gesto que se faz uma a uma.
 */

const descargas: { nome: string; linhas: (string | number)[][] }[] = [];
vi.mock("./export", async (original) => {
  const real = await original<typeof import("./export")>();
  return {
    ...real,
    downloadCsv: (nome: string, linhas: (string | number)[][]) => descargas.push({ nome, linhas }),
  };
});

const proposta = (id: string, nome: string, status: string, total: number) => ({
  id,
  quoteId: `q-${id}`,
  clientName: nome,
  clientEmail: `${id}@exemplo.pt`,
  currency: "EUR",
  lineItems: [],
  vatRate: 0.23,
  subtotal: total / 1.23,
  vat: total - total / 1.23,
  total,
  status,
  createdAt: "2026-10-01T00:00:00.000Z",
  sentAt: "2026-10-02T00:00:00.000Z",
});

const PROPOSTAS = [
  proposta("p1", "Ana e Rui", "enviada", 1230),
  proposta("p2", "Bia e Tó", "aceite", 2460.5),
  proposta("p3", "Carla e Zé", "rascunho", 500),
];

const response = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  json: async () => body,
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  __resetListCache();
  descargas.length = 0;
  fetchMock = vi.fn(async (url: string) =>
    String(url).startsWith("/api/propostas") ? response(PROPOSTAS) : response([]),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function montar(extra: Partial<React.ComponentProps<typeof Propostas>> = {}) {
  return render(
    <ToastProvider>
      <Propostas quotes={[]} onOpenQuote={() => {}} onQuoteUpdated={() => {}} {...extra} />
    </ToastProvider>,
  );
}

const barra = () => screen.queryByRole("toolbar", { name: "Ações nas propostas selecionadas" });

describe("Propostas — o lote", () => {
  it("escolher duas e exportar dá um CSV com essas duas, e só essas", async () => {
    montar();
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Selecionar proposta de Ana e Rui" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar proposta de Bia e Tó" }));
    expect(within(barra()!).getByText("2 selecionadas")).toBeTruthy();

    fireEvent.click(within(barra()!).getByRole("button", { name: "Exportar CSV" }));
    expect(descargas).toHaveLength(1);
    const [cabecalho, ...linhas] = descargas[0].linhas;
    expect(cabecalho).toContain("Total c/ IVA (€)");
    expect(linhas.map((l) => l[2]).sort()).toEqual(["Ana e Rui", "Bia e Tó"]);
    // Ao cêntimo, em número — para a folha os poder somar.
    expect(linhas.find((l) => l[2] === "Bia e Tó")?.[10]).toBe(2460.5);
    expect(await screen.findByText("2 propostas exportadas.")).toBeTruthy();
  });

  it("a barra não tem nada que mude o estado das propostas", async () => {
    montar();
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Selecionar proposta de Ana e Rui" }),
    );
    const nomes = within(barra()!)
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");
    for (const proibido of [/Aceitar/i, /Recusar/i, /Marcar/i, /Apagar/i, /Enviar/i]) {
      expect(
        nomes.some((n) => proibido.test(n)),
        String(proibido),
      ).toBe(false);
    }
    const escritas = fetchMock.mock.calls.filter(
      ([, init]) => init && (init as RequestInit).method && (init as RequestInit).method !== "GET",
    );
    expect(escritas).toHaveLength(0);
  });

  it("o lote conta só o que está à vista: procurar outra coisa tira-a do número", async () => {
    montar();
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Selecionar proposta de Ana e Rui" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar proposta de Bia e Tó" }));
    fireEvent.change(screen.getByLabelText("Procurar propostas"), { target: { value: "Bia" } });
    await waitFor(() => expect(within(barra()!).getByText("1 selecionada")).toBeTruthy());
    fireEvent.click(within(barra()!).getByRole("button", { name: "Exportar CSV" }));
    expect(descargas[0].linhas).toHaveLength(2); // cabeçalho + 1
  });

  it("«Limpar» larga o lote", async () => {
    montar();
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Selecionar proposta de Ana e Rui" }),
    );
    fireEvent.click(within(barra()!).getByRole("button", { name: "Limpar" }));
    expect(barra()).toBeNull();
  });

  it("o pedido da paleta abre filtrado pelo nome, em todos os estados", async () => {
    montar({ pedidoDaPaleta: { procura: "Carla" } });
    await waitFor(() => expect(screen.getByLabelText("Procurar propostas")).toHaveValue("Carla"));
    expect(await screen.findAllByText("Carla e Zé")).not.toHaveLength(0);
    expect(screen.queryByText("Ana e Rui")).toBeNull();
  });
});
