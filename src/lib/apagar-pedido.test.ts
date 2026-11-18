import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Proposal } from "@/lib/orcamento/types";
import type { Contract } from "@/lib/contract-types";

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

const dados = vi.hoisted(() => ({
  pedidos: new Map<string, { id: string }>(),
  propostas: [] as Proposal[],
  contratos: [] as Contract[],
  fotos: [] as { path: string }[],
  apagadas: [] as string[],
  removidas: [] as string[],
  rascunhosLimpos: [] as string[],
  pedidosApagados: [] as string[],
  /** As avarias que se querem provocar. */
  contratosRebentam: false,
  propostaQueFalha: null as string | null,
  fotoQueFalha: null as string | null,
  pedidoRebenta: false,
  tarefas: [] as { id: string; quoteId?: string }[],
  tarefasApagadas: [] as string[],
  tarefasRebentam: false,
  leiturasDeContratos: 0,
  faturas: [] as { id: string; quoteId: string }[],
  faturasRebentam: false,
  tarefaQueFalha: null as string | null,
  /** As chaves de rascunho que existem (`draft:<chave>`). */
  estado: new Map<string, unknown>(),
}));

vi.mock("@/lib/quotes-store", () => ({
  getQuote: async (id: string) => dados.pedidos.get(id) ?? null,
  deleteQuote: async (id: string) => {
    if (dados.pedidoRebenta) throw new Error("base em baixo");
    dados.pedidosApagados.push(id);
  },
}));
vi.mock("@/lib/proposals-store", () => ({
  listProposalsForQuote: async (q: string) => dados.propostas.filter((p) => p.quoteId === q),
  deleteProposal: async (id: string) => {
    if (dados.propostaQueFalha === id) throw new Error("recusado");
    dados.apagadas.push(id);
    dados.propostas = dados.propostas.filter((p) => p.id !== id);
  },
}));
vi.mock("@/lib/invoices-store", () => ({
  listInvoicesForQuote: async (quoteId: string) => {
    if (dados.faturasRebentam) throw new Error("base em baixo");
    return dados.faturas.filter((f) => f.quoteId === quoteId);
  },
}));
vi.mock("@/lib/contracts-store", () => ({
  listContractsForQuote: async (quoteId: string) => {
    if (dados.contratosRebentam) throw new Error("base em baixo");
    dados.leiturasDeContratos++;
    return dados.contratos.filter((c) => c.quoteId === quoteId);
  },
}));
vi.mock("@/lib/app-state", () => ({
  getState: async (k: string) => dados.estado.get(k) ?? null,
}));
vi.mock("@/lib/proposal-drafts", () => ({
  draftKey: (k: string) => `draft:${k}`,
  clearProposalDraft: async (k: string) => {
    dados.rascunhosLimpos.push(k);
    return { gravado: true as const, duradouro: true as const, onde: "servidor" as const };
  },
}));
vi.mock("@/lib/proposal-storage", () => ({
  PROPOSAL_BUCKET: "proposal-assets",
  listProposalImages: async () => dados.fotos,
  removeStoredObject: async (_b: string, path: string) => {
    if (dados.fotoQueFalha === path) throw new Error("recusado");
    dados.removidas.push(path);
  },
}));
vi.mock("@/lib/tasks-store", () => ({
  listTasksForQuote: async (quoteId: string) => {
    if (dados.tarefasRebentam) throw new Error("base em baixo");
    return dados.tarefas.filter((t) => t.quoteId === quoteId);
  },
  deleteTask: async (id: string) => {
    if (dados.tarefaQueFalha === id) throw new Error("recusado");
    dados.tarefasApagadas.push(id);
    dados.tarefas = dados.tarefas.filter((t) => t.id !== id);
  },
}));
vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const { apagarPedidoSemContrato } = await import("./apagar-pedido");

function proposta(id: string, quoteId = "q1"): Proposal {
  return { id, quoteId, clientName: "Maria & Zé", clientEmail: "m@ex.pt" } as Proposal;
}

/** Um contrato com os campos que o tipo exige — o que importa é o `quoteId`. */
function contrato(quoteId: string, status: Contract["status"] = "aceite"): Contract {
  return {
    id: `c-${quoteId}-${status}`,
    quoteId,
    proposalId: "p1",
    clientName: "Maria & Zé",
    clientEmail: "m@ex.pt",
    termsVersion: "2026-01",
    status,
  } as Contract;
}

beforeEach(() => {
  dados.pedidos = new Map([["q1", { id: "q1" }]]);
  dados.propostas = [];
  dados.contratos = [];
  dados.fotos = [];
  dados.apagadas = [];
  dados.removidas = [];
  dados.rascunhosLimpos = [];
  dados.estado = new Map(
    ["q1", "q1--orcamento-linhas", "q1--sobreposto", "q1--orcamento-linhas--sobreposto"].map(
      (k) => [`draft:${k}`, { doc: {} }],
    ),
  );
  dados.pedidosApagados = [];
  dados.contratosRebentam = false;
  dados.propostaQueFalha = null;
  dados.fotoQueFalha = null;
  dados.pedidoRebenta = false;
  dados.tarefas = [];
  dados.tarefasApagadas = [];
  dados.tarefasRebentam = false;
  dados.leiturasDeContratos = 0;
  dados.faturas = [];
  dados.faturasRebentam = false;
  dados.tarefaQueFalha = null;
});

