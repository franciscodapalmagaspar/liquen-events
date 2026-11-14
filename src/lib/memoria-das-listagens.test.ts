import { afterEach, describe, expect, it, vi } from "vitest";
import { ESPERA_MAX_MS, esquecerListagens, listagemComMemoria } from "./memoria-das-listagens";

afterEach(() => {
  vi.useRealTimers();
  esquecerListagens();
});

describe("listagemComMemoria — uma listagem pendurada não prende as outras", () => {
  it("ao fim do limite vale null, não se guarda, e a pergunta seguinte volta a listar", async () => {
    vi.useFakeTimers();
    const pendurada = vi.fn(() => new Promise<string[] | null>(() => {}));
    const a = listagemComMemoria("b", "p", pendurada);
    const b = listagemComMemoria("b", "p", pendurada);
    expect(pendurada).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(ESPERA_MAX_MS + 1);
    await expect(a).resolves.toBeNull();
    await expect(b).resolves.toBeNull();

    const boa = vi.fn(async () => ["x.jpg"]);
    await expect(listagemComMemoria("b", "p", boa)).resolves.toEqual(["x.jpg"]);
    expect(boa).toHaveBeenCalledTimes(1);
  });
});
