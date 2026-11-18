import { describe, it, expect, beforeEach, vi } from "vitest";
import { dados, reporOMundo, proposta, contrato } from "./apagar-pedido.testkit";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * APAGAR UM PEDIDO TEM DE APAGAR OS DADOS, NÃO A LINHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A política de privacidade PUBLICADA no sítio promete: «pedidos que não deem
 * origem a contrato são eliminados no prazo máximo de 12 meses após o último
 * contacto».
 *
 * O apagamento tirava a linha do pedido e mais nada. As propostas ficavam —
 * com o nome do casal, o email e o documento inteiro — porque a chave
 * estrangeira é `on delete set null`: em vez de irem atrás, ficavam ÓRFÃS e
 * intactas. As fotografias ficavam no bucket; o rascunho no `app_state`.
 *
 * O primeiro teste deste ficheiro é o que prova a promessa. Os outros são as
 * duas coisas que a tornam segura: um contrato manda parar, e o que não se
 * conseguiu apagar é DITO.
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

describe("apagar um pedido sem contrato", () => {
  it("LEVA AS PROPOSTAS ATRÁS — é a promessa que estava por cumprir", async () => {
    /**
     * O defeito, por extenso: as propostas guardam `clientName`, `clientEmail`
     * e o documento inteiro. Com `on delete set null`, apagar o pedido
     * desligava-as em vez de as apagar, e elas ficavam lá com tudo dentro.
     */
    dados.propostas = [proposta("p1"), proposta("p2"), proposta("p3", "outro")];
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(true);
    expect(dados.apagadas.sort()).toEqual(["p1", "p2"]);
    // A proposta de OUTRO pedido não se toca.
    expect(dados.apagadas).not.toContain("p3");
    expect(r.contou.propostas).toBe(2);
  });

  it("leva as TAREFAS do pedido — guardam o nome do casal (auditoria 12/11, n.º 7)", async () => {
    dados.tarefas = [
      { id: "t1", quoteId: "q1" },
      { id: "t2", quoteId: "outro" },
      { id: "t3" },
      { id: "t4", quoteId: "q1" },
    ];
    const r = await apagarPedido("q1");
    expect(dados.tarefasApagadas.sort()).toEqual(["t1", "t4"]);
    expect(r.contou.tarefas).toBe(2);
  });

  it("leva as fotografias carregadas para aquele pedido", async () => {
    dados.fotos = [{ path: "q1/a.jpg" }, { path: "q1/b.jpg" }];
    const r = await apagarPedido("q1");
    expect(dados.removidas.sort()).toEqual(["q1/a.jpg", "q1/b.jpg"]);
    expect(r.contou.fotos).toBe(2);
  });

  it("limpa o rascunho do estúdio E as gavetas de resgate", async () => {
    // Um rascunho esquecido tem lá dentro o mesmo documento que a proposta
    // tinha — e as gavetas de resgate guardam versões inteiras por cima.
    await apagarPedido("q1");
    expect(dados.rascunhosLimpos).toEqual([
      "q1",
      "q1--orcamento-linhas",
      "q1--sobreposto",
      "q1--orcamento-linhas--sobreposto",
    ]);
  });

  it("um rascunho que não existe não se «apaga» nem se conta (revisão 13/11, n.º 3)", async () => {
    dados.estado = new Map([["draft:q1", { doc: {} }]]);
    const r = await apagarPedido("q1");
    expect(dados.rascunhosLimpos).toEqual(["q1"]);
    expect(r.contou.rascunhos).toBe(1);
  });

  it("o pedido é o ÚLTIMO a sair", async () => {
    /**
     * Se fosse o primeiro e algo falhasse a meio, ficavam propostas órfãs sem
     * nada que apontasse para elas — o defeito de hoje, agora sem forma de o
     * encontrar. Enquanto o pedido existir, uma segunda tentativa sabe o que
     * falta.
     */
    dados.propostas = [proposta("p1")];
    await apagarPedido("q1");
    expect(dados.apagadas.length).toBe(1);
    expect(dados.pedidosApagados).toEqual(["q1"]);
  });
});

