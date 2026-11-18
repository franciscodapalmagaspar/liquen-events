import { describe, it, expect, vi, beforeAll } from "vitest";
import sharp from "sharp";
import { PDFDocument, PDFPage } from "pdf-lib";
import { renderProposalDocPdf } from "./proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import { type IdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CARÁTER QUE FAZ O «GERAR» DEVOLVER UM ERRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `pdf-lib` desenha texto de duas maneiras, e as duas RECUSAM o que a fonte
 * não sabe: as fontes-padrão (WinAnsi) atiram em tudo o que o CP1252 não
 * codifique, e `widthOfTextAtSize` atira exactamente pelas mesmas razões — o
 * que quer dizer que MEDIR uma linha rebenta tão facilmente como desenhá-la.
 *
 * Do outro lado está uma folha feita de texto que ninguém validou: um apelido
 * polaco («Wojciech Wiśniewski»), um travessão e umas aspas curvas colados de
 * um Word, um emoji no título de um mood board, um nome chinês. Um só que
 * escape ao `textoParaFonte`/`winAnsiSafe` e o botão «Gerar» devolve um erro em
 * vez de uma proposta.
 *
 * ── PORQUE É QUE ISTO É UM VARRIMENTO E NÃO TRÊS CASOS ────────────────────
 *
 * Já havia um teste com emoji — no nome do casal e num serviço, no modelo de
 * Decoração e em português. Cobria três caminhos de desenho de várias dezenas,
 * e não cobria nenhum dos que foram acrescentados depois (a coluna de preço do
 * modelo de Organização, o quadro inglês, as legendas dos mood boards, o
 * cronograma, os blocos fixos). O defeito que aqui se procura não vive num
 * campo: vive num campo QUE NINGUÉM SE LEMBROU DE SANITIZAR — por isso o
 * varrimento envenena TODOS os campos de texto do documento de uma vez, nos
 * dois modelos e nas duas línguas.
 *
 * ── O QUE SE MEDE ─────────────────────────────────────────────────────────
 *
 *   1. QUE NÃO ATIRA. É a diferença entre uma proposta e um erro.
 *   2. QUE NÃO SAI UM «?» AO CLIENTE. O `textoParaFonte` faz DESAPARECER o que
 *      a fonte embutida não tem, em vez de o trocar por «?» — a razão está
 *      escrita no `pdf-text.ts`: «um ponto de interrogação a meio de uma frase
 *      parece um erro NOSSO na proposta que o casal recebe». Nada neste
 *      documento tem um ponto de interrogação legítimo, portanto qualquer um
 *      que apareça é um caminho de desenho a passar pelo `winAnsiSafe` quando
 *      devia perguntar à fonte — ou a não passar por nada.
 *   3. QUE O TEXTO À VOLTA SOBREVIVE. Sanitizar não pode ser apagar a frase: a
 *      parte legível de cada campo envenenado tem de sair impressa.
 */

vi.setConfig({ testTimeout: 120_000 });

/**
 * Os passageiros que chegam do mundo real, e de onde vêm:
 *
 *   · `🌿`  emoji — o teclado do telemóvel, um título de mood board;
 *   · `李明` alfabeto não-latino — um nome de cliente;
 *   · `Ω`   símbolo fora do Latin-1 — colado de um documento técnico;
 *   · `ł`   latino ESTENDIDO — «Wiśniewski», «Michał»: parece uma letra
 *           normal, e o WinAnsi não a tem;
 *   · `​`   espaço de largura zero — invisível, cola-se do Instagram;
 *   · ` ` separador de linha — o shift+Enter do Word.
 */
const VENENO = "🌿李明Ωł​ ś";

/**
 * O veneno, letra a letra — para se poder procurar cada um no papel.
 *
 * O «ł» e o «ś» estão de fora: são LETRAS de um nome próprio, e a regra para
 * elas é outra (perdem o acento e ficam, ver `semAcento` em `pdf-text.ts`).
 * O que aqui se procura é o que não é letra nenhuma e tem mesmo de desaparecer.
 */
const NAO_DESENHAVEIS = ["🌿", "李", "明", "Ω", "​", " "];

/** Um valor envenenado, com uma marca única para se poder procurar no papel. */
const sujo = (marca: string): string => `${marca} ${VENENO}`;

interface Escrita {
  pagina: number;
  texto: string;
}

async function escritasDe(doc: ProposalDoc, idioma: IdiomaDaProposta) {
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
    escritas.push({ pagina: paginas.indexOf(this), texto: String(texto) });
    return drawTextOriginal.call(this, texto, opts);
  };

  try {
    const bytes = await renderProposalDocPdf(doc, idioma);
    return { escritas, bytes };
  } finally {
    PDFDocument.prototype.addPage = addPageOriginal;
    PDFPage.prototype.drawText = drawTextOriginal;
  }
}

