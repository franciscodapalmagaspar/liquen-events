import { describe, expect, it } from "vitest";
import type { Guest } from "./types";
import {
  unirCaixas,
  alargarSala,
  caixaDaSala,
  acrescentarLugares,
  apagarMesa,
  cadeiras,
  chaveDoLugar,
  contas,
  dimensoes,
  gruposPartidos,
  iniciais,
  levantar,
  mapaVazio,
  mudarMesa,
  nomeDoLugar,
  nomearLugar,
  novaMesa,
  novoElemento,
  ondeEsta,
  porSentar,
  reconciliar,
  sentar,
  sentarAutomaticamente,
  sentarGrupo,
  sentarResto,
  TECTOS,
  type MapaDeMesas,
  alinhar,
  desfazer,
  duplicarMesa,
  historicoVazio,
  nomeCurto,
  refazer,
  registar,
  gestoDaDiferenca,
  historicoDepoisDaJuncao,
} from "./mapa-de-mesas";

const g = (id: string, name: string, party = 1, rsvp: Guest["rsvp"] = "confirmado"): Guest => ({
  id,
  name,
  party,
  rsvp,
});

function comMesas(...formas: [string, "redonda" | "comprida" | "quadrada", number][]): MapaDeMesas {
  let m = mapaVazio();
  for (const [id, forma, lugares] of formas) {
    m = novaMesa(m, forma, id).mapa;
    m = mudarMesa(m, id, { lugares });
  }
  return m;
}

describe("as cadeiras de cada forma", () => {
  it("uma por lugar, à volta da mesa e fora dela", () => {
    for (const forma of ["redonda", "comprida", "quadrada"] as const) {
      for (const lugares of [1, 6, 8, 13]) {
        const mesa = { id: "m", nome: "M", forma, x: 500, y: 500, lugares };
        const cs = cadeiras(mesa);
        expect(cs).toHaveLength(lugares);
        const { largura, altura } = dimensoes(mesa);
        for (const c of cs) {
          // A redonda é um círculo: conta a distância ao centro, não a caixa.
          const dentro =
            forma === "redonda"
              ? Math.hypot(c.x - 500, c.y - 500) < largura / 2
              : Math.abs(c.x - 500) < largura / 2 && Math.abs(c.y - 500) < altura / 2;
          expect(dentro).toBe(false);
        }
      }
    }
  });

  it("a comprida cresce com os lugares e roda", () => {
    const curta = dimensoes({ forma: "comprida", lugares: 6 });
    const longa = dimensoes({ forma: "comprida", lugares: 20 });
    expect(longa.largura).toBeGreaterThan(curta.largura);
    const rodada = dimensoes({ forma: "comprida", lugares: 20, rodada: true });
    expect(rodada).toEqual({ largura: longa.altura, altura: longa.largura });
  });
});

describe("as pessoas e os nomes", () => {
  it("um grupo de 7 tem 7 lugares, os recusados não entram", () => {
    const lista = [g("a", "Família Silva", 7), g("b", "Rui", 1, "recusado"), g("c", "Ana")];
    expect(porSentar(mapaVazio(), lista)).toHaveLength(8);
  });

  it("o lugar mostra o nome escrito, senão o do grupo com o número", () => {
    const lista = [g("a", "Família Silva", 4), g("c", "Ana Lopes")];
    expect(nomeDoLugar({ convidadoId: "a", n: 2 }, lista)).toBe("Família Silva 2/4");
    expect(nomeDoLugar({ convidadoId: "a", n: 2, nome: "Tomás" }, lista)).toBe("Tomás");
    expect(nomeDoLugar({ convidadoId: "c", n: 1 }, lista)).toBe("Ana Lopes");
  });

  it("as iniciais saltam «Família» e as partículas", () => {
    expect(iniciais("Família Silva")).toBe("SI");
    expect(iniciais("Maria do Carmo Teixeira")).toBe("MT");
    expect(iniciais("Joaquim")).toBe("JO");
    expect(iniciais("Família Silva 3/4")).toBe("SI");
  });
});

