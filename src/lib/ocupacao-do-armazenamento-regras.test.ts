import { describe, expect, it } from "vitest";
import {
  BYTES_POR_FOTO_NOVA,
  espacoQueSobra,
  fotosQueCabem,
  LIMITE_DO_PLANO_BYTES,
  TECTO_SEM_MEDICAO,
  TRAVAO,
  type Ocupacao,
} from "./ocupacao-do-armazenamento-regras";

/** O travão: a importação nunca deixa o armazenamento passar de 90% do plano. */

const oc = (bytes: number, completo = true): Ocupacao => ({
  medidoEm: new Date(Date.now() - 3600_000).toISOString(),
  bytes,
  porBucket: {},
  completo,
});

describe("o travão do armazenamento", () => {
  it("é 90% de 1 GB, contado pelo lado seguro", () => {
    expect(TRAVAO).toBe(0.9);
    expect(LIMITE_DO_PLANO_BYTES).toBe(1_000_000_000);
  });

  it("o que sobra conta com o que se carregou depois da medição", () => {
    const e = espacoQueSobra(oc(695_000_000), { "proposal-assets": 5_000_000, x: "lixo" });
    expect(e.conhecido).toBe(true);
    expect(e.ocupado).toBe(700_000_000);
    expect(e.sobra).toBe(200_000_000);
  });

  it("nunca deixa subir o que passaria do travão", () => {
    const e = espacoQueSobra(oc(899_000_000), {});
    const cabem = fotosQueCabem(e, 200);
    expect(cabem).toBe(Math.floor(1_000_000 / BYTES_POR_FOTO_NOVA));
    expect(e.ocupado + cabem * BYTES_POR_FOTO_NOVA).toBeLessThanOrEqual(
      LIMITE_DO_PLANO_BYTES * TRAVAO,
    );
    // Acima do travão: zero, nunca negativo.
    expect(fotosQueCabem(espacoQueSobra(oc(950_000_000), {}), 200)).toBe(0);
  });

  it("com espaço de sobra, manda o tecto da importação", () => {
    expect(fotosQueCabem(espacoQueSobra(oc(100_000_000), {}), 200)).toBe(200);
  });

  it("sem medição (ou incompleta), fica o tecto prudente", () => {
    expect(fotosQueCabem(espacoQueSobra(null, {}), 200)).toBe(TECTO_SEM_MEDICAO);
    expect(fotosQueCabem(espacoQueSobra(oc(100_000_000, false), {}), 200)).toBe(TECTO_SEM_MEDICAO);
  });

  it("uma medição com mais de dois dias já não serve: volta o tecto prudente", () => {
    const velha = { ...oc(100_000_000), medidoEm: "2026-11-10T03:00:00Z" };
    const agora = Date.parse("2026-11-12T03:30:00Z");
    expect(espacoQueSobra(velha, {}, agora).conhecido).toBe(true);
    const depois = Date.parse("2026-11-13T03:00:00Z");
    expect(espacoQueSobra(velha, {}, depois).conhecido).toBe(false);
    expect(fotosQueCabem(espacoQueSobra(velha, {}, depois), 200)).toBe(TECTO_SEM_MEDICAO);
  });
});
