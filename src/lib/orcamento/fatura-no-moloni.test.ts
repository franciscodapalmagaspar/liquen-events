import { describe, it, expect } from "vitest";
import type { RascunhoNoMoloni } from "./types";
import {
  faseQuePodeTerFaturaNoMoloni,
  fasesQuePodemTerFaturaNoMoloni,
  faturaJaEstaNoMoloni,
} from "./fatura-no-moloni";

const comDocumento: RascunhoNoMoloni = { em: "x", documentId: 9 };
const aMao: RascunhoNoMoloni = { em: "x", manual: true };
const marcaVelha: RascunhoNoMoloni = { em: "x", aCriarDesde: "2026-01-01T00:00:00Z" };
const soAnteriores: RascunhoNoMoloni = { em: "x", anteriores: [4] };
const vazia: RascunhoNoMoloni = { em: "x" };

describe("a rota: a fatura JÁ está no Moloni?", () => {
  it("só com o documento ou passada à mão", () => {
    expect(faturaJaEstaNoMoloni(comDocumento)).toBe(true);
    expect(faturaJaEstaNoMoloni(aMao)).toBe(true);
    expect(faturaJaEstaNoMoloni(null)).toBe(false);
    expect(faturaJaEstaNoMoloni(vazia)).toBe(false);
  });

  it("a marca de «a ser criado» não conta: uma caduca não pode prender a fase", () => {
    expect(faturaJaEstaNoMoloni(marcaVelha)).toBe(false);
  });
});

describe("o apagar: a fase PODE ter um documento no Moloni?", () => {
  // Júri, 12.ª volta (18/11): a rota põe a marca ANTES de falar com o Moloni e
  // só a troca pelo documento DEPOIS. Se essa escrita falha, a marca é o único
  // rasto de um rascunho que existe lá.
  it("a marca de «a ser criado», mesmo velha e sem documento, conta", () => {
    expect(faseQuePodeTerFaturaNoMoloni(marcaVelha)).toBe(true);
  });

  it("os rascunhos anteriores da fase também contam", () => {
    expect(faseQuePodeTerFaturaNoMoloni(soAnteriores)).toBe(true);
    expect(faseQuePodeTerFaturaNoMoloni({ anteriores: [] })).toBe(false);
  });

  it("conta tudo o que a rota conta", () => {
    expect(faseQuePodeTerFaturaNoMoloni(comDocumento)).toBe(true);
    expect(faseQuePodeTerFaturaNoMoloni(aMao)).toBe(true);
    expect(faseQuePodeTerFaturaNoMoloni(vazia)).toBe(false);
    expect(faseQuePodeTerFaturaNoMoloni(undefined)).toBe(false);
  });

  it("conta as fases do pedido, de 0 a 2", () => {
    expect(fasesQuePodemTerFaturaNoMoloni(null)).toBe(0);
    expect(fasesQuePodemTerFaturaNoMoloni({})).toBe(0);
    expect(fasesQuePodemTerFaturaNoMoloni({ faturasMoloni: { sinal: undefined } })).toBe(0);
    expect(fasesQuePodemTerFaturaNoMoloni({ faturasMoloni: { sinal: vazia } })).toBe(0);
    expect(
      fasesQuePodemTerFaturaNoMoloni({ faturasMoloni: { sinal: comDocumento, saldo: aMao } }),
    ).toBe(2);
    expect(
      fasesQuePodemTerFaturaNoMoloni({
        faturasMoloni: { sinal: marcaVelha, saldo: soAnteriores },
      }),
    ).toBe(2);
  });
});