describe("o que NÃO se apaga", () => {
  it("um contrato PENDENTE já manda parar — não é preciso estar aceite", async () => {
    /**
     * Contratos e facturas são registos fiscais e conservam-se anos. A própria
     * política sabe disso — fala de pedidos que NÃO deram origem a contrato.
     */
    dados.contratos = [contrato("q1", "pendente")];
    dados.propostas = [proposta("p1")];
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    expect(r.motivo).toBe("tem-contrato");
    // E NADA foi tocado — nem as propostas, nem o pedido.
    expect(dados.apagadas).toEqual([]);
    expect(dados.pedidosApagados).toEqual([]);
  });

  it("um contrato ACEITE manda parar da mesma maneira", async () => {
    // Os dois estados que existem — `pendente` e `aceite` — bloqueiam. Na
    // dúvida entre apagar de mais e de menos, num registo fiscal, apaga-se de
    // menos.
    dados.contratos = [contrato("q1", "aceite")];
    expect((await apagarPedido("q1")).motivo).toBe("tem-contrato");
  });

  it("NÃO SABER se há contrato conta como haver", async () => {
    /**
     * Não saber não é o mesmo que saber que não há, e aqui a diferença é entre
     * cumprir uma política e destruir contabilidade.
     */
    dados.contratosRebentam = true;
    dados.propostas = [proposta("p1")];
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    expect(dados.apagadas).toEqual([]);
    expect(r.falhou.join(" ")).toMatch(/não consegui verificar/i);
    // Não se apaga nada, mas também não se afirma um contrato que pode não existir.
    expect(r.motivo).toBe("nao-verificado");
  });

  it("um pedido que não existe diz que não existe", async () => {
    expect((await apagarPedido("nao-ha")).motivo).toBe("nao-existe");
  });

  it("um contrato de OUTRO pedido não impede nada", async () => {
    dados.contratos = [contrato("outro")];
    expect((await apagarPedido("q1")).apagado).toBe(true);
  });
});

describe("o que ficou por apagar é DITO", () => {
  it("uma proposta que o armazém recusou aparece na lista", async () => {
    /**
     * Um apagamento silencioso é indistinguível de um que não aconteceu — que
     * é exactamente o defeito que este módulo veio corrigir.
     */
    dados.propostas = [proposta("p1"), proposta("p2")];
    dados.propostaQueFalha = "p2";
    const r = await apagarPedido("q1");
    expect(r.contou.propostas).toBe(1);
    expect(r.falhou.join(" ")).toContain("p2");
    // O resto continua (fotografias, rascunhos), mas o PEDIDO fica (P5): com a
    // proposta p2 ainda lá, apagá-lo deixava-a solta pelo `set null`, com o
    // nome do casal, e uma segunda tentativa já não a encontrava.
    expect(r.apagado).toBe(false);
    expect(dados.pedidosApagados).toEqual([]);
    // E pára ANTES das fotografias e dos rascunhos, sem dizer a falha duas vezes.
    expect(dados.removidas).toEqual([]);
    expect(dados.rascunhosLimpos).toEqual([]);
    expect(r.falhou.filter((f) => f.includes("proposta"))).toEqual([
      "a proposta p2 não foi apagada",
    ]);
  });

  it("uma fotografia que ficou no bucket aparece na lista", async () => {
    // Senão fica um ficheiro com a cara de um casal num sítio que ninguém sabe
    // que ainda existe.
    dados.fotos = [{ path: "q1/a.jpg" }, { path: "q1/b.jpg" }];
    dados.fotoQueFalha = "q1/b.jpg";
    const r = await apagarPedido("q1");
    expect(r.contou.fotos).toBe(1);
    expect(r.falhou.join(" ")).toContain("q1/b.jpg");
  });

  it("se o pedido em si não sair, NÃO se diz que se apagou", async () => {
    dados.pedidoRebenta = true;
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    expect(r.falhou.join(" ")).toMatch(/o pedido em si/i);
  });

  it("nunca rebenta — devolve sempre o que conseguiu", async () => {
    // Um apagamento que estoira a meio deixa o sistema num estado que ninguém
    // consegue descrever.
    dados.contratosRebentam = true;
    dados.pedidoRebenta = true;
    dados.propostaQueFalha = "p1";
    await expect(apagarPedido("q1")).resolves.toBeTruthy();
  });
});

