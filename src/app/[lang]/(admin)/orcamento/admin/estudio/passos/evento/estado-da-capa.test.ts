import { describe, expect, it } from "vitest";
import { LADO_MINIMO_DA_CAPA, perdaNaFolha } from "@/lib/pdf-editorial/regra-da-capa";
import { estadoDaCapa } from "./estado-da-capa";

const base = {
  path: "capa.jpg",
  aspeto: 1.5 as number | undefined,
  tamanho: { w: 3000, h: 2000 } as { w: number; h: number } | null,
  capaMesmoAssim: undefined as boolean | undefined,
  focoDaCapa: undefined as { x: number; y: number } | undefined,
  focoAuto: null as { caminho: string; foco: { x: number; y: number } } | null,
};

describe("estadoDaCapa", () => {
  it("uma fotografia deitada e grande vai, e mostra a perda do recorte", () => {
    const e = estadoDaCapa(base);
    expect(e.problema).toBeNull();
    expect(e.naoVai).toBe(false);
    expect(e.mesmoAssim).toBe(false);
    expect(e.perda).toBe(perdaNaFolha(1.5));
  });

  it("ao alto não vai para o PDF, e não conta perda", () => {
    const e = estadoDaCapa({ ...base, aspeto: 0.66, tamanho: { w: 2000, h: 3000 } });
    expect(e.problema).toBe("ao-alto");
    expect(e.naoVai).toBe(true);
    expect(e.perda).toBe(0);
  });

  it("pequena de mais não vai", () => {
    const lado = LADO_MINIMO_DA_CAPA - 1;
    const e = estadoDaCapa({ ...base, tamanho: { w: lado, h: Math.round(lado / 1.5) } });
    expect(e.problema).toBe("pequena");
    expect(e.naoVai).toBe(true);
  });

  it("sem tamanho medido, decide pela forma: ao alto é problema", () => {
    expect(estadoDaCapa({ ...base, tamanho: null, aspeto: 0.8 }).problema).toBe("ao-alto");
    expect(estadoDaCapa({ ...base, tamanho: null, aspeto: 1.4 }).problema).toBeNull();
    expect(estadoDaCapa({ ...base, tamanho: null, aspeto: undefined }).problema).toBeNull();
  });

  it("«usa esta na mesma» faz a que não servia ir, e volta a contar a perda", () => {
    const e = estadoDaCapa({
      ...base,
      aspeto: 0.66,
      tamanho: { w: 2000, h: 3000 },
      capaMesmoAssim: true,
    });
    expect(e.mesmoAssim).toBe(true);
    expect(e.naoVai).toBe(false);
    expect(e.perda).toBe(perdaNaFolha(0.66));
  });

  it("«usa esta na mesma» numa que serve não acende nada", () => {
    expect(estadoDaCapa({ ...base, capaMesmoAssim: true }).mesmoAssim).toBe(false);
  });

  it("o enquadramento: o dela, senão o do servidor para ESTA foto, senão o centro", () => {
    const dela = { x: 0.2, y: 0.8 };
    const doServidor = { x: 0.7, y: 0.3 };
    expect(
      estadoDaCapa({
        ...base,
        focoDaCapa: dela,
        focoAuto: { caminho: "capa.jpg", foco: doServidor },
      }).focoVisto,
    ).toEqual(dela);
    expect(
      estadoDaCapa({ ...base, focoAuto: { caminho: "capa.jpg", foco: doServidor } }).focoVisto,
    ).toEqual(doServidor);
    expect(
      estadoDaCapa({ ...base, focoAuto: { caminho: "outra.jpg", foco: doServidor } }).focoVisto,
    ).toEqual({ x: 0.5, y: 0.5 });
  });
});
