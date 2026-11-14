import { describe, it, expect } from "vitest";
import { normalizedThemeName, themeNameTakenError } from "./theme-types";

/**
 * A normalização de nomes é o que impede a biblioteca de encher de temas
 * quase iguais ("Itália" e "Italia" lado a lado no seletor da proposta). Vive
 * no módulo client-safe para o formulário poder avisar com a MESMA regra que
 * as rotas aplicam — por isso é aqui que ela é fixada.
 */
describe("normalizedThemeName", () => {
  it("iguala nomes que a equipa lê como o mesmo tema", () => {
    expect(normalizedThemeName("Itália")).toBe(normalizedThemeName("Italia"));
    expect(normalizedThemeName("  TERRACOTTA ")).toBe(normalizedThemeName("Terracotta"));
    expect(normalizedThemeName("Branco  &  Verde")).toBe(normalizedThemeName("branco & verde"));
    expect(normalizedThemeName("Provença")).toBe(normalizedThemeName("provenca"));
  });

  it("mantém distintos os temas que são mesmo distintos", () => {
    expect(normalizedThemeName("Itália")).not.toBe(normalizedThemeName("Itália Antiga"));
    expect(normalizedThemeName("Terracotta")).not.toBe(normalizedThemeName("Terracota"));
  });
});

describe("themeNameTakenError", () => {
  it('nomeia o nome recusado e diz "equivalente" (a comparação ignora acentos)', () => {
    expect(themeNameTakenError("Italia")).toBe(
      'Já existe um tema com um nome equivalente a "Italia".',
    );
  });
});

/**
 * Revisão de 14/11, n.º 7: a foto na Reciclagem não está na grelha, por isso a
 * ordem que o ecrã envia ao reordenar já não a traz. Perdia o lugar arrumado
 * e, reposta, ia para a cauda.
 */
describe("ordemComAsDaReciclagem", () => {
  it("a da Reciclagem volta logo a seguir à que a precedia", async () => {
    const { ordemComAsDaReciclagem } = await import("./theme-types");
    const antiga = ["t/a.jpg", "t/foi.jpg", "t/b.jpg", "t/c.jpg"];
    const nova = ["t/c.jpg", "t/a.jpg", "t/b.jpg"];
    expect(ordemComAsDaReciclagem(antiga, nova, new Set(["t/foi.jpg"]))).toEqual([
      "t/c.jpg",
      "t/a.jpg",
      "t/foi.jpg",
      "t/b.jpg",
    ]);
  });

  it("à frente quando nada a precedia; e a que saiu de vez não volta", async () => {
    const { ordemComAsDaReciclagem } = await import("./theme-types");
    const antiga = ["t/foi.jpg", "t/apagada.jpg", "t/a.jpg"];
    expect(ordemComAsDaReciclagem(antiga, ["t/a.jpg"], new Set(["t/foi.jpg"]))).toEqual([
      "t/foi.jpg",
      "t/a.jpg",
    ]);
  });
});

/**
 * Revisão de 14/11 (2.ª), menor n.º 5: com o tecto de 500, a ordem nova DELA
 * vem primeiro e nunca é cortada; das da Reciclagem, só entram as que cabem.
 * Antes, as da Reciclagem entravam no meio e o `slice` final cortava a cauda
 * da ordem que ela acabou de arrumar.
 */
describe("ordemComAsDaReciclagem, no tecto", () => {
  it("a ordem nova fica inteira; corta-se só as da Reciclagem que não cabem", async () => {
    const { ordemComAsDaReciclagem, MAX_PHOTO_ORDER } = await import("./theme-types");
    const nova = Array.from({ length: MAX_PHOTO_ORDER - 1 }, (_, i) => `t/n${i}.jpg`);
    // Duas da Reciclagem, logo à cabeça da ordem antiga: só cabe uma.
    const antiga = ["t/r0.jpg", "t/r1.jpg", ...nova];
    const r = ordemComAsDaReciclagem(antiga, nova, new Set(["t/r0.jpg", "t/r1.jpg"]));
    expect(r).toHaveLength(MAX_PHOTO_ORDER);
    // Todas as dela, pela ordem dela.
    expect(r.filter((p) => p.includes("/n"))).toEqual(nova);
    // Da Reciclagem, a primeira (a que cabe), no seu lugar.
    expect(r[0]).toBe("t/r0.jpg");
    expect(r).not.toContain("t/r1.jpg");
  });

  it("com a ordem nova já no tecto, nenhuma da Reciclagem entra", async () => {
    const { ordemComAsDaReciclagem, MAX_PHOTO_ORDER } = await import("./theme-types");
    const nova = Array.from({ length: MAX_PHOTO_ORDER }, (_, i) => `t/n${i}.jpg`);
    const r = ordemComAsDaReciclagem(["t/r0.jpg", ...nova], nova, new Set(["t/r0.jpg"]));
    expect(r).toEqual(nova);
  });
});
