// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEstadoDaGravacao } from "./useEstadoDaGravacao";

function montar() {
  const toast = vi.fn();
  const r = renderHook(() => useEstadoDaGravacao(toast));
  return { toast, r };
}

describe("useEstadoDaGravacao", () => {
  it("começa sem nada a caminho, no servidor, e a durar", () => {
    const { r } = montar();
    expect(r.result.current.aGravarNoServidor).toBe(0);
    expect(r.result.current.soNesteComputador).toBeNull();
    expect(r.result.current.naoDuraAoDeploy).toBeNull();
  });

  it("o «só neste computador» fica no indicador sempre, e o aviso grande sai UMA vez", () => {
    const { r, toast } = montar();
    act(() => r.result.current.registarSoLocal("sem tabela"));
    act(() => r.result.current.registarSoLocal("sem tabela"));
    expect(r.result.current.soNesteComputador?.porque).toBe("sem tabela");
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toMatch(/SÓ NESTE COMPUTADOR.*sem tabela/);
    expect(r.result.current.avisoDoSoLocalPorDar()).toBe(false);
  });

  it("chegar ao servidor limpa o aviso E rearma-o: a falha seguinte volta a falar", () => {
    const { r, toast } = montar();
    act(() => r.result.current.registarSoLocal());
    act(() => r.result.current.marcarGuardadoNoServidor());
    expect(r.result.current.soNesteComputador).toBeNull();
    expect(r.result.current.avisoDoSoLocalPorDar()).toBe(true);
    act(() => r.result.current.registarSoLocal(undefined, true));
    expect(toast).toHaveBeenCalledTimes(2);
    expect(toast.mock.calls[1][0]).toMatch(/sessão expirou/);
  });

  it("o «não dura ao deploy» diz a frase do servidor uma vez, e rearma quando volta a durar", () => {
    const { r, toast } = montar();
    act(() => r.result.current.registarNaoDura("Liga a SUPABASE_URL."));
    act(() => r.result.current.registarNaoDura("Liga a SUPABASE_URL."));
    expect(r.result.current.naoDuraAoDeploy?.aviso).toBe("Liga a SUPABASE_URL.");
    expect(toast).toHaveBeenCalledTimes(1);
    act(() => r.result.current.marcarQueDura());
    expect(r.result.current.naoDuraAoDeploy).toBeNull();
    act(() => r.result.current.registarNaoDura());
    expect(toast).toHaveBeenCalledTimes(2);
  });

  it("conta as gravações a caminho, e nunca abaixo de zero", () => {
    const { r } = montar();
    act(() => {
      r.result.current.partiu();
      r.result.current.partiu();
    });
    expect(r.result.current.aGravarNoServidor).toBe(2);
    act(() => {
      r.result.current.voltou();
      r.result.current.voltou();
      r.result.current.voltou();
    });
    expect(r.result.current.aGravarNoServidor).toBe(0);
  });

  it("as acções são estáveis entre desenhos (entram em listas de dependências)", () => {
    const { r } = montar();
    const antes = r.result.current;
    act(() => r.result.current.partiu());
    const depois = r.result.current;
    for (const k of [
      "registarSoLocal",
      "marcarGuardadoNoServidor",
      "registarNaoDura",
      "marcarQueDura",
      "partiu",
      "voltou",
      "avisoDoSoLocalPorDar",
    ] as const) {
      expect(depois[k], k).toBe(antes[k]);
    }
  });
});
