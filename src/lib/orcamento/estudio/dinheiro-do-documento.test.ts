import { describe, expect, it } from "vitest";
import { initialDoc, type StudioDoc } from "./documento-inicial";
import { aplicarBase, baseDoDoc, dinheiroDoDocumento } from "./dinheiro-do-documento";
import { dataDoEnvioPorExtenso } from "./data-do-envio";
import type { Quote } from "@/lib/orcamento/types";

const doc = (extra: Partial<StudioDoc> = {}): StudioDoc => ({
  ...initialDoc({ id: "q1", name: "Ana", eventType: "casamentos" } as unknown as Quote),
  ...extra,
});

describe("a base do documento", () => {
  it("a acrescer: guarda a base, e base → bruto → base dá o mesmo número", () => {
    const d = aplicarBase(doc({ totalVatMode: "acrescer", vatRate: 0.23 }), 8100);
    expect(d.totalAmount).toBe(8100);
    expect(baseDoDoc(d)).toBe(8100);
  });

  it("incluído: guarda o BRUTO, mas a base lida continua a ser a do pedido", () => {
    const d = aplicarBase(doc({ totalVatMode: "incluido", vatRate: 0.23 }), 8100);
    expect(d.totalAmount).toBeCloseTo(9963, 2);
    expect(baseDoDoc(d)).toBe(8100);
  });

  it("sem valor nenhum, a base é `undefined` (e não zero)", () => {
    expect(baseDoDoc(doc({ totalAmount: undefined }))).toBeUndefined();
  });

  it("numa organização escreve o texto estimado, e não o do total", () => {
    const d = aplicarBase(doc({ template: "organizacao", totalVatMode: "acrescer" }), 100);
    expect(d.totalEstimatedText).toMatch(/\+ IVA$/);
  });
});

describe("os campos que decidem o dinheiro — e só esses", () => {
  it("copia o dinheiro e nada mais, mesmo os que estão em falta (ficam `undefined`)", () => {
    const enviado = doc({ totalAmount: 500, vatRate: undefined, clientNames: "Outro casal" });
    const d = dinheiroDoDocumento(enviado);
    expect(d.totalAmount).toBe(500);
    expect("vatRate" in d).toBe(true);
    expect(d.vatRate).toBeUndefined();
    expect("clientNames" in d).toBe(false);
  });
});

describe("a data do envio por extenso", () => {
  it("escreve o dia, o mês e o ano", () => {
    expect(dataDoEnvioPorExtenso("2026-09-12T10:00:00Z")).toBe("em 12 de setembro de 2026");
  });
  it("uma data ilegível não se escreve", () => {
    expect(dataDoEnvioPorExtenso("não é data")).toBe("num envio anterior");
  });
});
