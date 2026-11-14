import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O PDF da proposta servido pelo LINK DO CLIENTE (/[lang]/proposta/[token]).
 *
 * O documento seguia só em anexo no email; na página onde o casal decide não
 * havia forma de o voltar a ver. Esta rota é esse botão — e o que ela tem de
 * garantir é: serve o documento DESTA proposta, e mais nada; um token que não
 * seja o dela não abre nada; e uma proposta sem documento guardado (as
 * anteriores à coluna `proposals.doc`, e as de linhas do back office) é um 404
 * limpo, nunca um 500 nem uma pista de que o id existe.
 */
const db = vi.hoisted(() => ({
  proposals: new Map<string, Record<string, unknown>>(),
  rendered: [] as unknown[],
  /** Fotos que o gerador não conseguiu meter no documento. */
  emFalta: 0,
  /**
   * O endereço assinado do PDF já guardado, quando existe.
   *
   * `null` é o caso normal destes testes: o armazenamento não está configurado
   * aqui, e a rota desenha como sempre fez. Só o bloco do fim o liga.
   */
  guardado: null as Response | null,
}));

vi.mock("@/lib/proposal-pdf-guardado", () => ({
  guardarPdfDaProposta: vi.fn(async () => true),
  lerPdfDaProposta: vi.fn(async () => null),
}));

/**
 * O ficheiro guardado, encaminhado em fluxo pelo NOSSO endereço.
 *
 * `db.guardado` a `null` é o caso normal deste ficheiro — não há armazenamento
 * configurado aqui e a rota desenha, como sempre fez. Só o bloco do fim o liga.
 * O que este duplo devolve é uma `Response` inteira, porque é isso que a função
 * a sério devolve: os cabeçalhos dela são dela, e têm testes próprios em
 * `pdf-do-armazenamento.test.ts`.
 */
vi.mock("@/lib/pdf-do-armazenamento", () => ({
  pdfGuardadoEmFluxo: vi.fn(async () => db.guardado),
}));

