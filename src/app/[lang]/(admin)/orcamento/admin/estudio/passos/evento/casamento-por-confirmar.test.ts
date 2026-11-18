import { describe, expect, it } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import { casamentoPorConfirmar } from "./casamento-por-confirmar";

type PedidoMinimo = Parameters<typeof casamentoPorConfirmar>[1];

function pedido(extra: Partial<PedidoMinimo> = {}): PedidoMinimo {
  return { eventType: null, category: null, eventName: "", ...extra } as PedidoMinimo;
}

describe("casamentoPorConfirmar", () => {
  it("a proposta diz casamento e nada no pedido o diz: pergunta", () => {
    expect(casamentoPorConfirmar({ eventType: "Casamento" }, pedido(), false)).toBe(true);
  });

  it("a proposta não diz casamento: nada a perguntar", () => {
    expect(casamentoPorConfirmar({ eventType: "Jantar" }, pedido(), false)).toBe(false);
    expect(casamentoPorConfirmar({ eventType: "" }, pedido(), false)).toBe(false);
  });

  it("o pedido é um casamento pelo formulário: cala-se", () => {
    const casamento = pedido({ eventType: "casamentos" as Quote["eventType"] });
    expect(casamentoPorConfirmar({ eventType: "Casamento" }, casamento, false)).toBe(false);
  });

  it("o nome do evento no pedido já diz casamento: cala-se", () => {
    const comNome = pedido({ eventName: "Casamento da Ana" });
    expect(casamentoPorConfirmar({ eventType: "Casamento" }, comNome, false)).toBe(false);
  });

  it("há noivos no pedido: cala-se", () => {
    expect(
      casamentoPorConfirmar({ eventType: "Casamento" }, pedido({ partnerA: "Ana" }), false),
    ).toBe(false);
    expect(
      casamentoPorConfirmar({ eventType: "Casamento" }, pedido({ partnerB: "Rui" }), false),
    ).toBe(false);
  });

  it("ela já disse que é mesmo um casamento: cala-se", () => {
    expect(casamentoPorConfirmar({ eventType: "Casamento" }, pedido(), true)).toBe(false);
  });
});
