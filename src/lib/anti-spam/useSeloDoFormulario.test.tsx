// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ESPERA_ANTES_DE_ENVIAR_MS, quantoFaltaEsperar } from "./tempo-minimo";
import { useSeloDoFormulario } from "./useSeloDoFormulario";

/**
 * A armadilha dos 3 s nunca pode apanhar uma pessoa (decisão de 17/11): se ela
 * carregar em «Enviar» antes de passarem os 3 s desde que o selo chegou, o
 * formulário espera o que falta — com o «A enviar…» — e só depois envia.
 */

describe("quanto falta esperar", () => {
  it("logo a seguir ao selo, espera os 3 s e a folga", () => {
    expect(quantoFaltaEsperar(1_000, 1_000)).toBe(ESPERA_ANTES_DE_ENVIAR_MS);
  });
  it("a meio, só o que falta", () => {
    expect(quantoFaltaEsperar(1_000, 2_000)).toBe(ESPERA_ANTES_DE_ENVIAR_MS - 1_000);
  });
  it("passado o tempo, nada", () => {
    expect(quantoFaltaEsperar(1_000, 1_000 + ESPERA_ANTES_DE_ENVIAR_MS + 1)).toBe(0);
  });
  it("a folga cobre um desacerto pequeno entre relógios", () => {
    expect(ESPERA_ANTES_DE_ENVIAR_MS).toBeGreaterThan(3_000);
  });
});

describe("useSeloDoFormulario", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ selo: "123.abc" }), { status: 200 })),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function montar() {
    const hook = renderHook(() => useSeloDoFormulario());
    // Deixa o pedido do selo chegar.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    return hook;
  }

  it("um «Enviar» rápido de mais espera o que falta antes de devolver o selo", async () => {
    const { result } = await montar();
    let selo: string | null = null;
    void result.current().then((s) => (selo = s));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(selo).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESPERA_ANTES_DE_ENVIAR_MS);
    });
    expect(selo).toBe("123.abc");
  });

  it("depois dos 3 s, devolve logo", async () => {
    const { result } = await montar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESPERA_ANTES_DE_ENVIAR_MS + 10);
    });
    let selo: string | null = null;
    await act(async () => {
      selo = await result.current();
    });
    expect(selo).toBe("123.abc");
  });

  it("sem selo (o pedido falhou), não espera e devolve vazio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { result } = await montar();
    let selo: string | null = null;
    await act(async () => {
      selo = await result.current();
    });
    expect(selo).toBe("");
  });
});

describe("os três formulários esperam pelo selo no sítio certo", () => {
  it("antes do envio, e na ficha da Meta antes do `Lead` do pixel", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of [
      "src/app/[lang]/(site)/orcamento/OrcamentoForm.tsx",
      "src/components/ads/PedidoRapido.tsx",
      "src/components/meta/PedidoRelampago.tsx",
    ]) {
      const fonte = readFileSync(f, "utf8");
      const espera = fonte.indexOf("await seloParaEnviar()");
      expect(espera, f).toBeGreaterThan(-1);
      expect(espera, f).toBeLessThan(fonte.indexOf('fetch("/api/orcamento"'));
      // A Meta conta o `Lead` no browser: se ela fechar a janela durante a
      // espera, não pode ficar um Lead sem pedido nenhum.
      if (fonte.includes("meta.lead(")) expect(espera, f).toBeLessThan(fonte.indexOf("meta.lead("));
    }
  });
});