describe("sentar", () => {
  const lista = [g("a", "Silva", 3), g("b", "Ana"), g("c", "Rui")];

  it("mover de lugar, e trocar com quem lá está", () => {
    let m = comMesas(["m1", "redonda", 4]);
    m = sentar(m, chaveDoLugar("m1", 0), { convidadoId: "b", n: 1 });
    m = sentar(m, chaveDoLugar("m1", 1), { convidadoId: "c", n: 1 });
    m = sentar(m, chaveDoLugar("m1", 1), { convidadoId: "b", n: 1 });
    expect(m.lugares[chaveDoLugar("m1", 1)].convidadoId).toBe("b");
    expect(m.lugares[chaveDoLugar("m1", 0)].convidadoId).toBe("c");
  });

  it("da lista de espera para um lugar ocupado: quem lá estava fica por sentar", () => {
    let m = comMesas(["m1", "redonda", 2]);
    m = sentar(m, chaveDoLugar("m1", 0), { convidadoId: "b", n: 1 });
    m = sentar(m, chaveDoLugar("m1", 0), { convidadoId: "c", n: 1 });
    expect(ondeEsta(m, { convidadoId: "b", n: 1 })).toBeNull();
    expect(porSentar(m, lista).map((p) => p.convidadoId)).toContain("b");
  });

  it("o grupo senta-se junto, a partir do lugar tocado", () => {
    const m = comMesas(["m1", "redonda", 8]);
    const r = sentarGrupo(m, lista, "a", "m1", 5);
    expect(r.ficaram).toBe(0);
    expect(Object.keys(r.mapa.lugares).sort()).toEqual(["m1:5", "m1:6", "m1:7"]);
  });

  it("um grupo de 7 numa mesa de 6: acrescentar lugares, ou o resto na mais próxima", () => {
    const grande = [g("f", "Família Costa", 7)];
    let m = comMesas(["m1", "redonda", 6], ["m2", "redonda", 8]);
    const r = sentarGrupo(m, grande, "f", "m1");
    expect(r.ficaram).toBe(1);

    const mais = acrescentarLugares(r.mapa, "m1", r.ficaram);
    expect(mais.acrescentados).toBe(1);
    expect(sentarGrupo(mais.mapa, grande, "f", "m1").ficaram).toBe(0);

    m = sentarResto(r.mapa, grande, "f", "m1").mapa;
    expect(porSentar(m, grande)).toHaveLength(0);
    expect(gruposPartidos(m)).toEqual(["f"]);
  });

  it("o nome de uma pessoa do grupo fica no lugar dela", () => {
    let m = sentarGrupo(comMesas(["m1", "redonda", 8]), lista, "a", "m1").mapa;
    m = nomearLugar(m, "m1:1", "  Tomás  ");
    expect(nomeDoLugar(m.lugares["m1:1"], lista)).toBe("Tomás");
    m = nomearLugar(m, "m1:1", "");
    expect(nomeDoLugar(m.lugares["m1:1"], lista)).toBe("Silva 2/3");
  });
});

