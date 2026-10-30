import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Proposal } from "@/lib/orcamento/types";
import { splitThirtySeventy } from "@/lib/money";
import { resolveValidUntil, type ProposalDoc } from "@/lib/proposal-doc";
import { chaveDoPdf } from "@/lib/proposal-pdf-chave";
import { ehIdiomaDaProposta } from "@/lib/proposal-doc-textos";
import fs from "node:fs";
import path from "node:path";

// ── Mock the auth + data layer + heavy PDF/mail side effects; keep the money
//    math (proposal-doc) and the route logic real ──
const created = vi.hoisted(() => ({ last: null as Proposal | null }));
/** O que o renderizador diz que ficou de fora, por teste: fotos que não
 *  resolveram (`missing`) e conteúdo que o desenho cortou (`truncations`). */
const renderMock = vi.hoisted(() => ({
  missing: 0,
  truncations: [] as { where: string; dropped: number; unit: "fotos" | "linhas" }[],
  /** Contagens a devolver POR CHAMADA, para poder testar a segunda tentativa
   *  do envio: a primeira falha, a segunda resolve. Vazio = usa `missing`. */
  sequencia: [] as number[],
  chamadas: 0,
}));
/** O que foi gravado no pedido (para verificar o "Preço final (sem IVA)"), e o
 *  estado em que o pedido está ANTES do envio — a transição decide sobre ele. */
const updated = vi.hoisted(() => ({
  last: null as Record<string, unknown> | null,
  estado: "pendente" as string,
  /** Faz a actualização do PEDIDO rebentar — a terceira escrita depois do
   *  correio, que falhava com um `log.error` e mais nada. */
  falhar: false,
}));

vi.mock("@/lib/admin-auth", () => ({
  isAuthed: () => true,
  /** A assinatura ESCRITA no perfil da conta. Vazio = assina a casa, que é
   *  o comportamento certo sem `ADMIN_USERS` configurado. */
  assinaturaConfigurada: () => ({}),
}));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: vi.fn(async (id: string) => ({
    id,
    email: "cliente@example.com",
    status: updated.estado,
  })),
  /**
   * A rota grava com `updateQuoteWith` e não com `updateQuote`: a decisão do
   * estado tem de ser tomada sobre o pedido FRESCO, e entre o `getQuote` do
   * princípio e a gravação desenha-se um PDF de uma dúzia de páginas e manda-se
   * um email. O duplo corre a mutação sobre o pedido gravado.
   */
  updateQuoteWith: vi.fn(
    async (id: string, mutar: (q: Record<string, unknown>) => Record<string, unknown>) => {
      if (updated.falhar) throw new Error("a base recusou o pedido");
      updated.last = mutar({ id, email: "cliente@example.com", status: updated.estado });
      return updated.last;
    },
  ),
}));
/** Avaria a injetar na PRIMEIRA gravação (a segunda é sempre aceite). Serve
 *  para retratar uma base onde a coluna `proposals.doc` ainda não existe. */
const store = vi.hoisted(() => ({
  failFirstWith: null as unknown,
  attempts: 0,
  /**
   * O que ficou mesmo GRAVADO, por identificador.
   *
   * O `created.last` só sabe o que foi passado à criação — e o estado de uma
   * proposta deixou de ser decidido aí: nasce «rascunho» e só sobe a «enviada»
   * quando o servidor de correio aceita o email. Sem esta tabela não havia como
   * afirmar em que estado a proposta FICOU, que é a mentira que se está a
   * corrigir.
   */
  linhas: new Map<string, Proposal>(),
}));
vi.mock("@/lib/proposals-store", () => ({
  createProposal: vi.fn(async (p: Proposal) => {
    store.attempts++;
    if (store.attempts === 1 && store.failFirstWith) throw store.failFirstWith;
    created.last = p;
    store.linhas.set(p.id, { ...p });
  }),
  updateProposal: vi.fn(async (id: string, patch: Partial<Proposal>) => {
    const actual = store.linhas.get(id);
    if (!actual) return null;
    const novo = { ...actual, ...patch };
    store.linhas.set(id, novo);
    return novo;
  }),
  listProposalsForQuote: vi.fn(async (quoteId: string) =>
    [...store.linhas.values()]
      .filter((p) => p.quoteId === quoteId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
  ),
}));
// The real renderer is server-only + rasterises a PDF; stub it to a byte or two.
vi.mock("@/lib/proposal-doc-render", () => ({
  renderStoredProposalDocPdf: vi.fn(async () => Buffer.from("%PDF-1.4")),
  // A rota passou a usar a variante que também conta as fotos que não
  // resolveram, para poder avisar antes de a proposta seguir para o cliente.
  renderStoredEditorialPdfWithReport: vi.fn(async () => {
    const i = renderMock.chamadas++;
    return {
      pdf: Buffer.from("%PDF-1.4"),
      missingImages: renderMock.sequencia.length
        ? (renderMock.sequencia[i] ?? 0)
        : renderMock.missing,
      truncations: renderMock.truncations,
    };
  }),
}));
/**
 * O modelo «proposta-enviada» que ela tem GUARDADO — `null` por omissão, que é
 * o estado de quem nunca abriu o ecrã «Modelos de email»: aí sai o texto da
 * casa, exactamente como sempre saiu. Só o `getTemplate` é duplo; o
 * `renderTemplate` e as sementes são os verdadeiros.
 */
const modelo = vi.hoisted(() => ({ get: vi.fn(async (_chave: string) => null as unknown) }));
vi.mock("@/lib/email-templates-store", async (original) => {
  const real = await original<typeof import("@/lib/email-templates-store")>();
  return { ...real, getTemplate: modelo.get };
});
vi.mock("@/lib/proposal-token", () => ({ createProposalToken: vi.fn(() => "tok") }));
/** O endereço do casal, sempre o mesmo, para as asserções poderem ser exactas.
 *  O que ele é POR DENTRO — código curto ou token — mede-se no
 *  `proposta-link-curto.test.ts`. */
vi.mock("@/lib/proposta-link-curto", () => ({
  enderecoDaProposta: async () => "https://liquen-events.com/proposta/tok",
  /** A derivação verdadeira, que é pura: as duas portas abrem com a mesma
   *  chave, portanto o PDF sai do mesmo endereço sem se emitir nada. */
  enderecoDoPdfDaProposta: (url: string) =>
    `${url.replace(/\/proposta\/([^/]+)$/, "/api/proposta/$1")}/pdf`,
}));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async () => ({ sent: true })),
  // O `esc` do duplo escapa MESMO, como o verdadeiro (`src/lib/mail.ts`). Era
  // a identidade, e com ela nenhum teste conseguia ver a diferença entre um
  // texto escapado e um texto cru — que é precisamente o que a mensagem
  // pessoal (escrita à mão, com `<` e `&` lá dentro) obriga a garantir.
  esc: (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;"),
  MAIL_TO: "team@example.com",
}));
/**
 * A CÓPIA DO QUE SEGUIU.
 *
 * Duplo e não o verdadeiro: o verdadeiro escreve no `app_state` (base de
 * dados). O que interessa aqui é o QUE se guarda — e que se guarda só depois de
 * o correio ter sido aceite.
 */
const copia = vi.hoisted(() => ({
  /** Como o verdadeiro: o que se regista passa a estar na lista. A trava de
   *  repetição distingue por aqui um email que saiu de uma proposta marcada
   *  como enviada pelo WhatsApp (achado n.º 4), portanto o duplo tem de o
   *  fazer também. */
  registar: vi.fn(async (_quoteId: string, envio: { enviadoEm: string; propostaId?: string }) => {
    copia.lista.push(envio);
    return { gravado: true };
  }),
  /** O REGISTO de envios do pedido — a trava de repetição passou a lê-lo, para
   *  reconhecer um envio que aconteceu mesmo quando o `status` não gravou. */
  lista: [] as Array<{ enviadoEm: string; propostaId?: string }>,
}));
vi.mock("@/lib/envios-de-proposta", () => ({
  registarEnvio: copia.registar,
  listarEnvios: vi.fn(async () => copia.lista),
}));

import { GET, POST } from "./route";
import { sendMail } from "@/lib/mail";
import { dominioRecebeEmail } from "@/lib/dominio-do-email";
import { renderStoredEditorialPdfWithReport } from "@/lib/proposal-doc-render";
import { esvaziarPdfsFinais } from "@/lib/proposal-preview-cache";
import { createProposal, updateProposal } from "@/lib/proposals-store";
import { textosDoEmailDaProposta } from "@/lib/email-proposta-textos";

/** Minimal studio doc — only `ref` + `clientNames` are validated by the route;
 *  the money fields under test are added per-case. */
function baseDoc(over: Record<string, unknown> = {}) {
  return {
    template: "decoracao",
    ref: "PO Decoração Teste",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "3 de julho de 2027",
    location: "Évora",
    guests: "150 pax",
    serviceGroups: [],
    moodBoards: [],
    budgetItems: [],
    totalLabel: "Valor Total Decoração",
    totalText: "",
    coverImages: [],
    ...over,
  };
}

/**
 * A chave do PDF final que o estúdio viu — a mesma conta da rota (o documento
 * tal como chega, sem as `fotosDeBiblioteca`, na língua pedida).
 */
function chaveVista(doc: Record<string, unknown>, idioma: unknown): string {
  const { fotosDeBiblioteca: _o, ...semOrigens } = JSON.parse(JSON.stringify(doc));
  return chaveDoPdf(semOrigens as ProposalDoc, ehIdiomaDaProposta(idioma) ? idioma : "pt");
}

/** Um envio como o do estúdio: com o PDF final visto e confirmado, a não ser
 *  que `extra` diga outra coisa (`pdfVisto: undefined` tira-o). */
function sendReq(doc: Record<string, unknown>, extra: Record<string, unknown> = {}): NextRequest {
  return new Request("https://liquen.test/api/orcamento/q1/proposta-doc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "send",
      doc,
      pdfVisto: chaveVista(doc, extra.idioma),
      ...extra,
    }),
  }) as unknown as NextRequest;
}

function previewReq(doc: Record<string, unknown>): NextRequest {
  return new Request("https://liquen.test/api/orcamento/q1/proposta-doc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "preview", doc }),
  }) as unknown as NextRequest;
}

/**
 * Um pedido com o corpo escrito à mão — é preciso poder pôr no `idioma` coisas
 * que o tipo não deixa escrever (um `"fr"`, um número, um `null`), porque é
 * exactamente disso que a rota se tem de defender.
 */
function req(corpo: Record<string, unknown>): NextRequest {
  return new Request("https://liquen.test/api/orcamento/q1/proposta-doc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(comChave(corpo)),
  }) as unknown as NextRequest;
}

/** Um ENVIO escrito à mão leva a chave do PDF visto, como o do estúdio — a
 *  não ser que o próprio corpo já diga alguma coisa sobre ela. */
function comChave(corpo: Record<string, unknown>): Record<string, unknown> {
  if (corpo.mode !== "send" || "pdfVisto" in corpo || !corpo.doc) return corpo;
  return { ...corpo, pdfVisto: chaveVista(corpo.doc as Record<string, unknown>, corpo.idioma) };
}

const params = Promise.resolve({ id: "q1" });

beforeEach(() => {
  // O PDF final de cada versão fica na memória do processo; entre casos
  // esquece-se, para cada um desenhar o seu.
  esvaziarPdfsFinais();
  created.last = null;
  updated.last = null;
  updated.estado = "pendente";
  store.failFirstWith = null;
  store.attempts = 0;
  store.linhas.clear();
  copia.lista = [];
  copia.registar.mockImplementation(async (_q: string, envio: { enviadoEm: string }) => {
    copia.lista.push(envio);
    return { gravado: true };
  });
  updated.falhar = false;
  vi.clearAllMocks();
  modelo.get.mockResolvedValue(null);
});

describe("POST /api/orcamento/[id]/proposta-doc — money model", () => {
  it('"+ IVA" (acrescer): grosses up the total so total = base × (1 + IVA)', async () => {
    // Structured: 3000 base, IVA acresce.
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "acrescer" })), {
      params,
    });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.subtotal).toBe(3000); // base
    expect(p.vat).toBe(690); // 3000 × 0.23
    expect(p.total).toBe(3690); // gross = base × 1.23
    // The sinal must be 30% of the GROSS, not of the net.
    expect(splitThirtySeventy(p.total).sinal).toBe(1107); // 3690 × 0.3
  });

  it('"incluido": keeps total = amount and back-derives the base', async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3690, totalVatMode: "incluido" })), {
      params,
    });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.total).toBe(3690); // gross unchanged
    expect(p.subtotal).toBe(3000); // 3690 / 1.23
    expect(p.vat).toBe(690);
    expect(splitThirtySeventy(p.total).sinal).toBe(1107);
  });

  it("legacy free-text fallback: detects '+ IVA' in totalText and grosses up", async () => {
    // No structured fields — only the old free-text total with a "+ IVA" note.
    const res = await POST(sendReq(baseDoc({ totalText: "3.000,00 € + IVA" })), { params });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.subtotal).toBe(3000);
    expect(p.total).toBe(3690);
  });

  it("legacy free-text without a note is treated as IVA-included", async () => {
    const res = await POST(sendReq(baseDoc({ totalText: "3.690,00 €" })), { params });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.total).toBe(3690);
    expect(p.subtotal).toBe(3000);
  });

  // 60 dias e não 30: é o que a proposta que a Líquen fazia à mão dizia, e foi
  // a decisão dela quando as duas se contradisseram. Ver `DEFAULT_VALID_DAYS`.
  it("sets a default validUntil (~60 days out) when the doc carries no date", async () => {
    // Evento longe: a regra do evento (`diasDeValidadePeloEvento`) dá os 60.
    const res = await POST(
      sendReq(
        baseDoc({ totalAmount: 3000, totalVatMode: "incluido", eventDate: "3 de julho de 2099" }),
      ),
      { params },
    );
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days = (Date.parse(p.validUntil!) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(58);
    expect(days).toBeLessThan(61);
  });
});

