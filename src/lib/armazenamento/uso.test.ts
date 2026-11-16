import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  linha: null as unknown,
  versao: 0,
  gravacoes: 0,
  lerFalha: false,
}));
vi.mock("@/lib/app-state", () => ({
  lerEstadoComVersao: vi.fn(async () => {
    if (H.lerFalha) throw new Error("base em baixo");
    return { valor: H.linha, versao: String(H.versao) };
  }),
  gravarEstadoSeNaoMudou: vi.fn(async (_k: string, v: unknown, versao: string) => {
    if (versao !== String(H.versao)) return "conflito";
    H.linha = v;
    H.versao++;
    H.gravacoes++;
    return "gravado";
  }),
}));

import { esquecerUso, registar, travao, usoAtual } from "./uso";
import { GB, mesDe } from "./tectos";

const mes = mesDe(new Date());

beforeEach(() => {
  H.linha = null;
  H.versao = 0;
  H.gravacoes = 0;
  H.lerFalha = false;
  esquecerUso();
});

describe("o contador do Blob", () => {
  it("soma o que se gastou na linha guardada", async () => {
    await registar({ avancadas: 1, bytes: 100 });
    await registar({ simples: 2, transferencia: 50 });
    expect(H.linha).toEqual({ mes, avancadas: 1, simples: 2, transferencia: 50, bytes: 100 });
  });

  it("oito gastos em paralelo não se perdem (nem lutam pela mesma linha)", async () => {
    await Promise.all(Array.from({ length: 8 }, () => registar({ simples: 1 })));
    expect((H.linha as { simples: number }).simples).toBe(8);
    expect(H.gravacoes).toBeLessThanOrEqual(8);
  });

  it("o travão recusa com a linha guardada perto do tecto", async () => {
    H.linha = { mes, avancadas: 50_000, simples: 0, transferencia: 0, bytes: 0 };
    expect(await travao({ avancadas: 1 })).toBe("operacoes-avancadas");
    expect(await travao({ simples: 1 })).toBeNull();
  });

  it("o travão vê o que esta instância gastou desde a última leitura", async () => {
    H.linha = { mes, avancadas: 0, simples: 0, transferencia: 0, bytes: 2 * GB - 10 };
    expect(await travao({ avancadas: 1, bytes: 5 })).toBeNull();
    await registar({ avancadas: 1, bytes: 5 });
    // A leitura está em cache (60 s); o gasto desta instância soma-se por cima.
    expect(await travao({ avancadas: 1, bytes: 6 })).toBe("armazenamento");
  });

  it("um contador ilegível não trava (o Blob é o plano B, não a avaria)", async () => {
    H.lerFalha = true;
    expect(await usoAtual()).toBeNull();
    expect(await travao({ avancadas: 1 })).toBeNull();
  });

  it("o mês anterior não conta para este", async () => {
    H.linha = {
      mes: "2000-01",
      avancadas: 50_000,
      simples: 300_000,
      transferencia: 9 * GB,
      bytes: 7,
    };
    expect(await travao({ avancadas: 1, simples: 1, transferencia: 1 })).toBeNull();
    expect((await usoAtual())!.bytes).toBe(7);
  });
});
