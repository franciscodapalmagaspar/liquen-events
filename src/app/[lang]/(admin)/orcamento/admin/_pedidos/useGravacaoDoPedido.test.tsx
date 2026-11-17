// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PainelDoPedido } from "@/lib/orcamento/pedidos/painel-do-pedido";
import type { Quote } from "@/lib/orcamento/types";
import { useGravacaoDoPedido, type DependenciasDaGravacao } from "./useGravacaoDoPedido";

/**
 * A máquina de estados do «Guardar alterações». O corpo que se manda está
 * preso, letra a letra, em `AdminClient.gravacao.test.tsx`; aqui prende-se só
 * o estado: ocioso → a-gravar → gravado | falhou, e que o `saving` de antes é
 * exactamente «a-gravar».
 */
const PEDIDO = {
  id: "p1",
  name: "Ana",
  email: "ana@x.pt",
  phone: "",
  status: "cotado",
  guests: 80,
  date: "2027-01-02",
  location: "",
  adminNotes: "",
  assignedTo: "",
  lostReason: "",
} as unknown as Quote;

const PAINEL: PainelDoPedido = {
  estado: "cotado",
  preco: undefined,
  notas: "",
  responsavel: "",
  motivoDePerda: "",
  data: "2027-01-02",
  convidados: "80",
  local: "",
  nome: "Ana",
  email: "ana@x.pt",
  telefone: "",
};

function deps(o: Partial<DependenciasDaGravacao> = {}): DependenciasDaGravacao {
  return {
    selected: PEDIDO,
    toast: vi.fn(),
    painel: PAINEL,
    convidadosEscritos: { ok: true, valor: 80 },
    erroDeConvidados: null,
    userName: "Teste",
    escritoNoServidor: { current: null },
    acertarBaseDoConflito: vi.fn(async () => {}),
    setRascunhoPorRepor: vi.fn(),
    setQuotes: vi.fn(),
    setSelected: vi.fn(),
    preencherCom: vi.fn(),
    anular: vi.fn() as unknown as DependenciasDaGravacao["anular"],
    refletirPedidoReposto: vi.fn(),
    ...o,
  };
}

describe("useGravacaoDoPedido — o estado da gravação", () => {
  it("começa ocioso, sem estar a gravar", () => {
    const { result } = renderHook(() => useGravacaoDoPedido(deps()));
    expect(result.current.estado).toBe("ocioso");
    expect(result.current.saving).toBe(false);
  });

  it("sem nada mudado: gravado, e diz que já está tudo guardado", async () => {
    const toast = vi.fn();
    const { result } = renderHook(() => useGravacaoDoPedido(deps({ toast })));
    let r: { ok: boolean } | undefined;
    await act(async () => {
      r = await result.current.saveChanges();
    });
    expect(r?.ok).toBe(true);
    expect(result.current.estado).toBe("gravado");
    expect(result.current.saving).toBe(false);
    expect(toast).toHaveBeenCalledWith("Já está tudo guardado", "success");
  });

  it("só os convidados mudaram e não servem: falhou, e diz porquê", async () => {
    const toast = vi.fn();
    const { result } = renderHook(() =>
      useGravacaoDoPedido(
        deps({
          toast,
          painel: { ...PAINEL, convidados: "-5" },
          convidadosEscritos: { ok: false, porque: "Tem de ser 0 ou mais." },
          erroDeConvidados: "Tem de ser 0 ou mais.",
        }),
      ),
    );
    await act(async () => {
      await result.current.saveChanges();
    });
    expect(result.current.estado).toBe("falhou");
    expect(toast).toHaveBeenCalledWith(
      "Convidados não ficou guardado. Tem de ser 0 ou mais.",
      "error",
    );
  });

  it("sem pedido aberto não muda de estado nem diz nada", async () => {
    const toast = vi.fn();
    const { result } = renderHook(() => useGravacaoDoPedido(deps({ selected: null, toast })));
    await act(async () => {
      await result.current.saveChanges();
    });
    expect(result.current.estado).toBe("ocioso");
    expect(toast).not.toHaveBeenCalled();
  });

  it("em silêncio não fala", async () => {
    const toast = vi.fn();
    const { result } = renderHook(() => useGravacaoDoPedido(deps({ toast })));
    await act(async () => {
      await result.current.saveChanges({ silencioso: true });
    });
    expect(toast).not.toHaveBeenCalled();
    expect(result.current.estado).toBe("gravado");
  });
});
