import { describe, expect, it } from "vitest";
import type { ActivityEntry } from "@/lib/orcamento/types";
import { divergenciaDoEnviado, divergenciaJaVista } from "./conferencia-com-o-enviado";

const envio = { id: "v1", enviadaEm: "2026-11-10T10:00:00.000Z", total: 13257.85 };
const entrada = (kind: ActivityEntry["kind"], at: string) => ({ kind, at }) as ActivityEntry;

describe("divergenciaDoEnviado", () => {
  it("o mesmo valor ao cêntimo não é divergência", () => {
    expect(divergenciaDoEnviado(envio, 13257.85, [])).toBeNull();
    // o ruído da vírgula flutuante não é um cêntimo
    expect(divergenciaDoEnviado({ ...envio, total: 0.3 }, 0.1 + 0.2, [])).toBeNull();
  });

  it("UM cêntimo de diferença é divergência: folga zero (dinheiro.md)", () => {
    expect(divergenciaDoEnviado(envio, 13257.84, [])).toEqual({
      enviadaEm: envio.enviadaEm,
      aPagarEnviado: 13257.85,
      aPagarAqui: 13257.84,
      versaoId: "v1",
      elaMudou: false,
    });
    // 1000,01 − 1000,00 dá 0,00999… em vírgula flutuante: uma folga de 0,01 €
    // escondia este cêntimo.
    expect(divergenciaDoEnviado({ ...envio, total: 1000.01 }, 1000, [])?.aPagarEnviado).toBe(
      1000.01,
    );
  });

  it("sem envio, ou com um envio sem total, não há nada a conferir", () => {
    expect(divergenciaDoEnviado(undefined, 100, [])).toBeNull();
    expect(divergenciaDoEnviado({ ...envio, total: 0 }, 100, [])).toBeNull();
  });

  it("foi ela: só um price_set POSTERIOR ao envio conta", () => {
    const antes = entrada("price_set", "2026-11-09T10:00:00.000Z");
    const depois = entrada("price_set", "2026-11-11T10:00:00.000Z");
    const nota = entrada("note_added", "2026-11-11T10:00:00.000Z");
    expect(divergenciaDoEnviado(envio, 100, [antes, nota])?.elaMudou).toBe(false);
    expect(divergenciaDoEnviado(envio, 100, [antes, depois])?.elaMudou).toBe(true);
    expect(divergenciaDoEnviado(envio, 100, undefined)?.elaMudou).toBe(false);
  });
});

describe("divergenciaJaVista", () => {
  it("só a MESMA diferença, ao cêntimo, conta como vista", () => {
    expect(divergenciaJaVista("13257.84", 13257.84)).toBe(true);
    expect(divergenciaJaVista("13257.84", 13257.85)).toBe(false);
    expect(divergenciaJaVista("1234.56", 1234.57)).toBe(false);
    expect(divergenciaJaVista(null, 13257.85)).toBe(false);
  });
});
