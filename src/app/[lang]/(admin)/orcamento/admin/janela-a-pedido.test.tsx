// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { janelaAPedido } from "./janela-a-pedido";
import { AVISO_SEM_LIGACAO } from "@/lib/modulo-a-pedido";

const toast = vi.hoisted(() => vi.fn());
vi.mock("./Toast", () => ({ useToast: () => ({ toast }) }));

/**
 * As janelas que saíram do pacote do painel (`janela-a-pedido.tsx`).
 * O que tem de ficar igual ao que era: fechada não desenha nada; aberta
 * desenha a janela com `open` a verdadeiro; depois de chegar fica montada
 * (as saídas animadas dependem disso); e uma falha de rede não fica colada.
 */

type P = { open: boolean; onClose: () => void; texto?: string };
const nada = () => {};

function Falsa({ open, texto }: P) {
  return open ? <div role="dialog">{texto ?? "aberta"}</div> : <span data-testid="fechada" />;
}

afterEach(() => {
  cleanup();
  toast.mockClear();
});

describe("janelaAPedido", () => {
  it("fechada e por pedir, não desenha nada nem vai buscar o código", () => {
    const carregar = vi.fn(async () => ({ default: Falsa }));
    const { Janela } = janelaAPedido<P>(carregar);
    const { container } = render(<Janela open={false} onClose={nada} />);
    expect(container.innerHTML).toBe("");
    expect(carregar).not.toHaveBeenCalled();
  });

  it("ao abrir, vai buscar o código e desenha a janela já aberta, com as props", async () => {
    const carregar = vi.fn(async () => ({ default: Falsa }));
    const { Janela } = janelaAPedido<P>(carregar);
    const { rerender } = render(<Janela open={false} onClose={nada} texto="olá" />);
    rerender(<Janela open onClose={nada} texto="olá" />);
    expect(await screen.findByRole("dialog")).toHaveTextContent("olá");
    expect(carregar).toHaveBeenCalledTimes(1);
  });

  it("depois de chegar fica montada ao fechar — a janela é que decide o que desenha", async () => {
    const { Janela, aquecer } = janelaAPedido<P>(async () => ({ default: Falsa }));
    await act(() => aquecer());
    const { rerender } = render(<Janela open onClose={nada} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    rerender(<Janela open={false} onClose={nada} />);
    expect(screen.getByTestId("fechada")).toBeTruthy();
  });

  it("já aquecida, desenha logo no primeiro desenho, sem esperar", async () => {
    const carregar = vi.fn(async () => ({ default: Falsa }));
    const { Janela, aquecer } = janelaAPedido<P>(carregar);
    await aquecer();
    await aquecer();
    render(<Janela open onClose={nada} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(carregar).toHaveBeenCalledTimes(1);
  });

  it("uma falha de rede devolve a vez com o `onClose`, e o próximo toque tenta outra vez", async () => {
    const carregar = vi
      .fn<() => Promise<{ default: typeof Falsa }>>()
      .mockRejectedValueOnce(new Error("rede"))
      .mockResolvedValue({ default: Falsa });
    const { Janela } = janelaAPedido<P>(carregar);
    const fechar = vi.fn();
    const { rerender } = render(<Janela open onClose={fechar} />);
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    // Sem isto o `open` de quem abriu ficava preso a verdadeiro, e carregar
    // outra vez no mesmo botão não mudava nada.
    expect(fechar).toHaveBeenCalledTimes(1);
    // E não fica calada: ela carregou e tem de saber porque não abriu.
    expect(toast).toHaveBeenCalledWith(AVISO_SEM_LIGACAO, "error");
    expect(toast).toHaveBeenCalledTimes(1);
    rerender(<Janela open={false} onClose={fechar} />);
    rerender(<Janela open onClose={fechar} />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(carregar).toHaveBeenCalledTimes(2);
    expect(fechar).toHaveBeenCalledTimes(1);
  });

  it("fechada antes de o código chegar, não chama o `onClose` de quem já fechou", async () => {
    let falhar: (e: Error) => void = () => {};
    const carregar = vi.fn(
      () => new Promise<{ default: typeof Falsa }>((_, rej) => (falhar = rej)),
    );
    const { Janela } = janelaAPedido<P>(carregar);
    const fechar = vi.fn();
    const { rerender } = render(<Janela open onClose={fechar} />);
    rerender(<Janela open={false} onClose={fechar} />);
    await act(async () => falhar(new Error("rede")));
    expect(fechar).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("com `aoNaoChegar`, a falha fecha por ele e NÃO pelo `onClose` (o da cópia revalida tudo)", async () => {
    const { Janela } = janelaAPedido<P>(() => Promise.reject(new Error("deploy")));
    const fechar = vi.fn();
    const naoChegou = vi.fn();
    render(<Janela open onClose={fechar} aoNaoChegar={naoChegou} />);
    await act(async () => {});
    expect(naoChegou).toHaveBeenCalledTimes(1);
    expect(fechar).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(AVISO_SEM_LIGACAO, "error");
  });

  it("o `aoNaoChegar` não chega à janela verdadeira", async () => {
    const recebidas = vi.fn();
    function Espia(props: P) {
      recebidas(Object.keys(props).sort());
      return null;
    }
    const { Janela, aquecer } = janelaAPedido<P>(async () => ({ default: Espia }));
    await act(() => aquecer());
    render(<Janela open onClose={nada} aoNaoChegar={nada} />);
    expect(recebidas).toHaveBeenLastCalledWith(["onClose", "open"]);
  });
});
