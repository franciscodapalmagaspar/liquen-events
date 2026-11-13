import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ROTA QUE GRAVA A ESCOLHA DO CASAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É a ÚNICA escrita que o lado do cliente faz neste sistema, e por isso o que
 * aqui se prende não é o caminho feliz — é o que ela recusa. Quem tem o link
 * tem o corpo do pedido, e o corpo do pedido não pode decidir o que fica
 * escrito na ficha de um evento.
 *
 * E prende-se a outra metade da regra dela: uma escolha bem sucedida não
 * escreve uma linha de registo em lado nenhum. O registo é para as avarias.
 */

const H = vi.hoisted(() => ({
  proposta: null as Record<string, unknown> | null,
  pedido: null as Record<string, unknown> | null,
  gravado: null as { id: string; patch: Record<string, unknown> } | null,
  limite: { ok: true },
  registos: [] as string[],
  agora: "2026-05-02T10:00:00.000Z",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  log: {
    info: (...a: unknown[]) => H.registos.push(`info:${String(a[0])}`),
    warn: (...a: unknown[]) => H.registos.push(`warn:${String(a[0])}`),
    error: (...a: unknown[]) => H.registos.push(`error:${String(a[0])}`),
    debug: (...a: unknown[]) => H.registos.push(`debug:${String(a[0])}`),
  },
}));
vi.mock("@/lib/proposal-token", () => ({
  readProposalToken: (t: string) => (t === "bom" ? { proposalId: "p1" } : null),
}));
vi.mock("@/lib/proposals-store", () => ({
  getProposal: async () => H.proposta,
  listProposalsForQuote: async () => (H.proposta ? [H.proposta] : []),
}));
vi.mock("@/lib/contracts-store", () => ({ getAcceptedContractByQuote: async () => null }));
/** Uma volta ao «servidor»: o que deixa duas gravações cruzarem-se. */
const volta = () => new Promise((r) => setTimeout(r, 0));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: async () => {
    await volta();
    return H.pedido ? structuredClone(H.pedido) : null;
  },
  updateQuote: async (id: string, patch: Record<string, unknown>) => {
    await volta();
    H.gravado = { id, patch };
    H.pedido = { ...(H.pedido ?? {}), ...patch };
    return H.pedido;
  },
  // Como o repositório: lê o que está AGORA e grava por cima disso, numa só
  // operação (o bloqueio optimista repete quando alguém escreveu no meio).
  updateQuoteWith: async (
    id: string,
    mutar: (q: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    await volta();
    if (!H.pedido) return null;
    const antes = H.pedido;
    const novo = mutar(structuredClone(antes));
    const patch = Object.fromEntries(
      Object.entries(novo).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(antes[k])),
    );
    H.gravado = { id, patch };
    H.pedido = novo;
    return novo;
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "1.2.3.4",
  rateLimit: async () => H.limite,
}));

const { POST } = await import("./route");

const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const pedir = (corpo: unknown, token = "bom") =>
  new Request(`https://liquen.test/api/proposta/${token}/escolha`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });

const ESCOLHAS = [
  {
    id: "e1",
    titulo: "Paleta da cerimónia",
    opcoes: [
      { id: "o1", rotulo: "Verde-oliva e branco" },
      { id: "o2", rotulo: "Terracota e creme" },
    ],
  },
  // Por acabar: uma opção só. Não sai para o casal e não pode ser gravada.
  { id: "e2", titulo: "Corredor", opcoes: [{ id: "x1", rotulo: "Pétalas" }] },
];

beforeEach(() => {
  H.limite.ok = true;
  H.gravado = null;
  H.registos.length = 0;
  H.proposta = { id: "p1", quoteId: "LIQ-9", doc: { escolhas: ESCOLHAS } };
  H.pedido = { id: "LIQ-9", name: "Maria & Zé" };
  vi.setSystemTime(new Date(H.agora));
});

