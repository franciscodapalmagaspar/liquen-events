import { describe, expect, it } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import { HISTORICO_MAXIMO, juntarAoHistorico } from "./juntar-ao-historico";

type Linha = NonNullable<Quote["activityLog"]>[number];
const linha = (id: string): Linha =>
  ({ id, at: "2026-11-17T10:00:00Z", kind: "nota", summary: id }) as unknown as Linha;

describe("juntarAoHistorico", () => {
  it("um «Guardar» repetido (a resposta não chegou) não escreve as mesmas linhas duas vezes", () => {
    const depoisDoPrimeiro = juntarAoHistorico([linha("a")], [linha("b"), linha("c")]);
    const depoisDaRepeticao = juntarAoHistorico(depoisDoPrimeiro, [linha("b"), linha("c")]);
    expect(depoisDaRepeticao.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("as linhas sem id (clientes antigos) entram sempre, como antes", () => {
    const semId = { at: "2026-11-17T10:00:00Z", kind: "nota", summary: "x" } as unknown as Linha;
    expect(juntarAoHistorico([semId], [semId])).toHaveLength(2);
  });

  it("guarda só as mais recentes", () => {
    const muitas = Array.from({ length: HISTORICO_MAXIMO }, (_, i) => linha(`v${i}`));
    const r = juntarAoHistorico(muitas, [linha("nova")]);
    expect(r).toHaveLength(HISTORICO_MAXIMO);
    expect(r.at(-1)?.id).toBe("nova");
    expect(r[0].id).toBe("v1");
  });
});
