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

const completo = (q: Quote = A) =>
  new Response(JSON.stringify(q), { status: 200, headers: { "x-pedido": "completo" } });

function montar() {
  const setQuotes = vi.fn();
  const { result } = renderHook(() =>
    useLeituraDoPedido({
      setQuotes,
      quotes: [A],
      selected: null,
      setRecentQuotes: vi.fn(),
      sairDoPainel: vi.fn(),
      completos: { current: new Set<string>() },
      absorverDoServidor: vi.fn(),
      edicao: {} as unknown as EdicaoDoPedido,
    }),
  );
  return { ...result.current, setQuotes };
}

describe("as leituras do pedido inteiro", () => {
  it("uma leitura que acaba não apaga a que o `recarregarPedido` pôs no lugar dela", async () => {
    const { comPedidoInteiro, recarregarPedido } = montar();

    const primeira = comPedidoInteiro(A);
    const recarga = recarregarPedido("A");
    expect(fetch).toHaveBeenCalledTimes(2);

    // A primeira chega antes da segunda, e falhada (a rede caiu a meio): não
    // deixa nada em `completos`, e a terceira porta tem de usar a segunda.
    await act(async () => {
      respostas[0](new Response("{}", { status: 503 }));
      await new Promise((r) => setTimeout(r, 0));
    });

    // Uma terceira porta para o mesmo pedido serve-se da leitura que vai a
    // caminho, em vez de pagar outra viagem (revisão independente de 17/11).
    const terceira = comPedidoInteiro(A);
    expect(fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      respostas[1](completo());
      await Promise.all([primeira, recarga, terceira]);
    });
  });

  it("a leitura substituída que chega DEPOIS da nova não a desfaz, e quem a pediu recebe a nova", async () => {
    const antes = { ...A, guests: 80 } as Quote;
    const depois = { ...A, guests: 120 } as Quote;
    const { comPedidoInteiro, recarregarPedido, setQuotes } = montar();

    const primeira = comPedidoInteiro(A);
    const recarga = recarregarPedido("A");

    // A nova chega primeiro e grava-se…
    await act(async () => {
      respostas[1](completo(depois));
      await recarga;
    });
    expect(setQuotes).toHaveBeenCalledTimes(1);

    // …e a de baixo, com o pedido de antes, já não grava nada por cima.
    let lida: Awaited<typeof primeira> | undefined;
    await act(async () => {
      respostas[0](completo(antes));
      lida = await primeira;
    });
    expect(setQuotes).toHaveBeenCalledTimes(1);
    expect(lida).toEqual({ ok: true, quote: depois });
  });

  it("se a nova falhar, quem pediu a de baixo recebe a sua, que veio inteira", async () => {
    const antes = { ...A, guests: 80 } as Quote;
    const { comPedidoInteiro, recarregarPedido } = montar();

    const primeira = comPedidoInteiro(A);
    const recarga = recarregarPedido("A");
    await act(async () => {
      respostas[1](new Response("{}", { status: 503 }));
      await recarga;
    });
    let lida: Awaited<typeof primeira> | undefined;
    await act(async () => {
      respostas[0](completo(antes));
      lida = await primeira;
    });
    expect(lida).toEqual({ ok: true, quote: antes });
  });
});
