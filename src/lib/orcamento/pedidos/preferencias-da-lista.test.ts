import { describe, expect, it } from "vitest";
import { ROTULO_DO_ESTADO } from "@/lib/orcamento/estado-do-pedido";
import { filtroGuardado, ordemGuardada, ORDENS_DOS_PEDIDOS } from "./preferencias-da-lista";

describe("o que a lista de pedidos lê do localStorage", () => {
  it("aceita cada uma das seis ordens, e só essas", () => {
    for (const o of ORDENS_DOS_PEDIDOS) expect(ordemGuardada(o)).toBe(o);
    expect(ORDENS_DOS_PEDIDOS).toHaveLength(6);
    for (const lixo of [null, "", "Espera", "toString", "constructor", "recente"])
      expect(ordemGuardada(lixo)).toBeUndefined();
  });

  it("aceita «todos» e os seis estados, e recusa o resto", () => {
    expect(filtroGuardado("all")).toBe("all");
    for (const estado of Object.keys(ROTULO_DO_ESTADO)) expect(filtroGuardado(estado)).toBe(estado);
    // `Object.hasOwn` e não `in`: «toString» não é um estado (ver `vistaValida`).
    for (const lixo of [null, "", "todos", "toString", "constructor", "PENDENTE"])
      expect(filtroGuardado(lixo)).toBeUndefined();
  });
});
