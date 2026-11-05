import { describe, expect, it } from "vitest";
import { MEIOS_HABITUAIS, meioDoTexto } from "./meios-de-pagamento";

describe("meioDoTexto — o ícone sai do que ela escreveu", () => {
  it("reconhece os habituais, escritos de várias maneiras", () => {
    expect(meioDoTexto("MB Way")).toBe("mbway");
    expect(meioDoTexto("mbway")).toBe("mbway");
    expect(meioDoTexto("Transferência")).toBe("transferencia");
    expect(meioDoTexto("transferencia bancaria")).toBe("transferencia");
    expect(meioDoTexto("Numerário")).toBe("numerario");
    expect(meioDoTexto("dinheiro")).toBe("numerario");
    expect(meioDoTexto("Multibanco")).toBe("multibanco");
    expect(meioDoTexto("Referência MB")).toBe("multibanco");
    expect(meioDoTexto("Cheque")).toBe("cheque");
  });

  it("MB Way não se confunde com Multibanco", () => {
    expect(meioDoTexto("MB Way")).not.toBe("multibanco");
    expect(meioDoTexto("MB")).toBe("multibanco");
  });

  it("o que não se reconhece leva o genérico; sem texto não há ícone", () => {
    expect(meioDoTexto("PayPal")).toBe("outro");
    expect(meioDoTexto("")).toBeNull();
    expect(meioDoTexto("   ")).toBeNull();
    expect(meioDoTexto(undefined)).toBeNull();
  });

  it("cada habitual reconhece o próprio nome", () => {
    for (const { meio, nome } of MEIOS_HABITUAIS) expect(meioDoTexto(nome)).toBe(meio);
  });
});
