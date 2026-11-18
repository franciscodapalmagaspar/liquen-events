import { describe, it, expect, vi } from "vitest";

/**
 * Repor os envios SUBSTITUI o espaço: o que está na base e não vem na cópia
 * sai — e sai a linha, não fica uma lápide a `null` para sempre (P3).
 */

const valores = vi.hoisted(() => new Map<string, unknown>());

vi.mock("./app-state", () => ({
  listStateByPrefix: async (prefixo: string) => ({
    entradas: [...valores.entries()]
      .filter(([k]) => k.startsWith(prefixo))
      .map(([key, value]) => ({ key, value })),
    completa: true,
  }),
  setState: async (key: string, value: unknown) => {
    valores.set(key, value);
    return { gravado: true, onde: "servidor" };
  },
  apagarEstado: async (key: string) => {
    valores.delete(key);
    return { gravado: true, onde: "servidor" };
  },
  getState: async (key: string) => valores.get(key) ?? null,
}));

import { replaceEnviosDeProposta } from "./envios-de-proposta";

describe("repor os envios de proposta", () => {
  it("escreve o que a cópia traz e APAGA a linha do que ela não traz", async () => {
    valores.set("envio-de-proposta:q1", { envios: [] });
    valores.set("envio-de-proposta:q2", { envios: [] });
    valores.set("tempo-activo:q2", { ms: 1, updatedAt: "x" });

    await replaceEnviosDeProposta([{ key: "envio-de-proposta:q1", envios: [] }]);

    expect(valores.has("envio-de-proposta:q1")).toBe(true);
    expect(valores.has("envio-de-proposta:q2")).toBe(false);
    expect(valores.has("tempo-activo:q2")).toBe(true);
  });
});
