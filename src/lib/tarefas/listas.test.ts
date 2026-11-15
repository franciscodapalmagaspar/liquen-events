import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/orcamento/types";
import {
  AGRUPAMENTO_POR_OMISSAO,
  LISTAS_INTELIGENTES,
  LISTA_POR_OMISSAO,
  agruparTarefas,
  amanha,
  chaveDoEvento,
  contarPorLista,
  fimDaSemana,
  listasDeEvento,
  ordemVisivel,
  ordenarTarefas,
  pertenceALista,
  reordenarManualmente,
} from "./listas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE CAI EM «HOJE», O QUE CONTA COMO ATRASADA, E COMO SE AGRUPA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As fases 05 e 06 do `docs/APPLE-TAREFAS.md` são, quase todas, REGRAS — e uma
 * regra que só existe dentro de um ecrã só se prova a olho. Estas são as que
 * ela vai contestar, e é aqui que a resposta fica escrita.
 *
 * O dia de referência é sempre uma **quarta-feira**, e é escolhido: quarta é o
 * único dia da semana em que «ontem», «hoje», «amanhã», «ainda esta semana» e
 * «para a semana» são cinco dias diferentes. Numa sexta-feira, «amanhã» e «esta
 * semana» colavam-se e metade destes casos passava por acidente.
 */

// Quarta-feira, 16 de setembro de 2026. Domingo dessa semana: dia 20.
const QUARTA = "2026-09-16";

function tarefa(campos: Partial<Task> & { id: string }): Task {
  return {
    title: campos.id,
    done: false,
    priority: "normal",
    createdAt: "2026-09-01T10:00:00.000Z",
    ...campos,
  };
}

describe("as fronteiras do calendário", () => {
  it("a semana acaba ao domingo, e não sete dias a contar de hoje", () => {
    expect(fimDaSemana(QUARTA)).toBe("2026-09-20");
  });

  it("num domingo, a semana acaba no próprio dia — é o último da sua semana", () => {
    expect(fimDaSemana("2026-09-20")).toBe("2026-09-20");
  });

  it("numa segunda, a semana estende-se aos seis dias seguintes", () => {
    expect(fimDaSemana("2026-09-14")).toBe("2026-09-20");
  });

  it("«amanhã» atravessa o fim do mês sem se enganar", () => {
    expect(amanha("2026-09-30")).toBe("2026-10-01");
  });

  /**
   * O `T12:00:00` do módulo existe por causa deste dia: 29 de março de 2026 é a
   * madrugada em que Portugal salta das 01:00 para as 02:00. Com a meia-noite
   * como âncora, somar um dia podia devolver o mesmo dia.
   */
  it("a mudança da hora não faz um dia desaparecer", () => {
    expect(amanha("2026-03-28")).toBe("2026-03-29");
    expect(amanha("2026-03-29")).toBe("2026-03-30");
  });
});

