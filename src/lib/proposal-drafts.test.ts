import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS RASCUNHOS DO ESTÚDIO E A CÓPIA DE SEGURANÇA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um rascunho é a proposta antes de seguir: fotos escolhidas, mood boards
 * compostos, textos, valores. É o maior bloco de trabalho IRRECUPERÁVEL da
 * casa — as fotos estão no bucket, mas a montagem só existe no `app_state` —, e
 * durante todo o tempo em que lá esteve a cópia de segurança saltava-o.
 *
 * O que estes testes prendem é a parte perigosa de o ter lá metido: os
 * rascunhos vivem num ESPAÇO DE NOMES dentro de uma tabela PARTILHADA com os
 * marcadores de operação e com o contador de faturas de desenvolvimento.
 *
 *   1. Ler nunca pode devolver uma lista truncada com ar de completa.
 *   2. Escrever nunca pode sair do espaço de nomes — nem com um ficheiro de
 *      cópia adulterado, que é dado de FORA.
 *   3. Substituir é substituir: o que está lá e não vem no ficheiro desaparece.
 *   4. Uma escrita que não chegou ao servidor não pode passar por feita (é o
 *      mesmo defeito que fez desaparecer uma proposta inteira, um andar acima).
 */

/** Um `app_state` em memória, com o mesmo contrato do verdadeiro. */
const estado = vi.hoisted(() => ({
  valores: new Map<string, unknown>(),
  /** Faz a varredura responder "não sei" (leitura falhada ou truncada). */
  varreduraIncompleta: false,
  /** Chaves cuja escrita é recusada, e com que motivo. */
  escritaRecusada: new Map<string, string>(),
  /** Limite pedido na última varredura — é aqui que se vê o tecto usado. */
  ultimoLimite: 0,
}));

vi.mock("./app-state", () => ({
  listStateByPrefix: async (prefix: string, limite: number) => {
    estado.ultimoLimite = limite;
    if (estado.varreduraIncompleta) return { entradas: [], completa: false };
    const entradas = [...estado.valores.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([key, value]) => ({ key, value }));
    return { entradas: entradas.slice(0, limite), completa: entradas.length <= limite };
  },
  setState: async (key: string, value: unknown) => {
    const motivo = estado.escritaRecusada.get(key);
    if (motivo) return { gravado: false, onde: "nenhures", motivo };
    estado.valores.set(key, value);
    return { gravado: true, onde: "servidor" };
  },
  getState: async (key: string) => estado.valores.get(key) ?? null,
  apagarEstado: async (key: string) => {
    estado.valores.delete(key);
    return { gravado: true, onde: "servidor" };
  },
}));

import {
  DRAFT_PREFIX,
  LIMITE_RASCUNHOS,
  draftKey,
  ehChaveDeRascunho,
  listProposalDrafts,
  replaceProposalDrafts,
  mapper,
  type RascunhoNaCopia,
} from "./proposal-drafts";

const ONTEM = "2026-03-01T09:00:00.000Z";
const DOC = { ref: "PO Casamento Ana Dias", moodBoards: [{ images: ["LIQ-AAA-1/foto-1.jpg"] }] };

function semear(): void {
  estado.valores.clear();
  estado.valores.set("proposal-draft:LIQ-AAA-1", {
    doc: DOC,
    updatedAt: ONTEM,
    savedBy: "Catarina",
  });
  // Um rascunho APAGADO: a linha fica, o trabalho não.
  estado.valores.set("proposal-draft:LIQ-ZZZ-9", null);
  // E os vizinhos da mesma tabela, que não são dados do negócio.
  estado.valores.set("inbox-last-uid", 4211);
  estado.valores.set("invoice-seq-2026", 7);
}

beforeEach(() => {
  estado.valores.clear();
  estado.varreduraIncompleta = false;
  estado.escritaRecusada.clear();
  estado.ultimoLimite = 0;
});

describe("o espaço de nomes dos rascunhos", () => {
  it("reconhece exactamente as chaves que o `draftKey` produz", () => {
    expect(ehChaveDeRascunho(draftKey("LIQ-AAA-1"))).toBe(true);
    expect(ehChaveDeRascunho("proposal-draft:LIQ_AAA-1")).toBe(true);
    // Os vizinhos da tabela partilhada, e as tentativas de sair do espaço.
    expect(ehChaveDeRascunho("invoice-seq-2026")).toBe(false);
    expect(ehChaveDeRascunho("inbox-last-uid")).toBe(false);
    expect(ehChaveDeRascunho(DRAFT_PREFIX), "sem pedido não é chave de rascunho").toBe(false);
    expect(ehChaveDeRascunho("proposal-draft:a/../inbox-last-uid")).toBe(false);
    expect(ehChaveDeRascunho("xproposal-draft:LIQ-1")).toBe(false);
    expect(ehChaveDeRascunho(undefined)).toBe(false);
  });
});

