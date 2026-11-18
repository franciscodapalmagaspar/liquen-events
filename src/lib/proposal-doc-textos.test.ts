import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PDFDocument, PDFPage, type PDFFont } from "pdf-lib";
vi.mock("@/lib/fotos-editoriais-guardadas", () => ({
  lerFotoEditorialGuardada: async () => null,
  guardarFotoEditorial: async () => undefined,
}));
const { renderEditorialPdf } = await import("./pdf-editorial/montar");
import {
  DEFAULT_CONDICOES_GERAIS,
  DEFAULT_NOTAS_IMPORTANTES,
  DIAS_PARA_CONFIRMAR_CONVIDADOS,
  withProposalDefaults,
  type ProposalDoc,
} from "./proposal-doc";
import {
  MESES_ANTES_DO_SALDO,
  blocosFixosNaLingua,
  camposDoEventoNaLingua,
  referenciaDoDocumento,
  textosDaProposta,
  type BlocosFixos,
  type TextosDoDocumento,
} from "./proposal-doc-textos";
import { type IdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";
import { TEXTO_DO_MOODBOARD } from "./proposal-geometria";
import { SITE } from "./site";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MESMA PROPOSTA, NA LÍNGUA DO CASAL — O QUE ESTE FICHEIRO GARANTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Três coisas, e são três defeitos diferentes:
 *
 *   1. QUE O PORTUGUÊS NÃO MUDOU. É o caminho por que sai tudo o que já
 *      existia. Desenha-se sem idioma e com «pt» e comparam-se as instruções de
 *      desenho uma a uma — mesmas páginas, mesmas coordenadas, mesmas palavras.
 *
 *   2. QUE NÃO SOBRA PORTUGUÊS NA VERSÃO INGLESA. Um rótulo esquecido não dá
 *      erro nenhum: sai uma proposta meio-inglesa, e quem a lê primeiro é o
 *      cliente. O varrimento percorre o dicionário INTEIRO — chave a chave, e
 *      as entradas novas entram sozinhas — e procura cada frase portuguesa no
 *      texto do PDF inglês.
 *
 *   3. QUE AS PALAVRAS INGLESAS CABEM. Em inglês as palavras têm outro
 *      comprimento: um rótulo que cabia pode transbordar a coluna, passar por
 *      cima de um número, ou empurrar uma secção para outra folha. Mede-se —
 *      cada escrita com a sua fonte, o seu corpo e a sua largura real.
 *
 * O texto sai das instruções de desenho e não dos bytes do PDF: as fontes vão
 * embutidas em subconjunto e os códigos dos glifos deixam de ser legíveis (é o
 * mesmo motivo por que `proposal-doc-pdf.paginacao.test.ts` faz o mesmo).
 */

// Oito documentos inteiros, com fontes embutidas — o relógio por omissão do
// vitest (5 s) não chega, e falharia por máquina carregada e não por composição.
const RELOGIO = 120_000;

// ── A sonda ────────────────────────────────────────────────────────────────

interface Escrita {
  pagina: number;
  x: number;
  y: number;
  texto: string;
  /** A largura REAL do que foi escrito, medida com a fonte com que foi escrito. */
  largura: number;
}

/** Desenha o documento e devolve tudo o que foi escrito, com a largura medida. */
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
    const bytes = idioma
      ? (await renderEditorialPdf(doc, idioma)).bytes
      : (await renderEditorialPdf(doc)).bytes;
    return { escritas, paginas: paginas.length, bytes };
  } finally {
    PDFDocument.prototype.addPage = addPageOriginal;
    PDFPage.prototype.drawText = drawTextOriginal;
  }
}

/**
 * O texto do documento, numa só linha, pronto a ser procurado.
 *
 * Duas reconstruções, porque o desenho parte o texto de duas maneiras:
 *
 *   · as legendas em capitulares são desenhadas LETRA A LETRA (é assim que se
 *     lhes dá espaçamento), portanto as escritas de um caráter só, seguidas e à
 *     mesma altura, voltam a colar-se;
 *   · o texto corrido é partido em linhas pelo `wrap`, que separa por espaços —
 *     juntar as escritas com um espaço devolve a frase inteira.
 *
 * Tudo em maiúsculas e com os espaços normalizados: as capitulares e o espaço
 * inquebrável dos euros não podem fazer uma frase escapar ao varrimento.
 */
function textoInteiro(escritas: Escrita[]): string {
  const pedacos: string[] = [];
  let letras: string | null = null;
  let alturaDasLetras = { pagina: -1, y: 0 };
  for (const e of escritas) {
    const solta = [...e.texto].length === 1;
    if (
      solta &&
      letras !== null &&
      alturaDasLetras.pagina === e.pagina &&
      alturaDasLetras.y === e.y
    ) {
      letras += e.texto;
      continue;
    }
    if (letras !== null) pedacos.push(letras);
    if (solta) {
      letras = e.texto;
      alturaDasLetras = { pagina: e.pagina, y: e.y };
    } else {
      letras = null;
      pedacos.push(e.texto);
    }
  }
  if (letras !== null) pedacos.push(letras);
  return normalizar(pedacos.join(" "));
}

/** A forma em que se comparam textos: NFC, sem espaços a mais, em maiúsculas. */
function normalizar(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim().toUpperCase();
}