describe("o caminho normal", () => {
  it("grava a escolha no PEDIDO, com a data", async () => {
    const res = await POST(pedir({ escolhaId: "e1", opcaoId: "o2" }), ctx("bom"));
    expect(res.status).toBe(200);
    expect(H.gravado?.id).toBe("LIQ-9");
    expect(H.gravado?.patch.escolhasDoCasal).toEqual([
      { escolhaId: "e1", opcaoId: "o2", em: H.agora },
    ]);
  });

  it("a resposta não devolve o histórico de decisões do casal", async () => {
    // Quem tem o link teria, com ele, tudo o que eles já escolheram. A página
    // não precisa: sabe o que acabou de carregar.
    const res = await POST(pedir({ escolhaId: "e1", opcaoId: "o1" }), ctx("bom"));
    expect(await res.json()).toEqual({ ok: true });
  });

  it("mudar de ideias SUBSTITUI — não se guarda o hesitar", async () => {
    H.pedido = {
      id: "LIQ-9",
      escolhasDoCasal: [{ escolhaId: "e1", opcaoId: "o1", em: "2026-05-01T09:00:00.000Z" }],
    };
    await POST(pedir({ escolhaId: "e1", opcaoId: "o2" }), ctx("bom"));
    expect(H.gravado?.patch.escolhasDoCasal).toEqual([
      { escolhaId: "e1", opcaoId: "o2", em: H.agora },
    ]);
  });

  it("responder a uma pergunta não apaga a resposta da outra", async () => {
    const outra = { escolhaId: "e9", opcaoId: "z1", em: "2026-05-01T09:00:00.000Z" };
    H.pedido = { id: "LIQ-9", escolhasDoCasal: [outra] };
    await POST(pedir({ escolhaId: "e1", opcaoId: "o1" }), ctx("bom"));
    expect(H.gravado?.patch.escolhasDoCasal).toEqual([
      outra,
      { escolhaId: "e1", opcaoId: "o1", em: H.agora },
    ]);
  });

  it("escreve SÓ as escolhas — não mexe em mais nada do pedido", async () => {
    // Um `patch` com mais campos era o lado do cliente a poder mudar o estado,
    // o preço ou as notas do pedido pela porta das traseiras.
    await POST(pedir({ escolhaId: "e1", opcaoId: "o1" }), ctx("bom"));
    expect(Object.keys(H.gravado?.patch ?? {})).toEqual(["escolhasDoCasal"]);
  });
});

