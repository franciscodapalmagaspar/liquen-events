import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// O duplo de todos os testes (`vitest.setup.ts`) sai: aqui mede-se o verdadeiro.
vi.unmock("./dominio-do-email");
const dns = vi.hoisted(() => ({
  resolveMx: vi.fn(),
  resolve4: vi.fn(),
  resolve6: vi.fn(),
}));
vi.mock("node:dns/promises", () => dns);

import { dominioRecebeEmail, esquecerDominiosVistos } from "./dominio-do-email";

const erro = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  esquecerDominiosVistos();
  dns.resolveMx.mockReset();
  dns.resolve4.mockReset();
  dns.resolve6.mockReset();
});

describe("dominioRecebeEmail — só recusa quando o DNS diz mesmo que não", () => {
  it("com MX, recebe", async () => {
    dns.resolveMx.mockResolvedValue([{ exchange: "mx.gmail.com", priority: 5 }]);
    expect(await dominioRecebeEmail("ana@gmail.com")).toBe(true);
  });

  it("um domínio que não existe não recebe", async () => {
    dns.resolveMx.mockRejectedValue(erro("ENOTFOUND"));
    dns.resolve4.mockRejectedValue(erro("ENOTFOUND"));
    dns.resolve6.mockRejectedValue(erro("ENOTFOUND"));
    expect(await dominioRecebeEmail("ana@gmail.con")).toBe(false);
  });

  it("o «MX nulo» (RFC 7505) não recebe", async () => {
    dns.resolveMx.mockResolvedValue([{ exchange: "", priority: 0 }]);
    expect(await dominioRecebeEmail("ana@nao-recebe.pt")).toBe(false);
  });

  it("sem MX mas com endereço, recebe (o correio vai para o próprio domínio)", async () => {
    dns.resolveMx.mockRejectedValue(erro("ENODATA"));
    dns.resolve4.mockResolvedValue(["192.0.2.1"]);
    expect(await dominioRecebeEmail("ana@empresa.pt")).toBe(true);
  });

  it("o DNS em baixo deixa passar — perder um pedido verdadeiro é pior", async () => {
    dns.resolveMx.mockRejectedValue(erro("ESERVFAIL"));
    expect(await dominioRecebeEmail("ana@empresa.pt")).toBe(true);
  });

  it("o DNS lento deixa passar ao fim da espera, e não fica guardado", async () => {
    vi.useFakeTimers();
    dns.resolveMx.mockReturnValue(new Promise(() => {}));
    const r = dominioRecebeEmail("ana@lento.pt");
    await vi.advanceTimersByTimeAsync(2600);
    expect(await r).toBe(true);
    vi.useRealTimers();
    dns.resolveMx.mockRejectedValue(erro("ENOTFOUND"));
    dns.resolve4.mockRejectedValue(erro("ENOTFOUND"));
    dns.resolve6.mockRejectedValue(erro("ENOTFOUND"));
    expect(await dominioRecebeEmail("ana@lento.pt")).toBe(false);
  });

  it("um domínio já visto não volta a perguntar", async () => {
    dns.resolveMx.mockResolvedValue([{ exchange: "mx.exemplo.pt", priority: 5 }]);
    await dominioRecebeEmail("ana@exemplo.pt");
    await dominioRecebeEmail("rui@EXEMPLO.pt");
    expect(dns.resolveMx).toHaveBeenCalledTimes(1);
  });
});
