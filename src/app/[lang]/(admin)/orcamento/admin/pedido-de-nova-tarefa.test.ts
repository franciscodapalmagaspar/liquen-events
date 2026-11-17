// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePedidoDeNovaTarefa } from "./pedido-de-nova-tarefa";

/**
 * O contador que o botão «Nova tarefa» e o ⌘N fazem subir. O `Tarefas` serve
 * o valor com que monta (pode ter sido pedido com a vista ainda a carregar),
 * por isso o contador TEM de voltar a 0 quando se sai: senão, voltar às
 * Tarefas mais tarde reabria a linha sem ninguém a pedir.
 */
describe("usePedidoDeNovaTarefa", () => {
  it("começa a 0 e cada pedido conta", () => {
    const { result } = renderHook(({ vista }) => usePedidoDeNovaTarefa(vista), {
      initialProps: { vista: "tarefas" },
    });
    expect(result.current.pedido).toBe(0);
    act(() => result.current.pedir());
    act(() => result.current.pedir());
    expect(result.current.pedido).toBe(2);
  });

  it("sair das Tarefas põe-no a 0, e voltar não traz o pedido antigo", () => {
    const { result, rerender } = renderHook(({ vista }) => usePedidoDeNovaTarefa(vista), {
      initialProps: { vista: "tarefas" },
    });
    act(() => result.current.pedir());
    rerender({ vista: "pedidos" });
    expect(result.current.pedido).toBe(0);
    rerender({ vista: "tarefas" });
    expect(result.current.pedido).toBe(0);
  });

  it("um pedido feito com as Tarefas à frente sobrevive enquanto lá se está", () => {
    const { result, rerender } = renderHook(({ vista }) => usePedidoDeNovaTarefa(vista), {
      initialProps: { vista: "tarefas" },
    });
    act(() => result.current.pedir());
    rerender({ vista: "tarefas" });
    expect(result.current.pedido).toBe(1);
  });

  it("o `pedir` é estável (pode ir para as dependências de um efeito)", () => {
    const { result, rerender } = renderHook(({ vista }) => usePedidoDeNovaTarefa(vista), {
      initialProps: { vista: "tarefas" },
    });
    const antes = result.current.pedir;
    act(() => result.current.pedir());
    rerender({ vista: "pedidos" });
    expect(result.current.pedir).toBe(antes);
  });
});

/* A outra metade do contrato está no AdminClient, e um teste ao hook sozinho
   não a prende: se alguém voltasse a pôr um `useState` local, ou chamasse o
   hook com outra coisa que não a vista, os testes ficavam verdes e a linha
   voltava a reabrir ao regressar às Tarefas (revisão independente, 17/11).
   O AdminClient tem 7 mil linhas e não se monta num teste; lê-se a fonte. */
describe("o AdminClient liga o contador à vista", () => {
  const fonte = readFileSync(
    `${process.cwd()}/src/app/[lang]/(admin)/orcamento/admin/AdminClient.tsx`,
    "utf8",
  );

  it("o contador vem do hook, chamado com a `view`", () => {
    expect(fonte).toMatch(
      /const \{ pedido: pedidoDeNovaTarefa, pedir: pedirNovaTarefa \} = usePedidoDeNovaTarefa\(view\);/,
    );
    expect(fonte).not.toMatch(/setPedidoDeNovaTarefa|useState\(0\);\s*\n\s*const pedirNovaTarefa/);
  });

  it("as Tarefas recebem esse contador, e o botão e o ⌘N usam o mesmo `pedir`", () => {
    expect(fonte).toMatch(/pedidoDeNova=\{pedidoDeNovaTarefa\}/);
    expect(fonte).toMatch(/onClick=\{pedirNovaTarefa\}/);
    expect(fonte).toMatch(/e\.preventDefault\(\);\s*\n\s*pedirNovaTarefa\(\);/);
  });
});
