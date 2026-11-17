import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { relogioDoEnvio, TECTO_DO_ENVIO_S } from "./orcamento-de-tempo";

afterEach(() => vi.restoreAllMocks());

describe("o orçamento de tempo do envio", () => {
  /**
   * O Next lê o `maxDuration` do ficheiro da rota como número escrito à mão —
   * não o importa. Este teste é o fio entre os dois: se alguém subir um, o
   * outro tem de subir com ele, senão o relógio do envio conta com um tecto
   * que a plataforma não dá.
   */
  it("o `maxDuration` da rota é o tecto que o relógio conta", () => {
    const rota = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/orcamento/[id]/proposta-doc/route.ts"),
      "utf8",
    );
    const declarado = /export const maxDuration = (\d+);/.exec(rota)?.[1];
    expect(Number(declarado)).toBe(TECTO_DO_ENVIO_S);
  });

  it("o relógio conta a partir da chegada", () => {
    vi.spyOn(Date, "now").mockReturnValue(100_000);
    const resta = relogioDoEnvio(100_000 - 40_000);
    expect(resta()).toBe(20_000);
  });
});