describe("apagar um pedido sem contrato", () => {
  it("LEVA AS PROPOSTAS ATRÁS — é a promessa que estava por cumprir", async () => {
    /**
     * O defeito, por extenso: as propostas guardam `clientName`, `clientEmail`
     * e o documento inteiro. Com `on delete set null`, apagar o pedido
     * desligava-as em vez de as apagar, e elas ficavam lá com tudo dentro.
     */
    dados.propostas = [proposta("p1"), proposta("p2"), proposta("p3", "outro")];
    const r = await apagarPedidoSemContrato("q1");
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
    const r = await apagarPedidoSemContrato("q1");
    expect(dados.tarefasApagadas.sort()).toEqual(["t1", "t4"]);
    expect(r.contou.tarefas).toBe(2);
  });

  it("leva as fotografias carregadas para aquele pedido", async () => {
    dados.fotos = [{ path: "q1/a.jpg" }, { path: "q1/b.jpg" }];
    const r = await apagarPedidoSemContrato("q1");
    expect(dados.removidas.sort()).toEqual(["q1/a.jpg", "q1/b.jpg"]);
    expect(r.contou.fotos).toBe(2);
  });

  it("limpa o rascunho do estúdio E as gavetas de resgate", async () => {
    // Um rascunho esquecido tem lá dentro o mesmo documento que a proposta
    // tinha — e as gavetas de resgate guardam versões inteiras por cima.
    await apagarPedidoSemContrato("q1");
    expect(dados.rascunhosLimpos).toEqual([
      "q1",
      "q1--orcamento-linhas",
      "q1--sobreposto",
      "q1--orcamento-linhas--sobreposto",
    ]);
  });

  it("um rascunho que não existe não se «apaga» nem se conta (revisão 13/11, n.º 3)", async () => {
    dados.estado = new Map([["draft:q1", { doc: {} }]]);
    const r = await apagarPedidoSemContrato("q1");
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
    await apagarPedidoSemContrato("q1");
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
    const r = await apagarPedidoSemContrato("q1");
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
    expect((await apagarPedidoSemContrato("q1")).motivo).toBe("tem-contrato");
  });

  it("NÃO SABER se há contrato conta como haver", async () => {
    /**
     * Não saber não é o mesmo que saber que não há, e aqui a diferença é entre
     * cumprir uma política e destruir contabilidade.
     */
    dados.contratosRebentam = true;
    dados.propostas = [proposta("p1")];
    const r = await apagarPedidoSemContrato("q1");
    expect(r.apagado).toBe(false);
    expect(dados.apagadas).toEqual([]);
    expect(r.falhou.join(" ")).toMatch(/não consegui verificar/i);
    expect(r.motivo).toBe("tem-contrato");
  });

  it("um pedido que não existe diz que não existe", async () => {
    expect((await apagarPedidoSemContrato("nao-ha")).motivo).toBe("nao-existe");
  });

  it("um contrato de OUTRO pedido não impede nada", async () => {
    dados.contratos = [contrato("outro")];
    expect((await apagarPedidoSemContrato("q1")).apagado).toBe(true);
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
    const r = await apagarPedidoSemContrato("q1");
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
    const r = await apagarPedidoSemContrato("q1");
    expect(r.contou.fotos).toBe(1);
    expect(r.falhou.join(" ")).toContain("q1/b.jpg");
  });

  it("se o pedido em si não sair, NÃO se diz que se apagou", async () => {
    dados.pedidoRebenta = true;
    const r = await apagarPedidoSemContrato("q1");
    expect(r.apagado).toBe(false);
    expect(r.falhou.join(" ")).toMatch(/o pedido em si/i);
  });

  it("nunca rebenta — devolve sempre o que conseguiu", async () => {
    // Um apagamento que estoira a meio deixa o sistema num estado que ninguém
    // consegue descrever.
    dados.contratosRebentam = true;
    dados.pedidoRebenta = true;
    dados.propostaQueFalha = "p1";
    await expect(apagarPedidoSemContrato("q1")).resolves.toBeTruthy();
  });
});

