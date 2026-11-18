import { afterEach, describe, expect, it, vi } from "vitest";
import type { Quote } from "@/lib/orcamento/types";

const printRunSheet = vi.fn();
const printEventDossier = vi.fn();
const downloadEventIcs = vi.fn();
vi.mock("./export", () => ({ printRunSheet, printEventDossier, downloadEventIcs }));

const { imprimirOPedido, descarregarOCalendario, FOLHA_FALHOU } =
  await import("./imprimir-a-pedido");

const pedido = { id: "LQ-1", name: "Ana e Rui" } as Quote;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("imprimir o pedido com o código a pedido", () => {
  it("a janela abre NO CLIQUE, antes de o código chegar, e a folha escreve-se nela", async () => {
    const janela = { close: vi.fn() } as unknown as Window;
    const open = vi.fn(() => janela);
    vi.stubGlobal("window", { open });
    imprimirOPedido("timeline", pedido, vi.fn());
    // Síncrono: o gesto ainda está vivo quando a janela se pede.
    expect(open).toHaveBeenCalledWith("", "_blank", "width=820,height=1000");
    expect(printRunSheet).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(printRunSheet).toHaveBeenCalledWith(pedido, janela));
  });

  it("o dossier abre com o tamanho dele", async () => {
    const janela = { close: vi.fn() } as unknown as Window;
    const open = vi.fn(() => janela);
    vi.stubGlobal("window", { open });
    imprimirOPedido("dossier", pedido, vi.fn());
    expect(open).toHaveBeenCalledWith("", "_blank", "width=900,height=1100");
    await vi.waitFor(() => expect(printEventDossier).toHaveBeenCalledWith(pedido, janela));
  });

  it("com a janela bloqueada mesmo assim, não faz mais nada (como antes)", async () => {
    vi.stubGlobal("window", { open: vi.fn(() => null) });
    const avisar = vi.fn();
    imprimirOPedido("timeline", pedido, avisar);
    await new Promise((r) => setTimeout(r, 0));
    expect(printRunSheet).not.toHaveBeenCalled();
    expect(avisar).not.toHaveBeenCalled();
  });

  it("o calendário descarrega quando o código chega", async () => {
    descarregarOCalendario(pedido, vi.fn());
    await vi.waitFor(() => expect(downloadEventIcs).toHaveBeenCalledWith(pedido));
  });

  it("se ela fechou a janela vazia enquanto o código vinha, não se escreve nada nem há erro", async () => {
    const janela = { closed: true, close: vi.fn() } as unknown as Window;
    vi.stubGlobal("window", { open: vi.fn(() => janela) });
    const avisar = vi.fn();
    imprimirOPedido("timeline", pedido, avisar);
    await new Promise((r) => setTimeout(r, 0));
    expect(printRunSheet).not.toHaveBeenCalled();
    expect(avisar).not.toHaveBeenCalled();
  });

  it("se a folha rebentar a escrever-se, a janela fecha-se e diz-se — e não «sem ligação»", async () => {
    const janela = { closed: false, close: vi.fn() } as unknown as Window;
    vi.stubGlobal("window", { open: vi.fn(() => janela) });
    printEventDossier.mockImplementationOnce(() => {
      throw new Error("dados estranhos");
    });
    const avisar = vi.fn();
    expect(() => imprimirOPedido("dossier", pedido, avisar)).not.toThrow();
    await vi.waitFor(() => expect(avisar).toHaveBeenCalledWith(FOLHA_FALHOU, "error"));
    expect(janela.close).toHaveBeenCalled();
  });
});
