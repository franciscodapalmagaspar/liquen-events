import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";

/**
 * SEM O ECRÃ PRETO COM A BOLINHA (1/11, à noite).
 *
 * Ela: «quando eu carrego numa coisa e aquilo fica a pensar, aquilo fica preto
 * com uma bolinha no meio. Retira isso, eu não quero que isso apareça». Era o
 * `loading.tsx` do grupo (site): a cada navegação que ainda não estava
 * pré-carregada, a página onde se estava dava lugar a um ecrã escuro com um
 * ponto a pulsar.
 *
 * Sem ele, a página onde se está fica à vista até a próxima chegar, e a linha
 * fina do topo (`LinhaDeCarregamento`) mostra que o toque foi recebido — a
 * escolha dela de 10/10 («Linha fina no topo») para o ecrã branco com o
 * logótipo, que era o mesmo defeito. Este teste impede que volte.
 */
describe("o sítio público não tem ecrã de espera", () => {
  it("não há `loading.tsx` no grupo (site)", () => {
    expect(existsSync("src/app/[lang]/(site)/loading.tsx")).toBe(false);
  });
});
