import { afterEach, describe, expect, it, vi } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import { AVISO_SEM_LIGACAO } from "@/lib/modulo-a-pedido";

// O código da impressão não chega (sem rede, ou um deploy que o apagou).
vi.mock("./export", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

const { imprimirOPedido } = await import("./imprimir-a-pedido");

afterEach(() => vi.unstubAllGlobals());

describe("imprimir o pedido quando o código não chega", () => {
  it("a janela que abriu no clique fecha-se, e diz-se porquê", async () => {
    const janela = { closed: false, close: vi.fn() } as unknown as Window;
    vi.stubGlobal("window", { open: vi.fn(() => janela) });
    const avisar = vi.fn();
    imprimirOPedido("dossier", { id: "LQ-1" } as Quote, avisar);
    await vi.waitFor(() => expect(avisar).toHaveBeenCalledWith(AVISO_SEM_LIGACAO, "error"));
    expect(janela.close).toHaveBeenCalled();
  });
});
