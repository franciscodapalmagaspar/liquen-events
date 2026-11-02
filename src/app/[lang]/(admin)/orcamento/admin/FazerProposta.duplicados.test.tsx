// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import FazerProposta from "./FazerProposta";

/**
 * D1: «Possível duplicado» na lista de «Para quem é a proposta?». Aponta e
 * leva ao outro; «Não são o mesmo» grava nos DOIS. Nunca junta nada.
 */

vi.mock("./lazy", () => ({ ProposalStudio: () => null }));

function pedido(id: string, over: Partial<Quote>): Quote {
  return {
    id,
    submittedAt: "2026-01-01T10:00:00.000Z",
    status: "pendente" as QuoteStatus,
    name: "",
    email: `${id}@exemplo.pt`,
    phone: "",
    category: "particulares",
    eventType: "casamentos",
    eventName: "Casamento",
    date: "2026-11-06",
    endDate: "",
    location: "Évora",
    locationType: "pequena_cidade",
    guests: 120,
    duration: 8,
    isMultiDay: false,
    packageTier: "completo",
    addons: [],
    ...over,
  } as Quote;
}

const ana1 = pedido("LQ-1", { name: "Ana Serra Lobo" });
const ana2 = pedido("LQ-2", { name: "Ana lobo", status: "em_revisao" as QuoteStatus });
const rui = pedido("LQ-3", { name: "Rui Costa" });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function desenhar(
  over: {
    onAbrirPedido?: (q: Quote) => void;
    onAbrirOutro?: (q: Quote) => void;
    onQuoteUpdated?: (q: Quote) => void;
  } = {},
) {
  return render(
    <FazerProposta
      quotes={[ana1, ana2, rui]}
      selectedId={null}
      onSelect={() => {}}
      onNovoPedido={() => {}}
      onSent={() => {}}
      onQuoteUpdated={over.onQuoteUpdated ?? (() => {})}
      onAbrirPedido={over.onAbrirPedido ?? (() => {})}
      onAbrirOutro={over.onAbrirOutro}
    />,
  );
}

describe("pedidos duplicados", () => {
  it("marca o «Novo» cujo gémeo está em «Aguardar resposta», e diz porquê", () => {
    desenhar();
    expect(screen.getAllByText("Possível duplicado")).toHaveLength(1);
    expect(screen.getByText(/Parece o mesmo pedido que/).textContent).toMatch(
      /Ana lobo.*Aguardar resposta.*o mesmo nome e a mesma data/,
    );
  });

  it("«Abrir esse» leva ao outro pedido", async () => {
    const onAbrirPedido = vi.fn();
    desenhar({ onAbrirPedido });
    await userEvent.click(screen.getByRole("button", { name: "Abrir esse" }));
    expect(onAbrirPedido).toHaveBeenCalledWith(ana2);
  });

  it("com a porta de todos (`onAbrirOutro`), é por ela que o outro abre — não pelo painel", async () => {
    const onAbrirPedido = vi.fn();
    const onAbrirOutro = vi.fn();
    desenhar({ onAbrirPedido, onAbrirOutro });
    await userEvent.click(screen.getByRole("button", { name: "Abrir esse" }));
    expect(onAbrirOutro).toHaveBeenCalledWith(ana2);
    expect(onAbrirPedido).not.toHaveBeenCalled();
  });

  it("«Não são o mesmo» grava nos dois e actualiza os dois", async () => {
    const chamadas: Array<{ url: string; corpo: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const corpo = JSON.parse(String(init.body));
        chamadas.push({ url, corpo });
        const id = url.split("/").pop()!;
        return new Response(JSON.stringify({ ...(id === "LQ-1" ? ana1 : ana2), ...corpo }), {
          status: 200,
        });
      }),
    );
    const onQuoteUpdated = vi.fn();
    desenhar({ onQuoteUpdated });
    await userEvent.click(screen.getByRole("button", { name: "Não são o mesmo" }));
    await waitFor(() => expect(onQuoteUpdated).toHaveBeenCalledTimes(2));
    expect(chamadas).toEqual([
      { url: "/api/orcamento/LQ-1", corpo: { naoDuplicados: ["LQ-2"] } },
      { url: "/api/orcamento/LQ-2", corpo: { naoDuplicados: ["LQ-1"] } },
    ]);
  });
});
