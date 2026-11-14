// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ESPERA_DO_LOTE_MS,
  bibliotecaAlterada,
  bibliotecaAlteradaEmLote,
} from "./biblioteca-alterada";

/**
 * Revisão de 14/11, menor n.º 5: carregar fotos em lote dava um aviso
 * `liquen:biblioteca-alterada` por foto — e cada aviso muda a geração das fotos
 * da pré-visualização, que volta a pedir as páginas à vista. Um aviso por lote.
 */
afterEach(() => {
  vi.useRealTimers();
});

describe("o aviso de que a Biblioteca mudou", () => {
  it("quarenta fotos seguidas dão UM aviso, quando o lote pára", () => {
    vi.useFakeTimers();
    const ouvido = vi.fn();
    window.addEventListener("liquen:biblioteca-alterada", ouvido);
    for (let i = 0; i < 40; i++) {
      bibliotecaAlteradaEmLote();
      vi.advanceTimersByTime(200);
    }
    expect(ouvido).not.toHaveBeenCalled();
    vi.advanceTimersByTime(ESPERA_DO_LOTE_MS);
    expect(ouvido).toHaveBeenCalledTimes(1);
    // Outro lote, outro aviso.
    bibliotecaAlteradaEmLote();
    vi.advanceTimersByTime(ESPERA_DO_LOTE_MS);
    expect(ouvido).toHaveBeenCalledTimes(2);
    window.removeEventListener("liquen:biblioteca-alterada", ouvido);
  });

  it("o aviso de uma ação só continua imediato", () => {
    const ouvido = vi.fn();
    window.addEventListener("liquen:biblioteca-alterada", ouvido);
    bibliotecaAlterada();
    expect(ouvido).toHaveBeenCalledTimes(1);
    window.removeEventListener("liquen:biblioteca-alterada", ouvido);
  });
});