describe("a lista de convidados muda e o mapa acompanha", () => {
  it("apagado, recusado e grupo que encolheu libertam os lugares; o que cresceu fica por sentar", () => {
    let lista = [g("a", "Silva", 4), g("b", "Ana"), g("c", "Rui")];
    let m = comMesas(["m1", "redonda", 10]);
    for (const id of ["a", "b", "c"]) m = sentarGrupo(m, lista, id, "m1").mapa;
    expect(Object.keys(m.lugares)).toHaveLength(6);

    lista = [g("a", "Silva", 2), g("b", "Ana", 1, "recusado")];
    const r = reconciliar(m, lista);
    expect(Object.keys(r.lugares)).toHaveLength(2);

    lista = [g("a", "Silva", 5)];
    expect(porSentar(reconciliar(m, lista), lista)).toHaveLength(1);
  });

  it("nada a mudar devolve o mesmo objecto (não se grava à toa)", () => {
    const lista = [g("b", "Ana")];
    const m = sentarGrupo(comMesas(["m1", "redonda", 4]), lista, "b", "m1").mapa;
    expect(reconciliar(m, lista)).toBe(m);
  });

  it("menos lugares na mesa: quem fica de fora volta à lista de espera", () => {
    const lista = [g("a", "Silva", 6)];
    let m = sentarGrupo(comMesas(["m1", "redonda", 8]), lista, "a", "m1").mapa;
    m = mudarMesa(m, "m1", { lugares: 4 });
    expect(porSentar(m, lista)).toHaveLength(2);
    m = apagarMesa(m, "m1");
    expect(porSentar(m, lista)).toHaveLength(6);
  });
});

describe("sentar automaticamente", () => {
  it("cada grupo na mesa onde cabe inteiro, com menos folga; não mexe em quem já está", () => {
    const lista = [
      g("a", "Silva", 6),
      g("b", "Costa", 4),
      g("c", "Ana"),
      g("d", "Rui", 1, "pendente"),
    ];
    let m = comMesas(["m1", "redonda", 6], ["m2", "redonda", 8]);
    m = sentar(m, "m2:7", { convidadoId: "c", n: 1 });
    const r = sentarAutomaticamente(m, lista);
    expect(r.sentados).toBe(11);
    expect(porSentar(r.mapa, lista)).toHaveLength(0);
    expect(gruposPartidos(r.mapa)).toEqual([]);
    expect(r.mapa.lugares["m2:7"].convidadoId).toBe("c");
    // O grupo de 6 foi para a mesa de 6, onde cabe certinho.
    const mesaDoSilva = Object.entries(r.mapa.lugares).find(([, o]) => o.convidadoId === "a")![0];
    expect(mesaDoSilva.startsWith("m1:")).toBe(true);
  });

  it("só parte um grupo quando nenhuma mesa o leva inteiro", () => {
    const lista = [g("a", "Silva", 10)];
    const r = sentarAutomaticamente(comMesas(["m1", "redonda", 6], ["m2", "redonda", 6]), lista);
    expect(r.sentados).toBe(10);
    expect(gruposPartidos(r.mapa)).toEqual(["a"]);
  });
});

describe("mesas, elementos e contas", () => {
  it("uma mesa nova não nasce em cima de outra, e o nome segue a numeração", () => {
    let m = mapaVazio();
    m = novaMesa(m, "redonda", "a").mapa;
    m = novaMesa(m, "redonda", "b").mapa;
    const [a, b] = m.mesas;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(dimensoes(a).largura);
    expect(m.mesas.map((x) => x.nome)).toEqual(["Mesa 1", "Mesa 2"]);
    m = novoElemento(m, "pista", "p").mapa;
    expect(m.elementos[0].nome).toBe("Pista de dança");
  });

  it("os tectos", () => {
    let m = comMesas(["m1", "redonda", 8]);
    m = mudarMesa(m, "m1", { lugares: 999 });
    expect(m.mesas[0].lugares).toBe(TECTOS.lugaresPorMesa);
    m = mudarMesa(m, "m1", { lugares: 0 });
    expect(m.mesas[0].lugares).toBe(1);
  });

  it("sentados de quantos, e os lugares livres", () => {
    const lista = [g("a", "Silva", 4), g("b", "Ana", 1, "recusado")];
    let m = comMesas(["m1", "redonda", 8]);
    m = sentarGrupo(m, lista, "a", "m1").mapa;
    m = levantar(m, "m1:0");
    expect(contas(m, lista)).toEqual({ sentados: 3, total: 4, lugares: 8, livres: 5 });
  });
});

