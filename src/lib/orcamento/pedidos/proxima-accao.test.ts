import { describe, expect, it } from "vitest";
import { proximaAccaoDoPedido } from "./proxima-accao";

describe("a próxima acção", () => {
  it("perdido reabre; tudo feito revê a produção; senão, pelo degrau", () => {
    const p = (o: Partial<{ perdido: boolean; currentIndex: number; allDone: boolean }>) =>
      proximaAccaoDoPedido({ perdido: false, currentIndex: 0, allDone: false, ...o }).tab;
    expect(p({ perdido: true })).toBe("gestao");
    expect(p({ allDone: true })).toBe("producao");
    expect([0, 1, 2, 3, 4].map((i) => p({ currentIndex: i }))).toEqual([
      "comunicacao",
      "comunicacao",
      "financeiro",
      "producao",
      "producao",
    ]);
  });
});
