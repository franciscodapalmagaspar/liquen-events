import { describe, it, expect, vi } from "vitest";
import { PDFDocument, PDFPage, type PDFFont } from "pdf-lib";
import { renderProposalDocPdf } from "./proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import { textosDaProposta } from "./proposal-doc-textos";
import { type IdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COLUNA DE PREÇO DO MODELO DE ORGANIZAÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O modelo de Organização é o único que IMPRIME um preço por linha: o quadro
 * «Orçamento Proposto» tem duas colunas — «Item» e «Preço Estimado (€)» — e a
 * da direita é TEXTO LIVRE escrito por ela (`BudgetRow.price`), tal como o
 * «Valor Total» é no modelo de Decoração.
 *
 * Por baixo dessas linhas, na MESMA coluna e alinhado à mesma direita, o
 * documento desenha o bloco de totais, que são contas NOSSAS. E é aí que os
 * dois lados se têm de encontrar:
 *
 *   · o `milharesComPonto` existe porque o `Intl` de pt-PT não agrupa milhares
 *     abaixo de cinco dígitos («7890,00 €») e o resto da coluna agrupa
 *     («10.390,00 €») — o raciocínio inteiro está no `money.ts`;
 *   · o `montantesEmIngles` existe porque numa folha inglesa o dinheiro se
 *     escreve «€10,390.00», e converter só metade da coluna «é pior do que não
 *     converter nada».
 *
 * O quadro de Decoração passou pelos dois; ESTA coluna ficou de fora. Este
 * ficheiro mede-a contra os totais que lhe ficam por baixo — não contra uma
 * forma escrita à mão —, porque o defeito não é o formato de um número: é dois
 * formatos na mesma coluna.
 *
 * ── E O MARCADOR ──────────────────────────────────────────────────────────
 *
 * «[Valor]» é o que o estúdio semeia numa linha de Organização enquanto ela
 * não lhe põe preço (`proposal-doc.ts`: «Kept as free text ("[Valor]",
 * "1.500,00 €")»). O total já se defende disso (`semMarcador`, com a nota que
 * diz porquê: «quem gerar o PDF sem passar pela Conferência levava o marcador
 * para o papel»). A coluna das linhas não se defendia — e é a mesma folha, o
 * mesmo quadro e o mesmo cliente a lê-la.
 */

vi.setConfig({ testTimeout: 60_000 });

interface Escrita {
  pagina: number;
  x: number;
  y: number;
  texto: string;
  /** A largura REAL do que foi escrito, medida com a fonte com que foi escrito.
   *  Sem ela não se sabe onde uma escrita ACABA — e é isso que diz se duas se
   *  sobrepõem. */
  largura: number;
}

/** Desenha o documento e devolve todos os `drawText`, com a página e o sítio. */
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
    const fonte = opts?.font as PDFFont | undefined;
    const corpo = opts?.size ?? 10;
    escritas.push({
      pagina: paginas.indexOf(this),
      x: opts?.x ?? 0,
      y: opts?.y ?? 0,
      texto: String(texto),
      largura: fonte ? fonte.widthOfTextAtSize(String(texto), corpo) : 0,
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
 * O espaço INQUEBRÁVEL que o `Intl` mete antes do «€» passa a espaço normal.
 *
 * Não é cosmética do teste: sem isto uma comparação com «10.390,00 €» escrito à
 * mão neste ficheiro falha por causa de um caráter invisível, e o vermelho que
 * se lê não é o defeito que se está a medir. O que aqui se compara é a
 * PONTUAÇÃO DOS NÚMEROS — os pontos, as vírgulas e o lado em que o símbolo cai.
 */
const semEspacosDuros = (t: string) => t.replace(/[  ]/g, " ");

/** Tudo o que foi escrito com um símbolo de moeda colado a um número — ou seja,
 *  o dinheiro da folha, venha ele das nossas contas ou da mão dela. */
const montantes = (escritas: Escrita[]): string[] =>
  escritas
    .map((e) => semEspacosDuros(e.texto))
    .filter((t) => /[€$£]\s*\d|\d[\d.,\s]*\s*[€$£]/.test(t));

/** Uma proposta de Organização com preços por linha — o único quadro do
 *  documento em que um valor escrito por ela é impresso linha a linha. */
function organizacao(over: Partial<ProposalDoc> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "organizacao",
    ref: "Organização Casamento Rita & Tomás · 20 de maio de 2028",
    clientNames: "Rita & Tomás",
    eventType: "Casamento",
    eventDate: "20 de maio de 2028",
    location: "Herdade da Maridona",
    guests: "80 pax",
    servico: "Planeamento integral",
    coverImages: ["", ""],
    serviceGroups: [],
    moodBoards: [],
    budgetItems: [],
    budgetRows: [
      // O primeiro é o valor tal como o `eur()` do estúdio o compõe: nos
      // milhares baixos o `Intl` de pt-PT não põe separador nenhum.
      { item: "Planeamento integral", price: "7890,00 €" },
      { item: "Coordenação no dia", price: "2.500,00 €" },
    ],
    totalEstimatedText: "10.390,00 €",
    totalAmount: 10390,
    totalVatMode: "acrescer",
    ...over,
  } as Parameters<typeof withProposalDefaults>[0]);
}

describe("o quadro de valores estimados fala a mesma língua que os seus totais", () => {
  it("na folha PORTUGUESA os milhares agrupam-se por ponto, como nas linhas de baixo", async () => {
    const escritas = await escritasDe(organizacao(), "pt");
    const dinheiro = montantes(escritas);

    // O bloco de totais desenha «10.390,00 €», «2.389,70 €» e «12.779,70 €».
    expect(dinheiro, "os totais do documento").toContain("10.390,00 €");
    // A linha do quadro, na mesma coluna e vinte pontos acima, não pode ser a
    // única a escrever os milhares de outra maneira.
    expect(
      dinheiro,
      "«7890,00 €» na coluna de preço, por cima de totais escritos «10.390,00 €»",
    ).not.toContain("7890,00 €");
    expect(dinheiro).toContain("7.890,00 €");
  });

  it("na folha INGLESA a coluna inteira é inglesa — as linhas dela e as contas nossas", async () => {
    const escritas = await escritasDe(organizacao(), "en");
    const dinheiro = montantes(escritas);

    // As contas nossas já saem à inglesa desde «Na folha inglesa o dinheiro
    // escreve-se à inglesa».
    expect(dinheiro, "os totais do documento em inglês").toContain("€10,390.00");
    // E nenhum montante desta folha pode trazer a pontuação portuguesa: é
    // exactamente a incoerência que aquela mudança veio corrigir.
    const aPortuguesa = dinheiro.filter((t) => /\d[.\s]?\d{3},\d{2}\s*€|\d,\d{2}\s*€/.test(t));
    expect(aPortuguesa, "montantes à portuguesa numa folha inglesa").toEqual([]);
  });

  it("um «[Valor]» por substituir não chega ao papel — cai no traço, como o total", async () => {
    const doc = organizacao({
      budgetRows: [
        { item: "Planeamento integral", price: "[Valor]" },
        { item: "Coordenação no dia", price: "2.500,00 €" },
      ],
      totalEstimatedText: "[Valor Total]",
      totalAmount: undefined,
      totalVatMode: undefined,
    });
    for (const idioma of ["pt", "en"] as const) {
      const escritas = await escritasDe(doc, idioma);
      const marcadores = escritas.filter((e) => /^\s*\[[^\]]*\]\s*$/.test(e.texto));
      expect(
        marcadores.map((e) => `p${e.pagina}: ${e.texto}`),
        `marcadores de modelo impressos na folha ${idioma}`,
      ).toEqual([]);
      // E o traço fica no lugar dele, como já acontece no total: a coluna não
      // fica em branco a fingir que a linha não tem preço nenhum.
      expect(escritas.map((e) => e.texto)).toContain("—");
    }
  });

  /**
   * ── E O PREÇO NUNCA SE SOBREPÕE AO NOME DA RUBRICA ─────────────────────
   *
   * Os 120 pontos reservados à direita («~120pt covers "12.500,00 € + IVA"»)
   * são uma medida de UM valor típico, e o campo é texto livre. Medido na
   * Carlito a corpo 10,5: «12.500,00 € + IVA» ocupa 74 pontos e «12.500,00 € +
   * IVA (a confirmar)» ocupa 132 — doze pontos POR CIMA do nome da rubrica,
   * quando o nome é comprido ao ponto de encher a sua coluna.
   *
   * Aqui não se deduz: lê-se onde cada `drawText` caiu e com que largura, e
   * exige-se que a caixa do nome acabe antes de a do preço começar.
   */
  it("um preço comprido aperta a coluna do nome em vez de lhe passar por cima", async () => {
    const doc = organizacao({
      budgetRows: [
        {
          item: "Coordenação integral do dia do casamento, com equipa no local desde a montagem",
          price: "12.500,00 € + IVA (a confirmar)",
        },
      ],
    });
    for (const idioma of ["pt", "en"] as const) {
      const escritas = await escritasDe(doc, idioma);
      const linhaDoPreco = escritas.find((e) => /12[.,]500/.test(e.texto));
      expect(linhaDoPreco, `o preço tinha de estar desenhado na folha ${idioma}`).toBeTruthy();
      // Tudo o que foi escrito à ESQUERDA, na mesma linha, tem de acabar antes.
      const naMesmaLinha = escritas.filter(
        (e) => e !== linhaDoPreco && Math.abs(e.y - linhaDoPreco!.y) < 1 && e.x < linhaDoPreco!.x,
      );
      for (const e of naMesmaLinha) {
        const fim = e.x + e.largura;
        expect(
          fim,
          `«${e.texto}» acaba em ${fim.toFixed(1)} e o preço começa em ${linhaDoPreco!.x.toFixed(1)} (folha ${idioma})`,
        ).toBeLessThanOrEqual(linhaDoPreco!.x);
      }
    }
  });

  it("o cabeçalho da coluna continua a ser o da língua pedida", async () => {
    // Rede de segurança do próprio teste: sem isto, um documento que deixasse
    // de desenhar o quadro passava os três testes de cima por não escrever nada.
    for (const idioma of ["pt", "en"] as const) {
      const escritas = await escritasDe(organizacao(), idioma);
      expect(escritas.map((e) => e.texto)).toContain(textosDaProposta(idioma).colunaPrecoEstimado);
    }
  });
});
