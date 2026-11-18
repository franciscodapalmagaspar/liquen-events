import { describe, it, expect, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import { renderProposalDocPdf } from "./proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import { textosDaProposta } from "./proposal-doc-textos";
import { type IdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CAMPOS QUE FICARAM POR PREENCHER E APARECIAM NA FOLHA À MESMA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre três que já apanhou: «Note:» sozinho no fundo do
 * orçamento, uma linha de serviço a começar por dois pontos, e um «[Valor
 * Total]» impresso. São todos o mesmo defeito — uma caixa do estúdio que ficou
 * vazia, e um desenho que a imprime na mesma.
 *
 * O estúdio deixa acrescentar coisas e passar à frente: um grupo de serviços
 * sem serviços, uma fase de cronograma sem tarefas, uma linha de orçamento sem
 * rubrica. Nenhuma delas dá erro nenhum, e todas chegam ao casal como um
 * cabeçalho sozinho ou um espaço em branco no meio de um quadro — que se lê
 * como descuido, e não como «isto ainda está por decidir».
 *
 * A regra é a que os mood boards já seguem («skip empty boards — never show a
 * client a placeholder»): sem conteúdo, não há título e não há linha.
 *
 * Medido nas duas línguas: nenhum destes campos é do inglês, mas o PDF inglês
 * é o que ninguém confere, porque quem confere lê o português.
 */

vi.setConfig({ testTimeout: 90_000 });

interface Escrita {
  pagina: number;
  x: number;
  y: number;
  texto: string;
}

async function escritasDe(doc: ProposalDoc, idioma: IdiomaDaProposta): Promise<Escrita[]> {
  const paginas: PDFPage[] = [];
  const escritas: Escrita[] = [];
  const addPageOriginal = PDFDocument.prototype.addPage;
  const drawTextOriginal = PDFPage.prototype.drawText;

  PDFDocument.prototype.addPage = function (...args: Parameters<typeof addPageOriginal>) {
    const p = addPageOriginal.apply(this, args) as PDFPage;
    paginas.push(p);
    return p;
  };
  PDFPage.prototype.drawText = function (
    texto: string,
    opts?: Parameters<typeof drawTextOriginal>[1],
  ) {
    escritas.push({
      pagina: paginas.indexOf(this),
      x: opts?.x ?? 0,
      y: opts?.y ?? 0,
      texto: String(texto),
    });
    return drawTextOriginal.call(this, texto, opts);
  };

  try {
    await renderProposalDocPdf(doc, idioma);
    return escritas;
  } finally {
    PDFDocument.prototype.addPage = addPageOriginal;
    PDFPage.prototype.drawText = drawTextOriginal;
  }
}

/**
 * Uma proposta com metade das caixas por preencher — como fica uma proposta a
 * meio de ser escrita, que é o estado em que ela carrega em «Gerar» para ver
 * como vai ficando.
 */
function meioVazia(over: Partial<ProposalDoc> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "organizacao",
    ref: "Organização Casamento Ana & Rui",
    clientNames: "Ana & Rui",
    eventType: "Casamento",
    eventDate: "9 de maio de 2027",
    // Uma caixa com um espaço lá dentro — a mesma forma do «Note:» sozinho.
    location: "   ",
    guests: "",
    servico: "Planeamento integral",
    coverImages: ["", ""],
    serviceGroups: [
      { letter: "a)", title: "Coordenação", items: [{ label: "Reunião inicial", desc: "" }] },
      // Acrescentado e nunca preenchido.
      { letter: "b)", title: "Ainda por escrever", items: [] },
      // Nem o título tem.
      { letter: "", title: "", items: [] },
      // Tem título, e o serviço lá dentro está em branco.
      { letter: "c)", title: "Também por escrever", items: [{ label: "   ", desc: "  " }] },
    ],
    cronograma: [
      { title: "6-12 meses antes", items: ["Escolha do espaço."] },
      { title: "3-6 meses antes", items: [] },
      { title: "   ", items: ["  ", ""] },
    ],
    moodBoards: [],
    budgetItems: [],
    budgetRows: [{ item: "Coordenação no dia", price: "2.500,00 €" }],
    totalEstimatedText: "2.500,00 €",
    totalAmount: 2500,
    totalVatMode: "acrescer",
    budgetNote: "   ",
    ...over,
  } as Parameters<typeof withProposalDefaults>[0]);
}

