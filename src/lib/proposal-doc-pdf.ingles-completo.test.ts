import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { renderProposalDocPdf, renderProposalDocPdfWithReport } from "./proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import { textosDaProposta } from "./proposal-doc-textos";
import { type IdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";
import { camposComVersaoInglesa, camposPorTraduzir, lerEn } from "./proposal-doc-bilingue";
import { lerCampo } from "./proposal-ortografia";
import { lerPdf } from "./proposta-de-pdf/leitura";
import { linhasDaPagina } from "./proposta-de-pdf/linhas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF INGLÊS, LIDO DE VOLTA — «está tudo em inglês? não falta nada?»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pergunta dela, à letra: «quero que tenhas atenção se fica tudo em inglês bem
 * escrito e não falta nada na proposta quando é gerada».
 *
 * A resposta não se dá a olhar para o código: dá-se a GERAR o PDF e a ler o que
 * lá está dentro. É o que este ficheiro faz, e é a diferença que o separa dos
 * testes bilingues que já existem:
 *
 *  · `proposal-doc-pdf.bilingue.test.ts` e `proposal-doc-textos.test.ts` leem as
 *    INSTRUÇÕES de desenho (espiam o `drawText`). Medem o que o gerador MANDOU
 *    desenhar.
 *  · aqui lê-se o FICHEIRO — os mesmos bytes que o casal abre —, com o mesmo
 *    motor de pdf.js que o estúdio usa para importar propostas antigas
 *    (`proposta-de-pdf/leitura.ts`). Mede-se o que lá ESTÁ.
 *
 * As duas medidas não são a mesma. Entre a instrução e o papel há a fonte
 * embutida em subconjunto, o saneamento de caracteres (`textoParaFonte`), a
 * paginação e o recorte da mancha. Um caráter que a Carlito não desenhe
 * desaparece no papel e continua presente na instrução.
 *
 * ── COMO SE DISTINGUE «SOBROU PORTUGUÊS» DE UM NOME PRÓPRIO ────────────────
 *
 * É a pergunta difícil deste ficheiro, e a resposta NÃO é ortográfica: «Quinta
 * do Hespanhol» e «Decoração Cerimónia» têm exactamente a mesma cara — acentos,
 * palavras portuguesas, maiúsculas. O que as separa é a PROVENIÊNCIA, e o
 * documento sabe-a:
 *
 *  1. o que ELA escreve e o estúdio lhe dá caixa inglesa (títulos de serviços,
 *     legendas, rubricas, adicionais, nota do orçamento — o inventário está em
 *     `camposComVersaoInglesa`) sai na versão inglesa DELA quando existe, e em
 *     português quando não existe. Nos dois casos é dela: não acusa;
 *  2. os NOMES PRÓPRIOS — o casal, o local, a referência, a marca da casa e as
 *     entidades que a moldura inglesa cita de propósito (Líquen Events, Évora,
 *     o Centro de Arbitragem de Lisboa) — não se traduzem nunca: não acusam;
 *  3. TUDO O RESTO que fica no papel é da MOLDURA, e a moldura tem de estar em
 *     inglês. É aí que se procura português.
 *
 * O `time` («16h00») é o caso que esta distinção existe para apanhar: não tem
 * caixa inglesa (não está em `CampoDeTexto`), não é traduzido por
 * reconhecimento como a data e a cerimónia, e NÃO É UM NOME — é uma notação
 * portuguesa de horas. Por isso fica no que se varre, e é acusado.
 */

/** Um PDF cheio com fotografias verdadeiras demora; 180 s é folga confortável. */
const RELOGIO = 180_000;

/* ═══════════════════════════════════════════════════════════════════════════
   O ARMAZENAMENTO, DE MENTIRA — só para o percurso que ela percorre
   ═══════════════════════════════════════════════════════════════════════════

   O último teste deste ficheiro passa pelo `renderStoredProposalDocPdf…`, que é
   o caminho REAL do botão «Gerar»: preenche os textos da casa, resolve cada
   referência de foto contra o Storage e só depois desenha. As fotos não têm
   língua nenhuma (está dito no próprio módulo), por isso o duplo devolve sempre
   os mesmos bytes — o que aqui interessa é que o `idioma` atravesse o caminho
   inteiro e que os textos da casa entrem PREENCHIDOS, como entram em produção. */
const armazem = vi.hoisted(() => ({
  bytes: null as Buffer | null,
}));
vi.mock("@/lib/proposal-storage", () => ({
  fetchProposalImageBytes: vi.fn(async () => armazem.bytes),
  fetchProposalThumbBytes: vi.fn(async () => null),
  fetchProposalCoverBytes: vi.fn(async () => null),
  uploadProposalCover: vi.fn(async () => false),
}));
const { renderStoredProposalDocPdfWithReport } = await import("./proposal-doc-render");

/* ═══════════════════════════════════════════════════════════════════════════
   LER O PDF — e provar primeiro que a leitura lê
   ═══════════════════════════════════════════════════════════════════════════ */

interface LinhaImpressa {
  /** A contar de 1, como no leitor dela. */
  pagina: number;
  /** A linha «como se lê»: as corridas da mesma linha de base, da esquerda para
   *  a direita, juntas por espaços (ver `proposta-de-pdf/linhas.ts`). */
  texto: string;
}

interface Impresso {
  paginas: number;
  linhas: LinhaImpressa[];
  /** Tudo junto, sem espaços e em maiúsculas — ver {@link compacto}. */
  todo: string;
}

/**
 * O texto para PROCURAR: maiúsculas e sem um único espaço.
 *
 * As capitulares do documento («A P R O P O S T A», «I N S P I R A T I O N»)
 * são desenhadas letra a letra com espaço pelo meio, e o resto do texto tem os
 * espaços normais. Deitar TODOS fora põe as duas famílias na mesma forma e faz
 * uma procura por «INSPIRATION» encontrar as duas.
 *
 * Os acentos MANTÊM-SE: são metade da prova deste ficheiro.
 */
function compacto(texto: string): string {
  return texto.normalize("NFC").replace(/\s+/g, "").toUpperCase();
}

/** Gera o PDF a sério e lê-o de volta, página a página. */
async function impresso(doc: ProposalDoc, idioma: IdiomaDaProposta): Promise<Impresso> {
  return lerBytes(await renderProposalDocPdf(doc, idioma));
}

async function lerBytes(bytes: Uint8Array): Promise<Impresso> {
  const r = await lerPdf(bytes, { orcamentoMs: 120_000 });
  if (!r.ok) throw new Error(`o motor do estúdio recusou o nosso próprio PDF: ${r.porque}`);
  const linhas: LinhaImpressa[] = [];
  for (const pagina of r.leitura.paginas) {
    for (const l of linhasDaPagina(pagina)) linhas.push({ pagina: pagina.numero, texto: l.texto });
  }
  const paginas = r.leitura.paginas.length;
  // Quem recebe o documento aberto tem de o fechar — sem isto os pixéis
  // descodificados de cada PDF lido ficavam presos até ao fim do processo.
  await r.leitura.documento.destroy();
  return { paginas, linhas, todo: compacto(linhas.map((l) => l.texto).join(" ")) };
}

/* ═══════════════════════════════════════════════════════════════════════════
   O DOCUMENTO DE PROVA — uma proposta de casamento como as que saem daqui
   ═══════════════════════════════════════════════════════════════════════════

   Cheia de propósito: dois grupos de serviços com descrições, três mood boards
   com subtítulo e anotação, quatro rubricas de orçamento (uma marcada «extra»),
   dois valores adicionais, nota, total com IVA a acrescer e faseamento. E com
   as versões inglesas preenchidas — é o documento como ela o tem depois de
   carregar em «Traduzir para inglês» e rever. */

/** Uma fotografia verdadeira, pequena. O `sharp` mede-a, o `pdf-lib` embute-a e
 *  a geometria dos mood boards recebe uma forma a sério em vez da de omissão. */
async function foto(w: number, h: number, r: number, g: number, b: number): Promise<string> {
  const bytes = await sharp({
    create: { width: w, height: h, channels: 3, background: { r, g, b } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
  return bytes.toString("base64");
}

let FOTOS: string[] | null = null;
async function fotos(): Promise<string[]> {
  if (!FOTOS) {
    FOTOS = await Promise.all([
      foto(900, 600, 190, 130, 95),
      foto(600, 900, 60, 90, 70),
      foto(800, 800, 210, 200, 180),
      foto(1200, 500, 120, 140, 110),
    ]);
  }
  return FOTOS;
}

/** A data de validade fixa, para a forma da data ser comparável palavra a
 *  palavra nas duas línguas. */
const DIA_DE_VALIDADE = "2026-10-11";

async function propostaDeCasamento(over: Partial<ProposalDoc> = {}): Promise<ProposalDoc> {
  const [a, b, c, d] = await fotos();
  return withProposalDefaults({
    template: "decoracao",
    // A referência composta pelo estúdio — é esta forma que `referenciaNaLingua`
    // reconhece como sua e traduz. Escrita à mão, ficaria como está.
    ref: "Decoração Casamento Tara & Marty · 12 de setembro de 2026",
    clientNames: "Tara & Marty",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Quinta do Hespanhol, Évora",
    guests: "100 a 150",
    ceremony: "Civil, simbólica",
    time: "16h00",
    servico: "Decor e decoração floral",
    servicoEn: "Decor and floral design",
    coverImages: [a, b],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral de Casamento",
        titleEn: "Wedding Floral Design",
        items: [
          {
            label: "Decor Cerimónia",
            labelEn: "Ceremony Decor",
            desc: "Arco floral e passadeira com pétalas naturais.",
            descEn: "Floral arch and aisle with natural petals.",
          },
          {
            label: "Decor Cocktail",
            labelEn: "Cocktail Decor",
            desc: "Centros de mesa e iluminação ambiente.",
            descEn: "Table centrepieces and ambient lighting.",
          },
        ],
      },
      {
        letter: "b)",
        title: "Complementos dos Noivos",
        titleEn: "Couple's Extras",
        items: [
          { label: "Ramo de Noiva", labelEn: "Bridal Bouquet" },
          { label: "Botoeira", labelEn: "Buttonhole" },
        ],
      },
    ],
    moodBoards: [
      {
        title: "Decoração Cerimónia",
        titleEn: "Ceremony Decoration",
        subtitulo: "Arco e passadeira",
        subtituloEn: "Arch and aisle",
        annotation: "Hortênsias verdes, cravo verde e lisianthus branco.",
        annotationEn: "Green hydrangeas, green carnation and white lisianthus.",
        images: [a, b, c],
      },
      {
        title: "Decoração Jantar",
        titleEn: "Dinner Decoration",
        subtitulo: "Mesas compridas",
        subtituloEn: "Long tables",
        annotation: "Composições baixas, velas e têxteis em linho.",
        annotationEn: "Low arrangements, candles and linen textiles.",
        images: [c, d],
      },
      {
        title: "Complementos dos Noivos",
        titleEn: "Couple's Extras",
        subtitulo: "Ramo de Noiva (a definir com a Noiva)",
        subtituloEn: "Bridal bouquet (to be decided with the bride)",
        annotation: "Rosas de jardim e eucalipto.",
        annotationEn: "Garden roses and eucalyptus.",
        images: [b, d],
      },
    ],
    budgetItems: ["Decor Cerimónia", "Decor Cocktail", "Ramo de Noiva", "Botoeira"],
    budgetItemsEn: ["Ceremony Decor", "Cocktail Decor", "Bridal Bouquet", "Buttonhole"],
    budgetAmounts: [820, 460, 180, 40],
    budgetOpcional: [false, false, false, true],
    budgetExtras: [
      {
        label: "Deslocação da equipa Líquen",
        labelEn: "Líquen team travel",
        valueText: "150,00 €",
      },
      { label: "Wedding Coordinator", labelEn: "Wedding Coordinator", valueText: "895,00 € + IVA" },
    ],
    budgetNote: "Os valores são estimativas e podem ser ajustados até à confirmação.",
    budgetNoteEn: "The amounts are estimates and may be adjusted until confirmation.",
    totalLabel: "Valor Total Decoração",
    totalText: "1.500,00 € + IVA",
    totalAmount: 1500,
    totalVatMode: "acrescer",
    validUntil: DIA_DE_VALIDADE,
    ...over,
  } as Parameters<typeof withProposalDefaults>[0]);
}

/* ═══════════════════════════════════════════════════════════════════════════
   O QUE É DELA — o que o varrimento tem de deixar passar
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Tudo o que o documento imprime por conta DELA, na forma em que deve sair no
 * PDF inglês: a versão inglesa quando ela a escreveu, a portuguesa quando não.
 *
 * Sai do INVENTÁRIO (`camposComVersaoInglesa`) e não de uma lista escrita à mão:
 * é o mesmo inventário que dá as caixas ao estúdio e que conta os campos por
 * traduzir. Uma lista à parte divergia no dia em que nascesse um campo novo — e
 * o sintoma seria um varrimento a acusar prosa dela como se fosse moldura.
 */
function prosaDela(doc: ProposalDoc): string[] {
  const out: string[] = [];
  for (const { campo } of camposComVersaoInglesa(doc)) {
    const en = (lerEn(doc, campo) ?? "").trim();
    const pt = (lerCampo(doc, campo) ?? "").trim();
    if (en) out.push(en);
    if (pt) out.push(pt);
  }
  return out;
}

/**
 * Os NOMES PRÓPRIOS que atravessam as duas línguas.
 *
 * Duas famílias, e as duas são nomes:
 *
 *  · os do DOCUMENTO — o casal, o local, a referência (que é composta com o
 *    nome deles). Não têm caixa inglesa porque um nome não se traduz;
 *  · os da CASA e os que a moldura inglesa cita DE PROPÓSITO — a marca, o
 *    contacto, o distrito de Évora (a condição da deslocação cita-o em inglês),
 *    e o centro de arbitragem de Lisboa, cujo nome legal está escrito em
 *    português dentro da cláusula inglesa porque é o nome da entidade.
 *
 * A referência entra pelas duas formas: o documento guarda a portuguesa e o PDF
 * inglês imprime a inglesa («Decoration Wedding …»), e as duas são nomes.
 */
function nomesProprios(doc: ProposalDoc): string[] {
  return [
    doc.clientNames,
    doc.location,
    doc.ref,
    "Líquen Events",
    "Líquen",
    "liquen.alentejo@gmail.com",
    "Évora",
    "Centro de Arbitragem de Conflitos de Consumo de Lisboa",
  ].filter(Boolean);
}

/**
 * O que fica no papel depois de tirar o que é dela e os nomes próprios — a
 * MOLDURA, e mais nada. É aqui que se procura português.
 *
 * Trabalha sobre o texto compacto: as capitulares são desenhadas letra a letra
 * («L Í Q U E N E V E N T S») e uma subtracção feita sobre o texto com espaços
 * nunca lhes tocaria.
 */
function molduraDe(linha: string, permitido: string[]): string {
  let resto = compacto(linha);
  // Do mais comprido para o mais curto: «Complementos dos Noivos» tem de sair
  // inteiro antes de alguém tentar tirar «Noivos».
  for (const p of [...permitido].sort((a, b) => b.length - a.length)) {
    const alvo = compacto(p);
    if (!alvo) continue;
    while (resto.includes(alvo)) resto = resto.replace(alvo, " ");
  }
  return resto;
}

/** As letras que só o português desta casa escreve. Um acento no que sobrou da
 *  moldura é, por construção, moldura por traduzir. */
const ACENTOS = /[ÁÀÂÃÉÊÍÓÔÕÚÜÇ]/;

/**
 * Marcas portuguesas SEM acento — o acento apanha quase tudo, estas são as que
 * lhe escapam. Escritas compactas porque é sobre o texto compacto que se
 * procura.
 *
 * «TOTAL» sozinho NÃO entra: é palavra inglesa e a moldura inglesa usa-a em
 * «Total payable», «Decoration Total», «TOTAL (excl. VAT)». O que acusa é a
 * frase portuguesa inteira.
 */
const MARCAS_PT: ReadonlyArray<[nome: string, marca: RegExp]> = [
  ["IVA", /\bIVA\b|\(IVA|IVA\)/],
  ["«Total a pagar»", /TOTALAPAGAR/],
  ["«Valor Total»", /VALORTOTAL/],
  ["«Convidados»", /CONVIDADOS/],
  ["«Proposta»", /PROPOSTA(?!L)/],
  ["«Serviço(s)»", /SERVICO|SERVIÇO/],
  ["«Preço»", /PRECO|PREÇO/],
  // As duas âncoras escritas à vista: `/^NOTA:|NOTASIMPORTANTES/` lê-se como se
  // o `^` valesse para os dois lados, e não vale — o `|` separa a expressão toda,
  // portanto o segundo lado casava a meio de qualquer linha. Aqui as duas marcas
  // são PRINCÍPIOS de linha (um rótulo e um cabeçalho), e é isso que fica escrito.
  ["«Nota:»/«Notas»", /^(?:NOTA:|NOTASIMPORTANTES)/],
  ["«Hora»", /^HORA:/],
  ["«Local»", /^LOCAL:/],
  ["«Data do Evento»", /DATADOEVENTO/],
  ["«Cliente»/«Noivos»", /^CLIENTE:|^NOIVOS:/],
  [
    "mês português por extenso",
    /JANEIRO|FEVEREIRO|MARCO|MARÇO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO/,
  ],
  // «16h00» é a notação portuguesa das horas. Não é um nome, não é prosa dela
  // com caixa inglesa — é a moldura a escrever uma hora à portuguesa.
  ["hora à portuguesa (16h00)", /\d{1,2}H\d{2}\b/],
  // Um marcador de modelo por substituir — «[Valor Total]», «[Valor]», «[Nome]».
  // A mesma regra da Conferência (`orcamento/conferencia.ts`).
  ["marcador de modelo por substituir", /\[[^\]]+\]/],
];

/** Cada linha do PDF inglês com o que a moldura dela tem de português. */
function portuguesQueSobra(en: Impresso, doc: ProposalDoc): string[] {
  const permitido = [...prosaDela(doc), ...nomesProprios(doc)];
  const achados: string[] = [];
  for (const l of en.linhas) {
    const resto = molduraDe(l.texto, permitido);
    if (ACENTOS.test(resto)) {
      achados.push(`p${l.pagina}: acento no que sobrou da moldura — «${l.texto}»`);
      continue;
    }
    for (const [nome, marca] of MARCAS_PT) {
      if (marca.test(resto)) {
        achados.push(`p${l.pagina}: ${nome} — «${l.texto}»`);
        break;
      }
    }
  }
  return achados;
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. A LEITURA LÊ — antes de a usar como prova
   ═══════════════════════════════════════════════════════════════════════════ */

describe("o que se lê do PDF é mesmo o que lá está", () => {
  it(
    "o PDF português devolve, lido de volta, o que se escreveu no documento",
    { timeout: RELOGIO },
    async () => {
      // Sem isto, tudo o que vem a seguir podia estar a medir um extractor
      // avariado: um leitor que devolvesse metade do texto dava um PDF inglês
      // «sem português nenhum» pela pior das razões.
      const doc = await propostaDeCasamento();
      const pt = await impresso(doc, "pt");
      for (const escrito of [
        "1. Apresentação",
        "2. Serviços",
        "3. Orçamento Proposto",
        "4. Condições Gerais",
        "Decoração Floral de Casamento", // prosa dela
        "Quinta do Hespanhol, Évora", // nome próprio
        "Hora: 16h00",
        "Total a pagar",
        "INSPIRAÇÃO", // capitular, desenhada letra a letra
        "OBRIGADA",
      ]) {
        expect(pt.todo, `«${escrito}» não foi lido do PDF português`).toContain(compacto(escrito));
      }
      // E lê-se o documento INTEIRO, não a primeira página.
      expect(pt.paginas).toBeGreaterThanOrEqual(9);
      expect(pt.linhas.length).toBeGreaterThan(60);
    },
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. NÃO SOBRA PORTUGUÊS
   ═══════════════════════════════════════════════════════════════════════════ */

describe("o PDF inglês não traz português da moldura", () => {
  it(
    "a moldura inteira, tirando o que é dela e os nomes próprios, está em inglês",
    { timeout: RELOGIO },
    async () => {
      const doc = await propostaDeCasamento();
      const en = await impresso(doc, "en");
      const sobras = portuguesQueSobra(en, doc);
      expect(sobras, `português no PDF inglês:\n${sobras.join("\n")}`).toEqual([]);
    },
  );

  it(
    "os nomes próprios e a prosa dela CONTINUAM em português — e não fazem o teste falhar",
    { timeout: RELOGIO },
    async () => {
      // A outra metade da regra: um varrimento que acusasse «Quinta do
      // Hespanhol» seria um varrimento que ninguém podia usar.
      //
      // Sem hora: a hora à portuguesa é um defeito CONFIRMADO e tem o seu
      // próprio teste aqui em cima. Deixá-la neste documento fazia este falhar
      // pela razão do outro, e o que aqui se prova é o contrário — que os nomes
      // próprios passam.
      const doc = await propostaDeCasamento({
        time: "",
        // Sem versão inglesa: a legenda tem de sair em português, e passar.
        moodBoards: (await propostaDeCasamento()).moodBoards.map((b, i) =>
          i === 0 ? { ...b, annotationEn: "" } : b,
        ),
      });
      const en = await impresso(doc, "en");
      for (const nome of [
        "Quinta do Hespanhol, Évora",
        "Tara & Marty",
        "Líquen Events",
        "Hortênsias verdes, cravo verde e lisianthus branco.",
      ]) {
        expect(en.todo, `«${nome}» devia continuar impresso`).toContain(compacto(nome));
      }
      // E mesmo assim o varrimento não acusa nada.
      expect(portuguesQueSobra(en, doc)).toEqual([]);
    },
  );

  it(
    "o dicionário inteiro: onde o português diz a sua frase, o inglês diz a dele",
    { timeout: RELOGIO },
    async () => {
      /**
       * O varrimento data-driven: percorre `TextosDoDocumento` chave a chave e,
       * para cada frase que o PDF PORTUGUÊS imprime, exige a inglesa no PDF
       * inglês e a portuguesa fora dele.
       *
       * Sai do dicionário e não de uma lista escrita aqui: uma entrada nova
       * passa a ser varrida sem ninguém se lembrar deste ficheiro.
       *
       * (O varrimento gémeo de `proposal-doc-textos.test.ts` faz a mesma
       * pergunta às INSTRUÇÕES de desenho. Este faz-la ao FICHEIRO — é a
       * travessia da fonte embutida e do saneamento que se acrescenta.)
       */
      const doc = await propostaDeCasamento();
      const pt = await impresso(doc, "pt");
      const en = await impresso(doc, "en");
      const dicPt = textosDaProposta("pt") as unknown as Record<string, unknown>;
      const dicEn = textosDaProposta("en") as unknown as Record<string, unknown>;

      const falhas: string[] = [];
      let exercidas = 0;
      for (const chave of Object.keys(dicPt)) {
        const fPt = dicPt[chave];
        const fEn = dicEn[chave];
        // As funções (`iva`, `sinal`, `nota`…) têm o seu próprio caso mais
        // abaixo: aqui só as frases fixas. `null` é a palavra que vive noutro
        // módulo (ver `sobretituloInspiracao`).
        if (typeof fPt !== "string" || typeof fEn !== "string") continue;
        // A mesma palavra nas duas línguas («Item», «extra», «Email») não tem
        // nada a provar — e exigir a sua ausência era exigir o impossível.
        if (compacto(fPt) === compacto(fEn)) continue;
        if (!pt.todo.includes(compacto(fPt))) continue; // não sai neste documento
        exercidas++;
        if (!en.todo.includes(compacto(fEn))) falhas.push(`falta em inglês: «${fEn}» (${chave})`);
        if (en.todo.includes(compacto(fPt))) falhas.push(`sobra em português: «${fPt}» (${chave})`);
      }
      expect(falhas, falhas.join("\n")).toEqual([]);
      // Um varrimento que não varre nada passa sempre.
      expect(exercidas).toBeGreaterThanOrEqual(20);
    },
  );

  it(
    "as frases com número dentro — IVA, sinal, saldo, validade — também trocam de língua",
    { timeout: RELOGIO },
    async () => {
      const doc = await propostaDeCasamento();
      const en = await impresso(doc, "en");
      const t = textosDaProposta("en");
      const p = textosDaProposta("pt");
      for (const [emIngles, emPortugues] of [
        [t.iva("23%"), p.iva("23%")],
        [t.sinal(30), p.sinal(30)],
        [t.saldo(70), p.saldo(70)],
        [t.passoValidade(t.data(DIA_DE_VALIDADE)), p.passoValidade(p.data(DIA_DE_VALIDADE))],
        [t.nota(doc.budgetNoteEn ?? ""), p.nota(doc.budgetNote ?? "")],
      ] as [string, string][]) {
        expect(en.todo, `falta «${emIngles}»`).toContain(compacto(emIngles));
        expect(en.todo, `sobra «${emPortugues}»`).not.toContain(compacto(emPortugues));
      }
    },
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   2b. OS MARCADORES POR SUBSTITUIR E OS RÓTULOS SOZINHOS
   ═══════════════════════════════════════════════════════════════════════════ */

describe("o que o desenho deixa passar para a folha do cliente", () => {
  it(
    "um marcador de modelo por substituir não chega ao PDF inglês",
    { timeout: RELOGIO },
    async () => {
      /**
       * «[Valor Total]» é o que o estúdio semeia no campo do total enquanto a
       * proposta não tem preço, e é a frase que a Conferência procura antes de
       * ela enviar (`orcamento/conferencia.ts`: «diz ao cliente, com todas as
       * letras, que recebeu um modelo por preencher»).
       *
       * O aviso da Conferência é a montante e é dispensável — quem gerar o PDF
       * sem passar por ela leva o marcador para o papel. Entre a Conferência e a
       * folha não há mais nada, e num documento INGLÊS o marcador chega em
       * português por cima.
       */
      const doc = await propostaDeCasamento({
        totalText: "[Valor Total]",
        totalAmount: undefined,
        totalVatMode: undefined,
        budgetAmounts: undefined,
        budgetExtras: [],
        time: "",
      });
      const en = await impresso(doc, "en");
      const marcadores = en.linhas.filter((l) => /\[[^\]]+\]/.test(l.texto));
      expect(
        marcadores.map((l) => `p${l.pagina}: ${l.texto}`),
        "marcadores de modelo impressos no PDF inglês",
      ).toEqual([]);
    },
  );

  it(
    "nenhum rótulo é desenhado sozinho, e nenhuma linha começa por dois pontos",
    { timeout: RELOGIO },
    async () => {
      /**
       * «Time:» seguido de nada é um erro impresso numa folha que vai para o
       * cliente — e a faixa de apresentação já se defende (filtra os campos
       * vazios com `trim`). O resto do documento não:
       *
       *  · a nota do orçamento é desenhada com `if (doc.budgetNote)`, e uma
       *    caixa com um espaço lá dentro é «verdadeira» — sai «Note:» sozinho;
       *  · uma linha de serviço com descrição e sem rótulo desenha o separador
       *    e a descrição — sai «: Floral arch.», a começar por dois pontos.
       *
       * Nenhum dos dois é do inglês: acontecem nas duas línguas. Entram aqui
       * porque saem no PDF inglês na mesma, e porque é isto que ela pediu para
       * procurar.
       */
      const base = await propostaDeCasamento({ time: "" });
      const doc = withProposalDefaults({
        ...base,
        budgetNote: "   ",
        budgetNoteEn: "   ",
        serviceGroups: [
          {
            ...base.serviceGroups[0],
            items: [
              { label: "", labelEn: "", desc: "Arco floral.", descEn: "Floral arch." },
              base.serviceGroups[0].items[1],
            ],
          },
        ],
      } as Parameters<typeof withProposalDefaults>[0]);
      const en = await impresso(doc, "en");
      const t = textosDaProposta("en");
      // Os rótulos que o documento sabe escrever, cada um seguido dos seus dois
      // pontos. Comparar contra ESTA lista e não contra «qualquer linha acabada
      // em dois pontos» é o que impede o teste de acusar os cabeçalhos que
      // legitimamente acabam assim («INCLUDED IN THE PROPOSAL:»).
      const rotulosSos = [...Object.values(t.campos).map((r) => `${r}:`), t.nota("").trim()];
      const sozinhos = en.linhas.filter((l) => {
        const texto = l.texto.trim();
        return texto.startsWith(":") || rotulosSos.includes(texto);
      });
      expect(
        sozinhos.map((l) => `p${l.pagina}: «${l.texto.trim()}»`),
        "rótulos desenhados sem nada à frente",
      ).toEqual([]);
    },
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. NÃO FALTA NADA
   ═══════════════════════════════════════════════════════════════════════════ */

/** As páginas de inspiração — as que trazem o sobretítulo dos mood boards. */
function paginasDeInspiracao(r: Impresso, idioma: IdiomaDaProposta): number[] {
  const marca = compacto(idioma === "en" ? "Inspiration" : "Inspiração");
  const paginas = new Set<number>();
  for (const l of r.linhas) if (compacto(l.texto).includes(marca)) paginas.add(l.pagina);
  return [...paginas].sort((a, b) => a - b);
}

describe("o PDF inglês não tem menos do que o português", () => {
  it("mesmo número de páginas e mesmas páginas de inspiração", { timeout: RELOGIO }, async () => {
    const doc = await propostaDeCasamento();
    const pt = await impresso(doc, "pt");
    const en = await impresso(doc, "en");
    expect(en.paginas).toBe(pt.paginas);
    // Três mood boards escritos, três páginas de inspiração, nas duas línguas.
    expect(paginasDeInspiracao(pt, "pt")).toHaveLength(doc.moodBoards.length);
    expect(paginasDeInspiracao(en, "en")).toEqual(paginasDeInspiracao(pt, "pt"));
  });

  it("cada mood board leva o título, o subtítulo E a anotação", { timeout: RELOGIO }, async () => {
    // O mood board é a página que mais facilmente sai coxa: são três textos
    // com três caixas inglesas diferentes, e perder o subtítulo não se nota a
    // não ser que se compare com o português.
    const doc = await propostaDeCasamento();
    const en = await impresso(doc, "en");
    for (const b of doc.moodBoards) {
      for (const texto of [b.titleEn, b.subtituloEn, b.annotationEn]) {
        expect(en.todo, `falta «${texto}» no PDF inglês`).toContain(compacto(texto ?? ""));
      }
    }
  });

  it(
    "a faixa de apresentação tem os mesmos campos, e nenhum rótulo fica sozinho",
    { timeout: RELOGIO },
    async () => {
      /**
       * Um «Time:» seguido de nada é um erro impresso numa folha que vai para o
       * cliente — e é a maneira exacta como um campo sem versão inglesa se
       * denunciaria, se a queda para o português não existisse.
       */
      const doc = await propostaDeCasamento();
      const pt = await impresso(doc, "pt");
      const en = await impresso(doc, "en");
      const rotulos = (r: Impresso, idioma: IdiomaDaProposta) => {
        const t = textosDaProposta(idioma);
        const saida: { chave: string; valor: string }[] = [];
        for (const [chave, rotulo] of Object.entries(t.campos)) {
          const linha = r.linhas.find((l) => l.texto.trim().startsWith(`${rotulo}:`));
          if (linha)
            saida.push({
              chave,
              valor: linha.texto
                .trim()
                .slice(rotulo.length + 1)
                .trim(),
            });
        }
        return saida;
      };
      const emPt = rotulos(pt, "pt");
      const emEn = rotulos(en, "en");
      expect(emEn.map((c) => c.chave)).toEqual(emPt.map((c) => c.chave));
      for (const campo of emEn) {
        expect(campo.valor, `o campo «${campo.chave}» saiu com o rótulo sozinho`).not.toBe("");
      }
    },
  );

  it(
    "as rubricas do orçamento, os adicionais e os serviços saem todos",
    { timeout: RELOGIO },
    async () => {
      const doc = await propostaDeCasamento();
      const en = await impresso(doc, "en");
      const esperados = [
        ...(doc.budgetItemsEn ?? []).filter((s): s is string => !!s),
        ...(doc.budgetExtras ?? []).map((e) => e.labelEn ?? e.label),
        ...doc.serviceGroups.flatMap((g) => [
          g.titleEn ?? g.title,
          ...g.items.map((i) => i.labelEn ?? i.label),
          ...g.items.map((i) => i.descEn ?? i.desc ?? ""),
        ]),
      ].filter(Boolean);
      const faltam = esperados.filter((s) => !en.todo.includes(compacto(s)));
      expect(faltam, `não saíram no PDF inglês: ${faltam.join(" | ")}`).toEqual([]);
    },
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   4. A CAIXA VAZIA CAI PARA O PORTUGUÊS — e não deixa buraco
   ═══════════════════════════════════════════════════════════════════════════ */

describe("um campo inglês em falta cai para o português", () => {
  it(
    "meia proposta traduzida sai inteira, metade em cada língua, sem marcas",
    { timeout: RELOGIO },
    async () => {
      const base = await propostaDeCasamento();
      const doc = withProposalDefaults({
        ...base,
        // Três formas de «não traduzido», que é como isto chega na vida real:
        // caixa vazia, caixa com espaços, e caixa que nunca existiu.
        servicoEn: "",
        budgetNoteEn: "   ",
        serviceGroups: [
          {
            ...base.serviceGroups[0],
            titleEn: undefined,
            items: [
              { ...base.serviceGroups[0].items[0], labelEn: "", descEn: undefined },
              base.serviceGroups[0].items[1],
            ],
          },
          base.serviceGroups[1],
        ],
        moodBoards: base.moodBoards.map((b, i) =>
          i === 0 ? { ...b, subtituloEn: "", annotationEn: undefined } : b,
        ),
        budgetItemsEn: ["Ceremony Decor", null, "Bridal Bouquet", null],
      } as Parameters<typeof withProposalDefaults>[0]);

      const pt = await impresso(base, "pt");
      const en = await impresso(doc, "en");

      // O que ela traduziu sai em inglês…
      for (const ingles of ["Cocktail Decor", "Ceremony Decor", "Couple's Extras", "Long tables"]) {
        expect(en.todo, `falta «${ingles}»`).toContain(compacto(ingles));
      }
      // …e o que não traduziu sai em português, inteiro, no mesmo sítio.
      for (const portugues of [
        "Decor e decoração floral",
        "Decoração Floral de Casamento",
        "Decor Cerimónia",
        "Arco floral e passadeira com pétalas naturais.",
        "Arco e passadeira",
        "Hortênsias verdes, cravo verde e lisianthus branco.",
        "Botoeira",
        "Os valores são estimativas e podem ser ajustados até à confirmação.",
      ]) {
        expect(en.todo, `o buraco de «${portugues}»`).toContain(compacto(portugues));
      }
      // Sem marca nenhuma de revisão no papel, e sem perder páginas.
      expect(en.todo).not.toContain("[");
      expect(en.todo).not.toContain("???");
      expect(en.paginas).toBe(pt.paginas);
      expect(paginasDeInspiracao(en, "en")).toHaveLength(base.moodBoards.length);
    },
  );

  it(
    "uma tradução escrita sobre um campo português VAZIO não inventa uma linha",
    { timeout: RELOGIO },
    async () => {
      /**
       * O reverso da queda, e é comportamento assente (`docNaLingua`): um campo
       * que o documento português não tem não ganha texto por alguém ter escrito
       * a caixa inglesa. A pré-visualização portuguesa e o PDF inglês mostram o
       * mesmo número de linhas — o que se perde é uma frase que nunca existiu em
       * português.
       *
       * Fica pinado porque é uma decisão, não um acaso: quem escrever um
       * subtítulo só em inglês tem de saber que ele não sai.
       */
      const base = await propostaDeCasamento();
      // Uma frase que não existe em mais lado nenhum do documento: procurada no
      // texto compacto, «Arch and aisle» aparecia dentro da descrição do serviço
      // («Floral arch and aisle with natural petals») e o teste passava por
      // engano.
      const soEmIngles = "Pedestals and hanging greenery";
      const doc = withProposalDefaults({
        ...base,
        moodBoards: base.moodBoards.map((b, i) =>
          i === 0 ? { ...b, subtitulo: "", subtituloEn: soEmIngles } : b,
        ),
      } as Parameters<typeof withProposalDefaults>[0]);
      const en = await impresso(doc, "en");
      expect(en.todo).not.toContain(compacto(soEmIngles));
    },
  );

  it(
    "uma anotação inglesa mais comprida do que a portuguesa é cortada — e o corte é DITO",
    { timeout: RELOGIO },
    async () => {
      /**
       * A legenda de um mood board tem lugar para cinco linhas. Uma tradução
       * inglesa mais longa do que o original passa desse tecto onde a
       * portuguesa não passava: o casal inglês fica com menos texto do que o
       * português, e o corte é MUDO no papel (não há reticências — o texto
       * simplesmente acaba).
       *
       * O que o torna aceitável é o aviso: o relatório diz que cortou, e diz-o
       * com o nome PORTUGUÊS do board, que é como ela o encontra no estúdio.
       * Sem este teste, uma proposta inglesa podia sair mais curta em silêncio.
       */
      const base = await propostaDeCasamento();
      const doc = withProposalDefaults({
        ...base,
        moodBoards: [
          {
            ...base.moodBoards[0],
            annotation: "Hortênsias verdes.",
            annotationEn: `Green hydrangeas everywhere. ${"Many more words to fill five lines and go well past them. ".repeat(
              20,
            )}`,
          },
        ],
      } as Parameters<typeof withProposalDefaults>[0]);
      const { truncations } = await renderProposalDocPdfWithReport(doc, "en");
      const corte = truncations.find((t) => t.where.includes("Decoração Cerimónia"));
      expect(corte, `nada foi dito sobre o corte: ${JSON.stringify(truncations)}`).toBeDefined();
      expect(corte?.unit).toBe("linhas");
      expect(corte?.dropped).toBeGreaterThan(0);
      // E o aviso é lido no estúdio, que é português — nunca «Ceremony Decoration».
      expect(truncations.map((t) => t.where).join(" | ")).not.toContain("Ceremony Decoration");
    },
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   4b. O QUE SAI EM PORTUGUÊS MESMO EM INGLÊS — E SEM AVISO NENHUM
   ═══════════════════════════════════════════════════════════════════════════ */

describe("o modelo Organização não tem segunda versão para o cronograma", () => {
  it(
    "o cronograma sai em português no PDF inglês, e o estúdio não o conta como por traduzir",
    { timeout: RELOGIO },
    async () => {
      /**
       * A lacuna está escrita em `proposal-doc-bilingue.ts` («uma proposta de
       * Organização em inglês sai com o cronograma em português, e sem aviso»).
       * Aqui fica MEDIDA no papel, que é outra coisa: o texto sai, a página
       * existe, e o contador que ela lê antes de gerar diz que não falta nada.
       *
       * É o pior par possível — conteúdo por traduzir MAIS um aviso que garante
       * que ele não é visto. Não se corrige aqui (o tipo e o inventário são de
       * outros ficheiros); fica pinado para deixar de ser uma surpresa, e para
       * o dia em que alguém lhes der caixa este teste ser o primeiro a saber.
       */
      const [a] = await fotos();
      const doc = withProposalDefaults({
        template: "organizacao",
        ref: "Organização Casamento Tara & Marty · 12 de setembro de 2026",
        clientNames: "Tara & Marty",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Quinta do Hespanhol, Évora",
        guests: "100 a 150",
        servico: "Planeamento integral",
        servicoEn: "Full planning",
        coverImages: [a, a],
        cronograma: [
          { title: "6-12 meses antes do casamento", items: ["Escolha do espaço e visita."] },
        ],
        serviceGroups: [
          {
            title: "Coordenação",
            titleEn: "Coordination",
            items: [{ label: "Reunião inicial", labelEn: "Kick-off meeting" }],
          },
        ],
        moodBoards: [],
        budgetItems: [],
        budgetRows: [{ item: "Coordenação no dia", price: "1.500,00 €" }],
        totalLabel: "",
        totalText: "",
        totalEstimatedText: "12.500,00 €",
        validUntil: DIA_DE_VALIDADE,
      } as Parameters<typeof withProposalDefaults>[0]);

      const en = await impresso(doc, "en");
      // A moldura da página está em inglês…
      expect(en.todo).toContain(compacto(textosDaProposta("en").tituloCronograma));
      // …e o que lá está dentro está em português, escrito por ela e sem caixa
      // onde escrever a versão inglesa.
      expect(en.todo).toContain(compacto("6-12 meses antes do casamento"));
      expect(en.todo).toContain(compacto("Escolha do espaço e visita."));
      // A linha do quadro de valores estimados, pela mesma razão.
      expect(en.todo).toContain(compacto("Coordenação no dia"));
      // E o aviso do estúdio não sabe nada disto: nenhum destes textos aparece
      // na lista dos campos por traduzir.
      const porTraduzir = camposPorTraduzir(doc).map((c) => c.texto);
      expect(porTraduzir).not.toContain("6-12 meses antes do casamento");
      expect(porTraduzir).not.toContain("Coordenação no dia");
    },
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   5. A ORDEM, MEDIDA NO FICHEIRO E NAS DUAS LÍNGUAS
   ═══════════════════════════════════════════════════════════════════════════ */

describe("a ordem impressa é a mesma nas duas línguas", () => {
  it(
    "as rubricas e os mood boards saem pela mesma ordem no PDF português e no inglês",
    { timeout: RELOGIO },
    async () => {
      /**
       * A ordem já está fixada em dois sítios: `proposal-doc-pdf.ordem.test.ts`
       * lê o PDF PORTUGUÊS de volta com o motor do estúdio, e
       * `proposal-doc-pdf.bilingue.test.ts` compara as duas línguas pelas
       * INSTRUÇÕES de desenho. O que não estava coberto — e é o que este teste
       * acrescenta — é a ordem lida do FICHEIRO inglês: o motor do estúdio
       * reconhece os cabeçalhos portugueses e não sabe ler um PDF inglês, por
       * isso a ordem inglesa nunca tinha sido medida no papel.
       *
       * O documento tem o defeito da Tara e do Marty de propósito: as rubricas
       * do orçamento escritas por uma ordem diferente da dos Serviços.
       */
      const doc = await propostaDeCasamento({
        budgetItems: ["Botoeira", "Decor Cocktail", "Ramo de Noiva", "Decor Cerimónia"],
        budgetItemsEn: ["Buttonhole", "Cocktail Decor", "Bridal Bouquet", "Ceremony Decor"],
        budgetAmounts: [40, 460, 180, 820],
        budgetOpcional: [true, false, false, false],
      });
      const pt = await impresso(doc, "pt");
      const en = await impresso(doc, "en");

      /** Por que ordem é que estes rótulos aparecem no ficheiro. */
      const ordem = (r: Impresso, rotulos: string[]) => {
        const lugares = rotulos.map((rot) => ({
          rot,
          i: r.linhas.findIndex((l) => compacto(l.texto).startsWith(compacto(rot))),
        }));
        expect(
          lugares.every((l) => l.i >= 0),
          `não se encontraram todos: ${JSON.stringify(lugares)}`,
        ).toBe(true);
        return lugares.sort((a, b) => a.i - b.i).map((l) => l.rot);
      };

      // As rubricas, pelo índice do documento — o mesmo índice nas duas línguas
      // (`docNaLingua` nunca acrescenta, remove nem reordena).
      const indicePt = ordem(pt, doc.budgetItems).map((r) => doc.budgetItems.indexOf(r));
      const emIngles = (doc.budgetItemsEn ?? []).map((s) => s ?? "");
      const indiceEn = ordem(en, emIngles).map((r) => emIngles.indexOf(r));
      expect(indiceEn).toEqual(indicePt);
      // E é a ordem dos SERVIÇOS, não a ordem escrita no quadro.
      expect(indicePt).toEqual([3, 1, 2, 0]);

      // Os mood boards, pela página em que cada um sai.
      const paginaDoBoard = (r: Impresso, titulos: string[]) =>
        titulos.map((t) => r.linhas.find((l) => compacto(l.texto) === compacto(t))?.pagina ?? -1);
      expect(
        paginaDoBoard(
          en,
          doc.moodBoards.map((b) => b.titleEn ?? b.title),
        ),
      ).toEqual(
        paginaDoBoard(
          pt,
          doc.moodBoards.map((b) => b.title),
        ),
      );
    },
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   6. O PERCURSO QUE ELA PERCORRE
   ═══════════════════════════════════════════════════════════════════════════ */

describe("o caminho do botão «Gerar» com idioma inglês", () => {
  it(
    "o documento do estúdio, resolvido e desenhado em inglês, sai inteiro e sem português da moldura",
    { timeout: RELOGIO },
    async () => {
      /**
       * Este é o percurso a sério: `renderStoredProposalDocPdfWithReport(doc,
       * "en")` — o que a rota `POST /api/orcamento/[id]/proposta-doc` chama
       * depois de validar o `idioma` que vem do estúdio. Preenche os textos da
       * casa (`withProposalDefaults`), resolve as fotos contra o armazenamento e
       * só então desenha.
       *
       * O documento que entra é o que o estúdio GRAVA: as fotos são REFERÊNCIAS
       * («propostas/2026/capa.jpg») e não bytes, que é a diferença entre este
       * caminho e o do gerador.
       */
      const [a] = await fotos();
      armazem.bytes = Buffer.from(a, "base64");
      // Sem hora, pela mesma razão do teste dos nomes próprios: a hora à
      // portuguesa é um defeito já apanhado, e este teste é sobre o PERCURSO.
      const base = await propostaDeCasamento({ time: "" });
      const guardado = withProposalDefaults({
        ...base,
        coverImages: ["propostas/2026/capa-esq.jpg", "propostas/2026/capa-dir.jpg"],
        moodBoards: base.moodBoards.map((b, i) => ({
          ...b,
          images: [`propostas/2026/board-${i}-1.jpg`, `propostas/2026/board-${i}-2.jpg`],
        })),
      } as Parameters<typeof withProposalDefaults>[0]);

      const { pdf, missingImages } = await renderStoredProposalDocPdfWithReport(guardado, "en");
      expect(missingImages).toBe(0);
      const en = await lerBytes(new Uint8Array(pdf));

      // A moldura toda em inglês, pelas mesmas regras do resto do ficheiro.
      const sobras = portuguesQueSobra(en, guardado);
      expect(sobras, `português no PDF inglês do percurso real:\n${sobras.join("\n")}`).toEqual([]);
      // E com tudo lá dentro: as quatro secções, os três mood boards, o total.
      const t = textosDaProposta("en");
      for (const marca of [
        t.tituloApresentacao,
        t.tituloServicos,
        t.tituloOrcamento,
        t.tituloCondicoes,
        t.totalAPagar,
        t.proximosPassos,
        t.faseamentoDoPagamento,
        t.cancelamento,
        t.obrigada,
      ]) {
        expect(en.todo, `falta «${marca}»`).toContain(compacto(marca));
      }
      expect(paginasDeInspiracao(en, "en")).toHaveLength(base.moodBoards.length);
    },
  );
});
