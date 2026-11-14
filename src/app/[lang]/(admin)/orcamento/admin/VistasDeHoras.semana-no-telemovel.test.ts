// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { chaoComDiasInteiros, inicioDoDiaAVista } from "./VistasDeHoras";

/**
 * A semana no telemóvel abre no INÍCIO de um dia, e com hoje inteiro à vista.
 *
 * MEDIDO na auditoria de 14/11 (um sábado), a 390 px: 48 px de horas e sete
 * colunas de 96 numa caixa de 343 — o rolo vai até 377. Encostar o sábado
 * (480) passava do fim, o browser travava nos 377, e a semana abria com a
 * quinta cortada a meio. O jsdom não faz geometria, por isso as medidas dão-se
 * à mão, as mesmas da medição.
 */
function semana(larguraDaCaixa: number, coluna = 96, horas = 48) {
  const fila = document.createElement("div");
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = document.createElement("div");
    Object.defineProperty(d, "offsetLeft", { value: horas + i * coluna });
    fila.appendChild(d);
    return d;
  });
  const caixa = document.createElement("div");
  Object.defineProperty(caixa, "scrollWidth", { value: horas + 7 * coluna });
  Object.defineProperty(caixa, "clientWidth", { value: larguraDaCaixa });
  return { caixa, dias };
}

describe("a semana no telemóvel abre no início de um dia", () => {
  it("as colunas alargam até um ecrã levar dias inteiros (295 → três de 98,3)", () => {
    const c = chaoComDiasInteiros(Array(7).fill(96), 295);
    expect(c[0]).toBeCloseTo(295 / 3, 5);
    // O fim do rolo (7 colunas − 3 à vista) é o início da 5.ª: um dia inteiro.
    expect(7 * c[0] - 295).toBeCloseTo(4 * c[0], 5);
    // Quando a semana cabe, nada muda.
    expect(chaoComDiasInteiros(Array(7).fill(96), 700)).toEqual(Array(7).fill(96));
    expect(chaoComDiasInteiros([96], null)).toEqual([96]);
  });

  for (const [nome, i] of [
    ["segunda", 0],
    ["quarta", 2],
    ["quinta", 3],
    ["sexta", 4],
    ["sábado (o dia da auditoria)", 5],
    ["domingo", 6],
  ] as const) {
    it(`numa ${nome}: a coluna da esquerda é um dia inteiro, e hoje vê-se inteiro`, () => {
      const largura = 295 / 3;
      // As medidas que o browser dá: `offsetLeft` arredondado.
      const fila = document.createElement("div");
      const dias = Array.from({ length: 7 }, (_, k) => {
        const d = document.createElement("div");
        Object.defineProperty(d, "offsetLeft", { value: Math.round(48 + k * largura) });
        fila.appendChild(d);
        return d;
      });
      const caixa = document.createElement("div");
      Object.defineProperty(caixa, "scrollWidth", { value: Math.round(48 + 7 * largura) });
      Object.defineProperty(caixa, "clientWidth", { value: 343 });
      const x = inicioDoDiaAVista(caixa, dias[i]);
      const inicios = dias.map((d) => d.offsetLeft - 48);
      expect(
        inicios.some((s) => Math.abs(s - x) <= 1),
        `abre em ${x}, fora do início de um dia`,
      ).toBe(true);
      const meu = inicios[i];
      expect(meu >= x - 1 && meu + largura <= x + 295 + 1, "hoje inteiro à vista").toBe(true);
    });
  }

  it("com colunas de 96 sem acerto, o sábado não abre a meio da quinta (controlo do defeito)", () => {
    const { caixa, dias } = semana(343);
    const x = inicioDoDiaAVista(caixa, dias[5]);
    // Antes: 377 (o fim do rolo), que é 3,9 colunas — a quinta cortada a meio.
    expect(x % 96).toBe(0);
  });
});
