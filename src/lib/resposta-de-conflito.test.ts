import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { ConflictError, MENSAGEM_DE_CONFLITO } from "./repository";
import {
  LIGACOES_AO_PEDIDO,
  respostaDeConflito,
  respostaDeEscritaRecusada,
  respostaDeLigacaoQueJaSaiu,
  respostaDeMigracaoEmFalta,
} from "./resposta-de-conflito";

/**
 * Uma colisão não pode acabar em silêncio NEM em erro cru.
 *
 * O silêncio já foi tratado do lado da gravação (o `touch` dos mappers). Falta
 * a outra metade: quando a repetição do `updateWith` não resolve, o
 * `ConflictError` sobe até à rota — e uma rota que o apanhe no `catch` genérico
 * responde 500 "Erro interno". Para quem está do outro lado isso é indistinto
 * de uma avaria: ela tenta outra vez, e à segunda a gravação passa e apaga
 * mesmo o trabalho da colega. O 500 não só não explica como CONVIDA ao erro.
 */

describe("respostaDeConflito", () => {
  it("devolve null para o que não é conflito — o catch de topo continua dono do resto", () => {
    expect(respostaDeConflito(new Error("qualquer avaria"))).toBeNull();
    expect(respostaDeConflito(null)).toBeNull();
  });

  it("responde 409 com uma frase dizível e a versão do servidor ao lado da da pessoa", async () => {
    const err = new ConflictError("p1", {
      table: "proposals",
      current: { id: "p1", status: "aceite", followUpNote: "Aceitaram ao telefone" },
      attempted: { id: "p1", status: "enviada", followUpNote: "Falta confirmar" },
    });
    const res = respostaDeConflito(err);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(409);

    const corpo = await res!.json();
    expect(corpo.error).toBe(MENSAGEM_DE_CONFLITO);
    // A versão do servidor, para o ecrã poder mostrar as duas lado a lado —
    // o mesmo contrato que `/api/visao-geral` já cumpre com o StaleWriteError.
    expect(corpo.current).toEqual({
      id: "p1",
      status: "aceite",
      followUpNote: "Aceitaram ao telefone",
    });
    // E o que a pessoa estava a gravar volta com a resposta: recusar a escrita
    // não pode ser o sítio onde o trabalho dela desaparece.
    expect(corpo.submetido).toEqual({
      id: "p1",
      status: "enviada",
      followUpNote: "Falta confirmar",
    });
  });
});

describe("respostaDeMigracaoEmFalta", () => {
  it("a coluna que ainda não existe é uma instalação por acabar, não uma avaria", async () => {
    // O que o Postgres/PostgREST devolve quando o `db/schema.sql` novo ainda
    // não foi corrido e a escrita tenta gravar `updated_at`.
    const err = Object.assign(new Error("column proposals.updated_at does not exist"), {
      code: "42703",
    });
    const res = respostaDeMigracaoEmFalta(err, "As propostas");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    const corpo = await res!.json();
    // A frase tem de conter a resolução, não só o sintoma.
    expect(corpo.error).toMatch(/db\/schema\.sql/);
    expect(corpo.error).toMatch(/As propostas/);
  });

  it("devolve null para tudo o resto", () => {
    expect(respostaDeMigracaoEmFalta(new Error("timeout"), "As propostas")).toBeNull();
  });
});

// ── A rota que trata do dinheiro é a que não pode falhar isto ─────────────
//
// Era a de `/api/faturas/[id]`, que saiu com a facturação. A proposta é hoje o
// documento do dinheiro com mais donos ao mesmo tempo (o Estúdio a gravar, esta
// rota a mudar o estado, o portal do cliente a registar o aceite) — é nela que
// uma colisão mal respondida custa mais caro, e é ela que passa a garantir o
// contrato: 409 com as duas versões, 503 com a resolução, nunca 500.
const authed = vi.hoisted(() => ({ ok: true }));
const store = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/proposals-store", async () => {
  const real = await vi.importActual<typeof import("./proposals-store")>("./proposals-store");
  return { ...real, updateProposal: store.update, deleteProposal: vi.fn() };
});

beforeEach(() => {
  authed.ok = true;
  vi.clearAllMocks();
});

