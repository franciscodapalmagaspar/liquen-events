import { afterEach, describe, expect, it, vi } from "vitest";

const info = vi.fn();
vi.mock("@/lib/logger", () => ({ log: { info: (...a: unknown[]) => info(...a) } }));

const { comCpu } = await import("./medir-cpu");

afterEach(() => {
  vi.unstubAllEnvs();
  info.mockReset();
});

describe("comCpu — quanto processador gastou o pedido (3/11)", () => {
  it("em produção escreve uma linha com a rota e o processador, e devolve a resposta tal e qual", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const resposta = { ok: true };
    const rota = comCpu("teste GET", async (n: number) => {
      let x = 0;
      for (let i = 0; i < 1e5; i++) x += i * n;
      return x > -1 ? resposta : null;
    });
    expect(await rota(2)).toBe(resposta);
    expect(info).toHaveBeenCalledTimes(1);
    const [msg, dados] = info.mock.calls[0] as [
      string,
      { rota: string; cpuMs: number; ms: number },
    ];
    expect(msg).toBe("cpu-da-rota");
    expect(dados.rota).toBe("teste GET");
    expect(dados.cpuMs).toBeGreaterThanOrEqual(0);
    expect(dados.ms).toBeGreaterThanOrEqual(0);
  });

  it("um erro da rota continua a sair — e a medida fica escrita na mesma", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const rota = comCpu("teste POST", async () => {
      throw new Error("falhou");
    });
    await expect(rota()).rejects.toThrow("falhou");
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("fora da produção não mede nada", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const rota = comCpu("teste GET", async () => 1);
    expect(await rota()).toBe(1);
    expect(info).not.toHaveBeenCalled();
  });
});
