import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => {
  /**
   * O registo GRAVADO — usado por `get` e, agora, por `update`, para que a
   * loja falsa se comporte como a verdadeira: um PATCH que só muda um campo
   * (o motivo, por exemplo) devolve o pedido inteiro com esse campo mudado, e
   * não um objecto amputado a `{id, ...patch}`. Sem isto, ler `updated.status`
   * depois de uma gravação que não mexe no estado dava sempre `undefined`.
   */
  const registo = () => ({
    id: "LIQ-1",
    submittedAt: "2026-06-01T10:00:00.000Z",
    name: "Ana Silva",
    email: "ana@example.com",
    phone: "910000000",
    company: "ACME",
    nif: "500000000",
    notes: "segredo",
    status: "pendente",
    guests: 50,
    date: "2026-09-01",
    addons: [
      {
        id: "dj",
        name: "DJ",
        tier: "completo",
        price: 900,
        quantity: 1,
        pricingType: "fixed",
      },
    ],
    // Internal CRM data — must never appear in the public response.
    adminNotes: "nota interna",
    quotedPrice: 12500,
    activityLog: [{ id: "a1", at: "2026-06-02", kind: "manual_note", summary: "interno" }],
    messages: [{ at: "2026-06-02", body: "privado" }],
    payments: [{ id: "p1", kind: "sinal", amount: 3000, date: "2026-06-05", paid: true }],
    guestList: [{ id: "g1", name: "Convidado Secreto", party: 2, rsvp: "confirmado" }],
    lostReason: "—",
    assignedTo: "Catarina",
    contractRef: "2026-042",
    tags: ["VIP"],
    // O que cada teste quiser que esteja GRAVADO. A transição automática de
    // estado decide comparando o que vem no corpo com isto, por isso os
    // testes dela precisam de mexer no pedido guardado.
    ...store.override,
  });
  return {
    get: vi.fn(async (id: string) => (id === "LIQ-1" ? registo() : null)),
    override: {} as Record<string, unknown>,
    update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({
      ...registo(),
      ...patch,
    })),
    remove: vi.fn(async (_id: string) => {}),
  };
});
const rl = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; retryAfter?: number } }));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: store.get,
  updateQuote: store.update,
  deleteQuote: store.remove,
}));
/**
 * A sementeira do plano de produção, espiada.
 *
 * Estava por espiar porque nunca era chamada a sério: o esboço da loja não
 * expõe o `updateQuoteWith`, a chamada rebentava e o `try` de melhor esforço da
 * rota engolia o erro em silêncio. Um caminho que só passava por sorte não é um
 * caminho guardado — e este é o que herdou o trabalho do botão «Aceitar
 * proposta» que saiu.
 */
const semeador = vi.hoisted(() => ({
  semear: vi.fn(async () => {}),
  prever: vi.fn(async () => ({
    material: { linhas: 0, jaExiste: false },
    montagem: { linhas: 0 },
    calendario: { linhas: 0 },
    pagamentos: { linhas: 0 },
    haQualquerCoisaAGerar: false,
  })),
  gerar: vi.fn(async () => ({
    material: { linhas: 0, preservadas: 0 },
    montagem: { linhas: 0 },
    calendario: { linhas: 0 },
    pagamentos: { linhas: 0 },
  })),
}));
vi.mock("@/lib/semear-producao", () => ({
  semearProducaoAoGanhar: semeador.semear,
  preverGeracaoDoEvento: semeador.prever,
  gerarEventoAoGanhar: semeador.gerar,
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => rl.result),
  clientIp: () => "test-ip",
  sweep: () => {},
}));

/**
 * A proposta mais recente do pedido, espiada — e as duas ligações que
 * dependem dela: a análise de propostas (que lê `Proposal.status` e
 * `Proposal.lostReason`) e o contrato, que passa a nascer aqui.
 */
const propostas = vi.hoisted(() => ({
  daQuote: null as null | Record<string, unknown>,
  getByQuote: vi.fn(async (_qid: string) => propostas.daQuote),
  update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
}));
vi.mock("@/lib/proposals-store", () => ({
  getProposalByQuote: propostas.getByQuote,
  updateProposal: propostas.update,
  listProposalsForQuote: async () => (propostas.daQuote ? [propostas.daQuote] : []),
}));
const contratos = vi.hoisted(() => ({
  criar: vi.fn(async (c: Record<string, unknown>) => ({ created: true, contract: c })),
  daProposta: null as null | Record<string, unknown>,
  apagar: vi.fn(async (_id: string) => {}),
}));
vi.mock("@/lib/contracts-store", () => ({
  createContractIfAbsent: contratos.criar,
  newContractId: () => "contrato-novo",
  getContractByProposal: async () => contratos.daProposta,
  deleteContract: contratos.apagar,
}));
/**
 * O apagamento a sério vive em `apagar-pedido.ts` e tem os seus próprios
 * testes — as propostas que vão atrás, as fotografias, o contrato que manda
 * parar. Aqui o que se testa é o que a ROTA faz com o resultado: que código
 * HTTP devolve, e o que diz. Um duplo mantém as duas perguntas separadas.
 */
const apagamento = vi.hoisted(() => ({
  correr: vi.fn(async () => ({
    apagado: true as boolean,
    motivo: undefined as string | undefined,
    contou: { propostas: 2, fotos: 3, rascunhos: 1 },
    falhou: [] as string[],
  })),
}));
vi.mock("@/lib/apagar-pedido", () => ({ apagarPedidoSemContrato: apagamento.correr }));
// Apagar passa pela Reciclagem (R3b, `src/lib/reciclagem.ts`, com testes
// próprios). Aqui interessa a rota: a guarda, e as respostas de cada desfecho
// do `apagarPedidoSemContrato` — que a Reciclagem devolve tal e qual.
const reciclagem = vi.hoisted(() => {
  class NaoDeuParaApagar extends Error {
    constructor(
      m: string,
      readonly status: number,
      readonly detalhe?: unknown,
    ) {
      super(m);
    }
  }
  return { NaoDeuParaApagar };
});
vi.mock("@/lib/reciclagem", () => ({
  NaoDeuParaApagar: reciclagem.NaoDeuParaApagar,
  quemApagou: () => undefined,
  enviarComDetalhe: async (_tipo: string, id: string) => {
    const r = await (apagamento.correr as (id: string) => ReturnType<typeof apagamento.correr>)(id);
    if (!r.apagado) throw new reciclagem.NaoDeuParaApagar("não", 0, r);
    return { reciclagem: { id: "r1" }, detalhe: r };
  },
}));

