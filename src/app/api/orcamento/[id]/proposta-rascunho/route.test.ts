import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * O rascunho da proposta no servidor.
 *
 * O que isto protege: até aqui a montagem de uma proposta — mood boards, fotos
 * colocadas, textos, valores — vivia só no `localStorage`. Começar no portátil
 * e continuar no tablet não funcionava, e limpar o histórico apagava trabalho.
 * Estes testes fixam as três coisas que fazem a diferença: o guarda de admin,
 * o teto de tamanho, e o aviso quando duas pessoas gravam a mesma proposta.
 */
const st = vi.hoisted(() => ({
  authed: false,
  stored: null as { doc: unknown; updatedAt: string; savedBy?: string } | null,
  throwOnGet: false,
  /** O que o `app_state` responde à escrita. `null` = gravou. Ver o teste da
   *  tabela em falta: é a instalação da colaboradora, tal e qual. */
  falhaDeEscrita: null as null | "tabela-em-falta" | "sem-permissao" | "escrita-recusada",
  /** A escrita ACONTECEU, mas no disco efémero da função (produção sem
   *  Supabase). É gravado — e não dura até ao próximo deploy. */
  soNoFicheiroEfemero: false,
  save: vi.fn(),
  clear: vi.fn(),
  /** A CHAVE que a leitura foi buscar. É isto que prova a porta do resgate:
   *  o duplo devolve sempre o mesmo, o que interessa é a gaveta pedida. */
  read: vi.fn(),
  /** O braço que põe o pedido em «A preparar proposta» (6/11). O que ele faz
   *  por dentro testa-se em `estado-do-pedido-servidor.test.ts`; aqui prova-se
   *  QUANDO a rota o chama. */
  marcar: vi.fn(async (_id: string): Promise<string | null> => null),
}));

vi.mock("@/lib/estado-do-pedido-servidor", () => ({
  marcarPropostaEmPreparacao: (id: string) => st.marcar(id),
}));