describe("P5: uma fatura também manda parar (registo fiscal, chave `set null`)", () => {
  it("um pedido com fatura não é apagado, e nada sai", async () => {
    dados.faturas = [{ id: "f1", quoteId: "q1" }];
    dados.propostas = [proposta("p1")];
    dados.tarefas = [{ id: "t1", quoteId: "q1" }];
    dados.fotos = [{ path: "q1/a.jpg" }];
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    expect(r.motivo).toBe("tem-fatura");
    expect(dados.apagadas).toEqual([]);
    expect(dados.tarefasApagadas).toEqual([]);
    expect(dados.removidas).toEqual([]);
    expect(dados.rascunhosLimpos).toEqual([]);
    expect(dados.pedidosApagados).toEqual([]);
  });

  it("sem conseguir ler as faturas, também não se apaga nada", async () => {
    dados.faturasRebentam = true;
    const r = await apagarPedido("q1");
    expect(r.apagado).toBe(false);
    expect(r.motivo).toBe("nao-verificado");
    expect(r.falhou).toContain("não consegui verificar se este pedido tem contrato ou faturas");
    expect(dados.pedidosApagados).toEqual([]);
    expect(dados.rascunhosLimpos).toEqual([]);
  });

  it("a fatura de OUTRO pedido não trava este", async () => {
    dados.faturas = [{ id: "f1", quoteId: "outro" }];
    expect((await apagarPedido("q1")).apagado).toBe(true);
  });
});

describe("um registo fiscal VISTO vale mais do que uma leitura falhada", () => {
  it("com um contrato visto e as faturas por ler, recusa pelo contrato", async () => {
    dados.contratos = [contrato("q1")];
    dados.faturasRebentam = true;
    const r = await apagarPedido("q1");
    expect(r.motivo).toBe("tem-contrato");
    expect(dados.pedidosApagados).toEqual([]);
  });
});

describe("P5: a fatura que vive no Moloni também manda parar", () => {
  it("um pedido com o sinal no Moloni não é apagado, e nada sai", async () => {
    dados.pedidos = new Map([
      ["q1", { id: "q1", faturasMoloni: { sinal: { em: "x", documentId: 7 } } }],
    ]);
    dados.propostas = [proposta("p1")];
    const r = await apagarPedido("q1");
    expect(r.motivo).toBe("tem-fatura");
    expect(dados.apagadas).toEqual([]);
    expect(dados.pedidosApagados).toEqual([]);
  });

  // Júri, 12.ª volta (18/11): a rota do Moloni põe a marca ANTES de lhe falar e
  // só a troca pelo documento DEPOIS de o rascunho lá existir. Se essa escrita
  // falha, a marca fica, velha e sem documento — e é o único rasto dele.
  it("a marca de «a ser criado», velha e sem documento, também manda parar", async () => {
    dados.pedidos.set("q1", {
      id: "q1",
      faturasMoloni: { saldo: { em: "x", aCriarDesde: "2026-01-01T00:00:00Z" } },
    });
    dados.propostas = [proposta("p1")];
    const r = await apagarPedido("q1");
    expect(r.motivo).toBe("tem-fatura");
    expect(dados.apagadas).toEqual([]);
    expect(dados.pedidosApagados).toEqual([]);
  });
});