/** Uma fotografia a sério — sem ela o mood board é saltado («skip empty
 *  boards») e as três marcas da página de inspiração nunca chegam ao papel. */
let FOTO = "";
beforeAll(async () => {
  const bytes = await sharp({
    create: { width: 120, height: 90, channels: 3, background: { r: 120, g: 140, b: 120 } },
  })
    .jpeg()
    .toBuffer();
  FOTO = `data:image/jpeg;base64,${bytes.toString("base64")}`;
});

/** Uma proposta com TODOS os campos de texto envenenados. */
function envenenada(template: "decoracao" | "organizacao"): ProposalDoc {
  return withProposalDefaults({
    template,
    ref: sujo("MarcaRef"),
    headerTitle: sujo("MarcaCabecalho"),
    clientNames: sujo("MarcaNomes"),
    eventType: sujo("MarcaTipo"),
    eventDate: sujo("MarcaData"),
    location: sujo("MarcaLocal"),
    guests: sujo("MarcaConvidados"),
    ceremony: sujo("MarcaCerimonia"),
    time: sujo("MarcaHora"),
    servico: sujo("MarcaServico"),
    coverImages: ["", ""],
    serviceGroups: [
      {
        letter: "a)",
        title: sujo("MarcaGrupo"),
        // O segundo é a linha SEM RÓTULO — «ela escreve linhas que são só uma
        // frase» —, que é um caminho de desenho à parte.
        items: [
          { label: sujo("MarcaRotulo"), desc: sujo("MarcaDescricao") },
          { label: "", desc: sujo("MarcaSoDescricao") },
        ],
      },
    ],
    cronograma: [{ title: sujo("MarcaFase"), items: [sujo("MarcaTarefa")] }],
    moodBoards: [
      {
        title: sujo("MarcaBoard"),
        subtitulo: sujo("MarcaSubtitulo"),
        annotation: sujo("MarcaLegenda"),
        images: [FOTO],
      },
    ],
    budgetItems: [sujo("MarcaRubrica")],
    budgetAmounts: [10000],
    budgetRows: [{ item: sujo("MarcaLinhaOrg"), price: `4.600,00 € ${VENENO}` }],
    budgetExtras: [{ label: sujo("MarcaAdicional"), valueText: `896,00 € ${VENENO}` }],
    budgetNote: sujo("MarcaNota"),
    totalLabel: sujo("MarcaRotuloTotal"),
    totalText: `10.000,00 € + IVA ${VENENO}`,
    totalEstimatedText: `12.500,00 € ${VENENO}`,
    totalAmount: 10000,
    totalVatMode: "acrescer",
    notasImportantes: [sujo("MarcaNotaImportante")],
    incluido: [sujo("MarcaIncluido")],
    naoIncluido: [sujo("MarcaNaoIncluido")],
    condicoesGerais: [sujo("MarcaCondicao")],
    observacoesGerais: [sujo("MarcaObservacao")],
    faseamento: [sujo("MarcaFaseamento")],
    cancelamento: [sujo("MarcaCancelamento")],
  } as Parameters<typeof withProposalDefaults>[0]);
}

/**
 * As marcas que CADA modelo desenha mesmo.
 *
 * Escritas à mão e não contadas: os dois modelos imprimem quadros diferentes —
 * o de Decoração não tem cronograma nem linhas com preço, o de Organização não
 * tem mood boards nem a lista de rubricas — e uma contagem cega dava um
 * vermelho por um campo que aquele modelo nunca imprimiu. O que interessa é que
 * NENHUM campo desenhado perca a sua frase.
 */
const COMUNS = [
  "MarcaRef",
  "MarcaNomes",
  "MarcaData",
  "MarcaLocal",
  "MarcaConvidados",
  "MarcaServico",
  "MarcaGrupo",
  "MarcaRotulo",
  "MarcaDescricao",
  "MarcaSoDescricao",
  "MarcaNota",
  "MarcaNotaImportante",
  "MarcaIncluido",
  "MarcaNaoIncluido",
  "MarcaCondicao",
  "MarcaObservacao",
  "MarcaFaseamento",
  "MarcaCancelamento",
];
const ESPERADAS: Record<"decoracao" | "organizacao", string[]> = {
  decoracao: [
    ...COMUNS,
    "MarcaTipo",
    "MarcaCerimonia",
    "MarcaHora",
    "MarcaBoard",
    "MarcaSubtitulo",
    "MarcaLegenda",
    "MarcaRubrica",
    "MarcaAdicional",
    // `MarcaRotuloTotal` fica de fora: numa proposta COM valores adicionais o
    // número grande leva o rótulo da casa («Total a pagar») e não o dela — é
    // uma decisão do bloco de totais, não uma perda de texto.
  ],
  organizacao: [...COMUNS, "MarcaFase", "MarcaTarefa", "MarcaLinhaOrg"],
};

