import { describe, expect, it } from "vitest";
import { emailParaContagem } from "./email-para-contagem";

describe("o tecto das confirmações conta a CAIXA, não a grafia (n.º 14)", () => {
  it("variações do mesmo endereço contam como uma só caixa", () => {
    const caixa = emailParaContagem("ana@gmail.com");
    for (const v of [
      " Ana@Gmail.com ",
      "ana+1@gmail.com",
      "ana+pedido-2@gmail.com",
      "a.n.a@gmail.com",
      "A.n.A+x@googlemail.com",
    ]) {
      expect(emailParaContagem(v), v).toBe(caixa);
    }
  });

  it("fora do Gmail os pontos contam (são caixas diferentes), a etiqueta não", () => {
    expect(emailParaContagem("a.na@empresa.pt")).toBe("a.na@empresa.pt");
    expect(emailParaContagem("ana+1@empresa.pt")).toBe("ana@empresa.pt");
    expect(emailParaContagem("a.na@empresa.pt")).not.toBe(emailParaContagem("ana@empresa.pt"));
  });
});