describe("POST /api/orcamento/[id]/proposta-doc — fotos em falta no ENVIO", () => {
  /**
   * A contagem nasceu porque a Catarina recebeu um PDF com fotos a menos sem
   * ninguém a avisar. Mas ficou só no caminho da PRÉ-VISUALIZAÇÃO — e os passos
   * do estúdio são clicáveis, portanto dá para ir do Conteúdo direito ao Enviar
   * sem passar por lá. Nesse caminho o número era calculado e deitado fora, ou
   * seja o caso exacto que a magoou continuava possível.
   */
  beforeEach(() => {
    renderMock.missing = 0;
    renderMock.truncations = [];
    renderMock.sequencia = [];
    renderMock.chamadas = 0;
  });

  it("o envio devolve a contagem, não só a pré-visualização", async () => {
    renderMock.missing = 3;
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.missingImages).toBe(3);
  });

  it("com tudo resolvido, a contagem vai a zero (e não ausente)", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const body = await res.json();
    // Zero e não `undefined`: o cliente compara com 0, e um campo em falta
    // leria como "não sei" — que é precisamente o estado que se quer eliminar.
    expect(body.missingImages).toBe(0);
    expect(body.ok).toBe(true);
  });

  it("a proposta SEGUE à mesma, mesmo com fotos em falta", async () => {
    // Recusar o envio seria pior: ela fica sem nada e sem perceber porquê. Sai,
    // mas avisada.
    renderMock.missing = 5;
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    expect(created.last).toBeTruthy();
  });
});

describe("POST /api/orcamento/[id]/proposta-doc — o preço gravado no pedido", () => {
  /**
   * O campo chama-se "Preço final (sem IVA)" no ecrã, quem o escreve à mão
   * escreve-o líquido, e o `contractedAmounts` (dossier.ts) trata-o como
   * líquido: faz `gross = quotedPrice * (1 + taxa)`. Gravar aqui o valor COM
   * IVA punha as três coisas em desacordo e inflacionava a margem do evento em
   * cerca de 23% — o número que ela usa para saber se um casamento deu lucro.
   */
  it("grava o valor SEM IVA, não o valor com IVA", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "acrescer" })), {
      params,
    });
    expect(res.status).toBe(200);
    // 3000 + 23% = 3690. O que fica no pedido tem de ser 3000.
    expect(updated.last?.quotedPrice).toBe(3000);
    expect(updated.last?.quotedPrice).not.toBe(3690);
  });

  it("com o total já a incluir IVA, grava na mesma o líquido", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3690, totalVatMode: "incluido" })), {
      params,
    });
    expect(res.status).toBe(200);
    expect(updated.last?.quotedPrice).toBe(3000);
  });

  it("o valor gravado bate certo com o subtotal da proposta criada", async () => {
    // As duas coisas são escritas no mesmo pedido a partir da mesma conta; se
    // divergirem, um dos ecrãs mente sobre o mesmo casamento.
    await POST(sendReq(baseDoc({ totalAmount: 4000, totalVatMode: "acrescer" })), { params });
    expect(updated.last?.quotedPrice).toBe(created.last!.subtotal);
  });
});

describe("POST /api/orcamento/[id]/proposta-doc — conteúdo CORTADO pelo desenho", () => {
  /**
   * A outra maneira de o documento seguir incompleto: a foto chegou, foi
   * descarregada com sucesso, e a página não a desenha (a sétima de um mood
   * board, a terceira linha do "Local"). Não pode ficar dentro do servidor: se
   * não sair na resposta, o estúdio não tem como avisar antes do envio.
   */
  beforeEach(() => {
    renderMock.missing = 0;
    renderMock.truncations = [];
  });

  it("a pré-visualização leva o que foi cortado, com acentos intactos", async () => {
    renderMock.truncations = [{ where: "Mood board «Cerimónia»", dropped: 2, unit: "fotos" }];
    const res = await POST(previewReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    const header = res.headers.get("X-Conteudo-Cortado")!;
    expect(JSON.parse(Buffer.from(header, "base64").toString("utf8"))).toEqual(
      renderMock.truncations,
    );
  });

  it("sem cortes, o cabeçalho vai vazio (e não ausente)", async () => {
    const res = await POST(previewReq(baseDoc({ totalAmount: 3000 })), { params });
    const header = res.headers.get("X-Conteudo-Cortado")!;
    expect(JSON.parse(Buffer.from(header, "base64").toString("utf8"))).toEqual([]);
  });

  it("o ENVIO também o devolve — dá para saltar a pré-visualização", async () => {
    renderMock.truncations = [{ where: "Campo «Local»", dropped: 1, unit: "linhas" }];
    // Com a resposta já dada: o que se mede aqui é que a contagem VIAJA no
    // envio (a pergunta é o teste a seguir).
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 }), { cortesConfirmados: true }), {
      params,
    });
    const body = await res.json();
    expect(body.truncations).toEqual(renderMock.truncations);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O QUE FICOU CORTADO É UMA PERGUNTA, E NÃO UM AVISO DEPOIS DO EMAIL
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A contagem já viajava no envio — mas DENTRO da resposta, ou seja depois de
   * o email ter saído. Ela lia «o nome do casal não cabe na capa» com o casal
   * já a ter a proposta na caixa de correio, e um «&» solto no fim do nome.
   *
   * O que estes testes prendem é o instante: o PDF já está desenhado, a
   * proposta ainda NÃO foi gravada, o email ainda NÃO saiu. E que a pergunta
   * tem resposta — não é uma porta fechada, que é a regra dela sobre o envio.
   */
  it("pára ANTES de gravar e de enviar, e diz o que ficou cortado", async () => {
    renderMock.truncations = [
      { where: "Nome na capa", dropped: 2, unit: "linhas" },
      { where: "Mood board «Cerimónia»", dropped: 3, unit: "fotos" },
    ];
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status, "o envio seguiu sem perguntar nada").toBe(409);
    const body = await res.json();
    expect(body.precisaConfirmarCortes).toBe(true);
    // A lista viaja inteira: é ela que o estúdio mostra, corte a corte.
    expect(body.truncations).toEqual(renderMock.truncations);
    // E nada aconteceu no mundo: nem proposta gravada, nem email enviado.
    expect(createProposal, "gravou uma proposta antes de perguntar").not.toHaveBeenCalled();
    expect(sendMail, "o email saiu antes de perguntar").not.toHaveBeenCalled();
  });

  it("com a resposta dada, segue na mesma — a pergunta não é uma recusa", async () => {
    renderMock.truncations = [{ where: "Nome na capa", dropped: 2, unit: "linhas" }];
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 }), { cortesConfirmados: true }), {
      params,
    });
    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalled();
    // E continua a dizer o que ficou de fora: quem confirmou tem de o ver
    // escrito no fim, não só antes.
    expect((await res.json()).truncations).toEqual(renderMock.truncations);
  });

  it("sem nada cortado, o envio não pergunta coisa nenhuma", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalled();
  });

  /**
   * As FOTOS EM FALTA continuam a não travar nada. É uma decisão dela, escrita
   * na rota: «recusar seria pior — ela fica sem nada e sem perceber porquê».
   * Uma foto que não resolveu é uma avaria com segunda tentativa; um texto
   * cortado é uma escolha de composição a morder o conteúdo.
   */
  it("uma foto em falta não faz pergunta nenhuma — segue, como sempre seguiu", async () => {
    renderMock.missing = 2;
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).missingImages).toBe(2);
    expect(sendMail).toHaveBeenCalled();
  });
});

/**
 * O ORÇAMENTO DE TEMPO (A10-004, A10-005): um PDF lento empurrava o SMTP para
 * lá dos 60 s da função, e a plataforma matava o envio a meio.
 */
describe("o tempo que resta", () => {
  it("sem 25 s pela frente, o email não começa — e a frase diz para carregar outra vez", async () => {
    const real = Date.now;
    let agora = real();
    vi.spyOn(Date, "now").mockImplementation(() => agora);
    vi.mocked(renderStoredEditorialPdfWithReport).mockImplementationOnce(async () => {
      agora += 40_000; // o desenho levou 40 s
      return { pdf: Buffer.from("%PDF"), missingImages: 0, truncations: [] } as never;
    });
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    vi.mocked(Date.now).mockRestore();
    expect(sendMail).not.toHaveBeenCalled();
    const corpo = await res.json();
    expect(JSON.stringify(corpo)).toContain("carregue outra vez em enviar");
  });

  it("com fotos em falta e pouco tempo, não há segunda passagem do PDF", async () => {
    const real = Date.now;
    let agora = real();
    vi.spyOn(Date, "now").mockImplementation(() => agora);
    vi.mocked(renderStoredEditorialPdfWithReport).mockImplementationOnce(async () => {
      agora += 25_000;
      return { pdf: Buffer.from("%PDF"), missingImages: 1, truncations: [] } as never;
    });
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    vi.mocked(Date.now).mockRestore();
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledTimes(1);
  });
});

