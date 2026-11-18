// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import { useAccoesEmLote } from "./useAccoesEmLote";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const A = { id: "A", name: "Ana", status: "pendente" } as Quote;
const B = { id: "B", name: "Rui", status: "pendente" } as Quote;

function montar(aberto: Quote | null) {
  const absorverDoServidor = vi.fn();
  const setQuotes = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const id = url.split("/").pop()!;
      const { status } = JSON.parse(String(init.body)) as { status: string };
      return new Response(JSON.stringify({ id, name: id, status }), { status: 200 });
    }),
  );
  const { result } = renderHook(() =>
    useAccoesEmLote({
      userName: "Catarina",
      quotes: [A, B],
      setQuotes,
      quotesRef: { current: [A, B] },
      setSelected: vi.fn(),
      selectedRef: { current: aberto },
      absorverDoServidor,
      setSelectedIds: vi.fn(),
      setLote: vi.fn(),
      bulkBusy: false,
      contarMaisUmNoLote: vi.fn(),
      setAApagarLote: vi.fn(),
      setAArquivarLote: vi.fn(),
      toast: vi.fn(),
      anular: vi.fn(),
      depoisDeApagarVarios: vi.fn(),
      revalidarPedidos: vi.fn(async () => {}),
    }),
  );
  return { ...result.current, absorverDoServidor, setQuotes };
}

describe("mudar o estado de vários pedidos de uma vez", () => {
  it("o pedido aberto no painel passa pela regra dos campos (o estado do painel segue o lote)", async () => {
    const { applyBulkStatus, absorverDoServidor, setQuotes } = montar(A);
    await act(() => applyBulkStatus("cotado", ["A", "B"]));
    expect(setQuotes).toHaveBeenCalled();
    // Só o aberto — e com a versão do servidor, para o `editStatus` o seguir.
    expect(absorverDoServidor).toHaveBeenCalledTimes(1);
    expect(absorverDoServidor).toHaveBeenCalledWith(
      expect.objectContaining({ id: "A", status: "cotado" }),
    );
  });

  it("sem nenhum dos do lote aberto, o painel não se toca", async () => {
    const { applyBulkStatus, absorverDoServidor } = montar(null);
    await act(() => applyBulkStatus("cotado", ["A", "B"]));
    expect(absorverDoServidor).not.toHaveBeenCalled();
  });
});
