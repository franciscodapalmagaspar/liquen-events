// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Quote } from "@/lib/orcamento/types";

const contar = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/lib/orcamento/pedidos/filtros-dos-pedidos", async (original) => {
  const real = await original<typeof import("@/lib/orcamento/pedidos/filtros-dos-pedidos")>();
  return {
    ...real,
    filtrarEOrdenarPedidos: (...a: Parameters<typeof real.filtrarEOrdenarPedidos>) => {
      contar.n += 1;
      return real.filtrarEOrdenarPedidos(...a);
    },
  };
});

const { useFiltrosDosPedidos } = await import("./useFiltrosDosPedidos");

afterEach(cleanup);

const pedidos = Array.from(
  { length: 40 },
  (_, i) => ({ id: `q${i}`, name: `Pedido ${i}`, status: "pendente" }) as unknown as Quote,
);

describe("a procura não refaz a lista inteira a cada tecla", () => {
  it("uma tecla filtra a lista UMA vez (no desenho adiado), não duas", () => {
    const { result } = renderHook(() => useFiltrosDosPedidos(pedidos, "Ana"));
    const antes = contar.n;
    act(() => result.current.setSearch("p"));
    expect(contar.n - antes).toBe(1);
    expect(result.current.filtered).toHaveLength(40);
  });

  it("o `criterios` leva a procura adiada, e o contador do botão «Filtros» lê-o", () => {
    const { result } = renderHook(() => useFiltrosDosPedidos(pedidos, "Ana"));
    act(() => result.current.setFilterMes("2027-05"));
    expect(result.current.criterios.mes).toBe("2027-05");
    expect(result.current.filtrosActivos).toBe(1);
    act(() => result.current.setSearch("pedido 3"));
    expect(result.current.criterios.procura).toBe("pedido 3");
  });
});
