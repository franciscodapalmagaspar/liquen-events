import { describe, it, expect } from "vitest";
import { PDFDocument, PDFPage, type PDFFont } from "pdf-lib";
import { renderProposalDocPdf, renderProposalDocPdfWithReport } from "./proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import { type IdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ELA TRADUZIU SAI EM INGLÊS — E SAI PELA MESMA ORDEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Três defeitos diferentes, e o terceiro é o que ninguém veria:
 *
 *  1. UMA TRADUÇÃO ESCRITA TEM DE SAIR. Se a projecção não acontecer no
 *     gerador, ela escreve as duas versões e o PDF continua a imprimir uma.
 *
 *  2. UMA CAIXA VAZIA CAI PARA O PORTUGUÊS, E NENHUMA SECÇÃO FICA EM BRANCO.
 *     É a decisão dela: um buraco é inaceitável, meia proposta em português é
 *     recuperável (e avisada a montante).
 *
 *  3. ════════════════════════════════════════════════════════════════════
 *     A ORDEM. É O RISCO SILENCIOSO NÚMERO UM.
 *     ════════════════════════════════════════════════════════════════════
 *     `ordemDeSaida` alinha os mood boards e as linhas do orçamento pelos
 *     NOMES dos serviços (`chaveDeRubrica` normaliza acentos e deita fora
 *     palavras portuguesas sem peso: «decor», «floral», «de», «da»…).
 *
 *     Se a projecção para inglês correr ANTES do cálculo da ordem, um
 *     documento em que os grupos de serviços estão traduzidos e as rubricas do
 *     orçamento não (ou o contrário) deixa de casar: as chaves inglesas não
 *     batem com as portuguesas, o «sem correspondência não se mexe» entra, e o
 *     orçamento e os mood boards saem POR OUTRA ORDEM no PDF inglês.
 *
 *     Ninguém vê. Quem confere lê o português, e o português continua certo. O
 *     casal inglês recebe um documento em que a lista de serviços diz uma
 *     ordem e o orçamento diz outra — exactamente o defeito da proposta da Tara
 *     e do Marty, que o `proposal-ordem.ts` foi escrito para fechar.
 *
 *     A regra: a ordem calcula-se SEMPRE a partir do documento português. É
 *     seguro porque `docNaLingua` não acrescenta, não remove e não reordena
 *     (invariante pinado em `proposal-doc-bilingue.test.ts`).
 */

const RELOGIO = 120_000;

// ── A sonda ────────────────────────────────────────────────────────────────

interface Escrita {
  pagina: number;
  texto: string;
}

/** Desenha o documento e devolve tudo o que foi escrito. O texto sai das
 *  INSTRUÇÕES de desenho e não dos bytes: as fontes vão embutidas em
 *  subconjunto e os códigos dos glifos deixam de ser legíveis. */
async function desenhar(doc: ProposalDoc, idioma?: IdiomaDaProposta) {
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
    void (opts?.font as PDFFont | undefined);
    escritas.push({ pagina: paginas.indexOf(this), texto: String(texto) });
    return drawTextOriginal.call(this, texto, opts);
  };

  try {
    const bytes = idioma
      ? await renderProposalDocPdf(doc, idioma)
      : await renderProposalDocPdf(doc);
    return { escritas, paginas: paginas.length, bytes };
  } finally {
    PDFDocument.prototype.addPage = addPageOriginal;
    PDFPage.prototype.drawText = drawTextOriginal;
  }
}

/** Tudo o que foi escrito, colado e normalizado — as capitulares são desenhadas
 *  letra a letra, por isso junta-se tudo sem espaços para procurar palavras. */