describe("ler os rascunhos para a cópia", () => {
  it("leva o trabalho e deixa de fora o que não é trabalho", async () => {
    semear();
    const rascunhos = await listProposalDrafts();
    expect(rascunhos).toEqual([
      { key: "proposal-draft:LIQ-AAA-1", doc: DOC, updatedAt: ONTEM, savedBy: "Catarina" },
    ]);
  });

  it("LANÇA quando a varredura não se conseguiu fazer inteira", async () => {
    // Isto é o que faz a cópia marcar-se INCOMPLETA. Devolver `[]` calado dava
    // um ficheiro com ar de completo e sem as propostas por acabar lá dentro —
    // a mentira exacta que esta funcionalidade existe para não contar.
    semear();
    estado.varreduraIncompleta = true;
    await expect(listProposalDrafts()).rejects.toThrow(/db\/schema\.sql|truncada/);
  });

  it("varre com o tecto dos rascunhos, não com o da procura de fotos", async () => {
    // O tecto por omissão do `listStateByPrefix` (2000) foi escolhido para "que
    // rascunhos usam esta foto?". Aqui uma varredura truncada custa a cópia
    // inteira, e há uma chave por pedido alguma vez aberto — incluindo as já
    // limpas, que ficam a null e continuam a ocupar orçamento.
    semear();
    await listProposalDrafts();
    expect(estado.ultimoLimite).toBe(LIMITE_RASCUNHOS);
    expect(LIMITE_RASCUNHOS).toBeGreaterThan(2000);
  });

  it("uma chave estranha dentro do prefixo não faz a cópia inteira ser recusada mais tarde", async () => {
    // A validação da reposição recusa o FICHEIRO todo por causa de um registo
    // com a forma errada. Uma chave que o `draftKey` nunca poderia ter escrito
    // não pode ser o que impede a reposição de tudo o resto no dia do desastre.
    semear();
    estado.valores.set("proposal-draft:com espaços", { doc: DOC, updatedAt: ONTEM });
    const rascunhos = await listProposalDrafts();
    expect(rascunhos.map((r) => r.key)).toEqual(["proposal-draft:LIQ-AAA-1"]);
  });

  it("um rascunho sem `doc` não é trabalho nenhum", async () => {
    estado.valores.set("proposal-draft:LIQ-1", { updatedAt: ONTEM });
    estado.valores.set("proposal-draft:LIQ-2", { doc: null, updatedAt: ONTEM });
    expect(await listProposalDrafts()).toEqual([]);
  });

  it("um rascunho sem marca de tempo legível vem com ela vazia, e não recusado", async () => {
    estado.valores.set("proposal-draft:LIQ-1", { doc: DOC });
    const [rascunho] = await listProposalDrafts();
    expect(rascunho.updatedAt).toBe("");
    expect(rascunho.doc).toEqual(DOC);
  });

  it("sai sempre pela mesma ordem (duas exportações do mesmo estado lêem-se igual)", async () => {
    for (const id of ["LIQ-CCC-3", "LIQ-AAA-1", "LIQ-BBB-2"]) {
      estado.valores.set(draftKey(id), { doc: DOC, updatedAt: ONTEM });
    }
    const chaves = (await listProposalDrafts()).map((r) => r.key);
    expect(chaves).toEqual([...chaves].sort());
  });

  it("a tradução de ida e volta não perde nada", () => {
    const rascunho: RascunhoNaCopia = {
      key: "proposal-draft:LIQ-AAA-1",
      doc: DOC,
      updatedAt: ONTEM,
      savedBy: "Catarina",
    };
    expect(mapper.fromRow(mapper.toRow(rascunho))).toEqual(rascunho);
  });
});

