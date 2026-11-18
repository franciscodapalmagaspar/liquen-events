import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchComTecto,
  GRAVACAO_TECTO_MS,
  GRAVACAO_TENTATIVAS,
  repetirAteGravar,
} from "./gravar-com-tecto";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchComTecto", () => {
  it("uma rede que aceita e nunca responde é cortada no tecto, em vez de pendurar a gravação", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_, rejeitar) => {
            init.signal?.addEventListener("abort", () => rejeitar(new Error("abortado")));
          }),
      ),
    );
    const pedido = fetchComTecto("/api/x", { method: "PATCH" });
    const resultado = expect(pedido).rejects.toThrow("abortado");
    await vi.advanceTimersByTimeAsync(GRAVACAO_TECTO_MS);
    await resultado;
  });

  it("a resposta que chega a tempo passa tal e qual, com o pedido intacto", async () => {
    const resposta = new Response("ok", { status: 200 });
    const f = vi.fn(async () => resposta);
    vi.stubGlobal("fetch", f);
    await expect(fetchComTecto("/api/x", { method: "POST", body: "{}" }, 50)).resolves.toBe(
      resposta,
    );
    expect(f).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
  });
});

describe("repetirAteGravar — o ciclo de todas as gravações", () => {
  it("pára à primeira que acaba (gravou, ou a recusa é definitiva)", async () => {
    const tentar = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    vi.useFakeTimers();
    const ciclo = repetirAteGravar(tentar);
    await vi.runAllTimersAsync();
    await ciclo;
    expect(tentar).toHaveBeenCalledTimes(2);
  });

  it("uma tentativa que rebenta repete-se, e avisa quem chama", async () => {
    const tentar = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    const aoRebentar = vi.fn();
    vi.useFakeTimers();
    const ciclo = repetirAteGravar(tentar, aoRebentar);
    await vi.runAllTimersAsync();
    await ciclo;
    expect(tentar).toHaveBeenCalledTimes(GRAVACAO_TENTATIVAS);
    expect(aoRebentar).toHaveBeenCalledTimes(GRAVACAO_TENTATIVAS);
  });
});