describe("nenhum caráter estrangeiro deita abaixo a geração da proposta", () => {
  for (const template of ["decoracao", "organizacao"] as const) {
    for (const idioma of ["pt", "en"] as const) {
      it(`modelo ${template}, folha ${idioma}: desenha, sem «?» e sem perder as frases`, async () => {
        const doc = envenenada(template);

        // 1. Não atira — o botão «Gerar» devolve uma proposta e não um erro.
        const { escritas, bytes } = await escritasDe(doc, idioma);
        expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");

        // 2. Nenhum «?» chega ao papel. O documento não tem um único ponto de
        //    interrogação legítimo, portanto todos os que aparecerem são o
        //    sintoma do `winAnsiSafe` a substituir o que a Carlito desenharia.
        const comInterrogacao = escritas.filter((e) => e.texto.includes("?"));
        expect(
          comInterrogacao.map((e) => `p${e.pagina}: ${e.texto}`),
          "«?» impressos numa folha que vai para o casal",
        ).toEqual([]);

        const todo = escritas.map((e) => e.texto).join("\n");

        // 3. E nada do que a fonte não sabe desenhar sobrevive — nem o emoji,
        //    nem o alfabeto que ela não tem, nem os invisíveis colados do Word.
        for (const passageiro of NAO_DESENHAVEIS) {
          expect(todo.includes(passageiro), `«${passageiro}» impresso na folha`).toBe(false);
        }

        // 4. O que era legível continua legível: cada campo DESENHADO deixou a
        //    sua marca no papel. Sanitizar não pode ser apagar a frase.
        const perdidas = ESPERADAS[template].filter((m) => !todo.includes(m));
        expect(perdidas, "campos envenenados que desapareceram da folha").toEqual([]);
      });
    }
  }

  /**
   * O DINHEIRO ENVENENADO — o caminho acrescentado por último.
   *
   * A conversão inglesa (`montantesEmIngles`) trabalha sobre o TEXTO já escrito
   * e corre ANTES de o `textoParaFonte` ver a linha. Um valor escrito à mão com
   * lixo colado ao lado («4.600,00 € 🌿») passa pelas duas: o número tem de sair
   * à inglesa e o emoji tem de desaparecer sem levar o número com ele.
   */
  it("um montante com lixo colado sai na pontuação da folha, sem o lixo", async () => {
    const doc = withProposalDefaults({
      template: "decoracao",
      ref: "Decoração Casamento Zofia & Michał Wiśniewski",
      clientNames: "Zofia & Michał Wiśniewski",
      eventType: "Casamento",
      eventDate: "20 de maio de 2028",
      location: "Herdade da Maridona",
      guests: "80 pax",
      coverImages: ["", ""],
      serviceGroups: [],
      moodBoards: [],
      budgetItems: ["Decoração floral"],
      budgetAmounts: [10000],
      budgetExtras: [{ label: `Deslocação ${VENENO}`, valueText: "7890,00 €" }],
      totalLabel: "Valor Total Decoração",
      totalText: `10.000,00 € + IVA`,
      totalAmount: 10000,
      totalVatMode: "acrescer",
    } as Parameters<typeof withProposalDefaults>[0]);

    const { escritas } = await escritasDe(doc, "en");
    const todo = escritas.map((e) => e.texto).join("\n");
    /**
     * O NOME NA CAPA, INTEIRO.
     *
     * A Carlito embutida vem em subconjunto e não tem nem o «ł» nem o «ś». O
     * desenho fazia-os DESAPARECER — «Zofia & Micha Winiewski», em corpo 52, na
     * primeira coisa que o casal vê. Sem acento é uma escolha; sem letras é um
     * erro nosso.
     */
    expect(todo, "o apelido polaco perdeu letras na capa").toContain("Michal Wisniewski");
    expect(todo).not.toContain("Micha Winiewski");
    // …e nenhuma linha traz um «?» no lugar de uma letra.
    expect(escritas.filter((e) => e.texto.includes("?")).map((e) => e.texto)).toEqual([]);
    // O adicional escrito «7890,00 €» é lido como 7.890 € e desenhado à inglesa.
    expect(todo).toContain("€7,890.00");
  });
});
