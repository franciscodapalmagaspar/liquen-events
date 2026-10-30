import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { SITE } from "@/lib/site";

const authed = vi.hoisted(() => ({ ok: false }));
const quotes = vi.hoisted(() => ({
  get: vi.fn(async (id: string) =>
    id === "LIQ-1"
      ? {
          id: "LIQ-1",
          name: "Ana",
          email: "ana@x.pt",
          date: "2026-09-01",
          guests: 50,
          location: "Lisboa",
          status: quotes.estado,
        }
      : null,
  ),
  /** O estado GRAVADO do pedido — a decisão da transição lê-o daqui. */
  estado: "pendente" as string,
  /**
   * A rota grava com `updateQuoteWith` (e não `updateQuote`) porque a decisão
   * do estado tem de ser tomada sobre o pedido FRESCO — entre o `getQuote` do
   * princípio e a gravação há um PDF desenhado e um email enviado. O duplo
   * corre a mutação sobre o pedido gravado e guarda o resultado.
   */
  update: vi.fn(
    async (id: string, mutar: (q: Record<string, unknown>) => Record<string, unknown>) => {
      quotes.gravado = mutar({ id, name: "Ana", email: "ana@x.pt", status: quotes.estado });
      return quotes.gravado;
    },
  ),
  gravado: null as Record<string, unknown> | null,
}));
const proposals = vi.hoisted(() => ({
  create: vi.fn(async (_p?: unknown) => {}),
  listForQuote: vi.fn(
    async (): Promise<Record<string, unknown>[]> => [{ id: "p-existing", quoteId: "LIQ-1" }],
  ),
  /**
   * A segunda escrita: a que marca a proposta como enviada DEPOIS de o email
   * sair. O estado deixou de ser decidido na criação — ver a nota na rota.
   */
  update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
}));
const mail = vi.hoisted(() => ({ send: vi.fn(async (_opts?: unknown) => ({ sent: true })) }));
/**
 * O token do link de aceitação, aqui de mentira — mas COM o identificador que
 * lhe passaram lá dentro. Um duplo que devolvesse sempre a mesma corda deixava
 * a rota mintar o link para o pedido em vez de para a proposta sem ninguém dar
 * por isso: o email saía, o teste ficava verde, e o casal carregava num 404.
 */
const token = vi.hoisted(() => ({ create: vi.fn((proposalId: string) => `tok:${proposalId}`) }));
/**
 * O modelo «proposta-enviada» que ela tem GUARDADO — `null` por omissão, que é
 * o estado de quem nunca abriu o ecrã «Modelos de email». Aí sai o texto da
 * casa, exactamente como sempre saiu, e é isso que os testes do dinheiro (mais
 * abaixo) continuam a medir.
 */
const modelo = vi.hoisted(() => ({ get: vi.fn(async (_chave: string) => null as unknown) }));

vi.mock("@/lib/admin-auth", () => ({
  isAuthed: () => authed.ok,
  /** A assinatura ESCRITA no perfil da conta. Vazio = assina a casa, que é
   *  o comportamento certo sem `ADMIN_USERS` configurado. */
  assinaturaConfigurada: () => ({}),
}));
vi.mock("@/lib/quotes-store", () => ({ getQuote: quotes.get, updateQuoteWith: quotes.update }));
vi.mock("@/lib/proposals-store", () => ({
  createProposal: proposals.create,
  updateProposal: proposals.update,
  listProposalsForQuote: proposals.listForQuote,
}));
vi.mock("@/lib/mail", () => ({
  sendMail: mail.send,
  esc: (v: unknown) => String(v ?? ""),
  MAIL_TO: "team@example.com",
}));
vi.mock("@/lib/proposal-token", () => ({ createProposalToken: token.create }));
/**
 * O endereço que vai no email é composto no `proposta-link-curto` — curto
 * quando o armazenamento de estado responde, token assinado quando não
 * responde. Aqui interessa a OUTRA coisa: que leve o identificador da proposta
 * acabada de criar, e não o do pedido. O duplo passa pelo `token.create` para
 * essa asserção continuar a ser possível.
 *
 * O anfitrião está escrito à mão porque um `vi.hoisted` corre antes dos
 * `import`, e tem de ser igual ao `SITE.url` com que os testes comparam.
 */
