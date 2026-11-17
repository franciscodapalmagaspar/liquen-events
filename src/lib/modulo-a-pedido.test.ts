import { describe, expect, it, vi } from "vitest";
import { moduloAPedido } from "./modulo-a-pedido";

describe("moduloAPedido", () => {
  it("não vai buscar nada até alguém pedir", () => {
    const carregar = vi.fn(async () => ({ x: 1 }));
    moduloAPedido(carregar);
    expect(carregar).not.toHaveBeenCalled();
  });

  it("aquecido, `usar` chama JÁ, no mesmo instante (o gesto ainda está vivo)", async () => {
    const m = moduloAPedido(async () => ({ imprimir: vi.fn() }));
    const modulo = await m.aquecer();
    const f = vi.fn();
    void m.usar(f);
    // Síncrono: sem `await` pelo meio.
    expect(f).toHaveBeenCalledWith(modulo);
  });

  it("frio, `usar` vai buscá-lo, chama quando chega, e só uma vez busca", async () => {
    const carregar = vi.fn(async () => ({ y: 2 }));
    const m = moduloAPedido(carregar);
    const f = vi.fn();
    const [a, b] = await Promise.all([m.usar(f), m.usar(f)]);
    expect([a, b]).toEqual([true, true]);
    expect(f).toHaveBeenCalledTimes(2);
    expect(carregar).toHaveBeenCalledTimes(1);
  });

  it("uma falha de rede não fica: diz `false`, e a vez seguinte tenta outra vez", async () => {
    const carregar = vi
      .fn<() => Promise<{ z: number }>>()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce({ z: 3 });
    const m = moduloAPedido(carregar);
    const f = vi.fn();
    expect(await m.usar(f)).toBe(false);
    expect(f).not.toHaveBeenCalled();
    expect(await m.usar(f)).toBe(true);
    expect(f).toHaveBeenCalledWith({ z: 3 });
    expect(carregar).toHaveBeenCalledTimes(2);
  });
});