describe("o que cai em cada lista", () => {
  const ontem = tarefa({ id: "ontem", dueDate: "2026-09-15" });
  const hoje = tarefa({ id: "hoje", dueDate: QUARTA });
  const amanhaT = tarefa({ id: "amanha", dueDate: "2026-09-17" });
  const domingo = tarefa({ id: "domingo", dueDate: "2026-09-20" });
  const paraASemana = tarefa({ id: "para-a-semana", dueDate: "2026-09-21" });
  const semData = tarefa({ id: "sem-data" });

  it("«Hoje» apanha o dia de hoje E o que já passou", () => {
    // É o comportamento dos Lembretes, e a razão está no módulo: uma tarefa
    // que devia estar feita há dois dias é, hoje, mais urgente do que uma que
    // vence hoje.
    expect(pertenceALista(hoje, "hoje", QUARTA)).toBe(true);
    expect(pertenceALista(ontem, "hoje", QUARTA)).toBe(true);
    expect(pertenceALista(amanhaT, "hoje", QUARTA)).toBe(false);
    expect(pertenceALista(semData, "hoje", QUARTA)).toBe(false);
  });

  it("«Esta semana» vai até domingo, inclusive, e pára aí", () => {
    expect(pertenceALista(domingo, "semana", QUARTA)).toBe(true);
    expect(pertenceALista(paraASemana, "semana", QUARTA)).toBe(false);
  });

  it("«Atrasada» é prazo passado e POR FAZER — uma concluída não deve nada", () => {
    expect(pertenceALista(ontem, "atrasadas", QUARTA)).toBe(true);
    expect(pertenceALista({ ...ontem, done: true }, "atrasadas", QUARTA)).toBe(false);
    // Hoje ainda não passou. O prazo é o dia, não o instante.
    expect(pertenceALista(hoje, "atrasadas", QUARTA)).toBe(false);
  });

  it("«Sem data» é a lista de quem não tem prazo nenhum", () => {
    expect(pertenceALista(semData, "sem-data", QUARTA)).toBe(true);
    expect(pertenceALista(hoje, "sem-data", QUARTA)).toBe(false);
  });

  it("«Todas» não deixa nada de fora — nem o que está feito", () => {
    for (const t of [ontem, hoje, semData, { ...ontem, done: true }]) {
      expect(pertenceALista(t, "todas", QUARTA)).toBe(true);
    }
  });

  /**
   * A propriedade que faz a barra lateral ler-se sem instruções, e a única
   * maneira de a provar é esta: as listas de horizonte ENCAIXAM umas nas
   * outras. Se alguém mudar uma fronteira sozinha, isto fica vermelho.
   */
  it("atrasadas ⊂ hoje ⊂ esta semana ⊂ todas", () => {
    const todas = [ontem, hoje, amanhaT, domingo, paraASemana, semData];
    const dentro = (lista: "atrasadas" | "hoje" | "semana" | "todas") =>
      new Set(todas.filter((t) => pertenceALista(t, lista, QUARTA)).map((t) => t.id));
    const atrasadas = dentro("atrasadas");
    const deHoje = dentro("hoje");
    const daSemana = dentro("semana");
    const tudo = dentro("todas");
    for (const id of atrasadas) expect(deHoje.has(id), `${id} saiu de «Hoje»`).toBe(true);
    for (const id of deHoje) expect(daSemana.has(id), `${id} saiu da semana`).toBe(true);
    for (const id of daSemana) expect(tudo.has(id), `${id} saiu de «Todas»`).toBe(true);
  });

  it("a lista por omissão é «Todas», e é uma das cinco", () => {
    // Abrir em «Hoje» dava um ecrã vazio por cima de uma lista cheia, porque
    // nesta casa o prazo é opcional. Ver a nota em `LISTA_POR_OMISSAO`.
    expect(LISTA_POR_OMISSAO).toBe("todas");
    expect(LISTAS_INTELIGENTES.map((l) => l.id)).toContain(LISTA_POR_OMISSAO);
  });

  it("as cinco listas do documento estão lá, por aquela ordem", () => {
    expect(LISTAS_INTELIGENTES.map((l) => l.rotulo)).toEqual([
      "Hoje",
      "Esta semana",
      "Atrasadas",
      "Sem data",
      "Todas",
    ]);
  });
});