describe("o ecrã de trabalho (14/10): duplicar, alinhar, anular e refazer", () => {
  it("duplicar dá uma mesa igual, vazia, ao lado, com o nome seguinte", () => {
    let m = comMesas(["a", "comprida", 12]);
    m = mudarMesa(m, "a", { rodada: true });
    m = sentar(m, chaveDoLugar("a", 0), { convidadoId: "x", n: 1 });
    const r = duplicarMesa(m, "a", "b");
    expect(r.mesa).toMatchObject({ forma: "comprida", lugares: 12, rodada: true, nome: "Mesa 2" });
    expect(r.mapa.lugares[chaveDoLugar("b", 0)]).toBeUndefined();
    // Não nasce em cima da original.
    const a = r.mapa.mesas[0];
    expect(Math.hypot(r.mesa!.x - a.x, r.mesa!.y - a.y)).toBeGreaterThan(200);
  });

  it("alinhar encaixa no centro de outra peça e diz a guia", () => {
    const m = comMesas(["a", "redonda", 8], ["b", "redonda", 8]);
    const a = m.mesas[0];
    const perto = alinhar(m, { tipo: "mesa", id: "b" }, a.x + 9, a.y + 400);
    expect(perto).toMatchObject({ x: a.x, guiaX: a.x, guiaY: null });
    const longe = alinhar(m, { tipo: "mesa", id: "b" }, a.x + 60, a.y + 400);
    expect(longe.guiaX).toBeNull();
    expect(longe.x).toBe(a.x + 60);
  });

  it("anular volta atrás, refazer volta à frente, e um gesto novo apaga o refazer", () => {
    const m0 = mapaVazio();
    const m1 = novaMesa(m0, "redonda", "a").mapa;
    const m2 = novaMesa(m1, "quadrada", "b").mapa;
    let h = registar(registar(historicoVazio(), m0), m1);
    const d = desfazer(h, m2)!;
    expect(d.mapa).toBe(m1);
    const r = refazer(d.historico, d.mapa)!;
    expect(r.mapa).toBe(m2);
    h = registar(d.historico, d.mapa);
    expect(refazer(h, m2)).toBeNull();
    expect(desfazer(historicoVazio(), m0)).toBeNull();
  });

  it("guarda no máximo 50 passos", () => {
    let h = historicoVazio();
    for (let i = 0; i < 70; i++) h = registar(h, mapaVazio());
    expect(h.passado).toHaveLength(50);
  });

  it("o nome curto debaixo da cadeira", () => {
    expect(nomeCurto("Maria Gomes")).toBe("Maria");
    expect(nomeCurto("Família Silva 2/4")).toBe("Silva 2");
    expect(nomeCurto("Bartolomeuzinho")).toBe("Bartolome…");
  });
});

describe("a sala começa grande (14/10)", () => {
  it("uma mesa sozinha fica numa sala do tamanho pedido, com ela ao centro", () => {
    const m = novaMesa(mapaVazio(), "redonda", "m1").mapa;
    const so = caixaDaSala(m);
    const grande = alargarSala(so, 2600, 1600);
    expect(grande.largura).toBe(2600);
    expect(grande.altura).toBe(1600);
    expect(grande.x + grande.largura / 2).toBeCloseTo(so.x + so.largura / 2);
    expect(grande.y + grande.altura / 2).toBeCloseTo(so.y + so.altura / 2);
  });

  it("uma sala que já é maior do que o mínimo fica igual", () => {
    const c = { x: -100, y: -50, largura: 4000, altura: 2500 };
    expect(alargarSala(c, 2600, 1600)).toBe(c);
  });
});

describe("unir caixas (a sala parada, 14/10)", () => {
  it("o que está dentro não muda nada — devolve a mesma caixa", () => {
    const chao = { x: -300, y: -300, largura: 2000, altura: 1300 };
    expect(unirCaixas(chao, { x: 100, y: 100, largura: 400, altura: 300 })).toBe(chao);
  });

  it("uma mesa levada para fora faz crescer só desse lado", () => {
    const chao = { x: 0, y: 0, largura: 1000, altura: 800 };
    expect(unirCaixas(chao, { x: 900, y: 100, largura: 300, altura: 200 })).toEqual({
      x: 0,
      y: 0,
      largura: 1200,
      altura: 800,
    });
  });
});

