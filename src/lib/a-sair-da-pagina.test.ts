// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { aPaginaEstaASair } from "./a-sair-da-pagina";

describe("a página está a sair?", () => {
  it("não, até ao pagehide; sim depois; e não outra vez quando volta", () => {
    expect(aPaginaEstaASair()).toBe(false);
    window.dispatchEvent(new Event("beforeunload"));
    expect(aPaginaEstaASair(), "o beforeunload pode ser cancelado").toBe(false);
    window.dispatchEvent(new Event("pagehide"));
    expect(aPaginaEstaASair()).toBe(true);
    window.dispatchEvent(new Event("pageshow"));
    expect(aPaginaEstaASair()).toBe(false);
  });
});