// ── O DOCUMENTO fica GUARDADO com a proposta ─────────────────────────────────
//
// Durante muito tempo não ficava: a proposta era gravada sem o `doc` e o
// documento morria com o pedido HTTP. O cliente recebia o PDF por email e, na
// página onde tinha de decidir, não havia botão nenhum para o rever (a página
// só o mostra quando há `doc`); reabrir a proposta no estúdio dava uma folha
// em branco. Estes testes guardam esse comportamento.
describe("POST /api/orcamento/[id]/proposta-doc — o documento fica guardado", () => {
  it("grava o `doc` com os CAMINHOS das fotos (é o que serve o PDF do link do cliente)", async () => {
    const doc = baseDoc({
      totalAmount: 3000,
      moodBoards: [{ title: "Cerimónia", images: ["q1/foto-1.jpg"] }],
      coverImages: ["q1/capa.jpg", ""],
    });
    const res = await POST(sendReq(doc), { params });
    expect(res.status).toBe(200);
    const guardado = created.last!;
    expect(guardado.doc).toBeTruthy();
    expect(guardado.doc!.ref).toBe("PO Decoração Teste");
    expect(guardado.doc!.moodBoards[0].images).toEqual(["q1/foto-1.jpg"]);
    expect(guardado.doc!.coverImages).toEqual(["q1/capa.jpg", ""]);
    // O texto fixo do estúdio também: é o que o PDF reimprime tal e qual.
    expect(guardado.doc!.condicoesGerais.length).toBeGreaterThan(0);
  });

  it("recusa (413) um documento acima do teto, sem sequer desenhar o PDF", async () => {
    // 512 KB (MAX_PROPOSAL_DOC_BYTES). Um `ProposalDoc` real são ~13 KB, e
    // 18,5 KB no tecto de fotos — isto só acontece com um cliente avariado ou
    // com bytes de imagem enfiados onde deviam estar caminhos.
    const enorme = baseDoc({ totalAmount: 3000, budgetItems: ["x".repeat(600 * 1024)] });
    const res = await POST(sendReq(enorme), { params });
    expect(res.status).toBe(413);
    expect(created.last).toBeNull();
    expect(renderStoredEditorialPdfWithReport).not.toHaveBeenCalled();
  });

  it("uma base sem a coluna `doc` guarda a proposta na mesma, e diz o que faltou", async () => {
    // O caso de quem publica o código antes de correr o db/schema.sql. Uma
    // proposta por enviar é um negócio parado; sem o documento é só um botão a
    // menos. Grava-se sem ele e devolve-se o motivo pelo nome.
    store.failFirstWith = {
      code: "42703",
      message: 'column "doc" of relation "proposals" does not exist',
    };
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.docSaved).toBe(false);
    expect(body.docError).toContain("db/schema.sql");
    // A proposta ficou mesmo guardada — sem documento, como antes desta coluna.
    expect(created.last).not.toBeNull();
    expect(created.last!.doc).toBeUndefined();
  });

  it("uma avaria QUALQUER a gravar continua a ser 503 (não se inventa um caminho alternativo)", async () => {
    store.failFirstWith = new Error("ligação perdida");
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(503);
    expect(created.last).toBeNull();
  });

  it("numa gravação normal a resposta NÃO leva `docSaved` (só o que falha sai pelo nome)", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const body = await res.json();
    expect("docSaved" in body).toBe(false);
    expect("docError" in body).toBe(false);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SEGUNDA TENTATIVA ANTES DE UMA PROPOSTA SEGUIR COM BURACOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A causa mais comum de uma foto não resolver é passageira: um pedido ao
 * armazenamento que expirou, uma ligação que caiu a meio de oitenta. O envio
 * desenhava UMA vez e mandava o que saísse.
 *
 * Isto NÃO recusa o envio — essa decisão está tomada noutro sentido, e com
 * razão escrita («recusar seria pior: ela fica sem nada e sem perceber
 * porquê»). O que faz é dar à proposta a segunda hipótese que quase sempre
 * basta.
 */
describe("POST /api/orcamento/[id]/proposta-doc — a segunda tentativa do envio", () => {
  beforeEach(() => {
    renderMock.missing = 0;
    renderMock.truncations = [];
    renderMock.sequencia = [];
    renderMock.chamadas = 0;
  });

  it("uma falha passageira é apanhada: a segunda tentativa resolve", async () => {
    renderMock.sequencia = [2, 0];
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledTimes(2);
    // A proposta que seguiu é a SEGUNDA, a que está completa.
    expect(body.missingImages).toBe(0);
  });

  it("com tudo resolvido à primeira NÃO se desenha duas vezes", async () => {
    // Repetir sempre seria pagar o desenho a dobrar em todos os envios bons.
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledTimes(1);
  });

  it("se a segunda correr PIOR, fica-se com a primeira", async () => {
    // Repetir nunca pode deixar a proposta pior do que estava.
    renderMock.sequencia = [1, 4];
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect((await res.json()).missingImages).toBe(1);
  });

  it("e continua a seguir, mesmo quando as duas falham", async () => {
    // A decisão de produto mantém-se: sai, mas avisada.
    renderMock.sequencia = [3, 3];
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).missingImages).toBe(3);
    expect(created.last).toBeTruthy();
  });

  it("a pré-visualização não repete — é onde ela DESCOBRE o que falta", async () => {
    renderMock.missing = 2;
    const res = await POST(previewReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.headers.get("X-Fotos-Em-Falta")).toBe("2");
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledTimes(1);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA COLUNA QUE FALTA NÃO PODE PARAR O NEGÓCIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «detetámos que não dá para mandar a proposta para o cliente».
 *
 * O `db/schema.sql` é corrido À MÃO. Numa base onde a versão nova ainda não foi
 * aplicada, as colunas novas não existem — e o envio passou a escrever SEMPRE o
 * selo do documento (`pdf_sha256`, `pdf_bytes`). O resgate que existia tirava só
 * o `doc`, portanto a segunda tentativa levava o selo na mesma, rebentava pela
 * mesma razão, e a resposta era 503. Tentar outra vez nunca resolvia.
 *
 * A pré-visualização continuava perfeita — devolve o PDF antes de chegar à
 * gravação. O documento via-se, o envio é que nunca ia.
 *
 * ── PORQUE É QUE OS TESTES NÃO APANHARAM ISTO ────────────────────────────
 *
 * Porque o duplo da loja falhava só na PRIMEIRA tentativa, fosse o que fosse
 * que a segunda levasse. Aqui o duplo falha pela razão VERDADEIRA — a coluna
 * não existe — e portanto falha as vezes que forem precisas até o código
 * deixar de a escrever.
 */
describe("POST /api/orcamento/[id]/proposta-doc — uma base sem as colunas novas", () => {
  /** O erro que o PostgREST devolve quando a coluna não existe. */
  const semColuna = (coluna: string) =>
    Object.assign(new Error(`Could not find the '${coluna}' column of 'proposals'`), {
      code: "PGRST204",
    });

  beforeEach(() => {
    renderMock.missing = 0;
    renderMock.truncations = [];
    renderMock.sequencia = [];
    renderMock.chamadas = 0;
    store.failFirstWith = null;
    store.attempts = 0;
    created.last = null;
  });

  it("a proposta SEGUE — sem o documento e sem o selo, mas segue", async () => {
    // Falha sempre que a gravação levar um campo que a base não conhece.
    const real = vi.mocked(createProposal);
    real.mockImplementation(async (p: Proposal) => {
      if (p.doc !== undefined) throw semColuna("doc");
      if (p.pdfSha256 !== undefined) throw semColuna("pdf_sha256");
      if (p.pdfBytes !== undefined) throw semColuna("pdf_bytes");
      created.last = p;
    });

    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status, "o envio não pode morrer por causa de uma coluna").toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // A proposta ficou gravada, sem os campos que a base não aceita.
    expect(created.last).toBeTruthy();
    expect(created.last!.doc).toBeUndefined();
    expect(created.last!.pdfSha256).toBeUndefined();
    expect(created.last!.pdfBytes).toBeUndefined();
    // E o email seguiu na mesma.
    expect(body.emailed).toBe(true);
  });

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * A COLUNA QUE FALTA NÃO PODE LEVAR O DOCUMENTO À FRENTE
   * ═════════════════════════════════════════════════════════════════════════
   *
   * ISTO ACONTECEU, e é o defeito mais caro que esta casa teve.
   *
   * A coluna `proposals.doc` existe naquela base desde 30 de julho. As do selo
   * da versão (`versao_selo`, `versao_numero`, `versao_em`) nasceram a 20 de
   * agosto. No primeiro envio depois disso, a base recusou o `versao_selo` — e
   * o resgate, para salvar três colunas que não existiam, deitou fora a única
   * que existia e a única que o casal vê.
   *
   * O casal recebeu a proposta em anexo, com quinze páginas e mood boards, e o
   * link ao lado abriu uma página com a saudação, o subtotal, o IVA e o total.
   * Nada disto deu erro.
   *
   * A base deste teste é a base dela: tem `doc`, não tem o selo.
   */
  it("uma base COM `doc` e sem o selo guarda o documento à mesma", async () => {
    const real = vi.mocked(createProposal);
    real.mockImplementation(async (p: Proposal) => {
      // Exactamente a base dela: o selo da versão não existe, o resto existe.
      if (p.versaoSelo !== undefined) throw semColuna("versao_selo");
      if (p.versaoNumero !== undefined) throw semColuna("versao_numero");
      if (p.versaoEm !== undefined) throw semColuna("versao_em");
      created.last = p;
    });

    const body = await (await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params })).json();
    expect(body.ok).toBe(true);
    expect(body.emailed).toBe(true);

    // O QUE ESTE TESTE EXISTE PARA PRENDER: o documento ficou lá.
    expect(created.last).toBeTruthy();
    expect(
      created.last!.doc,
      "o documento foi deitado fora para salvar colunas que não existem",
    ).toBeTruthy();
    // E o que a base não tem, não foi.
    expect(created.last!.versaoSelo).toBeUndefined();

    // Com o documento guardado, não se grita «o casal não vê a proposta» — o
    // aviso existe, mas é o outro, e não interrompe da mesma maneira.
    // `docSaved` só vem na resposta quando é FALSO (ver o fim da rota): a sua
    // ausência é a afirmação de que correu bem.
    expect(body.docSaved, "não pode dizer que o documento se perdeu").not.toBe(false);
    expect(body.docError ?? "", "a frase não pode dizer que o casal ficou sem nada").not.toMatch(
      /quadro com o preço/i,
    );
  });

  it("e o `pdf_sha256` em falta também não leva o documento à frente", async () => {
    const real = vi.mocked(createProposal);
    real.mockImplementation(async (p: Proposal) => {
      if (p.pdfSha256 !== undefined) throw semColuna("pdf_sha256");
      created.last = p;
    });
    const body = await (await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params })).json();
    expect(created.last!.doc, "só se tira o que falta").toBeTruthy();
    expect(created.last!.pdfSha256).toBeUndefined();
    expect(body.docSaved).not.toBe(false);
  });

  it("e diz o que se perdeu, com o nome do que é preciso correr", async () => {
    const real = vi.mocked(createProposal);
    real.mockImplementation(async (p: Proposal) => {
      if (p.doc !== undefined || p.pdfSha256 !== undefined) throw semColuna("pdf_sha256");
      created.last = p;
    });
    const body = await (await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params })).json();
    expect(body.docError, "tem de nomear o ficheiro a correr").toMatch(/db\/schema\.sql/);
    expect(body.docSaved).toBe(false);
  });

  /** Quando a base recusa mesmo o mínimo, aí sim é 503 — mas a frase deixa de
   *  mandar «tentar outra vez», que é o que nunca resolvia. */
  it("uma base que recusa tudo dá 503, e a frase diz onde procurar", async () => {
    vi.mocked(createProposal).mockImplementation(async () => {
      throw semColuna("client_name");
    });
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/db\/schema\.sql/);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * REENVIAR UMA PROPOSTA NÃO DESFAZ UM NEGÓCIO GANHO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A rota escrevia `status: "cotado"` a seco. Rever a proposta DEPOIS do aceite
 * é coisa que acontece a sério — o cálculo do saldo (faturas/[id]) tem uma nota
 * inteira sobre isso — e bastava reenviar o documento com uma linha corrigida
 * para o casamento fechado voltar a «Proposta enviada» no quadro, com o sinal
 * já emitido e pago. Um estado que anda para trás sozinho é a maneira mais
 * rápida de ela deixar de confiar na coluna.
 */
describe("POST /api/orcamento/[id]/proposta-doc — o estado nunca anda para trás", () => {
  // O bloco anterior deixa `createProposal` a atirar (retrata uma base sem as
  // colunas novas) e `mockImplementation` sobrevive ao `clearAllMocks`. Aqui a
  // gravação tem de correr bem, senão a rota nunca chega a tocar no pedido.
  beforeEach(() => {
    vi.mocked(createProposal).mockImplementation(async (p: Proposal) => {
      created.last = p;
    });
  });

  it("um pedido novo passa a «Proposta enviada»", async () => {
    updated.estado = "pendente";
    await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "acrescer" })), { params });
    expect(updated.last).toMatchObject({ status: "cotado", quotedPrice: 3000 });
  });

  it("um pedido já ganho fica ganho — mas o preço novo grava-se na mesma", async () => {
    updated.estado = "aceite";
    await POST(sendReq(baseDoc({ totalAmount: 5000, totalVatMode: "acrescer" })), { params });
    expect(updated.last).toMatchObject({ status: "aceite", quotedPrice: 5000 });
    // Sem transição não se escreve linha nenhuma: uma entrada «Ganho → Ganho»
    // seria ruído a esconder o que interessa numa lista que já é longa.
    expect(updated.last).not.toHaveProperty("activityLog");
  });

  it("deixa no histórico a linha que explica a mudança automática", async () => {
    updated.estado = "pendente";
    await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "acrescer" })), { params });
    const log = (updated.last?.activityLog ?? []) as { actor?: string; summary: string }[];
    expect(log).toHaveLength(1);
    expect(log[0].actor).toBe("Sistema");
    expect(log[0].summary).toContain("Proposta enviada");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MESMA PROPOSTA, NA LÍNGUA DO CASAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: preparar a proposta em português e, ao gerar, poder escolher que
 * o PDF saia em inglês. A língua é um parâmetro de DESENHO — entra no pedido,
 * nunca no documento guardado (ver o cabeçalho de `proposal-doc-textos`).
 *
 * O que estes testes guardam, por esta ordem de importância:
 *
 *  1. Um pedido SEM o campo tem de sair exactamente como saía. É todo o código
 *     que existia antes desta funcionalidade — e uma proposta antiga, reaberta.
 *  2. Um valor que não é uma língua NÃO deita a geração abaixo: cai no
 *     português. Este ficheiro existe por causa de «não dá para mandar a
 *     proposta para o cliente»; uma moldura por traduzir nunca vale um 400.
 *  3. O que vai ao gerador é o que veio no pedido, e nada mais.
 */