describe("/api/propostas/[id] PATCH numa colisão", () => {
  it("responde 409 com as duas versões, não 500 «Erro interno»", async () => {
    const { PATCH } = await import("@/app/api/propostas/[id]/route");

    const noServidor: Record<string, unknown> = {
      id: "p1",
      quoteId: "Q1",
      clientName: "Ana",
      clientEmail: "a@x.pt",
      total: 300,
      status: "aceite",
      respondedAt: "2026-01-02T10:00:00.000Z",
    };
    store.update.mockRejectedValue(
      new ConflictError("p1", {
        table: "proposals",
        current: noServidor,
        attempted: { ...noServidor, status: "enviada", followUpNote: "nota nova" },
      }),
    );

    const req = new Request("https://liquen.test/api/propostas/p1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followUpNote: "nota nova" }),
    }) as unknown as NextRequest;

    const res = await PATCH(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(409);
    const corpo = await res.json();
    expect(corpo.error).toMatch(/outra pessoa/i);
    expect(corpo.current.status).toBe("aceite");
    expect(corpo.submetido.followUpNote).toBe("nota nova");
  });

  it("com o db/schema.sql por correr responde 503 com a resolução, não 500", async () => {
    const { PATCH } = await import("@/app/api/propostas/[id]/route");
    store.update.mockRejectedValue(
      Object.assign(new Error("column proposals.updated_at does not exist"), { code: "42703" }),
    );

    const req = new Request("https://liquen.test/api/propostas/p1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followUpNote: "nota" }),
    }) as unknown as NextRequest;

    const res = await PATCH(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/db\/schema\.sql/);
  });
});

describe("respostaDeLigacaoQueJaSaiu (P5)", () => {
  const ligacaoQueSaiu = {
    code: "23503",
    message:
      'insert or update on table "tasks" violates foreign key constraint "tasks_quote_id_fkey"',
  };

  it("uma escrita para um pedido que saiu é 404 «Não encontrado», não avaria nem «volta a aplicar»", async () => {
    const r = respostaDeLigacaoQueJaSaiu(ligacaoQueSaiu);
    expect(r?.status).toBe(404);
    expect((await r!.json()).error).toBe("Não encontrado");
  });

  it("a `respostaDeEscritaRecusada` (a das rotas) reconhece-a; a de conflito, sozinha, não", () => {
    expect(respostaDeEscritaRecusada(ligacaoQueSaiu)?.status).toBe(404);
    expect(respostaDeConflito(ligacaoQueSaiu)).toBeNull();
  });

  // Júri de 18/11 (J4): pelo código e pelo NOME da restrição, não pela frase.
  it("reconhece-se pelo nome da restrição, em qualquer língua, e também nos detalhes", () => {
    expect(
      respostaDeLigacaoQueJaSaiu({
        code: "23503",
        message: 'inserção na tabela "tasks" viola a restrição "tasks_quote_id_fkey"',
      })?.status,
    ).toBe(404);
    expect(
      respostaDeLigacaoQueJaSaiu({
        code: "23503",
        message: "violação",
        details: 'Key (quote_id)=(Q) is not present — constraint "contracts_quote_id_fkey"',
      })?.status,
    ).toBe(404);
  });

  it("uma 23503 noutra chave estrangeira não é «o pedido saiu»", () => {
    expect(
      respostaDeLigacaoQueJaSaiu({
        code: "23503",
        message:
          'insert or update on table "event_material_items" violates foreign key constraint "event_material_items_material_id_fkey"',
      }),
    ).toBeNull();
  });

  it("as três chaves do P5 existem no db/schema.sql com estes nomes", async () => {
    const fs = await import("node:fs/promises");
    const schema = await fs.readFile(`${process.cwd()}/db/schema.sql`, "utf8");
    for (const nome of [
      "tasks_quote_id_fkey",
      "invoices_quote_id_fkey",
      "contracts_quote_id_fkey",
    ]) {
      expect(LIGACOES_AO_PEDIDO.has(nome)).toBe(true);
      expect(schema).toContain(`'${nome}'`);
    }
  });

  it("um apagar recusado por um filho (23503 no delete) não é isto, nem os outros erros", () => {
    expect(
      respostaDeLigacaoQueJaSaiu({
        code: "23503",
        message: 'update or delete on table "x" violates',
      }),
    ).toBeNull();
    expect(respostaDeLigacaoQueJaSaiu(new Error("rede"))).toBeNull();
    expect(respostaDeLigacaoQueJaSaiu({ code: "23505" })).toBeNull();
    expect(respostaDeLigacaoQueJaSaiu(null)).toBeNull();
  });
});