// ── Os documentos de prova ─────────────────────────────────────────────────
//
// O conteúdo escrito por ela é de propósito POBRE em palavras do dicionário:
// se uma rubrica se chamasse «Cerimónia» — que é também o rótulo de um campo —
// o varrimento não saberia distinguir o rótulo esquecido do nome que ela
// escreveu. O que se está a medir é a moldura, não o recheio.

/** A proposta de decoração cheia: extras, linhas opcionais, nota e inspiração. */
function decoracaoCheia(): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Casamento Maria & Zé 12.09.2026",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Monte da Oliveirinha",
    guests: "120 pax",
    servico: "Decor e design floral",
    ceremony: "Civil",
    time: "16h00",
    coverImages: [],
    moodBoards: [{ title: "Jantar", images: [FOTO], annotation: "Tons de linho e vidro." }],
    serviceGroups: [
      {
        letter: "a)",
        title: "Design Floral",
        items: [
          { label: "Arco", desc: "Estrutura vestida com folhagem e flor natural." },
          { label: "Mesas", desc: "Composições baixas alternadas com velas." },
        ],
      },
    ],
    budgetItems: ["Decor Jantar", "Decor Bar", "Suspensos"],
    budgetAmounts: [4000, 1500, 1375],
    budgetOpcional: [false, true, true],
    budgetExtras: [{ label: "Deslocação da equipa Líquen", valueText: "896,00 €" }],
    budgetNote: "Os valores mantêm-se até à data de validade.",
    totalLabel: "Valor Total Decor",
    totalText: "6875,00 € + IVA",
    totalAmount: 6875,
    totalVatMode: "acrescer",
    depositPercent: 30,
    validUntil: DIA_DE_VALIDADE,
  });
}

/** A mesma, com UMA só linha assinalada — a frase muda de número. */
function decoracaoComUmExtra(): ProposalDoc {
  return withProposalDefaults({
    ...decoracaoCheia(),
    budgetOpcional: [false, true, false],
    moodBoards: [],
  });
}

/** Organização SEM valores adicionais: é aqui que sai o «Total Estimado». */
function organizacao(): ProposalDoc {
  return withProposalDefaults({
    template: "organizacao",
    ref: "PO Organização Ana & Rui",
    clientNames: "Ana & Rui",
    eventType: "Casamento",
    eventDate: "3 de julho de 2027",
    location: "Herdade do Freixo",
    guests: "80 pax",
    servico: "Planeamento integral",
    coverImages: [],
    moodBoards: [],
    cronograma: [{ title: "6-12 meses antes", items: ["Escolha do espaço e visita."] }],
    serviceGroups: [{ title: "Coordenação", items: [{ label: "Reunião inicial" }] }],
    budgetItems: [],
    budgetRows: [{ item: "Coordenação no dia", price: "[Valor]" }],
    totalLabel: "",
    totalText: "",
    totalEstimatedText: "[Valor Total]",
    validUntil: DIA_DE_VALIDADE,
  });
}

/** Organização COM valores adicionais: é aqui que sai o subtotal estimado. */
function organizacaoComExtras(): ProposalDoc {
  return withProposalDefaults({
    ...organizacao(),
    // Com um total a sério: um adicional por cima de um total por definir dava
    // um subtotal de serviços negativo, e o gerador tem razão em o dizer.
    totalEstimatedText: "12.500,00 €",
    totalAmount: 12500,
    totalVatMode: "incluido",
    budgetExtras: [{ label: "Deslocação da equipa Líquen", valueText: "300,00 €" }],
  });
}

/** A data de validade escrita no documento — fixa, para a forma da data ser
 *  comparável palavra a palavra nas duas línguas. */
const DIA_DE_VALIDADE = "2026-10-11";

/**
 * Uma fotografia mínima, para a página de inspiração existir.
 *
 * PNG de 2×2 escrito à mão (assinatura, IHDR, IDAT, IEND): o gerador só precisa
 * de bytes que o `pdf-lib` saiba embutir e que o sharp saiba medir.
 */
const FOTO =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP8//8/AzJgYkAFhPgAZfIDPXf2ZL4AAAAASUVORK5CYII=";

// ── O varrimento: o dicionário inteiro, chave a chave ──────────────────────

/**
 * Como se produz uma frase a partir de uma entrada que é FUNÇÃO.
 *
 * O argumento entra como uma marca (`§`) e a frase é depois partida por ela: o
 * que sobra é a parte FIXA, que é a única que tem de estar traduzida. Assim uma
 * entrada nova com um argumento qualquer entra no varrimento sem ninguém ter de
 * lhe escrever um exemplo.
 *
 * A data é a excepção, e tem de ser: nela o argumento não aparece na frase — é
 * a frase. Sem um exemplo verdadeiro, a forma da data inglesa ficava por medir,
 * que é precisamente uma das decisões deste lote.
 */
const MARCA = "§";
const EXEMPLOS: Partial<Record<keyof TextosDoDocumento, unknown>> = {
  data: DIA_DE_VALIDADE,
};

/** Todas as frases de um dicionário, por chave — as fixas e os pedaços fixos
 *  das que levam um valor pelo meio. */
