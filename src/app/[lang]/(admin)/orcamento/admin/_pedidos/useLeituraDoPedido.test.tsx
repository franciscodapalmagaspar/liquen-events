// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import type { EdicaoDoPedido } from "./useEdicaoDoPedido";
import { useLeituraDoPedido } from "./useLeituraDoPedido";

const A = { id: "A", name: "A" } as unknown as Quote;

/** Cada `fetch` fica à espera até o teste o deixar responder. */
let respostas: Array<(r: Response) => void> = [];
beforeEach(() => {
  respostas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolver) => {
          respostas.push(resolver);
        }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const completo = () =>
  new Response(JSON.stringify(A), { status: 200, headers: { "x-pedido": "completo" } });

describe("as leituras do pedido inteiro", () => {
  it("uma leitura que acaba não apaga a que o `recarregarPedido` pôs no lugar dela", async () => {
    const { result } = renderHook(() =>
      useLeituraDoPedido({
        setQuotes: vi.fn(),
        quotes: [A],
        selected: null,
        setRecentQuotes: vi.fn(),
        sairDoPainel: vi.fn(),
        completos: { current: new Set<string>() },
        absorverDoServidor: vi.fn(),
        edicao: {} as unknown as EdicaoDoPedido,
      }),
    );
    const { comPedidoInteiro, recarregarPedido } = result.current;

    const primeira = comPedidoInteiro(A);
    const recarga = recarregarPedido("A");
    expect(fetch).toHaveBeenCalledTimes(2);

    // A primeira chega antes da segunda, e falhada (a rede caiu a meio): não
    // deixa nada em `completos`, e a terceira porta tem de usar a segunda.
    await act(async () => {
      respostas[0](new Response("{}", { status: 503 }));
      await primeira;
    });

    // Uma terceira porta para o mesmo pedido serve-se da leitura que vai a
    // caminho, em vez de pagar outra viagem (revisão independente de 17/11).
    const terceira = comPedidoInteiro(A);
    expect(fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      respostas[1](completo());
      await Promise.all([recarga, terceira]);
    });
  });
});