describe("as listas por evento", () => {
  const melanie = tarefa({ id: "a", quoteId: "q1", clientName: "Melanie e Sebastien" });
  const mesmaProposta = tarefa({ id: "b", quoteId: "q1", clientName: "Melanie" });
  const daniela = tarefa({ id: "c", clientName: "Daniela" });
  const semEvento = tarefa({ id: "d" });

  it("duas tarefas da mesma proposta são o mesmo evento, mesmo com o nome escrito de outra maneira", () => {
    expect(chaveDoEvento(melanie)).toBe(chaveDoEvento(mesmaProposta));
  });

  it("sem proposta, o nome do cliente serve — e «Daniela » é a mesma «daniela»", () => {
    expect(chaveDoEvento(daniela)).toBe(
      chaveDoEvento(tarefa({ id: "e", clientName: " daniela " })),
    );
  });

  it("uma tarefa sem proposta e sem cliente não pertence a evento nenhum", () => {
    expect(chaveDoEvento(semEvento)).toBeNull();
  });

  it("só há lista para o evento que TEM trabalho — nunca uma lista a dizer zero", () => {
    // «Contador de zero como cabeçalho» é proibição da Parte 8, e é por isso
    // que estas listas nascem das tarefas e não das propostas activas.
    const listas = listasDeEvento([melanie, mesmaProposta, daniela, semEvento]);
    expect(listas).toHaveLength(2);
    for (const l of listas) expect(l.rotulo).not.toBe("");
  });

  it("por ordem alfabética, para a barra não se reordenar quando ela risca uma tarefa", () => {
    const listas = listasDeEvento([daniela, melanie, tarefa({ id: "f", clientName: "Ana" })]);
    expect(listas.map((l) => l.rotulo)).toEqual(["Ana", "Daniela", "Melanie e Sebastien"]);
  });

  it("uma lista de evento contém as tarefas desse evento e mais nenhumas", () => {
    const [primeira] = listasDeEvento([melanie, daniela]);
    expect(pertenceALista(daniela, primeira.id, QUARTA)).toBe(true);
    expect(pertenceALista(melanie, primeira.id, QUARTA)).toBe(false);
  });
});

describe("as contagens ao lado do nome de cada lista", () => {
  const tarefas = [
    tarefa({ id: "1", dueDate: "2026-09-14" }), // atrasada
    tarefa({ id: "2", dueDate: QUARTA }), // hoje
    tarefa({ id: "3", dueDate: "2026-09-19" }), // ainda esta semana
    tarefa({ id: "4" }), // sem data
    tarefa({ id: "5", dueDate: "2026-09-14", done: true }), // feita, e atrasada não é
  ];

  it("contam-se as por fazer, porque a contagem é uma dívida e não um inventário", () => {
    const contas = contarPorLista(tarefas, QUARTA);
    expect(contas.get("todas")).toBe(4);
    expect(contas.get("atrasadas")).toBe(1);
    expect(contas.get("hoje")).toBe(2);
    expect(contas.get("semana")).toBe(3);
    expect(contas.get("sem-data")).toBe(1);
  });

  it("uma lista sem nada por fazer conta zero, e não desaparece do mapa", () => {
    // A lista inteligente FICA na barra mesmo a zero — são cinco destinos
    // fixos, e um destino que desaparece é um destino que se procura. O que
    // não aparece a zero são as listas por EVENTO, que nascem das tarefas.
    const contas = contarPorLista([tarefa({ id: "x" })], QUARTA);
    expect(contas.get("atrasadas")).toBe(0);
    expect(contas.has("hoje")).toBe(true);
  });
});

