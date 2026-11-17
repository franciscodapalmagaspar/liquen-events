import { describe, expect, it } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import { diasAEsperar, pedidoParado } from "./espera-na-lista";

describe("a espera na lista", () => {
  const agora = Date.parse("2026-11-17T12:00:00Z");
  it("um fechado não está à espera; um aberto conta dias inteiros", () => {
    expect(
      diasAEsperar({ status: "aceite", submittedAt: "2026-01-01" } as Quote, agora),
    ).toBeNull();
    expect(
      diasAEsperar({ status: "cotado", submittedAt: "2026-11-10T13:00:00Z" } as Quote, agora),
    ).toBe(6);
  });

  it("parado: aberto e catorze dias ou mais", () => {
    expect(pedidoParado("cotado", 14)).toBe(true);
    expect(pedidoParado("cotado", 13)).toBe(false);
    expect(pedidoParado("aceite", 99)).toBe(false);
  });
});