vi.mock("@/lib/proposal-token", () => ({
  readProposalToken: vi.fn((t: string) =>
    t.startsWith("bom-") ? { proposalId: t.slice(4) } : null,
  ),
}));
vi.mock("@/lib/proposals-store", () => ({
  getProposal: vi.fn(async (id: string) => db.proposals.get(id) ?? null),
  // Ver a nota igual no teste da página: sem isto o resolvedor rebentava, a
  // avaria era engolida e estes testes ficavam verdes pela razão errada.
  listProposalsForQuote: vi.fn(async (quoteId: string) =>
    [...db.proposals.values()].filter((p) => (p as { quoteId?: string }).quoteId === quoteId),
  ),
}));
vi.mock("@/lib/contracts-store", () => ({ getAcceptedContractByQuote: async () => null }));
vi.mock("@/lib/proposal-doc-render", () => ({
  renderStoredProposalDocPdf: vi.fn(async (doc: unknown) => {
    db.rendered.push(doc);
    return new Uint8Array([37, 80, 68, 70]); // "%PDF"
  }),
  /**
   * A cache do PDF passou a pedir o RELATÓRIO e não só os bytes: é assim que
   * uma proposta com fotos a menos deixa de sair calada para o cliente. O
   * `emFalta` é regulável por caso para se poder exercitar a recusa.
   */
  renderStoredEditorialPdfWithReport: vi.fn(async (doc: unknown) => {
    db.rendered.push(doc);
    return {
      pdf: new Uint8Array([37, 80, 68, 70]),
      missingImages: db.emFalta ?? 0,
      truncations: [],
    };
  }),
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { GET } from "./route";
import { esvaziarCachePdf } from "@/lib/proposal-pdf-cache";
import { getProposal } from "@/lib/proposals-store";
import { renderStoredEditorialPdfWithReport } from "@/lib/proposal-doc-render";

// Um IP diferente por chamada: o limitador é real (12/minuto por IP) e é
// partilhado por todo o processo de testes — sem isto, um teste gastava a
// quota do seguinte e o vermelho não teria nada a ver com o que se testa.
let n = 0;
function call(token = "bom-p1") {
  const req = new Request("http://x", { headers: { "x-real-ip": `10.0.0.${++n % 250}` } });
  return GET(req, { params: Promise.resolve({ token }) });
}

beforeEach(() => {
  // A rota serve de uma cache por processo (`proposal-pdf-cache`): sem
  // esvaziar, o segundo caso deste ficheiro receberia o PDF que o primeiro
  // desenhou e nunca chegaria a exercitar o que diz exercitar.
  esvaziarCachePdf();
  db.proposals.clear();
  db.rendered = [];
  // Por omissão o ficheiro NÃO está guardado — é o estado em que o resto deste
  // ficheiro foi escrito, e o que faz a rota desenhar como sempre fez.
  db.guardado = null;
  vi.clearAllMocks();
});

describe("GET /api/proposta/[token]/pdf", () => {
  it("serve com Content-Length, ETag e a promessa de pedaços", async () => {
    // O que o portal precisa para abrir um PDF não linearizado sem arrastar o
    // ficheiro todo. A razão está em `pdf-resposta.ts`.
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1", doc: { ref: "PO" } });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("4");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("ETag")).toBeTruthy();
  });

  it("um pedido de pedaço devolve 206 e NÃO volta a desenhar", async () => {
    // O ponto da cache: um leitor de PDF faz vários pedidos parciais para abrir
    // um ficheiro. Se cada um voltasse a desenhar, anunciar `Accept-Ranges`
    // seria uma degradação de cinco ou seis vezes em vez de uma melhoria.
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1", doc: { ref: "PO" } });
    await call();
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledTimes(1);

    const req = new Request("http://x", {
      headers: { "x-real-ip": `10.0.1.${++n % 250}`, range: "bytes=0-1" },
    });
    const res = await GET(req, { params: Promise.resolve({ token: "bom-p1" }) });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-1/4");
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledTimes(1);
  });

  it("serve o documento guardado NA proposta do token", async () => {
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1", doc: { ref: "PO Decoração" } });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("Proposta-Liquen-LIQ-AAA-1.pdf");
    expect(db.rendered).toEqual([{ ref: "PO Decoração" }]);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it("404 a um token inválido/forjado, sem chegar sequer à proposta", async () => {
    const res = await call("lixo");
    expect(res.status).toBe(404);
    expect(getProposal).not.toHaveBeenCalled();
  });

  it("404 (não 500) a uma proposta ANTIGA sem documento guardado", async () => {
    // É o estado de todas as propostas anteriores à coluna `proposals.doc` e
    // das criadas por linhas em /api/propostas. A página esconde o botão; aqui
    // fecha-se a mesma porta do lado do servidor.
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1" });
    const res = await call();
    expect(res.status).toBe(404);
    expect(renderStoredEditorialPdfWithReport).not.toHaveBeenCalled();
  });

  it("404 a uma proposta que já não existe", async () => {
    const res = await call("bom-apagada");
    expect(res.status).toBe(404);
  });

  it("serve a proposta do token mesmo depois de respondida ou expirada", async () => {
    // O cliente tem de poder rever aquilo que aceitou (ou que deixou expirar).
    // A página já lhe explica que não pode responder; esconder-lhe o documento
    // seria esconder-lhe o contrato que assinou.
    db.proposals.set("p1", {
      id: "p1",
      quoteId: "LIQ-AAA-1",
      status: "aceite",
      validUntil: "2020-01-01",
      doc: { ref: "PO" },
    });
    expect((await call()).status).toBe(200);
  });

  it("NUNCA serve o documento de outra proposta (o token é que manda)", async () => {
    db.proposals.set("p1", { id: "p1", doc: { ref: "a minha" } });
    db.proposals.set("p2", { id: "p2", doc: { ref: "a do vizinho" } });
    await call("bom-p1");
    expect(db.rendered).toEqual([{ ref: "a minha" }]);
  });

  it("500 sem detalhes quando o desenho rebenta (nada do erro chega ao cliente)", async () => {
    db.proposals.set("p1", { id: "p1", doc: { ref: "PO" } });
    vi.mocked(renderStoredEditorialPdfWithReport).mockRejectedValueOnce(
      new Error("sharp em baixo"),
    );
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("");
  });

  it("429 quando o mesmo IP repete o pedido em ciclo (desenhar é caro)", async () => {
    db.proposals.set("p1", { id: "p1", doc: { ref: "PO" } });
    const mesmoIp = () =>
      GET(new Request("http://x", { headers: { "x-real-ip": "203.0.113.99" } }), {
        params: Promise.resolve({ token: "bom-p1" }),
      });
    const estados: number[] = [];
    for (let i = 0; i < 14; i++) estados.push((await mesmoIp()).status);
    expect(estados.slice(0, 12).every((s) => s === 200)).toBe(true);
    expect(estados.at(-1)).toBe(429);
  });

  it("com fotos em falta serve na mesma — e por isso não há ramo para a recusa (13/11)", async () => {
    // A rota pede o documento com `servirIncompleto`: a recusa
    // (`PropostaIncompleta`) nunca lhe chega. O ramo do 503 que a tratava era
    // código morto, com um comentário a dizer o contrário do que acontece.
    db.proposals.set("p1", { id: "p1", doc: { ref: "PO" } });
    db.emFalta = 2;
    try {
      const res = await call();
      expect(res.status).toBe(200);
      expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
    } finally {
      db.emFalta = 0;
    }
    const fonte = readFileSync(join(__dirname, "route.ts"), "utf8");
    expect(fonte).not.toMatch(/PropostaIncompleta/);
    expect(fonte).not.toMatch(/status: 503/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * VOLTAR A DESCARREGAR DÁ A PROPOSTA NA LÍNGUA EM QUE ELA FOI FEITA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este botão redesenha o documento a partir do `doc` guardado. Enquanto a
 * língua não ficava gravada, quem redesenhava não tinha como a saber e caía em
 * português: o casal inglês recebia a proposta inglesa por email e, ao carregar
 * no botão da página onde a aceita, abria a portuguesa. O mesmo documento, duas
 * línguas, sem explicação nenhuma.
 */
describe("GET /api/proposta/[token]/pdf — a língua da proposta", () => {
  it("uma proposta INGLESA volta a sair em inglês", async () => {
    db.proposals.set("p1", {
      id: "p1",
      quoteId: "LIQ-AAA-1",
      idioma: "en",
      doc: { ref: "PO" },
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledWith({ ref: "PO" }, "en");
  });

  it("e o ficheiro chama-se como o que seguiu no email", async () => {
    // O casal já tem um «Proposal-Liquen-….pdf» na caixa de correio: o que
    // descarrega da página tem de ser reconhecível como o mesmo documento.
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1", idioma: "en", doc: { ref: "PO" } });
    const res = await call();
    expect(res.headers.get("Content-Disposition")).toContain("Proposal-Liquen-LIQ-AAA-1.pdf");
  });

  it("uma proposta PORTUGUESA continua exactamente como estava", async () => {
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1", idioma: "pt", doc: { ref: "PO" } });
    const res = await call();
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledWith({ ref: "PO" }, "pt");
    expect(res.headers.get("Content-Disposition")).toContain("Proposta-Liquen-LIQ-AAA-1.pdf");
  });

  it("uma proposta ANTIGA, sem língua gravada, é portuguesa", async () => {
    // O caso que não pode mudar de comportamento: tudo o que foi enviado antes
    // desta coluna existir foi enviado em português.
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1", doc: { ref: "PO" } });
    const res = await call();
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledWith({ ref: "PO" }, "pt");
    expect(res.headers.get("Content-Disposition")).toContain("Proposta-Liquen-LIQ-AAA-1.pdf");
  });

  it("uma língua estranha na base não inventa nada: português", async () => {
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1", idioma: "fr", doc: { ref: "PO" } });
    await call();
    expect(renderStoredEditorialPdfWithReport).toHaveBeenCalledWith({ ref: "PO" }, "pt");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF GUARDADO NÃO PRECISA DE NOS ATRAVESSAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «para ver a proposta em PDF quando carrego demora mesmo muito
 * tempo a abrir».
 *
 * Guardá-lo no envio tirou o DESENHO do caminho. Mas os bytes continuavam a
 * fazer duas viagens — armazenamento → esta função → o telemóvel dela — e numa
 * proposta com quarenta e seis fotografias são megabytes a passar por um sítio
 * que não precisava de os ver, com um arranque a frio pelo meio.
 */
describe("GET /api/proposta/[token]/pdf — quando já está guardado", () => {
  beforeEach(() => {
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1", doc: { ref: "PO" } });
  });

  const guardadoFalso = () =>
    new Response("%PDF-1.7 fingido", {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="Proposta.pdf"',
        "Cache-Control": "private, no-store, must-revalidate",
      },
    });

  it("serve o ficheiro guardado sem o desenhar", async () => {
    db.guardado = guardadoFalso();

    const res = await call();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    // E não se desenhou nada — era esse o custo que isto existe para não pagar.
    expect(db.rendered).toHaveLength(0);
  });

  it("NUNCA reencaminha o casal para outro domínio", async () => {
    /**
     * ── A REGRESSÃO QUE ESTE TESTE EXISTE PARA APANHAR ──────────────────
     *
     * Isto respondia `302` para o endereço assinado do armazenamento, e a
     * barra do Safari passava a mostrar `<referência>.supabase.co`. Palavras
     * dela: «quero algo muito mais bonito e sem ser com este url super
     * desconfiado». Um link de um email da Líquen que aterra num domínio que
     * ninguém reconhece é o que se ensina toda a gente a não abrir — e do
     * outro lado está um casal prestes a decidir milhares de euros.
     *
     * O ficheiro é o mesmo e vem do mesmo sítio; o que mudou é que passa por
     * aqui, em fluxo. Ver `pdf-do-armazenamento.ts` — e é MAIS CURTO do que
     * era, que a conta lá está feita.
     */
    db.guardado = guardadoFalso();

    const res = await call();

    expect(res.status, "voltou a reencaminhar").toBeLessThan(300);
    expect(res.headers.get("location"), "voltou a mandar o casal para outro domínio").toBeNull();
  });

  it("os cabeçalhos do ficheiro guardado chegam intactos a quem carregou", async () => {
    // A rota não pode reescrever o que a função do fluxo decidiu: o nome do
    // anexo e o «descarregar» são dela, e têm testes próprios.
    db.guardado = guardadoFalso();

    const res = await call();

    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Proposta.pdf"');
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("não estando guardado, desenha e serve como sempre", async () => {
    // `null` quer dizer «não está lá», e não «falhou»: o caminho de antes
    // continua inteiro por baixo.
    db.guardado = null;

    const res = await call();

    expect(res.status).toBe(200);
    expect(db.rendered).toHaveLength(1);
  });
});