vi.mock("@/lib/proposta-link-curto", () => ({
  enderecoDaProposta: async (propostaId: string) =>
    `https://liquen-events.com/proposta/${token.create(propostaId)}`,
}));
// Só o `getTemplate` é duplo: o `renderTemplate`, os campos de fusão e as
// sementes são os verdadeiros, para o que se mede aqui ser mesmo o caminho que
// leva o texto dela até ao email.
vi.mock("@/lib/email-templates-store", async (original) => {
  const real = await original<typeof import("@/lib/email-templates-store")>();
  return { ...real, getTemplate: modelo.get };
});
vi.mock("@/lib/proposal-pdf", () => ({
  renderProposalPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

import { GET, POST } from "./route";
import { dominioRecebeEmail } from "@/lib/dominio-do-email";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(method: "GET" | "POST", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento/LIQ-1/proposta", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const validItems = { lineItems: [{ description: "Decoração", qty: 1, unitPrice: 1000 }] };

beforeEach(() => {
  authed.ok = false;
  quotes.estado = "pendente";
  quotes.gravado = null;
  vi.clearAllMocks();
  modelo.get.mockResolvedValue(null);
});

describe("GET /api/orcamento/[id]/proposta", () => {
  it("rejects the unauthenticated with 401", async () => {
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(proposals.listForQuote).not.toHaveBeenCalled();
  });

  it("lists proposals for the quote for an admin", async () => {
    authed.ok = true;
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "p-existing", quoteId: "LIQ-1" }]);
  });
});

describe("POST /api/orcamento/[id]/proposta", () => {
  it("rejects the unauthenticated with 401 and creates nothing", async () => {
    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the quote does not exist", async () => {
    authed.ok = true;
    const res = await POST(req("POST", validItems), ctx("nope"));
    expect(res.status).toBe(404);
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it("rejects a proposal with no valid line items (400)", async () => {
    authed.ok = true;
    // Zero-qty lines are filtered out → empty → 400.
    const res = await POST(
      req("POST", { lineItems: [{ description: "X", qty: 0, unitPrice: 100 }] }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(400);
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it("creates + persists the proposal, emails the client, and advances the quote to cotado", async () => {
    authed.ok = true;
    const res = await POST(
      req("POST", { lineItems: [{ description: "Decoração", qty: 2, unitPrice: 1000 }] }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    // subtotal 2000, vat 0.23 → total 2460.
    expect(json.total).toBeCloseTo(2460, 5);
    expect(json.emailed).toBe(true);
    // Gravada ANTES do email (o link assinado tem de encontrar a proposta),
    // mas ainda POR ENVIAR — «enviada» é um facto que só acontece a seguir.
    expect(proposals.create).toHaveBeenCalledTimes(1);
    expect(proposals.create.mock.calls[0][0]).toMatchObject({
      quoteId: "LIQ-1",
      status: "rascunho",
      clientEmail: "ana@x.pt",
    });
    expect(proposals.create.mock.calls[0][0]).not.toHaveProperty("sentAt");
    expect(mail.send).toHaveBeenCalledTimes(1);
    // E depois de o correio a aceitar, aí sim.
    expect(proposals.update).toHaveBeenCalledTimes(1);
    expect(proposals.update.mock.calls[0][1]).toMatchObject({ status: "enviada" });
    expect(String(proposals.update.mock.calls[0][1].sentAt)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Quote status advances (best-effort) to cotado with the quoted total.
    // 2460 era o total COM IVA; o campo é o "Preço final (sem IVA)", portanto
    // grava-se o subtotal (2000). Ver a nota na rota.
    expect(quotes.gravado).toMatchObject({ status: "cotado", quotedPrice: 2000 });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * «VÁLIDA ATÉ INVALID DATE»
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A `validUntil` só era medida ao COMPRIMENTO, e a única coisa que a lia era
   * `new Date(validUntil + "T12:00:00")`. Um ano com cinco dígitos (o
   * `<input type="date">` do Chrome aceita-o) ou um rascunho restaurado com
   * «31/12/2026» punham «Válida até Invalid Date» no HTML, no texto simples e
   * no PDF anexo — nas três, porque a data é a mesma.
   *
   * Recusa-se ANTES de gastar seja o que for: nada gravado, nada enviado, e uma
   * frase que diz à Catarina o que corrigir.
   */
  it("recusa uma validade que não é uma data — sem gravar nem enviar nada", async () => {
    authed.ok = true;
    for (const validUntil of ["20266-12-31", "2026-2-3", "31/12/2026", "2026-02-31"]) {
      const res = await POST(req("POST", { ...validItems, validUntil }), ctx("LIQ-1"));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: expect.stringMatching(/aaaa-mm-dd/) });
    }
    expect(proposals.create).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("uma validade boa continua a sair por extenso nas duas versões do email", async () => {
    authed.ok = true;
    await POST(req("POST", { ...validItems, validUntil: "2026-12-31" }), ctx("LIQ-1"));
    const env = mail.send.mock.calls.at(-1)![0] as { html: string; text: string };
    // POR EXTENSO, que é o que o nome deste teste sempre disse e o código não
    // fazia: o `toLocaleDateString` sem opções dá o formato curto, e o curto em
    // Portugal é com barras. Uma data com barras é a data de um recibo, e este
    // é o email que acompanha uma proposta de casamento.
    expect(env.html).toContain("Válida até 31 de dezembro de 2026.");
    expect(env.text).toContain("Válida até 31 de dezembro de 2026.");
    expect(env.html).not.toContain("Invalid Date");
    expect(env.text).not.toContain("Invalid Date");
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O LINK DO EMAIL ABRE A PROPOSTA QUE ACABOU DE SER CRIADA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * É a única coisa que o email leva além do PDF, e já falhou duas vezes: uma a
   * abrir 404, outra a ser recusado com «esta proposta já não está disponível».
   * O token assina UM identificador — o da proposta —, e o pedido tem outro ao
   * lado (`LIQ-1`) que se parece com ele em tudo menos no que interessa.
   */
  it("manda no email um link assinado com o id da proposta acabada de criar", async () => {
    authed.ok = true;
    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    const { id: idDaProposta } = await res.json();
    const enviado = mail.send.mock.calls[0][0] as { html: string; text: string };
    const link = `${SITE.url}/proposta/tok:${idDaProposta}`;
    expect(enviado.html).toContain(link);
    expect(enviado.text).toContain(link);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * REENVIAR UMA PROPOSTA NÃO DESFAZ UM NEGÓCIO GANHO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A rota escrevia `status: "cotado"` a seco. Rever a proposta DEPOIS do
   * aceite é coisa que acontece (o cálculo do saldo tem uma nota inteira sobre
   * isso) — e bastava reenviar o documento com uma linha corrigida para o
   * casamento fechado voltar a «Proposta enviada» no quadro, com o sinal já
   * emitido e pago. Um estado que anda para trás sozinho é a maneira mais
   * rápida de ela deixar de confiar na coluna.
   */
  it("não faz recuar um pedido já ganho, mas grava o preço novo na mesma", async () => {
    authed.ok = true;
    quotes.estado = "aceite";
    const res = await POST(
      req("POST", { lineItems: [{ description: "Decoração revista", qty: 1, unitPrice: 2500 }] }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(200);
    expect(quotes.gravado).toMatchObject({ status: "aceite", quotedPrice: 2500 });
  });

  /**
   * Ela vê a coluna mudar sozinha; sem uma linha no histórico não tem onde ir
   * ver porquê. A entrada é assinada pelo «Sistema» para se distinguir, na
   * mesma lista, do que foi ela a mudar à mão.
   */
  it("deixa no histórico a linha que explica a mudança automática", async () => {
    authed.ok = true;
    quotes.estado = "pendente";
    await POST(req("POST", validItems), ctx("LIQ-1"));
    const log = (quotes.gravado?.activityLog ?? []) as { actor?: string; summary: string }[];
    expect(log).toHaveLength(1);
    expect(log[0].actor).toBe("Sistema");
    expect(log[0].summary).toContain("Proposta enviada");
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O MESMO DEFEITO DA ROTA DO ESTÚDIO, NESTA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Com o SMTP em baixo (`sent:false`), esta rota gravava na mesma
   * `status:"enviada"` + `sentAt` e fazia o pedido avançar para «Proposta
   * enviada». O aviso do ecrã passa; o registo fica a dizer que a proposta está
   * à espera de uma resposta que ninguém pode dar.
   *
   * A proposta continua a ser GRAVADA — é o que impede as propostas fantasma,
   * e o link continua a servir assim que o estado acertar.
   */
  it("com o correio em baixo, a proposta fica guardada mas NÃO «enviada»", async () => {
    authed.ok = true;
    quotes.estado = "pendente";
    mail.send.mockResolvedValueOnce({ sent: false });

    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect((await res.json()).emailed).toBe(false);

    // Guardada — a protecção contra duplicados não regride.
    expect(proposals.create).toHaveBeenCalledTimes(1);
    // Mas por enviar, e sem hora de envio.
    expect(proposals.create.mock.calls[0][0]).toMatchObject({ status: "rascunho" });
    expect(proposals.create.mock.calls[0][0]).not.toHaveProperty("sentAt");
    expect(proposals.update, "nada sobe a «enviada» sem o email ter saído").not.toHaveBeenCalled();
    // E o pedido não avança para «Proposta enviada» — nem escreve a linha.
    expect(quotes.gravado).toMatchObject({ status: "pendente", quotedPrice: 1000 });
    expect(quotes.gravado).not.toHaveProperty("activityLog");
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O CORREIO QUE NÃO RESPONDE «NÃO» — ATIRA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O teste acima cobre o correio POR CONFIGURAR, que é o único caso em que o
   * `sendMail` promete não atirar («Resolves with { sent: false } (never
   * throws) when SMTP is unconfigured», em `mail.ts`). Todos os outros ATIRAM:
   * o servidor em baixo, a ligação a cair, as credenciais recusadas, o
   * destinatário rejeitado, o anexo acima do que o servidor aceita — e um PDF
   * de proposta com fotografias passa dos 8 MB com facilidade
   * (`LIMITE_DE_ANEXO`, em `custo-do-pdf.ts`).
   *
   * A proposta JÁ está gravada quando isso acontece — tem de estar, pela razão
   * escrita na rota: o link assinado vai dentro do email. Com a excepção a
   * subir até ao `catch` de topo, a resposta era 500 «Erro ao gerar a
   * proposta»: uma frase falsa (o PDF foi gerado, e bem) que manda quem a lê
   * carregar outra vez no botão — e cada tentativa grava MAIS UMA proposta.
   * São as «propostas fantasma» que esta mesma rota já descreve por extenso no
   * caso do pedido sem email, a entrar pela porta do lado.
   *
   * É a rota irmã (`proposta-doc`) que faz o que se pede aqui: 200, `emailed:
   * false`, e uma frase em português que diz o que se passou.
   */
  it("com o servidor de correio a atirar, a proposta não vira 500 nem se duplica", async () => {
    authed.ok = true;
    quotes.estado = "pendente";
    mail.send.mockRejectedValueOnce(new Error("connect ECONNREFUSED 1.2.3.4:587"));

    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    expect(res.status, "um envio falhado não é um erro a gerar a proposta").toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(false);
    expect(body.emailError, "tem de dizer o que se passou, em português").toBeTruthy();
    expect(String(body.emailError)).toMatch(/email|correio/i);

    // Gravada uma vez, e por enviar — para o reenvio não criar uma segunda.
    expect(proposals.create).toHaveBeenCalledTimes(1);
    expect(proposals.create.mock.calls[0][0]).toMatchObject({ status: "rascunho" });
    expect(proposals.update, "nada sobe a «enviada» sem o email ter saído").not.toHaveBeenCalled();
    // E o pedido não avança para «Proposta enviada»: o preço grava-se, o estado não.
    expect(quotes.gravado).toMatchObject({ status: "pendente", quotedPrice: 1000 });
  });

  it("returns 503 (does not send an un-acceptable proposal) when persistence fails", async () => {
    authed.ok = true;
    proposals.create.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    expect(res.status).toBe(503);
    expect(mail.send).not.toHaveBeenCalled();
  });
});

/**
 * A proposta é o email de maior valor que sai daqui. Levava um rodapé de uma
 * linha escrito à mão; passa a levar a assinatura da casa — sem perder o PDF,
 * que é o ponto todo da mensagem.
 */
describe("POST /api/orcamento/[id]/proposta — assinatura", () => {
  it("assina o email da proposta e mantém o PDF em anexo", async () => {
    authed.ok = true;
    await POST(req("POST", validItems), ctx("LIQ-1"));
    const env = mail.send.mock.calls.at(-1)![0] as {
      html: string;
      text: string;
      attachments?: { cid?: string; filename: string }[];
    };
    expect(env.html).toContain("Catarina Gaspar");
    expect(env.html).toContain("Manager");
    expect(env.html).toContain(SITE.phoneDisplay);
    expect(env.text).toContain("Catarina Gaspar");
    expect(env.text).toContain(SITE.phoneDisplay);
    // A faixa da casa viaja COM a mensagem — nada de imagens remotas. (Era o
    // logótipo; passou a ser a faixa quando a assinatura passou a ser a dela:
    // sem marca por cima do nome, com a faixa a fechar. Ver `email-assinatura`.)
    expect(env.attachments?.some((a) => a.cid === "liquen-banner")).toBe(true);
    expect(env.attachments?.some((a) => a.filename.endsWith(".pdf"))).toBe(true);
    expect(env.html).not.toMatch(/<img[^>]+src="https?:/);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O ASSUNTO É PARA QUEM O LÊ, E QUEM O LÊ É O CASAL
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Levava `proposal.id.slice(0, 8)` — oito caracteres do `randomUUID()` que
   * numera a proposta na nossa base. Na caixa de correio do casal lia-se
   * «Proposta para o seu evento — Líquen Events (3f2b1c9a)»: um bloco de
   * hexadecimal que não diz nada a ninguém — nem ao estúdio, cuja referência é
   * a `LIQ-…` que a confirmação mandou o cliente guardar — e que num telemóvel
   * come os caracteres do assunto que ainda se veem.
   *
   * Sai, e não é substituído: o email mais lido da casa (a confirmação do
   * pedido) também não põe referência nenhuma no assunto, e o que junta a
   * conversa na caixa dele são os cabeçalhos `In-Reply-To`/`References`, nunca
   * o assunto.
   */
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * UMA SAUDAÇÃO É PELO PRIMEIRO NOME
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O `quote.name` é o que a pessoa escreveu no formulário público, e há quem
   * escreva lá o nome legal inteiro. Saiu mesmo, a 27 e 28 de Julho, no email
   * de confirmação: «Olá Francisco Maria Carrelhas Das Neves Da Palma Gaspar,».
   * Essa saudação já foi corrigida; esta rota ficou para trás com o nome cru.
   *
   * Só o PRIMEIRO nome: é a mesma forma que o mensageiro já usa.
   */
  it("saúda pelo primeiro nome, e não pelo nome legal inteiro", async () => {
    authed.ok = true;
    quotes.get.mockResolvedValueOnce({
      id: "LIQ-1",
      name: "Francisco Maria Carrelhas Das Neves Da Palma Gaspar",
      email: "f@x.pt",
      date: "2026-09-01",
      guests: 50,
      location: "Lisboa",
      status: quotes.estado,
    });
    await POST(req("POST", validItems), ctx("LIQ-1"));
    const env = mail.send.mock.calls.at(-1)![0] as { html: string; text: string };
    expect(env.html).toContain("Olá Francisco,");
    expect(env.text).toContain("Olá Francisco,");
    expect(env.html).not.toContain("Carrelhas");
    expect(env.text).not.toContain("Carrelhas");
  });

  it("não põe o identificador interno da proposta no assunto", async () => {
    authed.ok = true;
    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    const { id } = await res.json();
    const env = mail.send.mock.calls.at(-1)![0] as { subject: string };
    expect(env.subject).toBe("A vossa proposta — Líquen Events");
    expect(env.subject).not.toContain(String(id).slice(0, 8));
    expect(env.subject).not.toMatch(/[0-9a-f]{8}/i);
  });

  it("deixou de escrever o rodapé à mão", async () => {
    authed.ok = true;
    await POST(req("POST", validItems), ctx("LIQ-1"));
    const env = mail.send.mock.calls.at(-1)![0] as { html: string };
    expect(env.html).not.toContain("Líquen Events · ");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O EMAIL TEM DE DIZER O MESMO NÚMERO QUE O PDF QUE LEVA EM ANEXO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O PDF escreve «7.890,00 €» — é a pontuação portuguesa, e é a que ela própria
 * escreve à mão no «Valor Total». O email, que sai do mesmo POST e transporta
 * esse PDF, dizia «7890,00 €»: o `Intl` de pt-PT só agrupa a partir de cinco
 * dígitos e agrupa com espaço inquebrável, nunca com ponto.
 *
 * Dois números diferentes para o mesmo valor, a um clique de distância um do
 * outro, é o género de pormenor que faz um casal perguntar se os números vieram
 * de sítios diferentes.
 */
describe("POST /api/orcamento/[id]/proposta — o dinheiro no email", () => {
  /**
   * O espaço antes do «€» é INQUEBRÁVEL e escreve-se por extenso: à letra, num
   * ficheiro de texto, é indistinguível de um espaço normal — e uma expectativa
   * com o espaço errado documenta o contrário do que se quer.
   */
  const EURO = "\u00A0€";

  /** O corpo do email, HTML e texto simples, no último envio. */
  function corpos(): string[] {
    const env = mail.send.mock.calls.at(-1)![0] as { html: string; text?: string };
    return [env.html, env.text ?? ""];
  }

  /**
   * Uma linha com um preço unitário realista — DUAS casas, como o campo do
   * estúdio. O que a seguir se verifica é o TOTAL que a rota calcula a partir
   * dele, que é o único número que este email imprime.
   *
   * ── PORQUE É QUE ISTO DEIXOU DE SER `total / 1.23` ────────────────────────
   * A fixture antiga fabricava um preço unitário com treze casas decimais
   * (7890 / 1,23 = 6414,634146341464) para aterrar num total redondo. Desde que
   * a rota arredonda ao cêntimo antes de somar — a correcção do A1-001, que é o
   * que faz as três parcelas do PDF fecharem — esse total deixou de ser
   * alcançável: um subtotal de 6.414,63 € dá 7.889,99 €, e 7.890,00 exactos não
   * saem de subtotal nenhum em cêntimos.
   *
   * Estes quatro testes são sobre o FORMATO — o ponto dos milhares e o espaço
   * inquebrável antes do € —, não sobre um valor em concreto. Os subtotais
   * abaixo foram escolhidos para dar totais com o mesmo NÚMERO DE DÍGITOS que
   * os de antes, que é a única coisa que o formato vê.
   */
  const porTotal = (valor: number) => ({
    lineItems: [{ description: "Decoração", qty: 1, unitPrice: valor }],
  });

  it("escreve os milhares com PONTO, mesmo com quatro dígitos", async () => {
    authed.ok = true;
    await POST(req("POST", porTotal(6000)), ctx("LIQ-1"));
    // 6.000,00 + 23% = 7.380,00 — quatro dígitos, ponto nos milhares.
    for (const corpo of corpos()) {
      expect(corpo).toContain(`7.380,00${EURO}`);
      expect(corpo).not.toContain(`7380,00${EURO}`);
    }
  });

  it("24 600 € sai igual ao PDF — e não com o espaço do Intl", async () => {
    authed.ok = true;
    await POST(req("POST", porTotal(20000)), ctx("LIQ-1"));
    // 20.000,00 + 23% = 24.600,00 — o mesmo número de sempre, agora derivado
    // de um preço que uma pessoa consegue escrever.
    for (const corpo of corpos()) {
      expect(corpo).toContain(`24.600,00${EURO}`);
      expect(corpo).not.toContain(`24\u00A0600,00${EURO}`);
    }
  });

  it("999 € não leva separador nenhum", async () => {
    authed.ok = true;
    await POST(req("POST", porTotal(800)), ctx("LIQ-1"));
    // 800,00 + 23% = 984,00 — três dígitos, sem separador nenhum.
    for (const corpo of corpos()) {
      expect(corpo).toContain(`984,00${EURO}`);
      expect(corpo).not.toContain(`.984,00${EURO}`);
    }
  });

  it("um milhão leva os dois pontos", async () => {
    authed.ok = true;
    await POST(req("POST", porTotal(1000000)), ctx("LIQ-1"));
    // 1.000.000,00 + 23% = 1.230.000,00 — sete dígitos, os dois pontos.
    for (const corpo of corpos()) {
      expect(corpo).toContain(`1.230.000,00${EURO}`);
    }
  });

  /**
   * A FRONTEIRA É QUEM LÊ — e este teste é que a segura.
   *
   * A linha do histórico fica com o formato do back office (`eur`), e não
   * com o dos documentos. Não é esquecimento: o histórico só é lido no
   * painel (`ActivityLog.tsx`), e há rotas irmãs a escrever linhas da mesma
   * forma para o mesmo pedido. Mudar só esta punha o painel a mostrar o
   * mesmo valor de duas maneiras — o defeito outra vez, do lado de dentro.
   *
   * O que TEM de ser verdade é que o número do CLIENTE já saiu certo no
   * mesmo pedido: é isso que se verifica a seguir, lado a lado.
   */
  /**
   * ── AS TRÊS LINHAS DA FOLHA TÊM DE FECHAR ────────────────────────────────
   *
   * Da caça a bugs, A1-001. Uma linha de 36,50 € produzia, no PDF que segue em
   * anexo (`proposal-pdf.ts` desenha as três a partir destes campos):
   *
   *     Subtotal 36,50 €   ·   IVA (23%) 8,40 €   ·   TOTAL 44,89 €
   *
   * 36,50 + 8,40 = 44,90. O IVA real era 8,395 (arredonda para cima ao mostrar)
   * e o total real 44,895, que em vírgula flutuante é 44,89499999… e arredonda
   * para baixo. Cada parcela era arredondada só ao DESENHAR, e a conta nunca.
   *
   * O que se prende é a REGRA — as três parcelas que o casal vê na mesma folha
   * somam — e prende-se nos CAMPOS GRAVADOS, que são de onde o desenho os lê.
   * Um teste sobre o texto do email não servia: o email imprime só o total.
   */
  /** Os três números como ficam na proposta gravada — a fonte do PDF. */
  const gravados = () => {
    const p = (proposals.create.mock.calls.at(-1)?.[0] ?? {}) as Record<string, number>;
    return { subtotal: p.subtotal, vat: p.vat, total: p.total };
  };

  it.each([36.5, 85.5, 158.5, 183.5, 279.5, 304.5, 329.5, 354.5])(
    "subtotal %s: o TOTAL é exactamente subtotal + IVA, aos cêntimos",
    async (unit) => {
      authed.ok = true;
      await POST(
        req("POST", { lineItems: [{ description: "Decoração", qty: 1, unitPrice: unit }] }),
        ctx("LIQ-1"),
      );
      const { subtotal, vat, total } = gravados();
      // Cada um é um número de cêntimos — nenhum traz casas escondidas.
      // (`n * 100` não serve para o verificar: 19,67 × 100 dá
      //  1967,0000000000002 em vírgula flutuante, e o defeito seria do teste.)
      for (const n of [subtotal, vat, total]) expect(Number(n.toFixed(2))).toBe(n);
      // E a soma fecha. Antes desta correcção, 36,50 dava 36,50 + 8,40 = 44,89.
      expect(total).toBe(Math.round((subtotal + vat) * 100) / 100);
      expect(subtotal).toBe(unit);
    },
  );

  it("o caso que originou a queixa: 36,50 € dá 44,90 €, e não 44,89 €", async () => {
    authed.ok = true;
    await POST(
      req("POST", { lineItems: [{ description: "Decoração", qty: 1, unitPrice: 36.5 }] }),
      ctx("LIQ-1"),
    );
    expect(gravados()).toEqual({ subtotal: 36.5, vat: 8.4, total: 44.9 });
    // E é esse o número que o casal lê no email.
    for (const corpo of corpos()) expect(corpo).toContain(`44,90${EURO}`);
  });

  it("o histórico fica com o formato do painel; o email é que muda", async () => {
    authed.ok = true;
    await POST(req("POST", porTotal(4000)), ctx("LIQ-1"));
    // 4.000,00 + 23% = 4.920,00.
    const log = JSON.stringify(quotes.gravado?.activityLog ?? []);
    expect(log).toContain(`4920,00${EURO}`);
    for (const corpo of corpos()) expect(corpo).toContain(`4.920,00${EURO}`);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MODELO DELA É O EMAIL QUE SAI COM A PROPOSTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ecrã «Modelos de email» dizia, por baixo do «Proposta enviada», «Enviado ao
 * cliente quando a proposta segue» — e era falso: o `renderTemplate` não tinha
 * um único chamador, e o que saía era o HTML escrito à mão nesta rota. Passa a
 * ser verdade, com um recurso que nunca deixa sair um email vazio nem com um
 * buraco onde devia estar um dado.
 */
describe("POST /api/orcamento/[id]/proposta — o modelo «proposta-enviada»", () => {
  const enviado = () =>
    mail.send.mock.calls.at(-1)![0] as { subject: string; html: string; text: string };

  const modeloGuardado = (subject: string, body: string) => ({
    key: "proposta-enviada",
    name: "Proposta enviada",
    subject,
    body,
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  it("sem modelo guardado sai o texto da casa — o de sempre", async () => {
    authed.ok = true;
    await POST(req("POST", validItems), ctx("LIQ-1"));
    const email = enviado();
    expect(email.subject).toBe("A vossa proposta — Líquen Events");
    expect(email.html).toContain("Segue em anexo a proposta que preparámos");
  });

  it("com modelo guardado é o texto DELA que vai, assunto incluído", async () => {
    authed.ok = true;
    modelo.get.mockResolvedValue(
      modeloGuardado(
        "A sua proposta | Líquen Events",
        `<div style="max-width:560px"><p>Olá {nome}, a proposta está pronta.</p></div>`,
      ),
    );
    await POST(req("POST", validItems), ctx("LIQ-1"));
    const email = enviado();
    expect(email.subject).toBe("A sua proposta | Líquen Events");
    expect(email.html).toContain("Olá Ana, a proposta está pronta.");
    expect(email.html).not.toContain("Segue em anexo a proposta que preparámos");
    // A versão em texto simples é derivada do modelo, não mandada em branco
    // nem cheia de etiquetas — é ela que passa pelos filtros de spam.
    expect(email.text).toContain("Olá Ana, a proposta está pronta.");
    expect(email.text).not.toMatch(/[<>]/);
  });

  /**
   * O {link} tem de receber o link de aceitação VERDADEIRO — o token da
   * proposta que acabou de ser criada, e não o do pedido. Um duplo que
   * devolvesse sempre a mesma corda deixava passar exactamente esse defeito:
   * o email saía, o teste ficava verde, e o casal carregava num 404.
   */
  it("o {link} recebe o link de aceitação verdadeiro, com o token da proposta", async () => {
    authed.ok = true;
    modelo.get.mockResolvedValue(
      modeloGuardado("A sua proposta", `<p>Veja aqui: <a href="{link}">{link}</a></p>`),
    );
    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    const { id: proposalId } = await res.json();
    const esperado = `${SITE.url}/proposta/tok:${proposalId}`;
    expect(token.create).toHaveBeenCalledWith(proposalId);
    // O corpo é mesmo o DELA (e não o da casa, que também tem este link).
    expect(enviado().html).toContain("Veja aqui:");
    expect(enviado().html).toContain(`href="${esperado}"`);
    expect(enviado().text).toContain(esperado);
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O ENDEREÇO NÃO SE ESCREVE POR EXTENSO NA CARA DO CLIENTE
   * ════════════════════════════════════════════════════════════════════════
   *
   * Os dois editores de modelos escrevem o link como `<a href="{link}">{link}
   * </a>`, e o modelo por omissão também. O que chegava ao casal eram quatro
   * linhas de caracteres aleatórios — o desenho de uma mensagem de phishing, e
   * um dos padrões que os filtros de spam penalizam.
   */
  it("o token gigante fica só no href — o que se lê é uma frase", async () => {
    authed.ok = true;
    modelo.get.mockResolvedValue(
      modeloGuardado("A sua proposta", `<p>Veja aqui: <a href="{link}">{link}</a></p>`),
    );
    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    const { id: proposalId } = await res.json();
    const esperado = `${SITE.url}/proposta/tok:${proposalId}`;
    const email = enviado();
    expect(email.html).toContain(`href="${esperado}"`);
    expect(email.html).toContain(">Ver a proposta online<");
    // Fora do href não sobra nenhum endereço a fazer de texto.
    expect(email.html.replace(/href="[^"]*"/g, "")).not.toContain(esperado);
    // E a versão em texto simples diz o MESMO — duas alternativas que divergem
    // são, por si só, um sinal de spam.
    expect(email.text).toContain("Ver a proposta online");
    expect(email.text).toContain(esperado);
    expect(email.text).not.toMatch(/[<>]/);
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O CORPO ESCRITO À MÃO GANHA AO MODELO — E A SUA AUSÊNCIA NÃO MUDA NADA
   * ════════════════════════════════════════════════════════════════════════
   *
   * O modelo passa a ser o ponto de partida: quem envia reescreve o corpo antes
   * de carregar em Enviar, e é esse que sai. O que NÃO pode mudar é o envio sem
   * corpo nenhum — que é todo o correio que hoje sai daqui.
   */
  it("com corpo escrito à mão, é ele que sai — e o modelo fica de fora", async () => {
    authed.ok = true;
    modelo.get.mockResolvedValue(modeloGuardado("A sua proposta", `<p>Texto do modelo dela.</p>`));
    await POST(
      req("POST", { ...validItems, corpo: "Olá Ana,\nComo combinámos.\n\nAté já!" }),
      ctx("LIQ-1"),
    );
    const email = enviado();
    expect(email.html).toContain("Olá Ana,<br>Como combinámos.");
    expect(email.html).toContain("Até já!");
    expect(email.html).not.toContain("Texto do modelo dela.");
    expect(email.text).toContain("Olá Ana,\nComo combinámos.");
    // O ASSUNTO não se toca: continua a ser o dela.
    expect(email.subject).toBe("A sua proposta");
  });

  /**
   * O ESCAPE não se mede aqui, e é de propósito: este ficheiro troca o `esc`
   * pela identidade (ver o `vi.mock` de `@/lib/mail` lá em cima) para os testes
   * poderem ler os nomes por extenso, portanto um teste de escape nesta rota
   * ficava verde a dizer o contrário do que se passa em produção. Quem o prova é
   * o `email-corpo-escrito.test.ts`, com o `esc` verdadeiro — e a rota irmã
   * (`proposta-doc`), que não mexe no `esc`.
   *
   * O que se mede aqui é o que É desta rota: as quebras de linha dela chegam ao
   * email em parágrafos, e não coladas num bloco só.
   */
  it("as quebras de linha dela chegam ao email em parágrafos", async () => {
    authed.ok = true;
    await POST(req("POST", { ...validItems, corpo: "Um.\n\nDois." }), ctx("LIQ-1"));
    expect(enviado().html.match(/<p style="font-size:14px;line-height:1.6">/g)).toHaveLength(2);
  });

  /** A moldura da casa fecha sempre — um corpo escrito à mão não a substitui. */
  it("a assinatura da casa continua a fechar o email, e uma só vez", async () => {
    authed.ok = true;
    await POST(req("POST", { ...validItems, corpo: "Olá!" }), ctx("LIQ-1"));
    const email = enviado();
    expect(email.html).toContain("Catarina Gaspar");
    expect(email.html.match(/Catarina Gaspar/g)).toHaveLength(1);
    expect(email.html).toContain("cid:liquen-banner");
  });

  it("um corpo vazio ou só com espaços é como não vir nenhum", async () => {
    authed.ok = true;
    await POST(req("POST", { ...validItems, corpo: "   \n\n " }), ctx("LIQ-1"));
    expect(enviado().html).toContain("Segue em anexo a proposta que preparámos");
  });

  /**
   * Recusa-se, não se corta: um email cortado a meio de uma frase chega ao
   * cliente com ar de avaria e ninguém do lado de cá dá por isso.
   */
  it("um corpo acima do tecto é recusado com 400, e não se grava proposta nenhuma", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { ...validItems, corpo: "a".repeat(10_001) }), ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/demasiado longo/i);
    expect(mail.send).not.toHaveBeenCalled();
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it("um modelo guardado VAZIO não manda um email em branco — recorre ao texto da casa", async () => {
    authed.ok = true;
    modelo.get.mockResolvedValue(modeloGuardado("A sua proposta", `<div>\n  <p>   </p>\n</div>`));
    await POST(req("POST", validItems), ctx("LIQ-1"));
    expect(enviado().html).toContain("Segue em anexo a proposta que preparámos");
  });

  /**
   * `renderTemplate` troca por vazio o marcador que não conhece. Um modelo que
   * cite `{local}` num pedido sem local escreveria «no ». Ninguém está a ver
   * este envio para poder corrigir — e a proposta TEM de seguir —, por isso
   * cai-se no texto da casa, que não tem marcadores nenhuns.
   */
  it("um marcador sem valor não deixa sair o buraco — recorre ao texto da casa", async () => {
    authed.ok = true;
    // Um pedido de um particular: tem local e data, não tem empresa. O modelo
    // que cite `{empresa}` escreveria «para a » no assunto e «da » no corpo.
    modelo.get.mockResolvedValue(
      modeloGuardado("A sua proposta para a {empresa}", `<p>Olá {nome}, da {empresa}.</p>`),
    );
    await POST(req("POST", validItems), ctx("LIQ-1"));
    const email = enviado();
    expect(email.subject).toBe("A vossa proposta — Líquen Events");
    expect(email.subject).not.toContain("para a ");
    expect(email.html).not.toContain("da .");
  });

  /** O rodapé que os modelos guardados dela trazem lá dentro não pode sair
   *  colado à assinatura da casa, que o `emailAoCliente` põe sempre no fim. */
  it("o rodapé que vem DENTRO do modelo guardado não sai a dobrar", async () => {
    authed.ok = true;
    modelo.get.mockResolvedValue(
      modeloGuardado(
        "A sua proposta",
        [
          `<div style="max-width:560px">`,
          `  <p>Olá {nome},</p>`,
          `  <hr style="border:none;border-top:1px solid #eee">`,
          `  <p style="font-size:12px;color:#999">Líquen Events · Portugal</p>`,
          `</div>`,
        ].join("\n"),
      ),
    );
    await POST(req("POST", validItems), ctx("LIQ-1"));
    expect(enviado().html).not.toContain("Líquen Events · Portugal");
  });

  /**
   * O `{nome}` do modelo é o PRIMEIRO nome, como em todo o resto da casa — há
   * quem escreva o nome legal inteiro no formulário, e «Olá Francisco Maria
   * Carrelhas Das Neves Da Palma Gaspar,» já saiu mesmo assim daqui.
   *
   * O ESCAPE do valor não se mede neste ficheiro: o `esc` está aqui duplicado
   * pela identidade (ver o `vi.mock` de `@/lib/mail` lá em cima), portanto um
   * teste de escape aqui media o duplo e não o código. Vive em
   * `src/lib/email-modelos.test.ts`, com o `esc` verdadeiro.
   */
  it("o {nome} do modelo é o primeiro nome, não o nome legal inteiro", async () => {
    authed.ok = true;
    quotes.get.mockResolvedValue({
      id: "LIQ-1",
      name: "Francisco Maria Carrelhas Das Neves Da Palma Gaspar",
      email: "ana@x.pt",
      date: "2026-09-01",
      guests: 50,
      location: "Lisboa",
      status: "pendente",
    });
    modelo.get.mockResolvedValue(modeloGuardado("A sua proposta", `<p>Olá {nome},</p>`));
    await POST(req("POST", validItems), ctx("LIQ-1"));
    expect(enviado().html).toContain("Olá Francisco,");
    expect(enviado().html).not.toContain("Carrelhas");
  });

  it("uma avaria a ler a tabela dos modelos não impede a proposta de seguir", async () => {
    authed.ok = true;
    modelo.get.mockRejectedValue(new Error('relation "email_templates" does not exist'));
    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(enviado().html).toContain("Segue em anexo a proposta que preparámos");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM REENVIO REAPROVEITA A PROPOSTA POR ENVIAR — NÃO CRIA OUTRA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta rota criava sempre um identificador novo. Cada tentativa falhada
 * deixava uma linha a mais para o mesmo negócio — e isso não é só ruído no
 * ecrã «Propostas»: o `getProposalByQuote` devolve A MAIS RECENTE, portanto um
 * rascunho falhado do construtor, criado depois da proposta que o casal
 * recebeu, passava a ser o documento oficial do pedido. É dele que o portal do
 * casal mostra o total, e é dele que o contrato congela o selo e a versão.
 *
 * A própria mensagem de erro desta rota já prometia o contrário: «Reenvia daqui
 * a pouco: é a mesma proposta, não se cria outra.»
 */
describe("POST /api/orcamento/[id]/proposta — o reenvio não duplica", () => {
  beforeEach(() => {
    authed.ok = true;
  });

  const porEnviar = {
    id: "p-rascunho",
    quoteId: "LIQ-1",
    status: "rascunho",
    createdAt: "2026-05-01T09:00:00.000Z",
  };

  it("reaproveita a proposta que ficou por enviar", async () => {
    proposals.listForQuote.mockResolvedValueOnce([porEnviar]);
    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    // Nem linha nova, nem identificador novo.
    expect(proposals.create).not.toHaveBeenCalled();
    expect(proposals.update).toHaveBeenCalledWith(
      "p-rascunho",
      expect.objectContaining({ id: "p-rascunho", status: "rascunho" }),
    );
  });

  it("a data de nascimento é a da PRIMEIRA tentativa", async () => {
    proposals.listForQuote.mockResolvedValueOnce([porEnviar]);
    await POST(req("POST", validItems), ctx("LIQ-1"));
    // Reescrevê-la fazia a linha reaproveitada saltar para a frente de
    // propostas mais recentes — e a mais recente é a que o portal mostra.
    expect(proposals.update).toHaveBeenCalledWith(
      "p-rascunho",
      expect.objectContaining({ createdAt: "2026-05-01T09:00:00.000Z" }),
    );
  });

  it("uma proposta JÁ ENVIADA não é reaproveitada (controlo positivo)", async () => {
    proposals.listForQuote.mockResolvedValueOnce([
      { id: "p-enviada", quoteId: "LIQ-1", status: "enviada", createdAt: "2026-05-01T09:00:00Z" },
    ]);
    await POST(req("POST", validItems), ctx("LIQ-1"));
    // Uma revisão depois de a proposta ter seguido é uma proposta NOVA.
    expect(proposals.create).toHaveBeenCalled();
  });

  it("se a leitura das irmãs falhar, cria-se na mesma — não se trava o envio", async () => {
    proposals.listForQuote.mockRejectedValueOnce(new Error("base em baixo"));
    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(proposals.create).toHaveBeenCalled();
  });
});

/**
 * O DOMÍNIO DO EMAIL DO CLIENTE (pedido dela, 30/10). Recusa-se ANTES de
 * gravar a proposta: uma proposta gravada e não enviada é uma proposta
 * fantasma.
 */
describe("POST /api/orcamento/[id]/proposta — o domínio do email", () => {
  it("um domínio que não recebe correio dá 422 com a frase; nada gravado nem enviado", async () => {
    authed.ok = true;
    vi.mocked(dominioRecebeEmail).mockResolvedValueOnce(false);
    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    expect(res.status).toBe(422);
    expect((await res.json()).campo).toBe("email");
    expect(proposals.create).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });
});
