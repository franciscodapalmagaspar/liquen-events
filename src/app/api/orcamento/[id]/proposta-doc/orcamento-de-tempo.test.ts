import { describe, it, expect, vi, afterEach } from "vitest";
import { relogioDoEnvio, TECTO_DO_ENVIO_S } from "@/lib/orcamento/envio/orcamento-de-tempo";
import { maxDuration } from "./route";

afterEach(() => vi.restoreAllMocks());

describe("o orçamento de tempo do envio", () => {
  /**
   * O Next lê o `maxDuration` da rota como número escrito à mão — não o
   * calcula. Este teste é o fio entre os dois, pelo VALOR exportado, e vive do
   * lado da rota (a rota depende do domínio, nunca o contrário): se alguém
   * subir um, o outro tem de subir com ele, senão o relógio do envio conta com
   * um tecto que a plataforma não dá.
   */
  it("o `maxDuration` da rota é o tecto que o relógio conta", () => {
    expect(maxDuration).toBe(TECTO_DO_ENVIO_S);
  });

  it("o relógio conta a partir da chegada, pelo relógio que lhe dão", () => {
    let agora = 60_000;
    const resta = relogioDoEnvio(() => new Date(agora));
    expect(resta()).toBe(TECTO_DO_ENVIO_S * 1000);
    agora += 40_000;
    expect(resta()).toBe(20_000);
  });
});
