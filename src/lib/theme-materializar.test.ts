import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A REDE POR BAIXO DA REFERÊNCIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma foto escolhida da Biblioteca para um mood board deixou de ser copiada e
 * passou a ser referenciada. Isso põe uma responsabilidade neste módulo que
 * antes não existia em lado nenhum: **apagar uma foto da Biblioteca não pode
 * tirar imagens de uma proposta que já foi para um casal.**
 *
 * O que estes testes fixam é sempre a mesma coisa vista de ângulos
 * diferentes — quando há a menor dúvida de que alguém fica a perder, a
 * eliminação é RECUSADA. Uma eliminação recusada repete-se; uma foto perdida
 * numa proposta enviada, não.
 *
 * Por isso quase todos verificam duas coisas juntas: o veredicto (`ok`) e se o
 * Storage chegou a ser tocado. Um veredicto certo com a foto apagada na mesma
 * seria o pior dos mundos, e é exactamente o erro que um refactor pode
 * introduzir sem dar nas vistas.
 */

const st = vi.hoisted(() => ({
  propostas: [] as { id: string; quoteId: string; doc?: unknown }[],
  listaRebenta: false,
  gravacoes: [] as { id: string; doc: unknown }[],
  gravacaoFalha: false,
  rascunhos: {} as Record<string, { doc: unknown; updatedAt: string }>,
  varreduraCompleta: true,
  escritas: [] as { key: string; value: unknown }[],
  /** A escrita do rascunho é recusada pela base (a tabela não existe). */
  escritaFalha: false,
  /** Caminhos cuja cópia de salvaguarda falha. */
  copiaFalha: new Set<string>(),
  copias: [] as { themePath: string; quoteId: string }[],
  apagouFoto: [] as string[],
  apagouPasta: [] as string[],
  /** O que o Storage fez ao mover: [de, para, modo]. */
  transferencias: [] as [string, string, string][],
  /** As linhas da Biblioteca, por caminho. */
  fotos: new Map<string, Record<string, unknown>>(),
  etiquetas: [] as { path: string; etiquetaId: string; origem: string }[],
  /** Entradas da Reciclagem (o retrato guarda documentos com referências). */
  reciclagem: [] as {
    id: string;
    tipo: string;
    rotulo: string;
    origemId: string;
    retrato: Record<string, unknown>;
  }[],
  /** Quantas vezes se listaram as propostas — é o custo da varredura. */
  listagens: 0,
  /** Derivadas órfãs apagadas, por caminho de origem. */
  derivadasApagadas: [] as string[],
}));