describe("o número de cada lugar (único na sala, o pedido dela de 15/10)", () => {
  it("numera de 1 até ao fim da sala, mesa a mesa pela ordem do nome, e os livres contam", async () => {
    const { numerosDosLugares, novaMesa, mapaVazio, mudarMesa, chaveDoLugar } =
      await import("./mapa-de-mesas");
    let m = mapaVazio();
    for (let i = 0; i < 11; i++) m = novaMesa(m, "redonda", `m${i}`).mapa;
    m = { ...m, mesas: m.mesas.map((x) => ({ ...x, lugares: 2 })) };
    m = mudarMesa(m, "m10", { lugares: 3 });
    const numeros = numerosDosLugares(m);
    // «Mesa 2» vem antes de «Mesa 10».
    const mesa = (nome: string) => m.mesas.find((x) => x.nome === nome)!;
    expect(numeros.get(chaveDoLugar(mesa("Mesa 1").id, 0))).toBe(1);
    expect(numeros.get(chaveDoLugar(mesa("Mesa 2").id, 1))).toBe(4);
    expect(numeros.get(chaveDoLugar(mesa("Mesa 10").id, 0))).toBe(19);
    expect(numeros.get(chaveDoLugar(mesa("Mesa 11").id, 2))).toBe(23);
    expect(new Set(numeros.values()).size).toBe(numeros.size);
  });
});

// ── Auditoria 6, n.º 17 — a junção depois de um conflito ───────────────────
describe("gestoDaDiferenca e historicoDepoisDaJuncao", () => {
  const vazio = (): MapaDeMesas => ({ versao: 1, mesas: [], elementos: [], lugares: {} });

  /**
   * Ela põe a mesa A e anula-a com o «Anular» (dois gestos por gravar).
   * Entretanto, outra pessoa gravou a mesa B. A gravação dá 409 e os gestos
   * voltam a aplicar-se ao mapa do servidor. O «Anular» era `() => antes`:
   * devolvia o mapa vazio inteiro e a mesa B desaparecia.
   */
  it("o «Anular» reaplicado numa junção não apaga o que a outra pessoa fez", () => {
    const base = vazio();
    const porA = (m: MapaDeMesas) => novaMesa(m, "redonda", "A").mapa;
    const comA = porA(base);
    const anularA = gestoDaDiferenca(comA, base);

    const doServidor = novaMesa(base, "comprida", "B").mapa;
    const junto = [porA, anularA].reduce((m, g) => g(m), doServidor);

    expect(junto.mesas.map((m) => m.id)).toEqual(["B"]);
  });

  it("aplicado ao próprio mapa de partida, dá o de chegada (lugares incluídos)", () => {
    const base = novaMesa(vazio(), "redonda", "A").mapa;
    const sentado = sentar(base, chaveDoLugar("A", 0), { convidadoId: "g1", n: 1 });
    expect(gestoDaDiferenca(base, sentado)(base)).toEqual(sentado);
    expect(gestoDaDiferenca(sentado, base)(sentado)).toEqual(base);
  });

  it("anular depois de uma junção não repõe um mapa de antes dela", () => {
    const base = vazio();
    const comA = novaMesa(base, "redonda", "A").mapa;
    const historico = registar(historicoVazio(), base);
    const doServidor = novaMesa(base, "comprida", "B").mapa;

    const h = historicoDepoisDaJuncao(historico, base, doServidor);
    const actual = gestoDaDiferenca(base, doServidor)(comA);
    const r = desfazer(h, actual)!;

    expect(r.mapa.mesas.map((m) => m.id)).toEqual(["B"]);
  });
});
