// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import { OPedidoAberto, usePedidoAberto, type PedidoAberto } from "./pedido-aberto";

afterEach(cleanup);

const pedido = (id: string): Quote => ({ id, name: id, payments: [] }) as unknown as Quote;

/** O painel com dois pedidos na lista, e o `alterarOAberto` que cada desenho deu. */
function montar() {
  const vistos: PedidoAberto["alterarOAberto"][] = [];
  const estado: {
    quotes?: Quote[];
    selected?: Quote | null;
    abrir?: (q: Quote) => void;
  } = {};
  function Peca() {
    vistos.push(usePedidoAberto().alterarOAberto);
    return null;
  }
  function Painel() {
    const [quotes, setQuotes] = useState([pedido("A"), pedido("B")]);
    const [selected, setSelected] = useState<Quote | null>(quotes[0]);
    estado.quotes = quotes;
    estado.selected = selected;
    estado.abrir = setSelected;
    if (!selected) return null;
    const resto = { selected } as unknown as Omit<
      PedidoAberto,
      "alterarOAberto" | "substituirPedido" | "mostrarPedido"
    >;
    return (
      <OPedidoAberto {...resto} setQuotes={setQuotes} setSelected={setSelected}>
        <Peca />
      </OPedidoAberto>
    );
  }
  render(<Painel />);
  return { vistos, estado };
}

describe("alterarOAberto", () => {
  it("muda o pedido aberto na lista e no painel", () => {
    const { vistos, estado } = montar();
    act(() => vistos[0]({ tags: ["vip"] }));
    expect(estado.selected?.tags).toEqual(["vip"]);
    expect(estado.quotes?.find((q) => q.id === "A")?.tags).toEqual(["vip"]);
  });

  it("uma resposta que chega com OUTRO pedido aberto só muda a lista (revisão de 17/11)", () => {
    const { vistos, estado } = montar();
    const doA = vistos[0];
    act(() => estado.abrir?.(estado.quotes![1]));
    expect(estado.selected?.id).toBe("B");
    const pagamentos = [{ id: "p1", amount: 100, paid: true }] as unknown as Quote["payments"];
    act(() => doA({ payments: pagamentos }));
    // O B, aberto, fica como estava — senão a gravação seguinte levava os
    // pagamentos do A para o servidor, por cima dos do B.
    expect(estado.selected?.id).toBe("B");
    expect(estado.selected?.payments).toEqual([]);
    expect(estado.quotes?.find((q) => q.id === "A")?.payments).toEqual(pagamentos);
    expect(estado.quotes?.find((q) => q.id === "B")?.payments).toEqual([]);
  });
});