describe("POST /api/orcamento/[id]/proposta-doc — a língua com que se desenha", () => {
  beforeEach(() => {
    renderMock.missing = 0;
    renderMock.truncations = [];
    renderMock.sequencia = [];
    renderMock.chamadas = 0;
    // Os blocos acima deixam `createProposal` a atirar, e `mockImplementation`
    // sobrevive ao `clearAllMocks`.
    vi.mocked(createProposal).mockImplementation(async (p: Proposal) => {
      created.last = p;
    });
  });

  /**
   * A língua com que o gerador foi chamado à `n`-ésima vez.
   *
   * Lê os argumentos como `unknown[]` de propósito: a assinatura do gerador
   * está a ganhar o segundo parâmetro no módulo ao lado, e este teste não pode
   * depender de qual das duas versões está no disco — o que ele guarda é que a
   * rota PASSA a língua, não a forma exacta do tipo.
   */
  function idiomaDaChamada(n = 0): unknown {
    const chamada = vi.mocked(renderStoredEditorialPdfWithReport).mock.calls[n] as unknown[];
    const segundo = chamada?.[1];
    // Aceita as duas formas — `(doc, "en")` e `(doc, { idioma: "en" })` — porque
    // o que este teste guarda é que a rota PASSA a língua, não a forma exacta
    // com que o módulo ao lado a recebe.
    return typeof segundo === "string" ? segundo : (segundo as { idioma?: unknown })?.idioma;
  }

  it("com «en», é em inglês que o documento é desenhado", async () => {
    const res = await POST(req({ mode: "preview", idioma: "en", doc: baseDoc() }), { params });
    expect(res.status).toBe(200);
    expect(idiomaDaChamada()).toBe("en");
  });

  it("sem o campo, é português — o caminho de sempre não muda", async () => {
    const res = await POST(previewReq(baseDoc()), { params });
    expect(res.status).toBe(200);
    expect(idiomaDaChamada()).toBe("pt");
    // E o resto da resposta continua a ser o que era.
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("X-Fotos-Em-Falta")).toBe("0");
  });

  it("com «pt» explícito dá exactamente o mesmo que sem o campo", async () => {
    // É o que o botão manda no caminho por omissão: dizer a escolha em vez de a
    // deixar implícita na ausência do campo.
    const comCampo = await POST(req({ mode: "preview", idioma: "pt", doc: baseDoc() }), { params });
    expect(idiomaDaChamada()).toBe("pt");
    expect(comCampo.headers.get("Content-Disposition")).toBe(
      'inline; filename="proposta-preview.pdf"',
    );
  });

  /**
   * ── PORQUE É QUE ISTO NÃO É UM 400 ────────────────────────────────────────
   *
   * Cair em português é cair na língua em que a proposta foi ESCRITA: no pior
   * caso a moldura fica por traduzir, o que é o documento que sempre saiu, e ela
   * vê-o no PDF que abre a seguir. Recusar transformava o engano de um cliente
   * numa proposta que não sai — a avaria que o cabeçalho da rota conta.
   *
   * Não é silêncio: a rota regista o valor que recebeu, senão um cliente
   * avariado ficava escondido para sempre.
   */
  it.each([["fr"], [""], ["PT"], ["en-GB"]])(
    "um idioma que não existe (%j) cai no português em vez de recusar",
    async (mau) => {
      const res = await POST(req({ mode: "preview", idioma: mau, doc: baseDoc() }), { params });
      expect(res.status).toBe(200);
      expect(idiomaDaChamada()).toBe("pt");
    },
  );

  it.each([[42], [null], [{ idioma: "en" }], [["en"]]])(
    "e o mesmo quando nem sequer é texto (%j)",
    async (lixo) => {
      const res = await POST(req({ mode: "preview", idioma: lixo, doc: baseDoc() }), { params });
      expect(res.status).toBe(200);
      expect(idiomaDaChamada()).toBe("pt");
    },
  );

  it("o nome do ficheiro da pré-visualização segue a língua", async () => {
    // Duas versões da mesma proposta na pasta de transferências têm de se
    // distinguir sem as abrir.
    const en = await POST(req({ mode: "preview", idioma: "en", doc: baseDoc() }), { params });
    expect(en.headers.get("Content-Disposition")).toBe('inline; filename="proposal-preview.pdf"');
    const pt = await POST(previewReq(baseDoc()), { params });
    expect(pt.headers.get("Content-Disposition")).toBe('inline; filename="proposta-preview.pdf"');
  });

  it("a segunda tentativa do envio repete na MESMA língua", async () => {
    // Repetir é para apanhar uma foto que não resolveu. Se a repetição mudasse
    // de língua, o casal recebia a versão que ninguém escolheu — e só na vez em
    // que alguma coisa correu mal, que é quando ninguém está a olhar.
    renderMock.sequencia = [2, 0];
    const res = await POST(
      req({ mode: "send", idioma: "en", doc: baseDoc({ totalAmount: 3000 }) }),
      {
        params,
      },
    );
    expect(res.status).toBe(200);
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledTimes(2);
    expect(idiomaDaChamada(0)).toBe("en");
    expect(idiomaDaChamada(1)).toBe("en");
  });

  /**
   * A LÍNGUA DEIXOU DE MORRER NO FIM DO PEDIDO.
   *
   * Era este o defeito de fundo: a língua desenhava o PDF, nomeava o ficheiro e
   * desaparecia. Tudo o que vinha a seguir — o email que a transportava, a
   * página do aceite, o portal, a segunda descarga — não tinha como saber em
   * que língua a proposta tinha sido feita, e caía em português.
   */
  it("o envio GRAVA a língua na proposta", async () => {
    const res = await POST(
      req({ mode: "send", idioma: "en", doc: baseDoc({ totalAmount: 3000 }) }),
      {
        params,
      },
    );
    expect(res.status).toBe(200);
    expect(idiomaDaChamada()).toBe("en");
    expect(created.last!.idioma).toBe("en");
  });

  it("mas o DOCUMENTO guardado continua a ser um só, sem língua colada", async () => {
    // O que fica no `doc` é o que ela escreveu, em português. A língua é a
    // moldura com que foi desenhado, e vive ao lado — duas cópias do mesmo
    // documento em duas línguas eram duas coisas para manter coerentes.
    await POST(req({ mode: "send", idioma: "en", doc: baseDoc({ totalAmount: 3000 }) }), {
      params,
    });
    expect(created.last!.doc).toBeTruthy();
    expect(created.last!.doc).not.toHaveProperty("idioma");
  });

  it("sem língua no pedido grava-se «pt» — que é a língua com que se desenhou", async () => {
    // Não se deixa o campo em branco: a proposta FOI desenhada em português, e
    // isso é um facto sobre o PDF que o casal recebeu. Quem lê propostas
    // antigas (sem coluna nenhuma) já sabe que a ausência é português; nas
    // novas não há razão para deixar a pergunta por responder.
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(created.last!.idioma).toBe("pt");
  });

  it("a pré-visualização não grava nada — não há proposta nenhuma", async () => {
    await POST(req({ mode: "preview", idioma: "en", doc: baseDoc() }), { params });
    expect(created.last).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL QUE LEVA A PROPOSTA FALA A LÍNGUA DELA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: as propostas têm de poder ser feitas e traduzidas «de uma
 * forma espetacularmente bem». Um PDF inglês dentro de um email português não
 * é isso: o casal inglês recebia «A sua proposta — Líquen Events», «Segue em
 * anexo…» e um botão «Ver a proposta →» para chegar a um documento
 * que percebia.
 *
 * O que este bloco guarda: o inglês é inglês do assunto ao nome do anexo, e o
 * PORTUGUÊS NÃO MUDA UMA VÍRGULA.
 */
describe("POST /api/orcamento/[id]/proposta-doc — o email sai na língua da proposta", () => {
  const enviado = () =>
    vi.mocked(sendMail).mock.calls.at(-1)![0] as unknown as {
      subject: string;
      html: string;
      text: string;
      attachments?: { filename: string }[];
    };

  beforeEach(() => {
    vi.mocked(createProposal).mockImplementation(async (p: Proposal) => {
      created.last = p;
      store.linhas.set(p.id, { ...p });
    });
  });

  it("proposta inglesa: assunto, cumprimento, frase e botão em inglês", async () => {
    await POST(req({ mode: "send", idioma: "en", doc: baseDoc({ totalAmount: 3000 }) }), {
      params,
    });
    const email = enviado();
    expect(email.subject).toBe("Proposal for your event — Líquen Events");
    expect(email.html).toContain("Your proposal — Líquen Events");
    expect(email.html).toContain("Hello Maria &amp; Zé,");
    expect(email.html).toContain("Please find attached the proposal");
    expect(email.html).toContain("View the proposal");
    expect(email.text).toContain("View online:");
    // E não sobra uma palavra portuguesa do corpo antigo.
    expect(email.html).not.toContain("Olá Maria");
    expect(email.html).not.toContain("Segue em anexo");
    expect(email.text).not.toContain("Segue em anexo");
  });

  it("proposta inglesa: o anexo chama-se Proposal-… e não Proposta-…", async () => {
    await POST(req({ mode: "send", idioma: "en", doc: baseDoc({ totalAmount: 3000 }) }), {
      params,
    });
    const pdf = enviado().attachments?.find((a) => a.filename.endsWith(".pdf"));
    // O nome leva o casal e a data do evento — o identificador do pedido só
    // volta quando não há casal nenhum (ver `email-proposta-textos.test.ts`).
    expect(pdf?.filename).toBe("Proposal-Liquen-Events-Maria-e-Ze-03-07-2027.pdf");
  });

  it("proposta portuguesa: o email de sempre, palavra por palavra", async () => {
    await POST(req({ mode: "send", idioma: "pt", doc: baseDoc({ totalAmount: 3000 }) }), {
      params,
    });
    const email = enviado();
    expect(email.subject).toBe("A vossa proposta — Líquen Events");
    // «A VOSSA», e não «a sua»: uma proposta de casamento é para duas pessoas.
    // O nome deste teste — «o email de sempre, palavra por palavra» — nasceu de
    // um refactor que não podia mexer no texto; o texto mudou de propósito
    // desde então, e a afirmação que fica é que o português e o inglês não se
    // misturam, não que as palavras nunca mudam.
    expect(email.html).toContain("A vossa proposta — Líquen Events");
    expect(email.html).toContain("Olá Maria &amp; Zé,");
    expect(email.html).toContain("Segue em anexo a proposta que preparámos para o vosso dia.");
    expect(email.html).toContain("Ver a proposta");
    expect(enviado().attachments?.find((a) => a.filename.endsWith(".pdf"))?.filename).toBe(
      "Proposta-Liquen-Events-Maria-e-Ze-03-07-2027.pdf",
    );
  });

  it("sem língua no pedido (o caminho de sempre) o email continua português", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(enviado().subject).toBe("A vossa proposta — Líquen Events");
    expect(enviado().html).toContain("Segue em anexo a proposta que preparámos");
  });

  /**
   * ── A ASSINATURA DA CASA NÃO SE TRADUZ, E NÃO É ESQUECIMENTO ─────────────
   *
   * Lida linha a linha (`email-assinatura.ts`), a assinatura não tem uma única
   * frase portuguesa: é o NOME dela, o cargo («Manager», que já é inglês), o
   * telefone, o email, o endereço do site e os nomes das redes. Não há ali
   * nenhum «Com os melhores cumprimentos» a traduzir — o fecho do email é o
   * bloco de contactos, e um bloco de contactos é o mesmo em qualquer língua.
   *
   * Por isso o email inglês leva a assinatura EXACTAMENTE como o português. É
   * também a decisão que não mexe nos outros cinco caminhos que a usam.
   */
  it("a assinatura da casa vai igual nas duas línguas", async () => {
    await POST(req({ mode: "send", idioma: "en", doc: baseDoc({ totalAmount: 3000 }) }), {
      params,
    });
    const em = enviado();
    expect(em.html).toContain("Catarina Gaspar");
    expect(em.html).toContain("Manager");
    expect(em.html).toContain("+351 919 259 820");
    expect(em.text).toContain("Catarina Gaspar");
  });

  it("a mensagem pessoal dela entra no email inglês tal e qual a escreveu", async () => {
    // O que ela escreve é dela e não se traduz — é a mesma regra do documento,
    // onde os títulos e as legendas saem como foram escritos.
    await POST(
      req({
        mode: "send",
        idioma: "en",
        doc: baseDoc({ totalAmount: 3000 }),
        mensagem: "It was a pleasure meeting you at the estate.",
      }),
      { params },
    );
    const em = enviado();
    expect(em.html).toContain("It was a pleasure meeting you at the estate.");
    expect(em.html).toContain("Please find attached the proposal");
    expect(em.text).toContain("It was a pleasure meeting you at the estate.");
  });

  /**
   * ── O MODELO EDITÁVEL DELA E UMA PROPOSTA INGLESA ────────────────────────
   *
   * O modelo «Proposta enviada» é UM texto, escrito por ela, em português — o
   * ecrã «Modelos de email» não tem versão inglesa nenhuma. Debaixo de uma
   * proposta inglesa, usá-lo era mandar o assunto e o corpo em português com um
   * PDF inglês em anexo: o defeito que se está a corrigir, pela porta do lado.
   *
   * Fica de fora, e sai o texto da casa em inglês — o MESMO recurso que a rota
   * já usa quando o modelo está vazio ou tem um marcador sem valor. Numa
   * proposta portuguesa não muda nada: o modelo dela continua a ser o que sai.
   */
  it("o modelo português dela não sai por baixo de uma proposta inglesa", async () => {
    modelo.get.mockResolvedValue({
      key: "proposta-enviada",
      name: "Proposta enviada",
      subject: "A sua proposta | Líquen",
      body: `<p>Olá {nome}, está pronta.</p>`,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await POST(req({ mode: "send", idioma: "en", doc: baseDoc({ totalAmount: 3000 }) }), {
      params,
    });
    const em = enviado();
    expect(em.html).not.toContain("está pronta.");
    expect(em.subject).toBe("Proposal for your event — Líquen Events");
    expect(em.html).toContain("Please find attached the proposal");
  });

  it("e continua a sair numa proposta portuguesa", async () => {
    modelo.get.mockResolvedValue({
      key: "proposta-enviada",
      name: "Proposta enviada",
      subject: "A sua proposta | Líquen",
      body: `<p>Olá {nome}, está pronta.</p>`,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await POST(req({ mode: "send", idioma: "pt", doc: baseDoc({ totalAmount: 3000 }) }), {
      params,
    });
    expect(enviado().subject).toBe("A sua proposta | Líquen");
    expect(enviado().html).toContain("Olá Maria &amp; Zé, está pronta.");
  });
});

/**
 * O envio da proposta do estúdio é o irmão do `/proposta` e tinha o MESMO
 * rodapé escrito à mão. Passa pela assinatura única, com o PDF intacto.
 */
describe("POST /api/orcamento/[id]/proposta-doc — assinatura", () => {
  it("assina o email da proposta e mantém o PDF em anexo", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "acrescer" })), { params });
    const env = vi.mocked(sendMail).mock.calls.at(-1)![0];
    expect(env.html).toContain("Catarina Gaspar");
    expect(env.html).toContain("Manager");
    expect(env.html).toContain("+351 919 259 820");
    expect(env.text).toContain("Catarina Gaspar");
    expect(env.text).toContain("+351 919 259 820");
    // A faixa da casa viaja COM a mensagem — nada de imagens remotas.
    expect(env.attachments?.some((a) => a.cid === "liquen-banner")).toBe(true);
    expect(env.attachments?.some((a) => a.filename.endsWith(".pdf"))).toBe(true);
    expect(env.html).not.toMatch(/<img[^>]+src="https?:/);
    expect(env.html).not.toContain("Líquen Events · ");
  });

  /**
   * O mesmo assunto da rota irmã, e pela mesma razão: `proposal.id.slice(0, 8)`
   * punha oito caracteres de um `randomUUID()` na caixa de correio do casal —
   * uma referência que não é a da casa (`LIQ-…`), que ninguém sabe ler, e que
   * num telemóvel rouba os caracteres do assunto que ainda se veem.
   */
  it("não põe o identificador interno da proposta no assunto", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "acrescer" })), { params });
    const env = vi.mocked(sendMail).mock.calls.at(-1)![0];
    expect(env.subject).toBe("A vossa proposta — Líquen Events");
    expect(env.subject).not.toMatch(/[0-9a-f]{8}/i);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * A MENSAGEM QUE ELA ESCREVE E QUE SEGUE COM A PROPOSTA
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quando eu vou enviar a proposta, quero que também dê para
 * enviar uma mensagem juntamente com a proposta». O email levava uma frase fixa
 * e mais nada, e ela não tinha por onde escrever ao casal — a nota pessoal ia
 * num segundo email, à mão, ou não ia.
 *
 * O que estes testes prendem é a ORDEM (o que ela escreveu primeiro, a frase da
 * casa depois), a segurança do texto dela em HTML, e a promessa de que uma
 * caixa vazia deixa o email exactamente como ele sempre foi.
 */
describe("POST /api/orcamento/[id]/proposta-doc — a mensagem pessoal", () => {
  /** O último email enviado, nas suas duas versões. */
  const enviado = () =>
    vi.mocked(sendMail).mock.calls.at(-1)![0] as unknown as { html: string; text: string };

  function envioCom(mensagem: unknown): NextRequest {
    return req({ mode: "send", doc: baseDoc({ totalAmount: 3000 }), mensagem });
  }

  it("põe a mensagem dela ANTES da frase da casa e do botão", async () => {
    await POST(envioCom("Foi um gosto conhecer-vos na quinta."), { params });
    const { html, text } = enviado();
    const dela = html.indexOf("Foi um gosto conhecer-vos na quinta.");
    expect(dela, "a mensagem dela nem sequer entrou no email").toBeGreaterThan(-1);
    // Depois do olá, antes da moldura: o que é dela é o que se lê primeiro.
    expect(dela).toBeGreaterThan(html.indexOf("Olá "));
    expect(dela).toBeLessThan(html.indexOf("Segue em anexo"));
    expect(dela).toBeLessThan(html.indexOf("Ver a proposta"));
    // A versão em texto conta a mesma história pela mesma ordem — duas
    // alternativas que divergem são, por si só, um sinal de spam.
    const noTexto = text.indexOf("Foi um gosto conhecer-vos na quinta.");
    expect(noTexto).toBeGreaterThan(text.indexOf("Olá "));
    expect(noTexto).toBeLessThan(text.indexOf("Segue em anexo"));
  });

  /**
   * Um `<` ou um `&` na mensagem dela não pode partir o email — e um `<script>`
   * escrito por engano (ou colado de outro sítio) não pode chegar ao cliente
   * como marcação.
   */
  it("escapa o texto dela no HTML e deixa-o intacto no texto simples", async () => {
    const escrito = 'Trago o arco & as flores <3 — "prometido" às 14h';
    await POST(envioCom(escrito), { params });
    const { html, text } = enviado();
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;3");
    expect(html).not.toContain("<3");
    expect(html).not.toContain("Trago o arco & as");
    // No texto simples vai tal e qual: escapar é uma preocupação de HTML.
    expect(text).toContain(escrito);
  });

  it("as linhas em branco viram parágrafos, e as simples uma quebra", async () => {
    await POST(envioCom("Primeira linha\nSegunda linha\n\nOutro parágrafo"), { params });
    const { html, text } = enviado();
    expect(html).toContain("Primeira linha<br>Segunda linha");
    expect(html).toMatch(/Segunda linha<\/p>[\s\S]*<p[^>]*>Outro parágrafo/);
    // Sem `<br>` nem `<p>` a colarem-se ao texto simples.
    expect(text).toContain("Primeira linha\nSegunda linha\n\nOutro parágrafo");
    expect(text).not.toContain("<br>");
  });

  /**
   * OPCIONAL A SÉRIO: sem mensagem (ou com uma caixa só de espaços), o email
   * tem de sair BYTE A BYTE como saía antes de esta caixa existir — nem um
   * parágrafo vazio, nem uma linha em branco a mais.
   */
  it("sem mensagem, o email sai exactamente como sempre saiu", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const semCampo = enviado();
    await POST(envioCom("   \n  "), { params });
    const soEspacos = enviado();
    expect(soEspacos.html).toBe(semCampo.html);
    expect(soEspacos.text).toBe(semCampo.text);
    // O olá encosta à frase da casa, sem nada pelo meio.
    expect(semCampo.html).toMatch(/Olá [^<]*<\/p>\s*<p[^>]*>Segue em anexo/);
    expect(semCampo.html).not.toMatch(/<p[^>]*>\s*<\/p>/);
  });

  /** Um campo que não é texto (um cliente avariado, um número) é o mesmo que
   *  não haver campo nenhum — nunca um 500 a meio de um envio. */
  it("ignora um campo que não seja texto, e envia na mesma", async () => {
    const res = await POST(envioCom({ isto: "não é texto" }), { params });
    expect(res.status).toBe(200);
    expect(enviado().html).toMatch(/Olá [^<]*<\/p>\s*<p[^>]*>Segue em anexo/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MODELO «PROPOSTA ENVIADA» TAMBÉM AQUI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As duas rotas mandam o mesmo email — a proposta que segue para o cliente —,
 * por caminhos diferentes (a antiga desenha o PDF de linhas, esta desenha o
 * documento do estúdio). Se só uma respeitasse o modelo dela, o ecrã «Modelos
 * de email» continuava a mentir, agora com a agravante de depender do botão em
 * que ela carregou.
 */
describe("POST /api/orcamento/[id]/proposta-doc — o modelo «proposta-enviada»", () => {
  const enviado = () =>
    vi.mocked(sendMail).mock.calls.at(-1)![0] as unknown as {
      subject: string;
      html: string;
      text: string;
    };

  const modeloGuardado = (subject: string, body: string) => ({
    key: "proposta-enviada",
    name: "Proposta enviada",
    subject,
    body,
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  it("sem modelo guardado sai o texto da casa — o de sempre", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(enviado().html).toContain("Segue em anexo a proposta que preparámos");
  });

  it("com modelo guardado é o texto dela que vai, e o assunto dela também", async () => {
    modelo.get.mockResolvedValue(
      modeloGuardado("A sua proposta | Líquen", `<p>Olá {nome}, está pronta.</p>`),
    );
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const email = enviado();
    expect(email.subject).toBe("A sua proposta | Líquen");
    // O `{nome}` aqui são os NOMES DO CASAL do documento do estúdio, como o
    // texto da casa já fazia — e não o `quote.name`, que pode ser a mãe da
    // noiva ou uma wedding planner.
    expect(email.html).toContain("Olá Maria &amp; Zé, está pronta.");
    expect(email.text).toContain("Olá Maria & Zé, está pronta.");
  });

  /**
   * O botão que ela usa todos os dias manda o mesmo modelo que a rota irmã — e
   * o endereço tem de sair arrumado nos dois sítios, senão o que o casal recebe
   * passa a depender do botão em que ela carregou. Ver `email-ligacoes.ts`.
   */
  it("o token gigante fica só no href, aqui como na rota irmã", async () => {
    modelo.get.mockResolvedValue(
      modeloGuardado("A sua proposta", `<p>Veja: <a href="{link}">{link}</a></p>`),
    );
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const email = enviado();
    expect(email.html).toContain('href="https://liquen-events.com/proposta/tok"');
    expect(email.html).toContain(">Ver a proposta online<");
    expect(email.html.replace(/href="[^"]*"/g, "")).not.toContain("/proposta/tok");
    expect(email.text).toContain("Ver a proposta online");
    expect(email.text).toContain("https://liquen-events.com/proposta/tok");
  });

  /**
   * O corpo escrito à mão é o degrau de cima: ganha ao modelo E à mensagem
   * pessoal. Quem escreve o corpo inteiro já lá põe a nota onde quiser —
   * acrescentá-la outra vez a seguir dava-lhe o texto a dobrar.
   */
  it("o corpo escrito à mão ganha ao modelo e à mensagem pessoal", async () => {
    modelo.get.mockResolvedValue(modeloGuardado("A sua proposta", `<p>Texto do modelo dela.</p>`));
    await POST(
      sendReq(baseDoc({ totalAmount: 3000 }), {
        mensagem: "Uma nota pessoal.",
        corpo: "Olá Maria & Zé,\n\nEscrevi isto à mão.",
      }),
      { params },
    );
    const email = enviado();
    expect(email.html).toContain("Olá Maria &amp; Zé,");
    expect(email.html).toContain("Escrevi isto à mão.");
    expect(email.html).not.toContain("Texto do modelo dela.");
    expect(email.html).not.toContain("Uma nota pessoal.");
    expect(email.text).toContain("Olá Maria & Zé,");
    // A moldura da casa fecha na mesma, e uma só vez.
    expect(email.html.match(/Catarina Gaspar/g)).toHaveLength(1);
  });

  it("sem corpo escrito à mão, o envio é exactamente o que era", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 }), { mensagem: "Uma nota pessoal." }), {
      params,
    });
    expect(enviado().html).toContain("Uma nota pessoal.");
    expect(enviado().html).toContain("Segue em anexo a proposta que preparámos");
  });

  /**
   * A MENSAGEM DELA GANHA AO MODELO, E NÃO É INDECISÃO.
   *
   * O texto da casa foi desenhado à volta da mensagem pessoal: ela entra logo
   * a seguir ao «Olá» e ANTES do botão, porque depois do botão é depois do
   * sítio onde muita gente já carregou (a nota longa está na rota). Um corpo
   * de modelo é markup opaco — não há onde lá dentro enfiar a mensagem sem
   * adivinhar. Entre despejar a nota dela no fim, depois do botão, e usar o
   * texto que tem um lugar para ela, ganha o segundo: a mensagem foi escrita
   * há um minuto para ESTE casal, e é a mais específica das duas.
   */
  it("quando ela escreve uma mensagem para acompanhar a proposta, é o texto da casa que sai", async () => {
    modelo.get.mockResolvedValue(
      modeloGuardado("A sua proposta | Líquen", `<p>Olá {nome}, está pronta.</p>`),
    );
    await POST(
      req({
        mode: "send",
        doc: baseDoc({ totalAmount: 3000 }),
        mensagem: "Foi um gosto conhecer-vos na quinta.",
      }),
      { params },
    );
    const email = enviado();
    expect(email.html).toContain("Foi um gosto conhecer-vos na quinta.");
    expect(email.html).toContain("Segue em anexo a proposta que preparámos para o vosso dia");
    expect(email.html).not.toContain("está pronta.");
  });

  it("um modelo com um marcador sem valor não deixa sair o buraco", async () => {
    // O documento do estúdio não tem empresa nenhuma.
    modelo.get.mockResolvedValue(
      modeloGuardado("Proposta para a {empresa}", `<p>Olá {nome}, da {empresa}.</p>`),
    );
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const email = enviado();
    expect(email.subject).toBe("A vossa proposta — Líquen Events");
    expect(email.html).not.toContain("da .");
  });

  it("o rodapé do modelo guardado não sai colado à assinatura da casa", async () => {
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
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(enviado().html).not.toContain("Líquen Events · Portugal");
    // A assinatura da casa continua lá — é ela o único fecho.
    expect(enviado().text).toContain("Catarina Gaspar");
  });

  /** Os nomes do casal vêm de uma caixa de texto do estúdio: um `<` lá dentro
   *  não pode virar markup no email. */
  it("o {nome} entra escapado no corpo e legível no texto simples", async () => {
    modelo.get.mockResolvedValue(modeloGuardado("A sua proposta", `<p>Olá {nome},</p>`));
    await POST(sendReq(baseDoc({ totalAmount: 3000, clientNames: `<b>Maria</b> & Zé` })), {
      params,
    });
    const email = enviado();
    expect(email.html).toContain("&lt;b&gt;Maria&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Maria</b> &");
    expect(email.text).not.toMatch(/[<>]/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «ENVIADA» É UM FACTO, NÃO UMA INTENÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Com o SMTP em baixo, o estúdio dava 200, um aviso passageiro («Envio de email
 * não configurado.») — e no servidor ficava gravado
 * `{"status":"enviada","sentAt":"2026-08-13T14:06:52.259Z"}`. O aviso passa; o
 * registo fica. Passados dez minutos, o quadro «Propostas» mostrava uma
 * proposta «Enviada, à espera de resposta» que nunca saiu de casa — e ela ia
 * esperar por uma resposta que não podia chegar.
 *
 * A causa era a ordem: o estado e a hora do envio eram escritos INCONDICIONAL-
 * MENTE, antes de sequer se tentar enviar, e o `catch` do envio também não os
 * desfazia.
 *
 * ── O QUE NÃO SE PODE PARTIR AO CORRIGIR ────────────────────────────────────
 *
 * A proposta é gravada ANTES do envio de propósito, e está documentado porquê:
 * se o envio deitasse a gravação abaixo com um 500, ela tentava outra vez e
 * criava propostas fantasma — «enviada» na lista, no Acompanhamento e nas
 * contagens, sem ninguém as ter recebido. Por isso estes testes exigem as duas
 * coisas ao mesmo tempo: a proposta FICA GUARDADA nos dois casos, e o ESTADO
 * só diz «enviada» quando o email saiu mesmo.
 */
describe("POST /api/orcamento/[id]/proposta-doc — «enviada» só quando o email saiu", () => {
  beforeEach(() => {
    renderMock.missing = 0;
    renderMock.truncations = [];
    renderMock.sequencia = [];
    renderMock.chamadas = 0;
    store.linhas.clear();
    store.attempts = 0;
    store.failFirstWith = null;
    updated.estado = "pendente";
    // Os blocos acima deixam `createProposal` com uma implementação própria (e
    // `mockImplementation` sobrevive ao `clearAllMocks`): aqui a gravação tem
    // de voltar a alimentar a tabela do duplo, que é o que se afirma.
    vi.mocked(createProposal).mockImplementation(async (p: Proposal) => {
      created.last = p;
      store.linhas.set(p.id, { ...p });
    });
    vi.mocked(sendMail).mockResolvedValue({ sent: true });
  });

  /** A única proposta gravada (os testes que criam mais do que uma contam-nas). */
  const gravada = (): Proposal => [...store.linhas.values()][0];

  it("SMTP em baixo: a proposta fica guardada, mas o estado NÃO diz «enviada»", async () => {
    vi.mocked(sendMail).mockResolvedValue({ sent: false });

    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(false);
    expect(body.emailError).toBeTruthy();

    // 1) FICA GUARDADA — a protecção contra propostas fantasma não regride.
    expect(store.linhas.size, "a proposta tem de ficar gravada na mesma").toBe(1);
    expect(gravada().doc, "e com o documento, que é a única cópia durável").toBeTruthy();

    // 2) E O ESTADO NÃO MENTE.
    expect(gravada().status).not.toBe("enviada");
    expect(gravada().sentAt, "não há hora de envio quando não houve envio").toBeUndefined();
  });

  it("o envio a atirar (credenciais erradas) deixa exactamente o mesmo", async () => {
    vi.mocked(sendMail).mockRejectedValue(new Error("EAUTH: invalid login"));

    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).emailed).toBe(false);
    expect(store.linhas.size).toBe(1);
    expect(gravada().status).not.toBe("enviada");
    expect(gravada().sentAt).toBeUndefined();
  });

  it("com o email a sair, aí sim: «enviada», com a hora a que saiu", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).emailed).toBe(true);
    expect(store.linhas.size).toBe(1);
    expect(gravada().status).toBe("enviada");
    expect(Date.parse(gravada().sentAt ?? "")).toBeGreaterThan(0);
  });

  /**
   * O pedido no Quadro é a mesma mentira vista do outro lado: um pedido em
   * «Proposta enviada» sobre uma proposta que ninguém recebeu. O PREÇO grava-se
   * na mesma — foi decidido, e nada nele depende de o email ter saído.
   */
  it("sem email, o pedido não avança para «Proposta enviada» — mas o preço grava-se", async () => {
    vi.mocked(sendMail).mockResolvedValue({ sent: false });
    updated.estado = "pendente";

    await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "acrescer" })), { params });

    expect(updated.last?.status).toBe("pendente");
    expect(updated.last).not.toHaveProperty("activityLog");
    expect(updated.last?.quotedPrice).toBe(3000);
  });

  /**
   * E o reenvio: depois de o email falhar, ela corrige o SMTP e carrega outra
   * vez. Isso NÃO pode encher a lista de propostas fantasma — a proposta que
   * ficou por enviar é a MESMA que agora segue.
   */
  it("reenviar uma proposta por enviar não cria uma segunda", async () => {
    vi.mocked(sendMail).mockResolvedValue({ sent: false });
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(store.linhas.size).toBe(1);
    const primeira = gravada().id;

    vi.mocked(sendMail).mockResolvedValue({ sent: true });
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });

    expect(store.linhas.size, "reenviar reaproveita a que ficou por enviar").toBe(1);
    expect(gravada().id).toBe(primeira);
    expect(gravada().status).toBe("enviada");
  });

  /**
   * O contrário também tem de valer: uma proposta que JÁ seguiu para o casal
   * não se reescreve por cima. Uma revisão é uma proposta nova — é disso que
   * dependem o histórico, a análise e a guarda da proposta mais recente no
   * link do cliente (`/api/proposta`).
   */
  it("mas uma proposta já enviada nunca é reescrita: a revisão é uma proposta nova", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    await POST(sendReq(baseDoc({ totalAmount: 4000 })), { params });
    expect(store.linhas.size).toBe(2);
    expect([...store.linhas.values()].every((p) => p.status === "enviada")).toBe(true);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LINK DE ACEITAÇÃO, PARA O BOTÃO «COPIAR RESUMO» DO ESTÚDIO
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("POST /api/orcamento/[id]/proposta-doc — acceptUrl na resposta do envio", () => {
  beforeEach(() => {
    store.linhas.clear();
    store.attempts = 0;
    store.failFirstWith = null;
    vi.mocked(createProposal).mockImplementation(async (p: Proposal) => {
      created.last = p;
      store.linhas.set(p.id, { ...p });
    });
    vi.mocked(sendMail).mockResolvedValue({ sent: true });
  });

  it("o email a sair: o link vai na resposta, pronto a copiar", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const body = await res.json();
    expect(body.emailed).toBe(true);
    expect(body.acceptUrl).toBe("https://liquen-events.com/proposta/tok");
  });

  it("SMTP em baixo: acceptUrl não vai — o casal nunca recebeu esse link", async () => {
    vi.mocked(sendMail).mockResolvedValue({ sent: false });
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const body = await res.json();
    expect(body.emailed).toBe(false);
    expect(body.acceptUrl).toBeNull();
  });
});

