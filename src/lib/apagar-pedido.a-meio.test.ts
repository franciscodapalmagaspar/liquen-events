import { describe, it, expect, beforeEach, vi } from "vitest";
import { dados, reporOMundo, proposta, contrato, aMeio } from "./apagar-pedido.testkit";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE NASCE, OU SE PERDE, A MEIO DO APAGAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Desde o P5 (17/11) as tabelas ligadas ao pedido têm chave estrangeira:
 * tarefas em cascata, faturas, contratos e propostas em `set null`. Uma linha
 * que nasce noutro ecrã enquanto o apagar corre, ou uma resposta que se perde
 * pelo caminho, não pode sair sem relatório nem ficar solta com o nome do
 * casal. A promessa em si está em `apagar-pedido.test.ts`.
 */

vi.mock("@/lib/quotes-store", () => import("./apagar-pedido.testkit").then((k) => k.lojas.quotes));
vi.mock("@/lib/proposals-store", () =>
  import("./apagar-pedido.testkit").then((k) => k.lojas.proposals),
);
vi.mock("@/lib/invoices-store", () =>
  import("./apagar-pedido.testkit").then((k) => k.lojas.invoices),
);
vi.mock("@/lib/contracts-store", () =>
  import("./apagar-pedido.testkit").then((k) => k.lojas.contracts),
);
vi.mock("@/lib/app-state", () => import("./apagar-pedido.testkit").then((k) => k.lojas.appState));
vi.mock("@/lib/proposal-drafts", () =>
  import("./apagar-pedido.testkit").then((k) => k.lojas.drafts),
);
vi.mock("@/lib/proposal-storage", () =>
  import("./apagar-pedido.testkit").then((k) => k.lojas.storage),
);
vi.mock("@/lib/tasks-store", () => import("./apagar-pedido.testkit").then((k) => k.lojas.tasks));
vi.mock("@/lib/logger", () => import("./apagar-pedido.testkit").then((k) => k.lojas.logger));

const { apagarPedido } = await import("./apagar-pedido");

beforeEach(reporOMundo);

describe("P5: as tarefas caem em cascata com o pedido", () => {
  it("uma tarefa que não saiu faz o pedido ficar — a cascata levava-a sem ninguém saber", async () => {
    dados.tarefas = [
      { id: "t1", quoteId: "q1" },
      { id: "t2", quoteId: "q1" },
    ];
    dados.tarefaQueFalha = "t2";
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    expect(dados.pedidosApagados).toEqual([]);
    expect(r.saiu.tarefas).toEqual(["t1"]);
    expect(r.falhou).toContain("a tarefa t2 não foi apagada");
  });

  it("e pára ANTES de apagar propostas, fotografias e rascunhos — nada fica a meio", async () => {
    dados.propostas = [proposta("p1")];
    dados.fotos = [{ path: "q1/a.jpg" }];
    dados.tarefasRebentam = true;
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    expect(dados.apagadas).toEqual([]);
    expect(dados.removidas).toEqual([]);
    expect(dados.rascunhosLimpos).toEqual([]);
  });

  it("sem conseguir listar as tarefas, o pedido também fica", async () => {
    dados.tarefasRebentam = true;
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    // Uma tarefa por ler não é um registo fiscal: nada de «tem contrato».
    expect(r.motivo).toBeUndefined();
    expect(r.falhou).toContain("não consegui listar as tarefas deste pedido");
    expect(dados.pedidosApagados).toEqual([]);
  });
});

describe("P5: uma tarefa criada a meio do apagar", () => {
  it("faz o pedido ficar, em vez de a cascata a levar sem ninguém saber", async () => {
    dados.tarefas = [{ id: "t1", quoteId: "q1" }];
    // Enquanto as fotografias saem, alguém cria uma tarefa para este pedido.
    dados.fotos = [{ path: "q1/a.jpg" }];
    aMeio(dados.removidas, () => {
      dados.tarefas = [...dados.tarefas, { id: "t-nova", quoteId: "q1" }];
    });
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    expect(dados.pedidosApagados).toEqual([]);
    expect(r.falhou).toContain("apareceram 1 tarefa(s) novas neste pedido");
  });
});

describe("P5: um contrato que nasce a meio do apagar", () => {
  it("faz o pedido ficar — a chave do contrato é `set null` e o pedido saía sem ele", async () => {
    dados.fotos = [{ path: "q1/a.jpg" }];
    aMeio(dados.removidas, () => {
      // Um aceite noutro ecrã enquanto as fotografias saem.
      dados.contratos = [...dados.contratos, contrato("q1")];
    });
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    // Sem motivo de recusa: já saiu coisa, e a Reciclagem tem de o guardar
    // (um motivo diria «nada saiu» e ela deitava fora a única cópia).
    expect(r.motivo).toBeUndefined();
    expect(r.falhou).toContain("nasceu um contrato neste pedido enquanto se apagava");
    expect(dados.pedidosApagados).toEqual([]);
    expect(dados.leiturasDeContratos).toBe(2);
  });
});