describe("agrupar", () => {
  const tarefas = [
    tarefa({ id: "atrasada", dueDate: "2026-09-10" }),
    tarefa({ id: "hoje", dueDate: QUARTA }),
    tarefa({ id: "amanha", dueDate: "2026-09-17" }),
    tarefa({ id: "sabado", dueDate: "2026-09-19" }),
    tarefa({ id: "mes-que-vem", dueDate: "2026-10-05" }),
    tarefa({ id: "sem-prazo" }),
  ];

  it("por omissão é por Data — é o que o ponto 11 do documento manda", () => {
    expect(AGRUPAMENTO_POR_OMISSAO).toBe("data");
  });

  it("os degraus da data saem por ordem de leitura, com as atrasadas à frente", () => {
    const grupos = agruparTarefas(tarefas, "data", QUARTA);
    expect(grupos.map((g) => g.titulo)).toEqual([
      "Atrasadas",
      "Hoje",
      "Amanhã",
      "Esta semana",
      "Mais tarde",
      "Sem data",
    ]);
    expect(grupos.map((g) => g.tarefas.map((t) => t.id))).toEqual([
      ["atrasada"],
      ["hoje"],
      ["amanha"],
      ["sabado"],
      ["mes-que-vem"],
      ["sem-prazo"],
    ]);
  });

  it("um grupo vazio não desenha cabeçalho nenhum", () => {
    // Parte 8: «contador de zero como cabeçalho» e «separador por baixo de um
    // cabeçalho sem conteúdo».
    const grupos = agruparTarefas([tarefa({ id: "só-esta", dueDate: QUARTA })], "data", QUARTA);
    expect(grupos.map((g) => g.titulo)).toEqual(["Hoje"]);
  });

  it("uma lista vazia não dá grupo nenhum, em modo nenhum", () => {
    for (const modo of ["data", "evento", "responsavel", "nenhum"] as const) {
      expect(agruparTarefas([], modo, QUARTA), modo).toEqual([]);
    }
  });

  it("«Nenhum» é uma lista corrida, e uma lista corrida não leva cabeçalho", () => {
    const grupos = agruparTarefas(tarefas, "nenhum", QUARTA);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].titulo).toBeNull();
    expect(grupos[0].tarefas).toHaveLength(tarefas.length);
  });

  it("por evento, com os órfãos no fim por muito grandes que sejam", () => {
    const grupos = agruparTarefas(
      [
        tarefa({ id: "1" }),
        tarefa({ id: "2" }),
        tarefa({ id: "3" }),
        tarefa({ id: "4", clientName: "Melanie" }),
        tarefa({ id: "5", clientName: "Ana" }),
      ],
      "evento",
      QUARTA,
    );
    expect(grupos.map((g) => g.titulo)).toEqual(["Ana", "Melanie", "Sem evento"]);
    expect(grupos.at(-1)!.tarefas).toHaveLength(3);
  });

  it("por responsável, e «Sem responsável» também vai para o fim", () => {
    const grupos = agruparTarefas(
      [
        tarefa({ id: "1", assignee: "Catarina" }),
        tarefa({ id: "2" }),
        tarefa({ id: "3", assignee: "Ana" }),
        tarefa({ id: "4", assignee: "  " }),
      ],
      "responsavel",
      QUARTA,
    );
    expect(grupos.map((g) => g.titulo)).toEqual(["Ana", "Catarina", "Sem responsável"]);
    // Um responsável escrito só com espaços não é um responsável.
    expect(grupos.at(-1)!.tarefas.map((t) => t.id)).toEqual(["2", "4"]);
  });

  it("agrupar não mexe na ordem que recebe — ordenar é a outra pergunta", () => {
    const dentro = [tarefa({ id: "b", dueDate: QUARTA }), tarefa({ id: "a", dueDate: QUARTA })];
    expect(agruparTarefas(dentro, "data", QUARTA)[0].tarefas.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("ordenar", () => {
  const cedo = tarefa({ id: "cedo", dueDate: "2026-09-17", createdAt: "2026-09-01T10:00:00Z" });
  const tarde = tarefa({ id: "tarde", dueDate: "2026-09-25", createdAt: "2026-09-05T10:00:00Z" });
  const urgente = tarefa({
    id: "urgente",
    priority: "alta",
    dueDate: "2026-09-30",
    createdAt: "2026-09-03T10:00:00Z",
  });
  const semPrazo = tarefa({ id: "sem-prazo", createdAt: "2026-09-09T10:00:00Z" });
  const todas = [tarde, semPrazo, cedo, urgente];

  it("por data: o prazo mais próximo à frente, e quem não tem prazo no fim", () => {
    expect(ordenarTarefas(todas, "data").map((t) => t.id)).toEqual([
      "cedo",
      "tarde",
      "urgente",
      "sem-prazo",
    ]);
  });

  it("por prioridade: a alta primeiro, e a data a desempatar dentro dela", () => {
    const outra = tarefa({ id: "outra-alta", priority: "alta", dueDate: "2026-09-18" });
    expect(ordenarTarefas([...todas, outra], "prioridade").map((t) => t.id)).toEqual([
      "outra-alta",
      "urgente",
      "cedo",
      "tarde",
      "sem-prazo",
    ]);
  });

  it("por criação: a mais recente no topo, que é onde a linha de escrever a pôs", () => {
    expect(ordenarTarefas(todas, "criacao").map((t) => t.id)).toEqual([
      "sem-prazo",
      "tarde",
      "urgente",
      "cedo",
    ]);
  });

  it("nenhuma das ordens toca na lista que recebe", () => {
    const original = [...todas];
    for (const modo of ["data", "prioridade", "criacao", "manual"] as const) {
      ordenarTarefas(todas, modo, ["urgente"]);
    }
    expect(todas).toEqual(original);
  });

  describe("manual — a costura que a fase 09 vai puxar", () => {
    it("segue a ordem dos ids que lhe derem", () => {
      const ordem = ["urgente", "sem-prazo", "cedo", "tarde"];
      expect(ordenarTarefas(todas, "manual", ordem).map((t) => t.id)).toEqual(ordem);
    });

    it("uma tarefa criada depois da ordem fica no topo, e não perdida no fim", () => {
      const nova = tarefa({ id: "nova" });
      const ordem = ["cedo", "tarde", "urgente", "sem-prazo"];
      expect(ordenarTarefas([...todas, nova], "manual", ordem).map((t) => t.id)[0]).toBe("nova");
    });

    it("a ordem de arranque é a que está no ecrã — escolher «Manual» não faz a lista saltar", () => {
      const grupos = agruparTarefas(ordenarTarefas(todas, "data"), "data", QUARTA);
      const ordem = ordemVisivel(grupos);
      expect(ordenarTarefas(todas, "manual", ordem).map((t) => t.id)).toEqual(ordem);
    });

    it("mover uma tarefa põe-na NO LUGAR do destino e empurra-o para baixo", () => {
      expect(reordenarManualmente(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    });

    it("mover para trás funciona da mesma maneira, e a operação desfaz-se", () => {
      const depois = reordenarManualmente(["a", "b", "c"], "a", "c");
      expect(depois).toEqual(["b", "a", "c"]);
      expect(reordenarManualmente(depois, "a", "b")).toEqual(["a", "b", "c"]);
    });

    it("sem destino — ou com um destino que já não existe — vai para o fim", () => {
      expect(reordenarManualmente(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
      expect(reordenarManualmente(["a", "b", "c"], "a", "z")).toEqual(["b", "c", "a"]);
    });

    it("largar uma tarefa em cima de si própria não muda nada de sítio", () => {
      // O caso do arrasto que não chega a sair do lugar. Sem isto, a linha
      // saltava para o fim ao mais pequeno tremor do rato.
      expect(reordenarManualmente(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
    });

    it("uma tarefa que ainda não estava na ordem entra na mesma", () => {
      expect(reordenarManualmente(["a", "b"], "nova", "a")).toEqual(["nova", "a", "b"]);
    });
  });
});

/**
 * Auditoria de 14/11, n.º 16: «Evento sem nome» quando o pedido tinha nome. As
 * listas só liam o `clientName` da tarefa — e uma tarefa criada a partir de um
 * pedido pode ter sido gravada sem ele.
 */
describe("o nome do evento vem do pedido", () => {
  const nomes = new Map([["LIQ-1", "Ana e Rui"]]);

  it("a lista de evento usa o nome do pedido quando a tarefa não o traz", () => {
    const listas = listasDeEvento([tarefa({ id: "a", quoteId: "LIQ-1" })], nomes);
    expect(listas).toEqual([{ id: "evento:q:LIQ-1", rotulo: "Ana e Rui" }]);
  });

  it("e o grupo «por evento» também", () => {
    const grupos = agruparTarefas(
      [tarefa({ id: "a", quoteId: "LIQ-1", clientName: "" })],
      "evento",
      QUARTA,
      nomes,
    );
    expect(grupos[0].titulo).toBe("Ana e Rui");
  });

  it("uma primeira tarefa sem nome não fica com o lugar de uma segunda que o tem", () => {
    const listas = listasDeEvento([
      tarefa({ id: "a", quoteId: "LIQ-2" }),
      tarefa({ id: "b", quoteId: "LIQ-2", clientName: "Marta" }),
    ]);
    expect(listas[0].rotulo).toBe("Marta");
  });

  it("sem nome em lado nenhum, continua a dizer «Evento sem nome»", () => {
    expect(listasDeEvento([tarefa({ id: "a", quoteId: "LIQ-3" })], nomes)[0].rotulo).toBe(
      "Evento sem nome",
    );
  });
});