function textoInteiro(escritas: Escrita[]): string {
  return escritas
    .map((e) => e.texto)
    .join(" ")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

// ── Os documentos de prova ─────────────────────────────────────────────────

/**
 * A proposta da Tara e do Marty, com a ordem já desalinhada de propósito: nos
 * Serviços é Cerimónia → Complementos → Cocktail → Jantar, no orçamento é outra.
 * É a forma exacta do defeito que o `proposal-ordem.ts` corrige.
 */
function taraEMarty(over: Partial<ProposalDoc> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração Casamento Tara e Marty 12.09.2026",
    clientNames: "Tara & Marty",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Quinta do Hespanhol",
    guests: "80 pax",
    coverImages: ["", ""],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral de Casamento",
        items: [
          { label: "Decor Cerimónia" },
          { label: "Complementos dos Noivos" },
          { label: "Decor Cocktail" },
          { label: "Decor Jantar" },
        ],
      },
    ],
    moodBoards: [],
    budgetItems: ["Decor Cerimónia", "Decor Cocktail", "Decor Jantar", "Complementos dos Noivos"],
    budgetAmounts: [820, 460, 1250, 320],
    totalLabel: "Valor Total Decoração",
    totalText: "2.850,00 € + IVA",
    totalAmount: 2850,
    totalVatMode: "acrescer",
    ...over,
  } as Parameters<typeof withProposalDefaults>[0]);
}

/**
 * A ordem por que os `rotulos` foram IMPRESSOS.
 *
 * Lê-se das instruções de desenho e não do PDF lido de volta: o motor de
 * importação do estúdio (`lerPropostaDePdf`) reconhece os cabeçalhos
 * PORTUGUESES do documento, e num PDF inglês não encontra o quadro do
 * orçamento — mediria a ausência, não a ordem.
 */
async function ordemImpressa(
  doc: ProposalDoc,
  idioma: IdiomaDaProposta,
  rotulos: string[],
): Promise<string[]> {
  const { escritas } = await desenhar(doc, idioma);
  const lugares = rotulos
    .map((r) => ({ r, i: escritas.findIndex((e) => e.texto.trim() === r) }))
    .filter((l) => l.i >= 0);
  expect(lugares).toHaveLength(rotulos.length);
  return lugares.sort((a, b) => a.i - b.i).map((l) => l.r);
}

