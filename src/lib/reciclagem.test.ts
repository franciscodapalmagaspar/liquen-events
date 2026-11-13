import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A RECICLAGEM, DE PONTA A PONTA, NO BACKEND DE FICHEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Fase R3 de `docs/TUDO-REVERSIVEL.md` («Reciclagem 30 dias»). Corre sobre os
 * stores verdadeiros, num `data/` temporário — o mesmo caminho que o servidor
 * local usa sem Supabase. O que se prende:
 *
 *  1. apagar tira a coisa e deixa-a na Reciclagem;
 *  2. «Repor» volta com o MESMO id, e a entrada sai;
 *  3. se já existe outra vez com aquele id, não se pisa — 409;
 *  4. um item de material volta com as suas regras, sem as duplicar;
 *  5. uma lista volta com as suas linhas;
 *  6. a limpeza dos 30 dias tira só o que passou do prazo;
 *  7. (R3b) um pedido volta com as propostas, os rascunhos e o material — e
 *     com a data em que chegou; uma proposta só volta para um pedido que
 *     exista; um tema não volta por cima de outro com o mesmo nome.
 */

let dir: string;
let cwdSpy: { mockRestore(): void };

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "reciclagem-"));
  await fs.mkdir(path.join(dir, "data"), { recursive: true });
  cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(dir);
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.resetModules();
});

afterEach(async () => {
  cwdSpy.mockRestore();
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
});

async function carregar() {
  const reciclagem = await import("./reciclagem");
  const tarefas = await import("./tasks-store");
  const material = await import("./material-store");
  const regras = await import("./material-rules-store");
  const listas = await import("./material-lists-store");
  const linhas = await import("./material-list-items-store");
  const store = await import("./reciclagem-store");
  return { reciclagem, tarefas, material, regras, listas, linhas, store };
}

