import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { comPrazo, TempoEsgotado } from "./prazo";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("comPrazo", () => {
  it("devolve o resultado quando o trabalho chega a tempo", async () => {
    await expect(comPrazo(Promise.resolve(7), 1_000, "x")).resolves.toBe(7);
  });

  it("recusa com TempoEsgotado quando não chega, e diz qual passo", async () => {
    const p = comPrazo(new Promise(() => undefined), 1_000, "leitura de pedidos");
    const espera = expect(p).rejects.toBeInstanceOf(TempoEsgotado);
    await vi.advanceTimersByTimeAsync(1_000);
    await espera;
    await expect(p).rejects.toThrow("leitura de pedidos");
  });

  it("não deixa temporizadores pendurados quando o trabalho acaba antes", async () => {
    await comPrazo(Promise.resolve(1), 60_000, "x");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passa a recusa do próprio trabalho tal e qual", async () => {
    const erro = new Error("rede");
    await expect(comPrazo(Promise.reject(erro), 1_000, "x")).rejects.toBe(erro);
  });

  /**
   * Revisão de 17/11, n.º 2: deixar de esperar não pára o trabalho. Quem o
   * pode parar (um lote que lê um sinal) recebe o controlador, e o prazo
   * cancela-o quando esgota.
   */
  it("com um controlador, cancela-o quando esgota — e só então", async () => {
    const parar = new AbortController();
    const p = comPrazo(new Promise(() => undefined), 1_000, "x", parar);
    const espera = expect(p).rejects.toBeInstanceOf(TempoEsgotado);
    await vi.advanceTimersByTimeAsync(999);
    expect(parar.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await espera;
    expect(parar.signal.aborted).toBe(true);

    const aTempo = new AbortController();
    await comPrazo(Promise.resolve(1), 1_000, "x", aTempo);
    expect(aTempo.signal.aborted).toBe(false);
  });
});