describe("a prosa que ela traduziu sai em inglês", () => {
  it(
    "uma proposta com tudo traduzido não deixa uma palavra portuguesa dela no papel",
    { timeout: RELOGIO },
    async () => {
      const doc = taraEMarty({
        serviceGroups: [
          {
            letter: "a)",
            title: "Decoração Floral de Casamento",
            titleEn: "Wedding Floral Design",
            items: [
              { label: "Decor Cerimónia", labelEn: "Ceremony Decor" },
              { label: "Complementos dos Noivos", labelEn: "Couple's Extras" },
              { label: "Decor Cocktail", labelEn: "Cocktail Decor" },
              { label: "Decor Jantar", labelEn: "Dinner Decor" },
            ],
          },
        ],
        budgetItems: [
          "Decor Cerimónia",
          "Decor Cocktail",
          "Decor Jantar",
          "Complementos dos Noivos",
        ],
        budgetItemsEn: ["Ceremony Decor", "Cocktail Decor", "Dinner Decor", "Couple's Extras"],
        budgetExtras: [
          {
            label: "Deslocação da equipa Líquen",
            labelEn: "Líquen team travel",
            valueText: "150,00 €",
          },
        ],
      });
      const texto = textoInteiro((await desenhar(doc, "en")).escritas);
      for (const portuguesa of [
        "DECORAÇÃO FLORAL DE CASAMENTO",
        "DECOR CERIMÓNIA",
        "COMPLEMENTOS DOS NOIVOS",
        "DECOR COCKTAIL",
        "DECOR JANTAR",
        "DESLOCAÇÃO DA EQUIPA LÍQUEN",
      ]) {
        expect(texto).not.toContain(portuguesa);
      }
      for (const inglesa of [
        "WEDDING FLORAL DESIGN",
        "CEREMONY DECOR",
        "COUPLE'S EXTRAS",
        "LÍQUEN TEAM TRAVEL",
      ]) {
        expect(texto).toContain(inglesa);
      }
    },
  );

  it(
    "o rótulo do total reescrito à mão sai pela caixa inglesa dela",
    { timeout: RELOGIO },
    async () => {
      // Sem total que se consiga somar, o quadro fecha no rótulo escrito no
      // estúdio. «Valor Total Decoração» já era traduzido por reconhecimento
      // («Decoration Total»); um rótulo reescrito à mão deixa de o ser, e só
      // ela o sabe dizer em inglês — a caixa manda sobre o reconhecimento.
      const doc = taraEMarty({
        totalLabel: "Investimento em flor e decor",
        totalLabelEn: "Flowers and decor investment",
        totalAmount: undefined,
        totalText: "",
        budgetAmounts: undefined,
      });
      const texto = textoInteiro((await desenhar(doc, "en")).escritas);
      expect(texto).toContain("FLOWERS AND DECOR INVESTMENT");
      expect(texto).not.toContain("INVESTIMENTO EM FLOR E DECOR");
    },
  );

  it(
    "traduzida metade, a outra metade sai em português e nenhuma secção fica em branco",
    { timeout: RELOGIO },
    async () => {
      const doc = taraEMarty({
        serviceGroups: [
          {
            letter: "a)",
            title: "Decoração Floral de Casamento",
            titleEn: "Wedding Floral Design",
            items: [
              { label: "Decor Cerimónia", labelEn: "Ceremony Decor" },
              // Estas duas não foram traduzidas — e a caixa vazia é o caso
              // mais provável de todos.
              { label: "Complementos dos Noivos", labelEn: "" },
              { label: "Decor Cocktail" },
              { label: "Decor Jantar" },
            ],
          },
        ],
      });
      const texto = textoInteiro((await desenhar(doc, "en")).escritas);
      expect(texto).toContain("WEDDING FLORAL DESIGN");
      expect(texto).toContain("CEREMONY DECOR");
      // Sem marca nenhuma no papel: cai para o português e pronto.
      expect(texto).toContain("COMPLEMENTOS DOS NOIVOS");
      expect(texto).toContain("DECOR COCKTAIL");
      expect(texto).not.toContain("[");
    },
  );

  it(
    "em português, um documento COM traduções desenha exactamente o que desenharia sem elas",
    { timeout: RELOGIO },
    async () => {
      const semIngles = taraEMarty();
      const comIngles = taraEMarty({
        serviceGroups: [
          {
            letter: "a)",
            title: "Decoração Floral de Casamento",
            titleEn: "Wedding Floral Design",
            items: [
              { label: "Decor Cerimónia", labelEn: "Ceremony Decor" },
              { label: "Complementos dos Noivos", labelEn: "Couple's Extras" },
              { label: "Decor Cocktail", labelEn: "Cocktail Decor" },
              { label: "Decor Jantar", labelEn: "Dinner Decor" },
            ],
          },
        ],
        budgetItemsEn: ["Ceremony Decor", "Cocktail Decor", "Dinner Decor", "Couple's Extras"],
        totalLabelEn: "Decoration Total",
      });
      const a = await desenhar(semIngles, "pt");
      const b = await desenhar(comIngles, "pt");
      expect(b.paginas).toBe(a.paginas);
      expect(b.escritas).toEqual(a.escritas);
    },
  );
});