describe("Reciclagem — tarefas", () => {
  it("apagar deixa-a na Reciclagem, e «Repor» volta com o mesmo id", async () => {
    const { reciclagem, tarefas, store } = await carregar();
    const t = await tarefas.createTask({ title: "TESTE Confirmar a tenda", priority: "normal" });

    const r = await reciclagem.enviarParaAReciclagem("tarefa", t.id, "Catarina");
    expect(r).toEqual({ id: expect.any(String) });
    expect(await tarefas.obterTarefa(t.id)).toBeNull();

    const [entrada] = await store.listarReciclagem();
    expect(entrada).toMatchObject({
      tipo: "tarefa",
      rotulo: "TESTE Confirmar a tenda",
      origemId: t.id,
      apagadoPor: "Catarina",
    });

    await reciclagem.reporDaReciclagem(entrada.id);
    expect(await tarefas.obterTarefa(t.id)).toMatchObject({ id: t.id, title: t.title });
    expect(await store.listarReciclagem()).toEqual([]);
  });

  it("se já existe outra vez com o mesmo id, não repõe por cima — 409", async () => {
    const { reciclagem, tarefas, store } = await carregar();
    const t = await tarefas.createTask({ title: "TESTE Reservar carrinha", priority: "normal" });
    await reciclagem.enviarParaAReciclagem("tarefa", t.id);
    await tarefas.reporTarefa({ ...t, title: "Outra coisa" });

    const [entrada] = await store.listarReciclagem();
    await expect(reciclagem.reporDaReciclagem(entrada.id)).rejects.toMatchObject({
      status: 409,
    });
    expect((await tarefas.obterTarefa(t.id))?.title).toBe("Outra coisa");
    // A entrada fica: pode ser apagada de vez, ou reposta depois.
    expect(await store.listarReciclagem()).toHaveLength(1);
  });

  it("apagar o que já não existe responde `null`, sem entrada nenhuma", async () => {
    const { reciclagem, store } = await carregar();
    expect(await reciclagem.enviarParaAReciclagem("tarefa", "nao-existe")).toBeNull();
    expect(await store.listarReciclagem()).toEqual([]);
  });

  it("«Apagar de vez» tira a entrada; uma segunda vez diz que já não está lá", async () => {
    const { reciclagem, tarefas, store } = await carregar();
    const t = await tarefas.createTask({ title: "TESTE Levar extensões", priority: "baixa" });
    await reciclagem.enviarParaAReciclagem("tarefa", t.id);
    const [entrada] = await store.listarReciclagem();
    expect(await reciclagem.apagarDeVez(entrada.id)).toBe(true);
    expect(await reciclagem.apagarDeVez(entrada.id)).toBe(false);
    await expect(reciclagem.reporDaReciclagem(entrada.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("Reciclagem — material", () => {
  it("um item volta com as regras que apontavam para ele, sem as duplicar", async () => {
    const { reciclagem, material, regras, store } = await carregar();
    const item = await material.createMaterial({
      name: "TESTE Escadote",
      category: "Ferramentas",
      kind: "reutilizavel",
      unit: "un",
      stock: 2,
    });
    const regra = await regras.createRule({
      name: "TESTE leva escadote",
      enabled: true,
      matchKind: "sempre",
      action: "add_item",
      itemId: item.id,
      qty: 1,
      position: 0,
    });

    await reciclagem.enviarParaAReciclagem("material", item.id);
    const [entrada] = await store.listarReciclagem();
    expect((entrada.retrato.regras as { id: string }[]).map((r) => r.id)).toEqual([regra.id]);

    // No Supabase a regra cai em cascata; aqui fica. Simula-se a cascata:
    await regras.deleteRule(regra.id);

    await reciclagem.reporDaReciclagem(entrada.id);
    expect(await material.getMaterial(item.id)).toMatchObject({ id: item.id });
    const todas = (await regras.listRules()).filter((r) => r.itemId === item.id);
    expect(todas.map((r) => r.id)).toEqual([regra.id]);
  });

  it("um item cuja regra NÃO caiu (ficheiro local) volta sem a duplicar", async () => {
    const { reciclagem, material, regras, store } = await carregar();
    const item = await material.createMaterial({
      name: "TESTE Fita-cola",
      category: "Consumíveis",
      kind: "consumivel",
      unit: "rolo",
      stock: 5,
    });
    await regras.createRule({
      name: "TESTE fita",
      enabled: true,
      matchKind: "sempre",
      action: "add_item",
      itemId: item.id,
      position: 0,
    });
    await reciclagem.enviarParaAReciclagem("material", item.id);
    const [entrada] = await store.listarReciclagem();
    await reciclagem.reporDaReciclagem(entrada.id);
    expect((await regras.listRules()).filter((r) => r.itemId === item.id)).toHaveLength(1);
  });

  it("uma lista volta com as suas linhas, com os mesmos ids", async () => {
    const { reciclagem, material, listas, linhas, store } = await carregar();
    const item = await material.createMaterial({
      name: "TESTE Abraçadeiras",
      category: "Fixação",
      kind: "consumivel",
      unit: "un",
      stock: 100,
    });
    const lista = await listas.createList({ name: "TESTE Estrutura", isDefault: false });
    const linha = await linhas.addListItem({
      listId: lista.id,
      itemId: item.id,
      qty: 4,
      critical: false,
      position: 0,
    } as Parameters<typeof linhas.addListItem>[0]);

    await reciclagem.enviarParaAReciclagem("lista", lista.id);
    expect(await listas.getList(lista.id)).toBeNull();
    expect(await linhas.listItemsOf(lista.id)).toEqual([]);

    const [entrada] = await store.listarReciclagem();
    await reciclagem.reporDaReciclagem(entrada.id);
    expect(await listas.getList(lista.id)).toMatchObject({ id: lista.id });
    expect((await linhas.listItemsOf(lista.id)).map((l) => l.id)).toEqual([linha.id]);
  });

  it("uma lista cujo item foi apagado entretanto não volta, e diz porquê", async () => {
    const { reciclagem, material, listas, linhas, store } = await carregar();
    const item = await material.createMaterial({
      name: "TESTE Escadote",
      category: "Ferramentas",
      kind: "reutilizavel",
      unit: "un",
      stock: 1,
    });
    const lista = await listas.createList({ name: "TESTE Montagem", isDefault: false });
    await linhas.addListItem({
      listId: lista.id,
      itemId: item.id,
      qty: 1,
      critical: true,
      position: 0,
    } as Parameters<typeof linhas.addListItem>[0]);
    await reciclagem.enviarParaAReciclagem("lista", lista.id);
    await material.deleteMaterial(item.id);

    const entrada = (await store.listarReciclagem()).find((e) => e.tipo === "lista")!;
    await expect(reciclagem.reporDaReciclagem(entrada.id)).rejects.toThrow(
      /já não está no catálogo/,
    );
  });
});

describe("Reciclagem — a limpeza dos 30 dias", () => {
  it("tira só o que passou do prazo", async () => {
    const { reciclagem, store } = await carregar();
    const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    const base = { tipo: "tarefa", rotulo: "x", origemId: "o", retrato: {}, ficheiros: [] };
    await store.guardarNaReciclagem({ ...base, id: "velha", apagadoEm: dias(31) });
    await store.guardarNaReciclagem({ ...base, id: "no-limite", apagadoEm: dias(29) });
    await store.guardarNaReciclagem({ ...base, id: "nova", apagadoEm: dias(1) });

    expect(await reciclagem.limparExpiradas()).toEqual({ apagadas: 1, ficaram: 0 });
    expect((await store.listarReciclagem()).map((e) => e.id).sort()).toEqual(["no-limite", "nova"]);
  });

  it("a lista para o ecrã diz o tipo por extenso e o dia em que sai", async () => {
    const { reciclagem, tarefas } = await carregar();
    const t = await tarefas.createTask({ title: "TESTE Ligar ao florista", priority: "normal" });
    await reciclagem.enviarParaAReciclagem("tarefa", t.id);
    const [linha] = await reciclagem.oQueEstaNaReciclagem();
    expect(linha.tipoNome).toBe("Tarefa");
    const dias =
      (new Date(linha.saiEm).getTime() - new Date(linha.apagadoEm).getTime()) / 86_400_000;
    expect(dias).toBe(30);
    expect(linha).not.toHaveProperty("retrato");
  });
});

// ── R3b: pedido, proposta e tema (no ficheiro local; o Storage não entra) ──

async function carregarR3b() {
  const base = await carregar();
  const pedidos = await import("./quotes-store");
  const propostas = await import("./proposals-store");
  const estado = await import("./app-state");
  const rascunhos = await import("./proposal-drafts");
  const material = await import("./event-material-store");
  const itens = await import("./event-material-items-store");
  const registo = await import("./event-material-log-store");
  const temas = await import("./themes-store");
  const contratos = await import("./contracts-store");
  const tarefas = await import("./tasks-store");
  return {
    ...base,
    pedidos,
    propostas,
    estado,
    rascunhos,
    eventos: material,
    itens,
    registo,
    temas,
    contratos,
    tarefas,
  };
}

const UM_PEDIDO = {
  id: "LIQ-TESTE-1",
  name: "TESTE Mãe da noiva",
  partnerA: "TESTE Ana",
  partnerB: "TESTE Rui",
  email: "teste@exemplo.pt",
  submittedAt: "2026-03-02T10:00:00.000Z",
  status: "pendente",
  priceBreakdown: {},
} as unknown as import("./orcamento/types").Quote;

const umaProposta = (id: string, quoteId: string) =>
  ({
    id,
    quoteId,
    clientName: "TESTE Ana e Rui",
    clientEmail: "teste@exemplo.pt",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 0,
    vat: 0,
    total: 0,
    status: "enviada",
    createdAt: "2026-03-05T10:00:00.000Z",
  }) as import("./orcamento/types").Proposal;

describe("Reciclagem — pedido (R3b)", () => {
  it("volta com as propostas, os rascunhos e o material, com os mesmos ids e datas", async () => {
    const r = await carregarR3b();
    await r.pedidos.createQuote(UM_PEDIDO);
    await r.propostas.createProposal(umaProposta("P-TESTE-1", UM_PEDIDO.id));
    await r.estado.setState(r.rascunhos.draftKey(UM_PEDIDO.id), { doc: { titulo: "TESTE" } });
    const ev = await r.eventos.createEventMaterial({
      quoteId: UM_PEDIDO.id,
      status: "preparada",
      vehicles: [],
    });
    const linha = await r.itens.addEventItem({
      eventId: ev.id,
      name: "TESTE Velas",
      category: "Luz",
      kind: "consumivel",
      qty: 10,
      critical: false,
      origin: "manual",
      originLabel: "À mão",
      missing: false,
    } as Parameters<typeof r.itens.addEventItem>[0]);
    const marca = await r.registo.registar({
      eventId: ev.id,
      itemId: linha.id,
      action: "loaded",
      actor: "TESTE",
      markedAt: "2026-03-06T08:00:00.000Z",
      superseded: false,
    } as Parameters<typeof r.registo.registar>[0]);

    const res = await r.reciclagem.enviarComDetalhe("pedido", UM_PEDIDO.id, "Catarina");
    expect(res.reciclagem).toEqual({ id: expect.any(String) });
    expect(await r.pedidos.getQuote(UM_PEDIDO.id)).toBeNull();
    expect(await r.propostas.getProposal("P-TESTE-1")).toBeNull();
    expect(await r.estado.getState(r.rascunhos.draftKey(UM_PEDIDO.id))).toBeNull();
    const [entrada] = await r.store.listarReciclagem();
    expect(entrada).toMatchObject({ tipo: "pedido", rotulo: "TESTE Ana e TESTE Rui" });

    // No Supabase o material cai em cascata; no ficheiro local fica. Simula-se.
    await r.registo.listLogOf(ev.id);
    await r.itens.removeItemsOfEvent(ev.id);
    await r.eventos.deleteEventMaterial(ev.id);

    await r.reciclagem.reporDaReciclagem(entrada.id);
    expect(await r.pedidos.getQuote(UM_PEDIDO.id)).toMatchObject({
      id: UM_PEDIDO.id,
      submittedAt: UM_PEDIDO.submittedAt,
    });
    expect(await r.propostas.getProposal("P-TESTE-1")).toMatchObject({
      createdAt: "2026-03-05T10:00:00.000Z",
    });
    expect(await r.estado.getState(r.rascunhos.draftKey(UM_PEDIDO.id))).toEqual({
      doc: { titulo: "TESTE" },
    });
    expect(await r.eventos.getForQuote(UM_PEDIDO.id)).toMatchObject({ id: ev.id });
    expect((await r.itens.listItemsOfEvent(ev.id)).map((l) => l.id)).toEqual([linha.id]);
    expect((await r.registo.listLogOf(ev.id)).map((l) => l.id)).toEqual([marca.id]);
    expect(await r.store.listarReciclagem()).toEqual([]);
  });

  it("as tarefas do pedido saem com ele e voltam com ele (auditoria 12/11, n.º 7)", async () => {
    const r = await carregarR3b();
    await r.pedidos.createQuote(UM_PEDIDO);
    const t = await r.tarefas.createTask({
      title: "TESTE Ligar aos noivos",
      priority: "normal",
      quoteId: UM_PEDIDO.id,
      clientName: "TESTE Ana e Rui",
    } as Parameters<typeof r.tarefas.createTask>[0]);
    const outra = await r.tarefas.createTask({
      title: "TESTE Sem pedido",
      priority: "normal",
    } as Parameters<typeof r.tarefas.createTask>[0]);

    await r.reciclagem.enviarComDetalhe("pedido", UM_PEDIDO.id, "Catarina");
    expect(await r.tarefas.obterTarefa(t.id)).toBeNull();
    expect(await r.tarefas.obterTarefa(outra.id)).not.toBeNull();

    const [entrada] = await r.store.listarReciclagem();
    await r.reciclagem.reporDaReciclagem(entrada.id);
    expect(await r.tarefas.obterTarefa(t.id)).toMatchObject({
      title: "TESTE Ligar aos noivos",
      quoteId: UM_PEDIDO.id,
      createdAt: t.createdAt,
    });
  });

  it("um pedido com contrato não sai — e nada fica na Reciclagem", async () => {
    const r = await carregarR3b();
    await r.pedidos.createQuote(UM_PEDIDO);
    await r.contratos.createContract({
      id: "C-TESTE-1",
      quoteId: UM_PEDIDO.id,
      proposalId: "P-TESTE-1",
      status: "pendente",
      createdAt: "2026-03-05T10:00:00.000Z",
    } as unknown as Parameters<typeof r.contratos.createContract>[0]);
    await expect(r.reciclagem.enviarComDetalhe("pedido", UM_PEDIDO.id)).rejects.toMatchObject({
      status: 409,
    });
    expect(await r.pedidos.getQuote(UM_PEDIDO.id)).not.toBeNull();
    expect(await r.store.listarReciclagem()).toEqual([]);
  });

  it("se o apagar pára a meio (propostas já saíram, o pedido não), a Reciclagem guarda o que saiu", async () => {
    // Auditoria de 13/11: o pedido falhava no fim, a entrada da Reciclagem
    // — a única cópia das propostas já apagadas — era tirada, e perdiam-se.
    vi.doMock("./quotes-store", async () => {
      const real = await vi.importActual<typeof import("./quotes-store")>("./quotes-store");
      return {
        ...real,
        deleteQuote: async () => {
          throw new Error("TESTE: a base de dados recusou");
        },
      };
    });
    try {
      const r = await carregarR3b();
      await r.pedidos.createQuote(UM_PEDIDO);
      await r.propostas.createProposal(umaProposta("P-TESTE-2", UM_PEDIDO.id));

      await expect(r.reciclagem.enviarComDetalhe("pedido", UM_PEDIDO.id)).rejects.toThrow(
        /Reciclagem/,
      );
      expect(await r.propostas.getProposal("P-TESTE-2")).toBeNull();
      const [entrada] = await r.store.listarReciclagem();
      expect(entrada).toMatchObject({ tipo: "pedido", origemId: UM_PEDIDO.id });
      expect(entrada.retrato.propostas).toEqual([expect.objectContaining({ id: "P-TESTE-2" })]);
    } finally {
      vi.doUnmock("./quotes-store");
    }
  });

  it("parado a meio: «Repor» com o pedido vivo devolve o que saiu; e tentar outra vez junta numa entrada só", async () => {
    let recusa = true;
    vi.doMock("./quotes-store", async () => {
      const real = await vi.importActual<typeof import("./quotes-store")>("./quotes-store");
      return {
        ...real,
        deleteQuote: async (id: string) => {
          if (recusa) throw new Error("TESTE: a base de dados recusou");
          return real.deleteQuote(id);
        },
      };
    });
    try {
      const r = await carregarR3b();
      await r.pedidos.createQuote(UM_PEDIDO);
      await r.propostas.createProposal(umaProposta("P-TESTE-3", UM_PEDIDO.id));
      await expect(r.reciclagem.enviarComDetalhe("pedido", UM_PEDIDO.id)).rejects.toThrow();

      // 1) Repor com o pedido ainda vivo: a proposta volta, a entrada sai.
      const [parcial] = await r.store.listarReciclagem();
      await r.reciclagem.reporDaReciclagem(parcial.id);
      expect(await r.propostas.getProposal("P-TESTE-3")).not.toBeNull();
      expect(await r.store.listarReciclagem()).toEqual([]);

      // 2) Falha outra vez, e depois tenta-se de novo e o pedido sai: UMA
      //    entrada, com a proposta que saiu na primeira tentativa.
      await expect(r.reciclagem.enviarComDetalhe("pedido", UM_PEDIDO.id)).rejects.toThrow();
      recusa = false;
      await r.reciclagem.enviarComDetalhe("pedido", UM_PEDIDO.id);
      const entradas = await r.store.listarReciclagem();
      expect(entradas).toHaveLength(1);
      expect(entradas[0].retrato.propostas).toEqual([expect.objectContaining({ id: "P-TESTE-3" })]);
      expect(await r.pedidos.getQuote(UM_PEDIDO.id)).toBeNull();

      // E repor devolve tudo.
      await r.reciclagem.reporDaReciclagem(entradas[0].id);
      expect(await r.pedidos.getQuote(UM_PEDIDO.id)).not.toBeNull();
      expect(await r.propostas.getProposal("P-TESTE-3")).not.toBeNull();
    } finally {
      vi.doUnmock("./quotes-store");
    }
  });

  it("parado a meio, a entrada guarda SÓ o que saiu: a checklist refeita não volta a dobrar, e o rascunho de agora não é pisado", async () => {
    const recusa = true;
    vi.doMock("./quotes-store", async () => {
      const real = await vi.importActual<typeof import("./quotes-store")>("./quotes-store");
      return {
        ...real,
        deleteQuote: async (id: string) => {
          if (recusa) throw new Error("TESTE: a base de dados recusou");
          return real.deleteQuote(id);
        },
      };
    });
    try {
      const r = await carregarR3b();
      const item = (eventId: string, name: string) =>
        ({
          eventId,
          name,
          category: "Luz",
          kind: "consumivel",
          qty: 10,
          critical: false,
          origin: "manual",
          originLabel: "À mão",
          missing: false,
        }) as Parameters<typeof r.itens.addEventItem>[0];
      await r.pedidos.createQuote(UM_PEDIDO);
      await r.propostas.createProposal(umaProposta("P-TESTE-4", UM_PEDIDO.id));
      await r.estado.setState(r.rascunhos.draftKey(UM_PEDIDO.id), { doc: { titulo: "VELHO" } });
      const ev = await r.eventos.createEventMaterial({
        quoteId: UM_PEDIDO.id,
        status: "preparada",
        vehicles: [],
      });
      await r.itens.addEventItem(item(ev.id, "TESTE Velas"));

      // 1.ª tentativa: pára a meio.
      await expect(r.reciclagem.enviarComDetalhe("pedido", UM_PEDIDO.id)).rejects.toThrow();
      let [entrada] = await r.store.listarReciclagem();
      expect(entrada.retrato.propostas).toEqual([expect.objectContaining({ id: "P-TESTE-4" })]);
      expect(entrada.retrato.material ?? []).toEqual([]);
      expect(entrada.retrato.itens ?? []).toEqual([]);

      // Ela continua: refaz a checklist (ids NOVOS), cria outra proposta, e o
      // estúdio volta a gravar um rascunho.
      await r.itens.removeItemsOfEvent(ev.id);
      await r.itens.addEventItem(item(ev.id, "TESTE Velas (refeita)"));
      await r.propostas.createProposal(umaProposta("P-TESTE-5", UM_PEDIDO.id));
      await r.estado.setState(r.rascunhos.draftKey(UM_PEDIDO.id), { doc: { titulo: "NOVO" } });

      // 2.ª tentativa: pára outra vez. UMA entrada, com as duas propostas.
      await expect(r.reciclagem.enviarComDetalhe("pedido", UM_PEDIDO.id)).rejects.toThrow();
      const entradas = await r.store.listarReciclagem();
      expect(entradas).toHaveLength(1);
      [entrada] = entradas;
      expect((entrada.retrato.propostas as { id: string }[]).map((p) => p.id).sort()).toEqual([
        "P-TESTE-4",
        "P-TESTE-5",
      ]);
      expect(entrada.retrato.itens ?? []).toEqual([]);

      // O estúdio grava outra vez (trabalho de agora), e ela repõe.
      await r.estado.setState(r.rascunhos.draftKey(UM_PEDIDO.id), { doc: { titulo: "AGORA" } });
      await r.reciclagem.reporDaReciclagem(entrada.id);
      expect(await r.propostas.getProposal("P-TESTE-4")).not.toBeNull();
      expect(await r.propostas.getProposal("P-TESTE-5")).not.toBeNull();
      // A checklist refeita fica como está: um item, não dois.
      expect((await r.itens.listItemsOfEvent(ev.id)).map((i) => i.name)).toEqual([
        "TESTE Velas (refeita)",
      ]);
      // O rascunho de agora não é pisado pelo velho.
      expect(await r.estado.getState(r.rascunhos.draftKey(UM_PEDIDO.id))).toEqual({
        doc: { titulo: "AGORA" },
      });
      void recusa;
    } finally {
      vi.doUnmock("./quotes-store");
    }
  });

  it("se a entrada não chegou a ser reduzida, a tentativa seguinte não lhe herda o material velho", async () => {
    vi.doMock("./quotes-store", async () => {
      const real = await vi.importActual<typeof import("./quotes-store")>("./quotes-store");
      return {
        ...real,
        deleteQuote: async () => {
          throw new Error("TESTE: a base de dados recusou");
        },
      };
    });
    let trocaFalha = true;
    vi.doMock("./reciclagem-store", async () => {
      const real = await vi.importActual<typeof import("./reciclagem-store")>("./reciclagem-store");
      return {
        ...real,
        trocarRetrato: async (...a: Parameters<typeof real.trocarRetrato>) => {
          if (trocaFalha) throw new Error("TESTE: a escrita falhou");
          return real.trocarRetrato(...a);
        },
      };
    });
    try {
      const r = await carregarR3b();
      await r.pedidos.createQuote(UM_PEDIDO);
      await r.propostas.createProposal(umaProposta("P-TESTE-6", UM_PEDIDO.id));
      const ev = await r.eventos.createEventMaterial({
        quoteId: UM_PEDIDO.id,
        status: "preparada",
        vehicles: [],
      });
      const novoItem = (name: string) =>
        ({
          eventId: ev.id,
          name,
          category: "Luz",
          kind: "consumivel",
          qty: 1,
          critical: false,
          origin: "manual",
          originLabel: "À mão",
          missing: false,
        }) as Parameters<typeof r.itens.addEventItem>[0];
      await r.itens.addEventItem(novoItem("TESTE velho"));

      // 1.ª: pára a meio, e a redução falha — fica o retrato inteiro.
      await expect(r.reciclagem.enviarComDetalhe("pedido", UM_PEDIDO.id)).rejects.toThrow();
      const [inteira] = await r.store.listarReciclagem();
      expect(inteira.retrato.itens as unknown[]).toHaveLength(1);
      // Com o pedido vivo e sem a marca, não se repõe por cima dele.
      await expect(r.reciclagem.reporDaReciclagem(inteira.id)).rejects.toMatchObject({
        status: 409,
      });

      // Ela refaz a checklist; 2.ª tentativa, a redução já funciona.
      await r.itens.removeItemsOfEvent(ev.id);
      await r.itens.addEventItem(novoItem("TESTE novo"));
      trocaFalha = false;
      await expect(r.reciclagem.enviarComDetalhe("pedido", UM_PEDIDO.id)).rejects.toThrow();
      const entradas = await r.store.listarReciclagem();
      expect(entradas).toHaveLength(1);
      // A proposta da 1.ª está lá; o item velho, não.
      expect(entradas[0].retrato.propostas).toEqual([expect.objectContaining({ id: "P-TESTE-6" })]);
      expect(entradas[0].retrato.itens ?? []).toEqual([]);
    } finally {
      vi.doUnmock("./quotes-store");
      vi.doUnmock("./reciclagem-store");
    }
  });

  it("se o apagar falha sem nada ter saído, não fica entrada nenhuma", async () => {
    vi.doMock("./quotes-store", async () => {
      const real = await vi.importActual<typeof import("./quotes-store")>("./quotes-store");
      return {
        ...real,
        deleteQuote: async () => {
          throw new Error("TESTE: a base de dados recusou");
        },
      };
    });
    try {
      const r = await carregarR3b();
      await r.pedidos.createQuote(UM_PEDIDO);
      await expect(r.reciclagem.enviarComDetalhe("pedido", UM_PEDIDO.id)).rejects.toThrow();
      expect(await r.store.listarReciclagem()).toEqual([]);
    } finally {
      vi.doUnmock("./quotes-store");
    }
  });
});

describe("Reciclagem — proposta (R3b)", () => {
  it("volta para o seu pedido; sem o pedido, diz para o repor primeiro", async () => {
    const r = await carregarR3b();
    await r.pedidos.createQuote(UM_PEDIDO);
    await r.propostas.createProposal(umaProposta("P-TESTE-2", UM_PEDIDO.id));
    await r.reciclagem.enviarParaAReciclagem("proposta", "P-TESTE-2");
    const [entrada] = await r.store.listarReciclagem();
    expect(entrada.rotulo).toBe("Proposta de TESTE Ana e Rui");

    await r.pedidos.deleteQuote(UM_PEDIDO.id);
    await expect(r.reciclagem.reporDaReciclagem(entrada.id)).rejects.toThrow(
      /Repõe primeiro o pedido/,
    );

    await r.pedidos.createQuote(UM_PEDIDO);
    await r.reciclagem.reporDaReciclagem(entrada.id);
    expect(await r.propostas.getProposal("P-TESTE-2")).toMatchObject({ quoteId: UM_PEDIDO.id });
  });
});

describe("Reciclagem — tema (R3b)", () => {
  it("não volta por cima de outro tema com o mesmo nome", async () => {
    const r = await carregarR3b();
    const tema = {
      id: "tema-teste-1",
      name: "TESTE Terracota",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await r.temas.reporTema(tema);
    // Sem Storage, a salvaguarda das propostas não tem nada a copiar.
    await r.reciclagem.enviarParaAReciclagem("tema", tema.id);
    expect(await r.temas.getTheme(tema.id)).toBeNull();
    const [entrada] = await r.store.listarReciclagem();
    expect(await r.reciclagem.pastasDeTemasNaReciclagem()).toEqual(new Set([tema.id]));

    await r.temas.reporTema({ ...tema, id: "tema-teste-2", name: "teste terracota " });
    await expect(r.reciclagem.reporDaReciclagem(entrada.id)).rejects.toThrow(
      /Já há outro tema chamado/,
    );
    await r.temas.deleteTheme("tema-teste-2");
    await r.reciclagem.reporDaReciclagem(entrada.id);
    expect(await r.temas.getTheme(tema.id)).toMatchObject({ name: "TESTE Terracota" });
  });
});
