// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { useLeituraDoPedido } from "./useLeituraDoPedido";

const RESUMO = { id: "p1", name: "Ana" } as Quote;
const INTEIRO = { id: "p1", name: "Ana", guests: 80 } as Quote;

function montar(completos = new Set<string>()) {
  const setQuotes = vi.fn();
  const absorverDoServidor = vi.fn();
  const { result } = renderHook(() =>
    useLeituraDoPedido({
      completos: { current: completos },
      quotes: [RESUMO],
      setQuotes,
      absorverDoServidor,
    }),
  );
  return { result, setQuotes, absorverDoServidor, completos };
}

const resposta = (corpo: unknown, init: ResponseInit & { completo?: boolean } = {}) =>
  new Response(JSON.stringify(corpo), {
    status: init.status ?? 200,
    headers: init.completo === false ? {} : { "x-pedido": "completo" },
  });

afterEach(() => vi.unstubAllGlobals());

describe("useLeituraDoPedido", () => {
  it("lê o pedido inteiro uma vez, e dois pedidos ao mesmo tempo partilham a leitura", async () => {
    const fetch = vi.fn(async () => resposta(INTEIRO));
    vi.stubGlobal("fetch", fetch);
    const { result, setQuotes, completos } = montar();
    let a, b;
    await act(async () => {
      [a, b] = await Promise.all([
        result.current.comPedidoInteiro(RESUMO),
        result.current.comPedidoInteiro(RESUMO),
      ]);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ ok: true, quote: INTEIRO });
    expect(b).toEqual({ ok: true, quote: INTEIRO });
    expect(completos.has("p1")).toBe(true);
    expect(setQuotes).toHaveBeenCalledTimes(1);
  });

  it("um pedido já completo não vai à rede", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { result } = montar(new Set(["p1"]));
    await expect(result.current.comPedidoInteiro(RESUMO)).resolves.toEqual({
      ok: true,
      quote: RESUMO,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sem a marca de completo, diz que a sessão expirou", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta(INTEIRO, { completo: false })),
    );
    const { result } = montar();
    const r = await result.current.comPedidoInteiro(RESUMO);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.porque).toMatch(/sessão expirou/);
  });

  it("sem rede, diz que não deu — e uma segunda tentativa volta a ir à rede", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetch);
    const { result } = montar();
    expect((await result.current.comPedidoInteiro(RESUMO)).ok).toBe(false);
    expect((await result.current.comPedidoInteiro(RESUMO)).ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("recarregar esquece o que sabia e absorve o que o servidor tem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta(INTEIRO)),
    );
    const { result, absorverDoServidor } = montar(new Set(["p1"]));
    await act(async () => {
      await result.current.recarregarPedido("p1");
    });
    expect(absorverDoServidor).toHaveBeenCalledWith(INTEIRO);
  });
});