/** As escritas com tinta — fora as que não desenham caráter nenhum. */
const comTinta = (e: Escrita[]) => e.filter((x) => x.texto.trim().length > 0);
/**
 * As escritas VAZIAS: o desenho pediu para escrever nada nenhures.
 *
 * O espaço SOZINHO fica de fora, e não é indulgência: as legendas em
 * capitulares e o nome da casa no rodapé são desenhados LETRA A LETRA (é assim
 * que se lhes dá o espaçamento), portanto o espaço entre duas palavras chega
 * aqui como uma escrita de um caráter. Um campo por preencher nunca tem essa
 * forma — vem vazio, ou com os espaços que ficaram na caixa.
 */
const vazias = (e: Escrita[]) =>
  e.filter((x) => x.texto.length === 0 || (!x.texto.trim() && x.texto !== " "));

describe("o que ficou por preencher não se imprime", () => {
  for (const idioma of ["pt", "en"] as const) {
    it(`folha ${idioma}: nenhum título fica sozinho e nenhuma linha sai em branco`, async () => {
      const escritas = await escritasDe(meioVazia(), idioma);
      const tinta = comTinta(escritas).map((e) => e.texto);

      // ── O que ESTÁ escrito continua a sair ────────────────────────────────
      // Sem isto, um desenho que deixasse de imprimir a secção passava o teste.
      expect(tinta, "o grupo que tem serviços").toContain("Coordenação");
      expect(tinta, "o serviço que tem nome").toContain("Reunião inicial");
      expect(tinta, "a fase que tem tarefas").toContain("6-12 meses antes");
      expect(tinta, "a tarefa escrita").toContain("Escolha do espaço.");
      expect(tinta, "a linha do quadro").toContain("Coordenação no dia");

      // ── E o que NÃO está, não sai ─────────────────────────────────────────
      // Um cabeçalho de grupo com nada por baixo: trinta pontos de branco e um
      // título em serifa que promete uma lista que não existe.
      expect(tinta, "grupo de serviços sem serviços").not.toContain("Ainda por escrever");
      expect(tinta, "grupo cujo único serviço está em branco").not.toContain("Também por escrever");
      // O mesmo no cronograma.
      expect(tinta, "fase de cronograma sem tarefas").not.toContain("3-6 meses antes");

      // Nenhuma escrita vazia — é a forma genérica do mesmo defeito, e apanha
      // os campos que aqui não estão nomeados um a um.
      expect(
        vazias(escritas).map((e) => `p${e.pagina} x=${Math.round(e.x)} y=${Math.round(e.y)}`),
        "o desenho pediu para escrever nada",
      ).toEqual([]);
    });
  }

  it("um cronograma inteiro por preencher não abre uma folha só com o cabeçalho", async () => {
    // A versão grande do mesmo defeito: a secção existe no documento, todas as
    // fases estão vazias, e saía uma página inteira com «Cronograma» e mais nada.
    const doc = meioVazia({
      cronograma: [
        { title: "6-12 meses antes", items: [] },
        { title: "   ", items: ["  "] },
      ],
    });
    for (const idioma of ["pt", "en"] as const) {
      const tinta = comTinta(await escritasDe(doc, idioma)).map((e) => e.texto);
      expect(tinta, `folha ${idioma}`).not.toContain(textosDaProposta(idioma).tituloCronograma);
    }
  });

  it("um local escrito só com espaços não põe uma linha em branco na capa", async () => {
    // A capa perguntava `if (doc.location)`, e uma caixa com um espaço é
    // «verdadeira» — é exactamente a forma do «Note:» sozinho, na primeira
    // página que o casal vê.
    const escritas = await escritasDe(meioVazia(), "pt");
    const naCapa = escritas.filter((e) => e.pagina === 0);
    expect(vazias(naCapa)).toEqual([]);
  });
});
