import { describe, expect, it } from "vitest";
import { aparenciaDoCookie } from "./aparencia";

/**
 * Auditoria de 14/11, n.º 5: em «Automático», as Definições acendiam «Claro».
 * O segmento lia o atributo — que o Automático não escreve — e caía no de
 * omissão. O cookie é o único sítio onde as três escolhas se distinguem.
 */
describe("a escolha de aparência lê-se do cookie", () => {
  it("Automático é Automático", () => {
    expect(aparenciaDoCookie("x=1; bo-aparencia=auto; y=2")).toBe("auto");
  });
  it("Escuro e Claro", () => {
    expect(aparenciaDoCookie("bo-aparencia=escuro")).toBe("escuro");
    expect(aparenciaDoCookie("bo-aparencia=claro")).toBe("claro");
  });
  it("sem cookie, o de omissão: Claro (pedido dela)", () => {
    expect(aparenciaDoCookie("")).toBe("claro");
    expect(aparenciaDoCookie(undefined)).toBe("claro");
  });
  it("um cookie com nome parecido não conta", () => {
    expect(aparenciaDoCookie("xbo-aparencia=auto")).toBe("claro");
  });
});