describe("P5: as tarefas caem em cascata com o pedido", () => {
  it("uma tarefa que não saiu faz o pedido ficar — a cascata levava-a sem ninguém saber", async () => {
    dados.tarefas = [
      { id: "t1", quoteId: "q1" },
      { id: "t2", quoteId: "q1" },
    ];
    dados.tarefaQueFalha = "t2";
    const r = await apagarPedidoSemContrato("q1");
    expect(r.apagado).toBe(false);
    expect(dados.pedidosApagados).toEqual([]);
    expect(r.saiu.tarefas).toEqual(["t1"]);
    expect(r.falhou).toContain("a tarefa t2 não foi apagada");
  });

  it("e pára ANTES de apagar propostas, fotografias e rascunhos — nada fica a meio", async () => {
    dados.propostas = [proposta("p1")];
    dados.fotos = [{ path: "q1/a.jpg" }];
    dados.tarefasRebentam = true;
    const r = await apagarPedidoSemContrato("q1");
    expect(r.apagado).toBe(false);
    expect(dados.apagadas).toEqual([]);
    expect(dados.removidas).toEqual([]);
    expect(dados.rascunhosLimpos).toEqual([]);
  });

  it("sem conseguir listar as tarefas, o pedido também fica", async () => {
    dados.tarefasRebentam = true;
    const r = await apagarPedidoSemContrato("q1");
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
    const original = dados.removidas.push.bind(dados.removidas);
    dados.removidas.push = (...p: string[]) => {
      dados.tarefas = [...dados.tarefas, { id: "t-nova", quoteId: "q1" }];
      return original(...p);
    };
    const r = await apagarPedidoSemContrato("q1");
    expect(r.apagado).toBe(false);
    expect(dados.pedidosApagados).toEqual([]);
    expect(r.falhou).toContain("apareceram 1 tarefa(s) novas neste pedido");
  });
});

describe("P5: um contrato que nasce a meio do apagar", () => {
  it("faz o pedido ficar — a chave do contrato é `set null` e o pedido saía sem ele", async () => {
    dados.fotos = [{ path: "q1/a.jpg" }];
    const original = dados.removidas.push.bind(dados.removidas);
    dados.removidas.push = (...p: string[]) => {
      // Um aceite noutro ecrã enquanto as fotografias saem.
      dados.contratos = [...dados.contratos, contrato("q1")];
      return original(...p);
    };
    const r = await apagarPedidoSemContrato("q1");
    expect(r.apagado).toBe(false);
    // Sem motivo de recusa: já saiu coisa, e a Reciclagem tem de o guardar
    // (um motivo diria «nada saiu» e ela deitava fora a única cópia).
    expect(r.motivo).toBeUndefined();
    expect(r.falhou).toContain("nasceu um contrato neste pedido enquanto se apagava");
    expect(dados.pedidosApagados).toEqual([]);
    expect(dados.leiturasDeContratos).toBe(2);
  });
});

describe("P5: uma fatura também manda parar (registo fiscal, chave `set null`)", () => {
  it("um pedido com fatura não é apagado, e nada sai", async () => {
    dados.faturas = [{ id: "f1", quoteId: "q1" }];
    dados.propostas = [proposta("p1")];
    dados.tarefas = [{ id: "t1", quoteId: "q1" }];
    dados.fotos = [{ path: "q1/a.jpg" }];
    const r = await apagarPedidoSemContrato("q1");
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
    const r = await apagarPedidoSemContrato("q1");
    expect(r.apagado).toBe(false);
    // Recusa-se pela FATURA (o registo que não se pôde ver), não pelo contrato.
    expect(r.motivo).toBe("tem-fatura");
    expect(r.falhou).toContain("não consegui verificar se este pedido tem faturas");
    expect(dados.pedidosApagados).toEqual([]);
    expect(dados.rascunhosLimpos).toEqual([]);
  });

  it("a fatura de OUTRO pedido não trava este", async () => {
    dados.faturas = [{ id: "f1", quoteId: "outro" }];
    expect((await apagarPedidoSemContrato("q1")).apagado).toBe(true);
  });
});

describe("P5: uma proposta que nasce a meio pára antes das fotografias", () => {
  it("o pedido, as fotografias e os rascunhos ficam", async () => {
    dados.propostas = [proposta("p1")];
    dados.fotos = [{ path: "q1/a.jpg" }];
    const original = dados.apagadas.push.bind(dados.apagadas);
    dados.apagadas.push = (...p: string[]) => {
      // Enquanto p1 sai, noutro ecrã nasce outra proposta para este pedido.
      dados.propostas = [...dados.propostas, proposta("p-nova")];
      return original(...p);
    };
    const r = await apagarPedidoSemContrato("q1");
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
    const original = dados.removidas.push.bind(dados.removidas);
    dados.removidas.push = (...p: string[]) => {
      // O Moloni grava uma fatura enquanto as fotografias saem.
      dados.faturas = [...dados.faturas, { id: "f1", quoteId: "q1" }];
      return original(...p);
    };
    const r = await apagarPedidoSemContrato("q1");
    expect(r.apagado).toBe(false);
    expect(r.motivo).toBeUndefined();
    expect(dados.pedidosApagados).toEqual([]);
    expect(r.falhou).toContain("nasceu uma fatura neste pedido enquanto se apagava");
  });
});
