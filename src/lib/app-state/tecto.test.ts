import { describe, it, expect, vi, afterEach } from "vitest";
import { comTecto } from "./tecto";

afterEach(() => {
  vi.useRealTimers();
});

describe("um pedido com prazo", () => {
  it("devolve o que o trabalho devolve, dentro do prazo", async () => {
    expect(await comTecto(Promise.resolve(7), 100)).toBe(7);
    expect(await comTecto(async () => 8, 100)).toBe(8);
  });

  it("no prazo, rejeita E corta o pedido pelo sinal", async () => {
    vi.useFakeTimers();
    const sinais: AbortSignal[] = [];
    const p = comTecto((sinal) => {
      sinais.push(sinal);
      return new Promise<never>(() => {});
    }, 1000);
    const esperado = expect(p).rejects.toThrow(/tempo esgotado/);
    await vi.advanceTimersByTimeAsync(1001);
    await esperado;
    expect(sinais.map((s) => s.aborted)).toEqual([true]);
  });

  it("dentro do prazo o sinal não se dispara", async () => {
    const sinais: AbortSignal[] = [];
    await comTecto(async (sinal) => {
      sinais.push(sinal);
      return 1;
    }, 1000);
    expect(sinais.map((s) => s.aborted)).toEqual([false]);
  });
});