function frasesDe(t: TextosDoDocumento): Map<string, string[]> {
  const fora = new Map<string, string[]>();
  const guardar = (chave: string, valor: unknown) => {
    if (typeof valor === "string") {
      fora.set(chave, [valor]);
      return;
    }
    if (typeof valor === "function") {
      const exemplo = chave in EXEMPLOS ? EXEMPLOS[chave as keyof TextosDoDocumento] : MARCA;
      const frase = String((valor as (v: unknown) => string)(exemplo));
      // Pedaços com menos de quatro caracteres são cola («)», «.», «As») e não
      // distinguem língua nenhuma — procurá-los só daria falsos alarmes.
      fora.set(
        chave,
        frase
          .split(MARCA)
          .map((p) => p.trim())
          .filter((p) => p.length >= 4),
      );
      return;
    }
    // `null` = o texto vive noutro módulo (ver o dicionário). Em português é
    // isso que sai impresso, e é isso que o varrimento tem de procurar.
    if (valor === null) {
      fora.set(chave, [chave === "slogan" ? SITE.slogan : TEXTO_DO_MOODBOARD.sobretitulo.texto]);
      return;
    }
    if (valor && typeof valor === "object") {
      for (const [sub, v] of Object.entries(valor)) guardar(`${chave}.${sub}`, v);
      return;
    }
    throw new Error(`entrada «${chave}» de um tipo que o varrimento não sabe ler`);
  };
  for (const [chave, valor] of Object.entries(t)) guardar(chave, valor);
  return fora;
}

// ── Os desenhos, feitos uma vez ────────────────────────────────────────────

type Desenho = Awaited<ReturnType<typeof desenhar>>;
const emIngles = new Map<string, Desenho>();
const emPortugues = new Map<string, Desenho>();
const DOCUMENTOS: [string, () => ProposalDoc][] = [
  ["decoração cheia", decoracaoCheia],
  ["decoração com um extra", decoracaoComUmExtra],
  ["organização", organizacao],
  ["organização com adicionais", organizacaoComExtras],
];

beforeAll(async () => {
  for (const [nome, fazer] of DOCUMENTOS) {
    emIngles.set(nome, await desenhar(fazer(), "en"));
    emPortugues.set(nome, await desenhar(fazer(), "pt"));
  }
}, RELOGIO);

afterAll(() => {
  emIngles.clear();
  emPortugues.clear();
});

describe("o caminho de omissão continua a ser o português", () => {
  it(
    "sem idioma e com «pt» desenham exactamente o mesmo, palavra a palavra e ponto a ponto",
    { timeout: RELOGIO },
    async () => {
      const doc = decoracaoCheia();
      const semDizer = await desenhar(doc);
      const aDizerPt = await desenhar(doc, "pt");
      expect(semDizer.escritas).toEqual(aDizerPt.escritas);
      expect(semDizer.paginas).toBe(aDizerPt.paginas);
    },
  );

  it("os blocos de texto fixo em português são as MESMAS listas do documento", () => {
    const doc = decoracaoCheia();
    const blocos = blocosFixosNaLingua(doc, "pt");
    // A mesma referência, não uma cópia igual: o caminho de omissão não copia,
    // não normaliza e não compara nada.
    expect(blocos.notasImportantes).toBe(doc.notasImportantes);
    expect(blocos.condicoesGerais).toBe(doc.condicoesGerais);
    expect(blocos.faseamento).toBe(doc.faseamento);
    expect(blocos.cancelamento).toBe(doc.cancelamento);
    expect(blocosFixosNaLingua(doc).notasImportantes).toBe(doc.notasImportantes);
  });

  /**
   * O casal que ainda não tem data também recebe a proposta em inglês, e a
   * cláusula é a mesma cláusula contratual: sem o dado tem de continuar a ser
   * uma frase, na LÍNGUA em que está a ser escrita — nem um travessão, nem o
   * «a definir» português a meio de uma frase inglesa.
   */
  it("sem data e sem número, as condições inglesas também continuam frases", () => {
    // As condições voltam ao molde: o documento de prova traz-nas já
    // preenchidas com a data que aqui deixa de existir.
    const doc = withProposalDefaults({
      ...decoracaoCheia(),
      eventDate: "",
      guests: "",
      condicoesGerais: undefined,
    });
    const texto = blocosFixosNaLingua(doc, "en").condicoesGerais.join("\n");
    expect(texto).toContain(
      "This proposal is only valid for the event date that is subsequently confirmed in writing.",
    );
    expect(texto).toContain(
      "The quote is valid for the number of guests subsequently confirmed in writing;" +
        " if the final number is lower or higher, the amount of the proposal will have to be revised.",
    );
    expect(texto).not.toContain("{DATA}");
    expect(texto).not.toContain("{CONVIDADOS}");
    expect(texto).not.toContain("—");
    expect(texto).not.toContain("a definir");
  });
});

