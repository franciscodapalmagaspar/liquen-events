import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { SupabaseBackend, eRelogioAdiantado, lerComNovaTentativa } from "./repository";

/**
 * Auditoria de robustez de 13/11: o PostgREST respondia de vez em quando
 * PGRST303 («JWT issued at future») e a cópia diária saía INCOMPLETA (7, 9 e
 * 11/11). Passa num segundo — as leituras tentam outra vez.
 */
const erro303 = { code: "PGRST303", message: "JWT issued at future" };
const semEspera = () => Promise.resolve();

describe("ler com nova tentativa quando o relógio do PostgREST está atrás", () => {
  it("reconhece o erro pelo código ou pela frase", () => {
    expect(eRelogioAdiantado(erro303)).toBe(true);
    expect(eRelogioAdiantado({ message: "JWT issued at future" })).toBe(true);
    expect(eRelogioAdiantado({ code: "PGRST301" })).toBe(false);
    expect(eRelogioAdiantado(null)).toBe(false);
  });

  it("à segunda já passa", async () => {
    const ler = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: erro303 })
      .mockResolvedValueOnce({ data: [1], error: null });
    const r = await lerComNovaTentativa(ler, semEspera);
    expect(r).toEqual({ data: [1], error: null });
    expect(ler).toHaveBeenCalledTimes(2);
  });

  it("desiste ao fim de três e devolve o erro (não esconde a avaria)", async () => {
    const ler = vi.fn().mockResolvedValue({ data: null, error: erro303 });
    const r = await lerComNovaTentativa(ler, semEspera);
    expect(r.error).toBe(erro303);
    expect(ler).toHaveBeenCalledTimes(3);
  });

  it("outro erro qualquer não se repete", async () => {
    const ler = vi.fn().mockResolvedValue({ data: null, error: { code: "42P01" } });
    await lerComNovaTentativa(ler, semEspera);
    expect(ler).toHaveBeenCalledTimes(1);
  });
});

describe("as escritas também tentam outra vez com o relógio adiantado (n.º 11)", () => {
  const mapper = {
    table: "t",
    fromRow: (r: Record<string, unknown>) => r,
    toRow: (x: Record<string, unknown>) => ({ ...x }),
    getId: (x: { id: string }) => x.id,
  } as never;

  it("insert, update e delete passam à segunda quando a primeira volta com PGRST303", async () => {
    const chamadas = { insert: 0, update: 0, delete: 0 };
    const responder = (tipo: keyof typeof chamadas) => {
      chamadas[tipo]++;
      return Promise.resolve(
        chamadas[tipo] === 1
          ? { data: null, error: erro303, status: 401 }
          : { data: null, error: null, status: 204 },
      );
    };
    const sb = {
      from: () => ({
        insert: () => responder("insert"),
        update: () => ({ eq: () => responder("update") }),
        delete: () => ({ eq: () => responder("delete") }),
      }),
    };
    const repo = new SupabaseBackend(mapper, sb as never);
    await expect(repo.insert({ id: "a" } as never)).resolves.toBeUndefined();
    await expect(repo.persist("a", { id: "a" } as never)).resolves.toBeUndefined();
    await expect(repo.remove("a")).resolves.toBeUndefined();
    expect(chamadas).toEqual({ insert: 2, update: 2, delete: 2 });
  }, 15_000);

  it("um erro de escrita que não é o do relógio não se repete", async () => {
    let n = 0;
    const sb = {
      from: () => ({
        insert: () => {
          n++;
          return Promise.resolve({ data: null, error: { code: "23505" }, status: 409 });
        },
      }),
    };
    const repo = new SupabaseBackend(mapper, sb as never);
    await expect(repo.insert({ id: "a" } as never)).rejects.toMatchObject({ code: "23505" });
    expect(n).toBe(1);
  });
});