vi.mock("./reciclagem-store", () => ({
  listarReciclagem: async () => st.reciclagem,
  actualizarRetrato: async (
    id: string,
    mutate: (r: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    const e = st.reciclagem.find((x) => x.id === id);
    if (!e) return null;
    e.retrato = mutate(e.retrato);
    return e;
  },
}));
vi.mock("./repository", () => ({ isMissingTable: () => false }));

vi.mock("./biblioteca-fotos-store", () => ({
  getFoto: async (path: string) => st.fotos.get(path) ?? null,
  garantirFoto: async (path: string, dados: Record<string, unknown> = {}) => {
    const f = st.fotos.get(path) ?? { path, ...dados };
    st.fotos.set(path, f);
    return f;
  },
  deleteFoto: async (path: string) => {
    st.fotos.delete(path);
    st.etiquetas = st.etiquetas.filter((e) => e.path !== path);
  },
}));

vi.mock("./biblioteca-foto-etiquetas-store", () => ({
  etiquetasDaFoto: async (path: string) => st.etiquetas.filter((e) => e.path === path),
  etiquetar: async (path: string, etiquetaId: string, origem: string) => {
    if (st.etiquetas.some((e) => e.path === path && e.etiquetaId === etiquetaId)) {
      return { criada: false };
    }
    st.etiquetas.push({ path, etiquetaId, origem });
    return { criada: true };
  },
  desetiquetar: async (path: string, etiquetaId: string) => {
    st.etiquetas = st.etiquetas.filter((e) => !(e.path === path && e.etiquetaId === etiquetaId));
    return true;
  },
}));

vi.mock("./proposals-store", () => ({
  listAllProposals: async () => {
    st.listagens++;
    if (st.listaRebenta) throw new Error("db em baixo");
    // Cópias: quem varre fica com a versão desse instante, como na base.
    return st.propostas.map((p) => ({ ...p }));
  },
  updateProposalWith: async (
    id: string,
    mutate: (p: { id: string; quoteId: string; doc?: unknown }) => { doc?: unknown },
  ) => {
    if (st.gravacaoFalha) return null;
    const actual = st.propostas.find((p) => p.id === id);
    if (!actual) return null;
    const nova = mutate(actual);
    actual.doc = nova.doc;
    st.gravacoes.push({ id, doc: nova.doc });
    return nova;
  },
}));

vi.mock("./app-state", () => ({
  getState: async (key: string) => st.rascunhos[key] ?? null,
  // Devolve o resultado da escrita, como o `app-state` a sério: é por ele que
  // o `gravar` do rascunho responde se pôs mesmo o documento a salvo — e é
  // dessa resposta que depende poder apagar a foto do Storage.
  setState: async (key: string, value: unknown) => {
    st.escritas.push({ key, value });
    return st.escritaFalha
      ? { gravado: false, onde: "nenhures", motivo: "tabela-em-falta" }
      : { gravado: true, onde: "servidor" };
  },
  listStateByPrefix: async (prefix: string) => ({
    entradas: Object.entries(st.rascunhos)
      .filter(([k]) => k.startsWith(prefix))
      .map(([key, value]) => ({ key, value })),
    completa: st.varreduraCompleta,
  }),
}));

vi.mock("./theme-storage", () => ({
  themeFolder: (id: string) => id,
  copyThemeImageToProposal: async (themePath: string, quoteId: string) => {
    st.copias.push({ themePath, quoteId });
    if (st.copiaFalha.has(themePath)) return null;
    return { path: `${quoteId}/copia-de-${themePath.replace("/", "-")}`, url: "https://signed/x" };
  },
  deleteThemeImage: async (path: string) => {
    st.apagouFoto.push(path);
    return true;
  },
  apagarDerivadasOrfas: async (path: string) => {
    st.derivadasApagadas.push(path);
  },
  transferThemeImage: async (from: string, destId: string, mode: string) => {
    const to = `${destId}/${from.slice(from.indexOf("/") + 1)}`;
    st.transferencias.push([from, to, mode]);
    return { outcome: "copied", to, thumb: true };
  },
  deleteThemeFolder: async (themeId: string) => {
    st.apagouPasta.push(themeId);
    return { ok: true, removed: 1 };
  },
}));

vi.mock("./logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import {
  apagarFotoDaBiblioteca,
  apagarPastaDaBiblioteca,
  materializarAntesDeApagar,
  esquecerVarreduras,
  moverFotosDaBiblioteca,
  refsDeTemaNoDoc,
  trocarRefsNoDoc,
} from "./theme-materializar";

beforeEach(() => {
  st.propostas = [];
  st.listaRebenta = false;
  st.gravacoes = [];
  st.gravacaoFalha = false;
  st.rascunhos = {};
  st.varreduraCompleta = true;
  st.escritas = [];
  st.escritaFalha = false;
  st.copiaFalha = new Set();
  st.copias = [];
  st.apagouFoto = [];
  st.apagouPasta = [];
  st.transferencias = [];
  st.fotos = new Map();
  st.etiquetas = [];
  st.reciclagem = [];
  st.listagens = 0;
  st.derivadasApagadas = [];
  esquecerVarreduras();
});

// ── Encontrar as referências ───────────────────────────────────────────────
describe("refsDeTemaNoDoc", () => {
  /**
   * Percorre o documento INTEIRO em vez de conhecer `coverImages` e
   * `moodBoards` pelo nome. É a diferença entre uma varredura que continua
   * certa no dia em que se acrescentar um sítio onde cabe uma foto e uma que
   * fica calada a perder imagens meses depois.
   */
  it("encontra uma referência esteja onde estiver no documento", () => {
    const doc = {
      coverImages: ["tema:italia/a.jpg", ""],
      moodBoards: [{ images: ["q-1/propria.jpg", "tema:italia/b.jpg"] }],
      seccaoQueAindaNaoExiste: { fundo: { imagem: "tema:terracotta/c.jpg" } },
      titulo: "Casamento da Ana",
    };
    expect([...refsDeTemaNoDoc(doc)].sort()).toEqual([
      "tema:italia/a.jpg",
      "tema:italia/b.jpg",
      "tema:terracotta/c.jpg",
    ]);
  });

  it("não confunde uma foto da própria proposta com uma referência", () => {
    expect([...refsDeTemaNoDoc({ x: ["q-1/uuid.jpg", "data:image/jpeg;base64,AAA"] })]).toEqual([]);
  });

  /** `tema:` com lixo lá dentro não é uma referência — e não pode passar a
   *  ser tratada como um caminho de Storage. */
  it("recusa um prefixo com um caminho inválido", () => {
    expect([...refsDeTemaNoDoc({ x: ["tema:../../etc/passwd", "tema:sem-barra"] })]).toEqual([]);
  });
});

describe("trocarRefsNoDoc", () => {
  /**
   * `coverImages` tem duas posições fixas: a `[0]` imprime à esquerda e a
   * `[1]` à direita. Compactar a lista faria a foto escolhida para a direita
   * sair impressa à esquerda — o mesmo erro que `normaliseCoverImages` já
   * documenta.
   */
  it("preserva a POSIÇÃO, incluindo os lugares vazios da capa", () => {
    const doc = { coverImages: ["", "tema:italia/a.jpg"] };
    const saida = trocarRefsNoDoc(doc, new Map([["tema:italia/a.jpg", "q-1/nova.jpg"]]));
    expect(saida).toEqual({ coverImages: ["", "q-1/nova.jpg"] });
  });

  it("não muda o documento original", () => {
    const doc = { a: ["tema:italia/a.jpg"] };
    trocarRefsNoDoc(doc, new Map([["tema:italia/a.jpg", "q-1/nova.jpg"]]));
    expect(doc.a[0]).toBe("tema:italia/a.jpg");
  });

  it("deixa intacto o que não está no mapa", () => {
    const doc = { a: ["tema:italia/a.jpg", "tema:italia/b.jpg"] };
    expect(trocarRefsNoDoc(doc, new Map([["tema:italia/a.jpg", "q-1/nova.jpg"]]))).toEqual({
      a: ["q-1/nova.jpg", "tema:italia/b.jpg"],
    });
  });
});

// ── O caso normal ──────────────────────────────────────────────────────────
describe("apagar uma foto que ninguém usa", () => {
  it("não copia nada e apaga", async () => {
    st.propostas = [{ id: "p-1", quoteId: "q-1", doc: { coverImages: ["q-1/propria.jpg"] } }];
    const res = await apagarFotoDaBiblioteca("italia/a.jpg");
    expect(res.ok).toBe(true);
    expect(st.copias, "copiou uma foto que ninguém referenciava").toEqual([]);
    expect(st.gravacoes).toEqual([]);
    expect(st.apagouFoto).toEqual(["italia/a.jpg"]);
  });
});

// ── O caso que justifica o módulo ──────────────────────────────────────────
describe("apagar uma foto que está numa proposta", () => {
  beforeEach(() => {
    st.propostas = [
      {
        id: "p-1",
        quoteId: "q-1",
        doc: {
          coverImages: ["tema:italia/a.jpg", ""],
          moodBoards: [{ images: ["tema:italia/a.jpg", "q-1/propria.jpg"] }],
        },
      },
    ];
  });

  it("copia para a pasta da proposta e reescreve lá o caminho ANTES de apagar", async () => {
    const res = await apagarFotoDaBiblioteca("italia/a.jpg");
    expect(res.ok).toBe(true);
    expect(st.copias).toEqual([{ themePath: "italia/a.jpg", quoteId: "q-1" }]);
    // A mesma foto aparece duas vezes no documento e é copiada UMA vez — as
    // duas posições passam a apontar para a mesma cópia.
    expect(st.gravacoes[0].doc).toEqual({
      coverImages: ["q-1/copia-de-italia-a.jpg", ""],
      moodBoards: [{ images: ["q-1/copia-de-italia-a.jpg", "q-1/propria.jpg"] }],
    });
    expect(st.apagouFoto).toEqual(["italia/a.jpg"]);
  });

  /**
   * O TESTE QUE INTERESSA. Se a cópia de salvaguarda falha e a foto é apagada
   * na mesma, uma proposta já enviada perde uma imagem e não há como voltar
   * atrás.
   */
  it("NÃO apaga quando a cópia de salvaguarda falha", async () => {
    st.copiaFalha.add("italia/a.jpg");
    const res = await apagarFotoDaBiblioteca("italia/a.jpg");
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("referencias");
    expect(st.apagouFoto, "apagou uma foto que não conseguiu pôr a salvo").toEqual([]);
  });

  /** A cópia existe mas o documento não ficou a apontar para ela: apagar agora
   *  deixava a proposta a apontar para o vazio. */
  it("NÃO apaga quando o documento não pôde ser gravado", async () => {
    st.gravacaoFalha = true;
    const res = await apagarFotoDaBiblioteca("italia/a.jpg");
    expect(res.ok).toBe(false);
    expect(st.apagouFoto).toEqual([]);
  });

  /** Não conseguir OLHAR não é o mesmo que não haver nada — e no entanto o
   *  código mais natural de escrever trataria os dois casos da mesma maneira. */
  it("NÃO apaga quando não conseguiu sequer ver as propostas", async () => {
    st.listaRebenta = true;
    expect((await apagarFotoDaBiblioteca("italia/a.jpg")).ok).toBe(false);
    expect(st.apagouFoto).toEqual([]);
  });

  it("NÃO apaga quando a varredura dos rascunhos veio truncada", async () => {
    st.propostas = [];
    st.varreduraCompleta = false;
    expect((await apagarFotoDaBiblioteca("italia/a.jpg")).ok).toBe(false);
    expect(st.apagouFoto).toEqual([]);
  });

  /** Uma proposta que use OUTRA foto do mesmo tema não é copiada por engano. */
  it("só toca em quem usa mesmo a foto", async () => {
    st.propostas.push({ id: "p-2", quoteId: "q-2", doc: { x: ["tema:italia/z.jpg"] } });
    await apagarFotoDaBiblioteca("italia/a.jpg");
    expect(st.copias.map((c) => c.quoteId)).toEqual(["q-1"]);
  });
});

// ── Rascunhos ──────────────────────────────────────────────────────────────
describe("rascunhos do estúdio", () => {
  beforeEach(() => {
    st.rascunhos = {
      "proposal-draft:q-9": {
        doc: { moodBoards: [{ images: ["tema:italia/a.jpg"] }] },
        updatedAt: "1",
      },
    };
  });

  it("uma proposta ainda por enviar também é posta a salvo", async () => {
    expect((await apagarFotoDaBiblioteca("italia/a.jpg")).ok).toBe(true);
    expect(st.copias).toEqual([{ themePath: "italia/a.jpg", quoteId: "q-9" }]);
    expect(st.escritas[0].key).toBe("proposal-draft:q-9");
    expect(st.escritas[0].value).toMatchObject({
      doc: { moodBoards: [{ images: ["q-9/copia-de-italia-a.jpg"] }] },
    });
  });

  /**
   * A gravação do rascunho reescrito é o que AUTORIZA apagar a foto do
   * Storage. O `setState` não lança quando a base recusa a escrita — só o
   * regista —, e este `gravar` respondia `true` a seguir sem ter como saber se
   * era verdade. O resultado seria a foto apagada e o rascunho por reescrever:
   * um mood board com buracos que ninguém volta a conseguir explicar.
   */
  it("uma gravação recusada NÃO autoriza apagar a foto", async () => {
    st.escritaFalha = true;
    const res = await apagarFotoDaBiblioteca("italia/a.jpg");
    expect(res.ok).toBe(false);
    expect(st.apagouFoto).toEqual([]);
  });

  /**
   * Entre a varredura e a gravação ela pode ter mexido no rascunho noutro
   * separador. Gravar o que se leu há dez segundos apagava esse trabalho — por
   * isso relê-se, e aplicam-se as trocas à versão MAIS RECENTE.
   */
  it("relê o rascunho antes de gravar, para não apagar trabalho feito entretanto", async () => {
    const original = st.rascunhos["proposal-draft:q-9"];
    st.rascunhos["proposal-draft:q-9"] = {
      ...original,
      doc: {
        moodBoards: [{ images: ["tema:italia/a.jpg"] }],
        titulo: "escrito depois da varredura",
      },
    };
    await apagarFotoDaBiblioteca("italia/a.jpg");
    expect(st.escritas[0].value).toMatchObject({
      doc: {
        moodBoards: [{ images: ["q-9/copia-de-italia-a.jpg"] }],
        titulo: "escrito depois da varredura",
      },
    });
  });
});

// ── Eliminar um tema inteiro ───────────────────────────────────────────────
describe("apagarPastaDaBiblioteca", () => {
  /**
   * Pergunta "és desta pasta?" em vez de listar a pasta e comparar caminho a
   * caminho. A listagem tinha uma janela por onde uma foto podia escapar — uma
   * página a mais, uma foto carregada entretanto —, e o preço dessa janela
   * seria uma proposta enviada a perder uma imagem.
   */
  it("põe a salvo QUALQUER foto da pasta, não uma lista fixa", async () => {
    st.propostas = [
      { id: "p-1", quoteId: "q-1", doc: { a: ["tema:italia/a.jpg", "tema:italia/zzz.jpg"] } },
      { id: "p-2", quoteId: "q-2", doc: { a: ["tema:terracotta/x.jpg"] } },
    ];
    const res = await apagarPastaDaBiblioteca("italia");
    expect(res.ok).toBe(true);
    expect(st.copias.map((c) => c.themePath).sort()).toEqual(["italia/a.jpg", "italia/zzz.jpg"]);
    expect(st.apagouPasta).toEqual(["italia"]);
  });

  it("NÃO elimina o tema quando alguma salvaguarda falha", async () => {
    st.propostas = [{ id: "p-1", quoteId: "q-1", doc: { a: ["tema:italia/a.jpg"] } }];
    st.copiaFalha.add("italia/a.jpg");
    const res = await apagarPastaDaBiblioteca("italia");
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("referencias");
    expect(st.apagouPasta).toEqual([]);
  });
});

// ── O predicado, isolado ───────────────────────────────────────────────────
describe("materializarAntesDeApagar", () => {
  it("uma proposta sem documento nenhum não é um problema", async () => {
    st.propostas = [{ id: "p-1", quoteId: "q-1" }];
    expect(await materializarAntesDeApagar(() => true)).toEqual({
      ok: true,
      copiadas: 0,
      documentos: 0,
    });
  });
});

// ── Mover (fundir temas, «Mover para…») — auditoria 6, n.º 1 ───────────────
describe("moverFotosDaBiblioteca", () => {
  /**
   * A proposta da Ana, já enviada, usa uma foto do tema «Boho». Ela funde
   * «Boho» em «Campestre». Antes, a foto mudava de chave e a proposta ficava
   * a apontar para `tema:boho/a.jpg` — que já não existia — e as etiquetas
   * ficavam presas ao caminho antigo.
   */
  it("reescreve as referências e leva as etiquetas atrás da foto", async () => {
    st.propostas = [
      { id: "LIQ-1", quoteId: "q-1", doc: { moodBoards: [{ images: ["tema:boho/a.jpg"] }] } },
    ];
    st.rascunhos = { "proposal-draft:q-2": { doc: { capa: "tema:boho/a.jpg" }, updatedAt: "x" } };
    st.fotos.set("boho/a.jpg", { path: "boho/a.jpg", md5: "m", cor: "#aabbcc", lqip: "L" });
    st.etiquetas = [{ path: "boho/a.jpg", etiquetaId: "terracotta", origem: "manual" }];

    const [r] = await moverFotosDaBiblioteca(["boho/a.jpg"], "campestre");

    expect(r.outcome).toBe("copied");
    // Referenciada: COPIA, reescreve, e só depois apaga a origem.
    expect(st.transferencias).toEqual([["boho/a.jpg", "campestre/a.jpg", "copy"]]);
    expect(st.gravacoes[0].doc).toEqual({ moodBoards: [{ images: ["tema:campestre/a.jpg"] }] });
    expect((st.escritas[0].value as { doc: unknown }).doc).toEqual({
      capa: "tema:campestre/a.jpg",
    });
    expect(st.apagouFoto).toEqual(["boho/a.jpg"]);
    // Nada se materializou: a foto continua na Biblioteca, só mudou de pasta.
    expect(st.copias).toEqual([]);
    expect(st.fotos.get("campestre/a.jpg")).toMatchObject({ md5: "m", cor: "#aabbcc", lqip: "L" });
    expect(st.fotos.has("boho/a.jpg")).toBe(false);
    expect(st.etiquetas).toEqual([
      { path: "campestre/a.jpg", etiquetaId: "terracotta", origem: "manual" },
    ]);
  });

  it("uma foto que ninguém usa muda com `move`, como antes", async () => {
    const [r] = await moverFotosDaBiblioteca(["boho/b.jpg"], "campestre");
    expect(r.outcome).toBe("copied");
    expect(st.transferencias).toEqual([["boho/b.jpg", "campestre/b.jpg", "move"]]);
    expect(st.apagouFoto).toEqual([]);
  });

  it("um documento que não grava deixa a foto também na origem — e conta como falhada", async () => {
    st.propostas = [{ id: "LIQ-1", quoteId: "q-1", doc: { capa: "tema:boho/a.jpg" } }];
    st.gravacaoFalha = true;
    const [r] = await moverFotosDaBiblioteca(["boho/a.jpg"], "campestre");
    expect(r.outcome).toBe("failed");
    expect(st.apagouFoto).toEqual([]);
  });

  it("varredura incompleta: nada sai do sítio", async () => {
    st.varreduraCompleta = false;
    const [r] = await moverFotosDaBiblioteca(["boho/a.jpg"], "campestre");
    expect(r.outcome).toBe("failed");
    expect(st.transferencias).toEqual([]);
  });
});

// ── A revisão do PR #448 ───────────────────────────────────────────────────
describe("moverFotosDaBiblioteca — o que a revisão encontrou", () => {
  it("o rascunho reescrito leva um `updatedAt` novo (o estúdio aberto entra na junção)", async () => {
    st.rascunhos = {
      "proposal-draft:q-2": {
        doc: { capa: "tema:boho/a.jpg" },
        updatedAt: "2026-11-13T09:00:00.000Z",
      },
    };
    await moverFotosDaBiblioteca(["boho/a.jpg"], "campestre");
    const escrito = st.escritas[0].value as { updatedAt: string };
    expect(escrito.updatedAt).not.toBe("2026-11-13T09:00:00.000Z");
  });

  it("e o mesmo no apagar (materializar)", async () => {
    st.rascunhos = {
      "proposal-draft:q-2": {
        doc: { capa: "tema:boho/a.jpg" },
        updatedAt: "2026-11-13T09:00:00.000Z",
      },
    };
    await apagarFotoDaBiblioteca("boho/a.jpg");
    const escrito = st.escritas[0].value as { updatedAt: string };
    expect(escrito.updatedAt).not.toBe("2026-11-13T09:00:00.000Z");
  });

  /**
   * A varredura lê a proposta; antes de a reescrita chegar, o estúdio grava um
   * título novo. Reescrever sobre o `doc` da varredura apagava esse título.
   */
  it("a proposta reescreve-se sobre a versão lida AGORA, não sobre a da varredura", async () => {
    st.propostas = [
      { id: "LIQ-1", quoteId: "q-1", doc: { capa: "tema:boho/a.jpg", titulo: "velho" } },
    ];
    const original = st.propostas[0];
    // A varredura lê (uma cópia) logo ao arrancar; a seguir alguém grava.
    const espera = moverFotosDaBiblioteca(["boho/a.jpg"], "campestre");
    original.doc = { capa: "tema:boho/a.jpg", titulo: "novo" };
    await espera;
    expect(st.propostas[0].doc).toEqual({ capa: "tema:campestre/a.jpg", titulo: "novo" });
  });

  it("uma foto só referida na Reciclagem também é protegida: o retrato é reescrito", async () => {
    st.reciclagem = [
      {
        id: "r1",
        tipo: "pedido",
        rotulo: "Ana e João",
        origemId: "q-9",
        retrato: { propostas: [{ id: "LIQ-9", doc: { capa: "tema:boho/a.jpg" } }] },
      },
    ];
    const [r] = await moverFotosDaBiblioteca(["boho/a.jpg"], "campestre");
    expect(r.outcome).toBe("copied");
    expect(st.transferencias[0][2]).toBe("copy");
    expect(st.reciclagem[0].retrato).toEqual({
      propostas: [{ id: "LIQ-9", doc: { capa: "tema:campestre/a.jpg" } }],
    });
  });

  it("copiar+apagar apaga também as derivadas órfãs da origem", async () => {
    st.propostas = [{ id: "LIQ-1", quoteId: "q-1", doc: { capa: "tema:boho/a.jpg" } }];
    await moverFotosDaBiblioteca(["boho/a.jpg"], "campestre");
    expect(st.apagouFoto).toEqual(["boho/a.jpg"]);
    expect(st.derivadasApagadas).toEqual(["boho/a.jpg"]);
  });

  it("dois lotes da mesma fusão varrem UMA vez", async () => {
    await moverFotosDaBiblioteca(["boho/a.jpg"], "campestre");
    await moverFotosDaBiblioteca(["boho/b.jpg"], "campestre");
    expect(st.listagens).toBe(1);
  });
});
