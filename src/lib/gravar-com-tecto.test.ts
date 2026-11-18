import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchComTecto,
  GRAVACAO_TECTO_MS,
  GRAVACAO_TENTATIVAS,
  eRecusaDefinitiva,
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
  it("pára à primeira que acaba, e devolve o que ela disse", async () => {
    const tentar = vi
      .fn()
      .mockResolvedValueOnce({ acabou: false, valor: "falhou" })
      .mockResolvedValueOnce({ acabou: true, valor: "gravou" });
    vi.useFakeTimers();
    const ciclo = repetirAteGravar<string>(tentar, () => "rebentou");
    await vi.runAllTimersAsync();
    expect(await ciclo).toBe("gravou");
    expect(tentar).toHaveBeenCalledTimes(2);
    // Cada tentativa recebe o que a anterior disse.
    expect(tentar).toHaveBeenLastCalledWith("falhou");
  });

  it("uma tentativa que rebenta repete-se, e conta com o que `seRebentar` disser", async () => {
    const tentar = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    vi.useFakeTimers();
    const ciclo = repetirAteGravar<string>(tentar, () => "sem rede");
    await vi.runAllTimersAsync();
    expect(await ciclo).toBe("sem rede");
    expect(tentar).toHaveBeenCalledTimes(GRAVACAO_TENTATIVAS);
  });
});

describe("eRecusaDefinitiva", () => {
  it("um 4xx e um 503 permanente não se repetem; um 5xx de passagem, sim", () => {
    expect(eRecusaDefinitiva(413)).toBe(true);
    expect(eRecusaDefinitiva(503, true)).toBe(true);
    expect(eRecusaDefinitiva(503)).toBe(false);
  });
});
