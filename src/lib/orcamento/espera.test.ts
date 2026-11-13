import { describe, it, expect } from "vitest";
import type { Quote } from "./types";
import {
  contextoDeLocal,
  diasDeEspera,
  esperaEmPalavras,
  mesesDeEvento,
  plannersDe,
  porEspera,
  provavelDestination,
  regioesDe,
  tomDeEspera,
} from "./espera";

const HOJE = new Date("2026-06-10T09:00:00Z");

let n = 0;
function pedido(over: Partial<Quote> = {}): Quote {
  n += 1;
  return {
    id: `LQ-${n}`,
    submittedAt: "2026-06-08T10:00:00.000Z",
    status: "pendente",
    name: `Casal ${n}`,
    date: "2027-05-15",
    location: "Évora",
    ...over,
  } as Quote;
}

describe("dias de espera", () => {
  it("conta desde a entrada do pedido", () => {
    expect(diasDeEspera(pedido({ submittedAt: "2026-06-08T10:00:00Z" }), HOJE)).toBe(1);
    expect(diasDeEspera(pedido({ submittedAt: "2026-06-01T10:00:00Z" }), HOJE)).toBe(8);
  });

  it("só conta a quem ainda espera resposta nossa", () => {
    // Uma proposta enviada está à espera do CASAL, não de nós. Contar-lhe os
    // dias fazia a lista gritar por coisas já feitas.
    for (const status of ["cotado", "aceite", "rejeitado"] as const) {
      expect(diasDeEspera(pedido({ status }), HOJE)).toBeNull();
    }
    expect(diasDeEspera(pedido({ status: "pendente" }), HOJE)).not.toBeNull();
    expect(diasDeEspera(pedido({ status: "em_revisao" }), HOJE)).not.toBeNull();
  });

  it("um pedido com data de entrada estragada não vira NaN dias", () => {
    expect(diasDeEspera(pedido({ submittedAt: "nunca" }), HOJE)).toBeNull();
  });

  it("uma data no futuro conta como zero, não como negativo", () => {
    // Acontece com relógios trocados; "há -2 dias" não é uma frase.
    expect(diasDeEspera(pedido({ submittedAt: "2026-06-20T10:00:00Z" }), HOJE)).toBe(0);
  });
});

describe("a cor da espera", () => {
  it("segue os cortes pedidos: 2, 6, e daí para cima", () => {
    expect(tomDeEspera(0)).toBe("calmo");
    expect(tomDeEspera(2)).toBe("calmo");
    expect(tomDeEspera(3)).toBe("aviso");
    expect(tomDeEspera(6)).toBe("aviso");
    expect(tomDeEspera(7)).toBe("urgente");
    expect(tomDeEspera(40)).toBe("urgente");
  });

  it("diz os dias em português, sem plural errado", () => {
    // «recebido hoje», e não «hoje»: o cartão do pedido também diz «Hoje» quando
    // é o EVENTO que é hoje, e os dois ficavam lado a lado.
    expect(esperaEmPalavras(0)).toBe("recebido hoje");
    expect(esperaEmPalavras(1)).toBe("há 1 dia");
    expect(esperaEmPalavras(4)).toBe("há 4 dias");
  });
});

describe("ordenar por espera", () => {
  it("o que espera há mais tempo vem primeiro", () => {
    const novo = pedido({ id: "A", submittedAt: "2026-06-09T10:00:00Z" });
    const velho = pedido({ id: "B", submittedAt: "2026-06-01T10:00:00Z" });
    const ordenados = [novo, velho].sort((a, b) => porEspera(a, b, HOJE));
    expect(ordenados.map((q) => q.id)).toEqual(["B", "A"]);
  });

  it("quem já teve resposta desce, por muito antigo que seja", () => {
    const respondidoAntigo = pedido({
      id: "resp",
      status: "cotado",
      submittedAt: "2025-01-01T10:00:00Z",
    });
    const aEsperarRecente = pedido({ id: "esp", submittedAt: "2026-06-09T10:00:00Z" });
    const ordenados = [respondidoAntigo, aEsperarRecente].sort((a, b) => porEspera(a, b, HOJE));
    expect(ordenados.map((q) => q.id)).toEqual(["esp", "resp"]);
  });

  it("entre respondidos, o mais recente primeiro", () => {
    const a = pedido({ id: "A", status: "aceite", submittedAt: "2026-01-01T10:00:00Z" });
    const b = pedido({ id: "B", status: "aceite", submittedAt: "2026-05-01T10:00:00Z" });
    expect([a, b].sort((x, y) => porEspera(x, y, HOJE)).map((q) => q.id)).toEqual(["B", "A"]);
  });
});

