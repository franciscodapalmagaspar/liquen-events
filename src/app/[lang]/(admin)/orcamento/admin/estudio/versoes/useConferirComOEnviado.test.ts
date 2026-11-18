// @vitest-environment jsdom
import { StrictMode, createElement, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConferirComOEnviado } from "./useConferirComOEnviado";

/** Uma resposta da lista das versões que só chega quando o teste a solta. */
function rede() {
  const pendentes: Array<(total: number) => void> = [];
  const f = vi.fn(
    () =>
      new Promise<Response>((solta) => {
        pendentes.push((total) =>
          solta(
            new Response(
              JSON.stringify({ versoes: [{ id: "v1", enviadaEm: "2026-11-10T10:00:00Z", total }] }),
              { status: 200 },
            ),
          ),
        );
      }),
  );
  return { f, soltar: (total: number) => pendentes.forEach((p) => p(total)) };
}

const base = {
  quoteId: "q1",
  historico: [],
  aberturaAssente: true,
  enviadaNestaSessao: false,
  aPagar: 100,
  chaveDoVisto: "conferencia-teste:enviado-visto",
};

describe("useConferirComOEnviado", () => {
  let r: ReturnType<typeof rede>;
  beforeEach(() => {
    r = rede();
    vi.stubGlobal("fetch", r.f);
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("o total muda com a leitura a caminho: confere com o total NOVO, e não fica por conferir", async () => {
    const aoDivergir = vi.fn();
    const h = renderHook((p: typeof base) => useConferirComOEnviado({ ...p, aoDivergir }), {
      initialProps: base,
    });
    h.rerender({ ...base, aPagar: 120 });
    await act(async () => r.soltar(150));
    await waitFor(() => expect(aoDivergir).toHaveBeenCalledTimes(1));
    expect(aoDivergir.mock.calls[0][0]).toMatchObject({ aPagarEnviado: 150, aPagarAqui: 120 });
  });

  it("no StrictMode (monta, desmonta, volta a montar) a conferência chega ao fim", async () => {
    const aoDivergir = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children);
    renderHook(() => useConferirComOEnviado({ ...base, aoDivergir }), { wrapper });
    await act(async () => r.soltar(150));
    await waitFor(() => expect(aoDivergir).toHaveBeenCalledTimes(1));
  });

  it("depois de conferir uma vez, um total novo já não volta a perguntar à rede", async () => {
    const aoDivergir = vi.fn();
    const h = renderHook((p: typeof base) => useConferirComOEnviado({ ...p, aoDivergir }), {
      initialProps: base,
    });
    await act(async () => r.soltar(100));
    h.rerender({ ...base, aPagar: 130 });
    await act(async () => r.soltar(100));
    expect(r.f).toHaveBeenCalledTimes(1);
    expect(aoDivergir).not.toHaveBeenCalled();
  });

  it("a diferença que ela já decidiu manter não volta", async () => {
    localStorage.setItem(base.chaveDoVisto, "100");
    const aoDivergir = vi.fn();
    renderHook(() => useConferirComOEnviado({ ...base, aoDivergir }));
    await act(async () => r.soltar(150));
    expect(r.f).toHaveBeenCalledTimes(1);
    expect(aoDivergir).not.toHaveBeenCalled();
  });

  it("enviada nesta sessão, ou sem total, não confere", () => {
    const aoDivergir = vi.fn();
    renderHook(() => useConferirComOEnviado({ ...base, enviadaNestaSessao: true, aoDivergir }));
    renderHook(() => useConferirComOEnviado({ ...base, aPagar: 0, aoDivergir }));
    expect(r.f).not.toHaveBeenCalled();
  });
});