vi.mock("@/lib/admin-auth", () => ({
  isAuthed: () => st.authed,
  ADMIN_NAME_COOKIE: "liquen_user",
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/proposal-drafts", async () => {
  // As duas frases (`porqueNaoGuardou`, `ehFalhaPermanente`) são as verdadeiras:
  // é o texto que a pessoa lê, e um duplo aqui deixaria de o testar.
  const real =
    await vi.importActual<typeof import("@/lib/proposal-drafts")>("@/lib/proposal-drafts");
  const persistencia = () => {
    if (st.falhaDeEscrita) {
      return {
        gravado: false as const,
        duradouro: false as const,
        onde: "nenhures" as const,
        motivo: st.falhaDeEscrita,
      };
    }
    if (st.soNoFicheiroEfemero) {
      return {
        gravado: true as const,
        duradouro: false as const,
        onde: "ficheiro-efemero" as const,
      };
    }
    return { gravado: true as const, duradouro: true as const, onde: "servidor" as const };
  };
  return {
    porqueNaoGuardou: real.porqueNaoGuardou,
    ehFalhaPermanente: real.ehFalhaPermanente,
    avisoDeSitioEfemero: real.avisoDeSitioEfemero,
    getProposalDraft: vi.fn(async (id: string) => {
      st.read(id);
      if (st.throwOnGet) throw new Error("db down");
      return st.stored;
    }),
    saveProposalDraft: vi.fn(async (id: string, doc: unknown, savedBy?: string) => {
      st.save(id, doc, savedBy);
      const draft = { doc, updatedAt: "2026-07-28T23:00:00.000Z", ...(savedBy ? { savedBy } : {}) };
      // Só entra no armazém quando a escrita foi mesmo aceite — é este o ponto
      // todo: o rascunho existe na resposta e NÃO existe na base de dados.
      if (!st.falhaDeEscrita) st.stored = draft;
      return { draft, persistencia: persistencia() };
    }),
    clearProposalDraft: vi.fn(async (id: string) => {
      st.clear(id);
      if (!st.falhaDeEscrita) st.stored = null;
      return persistencia();
    }),
  };
});

import { GET, PUT, DELETE } from "./route";

type Ctx = { params: Promise<{ id: string }> };

function req(
  method: "GET" | "PUT" | "DELETE",
  body?: unknown,
  cookie?: string,
  /** A query da chamada — é por aqui que entra a `?variante=` da ferramenta
   *  antiga. Vazia é o estúdio, que é quem estreou esta rota. */
  query = "",
): [NextRequest, Ctx] {
  const r = new Request(`https://liquen.test/api/orcamento/q-1/proposta-rascunho${query}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
  // O `NextRequest` real expõe `cookies`; um `Request` simples não. É de lá
  // que sai o nome de quem gravou, por isso o duplo tem de o ter.
  Object.defineProperty(r, "cookies", {
    value: {
      get: (name: string) => (cookie && name === "liquen_user" ? { value: cookie } : undefined),
    },
  });
  return [r, { params: Promise.resolve({ id: "q-1" }) }];
}

beforeEach(() => {
  st.authed = true;
  st.stored = null;
  st.throwOnGet = false;
  st.falhaDeEscrita = null;
  st.soNoFicheiroEfemero = false;
  vi.clearAllMocks();
  st.marcar.mockImplementation(async () => null);
});

describe("GET /api/orcamento/[id]/proposta-rascunho", () => {
  it("rejeita quem não está autenticado", async () => {
    st.authed = false;
    expect((await GET(...req("GET"))).status).toBe(401);
  });

  it("devolve null quando ainda não há rascunho — não é um erro", async () => {
    const res = await GET(...req("GET"));
    expect(res.status).toBe(200);
    expect((await res.json()).draft).toBeNull();
  });

  it("devolve o rascunho guardado", async () => {
    st.stored = { doc: { ref: "Casamento Maria" }, updatedAt: "2026-07-28T22:00:00.000Z" };
    const body = await (await GET(...req("GET"))).json();
    expect(body.draft.doc).toEqual({ ref: "Casamento Maria" });
  });

  it("devolve 500 tratado quando a leitura falha", async () => {
    st.throwOnGet = true;
    expect((await GET(...req("GET"))).status).toBe(500);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PORTA DO RESGATE — a gaveta estava cheia e não havia como a abrir
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `PUT` já guardava, e bem, a versão que ia ser esmagada: vai para
 * `<chave>--sobreposto` e o nome dela volta em `resgate`. Metade da regra da
 * casa cumprida — «se falhar, não perder trabalho».
 *
 * A outra metade não existia. A lista de variantes que a LEITURA aceita é
 * fechada de propósito, e `sobreposto` não estava nela: um
 * `GET ?variante=sobreposto` caía no `else` e devolvia o rascunho do estúdio.
 * Ou seja: o trabalho da outra pessoa ficava guardado num sítio que nenhuma
 * parte do produto conseguia abrir. Uma promessa cumprida a meio é uma
 * promessa por cumprir.
 *
 * Estes testes olham para a CHAVE PEDIDA e não para o que o duplo devolve —
 * é a chave que é a porta. E o último faz a volta inteira: sobrepor, ler o
 * nome que a resposta dá, e ir buscar essa gaveta com ele.
 */
describe("GET — a gaveta do resgate", () => {
  it("`?variante=sobreposto` vai à gaveta do resgate, e não ao rascunho do estúdio", async () => {
    await GET(...req("GET", undefined, undefined, "?variante=sobreposto"));
    expect(
      st.read,
      "a leitura foi ao rascunho do estúdio: a porta do resgate continua fechada",
    ).toHaveBeenCalledWith("q-1--sobreposto");
  });

  it("a ferramenta antiga das linhas também tem a sua gaveta de resgate", async () => {
    // A chave do resgate é construída sobre a chave JÁ escolhida, portanto as
    // linhas geram `<pedido>--orcamento-linhas--sobreposto`. Deixar esta de
    // fora repetia o mesmo defeito na outra metade do estúdio.
    await GET(...req("GET", undefined, undefined, "?variante=orcamento-linhas--sobreposto"));
    expect(st.read).toHaveBeenCalledWith("q-1--orcamento-linhas--sobreposto");
  });

  it("A LISTA CONTINUA FECHADA: uma variante inventada é ignorada", async () => {
    /**
     * É esta propriedade que impede quem chame a rota de escolher a chave que
     * quiser dentro do espaço de nomes do `app_state`. Abrir a porta do
     * resgate não pode ser abrir a porta a tudo.
     */
    await GET(...req("GET", undefined, undefined, "?variante=qualquer-coisa"));
    expect(st.read).toHaveBeenCalledWith("q-1");
  });

  it("sem variante nenhuma, continua a ser o rascunho do estúdio", async () => {
    await GET(...req("GET"));
    expect(st.read).toHaveBeenCalledWith("q-1");
  });

  it("A VOLTA INTEIRA: sobrepor, e depois abrir a gaveta pelo nome que a resposta deu", async () => {
    st.stored = {
      doc: { ref: "as duas horas de trabalho da Catarina" },
      updatedAt: "2026-07-28T22:30:00.000Z",
      savedBy: "Catarina",
    };
    const escrita = await PUT(
      ...req("PUT", {
        doc: { ref: "o documento da manhã" },
        baseUpdatedAt: "2026-07-28T22:00:00.000Z",
      }),
    );
    const { resgate } = await escrita.json();
    expect(resgate).toBe("q-1--sobreposto");

    // E agora o que antes era impossível: pegar nesse nome e ir lá buscar.
    const variante = resgate.slice("q-1--".length);
    st.read.mockClear();
    await GET(...req("GET", undefined, undefined, `?variante=${variante}`));
    expect(
      st.read,
      "o nome que a própria rota devolveu não abre a gaveta que ela própria escreveu",
    ).toHaveBeenCalledWith(resgate);
  });
});

describe("PUT /api/orcamento/[id]/proposta-rascunho", () => {
  it("rejeita quem não está autenticado e nunca grava", async () => {
    st.authed = false;
    expect((await PUT(...req("PUT", { doc: {} }))).status).toBe(401);
    expect(st.save).not.toHaveBeenCalled();
  });

  it("grava o rascunho e devolve a marca de tempo", async () => {
    const res = await PUT(...req("PUT", { doc: { ref: "X" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.guardado).toBe(true);
    expect(body.updatedAt).toBe("2026-07-28T23:00:00.000Z");
    expect(body.overwrote).toBe(false);
    expect(st.save).toHaveBeenCalledWith("q-1", { ref: "X" }, undefined);
  });

  it("regista quem gravou, para o aviso poder dizer o nome", async () => {
    await PUT(...req("PUT", { doc: { ref: "X" } }, "Catarina"));
    expect(st.save).toHaveBeenCalledWith("q-1", { ref: "X" }, "Catarina");
  });

  it("avisa quando alguém gravou entre a leitura e a escrita", async () => {
    st.stored = {
      doc: { ref: "antiga" },
      updatedAt: "2026-07-28T22:30:00.000Z",
      savedBy: "Catarina",
    };
    // Estávamos a editar a partir de uma versão mais antiga.
    const res = await PUT(
      ...req("PUT", { doc: { ref: "nova" }, baseUpdatedAt: "2026-07-28T22:00:00.000Z" }),
    );
    const body = await res.json();
    // A última escrita vence — mas não em silêncio.
    expect(body.overwrote).toBe(true);
    expect(body.previousBy).toBe("Catarina");
    expect(st.save).toHaveBeenCalled();
  });

  it("guarda a versão sobreposta antes de escrever por cima dela", async () => {
    /**
     * A última escrita continua a vencer — bloquear a edição de duas pessoas
     * numa casa de três seria pior. O que não pode é o trabalho da outra
     * pessoa deixar de existir: fica numa chave irmã, e a resposta diz onde,
     * para o estúdio poder oferecer o resgate a quem está a olhar.
     */
    st.stored = {
      doc: { ref: "a da tarde", moodBoards: [{ titulo: "Cerimónia" }] },
      updatedAt: "2026-07-28T22:30:00.000Z",
      savedBy: "Catarina",
    };
    const res = await PUT(
      ...req("PUT", { doc: { ref: "a da manhã" }, baseUpdatedAt: "2026-07-28T22:00:00.000Z" }),
    );
    const body = await res.json();
    expect(body.overwrote).toBe(true);
    expect(body.resgate).toBe("q-1--sobreposto");
    expect(body.resgateEm).toBe("2026-07-28T22:30:00.000Z");
    // O documento que ia desaparecer foi guardado tal e qual, com o nome de
    // quem o escreveu.
    expect(st.save).toHaveBeenCalledWith(
      "q-1--sobreposto",
      { ref: "a da tarde", moodBoards: [{ titulo: "Cerimónia" }] },
      "Catarina",
    );
    // E a escrita nova aconteceu na mesma.
    expect(st.save).toHaveBeenCalledWith("q-1", { ref: "a da manhã" }, undefined);
  });

  it("não guarda resgate nenhum quando ninguém foi sobreposto", async () => {
    st.stored = { doc: { ref: "a" }, updatedAt: "2026-07-28T22:30:00.000Z" };
    const res = await PUT(
      ...req("PUT", { doc: { ref: "b" }, baseUpdatedAt: "2026-07-28T22:30:00.000Z" }),
    );
    const body = await res.json();
    expect(body.resgate).toBeUndefined();
    expect(st.save).toHaveBeenCalledTimes(1);
  });

  /**
   * Achado n.º 6 da auditoria: duas pessoas, campos diferentes. A Ana mudou o
   * «Local» e gravou; a Catarina, a partir da versão antiga, muda a «Hora». O
   * «Local» da Ana desaparecia do rascunho principal.
   */
  it("junta campo a campo quando quem grava diz o que mudou", async () => {
    st.stored = {
      doc: { location: "Évora", time: "16h" },
      updatedAt: "2026-07-28T22:30:00.000Z",
      savedBy: "Ana",
    };
    const res = await PUT(
      ...req("PUT", {
        doc: { location: "Sintra", time: "17h" },
        baseUpdatedAt: "2026-07-28T22:00:00.000Z",
        campos: ["time"],
        base: { time: "16h" },
      }),
    );
    const body = await res.json();
    expect(st.save).toHaveBeenCalledWith("q-1", { location: "Évora", time: "17h" }, undefined);
    expect(body.juntou).toBe(true);
    expect(body.doc).toEqual({ location: "Évora", time: "17h" });
    // Ninguém foi pisado: não há aviso de sobreposição nem gaveta — mas o nome
    // de quem mexeu vem, para o estúdio o poder dizer.
    expect(body.overwrote).toBe(false);
    expect(body.resgate).toBeUndefined();
    expect(body.previousBy).toBe("Ana");
  });

  it("o mesmo campo pelas duas: fica o último, e a outra versão vai para a gaveta", async () => {
    st.stored = {
      doc: { location: "Évora", time: "16h" },
      updatedAt: "2026-07-28T22:30:00.000Z",
    };
    const res = await PUT(
      ...req("PUT", {
        doc: { location: "Porto", time: "16h" },
        baseUpdatedAt: "2026-07-28T22:00:00.000Z",
        campos: ["location"],
        base: { location: "Sintra" },
      }),
    );
    const body = await res.json();
    expect(body.juntou).toBe(true);
    expect(body.conflitos).toEqual(["location"]);
    expect(body.overwrote).toBe(true);
    expect(body.resgate).toBe("q-1--sobreposto");
    expect(st.save).toHaveBeenCalledWith("q-1", { location: "Porto", time: "16h" }, undefined);
  });

  it("não avisa quando ninguém mexeu no meio", async () => {
    st.stored = { doc: { ref: "a" }, updatedAt: "2026-07-28T22:30:00.000Z" };
    const res = await PUT(
      ...req("PUT", { doc: { ref: "b" }, baseUpdatedAt: "2026-07-28T22:30:00.000Z" }),
    );
    expect((await res.json()).overwrote).toBe(false);
  });

  it("recusa um corpo sem rascunho", async () => {
    expect((await PUT(...req("PUT", { qualquer: 1 }))).status).toBe(400);
    expect(st.save).not.toHaveBeenCalled();
  });

  it("recusa um rascunho absurdamente grande, em vez de o guardar", async () => {
    const huge = { texto: "x".repeat(600 * 1024) };
    const res = await PUT(...req("PUT", { doc: huge }));
    expect(res.status).toBe(413);
    expect(st.save).not.toHaveBeenCalled();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMA ESCRITA RECUSADA NÃO PODE SAIR DAQUI COMO «OK»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O caso real: a tabela `app_state` não existia naquela instalação (o
 * `db/schema.sql` estava por correr). Cada gravação falhava, o `app-state`
 * engolia o erro, `saveProposalDraft` devolvia o rascunho na mesma e esta rota
 * respondia `{ ok: true }`. O estúdio escrevia «guardado às 14:32» e a proposta
 * inteira ficou no `localStorage` de um portátil.
 *
 * O que estes testes prendem é o elo do meio: a rota tem de DIZER que não
 * guardou, e tem de dizer o suficiente para se saber o que fazer a seguir.
 */
describe("PUT /api/orcamento/[id]/proposta-rascunho — quando a base recusa a escrita", () => {
  it("não responde OK: diz que não guardou", async () => {
    st.falhaDeEscrita = "tabela-em-falta";
    const res = await PUT(...req("PUT", { doc: { ref: "X" } }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.guardado).toBe(false);
    // E não é um `updatedAt` que passa por gravação nenhuma.
    expect(body.updatedAt).toBeUndefined();
  });

  it("uma tabela em falta diz-se pelo nome, e não vale a pena repetir", async () => {
    st.falhaDeEscrita = "tabela-em-falta";
    const body = await (await PUT(...req("PUT", { doc: { ref: "X" } }))).json();
    expect(body.motivo).toBe("tabela-em-falta");
    expect(body.permanente).toBe(true);
    expect(body.erro).toMatch(/schema\.sql/i);
  });

  it("uma permissão recusada também não se resolve a repetir", async () => {
    st.falhaDeEscrita = "sem-permissao";
    const body = await (await PUT(...req("PUT", { doc: { ref: "X" } }))).json();
    expect(body.motivo).toBe("sem-permissao");
    expect(body.permanente).toBe(true);
    expect(body.erro).toMatch(/permiss/i);
  });

  it("uma avaria passageira PODE ser repetida — e a rota di-lo", async () => {
    st.falhaDeEscrita = "escrita-recusada";
    const body = await (await PUT(...req("PUT", { doc: { ref: "X" } }))).json();
    expect(body.permanente).toBe(false);
  });

  it("a edição nunca falha por causa disto: a gravação foi mesmo tentada", async () => {
    st.falhaDeEscrita = "tabela-em-falta";
    await PUT(...req("PUT", { doc: { ref: "X" } }));
    expect(st.save).toHaveBeenCalledWith("q-1", { ref: "X" }, undefined);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAVADO NUM SÍTIO QUE UM DEPLOY APAGA — MELHOR DO QUE NADA, E INSUFICIENTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Em produção sem Supabase o `setState` escreve no `data/app-state.json`, que
 * em Vercel vive no disco da função: não sobrevive a um deploy e muitas vezes
 * nem à invocação seguinte. A escrita ACONTECEU — por isso não é 503, e por
 * isso a edição segue como sempre —, mas dizer «guardado» e mais nada era
 * repetir o «Guardado às 14:32» que fez desaparecer uma proposta inteira.
 *
 * A resposta tem de dar as duas coisas ao estúdio: que ficou, e que não dura.
 */
describe("PUT — quando a gravação só foi ao disco efémero da função", () => {
  it("não é 503: a edição não pode ser bloqueada por causa disto", async () => {
    st.soNoFicheiroEfemero = true;
    const res = await PUT(...req("PUT", { doc: { ref: "X" } }));
    expect(res.status).toBe(200);
    expect((await res.json()).guardado).toBe(true);
  });

  it("mas não passa por gravado no servidor: diz que não dura, e porquê", async () => {
    st.soNoFicheiroEfemero = true;
    const body = await (await PUT(...req("PUT", { doc: { ref: "X" } }))).json();
    expect(body.duradouro).toBe(false);
    expect(body.onde).toBe("ficheiro-efemero");
    // A frase que ela lê tem de dizer o que fazer, não «erro de armazenamento».
    expect(body.aviso).toMatch(/deploy/i);
    expect(body.aviso).toMatch(/SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("a marca de tempo continua a servir — o estúdio compara-a com a cópia local", async () => {
    st.soNoFicheiroEfemero = true;
    const body = await (await PUT(...req("PUT", { doc: { ref: "X" } }))).json();
    expect(body.updatedAt).toBe("2026-07-28T23:00:00.000Z");
  });

  it("uma gravação no servidor diz-se duradoura, e não leva aviso nenhum", async () => {
    const body = await (await PUT(...req("PUT", { doc: { ref: "X" } }))).json();
    expect(body.duradouro).toBe(true);
    expect(body.aviso).toBeUndefined();
  });
});

describe("DELETE /api/orcamento/[id]/proposta-rascunho", () => {
  it("rejeita quem não está autenticado e nunca apaga", async () => {
    st.authed = false;
    expect((await DELETE(...req("DELETE"))).status).toBe(401);
    expect(st.clear).not.toHaveBeenCalled();
  });

  it("descarta o rascunho do pedido", async () => {
    const res = await DELETE(...req("DELETE"));
    expect(res.status).toBe(200);
    expect((await res.json()).apagado).toBe(true);
    expect(st.clear).toHaveBeenCalledWith("q-1");
  });

  // Falhar a limpeza não perde trabalho — o rascunho fica onde estava —, por
  // isso continua a ser 200. Mas não se pode dizer que apagou.
  it("não promete uma limpeza que não houve", async () => {
    st.falhaDeEscrita = "tabela-em-falta";
    const res = await DELETE(...req("DELETE"));
    expect(res.status).toBe(200);
    expect((await res.json()).apagado).toBe(false);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SEGUNDA GAVETA: A FERRAMENTA ANTIGA NO MESMO PEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A tabela de linhas do `ProposalBuilder` não guardava nada e passou a guardar
 * aqui. Se guardasse na chave do estúdio, as duas ferramentas escreviam por
 * cima uma da outra à «última escrita vence» — e o que isso quer dizer, na
 * prática, é abrir o estúdio e encontrar lá dentro um documento de linhas, ou
 * escrever doze linhas e encontrá-las substituídas por um mood board.
 */
describe("a variante do rascunho", () => {
  it("guarda a ferramenta antiga numa gaveta só dela", async () => {
    await PUT(...req("PUT", { doc: { linhas: 12 } }, undefined, "?variante=orcamento-linhas"));
    expect(st.save).toHaveBeenCalledWith("q-1--orcamento-linhas", { linhas: 12 }, undefined);
  });

  it("sem variante continua a ser o rascunho do estúdio, como sempre foi", async () => {
    await PUT(...req("PUT", { doc: { ref: "X" } }));
    expect(st.save).toHaveBeenCalledWith("q-1", { ref: "X" }, undefined);
  });

  /** A chave vai parar ao `app_state`, que é partilhado com marcadores de
   *  operação e contadores. Um nome inventado por quem chama não pode escolher
   *  a gaveta — fora da lista, ignora-se. */
  it("um nome que não está na lista não abre gaveta nenhuma", async () => {
    await PUT(...req("PUT", { doc: { ref: "X" } }, undefined, "?variante=invoice-seq-2026"));
    expect(st.save).toHaveBeenCalledWith("q-1", { ref: "X" }, undefined);
  });

  it("ler e apagar usam a mesma gaveta que a escrita", async () => {
    await GET(...req("GET", undefined, undefined, "?variante=orcamento-linhas"));
    await DELETE(...req("DELETE", undefined, undefined, "?variante=orcamento-linhas"));
    expect(st.clear).toHaveBeenCalledWith("q-1--orcamento-linhas");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «A PREPARAR PROPOSTA» — o pedido dela de 6/11
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Gravar o rascunho do estúdio põe o pedido em «A preparar proposta». Estes
 * testes prendem QUANDO isso se pede: só o rascunho do estúdio, só depois de
 * ficar gravado, e sem nunca fazer falhar a gravação.
 */
describe("PUT — o pedido passa a «A preparar proposta»", () => {
  it("o rascunho do estúdio, gravado, pede a mudança e devolve o estado novo", async () => {
    st.marcar.mockImplementation(async () => "a_preparar");
    const res = await PUT(...req("PUT", { doc: { ref: "Casamento" } }));
    expect(res.status).toBe(200);
    expect(st.marcar).toHaveBeenCalledWith("q-1");
    expect((await res.json()).estadoDoPedido).toBe("a_preparar");
  });

  it("quando o estado não muda (o caso de quase todos os autosaves), a resposta não o traz", async () => {
    const res = await PUT(...req("PUT", { doc: { ref: "Casamento" } }));
    expect(st.marcar).toHaveBeenCalledTimes(1);
    expect(await res.json()).not.toHaveProperty("estadoDoPedido");
  });

  it("a ferramenta antiga das linhas não mexe no estado do pedido", async () => {
    await PUT(...req("PUT", { doc: { linhas: [] } }, undefined, "?variante=orcamento-linhas"));
    expect(st.marcar).not.toHaveBeenCalled();
  });

  it("a gaveta do resgate também não", async () => {
    await PUT(...req("PUT", { doc: { ref: "x" } }, undefined, "?variante=sobreposto"));
    expect(st.marcar).not.toHaveBeenCalled();
  });

  it("um rascunho que NÃO ficou gravado não põe o pedido «a preparar»", async () => {
    st.falhaDeEscrita = "escrita-recusada";
    const res = await PUT(...req("PUT", { doc: { ref: "Casamento" } }));
    expect(res.status).toBe(503);
    expect(st.marcar).not.toHaveBeenCalled();
  });

  it("se a mudança de estado rebentar, o rascunho continua dado como guardado", async () => {
    st.marcar.mockImplementation(async () => {
      throw new Error("base em baixo");
    });
    const res = await PUT(...req("PUT", { doc: { ref: "Casamento" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.guardado).toBe(true);
    expect(body).not.toHaveProperty("estadoDoPedido");
  });

  it("um corpo inválido não chega a pedir nada", async () => {
    await PUT(...req("PUT", { semDoc: true }));
    expect(st.marcar).not.toHaveBeenCalled();
  });
});
