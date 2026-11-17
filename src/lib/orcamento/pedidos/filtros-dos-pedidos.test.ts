import { describe, expect, it } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import {
  contarPorEstado,
  etiquetasEmUso,
  filtrarEOrdenarPedidos,
  filtrosDoPainelActivos,
  haFiltroAActuar,
  oQueEstaAFiltrar,
  ordenarPedidos,
  type FiltrosDosPedidos,
} from "./filtros-dos-pedidos";

const pedido = (id: string, over: Partial<Quote> = {}): Quote =>
  ({
    id,
    name: id,
    email: `${id}@ex.pt`,
    status: "pendente",
    submittedAt: "2026-11-01T10:00:00Z",
    category: "particulares",
    guests: 50,
    ...over,
  }) as Quote;

const NADA: FiltrosDosPedidos = {
  estado: "all",
  etiqueta: null,
  categoria: "all",
  espera: "all",
  mes: "all",
  regiao: "all",
  planner: "all",
  arquivados: false,
  soOsMeus: false,
  procura: "",
  ordem: "recent",
};

const ids = (l: Quote[]) => l.map((q) => q.id);

describe("filtrarEOrdenarPedidos", () => {
  const LISTA = [
    pedido("a", { status: "cotado", tags: ["vip"], assignedTo: "Rita", date: "2027-05-10" }),
    pedido("b", { archived: true }),
    pedido("c", { category: "empresas", company: " Planner X ", location: "Évora" }),
  ];

  it("sem filtros: os não arquivados", () => {
    expect(ids(filtrarEOrdenarPedidos(LISTA, NADA, "Rita")).sort()).toEqual(["a", "c"]);
  });

  it("os arquivados são a OUTRA lista, e lá o estado não filtra", () => {
    expect(
      ids(filtrarEOrdenarPedidos(LISTA, { ...NADA, arquivados: true, estado: "cotado" }, "")),
    ).toEqual(["b"]);
  });

  it("cada filtro tira o que não lhe responde", () => {
    const f = (x: Partial<FiltrosDosPedidos>) =>
      ids(filtrarEOrdenarPedidos(LISTA, { ...NADA, ...x }, "Rita"));
    expect(f({ estado: "cotado" })).toEqual(["a"]);
    expect(f({ categoria: "empresas" })).toEqual(["c"]);
    expect(f({ soOsMeus: true })).toEqual(["a"]);
    expect(f({ mes: "2027-05" })).toEqual(["a"]);
    expect(f({ planner: "Planner X" })).toEqual(["c"]);
    expect(f({ etiqueta: "vip" })).toEqual(["a"]);
    expect(f({ procura: "  EVORA " })).toEqual(["c"]);
  });

  it("não mexe na lista que recebe", () => {
    const copia = [...LISTA];
    filtrarEOrdenarPedidos(LISTA, { ...NADA, ordem: "old" }, "");
    expect(LISTA).toEqual(copia);
  });
});

describe("ordenarPedidos", () => {
  const A = pedido("a", {
    submittedAt: "2026-01-01T00:00:00Z",
    quotedPrice: 10,
    date: "2027-03-01",
  });
  const B = pedido("b", { submittedAt: "2026-02-01T00:00:00Z", followUpAt: "2026-02-10" });
  const C = pedido("c", {
    submittedAt: "2026-03-01T00:00:00Z",
    priceBreakdown: { total: 50 } as Quote["priceBreakdown"],
    date: "2026-12-01",
  });

  it("mais recentes, mais antigos, valor, seguimento e data do evento", () => {
    expect(ids(ordenarPedidos([A, B, C], "recent"))).toEqual(["c", "b", "a"]);
    expect(ids(ordenarPedidos([C, B, A], "old"))).toEqual(["a", "b", "c"]);
    expect(ids(ordenarPedidos([A, B, C], "value"))).toEqual(["c", "a", "b"]);
    expect(ids(ordenarPedidos([A, B, C], "followup"))).toEqual(["b", "c", "a"]);
    expect(ids(ordenarPedidos([A, B, C], "eventdate"))).toEqual(["c", "a", "b"]);
  });
});

describe("o que está a esconder pedidos", () => {
  it("o botão conta só os filtros do painel", () => {
    expect(filtrosDoPainelActivos(NADA)).toBe(0);
    expect(
      filtrosDoPainelActivos({
        ...NADA,
        soOsMeus: true,
        categoria: "x",
        espera: "3",
        mes: "m",
        regiao: "r",
        planner: "p",
      }),
    ).toBe(6);
  });

  it("a lista vazia sabe se há ALGUMA razão para faltarem pedidos", () => {
    expect(haFiltroAActuar(NADA, 0)).toBe(false);
    expect(haFiltroAActuar({ ...NADA, procura: " " }, 0)).toBe(false);
    expect(haFiltroAActuar({ ...NADA, etiqueta: "vip" }, 0)).toBe(true);
    expect(haFiltroAActuar(NADA, 1)).toBe(true);
  });

  it("e diz o quê, por extenso", () => {
    expect(oQueEstaAFiltrar(NADA, 0)).toBe("");
    expect(oQueEstaAFiltrar({ ...NADA, procura: " ana " }, 0)).toBe("a pesquisa «ana»");
    expect(
      oQueEstaAFiltrar(
        { ...NADA, procura: "ana", estado: "cotado", etiqueta: "vip", arquivados: true },
        2,
      ),
    ).toBe("a pesquisa «ana», um estado, a etiqueta «vip», os arquivados e 2 filtros do painel");
    expect(oQueEstaAFiltrar(NADA, 1)).toBe("um filtro do painel");
  });
});

describe("contas da lista", () => {
  it("por estado, sem os arquivados", () => {
    const l = [pedido("a"), pedido("b", { status: "cotado" }), pedido("c", { archived: true })];
    expect(contarPorEstado(l)).toEqual({ counts: { pendente: 1, cotado: 1 }, activeTotal: 2 });
  });

  it("as etiquetas em uso, uma vez cada, por ordem", () => {
    const l = [pedido("a", { tags: ["vip", "Évora"] }), pedido("b", { tags: ["vip"] })];
    expect(etiquetasEmUso(l)).toEqual(["Évora", "vip"]);
  });
});