describe("GET /api/orcamento/[id]/proposta-doc — o link da última proposta REALMENTE enviada", () => {
  function getReq(): NextRequest {
    return new Request("https://liquen.test/api/orcamento/q1/proposta-doc", {
      method: "GET",
    }) as unknown as NextRequest;
  }

  beforeEach(() => {
    store.linhas.clear();
    store.attempts = 0;
    store.failFirstWith = null;
    vi.mocked(createProposal).mockImplementation(async (p: Proposal) => {
      created.last = p;
      store.linhas.set(p.id, { ...p });
    });
    vi.mocked(sendMail).mockResolvedValue({ sent: true });
  });

  it("um pedido novo, sem propostas: acceptUrl é null, não um erro", async () => {
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, acceptUrl: null });
  });

  it("depois de um envio, devolve o mesmo link que foi para o email", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const res = await GET(getReq(), { params });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.acceptUrl).toBe("https://liquen-events.com/proposta/tok");
  });

  it("uma proposta gravada mas nunca enviada (SMTP em baixo) não conta como enviada", async () => {
    vi.mocked(sendMail).mockResolvedValue({ sent: false });
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const res = await GET(getReq(), { params });
    expect((await res.json()).acceptUrl).toBeNull();
  });

  it("duas propostas enviadas: dá a mais recente", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    // A segunda proposta enviada é uma revisão nova, não uma reescrita da
    // primeira (ver "mas uma proposta já enviada nunca é reescrita" acima).
    await POST(sendReq(baseDoc({ totalAmount: 4000 })), { params });
    expect(store.linhas.size).toBe(2);

    const res = await GET(getReq(), { params });
    const body = await res.json();
    // As duas resolvem para o mesmo link neste duplo (`createProposalToken`
    // está mockado para devolver sempre "tok"), mas o que se prova aqui é que
    // a rota não rebenta com mais do que uma proposta enviada, e responde com
    // uma só.
    expect(body.ok).toBe(true);
    expect(typeof body.acceptUrl).toBe("string");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ECRÃ DE ENVIO CHEGA À ROTA: O LINK, O ASSUNTO E A CÓPIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O corpo passou a vir de uma caixa, e o rascunho que a enche traz lá dentro o
 * `{{link_proposta}}` — o marcador que não pode ser resolvido antes de a
 * proposta existir (ver `email-ligacao-reservada.ts`). Estes testes prendem os
 * três fios que faltavam atar: o marcador vira endereço, o assunto que ela viu
 * é o assunto que sai, e o que seguiu fica guardado.
 */
describe("POST /api/orcamento/[id]/proposta-doc — o que vem do ecrã de envio", () => {
  const modeloGuardado = (subject: string, body: string) => ({
    key: "proposta-enviada",
    name: "Proposta enviada",
    subject,
    body,
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const enviado = () =>
    vi.mocked(sendMail).mock.calls.at(-1)![0] as unknown as {
      subject: string;
      html: string;
      text: string;
      attachments?: { filename: string }[];
    };

  it("o {{link_proposta}} do rascunho vira o endereço assinado desta proposta", async () => {
    await POST(
      sendReq(baseDoc({ totalAmount: 3000 }), {
        corpo: "Olá Maria & Zé,\n\nA proposta está aqui: {{link_proposta}}\n\nAté já.",
      }),
      { params },
    );
    const email = enviado();
    expect(email.text).toContain("https://liquen-events.com/proposta/tok");
    expect(email.text).not.toContain("{{link_proposta}}");
    expect(email.html).not.toContain("link_proposta");
  });

  /** Todas as ocorrências: um segundo marcador por trocar era o «Olá ,» desta
   *  funcionalidade com outro nome. */
  it("troca o marcador em todas as ocorrências, não só na primeira", async () => {
    await POST(
      sendReq(baseDoc({ totalAmount: 3000 }), {
        corpo: "Aqui: {{link_proposta}}\n\nE outra vez: {{link_proposta}}",
      }),
      { params },
    );
    expect(enviado().text.match(/liquen-events\.com\/proposta\/tok/g)).toHaveLength(2);
  });

  /**
   * CONTROLO POSITIVO da afirmação de ausência acima: um corpo SEM marcador
   * nenhum não pode ganhar um link que ninguém pediu — é o caminho de todos os
   * envios anteriores a este ecrã existir.
   */
  it("um corpo sem marcador não ganha link nenhum", async () => {
    await POST(
      sendReq(baseDoc({ totalAmount: 3000 }), { corpo: "Olá,\n\nFalamos amanhã ao telefone." }),
      { params },
    );
    expect(enviado().text).toContain("Falamos amanhã ao telefone.");
    /**
     * A moldura da casa continua a fechar o email, e só ela é que traz
     * endereços. O que se prende é a AUSÊNCIA do link da PÁGINA da proposta —
     * o que o marcador teria posto lá.
     *
     * ── PORQUE É QUE ISTO DEIXOU DE SER `not.toContain("/proposta/tok")` ──
     * A moldura passou a trazer um endereço seu: o cartão do PDF, que aponta
     * para `/api/proposta/tok/pdf` e que vai em TODOS os envios de propósito
     * (ver «O PDF TEM DE SE VER NO CORPO»). Esse texto contém `/proposta/tok`,
     * portanto a asserção larga apanhava-o e lia-se como se o corpo tivesse
     * ganho o link que ninguém pediu. São coisas diferentes e agora
     * distinguem-se: o que não pode aparecer é o `href` para a página.
     */
    expect(enviado().html).not.toContain('href="https://liquen-events.com/proposta/tok"');
    // E o cartão do PDF ESTÁ lá — é a moldura, não é o corpo.
    expect(enviado().html).toContain("https://liquen-events.com/api/proposta/tok/pdf");
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O PDF TEM DE SE VER NO CORPO
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «dá para colocar o pdf da proposta mais visível no email?».
   *
   * O ficheiro sempre seguiu em anexo — mas quem manda no sítio onde o anexo
   * aparece é o leitor de correio. No Gmail do telemóvel dela cai DEPOIS da
   * assinatura e do banner, e é preciso rolar o email inteiro para dar com ele.
   *
   * O cartão é um caminho próprio para o MESMO documento, dentro do corpo. Vai
   * nos três caminhos do envio porque o anexo também vai nos três.
   */
  it("o corpo escrito no ecrã leva o cartão do PDF", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 }), { corpo: "Escrevi isto à mão." }), {
      params,
    });
    expect(enviado().html).toContain("https://liquen-events.com/api/proposta/tok/pdf");
    /**
     * A FRASE do link vem dos textos e não daqui.
     *
     * Estava `toContain("Abrir a proposta")` — a frase exacta —, e caiu no dia
     * em que ela deixou de ser verdade: a rota do PDF passou a DESCARREGAR, e o
     * botão passou a dizer «Descarregar a proposta em PDF». Um teste que prende
     * a redacção obriga a mexer-lhe sempre que alguém melhora uma palavra, e
     * treina quem lá mexe a actualizar a expectativa sem pensar.
     *
     * O que este passeio existe para provar é que o CARTÃO vai no corpo escrito
     * à mão — e disso a prova é o endereço do PDF, aqui em cima, que é o que o
     * cartão tem de único. A frase é a que os textos disserem.
     */
    expect(enviado().html).toContain(textosDoEmailDaProposta("pt").anexoBotao);
    // E o nome do ficheiro, para o casal reconhecer que é o mesmo do anexo.
    // Vive por baixo do link, em letra pequena e quieta — mas continua lá, que
    // era a razão de estar no cartão.
    expect(enviado().html).toContain("Proposta-Liquen-Events");
  });

  /**
   * ── OS BOTÕES DESTE EMAIL ABREM-SE COM O POLEGAR ──────────────────────────
   *
   * São dois — «Ver a proposta» e «Abrir a proposta» — e este email abre-se
   * quase sempre no telemóvel. Tinham 39 px e 37 px de altura, com letra de
   * 13 px: sete píxeis abaixo dos 44 do alvo de toque da casa, num sítio onde
   * um clique falhado é um casal a desistir de ler.
   *
   * A altura de um botão de email é a conta do `padding` com a entrelinha, e é
   * isso que este teste faz — não há browser onde a medir.
   */
  it("e os botões do email têm os 44 px de alvo", async () => {
    /** A altura de um botão de email é a conta do `padding` com a entrelinha. */
    const alturas = (html: string) =>
      [...html.matchAll(/padding:(\d+)px [^"]*?;font-size:\d+px;line-height:(\d+)px/g)].map(
        ([, pad, lh]) => Number(pad) * 2 + Number(lh),
      );

    await POST(sendReq(baseDoc({ totalAmount: 3000 }), { corpo: "Escrevi isto à mão." }), {
      params,
    });
    const medidas = alturas(enviado().html);
    expect(medidas.length, "não encontrei o botão do cartão do PDF").toBeGreaterThan(0);
    for (const altura of medidas) {
      expect(altura, `um botão do email ficou com ${altura} px de altura`).toBeGreaterThanOrEqual(
        44,
      );
    }
  });

  /**
   * ── UM BOTÃO CHEIO, UM LINK — E OS DOIS CABEM NO POLEGAR ──────────────────
   *
   * O email tinha DOIS rectângulos verdes do mesmo tamanho, um por cima do
   * outro: «Ver a proposta →» e «Abrir a proposta →». Fazem coisas diferentes e
   * não havia como saber qual era qual. Duas coisas com o mesmo peso não são
   * uma hierarquia.
   *
   * Ficou um botão cheio — a página onde o casal responde — e um link para o
   * PDF, que é o outro caminho para o mesmo documento.
   *
   * O que este teste guarda é a MEDIDA, que é o defeito de origem deste bloco:
   * o botão tinha 37 px e o irmão 39, num email que se abre quase sempre no
   * telemóvel. Minimalismo não é encolher o que se toca.
   *
   * Lê-se da fonte e não do email enviado: os dois não aparecem juntos em
   * nenhum caminho que a fixture consiga montar, e um teste que só mede o que a
   * fixture alcança deixava um por medir — que é como ele chegou aos 39.
   */
  it("o botão e o link do email têm os 44 px de alvo", () => {
    const fonte = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/orcamento/[id]/proposta-doc/route.ts"),
      "utf8",
    );
    const alvos = [
      ...fonte.matchAll(/padding:(\d+)px [^";]*;font-size:(\d+)px;line-height:(\d+)px/g),
    ].map(([, pad, letra, lh]) => ({
      altura: Number(pad) * 2 + Number(lh),
      letra: Number(letra),
    }));
    expect(
      alvos.length,
      "não encontrei o botão e o link do PDF na fonte da rota",
    ).toBeGreaterThanOrEqual(2);
    for (const a of alvos) {
      expect(a.altura, `um alvo do email tem ${a.altura} px de altura`).toBeGreaterThanOrEqual(44);
      expect(a.letra, `um alvo do email tem letra de ${a.letra} px`).toBeGreaterThanOrEqual(16);
    }
  });

  it("e há UM só botão cheio — o segundo virou link", () => {
    const fonte = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/orcamento/[id]/proposta-doc/route.ts"),
      "utf8",
    );
    const cheios = [...fonte.matchAll(/background:#4c6350;border-radius/g)];
    expect(
      cheios.length,
      "voltou a haver dois rectângulos verdes iguais no mesmo email — não se distinguem",
    ).toBe(1);
  });

  it("e o texto simples leva o mesmo endereço, que ali não há botões", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 }), { corpo: "Escrevi isto à mão." }), {
      params,
    });
    expect(enviado().text).toContain("https://liquen-events.com/api/proposta/tok/pdf");
  });

  it("o modelo guardado também o leva", async () => {
    modelo.get.mockResolvedValue(modeloGuardado("Assunto", "<p>Texto do modelo.</p>"));
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(enviado().html).toContain("Texto do modelo.");
    expect(enviado().html).toContain("https://liquen-events.com/api/proposta/tok/pdf");
  });

  it("e o caminho de recurso, que é o que sai quando não há modelo nenhum", async () => {
    modelo.get.mockResolvedValue(null);
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(enviado().html).toContain("https://liquen-events.com/api/proposta/tok/pdf");
    expect(enviado().text).toContain("https://liquen-events.com/api/proposta/tok/pdf");
  });

  it("o assunto que ela viu no ecrã é o assunto que sai", async () => {
    modelo.get.mockResolvedValue(modeloGuardado("O assunto do modelo", "<p>Texto do modelo.</p>"));
    await POST(
      sendReq(baseDoc({ totalAmount: 3000 }), {
        corpo: "Escrevi isto à mão.",
        assunto: "A vossa proposta — Líquen Events",
      }),
      { params },
    );
    expect(enviado().subject).toBe("A vossa proposta — Líquen Events");
  });

  /** O assunto anda com o corpo. Sozinho não conta: seria reescrever a linha
   *  de assunto de um email cujo texto ninguém tinha visto. */
  it("um assunto sem corpo não muda nada", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 }), { assunto: "Um assunto qualquer" }), {
      params,
    });
    expect(enviado().subject).toBe("A vossa proposta — Líquen Events");
  });

  it("um assunto com uma quebra de linha não abre um cabeçalho novo", async () => {
    await POST(
      sendReq(baseDoc({ totalAmount: 3000 }), {
        corpo: "Escrevi isto à mão.",
        assunto: "Proposta\nBcc: outro@exemplo.pt",
      }),
      { params },
    );
    expect(enviado().subject).not.toContain("\n");
    expect(enviado().subject).toBe("Proposta Bcc: outro@exemplo.pt");
  });

  it("guarda a cópia do que seguiu: para quem, de que modelo, com que texto e que anexo", async () => {
    await POST(
      sendReq(baseDoc({ totalAmount: 3000 }), {
        corpo: "Olá Maria & Zé,\n\nA proposta está aqui: {{link_proposta}}",
        assunto: "A vossa proposta",
        modelo: "registo-formal",
      }),
      { params },
    );
    expect(copia.registar).toHaveBeenCalledTimes(1);
    const [pedido, envio] = copia.registar.mock.calls[0] as unknown as [
      string,
      Record<string, string> & { anexo?: { nome: string; bytes: number } },
    ];
    expect(pedido).toBe("q1");
    expect(envio.para).toBe("cliente@example.com");
    expect(envio.modelo).toBe("registo-formal");
    expect(envio.idioma).toBe("pt");
    expect(envio.assunto).toBe("A vossa proposta");
    // O corpo TAL E QUAL, já com a ligação resolvida — é o que se quer reler
    // daqui a três semanas.
    expect(envio.texto).toContain("Olá Maria & Zé,");
    expect(envio.texto).toContain("https://liquen-events.com/proposta/tok");
    expect(envio.texto).not.toContain("{{link_proposta}}");
    expect(envio.anexo?.nome).toContain(".pdf");
    expect(envio.anexo?.bytes).toBeGreaterThan(0);
    expect(typeof envio.enviadoEm).toBe("string");
    expect(envio.propostaId).toBeTruthy();
  });

  /**
   * A cópia é do que SAIU. Sem correio aceite não há nada para copiar — e uma
   * linha a dizer que seguiu era a mesma mentira do estado «enviada» que esta
   * rota já corrigiu noutro sítio.
   *
   * O teste acima é o CONTROLO POSITIVO desta ausência: com o mesmo pedido e o
   * correio a funcionar, a cópia é gravada uma vez.
   */
  it("não guarda cópia nenhuma quando o email não saiu", async () => {
    vi.mocked(sendMail).mockResolvedValueOnce({ sent: false } as never);
    await POST(sendReq(baseDoc({ totalAmount: 3000 }), { corpo: "Escrevi isto à mão." }), {
      params,
    });
    expect(copia.registar).not.toHaveBeenCalled();
  });

  /**
   * A cópia NÃO É RASTREIO, e a maneira de isso não escorregar é a cópia não
   * poder deitar o envio abaixo: quando ela falha, o email já saiu.
   */
  it("uma falha a guardar a cópia não estraga um envio que já aconteceu", async () => {
    copia.registar.mockRejectedValueOnce(new Error("app_state em baixo") as never);
    const res = await POST(
      sendReq(baseDoc({ totalAmount: 3000 }), { corpo: "Escrevi isto à mão." }),
      { params },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).emailed).toBe(true);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VERSÃO CONTA-SE POR PEDIDO, E SÓ SOBE QUANDO O CONTEÚDO MUDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Fase 2 da página do casal. Uma revisão nesta casa é uma proposta NOVA (uma
 * proposta que já seguiu nunca é reescrita), portanto o número da versão não
 * pode viver na linha: cada linha nasceria na versão 1 e o casal ouviria
 * «versão 1» ao telefone três revisões depois. Conta-se sobre as irmãs.
 *
 * E só sobe quando o conteúdo muda. O selo é o de `proposta-versao.ts` — sobre
 * o que o casal vê, não sobre os bytes do PDF, que mudam sozinhos a cada
 * gravação. Sem essa distinção, carregar duas vezes em enviar inventava uma
 * versão nova, e o aviso de «foi revista» aparecia sempre — que é o mesmo que
 * não aparecer nunca.
 */
describe("POST /api/orcamento/[id]/proposta-doc — a versão da proposta", () => {
  it("a primeira proposta de um pedido nasce na versão 1, selada e datada", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.versaoNumero).toBe(1);
    expect(p.versaoSelo).toMatch(/^[0-9a-f]{64}$/);
    expect(Number.isNaN(Date.parse(p.versaoEm!))).toBe(false);
  });

  it("reenviar a MESMA proposta não inventa uma versão nova", async () => {
    const doc = baseDoc({ totalAmount: 3000 });
    await POST(sendReq(doc), { params });
    const primeira = created.last!;
    /**
     * Envelhecer o `sentAt` é O QUE TORNA ESTE TESTE SOBRE VERSÕES.
     *
     * Sem isto, o segundo envio cai na trava de repetição (mesmo documento, há
     * menos de três minutos — ver «envio repetido», mais abaixo) e não chega a
     * gravar nada: o teste passaria a medir a trava e não a numeração. Aqui o
     * caso é o legítimo — «perdi o email, podes reenviar?» — e o que se prova é
     * que a linha nova reaproveita o número e o selo da anterior.
     */
    store.linhas.set(primeira.id, {
      ...store.linhas.get(primeira.id)!,
      sentAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    });
    await POST(sendReq(doc), { params });
    const segunda = created.last!;

    // Controlo positivo: são mesmo duas linhas diferentes (uma revisão é uma
    // proposta nova). Sem isto o teste passava por não ter acontecido nada.
    expect(segunda.id).not.toBe(primeira.id);
    expect(store.linhas.size).toBe(2);

    expect(segunda.versaoNumero).toBe(1);
    expect(segunda.versaoSelo).toBe(primeira.versaoSelo);
    // A data é a do CONTEÚDO: não se mexeu, portanto não muda.
    expect(segunda.versaoEm).toBe(primeira.versaoEm);
  });

  it("mexer no preço sobe para a versão 2", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const primeira = created.last!;
    await POST(sendReq(baseDoc({ totalAmount: 3500 })), { params });
    const segunda = created.last!;

    expect(segunda.versaoNumero).toBe(2);
    expect(segunda.versaoSelo).not.toBe(primeira.versaoSelo);
  });

  it("três revisões dão a versão 3 — e a repetição pelo meio não conta", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params }); // igual
    await POST(sendReq(baseDoc({ totalAmount: 3500 })), { params });
    await POST(sendReq(baseDoc({ totalAmount: 4000 })), { params });
    expect(created.last!.versaoNumero).toBe(3);
  });

  it("uma nota interna não é uma versão nova — o casal não a vê", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const primeira = created.last!;
    await POST(sendReq(baseDoc({ totalAmount: 3000, notasInternas: "margem apertada" })), {
      params,
    });
    expect(created.last!.versaoNumero).toBe(1);
    expect(created.last!.versaoSelo).toBe(primeira.versaoSelo);
  });

  it("mudar a LÍNGUA é outro documento, e é uma versão nova", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    await POST(sendReq(baseDoc({ totalAmount: 3000 }), { idioma: "en" }), { params });
    expect(created.last!.versaoNumero).toBe(2);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MESMO ENVIO DUAS VEZES NÃO SÃO DOIS EMAILS AO CASAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO antes desta trava: dois envios do mesmo documento davam 2 propostas
 * gravadas e 2 emails ao casal — com DOIS links de aceitação diferentes, e duas
 * linhas «versão 1» para o mesmo casamento no quadro.
 *
 * E o caminho provável nem são dois separadores: o `fetch` do envio não tem
 * tecto de tempo próprio, a rede tosse, o ecrã diz «Erro ao enviar» e repõe o
 * botão — e ela carrega outra vez enquanto o primeiro pedido ainda corre.
 */
describe("POST /api/orcamento/[id]/proposta-doc — envio repetido", () => {
  it("o segundo envio do mesmo documento não manda um segundo email", async () => {
    const doc = baseDoc({ totalAmount: 3000 });
    await POST(sendReq(doc), { params });
    const primeira = created.last!;
    const emailsDepoisDoPrimeiro = vi.mocked(sendMail).mock.calls.length;

    const res = await POST(sendReq(doc), { params });
    expect(res.status).toBe(200);
    const corpo = await res.json();

    // Nem segundo email, nem segunda linha.
    expect(vi.mocked(sendMail).mock.calls.length).toBe(emailsDepoisDoPrimeiro);
    expect(store.linhas.size).toBe(1);
    // Responde sobre a proposta que JÁ seguiu, com o link que o casal recebeu.
    expect(corpo.id).toBe(primeira.id);
    expect(corpo.repetido).toBe(true);
    expect(corpo.estado).toBe("enviada");
    expect(corpo.acceptUrl).toContain("/proposta/");
    expect(corpo.repetidoAviso).toMatch(/já tinha seguido/i);
  });

  it("mexer no documento entre os dois envios é um envio a sério", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const emails = vi.mocked(sendMail).mock.calls.length;

    const res = await POST(sendReq(baseDoc({ totalAmount: 3500 })), { params });
    const corpo = await res.json();

    // Controlo positivo da trava acima: o que muda o selo continua a sair.
    expect(vi.mocked(sendMail).mock.calls.length).toBe(emails + 1);
    expect(store.linhas.size).toBe(2);
    expect(corpo.repetido).toBeUndefined();
  });

  it("passada a janela, reenviar a mesma proposta volta a ser possível", async () => {
    const doc = baseDoc({ totalAmount: 3000 });
    await POST(sendReq(doc), { params });
    const emails = vi.mocked(sendMail).mock.calls.length;

    // «Perdi o email, podes reenviar?» — quatro minutos depois, é legítimo.
    const primeira = [...store.linhas.values()][0];
    store.linhas.set(primeira.id, {
      ...primeira,
      sentAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    });

    const res = await POST(sendReq(doc), { params });
    const corpo = await res.json();
    expect(vi.mocked(sendMail).mock.calls.length).toBe(emails + 1);
    expect(corpo.repetido).toBeUndefined();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VALIDADE NÃO PODE ANDAR COM O CALENDÁRIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O estúdio escreve o PRAZO («válida por 60 dias»), não a data — e a data era
 * calculada em dois sítios: aqui, para a coluna `valid_until`, e outra vez
 * DENTRO do desenhador, que corre a cada descarga do PDF pelo link do casal.
 *
 * MEDIDO antes desta correcção: proposta enviada a 20-06-2026 gravava
 * `valid_until = 2026-08-19`; o mesmo PDF, descarregado pelo link a
 * 20-08-2026, imprimia «válida até 19 de outubro de 2026». Mais 61 dias — e
 * mais um por cada dia que passasse.
 */
describe("POST /api/orcamento/[id]/proposta-doc — a validade fica congelada", () => {
  it("a data entra no DOCUMENTO guardado, e é a mesma da coluna", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const p = created.last!;
    expect(p.doc?.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // As duas datas deixam de poder divergir: a coluna lê-se do documento.
    expect(p.doc?.validUntil).toBe(p.validUntil);
  });

  it("redesenhar o documento daqui a um ano dá exactamente a mesma data", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const guardado = created.last!.doc!;
    const daquiAUmAno = new Date(Date.now() + 365 * 24 * 60 * 60_000);
    // É o que o desenhador do PDF faz a cada descarga (`proposal-doc-pdf.ts`).
    expect(resolveValidUntil(guardado, daquiAUmAno)).toBe(guardado.validUntil);
  });

  it("uma data escrita à mão continua a mandar", async () => {
    // Uma data longe no futuro: uma que já passou trava o envio (B1, mais abaixo).
    await POST(sendReq(baseDoc({ totalAmount: 3000, validUntil: "2099-01-31" })), { params });
    expect(created.last!.doc?.validUntil).toBe("2099-01-31");
    expect(created.last!.validUntil).toBe("2099-01-31");
  });

  it("o prazo escrito no estúdio é respeitado (controlo positivo)", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000, validUntilDays: 15 })), { params });
    const guardado = created.last!.doc!;
    // 15 dias, não os 60 por omissão — senão o teste acima passava por acaso.
    expect(guardado.validUntil).toBe(resolveValidUntil({ validUntilDays: 15 }));
    expect(guardado.validUntil).not.toBe(resolveValidUntil({ validUntilDays: 60 }));
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ENVIO QUE MENTE — bloco 3 da caça a bugs
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Três escritas acontecem DEPOIS do `sendMail`: a cópia do envio, a marcação
 * da proposta como enviada, e a actualização do pedido. Nenhuma delas se pode
 * desfazer, porque o email já saiu. O que estava errado era o que se fazia a
 * seguir: duas falhavam em silêncio, e a terceira pedia por escrito um reenvio
 * que mandava um segundo email ao casal.
 */
describe("POST proposta-doc — o que acontece depois de o email sair", () => {
  const corpo = async (res: Response) => (await res.json()) as Record<string, unknown>;

  /**
   * A10-001. A trava de repetição reconhecia um envio pelo `status` da
   * proposta — que é precisamente a escrita que falhou. Reenviar não era
   * reconhecido, o `sendMail` corria outra vez, e o casal recebia dois emails.
   */
  it("um reenvio depois de o estado não ter gravado NÃO manda um segundo email", async () => {
    const primeira = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(primeira.status).toBe(200);
    const p = created.last!;
    // O email saiu e ficou registado; a marcação do estado é que não pegou.
    copia.lista = [{ enviadoEm: new Date().toISOString(), propostaId: p.id }];
    store.linhas.set(p.id, { ...p, status: "rascunho" });
    vi.mocked(sendMail).mockClear();

    const segunda = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(segunda.status).toBe(200);
    // O que interessa: NENHUM email novo.
    expect(vi.mocked(sendMail)).not.toHaveBeenCalled();
    const c = await corpo(segunda);
    expect(c.repetido).toBe(true);
    expect(String(c.repetidoAviso)).toContain("JÁ recebeu");
  });

  it("passados os três minutos da janela, o reenvio volta a ser possível", async () => {
    const primeira = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const p = created.last!;
    // Quatro minutos atrás: fora da janela.
    copia.lista = [
      { enviadoEm: new Date(Date.now() - 4 * 60_000).toISOString(), propostaId: p.id },
    ];
    store.linhas.set(p.id, { ...p, status: "rascunho" });
    vi.mocked(sendMail).mockClear();
    expect(primeira.status).toBe(200);

    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(vi.mocked(sendMail)).toHaveBeenCalled();
  });

  /**
   * A10-002. `updateProposal` devolve `null` sem lançar quando a linha
   * desapareceu. O retorno era ignorado, e o email seguia com um link assinado
   * sobre um id que já não existia.
   */
  it("a proposta por enviar que desapareceu a meio é criada de novo, e o link serve", async () => {
    // Uma proposta em rascunho, que a rota vai querer reaproveitar…
    const fantasma: Proposal = {
      id: "p-fantasma",
      quoteId: "q1",
      status: "rascunho",
      createdAt: new Date().toISOString(),
    } as unknown as Proposal;
    store.linhas.set(fantasma.id, fantasma);
    // …e que desaparece entre a leitura e a gravação.
    const original = vi.mocked(updateProposal).getMockImplementation()!;
    vi.mocked(updateProposal).mockImplementationOnce(async () => null);

    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    const c = await corpo(res);
    // Não se perdeu o envio, e a linha existe — o link do casal aponta para
    // alguma coisa. Era este o defeito: um email com um link morto.
    expect(c.emailed).toBe(true);
    expect(store.linhas.get(String(c.id))).toBeTruthy();
    vi.mocked(updateProposal).mockImplementation(original);
  });

  /**
   * A10-003. As duas escritas «melhor esforço» que falhavam com um `log.error`
   * e mais nada — a resposta saía `{ok:true, emailed:true}` e o toast dizia
   * «Proposta enviada ao cliente».
   */
  it("a CÓPIA do envio que não grava sai pelo nome na resposta", async () => {
    copia.registar.mockRejectedValueOnce(new Error("app_state recusou"));
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const c = await corpo(res);
    expect(c.emailed).toBe(true);
    expect(String(c.copiaError)).toContain("CÓPIA");
  });

  it("o PEDIDO que não actualiza sai pelo nome na resposta", async () => {
    updated.falhar = true;
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const c = await corpo(res);
    expect(c.emailed).toBe(true);
    expect(String(c.pedidoError)).toContain("PEDIDO");
    updated.falhar = false;
  });

  it("num envio que corre bem, nenhum dos três campos de erro viaja", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const c = await corpo(res);
    expect(c).not.toHaveProperty("copiaError");
    expect(c).not.toHaveProperty("pedidoError");
    expect(c).not.toHaveProperty("estadoError");
  });

  /**
   * A frase que provocava o defeito. Mandava reenviar — e reenviar mandava um
   * segundo email ao casal.
   */
  it("a frase do estado por marcar já não manda reenviar", async () => {
    const original = vi.mocked(updateProposal).getMockImplementation()!;
    // A primeira gravação passa (a proposta nasce); a MARCAÇÃO é que falha.
    vi.mocked(updateProposal).mockImplementation(async (id, patch) => {
      if ((patch as Partial<Proposal>).status === "enviada") return null;
      return original(id, patch);
    });
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const c = await corpo(res);
    const frase = String(c.estadoError ?? "");
    expect(frase).toContain("JÁ a recebeu");
    // A instrução que provocava o defeito era «Reenvia-a para acertar o
    // estado». Agora diz-se o contrário, por extenso.
    expect(frase.toLowerCase()).not.toContain("reenvia-a");
    expect(frase).toContain("Não é preciso reenviar");
    vi.mocked(updateProposal).mockImplementation(original);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ENDEREÇO NÃO SE ESCREVE POR EXTENSO NA CARA DO CLIENTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO num email real: o link da proposta saiu com o token inteiro, a ocupar
 * cinco linhas de caracteres aleatórios. É o desenho de uma mensagem de
 * phishing, e um dos padrões que os filtros de spam penalizam.
 *
 * A arrumação já existia. O que não existia era a chamada NESTE ramo — o corpo
 * escrito no ecrã de envio, que é o caminho de todos os dias. O do modelo já
 * passava por ela, e é por isso que o defeito não aparecia em teste nenhum.
 */
describe("POST proposta-doc — o link no corpo do email", () => {
  const enviado = () => vi.mocked(sendMail).mock.calls.at(-1)![0] as { html: string };
  const CORPO = "A proposta segue em anexo e pode também ser consultada aqui: {{link_proposta}}";

  it("o corpo escrito no ecrã sai com o endereço só no href", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 }), { corpo: CORPO }), { params });
    const html = enviado().html;
    // O que se LÊ é uma frase.
    expect(html).toContain("Ver a proposta online");
    // E o endereço está no href — não no texto.
    expect(html).toMatch(/<a[^>]+href="[^"]*\/proposta\/[^"]+"/);
    // Controlo positivo: o token não aparece como TEXTO em lado nenhum. Sem
    // isto, um `arrumarLigacao` que não fizesse nada passava neste teste.
    const semEtiquetas = html.replace(/<[^>]*>/g, " ");
    expect(semEtiquetas).not.toMatch(/\/proposta\/[A-Za-z0-9._-]{20,}/);
  });

  it("o texto simples LEVA o endereço — é o que um email de texto tem", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 }), { corpo: CORPO }), { params });
    const env = vi.mocked(sendMail).mock.calls.at(-1)![0] as { text?: string };
    expect(String(env.text ?? "")).toContain("/proposta/");
  });

  it("um corpo SEM link não ganha nenhum", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 }), { corpo: "Segue a proposta em anexo." }), {
      params,
    });
    expect(enviado().html).not.toContain("Ver a proposta online");
  });
});