describe("P5: uma proposta que nasce a meio pára antes das fotografias", () => {
  it("o pedido, as fotografias e os rascunhos ficam", async () => {
    dados.propostas = [proposta("p1")];
    dados.fotos = [{ path: "q1/a.jpg" }];
    aMeio(dados.apagadas, () => {
      // Enquanto p1 sai, noutro ecrã nasce outra proposta para este pedido.
      dados.propostas = [...dados.propostas, proposta("p-nova")];
    });
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    expect(r.saiu.propostas).toEqual(["p1"]);
    expect(dados.removidas).toEqual([]);
    expect(dados.rascunhosLimpos).toEqual([]);
    expect(r.falhou).toContain("ficaram 1 proposta(s) neste pedido");
  });
});

describe("P5: uma fatura que nasce a meio do apagar", () => {
  it("faz o pedido ficar — a mesma pergunta do início, repetida no fim", async () => {
    dados.fotos = [{ path: "q1/a.jpg" }];
    aMeio(dados.removidas, () => {
      // O Moloni grava uma fatura enquanto as fotografias saem.
      dados.faturas = [...dados.faturas, { id: "f1", quoteId: "q1" }];
    });
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    expect(r.motivo).toBeUndefined();
    expect(dados.pedidosApagados).toEqual([]);
    expect(r.falhou).toContain("nasceu uma fatura neste pedido enquanto se apagava");
  });
});

describe("P5: as propostas — contar o que nasceu, não repetir o que falhou", () => {
  it("uma falhou e outra nasceu noutro ecrã: a que falhou é dita, e a contagem também", async () => {
    dados.propostas = [proposta("p1"), proposta("p2")];
    dados.propostaQueFalha = "p2";
    aMeio(dados.apagadas, () => {
      dados.propostas = [...dados.propostas, proposta("p-nova")];
    });
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    expect(r.falhou).toContain("a proposta p2 não foi apagada");
    // A que nasceu conta-se à parte da que falhou.
    expect(r.falhou).toContain("ficaram 1 proposta(s) neste pedido");
  });
});

describe("uma listagem de propostas que falha uma vez e depois prova que não há nenhuma", () => {
  it("o pedido sai, sem um aviso que já não é verdade", async () => {
    dados.listagensDePropostasQueFalham = 1;
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(true);
    expect(r.falhou).not.toContain("não consegui listar as propostas deste pedido");
  });
});

describe("uma proposta cuja resposta se perdeu mas que saiu mesmo", () => {
  it("o pedido sai, e o relatório não diz que ela ficou", async () => {
    dados.propostas = [proposta("p1")];
    dados.propostaQueApagaEFalha = "p1";
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(true);
    expect(r.falhou.join(" ")).not.toContain("p1");
    expect(r.saiu.propostas).toEqual(["p1"]);
    expect(r.contou.propostas).toBe(1);
  });

  // Júri, 12.ª volta (18/11): se o apagar parar MAIS À FRENTE, a Reciclagem só
  // guarda o que está em `saiu` — sem ela lá, deitava fora a única cópia.
  it("e entra em `saiu` mesmo quando o apagar pára mais à frente", async () => {
    dados.propostas = [proposta("p1"), proposta("p2")];
    dados.propostaQueApagaEFalha = "p1";
    dados.pedidoRebenta = true;
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    expect(r.motivo).toBeUndefined();
    expect([...r.saiu.propostas].sort()).toEqual(["p1", "p2"]);
    expect(r.contou.propostas).toBe(2);
  });

  it("sem a confirmação, a que falhou não entra em `saiu`, mas em `talvezSaiu`", async () => {
    dados.propostas = [proposta("p0"), proposta("p1")];
    dados.propostaQueApagaEFalha = "p1";
    // A 1.ª listagem passa; quando p0 sai, a base cai, e a confirmação falha.
    aMeio(dados.apagadas, () => {
      dados.listagensDePropostasQueFalham = 1;
    });
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    expect(r.saiu.propostas).toEqual(["p0"]);
    // Mas fica como «talvez tenha saído»: a Reciclagem guarda-lhe a cópia
    // (revisão de 18/11, R1) — o «Repor» só repõe o que falta.
    expect(r.talvezSaiu.propostas).toEqual(["p1"]);
    expect(r.falhou).toContain("a proposta p1 não foi apagada");
    expect(r.falhou).toContain("não consegui confirmar as propostas deste pedido");
  });
});

describe("um rascunho do Moloni a ser criado enquanto se apagava (júri, 12.ª volta)", () => {
  it("a marca, posta antes de falar com o Moloni, faz o pedido ficar", async () => {
    dados.fotos = [{ path: "q1/a.jpg" }];
    aMeio(dados.removidas, () => {
      // Noutro ecrã carrega-se em «Criar rascunho»: a marca entra no pedido
      // antes de o Moloni responder com o documento.
      dados.pedidos.set("q1", {
        id: "q1",
        faturasMoloni: { sinal: { em: "x", aCriarDesde: new Date().toISOString() } },
      });
    });
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    expect(r.motivo).toBeUndefined();
    expect(dados.pedidosApagados).toEqual([]);
    expect(r.falhou).toContain("nasceu uma fatura neste pedido enquanto se apagava");
  });
});
