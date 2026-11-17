import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spaceTypeLabel } from "@/lib/orcamento/data";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O CASAL RESPONDEU CHEGA TODO À PROPOSTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Quero que o sistema coloque logo isto no back office, nos espaços a fazer a
 * proposta.»
 *
 * Contado antes de mexer: das SETE respostas do pedido, seis já chegavam
 * sozinhas ao estúdio — o casal, a data, os convidados, o local, a cerimónia,
 * e os pontos de decoração, que viram as linhas do orçamento. Faltava o
 * ESPAÇO: o casal responde «Exterior» e essa resposta morria no pedido, com
 * quem escrevia a proposta a ter de lá voltar para se lembrar se era ao ar
 * livre.
 *
 * Vai junto ao local — «Setúbal Alentejo · Exterior» — e não num campo novo:
 * uma linha a mais no documento do casal é uma decisão sobre o papel que sai;
 * um local mais completo é a mesma linha a dizer mais.
 */

const ESTUDIO = fs.readFileSync(
  path.join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin/ProposalStudio.tsx"),
  "utf8",
);

/** A conta que o estúdio faz, reproduzida aqui para se poder medir. */
const localDaProposta = (local: string, espaco: unknown) =>
  [local ?? "", spaceTypeLabel(espaco)]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" · ");

describe("o espaço do pedido chega à proposta", () => {
  it("o estúdio junta o espaço ao local", () => {
    expect(
      ESTUDIO,
      "o estúdio deixou de ler o espaço do pedido — a resposta do casal volta a morrer lá",
    ).toContain("spaceTypeLabel(quote.spaceType)");
  });

  it("e a linha lê-se «local · espaço»", () => {
    expect(localDaProposta("Setúbal Alentejo", "exterior")).toBe("Setúbal Alentejo · Exterior");
    expect(localDaProposta("Évora", "interior-exterior")).toBe("Évora · Interior e exterior");
  });

  it("sem espaço respondido, fica só o local — e nunca um ponto pendurado", () => {
    // O campo é OPCIONAL no formulário. Um «Évora · » é pior do que um «Évora».
    expect(localDaProposta("Évora", "")).toBe("Évora");
    expect(localDaProposta("Évora", undefined)).toBe("Évora");
    expect(localDaProposta("Évora", "id-que-nunca-existiu")).toBe("Évora");
  });

  it("e sem local nenhum, fica só o espaço — e também não", () => {
    expect(localDaProposta("", "exterior")).toBe("Exterior");
    expect(localDaProposta("", "")).toBe("");
  });
});
