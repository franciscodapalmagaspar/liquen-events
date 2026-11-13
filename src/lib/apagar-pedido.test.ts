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
  },
}));
vi.mock("@/lib/contracts-store", () => ({
  listContracts: async () => {
    if (dados.contratosRebentam) throw new Error("base em baixo");
    return dados.contratos;
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
  listTasks: async () => dados.tarefas,
  deleteTask: async (id: string) => {
    dados.tarefasApagadas.push(id);
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
    // E o resto continua: uma falha não pode travar o apagamento inteiro.
    expect(r.apagado).toBe(true);
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
