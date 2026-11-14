import { describe, it, expect } from "vitest";
import {
  contagemPorEtiqueta,
  eixoDe,
  porConfirmarSet,
  porFoto,
  procuraVazia,
  responde,
  soDaBiblioteca,
} from "./biblioteca-consulta";
import type { FotoEtiqueta, OrigemEtiqueta } from "./biblioteca-types";

const liga = (
  path: string,
  etiquetaId: string,
  origem: OrigemEtiqueta = "manual",
): FotoEtiqueta => ({
  id: `${path}#${etiquetaId}`,
  path,
  etiquetaId,
  origem,
  createdAt: "2026-08-05T00:00:00.000Z",
});

/** A capa da Itália: um seating plan, em terracotta, mediterrânico. A foto que
 *  tinha de estar em três sítios ao mesmo tempo. */
const CAPA_ITALIA = [
  liga("italia/capa.jpg", "tipo:seating-plan"),
  liga("italia/capa.jpg", "paleta:terracotta"),
  liga("italia/capa.jpg", "estilo:mediterranico", "migracao"),
];
const BOUQUET = [liga("bouquets/b1.jpg", "tipo:bouquet"), liga("bouquets/b1.jpg", "paleta:branco")];
/** Uma das 17 da Terracotta: saiu da migração com paleta e sem tipo nenhum. */
const SO_PALETA = [liga("terracotta/t1.jpg", "paleta:terracotta", "migracao")];

const TUDO = [...CAPA_ITALIA, ...BOUQUET, ...SO_PALETA];

const procurar = (procura: Parameters<typeof responde>[1]) => {
  const etiquetas = porFoto(TUDO);
  const adivinhadas = porConfirmarSet(TUDO);
  return [...new Set(TUDO.map((l) => l.path))].filter((p) =>
    responde(etiquetas.get(p), procura, adivinhadas.has(p)),
  );
};

describe("procurar na biblioteca", () => {
  /** A pergunta que era impossível fazer, e a razão de existir de tudo isto. */
  it("«seating plan terracotta» devolve a foto que é as duas coisas", () => {
    expect(procurar({ etiquetas: ["tipo:seating-plan", "paleta:terracotta"] })).toEqual([
      "italia/capa.jpg",
    ]);
  });

  /**
   * "E", não "ou". Com "ou", esta procura devolvia também a foto que só tem
   * paleta terracotta — e a equipa passava a ver, numa procura por seating
   * plans, fotos que não são seating plans nenhuns.
   */
  it("exige TODAS as etiquetas, não uma delas", () => {
    const soPaleta = procurar({ etiquetas: ["paleta:terracotta"] });
    expect(soPaleta).toContain("terracotta/t1.jpg");
    expect(procurar({ etiquetas: ["tipo:seating-plan", "paleta:terracotta"] })).not.toContain(
      "terracotta/t1.jpg",
    );
  });

  it("uma procura sem exigências devolve tudo", () => {
    expect(procurar({})).toHaveLength(3);
    expect(procuraVazia({})).toBe(true);
    expect(procuraVazia({ etiquetas: ["tipo:bouquet"] })).toBe(false);
    expect(procuraVazia({ semEixo: ["tipo"] })).toBe(false);
  });

  /** O filtro de que a revisão em lote vive: "mostra-me o que falta". */
  it("«sem tipo» devolve exactamente as fotos a que falta o eixo", () => {
    expect(procurar({ semEixo: ["tipo"] })).toEqual(["terracotta/t1.jpg"]);
    expect(procurar({ semEixo: ["estilo"] })).toEqual(["bouquets/b1.jpg", "terracotta/t1.jpg"]);
  });

  it("«sem tipo» e «sem estilo» ao mesmo tempo exige os dois vazios", () => {
    expect(procurar({ semEixo: ["tipo", "estilo"] })).toEqual(["terracotta/t1.jpg"]);
  });

  it("«por confirmar» é o que a migração adivinhou e ninguém confirmou", () => {
    expect(procurar({ porConfirmar: true }).sort()).toEqual([
      "italia/capa.jpg",
      "terracotta/t1.jpg",
    ]);
  });

  it("combina exigência de etiqueta com eixo em falta", () => {
    expect(procurar({ etiquetas: ["paleta:terracotta"], semEixo: ["tipo"] })).toEqual([
      "terracotta/t1.jpg",
    ]);
  });

  /** Uma foto que ainda não tem linha de etiquetas nenhuma não pode fazer a
   *  procura rebentar — e responde a "sem tipo", porque é verdade. */
  it("uma foto sem etiquetas nenhumas conta como sem todos os eixos", () => {
    expect(responde(undefined, { semEixo: ["tipo", "paleta", "estilo"] })).toBe(true);
    expect(responde(undefined, { etiquetas: ["tipo:bouquet"] })).toBe(false);
  });
});

describe("as contas dos chips", () => {
  it("conta as fotos de cada etiqueta", () => {
    const contas = contagemPorEtiqueta(TUDO);
    expect(contas.get("paleta:terracotta")).toBe(2);
    expect(contas.get("tipo:bouquet")).toBe(1);
    expect(contas.get("paleta:rosa")).toBeUndefined();
  });

  it("o eixo lê-se do próprio id", () => {
    expect(eixoDe("paleta:terracotta")).toBe("paleta");
    expect(eixoDe("tipo:seating-plan")).toBe("tipo");
    // Um id sem dois-pontos não pertence a eixo nenhum — e o que não pode
    // acontecer é passar a valer como se pertencesse a todos.
    expect(eixoDe("solto")).toBe("");
  });
});

describe("soDaBiblioteca — as fotos das propostas não são da Biblioteca (14/11)", () => {
  const temas = new Set(["3f6c1b2e-9a4d-4c7e-8f10-aa11bb22cc33"]);
  it("fica só com as pastas de temas que existem", () => {
    const fotos = [
      { path: "LIQ-2026-0412/a.jpg", pasta: "LIQ-2026-0412" },
      {
        path: "3f6c1b2e-9a4d-4c7e-8f10-aa11bb22cc33/b.jpg",
        pasta: "3f6c1b2e-9a4d-4c7e-8f10-aa11bb22cc33",
      },
      { path: "orfa/c.jpg", pasta: "orfa" },
      { path: "d.jpg", pasta: "" },
    ];
    expect(soDaBiblioteca(fotos, temas).map((f) => f.path)).toEqual([
      "3f6c1b2e-9a4d-4c7e-8f10-aa11bb22cc33/b.jpg",
    ]);
  });
  it("sem temas, a Biblioteca fica vazia — nunca cai para a tabela inteira", () => {
    expect(soDaBiblioteca([{ path: "LIQ-1/a.jpg", pasta: "LIQ-1" }], new Set())).toEqual([]);
  });
});
