import { describe, it, expect, vi } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, type PDFObject } from "pdf-lib";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import { NUNCA_NO_PDF } from "./proposta-de-pdf/tipos";
import { copiarParaPedido } from "./proposal-copy";
import { docNaLingua } from "./proposal-doc-bilingue";
import type { Quote } from "./orcamento/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A NOTA INTERNA NÃO SAI DE CASA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O campo passou a estar MONTADO — no estúdio (secção «Evento») e, só de
 * leitura, na ficha do pedido. Enquanto ninguém o via, a garantia de que não
 * sai era teórica: não havia por onde escrever lá nada. A partir de agora há, e
 * o que se escreve é do género «quer ficar por baixo dos 8.000 €» e «quem
 * decide é a mãe» — frases sobre o cliente, escritas por quem lhe está a
 * vender, dentro do documento que ele abre com expectativa.
 *
 * ── PORQUE É QUE ISTO NÃO PROCURA A FRASE NO FICHEIRO ──────────────────────
 * Porque procurá-la não prova nada: o texto de um PDF vai como códigos de
 * glifo hexadecimais, e `pdf.includes("AMARA")` seria verde mesmo com a frase
 * impressa em corpo 24 na primeira página. O que se compara é o DESENHO — as
 * instruções de todas as páginas — de um documento com nota e do mesmo
 * documento sem ela. Iguais quer dizer que nem uma letra mudou de sítio.
 *
 * ── E O CONTROLO POSITIVO ──────────────────────────────────────────────────
 * Um teste cuja afirmação é uma AUSÊNCIA passa por duas razões: porque a coisa
 * não está lá, ou porque o teste não sabe olhar. A mesma frase escrita num
 * campo que SAI IMPRESSO tem de fazer o desenho mudar — se não fizer, esta
 * comparação está cega e todos os vistos verdes deste ficheiro não valem nada.
 */

// O armazenamento das fotografias não entra num teste de texto.
vi.mock("@/lib/fotos-editoriais-guardadas", () => ({
  lerFotoEditorialGuardada: async () => null,
  guardarFotoEditorial: async () => undefined,
}));
const { renderEditorialPdf } = await import("./pdf-editorial/montar");
/** Um dia fixo: o mesmo documento dá os mesmos bytes. */
const criadoEm = new Date("2026-11-18T12:00:00Z");

const SENTINELA = "Quer ficar por baixo dos 8.000 e quem decide e a mae.";

/** Conteúdo (operadores) de uma página, já descomprimido. */
function conteudoDaPagina(pdf: PDFDocument, index: number): string {
  const page = pdf.getPage(index);
  const contents = page.node.Contents();
  const partes: (PDFObject | undefined)[] =
    contents instanceof PDFArray ? contents.asArray() : [contents];
  let out = "";
  for (const parte of partes) {
    const stream = page.node.context.lookup(parte);
    if (stream instanceof PDFRawStream) {
      out += Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
    }
  }
  return out;
}

/** Tudo o que fica desenhado no papel, página a página. */
async function desenho(doc: ProposalDoc): Promise<string> {
  const { bytes } = await renderEditorialPdf(doc, "pt", { criadoEm });
  const pdf = await PDFDocument.load(bytes);
  let texto = "";
  for (let i = 0; i < pdf.getPageCount(); i += 1) texto += conteudoDaPagina(pdf, i);
  return texto;
}

function propostaBase(): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "LIQ-2026-001",
    clientNames: "Maria & Ze",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Monte da Oliveirinha",
    guests: "120 pax",
    serviceGroups: [
      { letter: "a)", title: "Decoracao Floral", items: [{ label: "Arco", desc: "Eucalipto" }] },
    ],
    moodBoards: [],
    budgetItems: ["Decoracao Floral"],
    totalLabel: "Valor Total Decoracao",
    coverImages: ["", ""],
    totalAmount: 9000,
    totalText: "9.000,00 EUR + IVA",
  }) as ProposalDoc;
}

describe("as notas internas nunca chegam ao cliente", () => {
  it("CONTROLO POSITIVO: a mesma frase num campo que sai impresso MUDA o desenho", async () => {
    // Sem isto, os dois testes a seguir passariam com um comparador cego.
    // `budgetNote` é prosa que o gerador desenha na folha do orçamento.
    const base = propostaBase();
    const impressa = { ...base, budgetNote: SENTINELA };
    expect(await desenho(impressa)).not.toBe(await desenho(base));
  }, 60_000);

  it("um documento com nota interna desenha exactamente o mesmo que um sem ela", async () => {
    const base = propostaBase();
    const comNota: ProposalDoc = {
      ...base,
      notasInternas: SENTINELA,
      notasPorSeccao: {
        orcamento: "Margem apertada, nao descer mais.",
        servicos: "Ela quer eucalipto e mais nada.",
      },
    };
    expect(await desenho(comNota)).toBe(await desenho(base));
  }, 60_000);

  it("o gerador continua a declarar a nota como campo que nunca desenha", () => {
    // A lista é o que o ecrã de leitura de PDFs mostra apagado, com a razão ao
    // lado. Se alguém puser a nota a imprimir, esta entrada tem de sair — e
    // aqui fica vermelho antes de sair calada.
    expect(Object.keys(NUNCA_NO_PDF)).toContain("notasInternas");
    expect(Object.keys(NUNCA_NO_PDF)).toContain("notasPorSeccao");
  });

  it("copiar a proposta para outro casal deixa a nota para trás", () => {
    const origem: ProposalDoc = {
      ...propostaBase(),
      notasInternas: SENTINELA,
      notasPorSeccao: { orcamento: "Margem apertada." },
    };
    const outro = { id: "LIQ-2", name: "Ana", location: "Sintra" } as Quote;
    const { doc } = copiarParaPedido(origem, outro);
    expect(doc.notasInternas).toBeUndefined();
    expect(doc.notasPorSeccao).toBeUndefined();
    // CONTROLO POSITIVO da mesma chamada: a cópia trouxe MESMO o resto do
    // documento — senão «não há nota» seria verdade por não haver nada.
    expect(doc.serviceGroups?.[0]?.items?.[0]?.label).toBe("Arco");
  });

  it("o PDF inglês também não a desenha", async () => {
    // A proposta pode sair em inglês, e aí o documento que o casal abre é
    // outro — passa pela projecção de língua antes de ser desenhado. É um
    // segundo caminho até ao papel, e tinha de ser andado.
    const base = docNaLingua(propostaBase(), "en");
    const comNota = docNaLingua({ ...propostaBase(), notasInternas: SENTINELA }, "en");
    expect(await desenho(comNota)).toBe(await desenho(base));
  }, 60_000);
});
