import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = new Map<string, unknown>();
vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async (k: string) => estado.get(k) ?? null),
  setState: vi.fn(async (k: string, v: unknown) => {
    estado.set(k, v);
    return { gravado: true };
  }),
}));

import { getState, setState } from "@/lib/app-state";
import { chaveDoGuardado, esquecerGuardados, guardadoOuCalculado } from "./guardado";

beforeEach(() => {
  estado.clear();
  esquecerGuardados();
  vi.mocked(getState).mockClear();
  vi.mocked(setState).mockClear();
});

describe("o que a proposta online calcula uma vez", () => {
  it("calcula na primeira visita, guarda, e não volta a calcular", async () => {
    const calcular = vi.fn(async () => ({ titulo: "A proposta" }));
    const chave = chaveDoGuardado("conteudo", "p1", "pt", "{doc}");
    expect(await guardadoOuCalculado(chave, calcular)).toEqual({ titulo: "A proposta" });
    expect(await guardadoOuCalculado(chave, calcular)).toEqual({ titulo: "A proposta" });
    expect(calcular).toHaveBeenCalledTimes(1);
    expect(setState).toHaveBeenCalledTimes(1);
  });

  it("outra instância (sem memória) lê o guardado em vez de calcular", async () => {
    const chave = chaveDoGuardado("conteudo", "p1", "pt", "{doc}");
    await guardadoOuCalculado(chave, async () => ({ v: 1 }));
    esquecerGuardados();
    const calcular = vi.fn(async () => ({ v: 2 }));
    expect(await guardadoOuCalculado(chave, calcular)).toEqual({ v: 1 });
    expect(calcular).not.toHaveBeenCalled();
  });

  it("um documento diferente é outra chave — nunca a resposta de outro", () => {
    expect(chaveDoGuardado("conteudo", "p1", "pt", "{a}")).not.toBe(
      chaveDoGuardado("conteudo", "p1", "pt", "{b}"),
    );
    expect(chaveDoGuardado("conteudo", "p1", "pt", "{a}")).not.toBe(
      chaveDoGuardado("conteudo", "p1", "en", "{a}"),
    );
    expect(chaveDoGuardado("conteudo", "p1", "pt", "{a}")).toMatch(
      /^proposta-web:conteudo:p1:[0-9a-f]{24}$/,
    );
  });

  it("o que não serve (uma paleta vazia) não fica guardado: a próxima visita tenta outra vez", async () => {
    const chave = chaveDoGuardado("cores", "p1", "a.jpg");
    const calcular = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["#111111"]);
    const serve = (c: string[]) => c.length > 0;
    expect(await guardadoOuCalculado(chave, calcular, serve)).toEqual([]);
    expect(setState).not.toHaveBeenCalled();
    expect(await guardadoOuCalculado(chave, calcular, serve)).toEqual(["#111111"]);
    expect(setState).toHaveBeenCalledTimes(1);
  });

  it("um cálculo que falha não fica preso na memória", async () => {
    const chave = chaveDoGuardado("conteudo", "p2", "pt", "{doc}");
    await expect(
      guardadoOuCalculado(chave, async () => {
        throw new Error("armazenamento em baixo");
      }),
    ).rejects.toThrow();
    expect(await guardadoOuCalculado(chave, async () => "ok")).toBe("ok");
  });
});
