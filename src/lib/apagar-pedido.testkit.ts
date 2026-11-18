import { vi } from "vitest";
import type { Proposal, RascunhoNoMoloni } from "@/lib/orcamento/types";
import type { Contract } from "@/lib/contract-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MUNDO DE FAZ-DE-CONTA DO `apagar-pedido` — um só, para os dois ficheiros
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os testes do apagar vivem em dois ficheiros (a promessa, e as corridas que
 * nascem ou se perdem a meio), e os dois falam com as MESMAS lojas fingidas.
 * Cada ficheiro liga-as com `vi.mock(…, () => import("./apagar-pedido.testkit")
 * .then((k) => k.lojas.<loja>))` e chama {@link reporOMundo} no `beforeEach`.
 * As avarias provocam-se escrevendo em {@link dados}.
 */

interface Pedido {
  id: string;
  faturasMoloni?: Partial<Record<"sinal" | "saldo", RascunhoNoMoloni>>;
}

const mundoVazio = () => ({
  pedidos: new Map<string, Pedido>([["q1", { id: "q1" }]]),
  propostas: [] as Proposal[],
  contratos: [] as Contract[],
  faturas: [] as { id: string; quoteId: string }[],
  tarefas: [] as { id: string; quoteId?: string }[],
  fotos: [] as { path: string }[],
  /** As chaves de rascunho que existem (`draft:<chave>`): as quatro de `q1`. */
  estado: new Map<string, unknown>(
    ["q1", "q1--orcamento-linhas", "q1--sobreposto", "q1--orcamento-linhas--sobreposto"].map(
      (k) => [`draft:${k}`, { doc: {} }],
    ),
  ),
  // ── O que saiu ──
  apagadas: [] as string[],
  tarefasApagadas: [] as string[],
  removidas: [] as string[],
  rascunhosLimpos: [] as string[],
  pedidosApagados: [] as string[],
  leiturasDeContratos: 0,
  // ── As avarias que se querem provocar ──
  contratosRebentam: false,
  faturasRebentam: false,
  tarefasRebentam: false,
  pedidoRebenta: false,
  listagensDePropostasQueFalham: 0,
  propostaQueFalha: null as string | null,
  /** O servidor apaga-a; só a resposta se perde pelo caminho. */
  propostaQueApagaEFalha: null as string | null,
  tarefaQueFalha: null as string | null,
  fotoQueFalha: null as string | null,
});

export const dados = mundoVazio();

/** Volta ao mundo do início: o pedido `q1`, sem nada, e os quatro rascunhos dele. */
export function reporOMundo(): void {
  Object.assign(dados, mundoVazio());
}

/** As lojas fingidas, uma por módulo que o `apagar-pedido` usa. */
export const lojas = {
  quotes: {
    getQuote: async (id: string) => dados.pedidos.get(id) ?? null,
    deleteQuote: async (id: string) => {
      if (dados.pedidoRebenta) throw new Error("base em baixo");
      dados.pedidosApagados.push(id);
    },
  },
  proposals: {
    listProposalsForQuote: async (q: string) => {
      if (dados.listagensDePropostasQueFalham > 0) {
        dados.listagensDePropostasQueFalham--;
        throw new Error("base em baixo");
      }
      return dados.propostas.filter((p) => p.quoteId === q);
    },
    deleteProposal: async (id: string) => {
      if (dados.propostaQueApagaEFalha === id) {
        dados.propostas = dados.propostas.filter((p) => p.id !== id);
        throw new Error("resposta perdida");
      }
      if (dados.propostaQueFalha === id) throw new Error("recusado");
      dados.apagadas.push(id);
      dados.propostas = dados.propostas.filter((p) => p.id !== id);
    },
  },
  invoices: {
    listInvoicesForQuote: async (quoteId: string) => {
      if (dados.faturasRebentam) throw new Error("base em baixo");
      return dados.faturas.filter((f) => f.quoteId === quoteId);
    },
  },
  contracts: {
    listContractsForQuote: async (quoteId: string) => {
      if (dados.contratosRebentam) throw new Error("base em baixo");
      dados.leiturasDeContratos++;
      return dados.contratos.filter((c) => c.quoteId === quoteId);
    },
  },
  appState: {
    getState: async (k: string) => dados.estado.get(k) ?? null,
  },
  drafts: {
    draftKey: (k: string) => `draft:${k}`,
    clearProposalDraft: async (k: string) => {
      dados.rascunhosLimpos.push(k);
      return { gravado: true as const, duradouro: true as const, onde: "servidor" as const };
    },
  },
  storage: {
    PROPOSAL_BUCKET: "proposal-assets",
    listProposalImages: async () => dados.fotos,
    removeStoredObject: async (_bucket: string, path: string) => {
      if (dados.fotoQueFalha === path) throw new Error("recusado");
      dados.removidas.push(path);
    },
  },
  tasks: {
    listTasksForQuote: async (quoteId: string) => {
      if (dados.tarefasRebentam) throw new Error("base em baixo");
      return dados.tarefas.filter((t) => t.quoteId === quoteId);
    },
    deleteTask: async (id: string) => {
      if (dados.tarefaQueFalha === id) throw new Error("recusado");
      dados.tarefasApagadas.push(id);
      dados.tarefas = dados.tarefas.filter((t) => t.id !== id);
    },
  },
  logger: {
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  },
};

export function proposta(id: string, quoteId = "q1"): Proposal {
  return { id, quoteId, clientName: "Maria & Zé", clientEmail: "m@ex.pt" } as Proposal;
}

/** Um contrato com os campos que o tipo exige — o que importa é o `quoteId`. */
export function contrato(quoteId: string, status: Contract["status"] = "aceite"): Contract {
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

/**
 * Faz `acontece` no instante em que `lista` recebe o próximo elemento — é
 * assim que um teste põe outro ecrã a escrever A MEIO do apagar.
 */
export function aMeio(lista: string[], acontece: () => void): void {
  const original = lista.push.bind(lista);
  lista.push = (...itens: string[]) => {
    acontece();
    return original(...itens);
  };
}
