import { describe, expect, it } from "vitest";
import { funilDoNegocio, pct } from "./funil";

const q = (status: string, enviada = false, archived = false) =>
  ({
    status,
    archived,
    activityLog: enviada ? [{ id: "a", at: "2026-11-01", kind: "proposal_sent", summary: "" }] : [],
  }) as never;

describe("o funil do negócio (13/11)", () => {
  it("separa onde se perdem: antes ou depois da proposta", () => {
    const f = funilDoNegocio([
      q("pendente"),
      q("em_revisao"),
      q("cotado"),
      q("cotado"),
      q("aceite"),
      q("rejeitado"), // nunca viu proposta
      q("rejeitado", true), // viu e não quis
      q("pendente", false, true), // arquivado: não conta
    ]);
    expect(f).toEqual({
      chegaram: 7,
      comProposta: 4,
      aceites: 1,
      perdidosAntesDaProposta: 1,
      perdidosDepoisDaProposta: 1,
      semPropostaEmAberto: 2,
      aEsperarDecisao: 2,
    });
  });

  it("as percentagens contam a partir do passo anterior, sem dividir por zero", () => {
    expect(pct(4, 7)).toBe(57);
    expect(pct(1, 0)).toBe(0);
  });
});
