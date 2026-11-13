import { describe, expect, it, vi } from "vitest";
import { eRelogioAdiantado, lerComNovaTentativa } from "./repository";

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