describe("duas escolhas ao mesmo tempo (auditoria de 13/11)", () => {
  it("duas respostas quase simultâneas ficam AMBAS no pedido", async () => {
    // Os dois no sofá, cada um no seu telemóvel, a responder a perguntas
    // diferentes. Com ler e gravar separados, a segunda apagava a primeira.
    const ESCOLHAS2 = [
      ...ESCOLHAS,
      {
        id: "e3",
        titulo: "Música",
        opcoes: [
          { id: "m1", rotulo: "Quarteto" },
          { id: "m2", rotulo: "DJ" },
        ],
      },
    ];
    H.proposta = { id: "p1", quoteId: "LIQ-9", doc: { escolhas: ESCOLHAS2 } };
    const [a, b] = await Promise.all([
      POST(pedir({ escolhaId: "e1", opcaoId: "o1" }), ctx("bom")),
      POST(pedir({ escolhaId: "e3", opcaoId: "m2" }), ctx("bom")),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const escolhas = (H.pedido?.escolhasDoCasal ?? []) as { escolhaId: string }[];
    expect(escolhas.map((e) => e.escolhaId).sort()).toEqual(["e1", "e3"]);
  });
});

describe("o que a rota recusa", () => {
  it("um token forjado sai em 404 e não grava nada", async () => {
    const res = await POST(pedir({ escolhaId: "e1", opcaoId: "o1" }, "mau"), ctx("mau"));
    expect(res.status).toBe(404);
    expect(H.gravado).toBeNull();
  });

  it("uma opção de OUTRA escolha não passa", async () => {
    const res = await POST(pedir({ escolhaId: "e1", opcaoId: "x1" }), ctx("bom"));
    expect(res.status).toBe(400);
    expect(H.gravado).toBeNull();
  });

  it("uma escolha que ela ainda está a escrever não passa", async () => {
    // Inalcançável no ecrã (uma opção só), e por isso também não gravável por
    // quem souber o identificador.
    const res = await POST(pedir({ escolhaId: "e2", opcaoId: "x1" }), ctx("bom"));
    expect(res.status).toBe(400);
    expect(H.gravado).toBeNull();
  });

  it("um identificador inventado não passa", async () => {
    const res = await POST(pedir({ escolhaId: "e404", opcaoId: "o1" }), ctx("bom"));
    expect(res.status).toBe(400);
    expect(H.gravado).toBeNull();
  });

  it("o que não é texto não passa", async () => {
    for (const corpo of [
      { escolhaId: { a: 1 }, opcaoId: "o1" },
      { escolhaId: "e1", opcaoId: ["o1"] },
      { escolhaId: "__proto__", opcaoId: "o1" },
      {},
    ]) {
      const res = await POST(pedir(corpo), ctx("bom"));
      expect(res.status, JSON.stringify(corpo)).toBe(400);
    }
    expect(H.gravado).toBeNull();
  });

  it("um corpo que nem é JSON não deita a rota abaixo", async () => {
    const res = await POST(pedir("isto não é json"), ctx("bom"));
    expect(res.status).toBe(400);
    expect(H.gravado).toBeNull();
  });

  it("uma proposta sem documento sai em 404", async () => {
    H.proposta = { id: "p1", quoteId: "LIQ-9" };
    expect((await POST(pedir({ escolhaId: "e1", opcaoId: "o1" }), ctx("bom"))).status).toBe(404);
  });

  it("um pedido que já não existe sai em 404 — e não se grava às cegas", async () => {
    H.pedido = null;
    const res = await POST(pedir({ escolhaId: "e1", opcaoId: "o1" }), ctx("bom"));
    expect(res.status).toBe(404);
    expect(H.gravado).toBeNull();
  });

  it("acima do tecto de pedidos, 429 — e nem chega a olhar para o corpo", async () => {
    H.limite.ok = false;
    const res = await POST(pedir({ escolhaId: "e1", opcaoId: "o1" }), ctx("bom"));
    expect(res.status).toBe(429);
    expect(H.gravado).toBeNull();
  });
});

/**
 * ── O PEDIDO ESCRITO É O DO TOKEN ─────────────────────────────────────────
 *
 * Mesmo com um par (escolha, opção) perfeitamente válido, ninguém escreve na
 * ficha de outro casal: o identificador do pedido sai da PROPOSTA que o token
 * abre, e o corpo não tem por onde o influenciar.
 */
describe("o pedido escrito é o do token", () => {
  it("ignora um identificador de pedido vindo do corpo", async () => {
    await POST(
      pedir({ escolhaId: "e1", opcaoId: "o1", quoteId: "LIQ-DE-OUTRO", id: "LIQ-DE-OUTRO" }),
      ctx("bom"),
    );
    expect(H.gravado?.id).toBe("LIQ-9");
  });
});

describe("uma escolha bem sucedida não deixa rasto no servidor", () => {
  it("não escreve uma linha de registo", async () => {
    await POST(pedir({ escolhaId: "e1", opcaoId: "o1" }), ctx("bom"));
    expect(H.registos, `registos: ${H.registos.join(", ")}`).toEqual([]);
  });

  it("CONTROLO POSITIVO: uma avaria APARECE", async () => {
    // Sem isto, o teste de cima podia estar a afirmar que um registador
    // desligado não escreve nada.
    const { log } = await import("@/lib/logger");
    log.error("uma avaria");
    expect(H.registos).toEqual(["error:uma avaria"]);
  });
});