describe("provável casamento à distância", () => {
  it("é a soma de duas ausências: sem data E sem sítio reconhecível", () => {
    expect(provavelDestination(pedido({ date: "", location: "Portugal" }))).toBe(true);
    expect(provavelDestination(pedido({ date: "", location: "" }))).toBe(true);
  });

  it("uma ausência sozinha não chega", () => {
    // Data por marcar há às dezenas em casamentos de Évora.
    expect(provavelDestination(pedido({ date: "", location: "Évora" }))).toBe(false);
    // E um local desconhecido é muitas vezes só uma herdade que falta à tabela.
    expect(provavelDestination(pedido({ date: "2027-05-15", location: "Portugal" }))).toBe(false);
  });
});

describe("contexto do local", () => {
  it("dá a região e a distância a Évora", () => {
    const c = contextoDeLocal(pedido({ location: "Quinta qualquer, Palmela" }));
    expect(c.regiao).toBe("Palmela");
    expect(c.km).toBeGreaterThan(80);
    expect(c.aproximado).toBe(false);
  });

  it("marca como aproximado o que veio de uma região inteira", () => {
    const c = contextoDeLocal(pedido({ location: "Algarve" }));
    expect(c.regiao).toBe("Faro");
    expect(c.aproximado).toBe(true);
  });

  it("sem sítio reconhecível não inventa nem região nem quilómetros", () => {
    const c = contextoDeLocal(pedido({ location: "Portugal", date: "" }));
    expect(c.regiao).toBeNull();
    expect(c.km).toBeNull();
    expect(c.destination).toBe(true);
  });

  /**
   * Évora deixou de estar escrita à letra: os quilómetros contam-se a partir da
   * sede, que é uma definição. Quem não a passar continua a ver o de sempre —
   * é o que impede esta mudança de mexer numa lista que já estava certa.
   */
  it("mede a partir da sede que lhe derem, e de Évora quando não lhe dão nenhuma", () => {
    const pedidoAlgarvio = pedido({ location: "Albufeira" });
    const deEvora = contextoDeLocal(pedidoAlgarvio);
    const deFaro = contextoDeLocal(pedidoAlgarvio, "Faro");
    expect(deFaro.km!).toBeLessThan(deEvora.km!);
    // A região é a do evento e não muda com a sede — só a distância muda.
    expect(deFaro.regiao).toBe(deEvora.regiao);
  });
});

describe("as listas dos filtros", () => {
  it("os meses vêm dos eventos com data, por ordem e sem repetição", () => {
    expect(
      mesesDeEvento([
        pedido({ date: "2027-05-15" }),
        pedido({ date: "2027-05-20" }),
        pedido({ date: "2026-09-01" }),
        pedido({ date: "" }),
        pedido({ date: "a definir" }),
      ]),
    ).toEqual(["2026-09", "2027-05"]);
  });

  it("as regiões só incluem o que foi mesmo reconhecido", () => {
    expect(
      regioesDe([
        pedido({ location: "Évora" }),
        pedido({ location: "Herdade em Estremoz" }),
        pedido({ location: "Portugal" }),
        pedido({ location: "" }),
      ]),
    ).toEqual(["Estremoz", "Évora"]);
  });

  it("as planners saem do campo da empresa, sem brancos nem repetições", () => {
    expect(
      plannersDe([
        pedido({ company: "AMARA" }),
        pedido({ company: "  AMARA  " }),
        pedido({ company: "" }),
        pedido({ company: undefined }),
        pedido({ company: "Bloom" }),
      ]),
    ).toEqual(["AMARA", "Bloom"]);
  });
});
