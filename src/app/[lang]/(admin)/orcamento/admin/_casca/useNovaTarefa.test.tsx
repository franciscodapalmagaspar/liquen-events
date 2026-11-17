// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { View } from "../nav";
import { useNovaTarefa } from "./useNovaTarefa";

function montar(inicial: View) {
  return renderHook(({ view }: { view: View }) => useNovaTarefa(view), {
    initialProps: { view: inicial },
  });
}

describe("o «+ Nova tarefa» da barra", () => {
  it("cada toque é um pedido novo, e dois toques são dois pedidos", () => {
    const { result } = montar("tarefas");
    act(() => result.current.pedirNovaTarefa());
    act(() => result.current.pedirNovaTarefa());
    expect(result.current.novaTarefa.pedido).toBe(2);
    expect(result.current.novaTarefa.servido).toBe(0);
  });

  it("nas Tarefas, o pedido fica à espera até elas dizerem que o serviram", () => {
    const { result } = montar("tarefas");
    act(() => result.current.pedirNovaTarefa());
    expect(result.current.novaTarefa.servido).toBe(0);
    act(() => result.current.novaTarefa.servir(1));
    expect(result.current.novaTarefa.servido).toBe(1);
  });

  it("quem sai das Tarefas antes de elas montarem dá o pedido por servido", () => {
    const { result, rerender } = montar("tarefas");
    act(() => result.current.pedirNovaTarefa());
    rerender({ view: "pedidos" });
    expect(result.current.novaTarefa.servido).toBe(1);
    // E ao voltar, não há nada à espera: a linha de escrever não se abre sozinha.
    rerender({ view: "tarefas" });
    expect(result.current.novaTarefa.servido).toBe(result.current.novaTarefa.pedido);
  });
});