/**
 * Achado n.º 4 da auditoria: com «Por onde segue: WhatsApp», a proposta ficava
 * «rascunho», a resposta vinha sem link e o ecrã dizia que o email não tinha
 * saído. O WhatsApp nunca abria.
 */
describe("POST /api/orcamento/[id]/proposta-doc — só pelo WhatsApp", () => {
  beforeEach(() => {
    vi.mocked(createProposal).mockImplementation(async (p: Proposal) => {
      created.last = p;
      store.linhas.set(p.id, { ...p });
    });
    copia.lista = [];
  });

  it("marca-a como enviada, devolve o link, e não manda email nenhum", async () => {
    updated.estado = "pendente";
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 }), { porEmail: false }), {
      params,
    });
    const j = await res.json();
    expect(sendMail).not.toHaveBeenCalled();
    expect(j).toMatchObject({ emailed: false, semEmailPorEscolha: true, estado: "enviada" });
    expect(typeof j.acceptUrl).toBe("string");
    expect(j.emailError).toBeUndefined();
    expect(store.linhas.get(j.id)?.status).toBe("enviada");
    // O pedido sobe a «Proposta enviada», como num envio por email.
    expect(updated.last).toMatchObject({ status: "cotado" });
    // Não houve email: não fica cópia de email nenhum.
    expect(copia.registar).not.toHaveBeenCalled();
  });

  it("depois do WhatsApp, o email do mesmo documento SAI — não é uma repetição", async () => {
    updated.estado = "pendente";
    const doc = baseDoc({ totalAmount: 3000 });
    await POST(sendReq(doc, { porEmail: false }), { params });
    vi.mocked(sendMail).mockClear();
    const j = await (await POST(sendReq(doc), { params })).json();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(j.emailed).toBe(true);
    expect(j.repetido).toBeUndefined();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B1 — O QUE TRAVA NO ESTÚDIO TAMBÉM TRAVA NA ROTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * «Já saiu um PDF sem orçamento e sem condições, e nada no ecrã o impediu.» O
 * botão desligado é uma porta do lado do ecrã; um estúdio antigo noutra aba
 * passava por cima. A rota recusa ANTES de desenhar e antes de qualquer email.
 */
describe("POST /api/orcamento/[id]/proposta-doc — B1: o envio recusa uma proposta com erros", () => {
  beforeEach(() => {
    vi.mocked(renderStoredEditorialPdfWithReport).mockClear();
    vi.mocked(sendMail).mockClear();
  });

  const recusa = async (doc: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
    const res = await POST(sendReq(doc, extra), { params });
    const j = (await res.json()) as { error?: string; faltas?: { id: string }[] };
    return { status: res.status, ids: (j.faltas ?? []).map((f) => f.id), error: j.error ?? "" };
  };

  it.each([
    ["valor", baseDoc({ totalAmount: 0 })],
    ["data", baseDoc({ totalAmount: 3000, eventDate: "" })],
    ["validade", baseDoc({ totalAmount: 3000, validUntil: "2020-01-31" })],
    ["condicoes", baseDoc({ totalAmount: 3000, condicoesGerais: [] })],
  ])("sem %s, 422 — e não desenha nem envia nada", async (id, doc) => {
    const r = await recusa(doc);
    expect(r.status).toBe(422);
    expect(r.ids).toContain(id);
    expect(r.error).toMatch(/não pode seguir/);
    expect(renderStoredEditorialPdfWithReport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sem email no pedido, um envio por email é recusado", async () => {
    const { getQuote } = await import("@/lib/quotes-store");
    vi.mocked(getQuote).mockResolvedValueOnce({ id: "q1", email: "", status: "pendente" } as never);
    const r = await recusa(baseDoc({ totalAmount: 3000 }));
    expect(r.status).toBe(422);
    expect(r.ids).toEqual(["email"]);
  });

  it("…mas só pelo WhatsApp passa: é o caso normal de um pedido por telefone", async () => {
    const { getQuote } = await import("@/lib/quotes-store");
    vi.mocked(getQuote).mockResolvedValueOnce({ id: "q1", email: "", status: "pendente" } as never);
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 }), { porEmail: false }), {
      params,
    });
    expect(res.status).toBe(200);
  });

  it("a pré-visualização não trava: é onde ela vê o que falta", async () => {
    const res = await POST(previewReq(baseDoc({ totalAmount: 0, eventDate: "" })), { params });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/orcamento/[id]/proposta-doc — B1: o rascunho", () => {
  beforeEach(() => vi.mocked(renderStoredEditorialPdfWithReport).mockClear());

  const pedir = (corpo: Record<string, unknown>) =>
    POST(
      new Request("https://liquen.test/api/orcamento/q1/proposta-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(comChave(corpo)),
      }) as unknown as NextRequest,
      { params },
    );

  it("na pré-visualização, desenha marcado e o nome do ficheiro di-lo", async () => {
    const res = await pedir({ mode: "preview", doc: baseDoc({ totalAmount: 0 }), rascunho: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("proposta-preview-rascunho.pdf");
    expect(vi.mocked(renderStoredEditorialPdfWithReport).mock.calls[0][2]).toEqual({
      rascunho: true,
    });
  });

  it("sem o pedido, o PDF não leva marca nenhuma", async () => {
    await pedir({ mode: "preview", doc: baseDoc({ totalAmount: 3000 }) });
    expect(vi.mocked(renderStoredEditorialPdfWithReport).mock.calls[0][2]).toEqual({
      rascunho: false,
    });
  });

  it("um ENVIO nunca sai marcado, mesmo que o peçam", async () => {
    await pedir({ mode: "send", doc: baseDoc({ totalAmount: 3000 }), rascunho: true });
    for (const chamada of vi.mocked(renderStoredEditorialPdfWithReport).mock.calls) {
      expect(chamada[2]).toEqual({ rascunho: false });
    }
  });
});

/**
 * «VER O PDF PRIMEIRO» (14/10). Pedido dela: antes de enviar, alguém tem de
 * ver o PDF final e confirmar. A pré-visualização final devolve a chave do
 * que se viu; o envio tem de trazer a mesma, ou é recusado — para ninguém a
 * saltar, nem com um estúdio antigo aberto noutra aba.
 */
describe("POST /api/orcamento/[id]/proposta-doc — ver o PDF antes de enviar", () => {
  it("a pré-visualização FINAL devolve a chave do que se viu; o rascunho não", async () => {
    const doc = baseDoc({ totalAmount: 3000 });
    const final = await POST(previewReq(doc), { params });
    expect(final.headers.get("X-Chave-Do-Pdf")).toBe(chaveVista(doc, "pt"));
    const rascunho = await POST(req({ mode: "preview", rascunho: true, doc }), { params });
    expect(rascunho.headers.get("X-Chave-Do-Pdf")).toBeNull();
  });

  it("sem a chave, ou com a de outra versão, o envio é recusado — com a certa, segue", async () => {
    const doc = baseDoc({ totalAmount: 3000 });
    const semChave = await POST(sendReq(doc, { pdfVisto: undefined }), { params });
    expect(semChave.status).toBe(422);
    expect((await semChave.json()).error).toMatch(/ver o pdf final/i);

    const outraVersao = chaveVista(baseDoc({ totalAmount: 3100 }), "pt");
    const mudou = await POST(sendReq(doc, { pdfVisto: outraVersao }), { params });
    expect(mudou.status).toBe(422);

    // A versão vista em português não vale para o envio em inglês.
    const outraLingua = await POST(
      sendReq(doc, { idioma: "en", pdfVisto: chaveVista(doc, "pt") }),
      { params },
    );
    expect(outraLingua.status).toBe(422);

    const certa = await POST(sendReq(doc), { params });
    expect(certa.status).toBe(200);
  });

  it("as fotos de biblioteca que só o envio leva não mudam a chave", async () => {
    const doc = baseDoc({ totalAmount: 3000 });
    const vista = chaveVista(doc, "pt");
    const res = await POST(
      sendReq({ ...doc, fotosDeBiblioteca: ["theme-assets/t1/a.jpg"] }, { pdfVisto: vista }),
      { params },
    );
    expect(res.status).toBe(200);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF FINAL DA MESMA VERSÃO DESENHA-SE UMA VEZ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Descarregar o PDF final», a preparação em segundo plano do estúdio e o envio
 * a seguir são o mesmo documento. Antes desenhavam-se três vezes.
 */
describe("POST /api/orcamento/[id]/proposta-doc — o PDF final da mesma versão", () => {
  beforeEach(() => {
    renderMock.missing = 0;
    renderMock.sequencia = [];
    renderMock.truncations = [];
  });

  it("a segunda pré-visualização da mesma versão sai da memória, e di-lo", async () => {
    const doc = baseDoc({ totalAmount: 1000 });
    const primeira = await POST(previewReq(doc), { params });
    expect(primeira.headers.get("X-Pdf-Da-Memoria")).toBeNull();
    const segunda = await POST(previewReq(doc), { params });
    expect(segunda.status).toBe(200);
    expect(segunda.headers.get("X-Pdf-Da-Memoria")).toBe("1");
    expect(segunda.headers.get("X-Chave-Do-Pdf")).toBe(primeira.headers.get("X-Chave-Do-Pdf"));
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledTimes(1);
  });

  it("o envio a seguir à pré-visualização não volta a desenhar", async () => {
    const doc = baseDoc({ totalAmount: 1000 });
    await POST(previewReq(doc), { params });
    const res = await POST(sendReq(doc, { porEmail: false }), { params });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.pdfDaMemoria).toBe(true);
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledTimes(1);
  });

  it("uma vírgula a mais é outra versão, e desenha-se", async () => {
    await POST(previewReq(baseDoc({ totalAmount: 1000 })), { params });
    await POST(previewReq(baseDoc({ totalAmount: 1001 })), { params });
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledTimes(2);
  });

  it("o rascunho desenha-se sempre", async () => {
    const corpo = { mode: "preview", doc: baseDoc({ totalAmount: 1000 }), rascunho: true };
    await POST(req(corpo), { params });
    await POST(req(corpo), { params });
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledTimes(2);
  });

  it("um desenho com fotografias em falta não fica: a seguinte tenta outra vez", async () => {
    renderMock.missing = 1;
    const doc = baseDoc({ totalAmount: 1000 });
    await POST(previewReq(doc), { params });
    const segunda = await POST(previewReq(doc), { params });
    expect(segunda.headers.get("X-Pdf-Da-Memoria")).toBeNull();
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledTimes(2);
  });
});

/**
 * O DOMÍNIO DO EMAIL DO CLIENTE (pedido dela, 30/10: «não deixe enviar
 * emails que não existem»). Recusa-se ANTES de desenhar, de gravar e de
 * mandar; a pré-visualização e o envio pelo WhatsApp não perguntam ao DNS.
 */
describe("o domínio do email do cliente", () => {
  it("um domínio que não recebe correio dá 422 com a frase — nada desenhado, gravado ou enviado", async () => {
    vi.mocked(dominioRecebeEmail).mockResolvedValueOnce(false);
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error:
        "O email do cliente não parece existir (o domínio «example.com» não recebe email). Corrija-o no pedido antes de enviar.",
      campo: "email",
    });
    expect(renderStoredEditorialPdfWithReport).not.toHaveBeenCalled();
    expect(createProposal).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("a pré-visualização não pergunta ao DNS", async () => {
    vi.mocked(dominioRecebeEmail).mockClear();
    await POST(previewReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(dominioRecebeEmail).not.toHaveBeenCalled();
  });

  it("o envio só pelo WhatsApp também não", async () => {
    vi.mocked(dominioRecebeEmail).mockClear();
    await POST(sendReq(baseDoc({ totalAmount: 3000 }), { porEmail: false }), { params });
    expect(dominioRecebeEmail).not.toHaveBeenCalled();
  });
});
