import { describe, expect, it } from "vitest";
import { ROTULO_DO_ESTADO } from "@/lib/orcamento/estado-do-pedido";
import { STATUS_OPTIONS } from "./estado-do-pedido";

/**
 * Os rótulos dos estados eram duas listas escritas à mão — a da pastilha (aqui)
 * e a do histórico (`ROTULO_DO_ESTADO`) — presas uma à outra só por um
 * comentário. Passaram a ser uma (fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`);
 * isto prende que continuam a ser.
 */
describe("os estados do pedido, como se desenham", () => {
  it("um por estado, cada um com o rótulo do histórico", () => {
    expect(STATUS_OPTIONS.map((o) => o.id).sort()).toEqual(Object.keys(ROTULO_DO_ESTADO).sort());
    for (const o of STATUS_OPTIONS) expect(o.label).toBe(ROTULO_DO_ESTADO[o.id]);
  });

  it("e pela ordem do quadro, que é a ordem do selector", () => {
    expect(STATUS_OPTIONS.map((o) => o.label)).toEqual([
      "Novo",
      "Aguardar resposta",
      "A preparar proposta",
      "Proposta enviada",
      "Ganho",
      "Perdido",
    ]);
  });
});