describe("repor os rascunhos", () => {
  const rascunho = (id: string, doc: unknown = DOC): RascunhoNaCopia => ({
    key: draftKey(id),
    doc,
    updatedAt: ONTEM,
  });

  it("escreve o que a cópia traz e apaga o que ela não traz", async () => {
    semear();
    await replaceProposalDrafts([rascunho("LIQ-BBB-2", { ref: "outra proposta" })]);

    expect(estado.valores.get("proposal-draft:LIQ-BBB-2")).toEqual({
      doc: { ref: "outra proposta" },
      updatedAt: ONTEM,
    });
    // Substituir é substituir: o rascunho que estava e não vem no ficheiro
    // desaparece — a linha sai, não fica lápide (P3).
    expect(estado.valores.has("proposal-draft:LIQ-AAA-1")).toBe(false);
  });

  it("NÃO toca no resto da tabela partilhada", async () => {
    semear();
    await replaceProposalDrafts([rascunho("LIQ-AAA-1")]);
    // Repor o marcador da caixa de entrada fazia o robô voltar a avisar de
    // emails já avisados; apagá-lo, o mesmo. O contador de faturas de
    // desenvolvimento pela mesma razão, com uma factura pelo meio.
    expect(estado.valores.get("inbox-last-uid")).toBe(4211);
    expect(estado.valores.get("invoice-seq-2026")).toBe(7);
    // E uma chave já apagada não é reescrita só para ficar igual a si própria.
    expect(estado.valores.get("proposal-draft:LIQ-ZZZ-9")).toBeNull();
  });

  it("RECUSA um ficheiro com uma chave fora do espaço de nomes, sem escrever nada", async () => {
    // O ficheiro vem de fora. Sem esta guarda, uma cópia adulterada repunha o
    // contador de faturas (ou o marcador da caixa de entrada) pela porta dos
    // rascunhos — e a reposição é a operação com mais permissões da casa.
    semear();
    await expect(
      replaceProposalDrafts([
        rascunho("LIQ-AAA-1"),
        { key: "invoice-seq-2026", doc: DOC, updatedAt: ONTEM },
      ]),
    ).rejects.toThrow(/fora do espaço de nomes/);
    expect(estado.valores.get("invoice-seq-2026")).toBe(7);
    // Nem sequer os rascunhos legítimos do mesmo ficheiro foram escritos: a
    // recusa acontece antes da primeira escrita.
    expect(estado.valores.get("proposal-draft:LIQ-AAA-1")).toEqual({
      doc: DOC,
      updatedAt: ONTEM,
      savedBy: "Catarina",
    });
  });

  it("LANÇA quando não sabe o que lá está (varredura incompleta)", async () => {
    // Sem saber que chaves existem não se sabe quais apagar, e apagar ao calhas
    // numa tabela partilhada é pior do que não apagar nada.
    estado.varreduraIncompleta = true;
    await expect(replaceProposalDrafts([rascunho("LIQ-AAA-1")])).rejects.toThrow(
      /db\/schema\.sql|truncada/,
    );
  });

  it("uma escrita que não chegou ao servidor sai PELO NOME (não passa por reposta)", async () => {
    // `setState` não lança por desenho — foi assim que uma proposta inteira
    // ficou presa no `localStorage` de um portátil com o ecrã a dizer
    // «guardado». Aqui quem chama é a reposição, e um rascunho que não ficou
    // gravado tem de aparecer em `failed` em vez de passar por reposto.
    semear();
    estado.escritaRecusada.set("proposal-draft:LIQ-BBB-2", "tabela-em-falta");
    await expect(
      replaceProposalDrafts([rascunho("LIQ-AAA-1"), rascunho("LIQ-BBB-2")]),
    ).rejects.toThrow(/LIQ-BBB-2.*tabela-em-falta/);
    // O que passou, passou: uma falha não desfaz as escritas boas.
    expect(estado.valores.get("proposal-draft:LIQ-AAA-1")).toEqual({ doc: DOC, updatedAt: ONTEM });
  });

  it("aguenta muitos rascunhos de uma vez (escreve-os em lotes, não um a um)", async () => {
    // Uma reposição a sério pode trazer centenas: a rota tem 60 s e uma ida ao
    // servidor por rascunho gastava-os todos.
    const muitos = Array.from({ length: 120 }, (_, i) => rascunho(`LIQ-${i}`));
    await replaceProposalDrafts(muitos);
    expect([...estado.valores.keys()]).toHaveLength(120);
    expect(estado.valores.get(draftKey("LIQ-119"))).toEqual({ doc: DOC, updatedAt: ONTEM });
  });
});