describe("A ORDEM — o risco silencioso número um", () => {
  it(
    "os mood boards e o orçamento saem pela MESMA ordem nas duas línguas",
    { timeout: RELOGIO },
    async () => {
      // Os SERVIÇOS traduzidos e as RUBRICAS não: é a combinação que parte o
      // casamento por nomes se a ordem for calculada sobre o documento inglês.
      const doc = taraEMarty({
        serviceGroups: [
          {
            letter: "a)",
            title: "Decoração Floral de Casamento",
            titleEn: "Wedding Floral Design",
            items: [
              { label: "Decor Cerimónia", labelEn: "Ceremony Decor" },
              { label: "Complementos dos Noivos", labelEn: "Couple's Extras" },
              { label: "Decor Cocktail", labelEn: "Cocktail Decor" },
              { label: "Decor Jantar", labelEn: "Dinner Decor" },
            ],
          },
        ],
      });
      // As rubricas saem em português nas duas línguas (só os serviços foram
      // traduzidos), portanto a ordem impressa compara-se directamente.
      const rubricas = [
        "Decor Cerimónia",
        "Decor Cocktail",
        "Decor Jantar",
        "Complementos dos Noivos",
      ];
      const pt = await ordemImpressa(doc, "pt", rubricas);
      const en = await ordemImpressa(doc, "en", rubricas);
      // Em português saem pela ordem dos Serviços (Cerimónia → Complementos →
      // Cocktail → Jantar); em inglês têm de sair pela MESMA, porque a ordem é
      // a do documento e não a da língua.
      expect(pt).toEqual([
        "Decor Cerimónia",
        "Complementos dos Noivos",
        "Decor Cocktail",
        "Decor Jantar",
      ]);
      expect(en).toEqual(pt);
    },
  );

  it(
    "a ordem impressa em inglês é a ordem dos SERVIÇOS, mesmo com tudo traduzido",
    { timeout: RELOGIO },
    async () => {
      const doc = taraEMarty({
        serviceGroups: [
          {
            letter: "a)",
            title: "Decoração Floral de Casamento",
            titleEn: "Wedding Floral Design",
            items: [
              { label: "Decor Cerimónia", labelEn: "Ceremony Decor" },
              { label: "Complementos dos Noivos", labelEn: "Couple's Extras" },
              { label: "Decor Cocktail", labelEn: "Cocktail Decor" },
              { label: "Decor Jantar", labelEn: "Dinner Decor" },
            ],
          },
        ],
        budgetItemsEn: ["Ceremony Decor", "Cocktail Decor", "Dinner Decor", "Couple's Extras"],
      });
      // Escritas por outra ordem no documento, saem pela ordem dos Serviços —
      // e é a ordem PORTUGUESA que decide, embora nenhum destes nomes seja
      // português.
      const en = await ordemImpressa(doc, "en", [
        "Ceremony Decor",
        "Cocktail Decor",
        "Dinner Decor",
        "Couple's Extras",
      ]);
      expect(en).toEqual(["Ceremony Decor", "Couple's Extras", "Cocktail Decor", "Dinner Decor"]);
    },
  );

  it(
    "o relatório de reordenações continua a nomear as rubricas EM PORTUGUÊS",
    { timeout: RELOGIO },
    async () => {
      // O relatório é lido no estúdio, que é português. «Cocktail Decor
      // reordenado» manda quem lê procurar uma rubrica que não existe no editor.
      const doc = taraEMarty({
        budgetItemsEn: ["Ceremony Decor", "Cocktail Decor", "Dinner Decor", "Couple's Extras"],
      });
      const { reordenacoes } = await renderProposalDocPdfWithReport(doc, "en");
      const orcamento = reordenacoes.find((r) => r.onde === "Orçamento");
      expect(orcamento).toBeDefined();
      expect(orcamento?.de).toEqual([
        "Decor Cerimónia",
        "Decor Cocktail",
        "Decor Jantar",
        "Complementos dos Noivos",
      ]);
    },
  );

  it(
    "o aviso de conteúdo cortado nomeia o mood board pelo título PORTUGUÊS",
    { timeout: RELOGIO },
    async () => {
      // Mesma razão: quem lê o aviso vai procurar o board no editor, e no
      // editor ele chama-se como ela lhe chamou.
      const doc = taraEMarty({
        moodBoards: [
          {
            title: "Decoração Cerimónia",
            titleEn: "Ceremony Decoration",
            annotation: `Runner floral com hortênsias verdes, cravo verde e lisianthus branco. ${"Muitas palavras para encher cinco linhas e passar bem delas. ".repeat(
              40,
            )}`,
            images: ["", ""],
          },
        ],
      });
      const { truncations } = await renderProposalDocPdfWithReport(doc, "en");
      const nomes = truncations.map((t) => t.where).join(" | ");
      expect(nomes).toContain("Decoração Cerimónia");
      expect(nomes).not.toContain("Ceremony Decoration");
    },
  );
});

describe("o que continua a NÃO sair", () => {
  it(
    "as notas internas e os custos não saem, com ou sem traduções",
    { timeout: RELOGIO },
    async () => {
      const doc = taraEMarty({
        notasInternas: "Cliente da AMARA, cuidado com o prazo",
        budgetCosts: [300, 200, 800, 100],
        budgetItemsEn: ["Ceremony Decor", "Cocktail Decor", "Dinner Decor", "Couple's Extras"],
      });
      const texto = textoInteiro((await desenhar(doc, "en")).escritas);
      expect(texto).not.toContain("AMARA");
      expect(texto).not.toContain("CUIDADO COM O PRAZO");
    },
  );
});
