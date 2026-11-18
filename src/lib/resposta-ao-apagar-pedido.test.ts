import { describe, it, expect } from "vitest";
import {
  FRASE_DO_CONTRATO,
  FRASE_GENERICA,
  respostaAoApagarPedido,
} from "./resposta-ao-apagar-pedido";

describe("respostaAoApagarPedido — a frase e o estado de um pedido que não saiu", () => {
  it("um pedido que não existe: 404, sem relatório", () => {
    expect(respostaAoApagarPedido({ motivo: "nao-existe" })).toEqual({
      estado: 404,
      frase: "Não encontrado",
      comRelatorio: false,
    });
  });

  it("um contrato: 409, com a frase do registo fiscal e sem relatório", () => {
    expect(respostaAoApagarPedido({ motivo: "tem-contrato" })).toEqual({
      estado: 409,
      frase: FRASE_DO_CONTRATO,
      comRelatorio: false,
    });
  });

  it("uma fatura: 409 (conflito, não avaria), com a frase genérica de sempre", () => {
    expect(respostaAoApagarPedido({ motivo: "tem-fatura" })).toEqual({
      estado: 409,
      frase: FRASE_GENERICA,
      comRelatorio: true,
    });
  });

  it("sem saber se há registo fiscal, ou parado a meio: 500, com o relatório", () => {
    for (const motivo of ["nao-verificado", undefined] as const) {
      expect(respostaAoApagarPedido({ motivo })).toEqual({
        estado: 500,
        frase: FRASE_GENERICA,
        comRelatorio: true,
      });
    }
  });

  it("as frases são as que o ecrã já mostrava — nenhuma é nova", () => {
    expect(FRASE_GENERICA).toBe("Não consegui apagar este pedido.");
    expect(FRASE_DO_CONTRATO).toBe(
      "Este pedido deu origem a contrato, e um contrato é um registo fiscal que tem de ser conservado. Nada foi apagado.",
    );
  });
});
