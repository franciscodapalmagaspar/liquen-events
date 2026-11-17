import { describe, it, expect, vi, afterEach } from "vitest";
import { relogioDoEnvio, TECTO_DO_ENVIO_S } from "./orcamento-de-tempo";
import { maxDuration } from "@/app/api/orcamento/[id]/proposta-doc/route";

afterEach(() => vi.restoreAllMocks());

describe("o orçamento de tempo do envio", () => {
  /**
   * O Next lê o `maxDuration` da rota como número escrito à mão — não o
   * calcula. Este teste é o fio entre os dois, pelo VALOR exportado (e não
   * pelo texto do ficheiro): se alguém subir um, o outro tem de subir com ele,
   * senão o relógio do envio conta com um tecto que a plataforma não dá.
   */
  it("o `maxDuration` da rota é o tecto que o relógio conta", () => {
    expect(maxDuration).toBe(TECTO_DO_ENVIO_S);
  });

  it("o relógio conta a partir da chegada", () => {
    vi.spyOn(Date, "now").mockReturnValue(100_000);
    const resta = relogioDoEnvio(100_000 - 40_000);
    expect(resta()).toBe(20_000);
  });
});
