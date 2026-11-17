import { describe, expect, it } from "vitest";
import { eRuidoDeFora } from "./ruido-do-browser";

/** Os relatos são os dos registos de produção de 14–16/11, tal e qual. */
describe("eRuidoDeFora", () => {
  it("o script que o Chrome do iPad injecta («ra», molduras sem endereço) é ruído", () => {
    expect(
      eRuidoDeFora(
        "ra",
        "qh@\nph@\nPr@\nps@\n@\n@\nanonymous@\n@https://liquen-events.com/galeria:415:45",
      ),
    ).toBe(true);
  });

  it("a ponte do browser do Instagram é ruído", () => {
    expect(
      eRuidoDeFora(
        "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
        "setupIosCallbackHandler@https://liquen-events.com/:1:7358\n@https://liquen-events.com/:1:8612",
      ),
    ).toBe(true);
  });

  it("o aviso do ResizeObserver é ruído", () => {
    expect(eRuidoDeFora("ResizeObserver loop limit exceeded", undefined)).toBe(true);
    expect(eRuidoDeFora("ResizeObserver loop completed with undelivered notifications.", "")).toBe(
      true,
    );
  });

  it("um erro do NOSSO pedaço de JS continua a contar", () => {
    expect(
      eRuidoDeFora(
        "Cannot read properties of undefined (reading 'catch')",
        "TypeError: Cannot read properties of undefined (reading 'catch')\n    at https://liquen-events.com/_next/static/immutable/chunks/0zaa83iv6e5ye.js:1:23271",
      ),
    ).toBe(false);
  });

  it("um erro de um script inline NOSSO (molduras com endereço) continua a contar", () => {
    expect(
      eRuidoDeFora(
        "x is not a function",
        "abrir@https://liquen-events.com/:12:40\n@https://liquen-events.com/:14:3",
      ),
    ).toBe(false);
  });

  it("sem rasto e com mensagem normal, conta", () => {
    expect(eRuidoDeFora("rebentou", undefined)).toBe(false);
  });
});