import { GET, PATCH, DELETE, POST } from "./route";
import { corpoDaMarcacao, corpoDoMotivo } from "@/lib/orcamento/desfecho";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
/** O último patch que a rota mandou gravar. */
const gravadoNaLoja = () => store.update.mock.calls.at(-1)?.[1] as Record<string, unknown>;
function req(method: "GET" | "PATCH" | "DELETE" | "POST", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento/LIQ-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  rl.result = { ok: true };
  store.override = {};
  propostas.daQuote = null;
  contratos.daProposta = null;
  vi.clearAllMocks();
});

/** A proposta base que os testes de propagação/contrato reutilizam. */
const proposta = (over: Record<string, unknown> = {}) => ({
  id: "prop-1",
  quoteId: "LIQ-1",
  clientName: "Ana Silva",
  clientEmail: "ana@example.com",
  status: "enviada",
  ...over,
});

describe("GET /api/orcamento/[id] — PII protection", () => {
  it("redacts personal data for the public (anti-enumeration)", async () => {
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    // The public view is an explicit allowlist of event facts — exactly these
    // keys, so a new Quote field can never leak by accident. (JSON drops the
    // allowlisted-but-undefined ones, e.g. packageTier/eventName here.)
    expect(Object.keys(json).sort()).toEqual(
      [
        "id",
        "submittedAt",
        "status",
        "guests",
        "date",
        "addons",
        "decorPoints",
        // Tipo de espaço e tipo de cerimónia: respostas que a própria pessoa
        // deu no formulário, e que a página de confirmação volta a mostrar. Se
        // esta linha aparecer num diff sem uma razão dessas, é uma fuga.
        "spaceType",
        "ceremonyType",
        // A coordenação do dia (pedido dela, 25/10): também é uma resposta
        // que a pessoa deu, e a confirmação mostra-a de volta.
        "dayCoordination",
      ].sort(),
    );
    expect(json.status).toBe("pendente");
    expect(json.guests).toBe(50);
    // Addons are trimmed to id/name/tier — no pricing internals.
    expect(json.addons).toEqual([{ id: "dj", name: "DJ", tier: "completo" }]);
    // Os pontos de decoração são dados que a própria pessoa escreveu, e a
    // página de confirmação precisa deles para os mostrar depois de um
    // recarregamento. Um pedido antigo, sem escolhas, dá uma lista vazia.
    expect(json.decorPoints).toEqual([]);
  });

  it("returns the full record to an authenticated admin", async () => {
    authed.ok = true;
    const json = await (await GET(req("GET"), ctx("LIQ-1"))).json();
    expect(json.email).toBe("ana@example.com");
  });

  /**
   * ── AS DUAS RESPOSTAS DE 200 TÊM DE SER DISTINGUÍVEIS ───────────────────
   *
   * Com sessão sai o pedido inteiro; sem sessão sai a lista pública acima — e
   * ambas são 200 com `id`. O back office vai buscar aqui o pedido completo
   * quando ela abre um da lista, e com a sessão expirada (o separador fica
   * aberto horas) aceitava a versão pública como se fosse o pedido: painel sem
   * nome, sem contacto, sem pagamentos e sem convidados, e o pedido da lista
   * substituído por essa versão.
   *
   * A marca vive no cabeçalho porque adivinhar pela presença de um campo é uma
   * regra que se parte sozinha no dia em que a lista pública crescer um campo.
   */
  it("marca a resposta com sessão, e SÓ essa, como pedido completo", async () => {
    authed.ok = true;
    expect((await GET(req("GET"), ctx("LIQ-1"))).headers.get("x-pedido")).toBe("completo");

    authed.ok = false;
    expect((await GET(req("GET"), ctx("LIQ-1"))).headers.get("x-pedido")).toBeNull();
  });

  it("returns 404 for an unknown id", async () => {
    expect((await GET(req("GET"), ctx("nope"))).status).toBe(404);
  });

  it("rate-limits unauthenticated lookups (anti-enumeration)", async () => {
    rl.result = { ok: false, retryAfter: 42 };
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(429);
    expect(store.get).not.toHaveBeenCalled();
  });

  it("never rate-limits an authenticated admin", async () => {
    authed.ok = true;
    rl.result = { ok: false, retryAfter: 42 };
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/orcamento/[id]", () => {
  it("requires authentication", async () => {
    const res = await PATCH(req("PATCH", { status: "cotado" }), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("only persists allow-listed fields (blocks mass-assignment)", async () => {
    authed.ok = true;
    await PATCH(req("PATCH", { status: "cotado", quotedPrice: 5000, id: "evil" }), ctx("LIQ-1"));
    expect(store.update).toHaveBeenCalledWith("LIQ-1", { status: "cotado", quotedPrice: 5000 });
  });

  /**
   * ── OS CONTACTOS PASSARAM A SER EDITÁVEIS, E ISSO FOI UMA DECISÃO ────────
   *
   * Estavam nesta lista de «nunca escrever». A razão pela qual saíram não é
   * segurança a ceder: é que um pedido nascido de um telefonema entra sem
   * email, a rota do envio responde «acrescenta o email e reenvia», e não havia
   * por onde o acrescentar. A rota é só para quem tem sessão de administração.
   *
   * O que continua fechado é o que nunca é escrito à mão: a identidade do
   * registo, a hora de submissão, o cálculo do preço e o carimbo de alteração.
   */
  it("aceita os dados de contacto, que são o que ela corrige à mão", async () => {
    authed.ok = true;
    await PATCH(
      req("PATCH", { name: "Maria Silva", email: "maria@example.pt", phone: "+351 912 345 678" }),
      ctx("LIQ-1"),
    );
    // O telefone que MUDOU grava-se em E.164, como os do site (30/10).
    expect(store.update).toHaveBeenCalledWith("LIQ-1", {
      name: "Maria Silva",
      email: "maria@example.pt",
      phone: "+351912345678",
    });
  });

  /**
   * OS CONTACTOS SÓ SE CONFEREM QUANDO MUDAM (pedido dela, 30/10: «não deixe
   * enviar emails que não existem ou números de telefone seja qual país
   * for»). Um pedido antigo com um telefone de outro feitio continua a poder
   * ser mexido nos outros campos — e mandar o mesmo valor de volta não é
   * mudá-lo.
   */
  describe("o email e o telefone, conferidos só quando mudam", () => {
    it("um telefone novo que não existe é recusado, com o campo", async () => {
      authed.ok = true;
      const res = await PATCH(req("PATCH", { phone: "+44 7911 12" }), ctx("LIQ-1"));
      expect(res.status).toBe(400);
      expect((await res.json()).campo).toBe("telefone");
      expect(store.update).not.toHaveBeenCalled();
    });

    it("o telefone antigo, de outro feitio, volta tal e qual sem ser conferido", async () => {
      authed.ok = true;
      store.override = { phone: "91 234 56 78 ext. 3" };
      try {
        const res = await PATCH(
          req("PATCH", { phone: "91 234 56 78 ext. 3", location: "Évora" }),
          ctx("LIQ-1"),
        );
        expect(res.status).toBe(200);
        expect(store.update).toHaveBeenCalledWith("LIQ-1", {
          phone: "91 234 56 78 ext. 3",
          location: "Évora",
        });
      } finally {
        store.override = {};
      }
    });

    it("apagar o telefone continua a valer", async () => {
      authed.ok = true;
      const res = await PATCH(req("PATCH", { phone: "" }), ctx("LIQ-1"));
      expect(res.status).toBe(200);
      expect(store.update).toHaveBeenCalledWith("LIQ-1", { phone: "" });
    });

    it("um email novo com um domínio que não recebe correio é recusado, com o campo", async () => {
      authed.ok = true;
      const res = await PATCH(req("PATCH", { email: "ana@nao-existe.invalid" }), ctx("LIQ-1"));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ campo: "email" });
      expect(store.update).not.toHaveBeenCalled();
    });

    it("o email que já lá estava não volta a perguntar ao DNS", async () => {
      authed.ok = true;
      store.override = { email: "antigo@nao-existe.invalid" };
      try {
        const res = await PATCH(
          req("PATCH", { email: "antigo@nao-existe.invalid", guests: 80 }),
          ctx("LIQ-1"),
        );
        expect(res.status).toBe(200);
      } finally {
        store.override = {};
      }
    });
  });

  it("recusa um email mal formado em vez de o gravar", async () => {
    authed.ok = true;
    const res = await PATCH(req("PATCH", { email: "isto-não-é-um-email" }), ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  /** Vazio é legítimo: há pedidos cujo contacto é o telefone. */
  it("aceita apagar o email", async () => {
    authed.ok = true;
    await PATCH(req("PATCH", { email: "" }), ctx("LIQ-1"));
    expect(store.update).toHaveBeenCalledWith("LIQ-1", { email: "" });
  });

  it("drops non-allowlisted privileged fields (deep mass-assignment guard)", async () => {
    authed.ok = true;
    await PATCH(
      req("PATCH", {
        status: "cotado",
        // None of these may be client-writable: identity, submission time, the
        // computed price breakdown, the reference id, the update stamp.
        submittedAt: "1999-01-01T00:00:00.000Z",
        priceBreakdown: { total: 0 },
        id: "evil",
        lastUpdated: "spoofed",
      }),
      ctx("LIQ-1"),
    );
    expect(store.update).toHaveBeenCalledWith("LIQ-1", { status: "cotado" });
  });

  it("returns 400 (not an uncaught 500) for a malformed JSON body", async () => {
    authed.ok = true;
    const bad = new Request("https://liquen.test/api/orcamento/LIQ-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    }) as unknown as NextRequest;
    const res = await PATCH(bad, ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-object JSON body (null) instead of crashing on `in`", async () => {
    authed.ok = true;
    const res = await PATCH(req("PATCH", null), ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid status value with 400", async () => {
    authed.ok = true;
    const res = await PATCH(req("PATCH", { status: "not_a_status" }), ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/orcamento/[id]", () => {
  it("requires authentication", async () => {
    const res = await DELETE(req("DELETE"), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(apagamento.correr).not.toHaveBeenCalled();
  });

  it("apaga o pedido E o que é dele, e diz o que levou", async () => {
    /**
     * Isto respondia `{ ok: true }` seco depois de tirar só a LINHA do pedido.
     * As propostas ficavam — com o nome do casal, o email e o documento
     * inteiro — porque a chave estrangeira é `on delete set null`.
     *
     * A contagem na resposta não é enfeite: um apagamento silencioso é
     * indistinguível de um que não aconteceu, e era esse o defeito.
     */
    authed.ok = true;
    const res = await DELETE(req("DELETE"), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.contou).toEqual({ propostas: 2, fotos: 3, rascunhos: 1 });
    expect(body.reciclagem).toEqual({ id: "r1" });
    expect(apagamento.correr).toHaveBeenCalledWith("LIQ-1");
  });

  it("um pedido COM contrato responde 409 e não apaga nada", async () => {
    /**
     * Contratos e facturas são registos fiscais e conservam-se anos — e a
     * própria política de privacidade fala de pedidos que NÃO deram origem a
     * contrato. A frase tem de dizer porquê, senão parece uma avaria.
     */
    authed.ok = true;
    apagamento.correr.mockResolvedValueOnce({
      apagado: false,
      motivo: "tem-contrato",
      contou: { propostas: 0, fotos: 0, rascunhos: 0 },
      falhou: [],
    });
    const res = await DELETE(req("DELETE"), ctx("LIQ-1"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/registo fiscal/i);
  });

  it("um pedido que não existe responde 404", async () => {
    authed.ok = true;
    apagamento.correr.mockResolvedValueOnce({
      apagado: false,
      motivo: "nao-existe",
      contou: { propostas: 0, fotos: 0, rascunhos: 0 },
      falhou: [],
    });
    expect((await DELETE(req("DELETE"), ctx("LIQ-1"))).status).toBe(404);
  });

  it("quando não conseguiu apagar, NÃO diz que apagou — e diz o que ficou", async () => {
    authed.ok = true;
    apagamento.correr.mockResolvedValueOnce({
      apagado: false,
      motivo: undefined,
      contou: { propostas: 1, fotos: 0, rascunhos: 0 },
      falhou: ["a fotografia q1/b.jpg continua no armazenamento"],
    });
    const res = await DELETE(req("DELETE"), ctx("LIQ-1"));
    expect(res.status).toBe(500);
    expect((await res.json()).falhou.join(" ")).toContain("q1/b.jpg");
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * REGISTAR UM PAGAMENTO OU UM CONTRATO É DIZER QUE O TRABALHO É NOSSO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Este PATCH é a porta por onde o painel de Pagamentos grava (manda a lista
 * inteira em `{ payments }`) e por onde a referência do contrato é guardada.
 * Nenhuma das duas coisas mexia no estado: ela dava um sinal por recebido e o
 * pedido continuava a dizer «Proposta enviada».
 *
 * A regra da transição está guardada nos testes de
 * `@/lib/orcamento/estado-do-pedido`. O que estes prendem é O QUE ESTA ROTA
 * CONTA COMO TENDO ACONTECIDO — que é onde está a subtileza toda.
 */
describe("PATCH /api/orcamento/[id] — o estado segue o que se registou", () => {
  /** O último patch que chegou ao armazenamento. */
  const gravado = () => store.update.mock.calls.at(-1)?.[1] as Record<string, unknown>;

  it("um pagamento que passa a recebido dá o pedido por ganho", async () => {
    authed.ok = true;
    store.override = { status: "cotado", payments: [] };
    await PATCH(
      req("PATCH", {
        payments: [{ id: "p9", kind: "sinal", amount: 3000, date: "2026-07-01", paid: true }],
      }),
      ctx("LIQ-1"),
    );
    expect(gravado()).toMatchObject({ status: "aceite" });
  });

  /**
   * A maioria das linhas nasce assim: o painel pré-preenche o sinal quando se
   * abre, e a linha fica lá por receber. Um PLANO não é um negócio ganho — se
   * contasse, bastava abrir o painel para o quadro mentir.
   */
  it("uma linha de pagamento ainda POR receber não muda nada", async () => {
    authed.ok = true;
    store.override = { status: "cotado", payments: [] };
    await PATCH(
      req("PATCH", {
        payments: [{ id: "p9", kind: "sinal", amount: 3000, date: "2026-07-01", paid: false }],
      }),
      ctx("LIQ-1"),
    );
    expect(gravado()).not.toHaveProperty("status");
  });

  /**
   * O painel manda a lista INTEIRA a cada gravação. Sem comparar com o que
   * está guardado, apagar uma linha ou corrigir um valor voltava a contar como
   * "acabou de entrar dinheiro" — e reescrevia o estado (e o histórico) de cada
   * vez que ela mexesse em qualquer coisa.
   */
  it("regravar a mesma lista com o pagamento que já estava pago não conta outra vez", async () => {
    authed.ok = true;
    store.override = {
      status: "cotado",
      payments: [{ id: "p1", kind: "sinal", amount: 3000, date: "2026-06-05", paid: true }],
    };
    await PATCH(
      req("PATCH", {
        payments: [
          { id: "p1", kind: "sinal", amount: 3000, date: "2026-06-05", paid: true },
          { id: "p2", kind: "saldo", amount: 7000, date: "2026-09-01", paid: false },
        ],
      }),
      ctx("LIQ-1"),
    );
    expect(gravado()).not.toHaveProperty("status");
  });

  it("escrever a referência do contrato dá o pedido por ganho", async () => {
    authed.ok = true;
    store.override = { status: "em_revisao", contractRef: "" };
    await PATCH(req("PATCH", { contractRef: "2026-042" }), ctx("LIQ-1"));
    expect(gravado()).toMatchObject({ status: "aceite" });
  });

  /**
   * As contagens da folha do guião (adultos, crianças, equipa) vinham do ecrã
   * dos Guiões e eram deitadas fora aqui: o campo não estava na lista do que a
   * rota aceita, e a resposta era um 200. O PDF do guião nunca as via.
   */
  it("grava as contagens da folha do guião", async () => {
    authed.ok = true;
    const folha = { adultos: "120", criancas: "8", staff: "14" };
    const res = await PATCH(req("PATCH", { folhaDaTimeline: folha }), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(gravado()).toMatchObject({ folhaDaTimeline: folha });
  });

  /**
   * O MAPA DE MESAS (14/10). Declarado na lista do que a rota aceita E no
   * esquema — sem os dois, o PATCH respondia 200 e não gravava nada, como já
   * aconteceu com a folha do guião aqui em cima.
   */
  it("grava o mapa de mesas", async () => {
    authed.ok = true;
    const mapa = {
      versao: 1,
      mesas: [{ id: "m1", nome: "Mesa 1", forma: "redonda", x: 200, y: 200, lugares: 8 }],
      elementos: [
        {
          id: "e1",
          tipo: "pista",
          nome: "Pista de dança",
          x: 600,
          y: 300,
          largura: 500,
          altura: 400,
        },
      ],
      lugares: { "m1:0": { convidadoId: "g1", n: 1 } },
    };
    const res = await PATCH(req("PATCH", { mapaDeMesas: mapa }), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(gravado()).toMatchObject({ mapaDeMesas: mapa });
  });

  it("recusa um mapa de mesas fora das regras", async () => {
    authed.ok = true;
    const mapa = {
      versao: 1,
      mesas: [{ id: "m1", nome: "Mesa 1", forma: "oval", x: 0, y: 0, lugares: 99 }],
      elementos: [],
      lugares: {},
    };
    const res = await PATCH(req("PATCH", { mapaDeMesas: mapa }), ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("o mapa de mesas mudado noutro sítio dá 409, com o que lá está", async () => {
    authed.ok = true;
    const noServidor = { versao: 1, mesas: [], elementos: [], lugares: {} };
    store.override = { mapaDeMesas: noServidor };
    const deManha = {
      versao: 1,
      mesas: [{ id: "m9", nome: "Mesa 9", forma: "quadrada", x: 0, y: 0, lugares: 4 }],
      elementos: [],
      lugares: {},
    };
    const res = await PATCH(
      req("PATCH", { mapaDeMesas: deManha, base: { mapaDeMesas: deManha } }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).current.mapaDeMesas).toEqual(noServidor);
  });

  it("apagar a referência do contrato não desfaz nada", async () => {
    authed.ok = true;
    store.override = { status: "aceite", contractRef: "2026-042" };
    await PATCH(req("PATCH", { contractRef: null }), ctx("LIQ-1"));
    expect(gravado()).not.toHaveProperty("status");
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * QUEM ESCOLHE O ESTADO À MÃO GANHA SEMPRE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Um arrasto no quadro é uma decisão de uma pessoa. Sem esta regra, marcar um
   * pedido como «Perdido» no mesmo gesto em que se corrige um pagamento fazia a
   * automação escrever «Ganho» por cima — e é também o que garante que
   * `rejeitado` continua a ser exclusivamente humano.
   */
  it("um estado escolhido no corpo do pedido não é discutido pela automação", async () => {
    authed.ok = true;
    store.override = { status: "cotado", payments: [] };
    await PATCH(
      req("PATCH", {
        status: "rejeitado",
        payments: [{ id: "p9", kind: "sinal", amount: 3000, date: "2026-07-01", paid: true }],
      }),
      ctx("LIQ-1"),
    );
    expect(gravado()).toMatchObject({ status: "rejeitado" });
  });

  it("não tira de «Perdido» um pedido que alguém deu por perdido", async () => {
    authed.ok = true;
    store.override = { status: "rejeitado", payments: [] };
    await PATCH(
      req("PATCH", {
        payments: [{ id: "p9", kind: "sinal", amount: 3000, date: "2026-07-01", paid: true }],
      }),
      ctx("LIQ-1"),
    );
    expect(gravado()).not.toHaveProperty("status");
  });

  it("deixa no histórico a linha que explica a mudança, sem apagar o que lá estava", async () => {
    authed.ok = true;
    store.override = { status: "cotado", payments: [] };
    await PATCH(
      req("PATCH", {
        payments: [{ id: "p9", kind: "sinal", amount: 3000, date: "2026-07-01", paid: true }],
      }),
      ctx("LIQ-1"),
    );
    const log = gravado().activityLog as { id: string; actor?: string; summary: string }[];
    // A entrada que já estava gravada sobrevive; a nova vem a seguir.
    expect(log).toHaveLength(2);
    expect(log[0].id).toBe("a1");
    expect(log[1].actor).toBe("Sistema");
    expect(log[1].summary).toContain("Ganho");
  });

  /**
   * O caminho de acrescentar ao histórico (`activityLogAppend`) e a transição
   * automática mexem no MESMO campo. Escritos por ordem errada, um apagava o
   * outro — e o que se perdia era precisamente a explicação da mudança.
   */
  it("convive com um acrescento ao histórico feito no mesmo pedido", async () => {
    authed.ok = true;
    store.override = { status: "cotado", payments: [] };
    await PATCH(
      req("PATCH", {
        payments: [{ id: "p9", kind: "sinal", amount: 3000, date: "2026-07-01", paid: true }],
        activityLogAppend: [
          { id: "nova", at: "2026-07-01T10:00:00.000Z", kind: "note_added", summary: "à mão" },
        ],
      }),
      ctx("LIQ-1"),
    );
    const log = gravado().activityLog as { id: string; summary: string }[];
    expect(log.map((e) => e.id)).toEqual(["a1", "nova", expect.any(String)]);
  });

  /** Guardar o pagamento tem de resultar mesmo que a conta do estado rebente. */
  it("uma nota ou uma etiqueta continuam a gravar sem ler o pedido sequer", async () => {
    authed.ok = true;
    await PATCH(req("PATCH", { adminNotes: "combinado por telefone" }), ctx("LIQ-1"));
    expect(store.get).not.toHaveBeenCalled();
    expect(gravado()).toEqual({ adminNotes: "combinado por telefone" });
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O GESTO NOVO PASSA PELA MESMA PORTA — E A PRODUÇÃO ARRANCA PREENCHIDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A pergunta «Já responderam?» do back office grava por AQUI, com o corpo que o
 * `corpoDaMarcacao` constrói. Se um dia esse corpo deixar de trazer o `status`
 * — ou se alguém lhe der uma rota «mais directa» — a marcação continuava a
 * parecer que resultava e a equipa perdia o plano de produção pré-preenchido,
 * sem ninguém ligar a perda ao gesto novo. É exactamente o que aconteceu quando
 * o botão «Aceitar proposta» do cliente saiu.
 */
describe("marcar o desfecho pela pergunta do back office", () => {
  const corpo = (desfecho: "ganho" | "perdido", valor?: number) =>
    corpoDaMarcacao({
      desfecho,
      valor,
      quem: "Catarina",
      quando: "2026-08-14T09:00:00.000Z",
      id: () => "entrada-1",
    });

  it("marcar «Ganho» semeia a produção, como o botão que saiu fazia", async () => {
    authed.ok = true;
    store.override = { status: "cotado" };
    const res = await PATCH(req("PATCH", corpo("ganho", 4600)), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(gravadoNaLoja()).toMatchObject({ status: "aceite", quotedPrice: 4600 });
    expect(semeador.semear).toHaveBeenCalledWith("LIQ-1", expect.any(String));
  });

  it("marcar «Perdido» não semeia nada", async () => {
    authed.ok = true;
    store.override = { status: "cotado" };
    const res = await PATCH(req("PATCH", corpo("perdido")), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(gravadoNaLoja()).toMatchObject({ status: "rejeitado" });
    expect(semeador.semear).not.toHaveBeenCalled();
  });

  /**
   * Um pedido perdido que se corrige para ganho é um pedido ganho: a produção
   * arranca na mesma, e a sementeira é idempotente (só preenche o que está
   * vazio), por isso corrigir para trás e para a frente não duplica tarefas.
   */
  it("corrigir um pedido perdido para ganho semeia à mesma", async () => {
    authed.ok = true;
    store.override = { status: "rejeitado" };
    await PATCH(req("PATCH", corpo("ganho", 5000)), ctx("LIQ-1"));
    expect(gravadoNaLoja()).toMatchObject({ status: "aceite", quotedPrice: 5000 });
    expect(semeador.semear).toHaveBeenCalledTimes(1);
  });

  /** O valor confirmado vai para o `quotedPrice` — e não para um campo novo. */
  it("o valor confirmado escreve no mesmo sítio que a Visão Geral soma", async () => {
    authed.ok = true;
    store.override = { status: "cotado" };
    await PATCH(req("PATCH", corpo("ganho", 0)), ctx("LIQ-1"));
    const escrito = gravadoNaLoja();
    expect(escrito.quotedPrice).toBe(0);
    expect(Object.keys(escrito)).not.toContain("valorGanho");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A ANÁLISE DE PROPOSTAS LÊ OUTRO LIVRO — ESTE PATCH TAMBÉM ESCREVE LÁ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `analise-de-propostas.ts` lê `Proposal.status` e `Proposal.lostReason`, não
 * `Quote`. Sem esta propagação, marcar «Ganho» aqui deixava a proposta em
 * «enviada» para sempre e a taxa de fecho ficava nula.
 */
describe("PATCH /api/orcamento/[id] — propaga o desfecho para a proposta", () => {
  const corpo = (desfecho: "ganho" | "perdido", valor?: number, motivo?: "preco" | "data") =>
    corpoDaMarcacao({
      desfecho,
      valor,
      motivo,
      quem: "Catarina",
      quando: "2026-08-14T09:00:00.000Z",
      id: () => "entrada-1",
    });

  it("marcar «Ganho» escreve status e respondedAt na proposta mais recente", async () => {
    authed.ok = true;
    store.override = { status: "cotado" };
    propostas.daQuote = proposta();
    await PATCH(req("PATCH", corpo("ganho", 4600)), ctx("LIQ-1"));

    expect(propostas.getByQuote).toHaveBeenCalledWith("LIQ-1");
    expect(propostas.update).toHaveBeenCalledWith(
      "prop-1",
      expect.objectContaining({ status: "aceite", respondedAt: expect.any(String) }),
    );
  });

  it("marcar «Perdido» escreve rejeitada na proposta, sem lostReason quando não veio nenhum", async () => {
    authed.ok = true;
    store.override = { status: "cotado" };
    propostas.daQuote = proposta();
    await PATCH(req("PATCH", corpo("perdido")), ctx("LIQ-1"));

    const patch = propostas.update.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(patch).toMatchObject({ status: "rejeitada" });
    expect("lostReason" in patch).toBe(false);
  });

  it("um motivo da lista fechada, mandado no próprio PATCH que perde, propaga", async () => {
    authed.ok = true;
    store.override = { status: "cotado" };
    propostas.daQuote = proposta();
    await PATCH(req("PATCH", corpo("perdido", undefined, "preco")), ctx("LIQ-1"));

    expect(propostas.update).toHaveBeenCalledWith(
      "prop-1",
      expect.objectContaining({ status: "rejeitada", lostReason: "preco" }),
    );
  });

  /**
   * O segundo passo de `PerguntaDeDesfecho`: o pedido já ficou «rejeitado»
   * num PATCH anterior, e chega só o motivo — sem `status` nenhum no corpo.
   */
  it("o motivo acrescentado DEPOIS (sem status no corpo) também propaga", async () => {
    authed.ok = true;
    store.override = { status: "rejeitado" };
    propostas.daQuote = proposta({ status: "rejeitada" });
    await PATCH(req("PATCH", corpoDoMotivo("data", "só tinham essa data livre")), ctx("LIQ-1"));

    expect(propostas.update).toHaveBeenCalledWith("prop-1", {
      lostReason: "data",
      lostNote: "só tinham essa data livre",
    });
  });

  /**
   * `lostReason` também é editável em texto livre noutro sítio (o editor do
   * pedido). Um texto fora da lista fechada não é uma das cinco palavras que
   * a contagem sabe ler — propagá-lo por cima do que a proposta já tinha era
   * estragar uma resposta com uma nota que não é dela.
   */
  it("um motivo em texto livre, fora da lista fechada, NÃO propaga para a proposta", async () => {
    authed.ok = true;
    store.override = { status: "rejeitado" };
    propostas.daQuote = proposta({ status: "rejeitada" });
    await PATCH(req("PATCH", { lostReason: "cancelaram tudo por causa da avó" }), ctx("LIQ-1"));

    expect(propostas.update).not.toHaveBeenCalled();
  });

  it("sem proposta nenhuma para o pedido, não rebenta — só não há nada a propagar", async () => {
    authed.ok = true;
    store.override = { status: "cotado" };
    propostas.daQuote = null;
    const res = await PATCH(req("PATCH", corpo("ganho", 4600)), ctx("LIQ-1"));

    expect(res.status).toBe(200);
    expect(propostas.update).not.toHaveBeenCalled();
  });

  it("uma mudança de estado que NÃO é ganho nem perdido não mexe na proposta", async () => {
    authed.ok = true;
    store.override = { status: "pendente" };
    propostas.daQuote = proposta();
    await PATCH(req("PATCH", { status: "em_revisao" }), ctx("LIQ-1"));

    expect(propostas.getByQuote).not.toHaveBeenCalled();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CONTRATO NASCE QUANDO A EQUIPA MARCA «GANHO» — POR ASSINAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `createContractIfAbsent` não tinha um único chamador de produção: nascia do
 * botão de aceitar que saiu. Sem isto o PDF do contrato, os termos com versão
 * e o botão do portal do casal ficavam órfãos para sempre.
 */
describe("PATCH /api/orcamento/[id] — o contrato nasce ao Ganho", () => {
  const corpoGanho = (valor = 4600) =>
    corpoDaMarcacao({
      desfecho: "ganho",
      valor,
      quem: "Catarina",
      quando: "2026-08-14T09:00:00.000Z",
      id: () => "entrada-1",
    });

  it("marcar «Ganho» faz nascer o contrato — por assinar, sem fingir um aceite", async () => {
    authed.ok = true;
    store.override = { status: "cotado" };
    propostas.daQuote = proposta();
    await PATCH(req("PATCH", corpoGanho(4600)), ctx("LIQ-1"));

    expect(contratos.criar).toHaveBeenCalledTimes(1);
    const contrato = contratos.criar.mock.calls[0][0] as Record<string, unknown>;
    expect(contrato).toMatchObject({
      quoteId: "LIQ-1",
      proposalId: "prop-1",
      clientName: "Ana Silva",
      clientEmail: "ana@example.com",
      status: "pendente",
    });
    expect(typeof contrato.termsVersion).toBe("string");
    expect(typeof contrato.termsSnapshot).toBe("string");
    expect((contrato.termsSnapshot as string).length).toBeGreaterThan(0);
    // Ninguém do lado do cliente assinou nada aqui — não se finge o aceite.
    expect(contrato).not.toHaveProperty("acceptedAt");
    expect(contrato).not.toHaveProperty("acceptedName");
    expect(contrato).not.toHaveProperty("acceptedIp");
  });

  it("marcar «Perdido» não faz nascer contrato nenhum", async () => {
    authed.ok = true;
    store.override = { status: "cotado" };
    propostas.daQuote = proposta();
    await PATCH(
      req(
        "PATCH",
        corpoDaMarcacao({
          desfecho: "perdido",
          quem: "Catarina",
          quando: "2026-08-14T09:00:00.000Z",
          id: () => "entrada-1",
        }),
      ),
      ctx("LIQ-1"),
    );

    expect(contratos.criar).not.toHaveBeenCalled();
  });

  it("o selo do PDF viaja para o contrato quando a proposta o tem", async () => {
    authed.ok = true;
    store.override = { status: "cotado" };
    propostas.daQuote = proposta({ pdfSha256: "abc123", pdfBytes: 45678 });
    await PATCH(req("PATCH", corpoGanho()), ctx("LIQ-1"));

    const contrato = contratos.criar.mock.calls[0][0] as Record<string, unknown>;
    expect(contrato.propostaPdfSha256).toBe("abc123");
    expect(contrato.propostaPdfBytes).toBe(45678);
  });

  it("sem selo na proposta, o contrato nasce sem selo — não se inventa um a posteriori", async () => {
    authed.ok = true;
    store.override = { status: "cotado" };
    propostas.daQuote = proposta();
    await PATCH(req("PATCH", corpoGanho()), ctx("LIQ-1"));

    const contrato = contratos.criar.mock.calls[0][0] as Record<string, unknown>;
    expect(contrato).not.toHaveProperty("propostaPdfSha256");
    expect(contrato).not.toHaveProperty("propostaPdfBytes");
  });

  it("corrigir um pedido perdido para ganho também faz nascer o contrato", async () => {
    authed.ok = true;
    store.override = { status: "rejeitado" };
    propostas.daQuote = proposta();
    await PATCH(req("PATCH", corpoGanho(5000)), ctx("LIQ-1"));

    expect(contratos.criar).toHaveBeenCalledTimes(1);
  });

  it("sem proposta para o pedido, não há contrato — mas o Ganho grava-se à mesma", async () => {
    authed.ok = true;
    store.override = { status: "cotado" };
    propostas.daQuote = null;
    const res = await PATCH(req("PATCH", corpoGanho()), ctx("LIQ-1"));

    expect(res.status).toBe(200);
    expect(contratos.criar).not.toHaveBeenCalled();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PAINEL DE «GANHO»: PRÉVIA E GERAÇÃO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `POST /api/orcamento/[id]` é a porta nova: `{ acao: "prever" }` devolve as
 * contagens sem escrever nada, `{ acao: "gerar" }` chama a geração a sério.
 * A matemática de cada peça (material, montagem, calendário, pagamentos) tem
 * os seus próprios testes em `semear-producao.test.ts`; aqui só se prende o
 * que É desta rota: autenticação, o estado exigido, e QUAL função é chamada.
 */
describe("POST /api/orcamento/[id] — o painel de geração ao Ganho", () => {
  it("requires authentication", async () => {
    const res = await POST(req("POST", { acao: "prever" }), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(semeador.prever).not.toHaveBeenCalled();
  });

  it("recusa uma acção desconhecida", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { acao: "apagar-tudo" }), ctx("LIQ-1"));
    expect(res.status).toBe(400);
  });

  it("recusa um corpo mal formado em vez de rebentar", async () => {
    authed.ok = true;
    const bad = new Request("https://liquen.test/api/orcamento/LIQ-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    }) as unknown as NextRequest;
    const res = await POST(bad, ctx("LIQ-1"));
    expect(res.status).toBe(400);
  });

  it("404 para um pedido que não existe", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { acao: "prever" }), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("recusa prever/gerar antes de o pedido estar «Ganho»", async () => {
    authed.ok = true;
    store.override = { status: "cotado" };
    const res = await POST(req("POST", { acao: "prever" }), ctx("LIQ-1"));
    expect(res.status).toBe(409);
    expect(semeador.prever).not.toHaveBeenCalled();
  });

  it("'prever' chama preverGeracaoDoEvento e não gerarEventoAoGanhar", async () => {
    authed.ok = true;
    store.override = { status: "aceite" };
    const res = await POST(req("POST", { acao: "prever" }), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(semeador.prever).toHaveBeenCalledTimes(1);
    expect(semeador.gerar).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ haQualquerCoisaAGerar: false });
  });

  it("'gerar' chama gerarEventoAoGanhar e devolve o que nasceu", async () => {
    authed.ok = true;
    store.override = { status: "aceite" };
    semeador.gerar.mockResolvedValueOnce({
      material: { linhas: 3, preservadas: 0 },
      montagem: { linhas: 2 },
      calendario: { linhas: 4 },
      pagamentos: { linhas: 2 },
    });
    const res = await POST(req("POST", { acao: "gerar" }), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(semeador.gerar).toHaveBeenCalledTimes(1);
    expect(semeador.prever).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({
      calendario: { linhas: 4 },
      pagamentos: { linhas: 2 },
    });
  });

  it("um erro na geração devolve 500 em vez de rebentar sem resposta", async () => {
    authed.ok = true;
    store.override = { status: "aceite" };
    semeador.gerar.mockRejectedValueOnce(new Error("falhou a ir buscar a proposta"));
    const res = await POST(req("POST", { acao: "gerar" }), ctx("LIQ-1"));
    expect(res.status).toBe(500);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA LISTA COPIADA DE MANHÃ NÃO ESCREVE POR CIMA DO QUE ACONTECEU AO ALMOÇO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel de Pagamentos e a Checklist copiam a colecção INTEIRA quando abrem
 * e mandam-na inteira de volta ao gravar. A gravação não é «marca este
 * pagamento como recebido»: é «substitui a lista de pagamentos por esta».
 *
 * MEDIDO no produto, e sem corrida nenhuma: painel aberto de manhã no
 * telemóvel, um pagamento dado por recebido no portátil ao meio-dia, um toque
 * no telemóvel à tarde — o `paid: true` voltava a `false` e as linhas novas
 * desapareciam, com as duas gravações a responder 200.
 *
 * O bloqueio optimista do `Repository` não apanha isto: ele relê e volta a
 * tentar, e o que volta a aplicar é a MESMA substituição completa.
 *
 * A correcção é o ecrã dizer de onde copiou (`base`), e o servidor recusar
 * quando essa base já não é a que está guardada.
 */
describe("PATCH /api/orcamento/[id] — a base de uma lista inteira", () => {
  const GRAVADO = [{ id: "p1", kind: "sinal", amount: 3000, date: "2026-06-05", paid: true }];

  it("aceita quando a base é exactamente o que está guardado", async () => {
    authed.ok = true;
    const res = await PATCH(
      req("PATCH", {
        payments: [
          ...GRAVADO,
          { id: "p2", kind: "saldo", amount: 7000, date: "2026-07-01", paid: false },
        ],
        base: { payments: GRAVADO },
      }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(200);
    expect(store.update).toHaveBeenCalled();
  });

  it("recusa com 409 quando a lista mudou por baixo — e o sinal recebido fica", async () => {
    authed.ok = true;
    // O que o telemóvel copiou de manhã: o sinal ainda por receber.
    const deManha = [{ id: "p1", kind: "sinal", amount: 3000, date: "2026-06-05", paid: false }];
    const res = await PATCH(
      req("PATCH", { payments: deManha, base: { payments: deManha } }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(409);
    // Nada foi gravado: o `paid: true` do meio-dia continua de pé.
    expect(store.update).not.toHaveBeenCalled();

    const corpo = await res.json();
    // As duas versões voltam, para o ecrã se pôr em dia sem perder o que escreveu.
    expect(corpo.current.payments).toEqual(GRAVADO);
    expect(corpo.submetido.payments).toEqual(deManha);
    expect(corpo.error).toMatch(/alterado noutro sítio/i);
  });

  it("a ordem por que as chaves foram escritas não conta", async () => {
    authed.ok = true;
    // A mesma linha, com as chaves noutra ordem — é o que uma ida e volta pelo
    // `jsonb` do Postgres pode devolver. Não pode dar colisão falsa.
    const baralhado = [{ paid: true, date: "2026-06-05", amount: 3000, kind: "sinal", id: "p1" }];
    const res = await PATCH(
      req("PATCH", { payments: [], base: { payments: baralhado } }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(200);
  });

  it("sem `base`, grava como sempre gravou", async () => {
    authed.ok = true;
    const res = await PATCH(req("PATCH", { payments: [] }), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(store.update).toHaveBeenCalled();
  });

  it("a base não é gravada — não é campo do pedido", async () => {
    authed.ok = true;
    await PATCH(req("PATCH", { payments: GRAVADO, base: { payments: GRAVADO } }), ctx("LIQ-1"));
    const patch = store.update.mock.calls[0][1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("base");
  });

  it("vale para a checklist, não só para os pagamentos", async () => {
    authed.ok = true;
    store.override = { checklist: [{ id: "c1", label: "Confirmar flores", done: true }] };
    const res = await PATCH(
      req("PATCH", {
        checklist: [{ id: "c1", label: "Confirmar flores", done: false }],
        base: { checklist: [{ id: "c1", label: "Confirmar flores", done: false }] },
      }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(409);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("vale para o guião do dia — o momento que ele acrescentou não se apaga", async () => {
    authed.ok = true;
    // O que ELE acrescentou no portátil ao meio-dia.
    store.override = {
      timeline: [
        { id: "t1", time: "17:00", title: "Cerimónia" },
        { id: "t9", time: "19:30", title: "Discurso do pai" },
      ],
    };
    // O que o telemóvel dela copiou de manhã, e continua a declarar.
    const deManha = [{ id: "t1", time: "17:30", title: "Cerimónia" }];
    const res = await PATCH(
      req("PATCH", { timeline: deManha, base: { timeline: deManha } }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(409);
    expect(store.update).not.toHaveBeenCalled();
    const corpo = await res.json();
    // As duas versões voltam: a do servidor para o ecrã se pôr em dia, e a
    // dela para o gesto não se perder na recusa.
    expect(corpo.current.timeline).toHaveLength(2);
    expect(corpo.submetido.timeline).toEqual(deManha);
  });

  it("vale para os custos do evento — o custo real que ele lançou não desaparece", async () => {
    authed.ok = true;
    store.override = {
      eventSuppliers: [
        {
          id: "f1",
          name: "Flores da Vila",
          category: "Floristas",
          estimatedCost: 400,
          actualCost: 4200,
          status: "contactado",
        },
      ],
    };
    // A lista de manhã, sem o `actualCost` — a margem do evento depende disto.
    const deManha = [
      {
        id: "f1",
        name: "Flores da Vila",
        category: "Floristas",
        estimatedCost: 400,
        status: "confirmado",
      },
    ];
    const res = await PATCH(
      req("PATCH", { eventSuppliers: deManha, base: { eventSuppliers: deManha } }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(409);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("e aceita o guião quando a base é exactamente a que está guardada", async () => {
    authed.ok = true;
    const guardado = [{ id: "t1", time: "17:00", title: "Cerimónia" }];
    store.override = { timeline: guardado };
    const res = await PATCH(
      req("PATCH", {
        timeline: [...guardado, { id: "t2", time: "20:00", title: "Jantar" }],
        base: { timeline: guardado },
      }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(200);
    expect(store.update).toHaveBeenCalled();
  });

  it("uma lista ausente e uma lista vazia são a mesma base", async () => {
    authed.ok = true;
    store.override = { productionPlan: undefined };
    const res = await PATCH(
      req("PATCH", {
        productionPlan: [{ id: "t1", label: "Montar arco", done: false }],
        base: { productionPlan: [] },
      }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/orcamento/[id] — «Anular» um Ganho leva o que ele arrastou", () => {
  /**
   * «tem que haver no site todo, em tudo aquilo que se faz, uma forma de voltar
   * atrás». Pôr em Ganho aceita a proposta e cria o contrato; o «Anular» do
   * estado leva os dois de volta — e só o «Anular».
   */
  it("com desfazerGanho: a proposta volta a enviada e o contrato pendente sai", async () => {
    authed.ok = true;
    store.override = { status: "aceite" };
    propostas.daQuote = proposta({ status: "aceite" });
    contratos.daProposta = { id: "c-1", status: "pendente" };
    const res = await PATCH(req("PATCH", { status: "cotado", desfazerGanho: true }), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(propostas.update).toHaveBeenCalledWith("prop-1", { status: "enviada", respondedAt: "" });
    expect(contratos.apagar).toHaveBeenCalledWith("c-1");
  });

  it("um contrato já marcado como assinado NÃO sai por arrasto", async () => {
    authed.ok = true;
    store.override = { status: "aceite" };
    propostas.daQuote = proposta({ status: "aceite" });
    contratos.daProposta = { id: "c-1", status: "aceite", registadoComo: "papel" };
    await PATCH(req("PATCH", { status: "cotado", desfazerGanho: true }), ctx("LIQ-1"));
    expect(contratos.apagar).not.toHaveBeenCalled();
  });

  it("sem desfazerGanho (o casamento caiu: Ganho → Perdido), nada se desfaz", async () => {
    authed.ok = true;
    store.override = { status: "aceite" };
    propostas.daQuote = proposta({ status: "aceite" });
    contratos.daProposta = { id: "c-1", status: "pendente" };
    await PATCH(req("PATCH", { status: "cotado" }), ctx("LIQ-1"));
    expect(contratos.apagar).not.toHaveBeenCalled();
    expect(propostas.update).not.toHaveBeenCalledWith("prop-1", {
      status: "enviada",
      respondedAt: "",
    });
  });
});
