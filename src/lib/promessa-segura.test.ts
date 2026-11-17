import { describe, expect, it, vi } from "vitest";
import { semRecusa } from "./promessa-segura";

describe("semRecusa — uma API do browser que não devolve promessa não rebenta", () => {
  it("aguenta `undefined` (o `register` do robô Chrome 106 dos registos de 14/11)", () => {
    const aoRecusar = vi.fn();
    expect(() => semRecusa(() => undefined, aoRecusar)).not.toThrow();
    expect(aoRecusar).not.toHaveBeenCalled();
  });

  it("aguenta uma função que lança de forma síncrona, e conta-a como recusa", () => {
    const aoRecusar = vi.fn();
    const erro = new TypeError("register is not a function");
    expect(() =>
      semRecusa(() => {
        throw erro;
      }, aoRecusar),
    ).not.toThrow();
    expect(aoRecusar).toHaveBeenCalledWith(erro);
  });

  it("apanha a recusa da promessa (não fica nenhuma `unhandledrejection`)", async () => {
    const aoRecusar = vi.fn();
    const erro = new Error("NotAllowedError");
    semRecusa(() => Promise.reject(erro), aoRecusar);
    await new Promise((r) => setTimeout(r, 0));
    expect(aoRecusar).toHaveBeenCalledWith(erro);
  });

  it("sem `aoRecusar`, a recusa é engolida em silêncio", async () => {
    semRecusa(() => Promise.reject(new Error("x")));
    await new Promise((r) => setTimeout(r, 0));
  });

  it("um `aoRecusar` que lança não passa a ser o segundo erro", () => {
    expect(() =>
      semRecusa(
        () => {
          throw new Error("1.º");
        },
        () => {
          throw new Error("2.º");
        },
      ),
    ).not.toThrow();
  });

  it("valores que não são promessa (número, objecto sem `then`) passam sem nada", () => {
    expect(() => semRecusa(() => 3)).not.toThrow();
    expect(() => semRecusa(() => ({ catch: 1 }))).not.toThrow();
  });
});
