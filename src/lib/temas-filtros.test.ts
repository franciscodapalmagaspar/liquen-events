import { describe, expect, it } from "vitest";
import type { ThemeSummary } from "./theme-types";
import {
  AMBITOS,
  ambitoResponde,
  ambitosDisponiveis,
  contarPorAmbito,
  eAmbito,
  filtrarPorAmbito,
  type DadosDeUso,
} from "./temas-filtros";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CINCO ÂMBITOS DA BIBLIOTECA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que aqui se prende não é o desenho da barra — é a ARITMÉTICA que aparece
 * escrita ao lado de cada nome. Uma contagem errada num filtro é pior do que
 * não haver filtro nenhum: ela lê «Por usar 4», carrega, vê três, e conclui
 * que o ecrã perdeu um tema.
 */

const tema = (id: string, extra: Partial<ThemeSummary> = {}): ThemeSummary => ({
  id,
  name: id,
  notes: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  imageCount: 5,
  ...extra,
});

/** Cinco temas: dois nunca usados, um favorito, um arquivado. */
const BIBLIOTECA: ThemeSummary[] = [
  tema("terracotta"),
  tema("italia", { favorito: true }),
  tema("boho"),
  tema("praia"),
  tema("velho", { arquivado: true }),
];

/** «terracotta» saiu em 7 propostas, «italia» numa. Os outros nunca saíram. */
const USOS: DadosDeUso = { usos: { terracotta: 7, italia: 1 }, usosEsteAno: null };
const SEM_USO: DadosDeUso = { usos: null, usosEsteAno: null };

const ids = (ts: readonly ThemeSummary[]) => ts.map((t) => t.id);

describe("os âmbitos da Biblioteca de Temas", () => {
  it("o arquivo é uma vista, e não um filtro que se soma", () => {
    // Nenhum dos quatro primeiros mostra um tema arquivado…
    for (const a of ["todos", "por-usar", "favoritos"] as const) {
      expect(ids(filtrarPorAmbito(BIBLIOTECA, a, USOS)), a).not.toContain("velho");
    }
    // …e «Arquivados» mostra SÓ esses.
    expect(ids(filtrarPorAmbito(BIBLIOTECA, "arquivados", USOS))).toEqual(["velho"]);
  });

  it("«Por usar» devolve exactamente os temas com zero propostas", () => {
    // É o critério de aceitação nº 7 do `docs/APPLE-TEMAS.md`.
    expect(ids(filtrarPorAmbito(BIBLIOTECA, "por-usar", USOS))).toEqual(["boho", "praia"]);
  });

  it("«Favoritos» é o que está fixado, e não o que é mais usado", () => {
    expect(ids(filtrarPorAmbito(BIBLIOTECA, "favoritos", USOS))).toEqual(["italia"]);
  });

  /**
   * Um âmbito que não sabe responder não se oferece. Antes de a contagem de
   * propostas chegar, «Por usar» devolveria a biblioteca inteira — e um filtro
   * que mente ensina a não usar os outros quatro.
   */
  it("sem a contagem de propostas, «Por usar» não se oferece", () => {
    expect(ambitoResponde("por-usar", SEM_USO)).toBe(false);
    expect(ambitoResponde("por-usar", USOS)).toBe(true);
    expect(ambitosDisponiveis(BIBLIOTECA, SEM_USO).map((a) => a.valor)).not.toContain("por-usar");
  });

  /** «Usados este ano» precisa da data e o servidor ainda não a manda. */
  it("«Usados este ano» só existe com a contagem do ano", () => {
    expect(ambitoResponde("este-ano", USOS)).toBe(false);
    expect(ambitoResponde("este-ano", { usos: {}, usosEsteAno: { terracotta: 2 } })).toBe(true);
    expect(
      ids(
        filtrarPorAmbito(BIBLIOTECA, "este-ano", { usos: {}, usosEsteAno: { terracotta: 2 } }),
      ),
    ).toEqual(["terracotta"]);
  });

  it("as contagens são as dos âmbitos, e batem certo com o que eles devolvem", () => {
    const conta = contarPorAmbito(BIBLIOTECA, USOS);
    for (const { valor } of AMBITOS) {
      expect(conta[valor], valor).toBe(filtrarPorAmbito(BIBLIOTECA, valor, USOS).length);
    }
    expect(conta.todos).toBe(4);
    expect(conta["por-usar"]).toBe(2);
    expect(conta.arquivados).toBe(1);
  });

  /**
   * A regra que o interruptor «Arquivados» já seguia antes de haver âmbitos:
   * um controlo que não tem nada para mostrar é um controlo a explicar uma
   * funcionalidade que ninguém ainda usou.
   */
  it("um âmbito vazio não aparece — mas «Todos» aparece sempre", () => {
    const semNadaDeEspecial = [tema("a"), tema("b")];
    const valores = ambitosDisponiveis(semNadaDeEspecial, {
      usos: { a: 1, b: 2 },
      usosEsteAno: null,
    }).map((x) => x.valor);
    expect(valores).toEqual(["todos"]);

    expect(ambitosDisponiveis(BIBLIOTECA, USOS).map((x) => x.valor)).toEqual([
      "todos",
      "por-usar",
      "favoritos",
      "arquivados",
    ]);
  });

  it("uma biblioteca vazia não rebenta nem inventa âmbitos", () => {
    expect(ambitosDisponiveis([], USOS).map((x) => x.valor)).toEqual(["todos"]);
    expect(contarPorAmbito([], USOS).todos).toBe(0);
  });

  it("reconhece um âmbito guardado, e recusa lixo", () => {
    expect(eAmbito("favoritos")).toBe(true);
    expect(eAmbito("por-usar")).toBe(true);
    expect(eAmbito("inventado")).toBe(false);
    expect(eAmbito(undefined)).toBe(false);
  });
});
