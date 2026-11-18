import { describe, expect, it } from "vitest";
import { pedidoDaResposta } from "./pedido-da-resposta";

describe("o pedido que o servidor devolveu", () => {
  it("um objecto com id de texto é o pedido, tal e qual", () => {
    const corpo = { id: "Q-1", name: "Ana", status: "pendente" };
    expect(pedidoDaResposta(corpo)).toBe(corpo);
  });

  it("o que não é um pedido dá null — nunca escreve por cima do que está no ecrã", () => {
    for (const corpo of [
      null,
      undefined,
      "",
      "Q-1",
      42,
      [],
      [{ id: "Q-1" }],
      {},
      { id: "" },
      { id: 7 },
      { name: "Ana" },
    ])
      expect(pedidoDaResposta(corpo)).toBeNull();
  });
});
