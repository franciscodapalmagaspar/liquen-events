import { describe, expect, it } from "vitest";
import { fotosNoTectoDoPdf } from "./fotos-escolhidas";
import type { ProposalDoc } from "./proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TECTO DE FOTOS DO PDF NÃO DEIXA NENHUM MOOD BOARD VAZIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 3.ª revisão de 14/11, importante n.º 1: com a capa e nove boards de dez (91
 * fotos diferentes), o tecto de 80 cortava pela ordem do documento e deixava o
 * board 8 INTEIRO de fora — a página do tema saía só com o título. Agora a ★
 * de cada board cabe logo a seguir às escolhidas à mão.
 *
 * E o menor n.º 3: um lugar só com espaços não é uma foto (o motor não a vai
 * buscar), e não gasta tecto.
 *
 * Fotografias de mentira — nenhuma foto de cliente entra num teste.
 */

const boards = (n: number, fotos: number, extra: Record<number, object> = {}) =>
  Array.from({ length: n }, (_, b) => ({
    title: `Tema ${b}`,
    images: Array.from({ length: fotos }, (_, k) => `TESTE/b${b}f${k}.jpg`),
    ...extra[b],
  }));

describe("o tecto de fotos do PDF e os mood boards", () => {
  it("capa + 9 boards de 10: todos os boards ficam com pelo menos uma foto, e a ★ é a que fica", () => {
    const doc = {
      coverImages: ["TESTE/capa.jpg"],
      // O board 8 tem a ★ na 4.ª foto: é ESSA que tem de caber.
      moodBoards: boards(9, 10, { 8: { principal: 3 } }),
    } as unknown as ProposalDoc;
    const r = fotosNoTectoDoPdf(doc, { comPaginas: true });
    expect(r.dentro.size).toBe(80);
    expect(r.aMais).toBe(11);
    for (const b of doc.moodBoards) {
      expect(b.images.some((f) => r.dentro.has(f))).toBe(true);
    }
    expect(r.dentro.has("TESTE/b8f3.jpg")).toBe(true);
    expect(r.boardsVazios).toEqual([]);
    expect(r.escolhidasDeFora).toEqual([]);
    expect(r.queTravam.size).toBe(0);
  });

  it("mais boards do que o tecto: os que ficam sem nenhuma foto travam", () => {
    const doc = {
      coverImages: ["TESTE/capa.jpg"],
      moodBoards: boards(85, 2),
    } as unknown as ProposalDoc;
    const r = fotosNoTectoDoPdf(doc, { comPaginas: true });
    // A capa e 79 ★: os boards 79 a 84 ficam sem nenhuma.
    expect(r.boardsVazios).toEqual([79, 80, 81, 82, 83, 84]);
    expect(r.queTravam.has("TESTE/b84f0.jpg")).toBe(true);
    expect(r.queTravam.has("TESTE/b84f1.jpg")).toBe(true);
    expect(r.queTravam.has("TESTE/b0f1.jpg")).toBe(false);
  });

  it("um lugar só com espaços não gasta tecto", () => {
    const doc = {
      coverImages: ["   ", "TESTE/capa.jpg"],
      moodBoards: [
        { title: "T", images: ["TESTE/a.jpg", "\t "] },
        { title: "U", images: ["TESTE/b.jpg"] },
      ],
    } as unknown as ProposalDoc;
    const r = fotosNoTectoDoPdf(doc, { comPaginas: true, tecto: 3 });
    expect([...r.dentro].sort()).toEqual(["TESTE/a.jpg", "TESTE/b.jpg", "TESTE/capa.jpg"]);
    expect(r.aMais).toBe(0);
  });
  it("a ★ de fora trava mesmo quando outra foto do board entrou (por ser a capa)", () => {
    // 82 boards de 2 fotos; a capa é a 2.ª foto do último board. Entram a capa
    // e 79 ★: a ★ do board 81 fica de fora, embora ele não fique vazio.
    const doc = {
      coverImages: ["TESTE/b81f1.jpg"],
      moodBoards: boards(82, 2),
    } as unknown as Partial<ProposalDoc>;
    const r = fotosNoTectoDoPdf(doc);
    expect(r.dentro.has("TESTE/b81f1.jpg")).toBe(true);
    expect(r.dentro.has("TESTE/b81f0.jpg")).toBe(false);
    expect(r.boardsVazios).toContain(81);
    expect(r.queTravam.has("TESTE/b81f0.jpg")).toBe(true);
    expect(r.queTravam.has("TESTE/b81f1.jpg")).toBe(false);
  });
});