describe("nada fica por traduzir na versão inglesa", () => {
  it("nenhuma frase portuguesa do dicionário sobrevive no PDF inglês", () => {
    const pt = frasesDe(textosDaProposta("pt"));
    const en = frasesDe(textosDaProposta("en"));
    const encontradas: string[] = [];
    for (const [nome, desenho] of emIngles) {
      const texto = textoInteiro(desenho.escritas);
      for (const [chave, pedacos] of pt) {
        const iguais = JSON.stringify(pedacos) === JSON.stringify(en.get(chave));
        // Palavras que são as mesmas nas duas línguas («Item», «Email»,
        // «extra») não se podem procurar como sobras — são a tradução.
        if (iguais) continue;
        for (const pedaco of pedacos) {
          if (texto.includes(normalizar(pedaco))) {
            encontradas.push(`${nome}: «${pedaco}» (${chave})`);
          }
        }
      }
    }
    expect(encontradas).toEqual([]);
  });

  it("o texto padrão da casa sai traduzido, com os marcadores preenchidos", () => {
    const texto = textoInteiro(emIngles.get("decoração cheia")!.escritas);
    // As notas e as condições da casa, na versão inglesa.
    expect(texto).toContain(normalizar("Set-up and dismantling are included in this proposal"));
    expect(texto).toContain(normalizar("VAT at the applicable legal rate is added to the amounts"));
    expect(texto).toContain(normalizar("All materials and props used at the event"));
    expect(texto).toContain(normalizar("30% on acceptance"));
    expect(texto).toContain(normalizar("In the event of cancellation of the service"));
    // E nenhuma das portuguesas.
    for (const linha of [...DEFAULT_NOTAS_IMPORTANTES, ...DEFAULT_CONDICOES_GERAIS]) {
      expect(texto).not.toContain(normalizar(linha.slice(0, 40)));
    }
    // Os marcadores: a data ENTRA NA CLÁUSULA na língua do documento — foi o
    // nosso código que a escreveu (ver «OS CAMPOS QUE O ESTÚDIO ESCREVEU»). O
    // número de convidados aqui é «120 pax», que se escreve igual nas duas.
    expect(texto).toContain(normalizar("event to be held on 12 September 2026"));
    expect(texto).not.toContain(normalizar("12 de setembro de 2026"));
    expect(texto).toContain(normalizar("valid for the number of guests stated (120 pax)"));
    expect(texto).not.toContain("{DATA}");
    expect(texto).not.toContain("{CONVIDADOS}");
    // E os dias de confirmação continuam a ser a constante, não um número solto.
    expect(texto).toContain(
      normalizar(`confirmed at least ${DIAS_PARA_CONFIRMAR_CONVIDADOS} days before the event`),
    );
  });

  /** Os sete blocos de texto fixo do documento, pelos nomes por que se
   *  desenham. */
  const BLOCOS: (keyof BlocosFixos)[] = [
    "notasImportantes",
    "incluido",
    "naoIncluido",
    "condicoesGerais",
    "observacoesGerais",
    "faseamento",
    "cancelamento",
  ];

  /**
   * ── QUE NÃO SE PERDEU NENHUMA CLÁUSULA ────────────────────────────────────
   *
   * A página das Condições Gerais é a mais perigosa do documento: são cláusulas
   * contratuais, e uma que desapareça na tradução não dá erro nenhum — dá uma
   * proposta inglesa que promete menos (ou exige menos) do que a portuguesa, e
   * ninguém dá por isso até haver uma discussão.
   *
   * Duas medidas, e são as duas que um humano não consegue repetir de cada vez
   * que alguém mexe numa frase: o mesmo NÚMERO de entradas em cada bloco, e as
   * mesmas PERCENTAGENS dentro delas — que são o sinal, o saldo e os 70% do
   * cancelamento, os três números por que se paga.
   */
  it("cada bloco inglês tem exactamente as mesmas entradas que o português", () => {
    const doc = decoracaoCheia();
    // Em português a função devolve o DOCUMENTO (as mesmas listas, sem cópia),
    // por isso os blocos nomeiam-se aqui em vez de se lerem das chaves.
    const pt = blocosFixosNaLingua(doc, "pt");
    const en = blocosFixosNaLingua(doc, "en");
    for (const bloco of BLOCOS) {
      expect(`${bloco}: ${en[bloco].length}`).toBe(`${bloco}: ${pt[bloco].length}`);
      // E nenhuma entrada vazia: uma cláusula apagada por engano deixaria uma
      // linha em branco no meio da lista, que passa por «formatação».
      for (const linha of en[bloco]) expect(linha.trim().length).toBeGreaterThan(0);
    }
  });

  it("as percentagens das cláusulas são as mesmas nas duas línguas", () => {
    const percentagens = (linhas: readonly string[]) =>
      linhas.join(" ").match(/\d+(?:[.,]\d+)?%/g) ?? [];
    for (const pct of [30, 50]) {
      const doc = withProposalDefaults({ ...decoracaoCheia(), depositPercent: pct });
      const pt = blocosFixosNaLingua(doc, "pt");
      const en = blocosFixosNaLingua(doc, "en");
      for (const bloco of BLOCOS) {
        expect(`${pct}% ${bloco}: ${percentagens(en[bloco]).join(" ")}`).toBe(
          `${pct}% ${bloco}: ${percentagens(pt[bloco]).join(" ")}`,
        );
      }
    }
  });

  /**
   * Os prazos das cláusulas dizem-se em inglês com «at least» / «no later
   * than», nunca com «up to»: «até 25 dias antes» é a ÚLTIMA data em que se
   * pode confirmar, e «up to 25 days before the event» lê-se ao contrário —
   * como um tecto («no máximo 25 dias»), o que daria a entender que confirmar
   * com dois meses de antecedência estava fora de prazo.
   */
  it("os prazos ingleses são prazos, e não tectos", () => {
    const doc = decoracaoCheia();
    const tudo = [
      ...blocosFixosNaLingua(doc, "en").condicoesGerais,
      ...blocosFixosNaLingua(doc, "en").faseamento,
      textosDaProposta("en").quandoSaldo,
      textosDaProposta("en").quandoSinal,
    ].join(" ");
    expect(tudo).toContain(`at least ${DIAS_PARA_CONFIRMAR_CONVIDADOS} days before the event`);
    // O prazo vem da constante (ver `MESES_ANTES_DO_SALDO`); o que este teste
    // fixa é a REDACÇÃO à volta dele — «no later than», nunca «up to».
    expect(textosDaProposta("en").quandoSaldo).toBe(
      `no later than ${MESES_ANTES_DO_SALDO} month before the event`,
    );
    expect(tudo).not.toMatch(/up to \d/);
  });

  it("o que ela reescreveu à mão sai tal e qual, mesmo em inglês", async () => {
    const dela = "Só usamos flor da época, colhida na semana do casamento.";
    const doc = withProposalDefaults({ ...decoracaoCheia(), notasImportantes: [dela] });
    const texto = textoInteiro((await desenhar(doc, "en")).escritas);
    expect(texto).toContain(normalizar(dela));
    // A moldura à volta dela continua inglesa: é a rubrica que é da casa.
    expect(texto).toContain(normalizar("Important notes"));
    expect(texto).not.toContain(normalizar("Set-up and dismantling are included"));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   O INGLÊS DA CASA — QUE NÃO SOA A TRADUÇÃO
   ═══════════════════════════════════════════════════════════════════════════

   Uma frase pode estar traduzida, estar gramatical, e mesmo assim dizer ao
   casal que o documento foi escrito noutra língua. Não dá erro nenhum, não
   aparece no varrimento das sobras portuguesas — e é a primeira coisa que se
   nota num documento de vinte mil euros.

   O que se mede aqui é a MOLDURA contra o inglês que a casa já escreve no
   sítio, no portal e nos emails (`src/lib/i18n/en.ts`): uma palavra que a
   proposta escreve de uma maneira e o portal de outra é a mesma marca a falar
   com duas vozes ao mesmo cliente. */

describe("o inglês da moldura é o inglês da casa", () => {
  /**
   * «Contactos» → «Contact», e não «Contacts».
   *
   * O plural é português. Em inglês «contacts» é a lista de pessoas que se
   * conhece (a agenda), não o bloco onde se diz como falar connosco — e a casa
   * já resolveu isto: a navegação e o rodapé do sítio dizem «Contact».
   */
  it("o bloco de contactos chama-se como o sítio lhe chama", () => {
    expect(textosDaProposta("en").contactos).toBe("Contact");
    expect(textosDaProposta("pt").contactos).toBe("Contactos");
  });

  /**
   * «email», sem hífen, em toda a moldura inglesa.
   *
   * O rótulo do bloco de contactos já é «Email»; as cláusulas escreviam
   * «e-mail» na mesma folha. Duas grafias da mesma palavra no mesmo papel leem-
   * se como descuido, e a que a casa usa em prosa — no portal e nos emails que
   * levam a proposta — é a sem hífen.
   */
  it("«email» escreve-se sem hífen, como o rótulo e como o resto da casa", () => {
    const doc = decoracaoCheia();
    const en = blocosFixosNaLingua(doc, "en");
    const tudo = [
      ...Object.values(textosDaProposta("en")).filter((v) => typeof v === "string"),
      ...en.condicoesGerais,
      ...en.cancelamento,
      ...en.observacoesGerais,
      textosDaProposta("en").passoAceitar,
    ].join(" ");
    expect(tudo).not.toMatch(/e-mail/i);
    expect(tudo).toMatch(/\bemail\b/);
  });

  /**
   * ── A CLÁUSULA QUE PERDEU O NOME DE QUEM VALIDA ───────────────────────────
   *
   * A portuguesa diz «terão de ser validados PELA MESMA» — pela Líquen Events,
   * nomeada na frase anterior. A inglesa dizia «subject to OUR confirmation».
   *
   * É uma cláusula contratual escrita na terceira pessoa do princípio ao fim
   * («Líquen Events reserves the right…», «Líquen Events is entitled…»), e um
   * «our» a meio troca de voz dentro da mesma frase: quem lê tem de adivinhar
   * de quem é o «our», que numa folha assinada é exactamente a pergunta que não
   * se pode deixar em aberto.
   */
  it("as condições gerais inglesas falam da Líquen Events na terceira pessoa", () => {
    const clausulas = blocosFixosNaLingua(decoracaoCheia(), "en").condicoesGerais;
    const comPrimeiraPessoa = clausulas.filter((c) => /\b(our|we|us)\b/i.test(c));
    expect(comPrimeiraPessoa).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   OS NÚMEROS DAS CLÁUSULAS — UM SÓ, PARA AS DUAS LÍNGUAS
   ═══════════════════════════════════════════════════════════════════════════

   O teste das percentagens, mais acima, apanha o sinal, o saldo e os 70% do
   cancelamento. Não apanha o resto dos números por que se paga e se conta o
   tempo: o 30.º dia, a hora do oitavo dia útil, os dias de confirmação, o mês
   do saldo. Todos esses estão escritos DUAS vezes — uma em cada língua — e uma
   proposta inglesa a dizer um prazo diferente da portuguesa é a pior coisa que
   esta folha pode fazer, porque vai assinada nas duas.

   A comparação é feita sobre os ALGARISMOS de cada bloco, pela ordem em que
   aparecem. As palavras («oitavo» / «eighth») ficam de fora nas duas línguas, e
   por isso não desequilibram nada. */

/**
 * Os números de um bloco, prontos a comparar entre línguas.
 *
 * O relógio é a única conversão: «14h» em português e «2 p.m.» em inglês são a
 * MESMA hora escrita como cada língua a escreve, e têm de contar como o mesmo
 * número — senão a comparação dava alarme precisamente por a tradução estar
 * certa.
 */
function numerosDoBloco(linhas: readonly string[]): string[] {
  const texto = linhas
    .join(" ")
    .replace(/(\d{1,2})h(?:\d{2})?\b/g, (_, h: string) => `${Number(h)}:00`)
    .replace(/(\d{1,2})\s*p\.?m\.?/gi, (_, h: string) => `${(Number(h) % 12) + 12}:00`)
    .replace(/(\d{1,2})\s*a\.?m\.?/gi, (_, h: string) => `${Number(h) % 12}:00`);
  return texto.match(/\d+(?:[.,:]\d+)?/g) ?? [];
}

describe("os números das cláusulas são os mesmos nas duas línguas", () => {
  /** Os sete blocos, outra vez pelos nomes por que se desenham. */
  const BLOCOS: (keyof BlocosFixos)[] = [
    "notasImportantes",
    "incluido",
    "naoIncluido",
    "condicoesGerais",
    "observacoesGerais",
    "faseamento",
    "cancelamento",
  ];

  it("cada bloco inglês diz os mesmos algarismos, pela mesma ordem", () => {
    // Dois documentos, para o número de convidados entrar nas duas formas em
    // que ele existe: o intervalo do formulário («100 a 150» / «100 to 150»),
    // que se traduz, e o que ela escreve à mão («120 pax»), que não.
    const documentos = [
      decoracaoCheia(),
      withProposalDefaults({
        ...decoracaoCheia(),
        guests: "100 a 150",
        depositPercent: 50,
        condicoesGerais: undefined,
      }),
    ];
    for (const doc of documentos) {
      const pt = blocosFixosNaLingua(doc, "pt");
      const en = blocosFixosNaLingua(doc, "en");
      for (const bloco of BLOCOS) {
        expect(`${bloco}: ${numerosDoBloco(en[bloco]).join(" ")}`).toBe(
          `${bloco}: ${numerosDoBloco(pt[bloco]).join(" ")}`,
        );
      }
    }
  });

  /**
   * O prazo do saldo é dito QUATRO vezes: na linha do faseamento e na coluna do
   * quadro dos pagamentos, vezes duas línguas. Já divergiu uma vez — a inglesa
   * dizia um prazo que a portuguesa não dizia —, e quatro literais soltos é a
   * garantia de que volta a divergir.
   */
  it("o prazo do saldo é o mesmo número nas quatro frases que o dizem", () => {
    const doc = decoracaoCheia();
    // A linha do saldo é a segunda do faseamento; a percentagem que a abre não
    // é o prazo, e sai antes de se procurar o número.
    const semAPercentagem = (linha: string) => linha.replace(/^\s*\d+%/, "");
    const numero = (s: string) => (s.match(/\d+/) ?? ["nenhum"])[0];
    const prazos = {
      "faseamento pt": numero(semAPercentagem(blocosFixosNaLingua(doc, "pt").faseamento[1])),
      "faseamento en": numero(semAPercentagem(blocosFixosNaLingua(doc, "en").faseamento[1])),
      "quadro pt": numero(textosDaProposta("pt").quandoSaldo),
      "quadro en": numero(textosDaProposta("en").quandoSaldo),
    };
    const esperado = prazos["faseamento pt"];
    expect(prazos).toEqual({
      "faseamento pt": esperado,
      "faseamento en": esperado,
      "quadro pt": esperado,
      "quadro en": esperado,
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   OS CAMPOS QUE O ESTÚDIO ESCREVEU
   ═══════════════════════════════════════════════════════════════════════════

   A faixa de apresentação é preenchida de duas mãos: umas linhas vêm do PEDIDO
   através do nosso código («12 de setembro de 2026», «Casamento», «Civil»,
   «100 a 150», e a referência que corre no topo de todas as páginas), outras são
   escritas por ela. As primeiras são nossas e têm de sair na língua do
   documento; as segundas são dela e saem tal e qual.

   O documento de prova traz a referência COMPOSTA — é o caso normal, porque o
   estúdio recompõe-na sozinho até alguém lhe mexer. */

/** Uma proposta em que TODOS os campos do evento são os que o nosso código
 *  escreve, e nenhum deles foi tocado à mão. */
function comOsCamposDoEstudio(over: Partial<ProposalDoc> = {}): ProposalDoc {
  const base = withProposalDefaults({
    ...decoracaoCheia(),
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    guests: "100 a 150",
    ceremony: "Civil",
    moodBoards: [],
    // As condições da casa voltam ao molde para serem preenchidas com ESTES
    // dados: o documento de base traz-nas já preenchidas com outro número de
    // convidados, e uma condição que não bate certo com o molde é — e bem —
    // tratada como reescrita à mão.
    condicoesGerais: undefined,
    ...over,
  });
  // A referência que o estúdio compõe sozinho a partir dos quatro campos.
  return withProposalDefaults({ ...base, ref: referenciaDoDocumento(base, "pt") });
}

describe("os campos que o estúdio escreveu saem na língua do documento", () => {
  it("a data, o tipo, a cerimónia e o número de convidados", { timeout: RELOGIO }, async () => {
    const doc = comOsCamposDoEstudio();
    const en = textoInteiro((await desenhar(doc, "en")).escritas);

    expect(en).toContain(normalizar("12 September 2026"));
    expect(en).toContain(normalizar("Wedding"));
    expect(en).toContain(normalizar("100 to 150"));
    // Nenhuma das formas portuguesas sobrevive — nem na capa, nem na faixa, nem
    // dentro da cláusula que cita a data e o número.
    expect(en).not.toContain(normalizar("12 de setembro de 2026"));
    expect(en).not.toContain(normalizar("Casamento"));
    expect(en).not.toContain(normalizar("100 a 150"));
  });

  it("duas cerimónias numa linha traduzem-se as duas", { timeout: RELOGIO }, async () => {
    const doc = comOsCamposDoEstudio({ ceremony: "Civil, simbólica" });
    const en = textoInteiro((await desenhar(doc, "en")).escritas);
    expect(en).toContain(normalizar("Civil, symbolic"));
    expect(en).not.toContain(normalizar("simbólica"));
  });

  it("o que ela escreveu nestes campos sai tal e qual", { timeout: RELOGIO }, async () => {
    const doc = comOsCamposDoEstudio({
      eventType: "Renovação de votos",
      eventDate: "no fim de semana da vindima",
      ceremony: "Só a bênção, no claustro",
      guests: "uns 90, mais coro",
    });
    const en = textoInteiro((await desenhar(doc, "en")).escritas);
    for (const dela of [
      "Renovação de votos",
      "no fim de semana da vindima",
      "Só a bênção, no claustro",
      "uns 90, mais coro",
    ]) {
      expect(en).toContain(normalizar(dela));
    }
  });

  /**
   * O rótulo do total só é impresso quando o documento NÃO tem um total que se
   * consiga somar — é aí que o quadro fecha na linha única da folha antiga, em
   * vez de fechar na escada TOTAL / IVA / Total a pagar. É também o caso de
   * qualquer proposta a meio, que é como uma proposta passa a maior parte da
   * vida.
   */
  const semTotalSomavel = (over: Partial<ProposalDoc> = {}) =>
    comOsCamposDoEstudio({
      budgetAmounts: undefined,
      budgetExtras: [],
      budgetOpcional: undefined,
      totalAmount: undefined,
      totalVatMode: undefined,
      totalText: "[Valor Total]",
      ...over,
    });

  it("o rótulo do total que o estúdio semeia", { timeout: RELOGIO }, async () => {
    const doc = semTotalSomavel({ totalLabel: "Valor Total Decoração" });
    const en = textoInteiro((await desenhar(doc, "en")).escritas);
    expect(en).toContain(normalizar("Decoration Total"));
    expect(en).not.toContain(normalizar("Valor Total Decoração"));
  });

  it("um rótulo de total escrito por ela fica como está", { timeout: RELOGIO }, async () => {
    const doc = semTotalSomavel({ totalLabel: "Investimento em flor e decor" });
    const en = textoInteiro((await desenhar(doc, "en")).escritas);
    expect(en).toContain(normalizar("Investimento em flor e decor"));
  });
});

describe("as datas e o dinheiro", () => {
  it("a validade sai «11 October 2026» em inglês e «11 de outubro de 2026» em português", () => {
    expect(textoInteiro(emIngles.get("decoração cheia")!.escritas)).toContain(
      normalizar("This proposal is valid until 11 October 2026."),
    );
    expect(textoInteiro(emPortugues.get("decoração cheia")!.escritas)).toContain(
      normalizar("Esta proposta é válida até 11 de outubro de 2026."),
    );
  });

  it("os euros saem à inglesa na folha inglesa e à portuguesa na portuguesa", () => {
    /**
     * ESTA REGRA MUDOU, E A ANTERIOR ESTAVA AQUI ESCRITA.
     *
     * Até aqui a folha inglesa levava a pontuação portuguesa nas duas línguas,
     * pela razão que continua a ser verdadeira: metade do dinheiro desta folha é
     * TEXTO DELA (o «Valor Total», os adicionais, o preço estimado), e duas
     * convenções na mesma coluna leem-se como dois números diferentes.
     *
     * A dona da casa decidiu o contrário — na proposta inglesa o valor escreve-se
     * à inglesa, com o símbolo à frente —, e o que tornou a decisão segura foi
     * resolver o problema em vez de o contornar: a conversão trabalha sobre o
     * TEXTO já escrito e apanha os campos dela também, portanto a coluna
     * continua a falar uma língua só. Ver `montantesEmIngles`.
     */
    const en = textoInteiro(emIngles.get("decoração cheia")!.escritas);
    const pt = textoInteiro(emPortugues.get("decoração cheia")!.escritas);

    for (const [portugues, ingles] of [
      ["6.875,00", "€6,875.00"],
      ["1.581,25", "€1,581.25"],
      ["8.456,25", "€8,456.25"],
      ["2.536,88", "€2,536.88"],
    ]) {
      expect(en, `a folha inglesa tinha de trazer ${ingles}`).toContain(normalizar(ingles));
      expect(pt, `a folha portuguesa tinha de trazer ${portugues}`).toContain(portugues);
    }

    // E nenhuma das duas fica com a pontuação da outra: é isso que garante que
    // não há uma coluna com as duas convenções lado a lado.
    expect(en, "sobrou pontuação portuguesa na folha inglesa").not.toMatch(/\d\.\d{3},\d{2}/);
    expect(pt, "entrou pontuação inglesa na folha portuguesa").not.toMatch(/\d,\d{3}\.\d{2}/);
  });
});

// ── A largura das palavras ─────────────────────────────────────────────────

/** As páginas de conteúdo: todas menos a capa (a primeira) e a contracapa (a
 *  última), que são desenhadas de bordo a bordo e não têm mancha. */
const deConteudo = (d: Desenho) =>
  d.escritas.filter((e) => e.pagina > 0 && e.pagina < d.paginas - 1);

/** As escritas de uma página, à mesma altura, por ordem de esquerda para a
 *  direita — é assim que se vê se uma passa por cima da seguinte. */
function porLinha(escritas: Escrita[]): Escrita[][] {
  const linhas = new Map<string, Escrita[]>();
  for (const e of escritas) {
    const chave = `${e.pagina}@${e.y.toFixed(1)}`;
    (linhas.get(chave) ?? linhas.set(chave, []).get(chave)!).push(e);
  }
  return [...linhas.values()].map((l) => [...l].sort((a, b) => a.x - b.x));
}

describe("as palavras inglesas cabem na folha", () => {
  for (const lingua of ["pt", "en"] as const) {
    // O português corre as mesmas medições de propósito: é o controlo. Uma
    // regra que o português não cumprisse não estaria a medir transbordos —
    // estaria a medir o desenho de sempre.
    const desenhos = () => (lingua === "en" ? emIngles : emPortugues);

    it(`nada se sobrepõe a nada (${lingua})`, () => {
      const encostados: string[] = [];
      for (const [nome, d] of desenhos()) {
        for (const linha of porLinha(deConteudo(d))) {
          for (let i = 1; i < linha.length; i++) {
            const anterior = linha[i - 1];
            const fim = anterior.x + anterior.largura;
            if (fim > linha[i].x + 0.5) {
              encostados.push(
                `${nome}: «${anterior.texto}» acaba em ${fim.toFixed(1)} e ` +
                  `«${linha[i].texto}» começa em ${linha[i].x.toFixed(1)}`,
              );
            }
          }
        }
      }
      expect(encostados).toEqual([]);
    });
  }

  it("a proposta inglesa ocupa as mesmas folhas que a portuguesa", () => {
    // O que se está a impedir é uma secção a mudar de página só porque as
    // palavras inglesas são mais compridas — a cauda do orçamento cabe atrás do
    // quadro com dez pontos de folga, e é ela que parte primeiro.
    for (const [nome, ingles] of emIngles) {
      expect(`${nome}: ${ingles.paginas}`).toBe(`${nome}: ${emPortugues.get(nome)!.paginas}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
/**
 * A HORA DO EVENTO, NA LÍNGUA DE QUEM LÊ
 *
 * A hora era o último pedaço de português que ficava numa proposta inglesa: o
 * campo saía «Time: 16h00». O «h» a separar as horas dos minutos é notação
 * portuguesa — um casal britânico lê horas em ciclo de doze e diz «4 p.m.», que
 * é aliás como esta mesma folha já escreve a hora do cancelamento («2 p.m. on
 * the eighth working day»). Duas notações na mesma folha é uma delas estar
 * errada.
 *
 * Traduz-se por RECONHECIMENTO, como o tipo de evento e os convidados: só o que
 * é inequivocamente um relógio. Uma hora escrita à maneira dela («ao final da
 * tarde», «17h–23h») fica exactamente como ela a escreveu — inventar uma
 * conversão sobre texto que não se percebeu é pior do que deixar o português.
 */
describe("a hora do evento em inglês", () => {
  const horaEm = (time: string, idioma: IdiomaDaProposta = "en") =>
    camposDoEventoNaLingua({ eventType: "", eventDate: "", guests: "", time }, idioma).time;

  it("«16h00» é «4 p.m.», como a folha já escreve as horas", () => {
    expect(horaEm("16h00")).toBe("4 p.m.");
  });

  it("os minutos vão junto quando existem", () => {
    expect(horaEm("16h30")).toBe("4:30 p.m.");
    expect(horaEm("11h15")).toBe("11:15 a.m.");
  });

  it("a hora sem minutos e a hora com dois pontos são a mesma hora", () => {
    // Ela escreve das duas maneiras, e as duas são relógios.
    expect(horaEm("16h")).toBe("4 p.m.");
    expect(horaEm("16:00")).toBe("4 p.m.");
  });

  it("nem «0 a.m.» nem «12 p.m.»: meio-dia e meia-noite dizem-se por extenso", () => {
    // «12 p.m.» é ambíguo em inglês — metade das pessoas lê-o como meia-noite.
    expect(horaEm("12h00")).toBe("12 noon");
    expect(horaEm("00h00")).toBe("12 midnight");
    expect(horaEm("12h30")).toBe("12:30 p.m.");
  });

  it("o que não é um relógio fica como ela o escreveu", () => {
    // Melhor uma frase portuguesa dela do que uma hora inventada por nós.
    expect(horaEm("ao final da tarde")).toBe("ao final da tarde");
    expect(horaEm("17h às 23h")).toBe("17h às 23h");
    expect(horaEm("25h00")).toBe("25h00");
    expect(horaEm("")).toBe("");
  });

  it("em português não se toca na hora", () => {
    expect(horaEm("16h00", "pt")).toBe("16h00");
  });
});
