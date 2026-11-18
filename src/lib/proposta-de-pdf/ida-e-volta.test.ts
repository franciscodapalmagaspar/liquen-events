import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  depositPercentOf,
  resolveProposalMoney,
  resolveValidUntil,
  withProposalDefaults,
  type ProposalDoc,
} from "@/lib/proposal-doc";
import { totaisDaProposta } from "@/lib/proposal-budget";
import { lerPropostaDePdf } from "./index";
import { documentoDeCampos } from "./tipos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * IDA E VOLTA — a única medida honesta que isto pode ter
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Não temos as propostas antigas dela em ficheiro, e um motor de leitura sem
 * uma medida é uma opinião. Mas temos uma coisa melhor do que uma amostra:
 * temos a VERDADE DE GRAÇA. O back office GERA propostas em PDF. Pega-se num
 * documento conhecido, imprime-se, lê-se o PDF de volta, e compara-se com o
 * documento de partida. A percentagem de campos recuperados deixa de ser uma
 * impressão e passa a ser um número — e o número fica aqui, a falhar no dia em
 * que alguém lhe mexer.
 *
 * ── O QUE ISTO MEDE E O QUE NÃO MEDE ──────────────────────────────────────
 *
 * Mede o motor contra os NOSSOS PDF, que é o caso fácil: sabemos a composição
 * porque a escrevemos. Não mede o que acontece a um PDF exportado do Word em
 * 2021 — isso está em `de-fora.test.ts`, e o resultado lá é outro, de
 * propósito.
 *
 * ── DOCUMENTOS DIFERENTES, PORQUE UM SÓ NÃO CHEGA ─────────────────────────
 *
 * Com mood boards e sem eles; com valores adicionais e sem eles; um total
 * «+ IVA» e outro com o IVA já incluído; nomes com acentos e um `&`. Cada um
 * destes exercita uma parte diferente da composição — o total muda de rótulo
 * quando há adicionais, as páginas de inspiração mudam a paginação de tudo o
 * que vem a seguir.
 */

/**
 * ── OS PDF FICARAM GUARDADOS, PORQUE O GERADOR JÁ NÃO EXISTE ─────────────
 *
 * O motor lê o formato ANTIGO — o das propostas que ela já mandou, impressas
 * pelo gerador que veio antes do editorial (`proposal-doc-pdf.ts`). Esse
 * gerador foi apagado a 18/11; antes disso imprimiu cada documento deste
 * ficheiro uma última vez, e são esses bytes que estão em `amostras/`. Os
 * documentos continuam aqui como a VERDADE contra que se compara o que o motor
 * lê. A validade foi impressa a {@link DIA_DA_GRAVACAO}, e é contra esse dia
 * que se calcula a esperada.
 */
const AMOSTRAS = path.join(__dirname, "amostras");
const DIA_DA_GRAVACAO = new Date("2026-11-18T12:00:00Z");

async function foto(w: number, h: number, cor: { r: number; g: number; b: number }) {
  const b = await sharp({ create: { width: w, height: h, channels: 3, background: cor } })
    .jpeg({ quality: 90 })
    .toBuffer();
  return b.toString("base64");
}

/** A proposta cheia: o caso da «PO Casamento Decoração», com tudo. */
async function docCompleto(): Promise<ProposalDoc> {
  const a = await foto(900, 600, { r: 190, g: 130, b: 95 });
  const b = await foto(600, 900, { r: 60, g: 90, b: 70 });
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Casamento Decoração Mariana e João · 5.06.2027",
    clientNames: "Mariana & João",
    eventType: "Casamento",
    eventDate: "5 de junho de 2027",
    location: "Herdade da Cortesia, Reguengos de Monsaraz",
    guests: "150 pax",
    ceremony: "Civil, simbólica",
    time: "16h30",
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral de Casamento",
        items: [
          {
            label: "Decoração Cerimónia",
            desc: "Arco floral em tons de terracota, passadeira e composições nos bancos laterais.",
          },
          { label: "Decoração Copo d'Água" },
          { label: "Decoração Sala de Jantar", desc: "Centros de mesa baixos e velas." },
        ],
      },
      {
        letter: "b)",
        title: "Complementos dos Noivos",
        items: [{ label: "Ramo de Noiva" }, { label: "Boutonnière" }],
      },
    ],
    moodBoards: [
      {
        title: "Cerimónia",
        subtitulo: "Ramo de Noiva (a definir com a Noiva)",
        images: [a, b],
        annotation: "Tons de terracota e verde-oliva, com eucalipto.",
      },
    ],
    budgetItems: ["Decor Cerimónia", "Decor Copo d'Água", "Decor Sala de Jantar"],
    budgetOpcional: [false, false, true],
    totalLabel: "Valor Total Decoração",
    totalText: "7.890,00 € + IVA",
    totalAmount: 7890,
    totalVatMode: "acrescer",
    budgetExtras: [
      { label: "Deslocação da equipa Líquen", valueText: "250,00 €" },
      { label: "Serviço de coordenação", valueText: "950,50 € + IVA" },
    ],
    depositPercent: 40,
    /**
     * A SOMA LIGADA — porque é ela que este documento existe para medir.
     *
     * O «Total a pagar» passou a estar DESLIGADO por omissão (a folha feita à
     * mão não o tem). Numa proposta com valores
     * adicionais e sem ele, o `totalText` que o estúdio escreveu não chega a ser
     * impresso em lado nenhum: o documento mostra as parcelas e não o todo. Não
     * há motor de leitura que devolva um número que a folha não tem, e a
     * percentagem cairia sem que nada estivesse partido.
     *
     * A proposta cheia é a que exercita o quadro TODO, e por isso liga-a. A que
     * corre com a omissão é a magra, aqui ao lado.
     */
    coverImages: [a, b],
  });
}

/** A proposta magra: sem mood boards, sem adicionais, IVA já incluído. */
async function docMagro(): Promise<ProposalDoc> {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Casamento Decoração Sofía & Ângelo · 12.09.2026",
    clientNames: "Sofía & Ângelo",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Quinta da Bela Vista",
    guests: "80 pax",
    serviceGroups: [{ title: "Decoração de Cerimónia", items: [{ label: "Arco de flores" }] }],
    moodBoards: [],
    budgetItems: ["Decoração de Cerimónia"],
    totalLabel: "Valor Total",
    totalText: "3.000,00 €",
    totalAmount: 3000,
    totalVatMode: "incluido",
    coverImages: ["", ""],
  });
}

/** Uma proposta com acentos por todo o lado e um mood board sem descrição. */
async function docAcentuado(): Promise<ProposalDoc> {
  const a = await foto(1200, 800, { r: 120, g: 140, b: 110 });
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração — Conceição & João Grão · 3.05.2028",
    clientNames: "Conceição & João Grão",
    eventType: "Casamento",
    eventDate: "3 de maio de 2028",
    location: "São Brás de Alportel",
    guests: "220 pax",
    ceremony: "Católica",
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral · Cerimónia e Espaço",
        items: [{ label: "Composições à entrada", desc: "Vasos altos com hortênsias." }],
      },
    ],
    moodBoards: [{ title: "Inspiração da Cerimónia", images: [a] }],
    budgetItems: ["Decoração à entrada", "Decoração do altar"],
    totalLabel: "Valor Total Decoração",
    totalText: "12.450,00 € + IVA",
    totalAmount: 12450,
    totalVatMode: "acrescer",
    coverImages: [a, ""],
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   A COMPARAÇÃO
   ═══════════════════════════════════════════════════════════════════════════ */

/** O que se compara em cada documento: o caminho no `ProposalDoc`, o que lá
 *  estava, e o que voltou. */
interface Confronto {
  campo: string;
  esperado: unknown;
  obtido: unknown;
  acertou: boolean;
}

function iguais(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") {
    // O gerador junta as palavras com um espaço só ao quebrar as linhas; a
    // volta faz o mesmo. Comparar com os espaços normalizados mede a LEITURA e
    // não a pontuação da composição.
    return a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Um relatório campo a campo, com a percentagem no fim. */
function confrontar(
  original: ProposalDoc,
  lido: Partial<ProposalDoc>,
  campos: readonly string[],
): { linhas: Confronto[]; acerto: number } {
  const valorDe = (o: unknown, caminho: string): unknown => {
    let v: unknown = o;
    for (const passo of caminho.split(".")) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[\d+\])*)$/.exec(passo);
      if (!m || v == null) return undefined;
      v = (v as Record<string, unknown>)[m[1]];
      for (const idx of m[2].matchAll(/\[(\d+)\]/g)) {
        if (v == null) return undefined;
        v = (v as unknown[])[Number(idx[1])];
      }
    }
    return v;
  };
  const linhas = campos.map((campo) => {
    const esperado = valorDe(original, campo);
    const obtido = valorDe(lido, campo);
    return { campo, esperado, obtido, acertou: iguais(esperado, obtido) };
  });
  const acerto = linhas.filter((l) => l.acertou).length / linhas.length;
  return { linhas, acerto };
}

/** A tabela, para ficar impressa no registo do teste — é o que se lê quando o
 *  número desce e é preciso perceber qual foi o campo que se partiu. */
function tabela(nome: string, r: { linhas: Confronto[]; acerto: number }): string {
  const linhas = r.linhas.map(
    (l) =>
      `  ${l.acertou ? "✔" : "✘"} ${l.campo.padEnd(38)} ${
        l.acertou ? "" : `esperado=${JSON.stringify(l.esperado)} obtido=${JSON.stringify(l.obtido)}`
      }`,
  );
  return [
    `\n── ${nome} — ${(r.acerto * 100).toFixed(0)}% (${r.linhas.filter((x) => x.acertou).length}/${r.linhas.length})`,
    ...linhas,
  ].join("\n");
}

async function idaEVolta(nome: string) {
  const bytes = new Uint8Array(await readFile(path.join(AMOSTRAS, `${nome}.pdf`)));
  const r = await lerPropostaDePdf(bytes);
  if (!r.ok) throw new Error(`o motor recusou o nosso próprio PDF: ${r.porque}`);
  return { rascunho: r.rascunho, lido: documentoDeCampos(r.rascunho.campos) };
}

/** Os campos que o texto fixo da casa traz sempre — comparados um a um, porque
 *  são a maior parte do documento e são também onde a composição em duas
 *  colunas e as listas com marcas podem partir. */
function camposFixos(doc: ProposalDoc): string[] {
  return [
    ...doc.notasImportantes.map((_, i) => `notasImportantes[${i}]`),
    ...doc.incluido.map((_, i) => `incluido[${i}]`),
    ...doc.naoIncluido.map((_, i) => `naoIncluido[${i}]`),
    ...doc.condicoesGerais.map((_, i) => `condicoesGerais[${i}]`),
    ...doc.observacoesGerais.map((_, i) => `observacoesGerais[${i}]`),
    ...doc.faseamento.map((_, i) => `faseamento[${i}]`),
    ...doc.cancelamento.map((_, i) => `cancelamento[${i}]`),
  ];
}

describe("ida e volta: gerar o PDF e voltar a lê-lo", () => {
  it("proposta completa — evento, serviços, mood board, orçamento e adicionais", async () => {
    const doc = await docCompleto();
    const { rascunho, lido } = await idaEVolta("completa");

    const evento = confrontar(doc, lido, [
      "ref",
      "template",
      "clientNames",
      "eventType",
      "eventDate",
      "location",
      "guests",
      "ceremony",
      "time",
      // O «Wedding Planners» saiu do estúdio e do PDF (ver `proposal-doc.ts`),
      // portanto deixou de haver ida e volta para ele: o que não se imprime
      // não se pode voltar a ler.
    ]);
    const servicos = confrontar(doc, lido, [
      "serviceGroups[0].letter",
      "serviceGroups[0].title",
      "serviceGroups[0].items[0].label",
      "serviceGroups[0].items[0].desc",
      "serviceGroups[0].items[1].label",
      "serviceGroups[0].items[2].label",
      "serviceGroups[0].items[2].desc",
      "serviceGroups[1].letter",
      "serviceGroups[1].title",
      "serviceGroups[1].items[0].label",
      "serviceGroups[1].items[1].label",
    ]);
    const moodboard = confrontar(doc, lido, [
      "moodBoards[0].title",
      "moodBoards[0].subtitulo",
      "moodBoards[0].annotation",
    ]);
    const orcamento = confrontar(doc, lido, [
      "budgetItems[0]",
      "budgetItems[1]",
      "budgetItems[2]",
      "budgetOpcional[2]",
      "budgetExtras[0].label",
      "budgetExtras[0].valueText",
      "budgetExtras[1].label",
      /**
       * ── O QUE UMA PROPOSTA COM ADICIONAIS JÁ NÃO IMPRIME ─────────────────
       *
       * Duas ausências, e são as duas de propósito (ver o bloco de totais em
       * `proposal-doc-pdf.ts`):
       *
       *  · `budgetExtras[1].valueText` — a coordenação está escrita «950,50 € +
       *    IVA» no estúdio, e a folha imprime «+ 950,50 €». O bloco inteiro é
       *    em base (sem IVA) e diz o IVA UMA vez, na sua linha; repetir «+ IVA»
       *    em cada parcela de um bloco sem IVA é a ambiguidade que este bloco
       *    veio acabar. O montante que cada adicional acrescenta volta exacto —
       *    é o que se confere logo a seguir.
       *
       *  · `totalText` — o número grande passou a ser o TOTAL A PAGAR
       *    (9.704,70 €), e não o texto do total escrito no estúdio
       *    («7.890,00 € + IVA»). É a mesma razão por que `totalLabel` já não
       *    voltava. O dinheiro volta inteiro pela linha «TOTAL (sem IVA)»:
       *    `totalAmount` e `totalVatMode` continuam a bater certo, aqui em
       *    baixo.
       */
      "totalAmount",
      "totalVatMode",
      "depositPercent",
    ]);
    const fixos = confrontar(doc, lido, camposFixos(doc));

    console.log(
      [
        tabela("evento", evento),
        tabela("serviços", servicos),
        tabela("mood board", moodboard),
        tabela("orçamento", orcamento),
        tabela("texto fixo", fixos),
        `\n  fotografias: ${rascunho.fotos.length} (destinos: ${rascunho.fotos.map((f) => f.destino).join(", ")})`,
        `  por ler: ${rascunho.porLer.map((p) => p.campo).join(", ") || "(nada)"}`,
        `  avisos: ${rascunho.avisos.map((a) => a.tipo).join(", ") || "(nenhum)"}`,
        `  ${rascunho.medidas.paginas} páginas, ${rascunho.medidas.pedacos} pedaços, ${rascunho.medidas.ms} ms`,
      ].join("\n"),
    );

    expect(evento.acerto).toBe(1);
    expect(servicos.acerto).toBe(1);
    expect(moodboard.acerto).toBe(1);
    expect(orcamento.acerto).toBe(1);
    expect(fixos.acerto).toBe(1);

    // ── O DINHEIRO VOLTA AO CÊNTIMO ────────────────────────────────────────
    // O texto do total mudou de forma (ver acima), mas o que ele VALE não pode
    // mudar: a base, o IVA e o total a pagar da proposta lida têm de ser, ao
    // cêntimo, os da proposta que foi impressa. E os valores adicionais têm de
    // continuar a valer o mesmo em BASE — se voltassem a ser lidos com o IVA
    // lá dentro, a repartição entre serviços e adicionais mudava só por o
    // documento ter ido e voltado.
    const antes = totaisDaProposta(doc, depositPercentOf(doc));
    const depois = totaisDaProposta(lido as ProposalDoc, depositPercentOf(lido));
    expect(depois.total).toBe(antes.total);
    expect(depois.iva).toBe(antes.iva);
    expect(depois.aPagar).toBe(antes.aPagar);
    expect(depois.adicionais).toBe(antes.adicionais);
    expect(depois.servicos).toBe(antes.servicos);
    expect(depois.fecha).toBe(true);

    // A validade é impressa como DATA, e é essa que volta.
    expect(lido.validUntil).toBe(resolveValidUntil(doc, DIA_DA_GRAVACAO));
    // A percentagem do sinal está impressa no faseamento do orçamento.
    expect(lido.depositPercent).toBe(depositPercentOf(doc));

    // ── As fotografias ──
    // Duas fotos distintas: uma na capa esquerda + mood board, outra na capa
    // direita + mood board. O logótipo, que aparece em todas as páginas, não
    // conta como fotografia.
    expect(rascunho.fotos.length).toBeGreaterThanOrEqual(2);
    expect(rascunho.fotos.some((f) => f.destino === "coverImages[0]")).toBe(true);
    expect(rascunho.fotos.some((f) => f.destino === "coverImages[1]")).toBe(true);
    expect(rascunho.fotos.every((f) => f.bytes.length > 0)).toBe(true);
  }, 120_000);

  it("proposta magra — sem mood boards, sem adicionais, IVA incluído", async () => {
    const doc = await docMagro();
    const { rascunho, lido } = await idaEVolta("magra");

    const r = confrontar(doc, lido, [
      "ref",
      "template",
      "clientNames",
      "eventType",
      "eventDate",
      "location",
      "guests",
      "serviceGroups[0].title",
      "serviceGroups[0].items[0].label",
      "budgetItems[0]",
      /**
       * ── O QUE UMA PROPOSTA SEM ADICIONAIS TAMBÉM JÁ NÃO IMPRIME ───────────
       *
       * `totalLabel` e `totalText` saíram desta lista, e é a mesma razão que já
       * os tinha tirado da proposta COM adicionais: a folha passou a fechar
       * sempre na escada — TOTAL (sem IVA), IVA, «Total a pagar» —, portanto o
       * número grande é o total COM IVA e o rótulo é «Total a pagar», nosso.
       * Nem o texto que ela compôs nem o rótulo dela chegam ao papel, e
       * devolvê-los a partir do que lá está era inventar.
       *
       * `totalAmount` e `totalVatMode` também: este documento está em «IVA
       * incluído», onde o `totalAmount` guardado é o BRUTO. A folha diz a base
       * em todas as letras, por isso a leitura volta em base + «acrescer» — a
       * mesma quantia noutra forma. O que tem de bater ao cêntimo é o dinheiro,
       * e é o que se confere logo a seguir.
       */
      ...camposFixos(doc),
    ]);
    console.log(tabela("magra", r));

    expect(r.acerto).toBe(1);
    // ── O DINHEIRO VOLTA AO CÊNTIMO, MUDE A FORMA O QUE MUDAR ──────────────
    const antes = resolveProposalMoney(doc);
    const depois = resolveProposalMoney(lido);
    expect(depois.base).toBe(antes.base);
    expect(depois.vat).toBe(antes.vat);
    expect(depois.gross).toBe(antes.gross);
    // E o que não voltou é DITO, com o motivo — não desaparece em silêncio.
    expect(rascunho.porLer.map((p) => p.campo)).toContain("totalText");
    expect(rascunho.porLer.map((p) => p.campo)).toContain("totalLabel");
    // Nenhuma fotografia: as capas estavam vazias e o logótipo não é uma foto.
    expect(rascunho.fotos).toHaveLength(0);
    // Os campos que uma proposta sem estes blocos não pode devolver são DITOS.
    expect(rascunho.porLer.map((p) => p.campo)).toContain("ceremony");
  }, 120_000);

  it("proposta com acentos e cedilhas em todos os campos", async () => {
    const doc = await docAcentuado();
    const { lido } = await idaEVolta("acentuada");

    const r = confrontar(doc, lido, [
      "ref",
      "clientNames",
      "eventDate",
      "location",
      "guests",
      "ceremony",
      "serviceGroups[0].title",
      "serviceGroups[0].items[0].label",
      "serviceGroups[0].items[0].desc",
      "moodBoards[0].title",
      "budgetItems[0]",
      "budgetItems[1]",
      // `totalText` fora, pela razão escrita na proposta magra: o número grande
      // é agora o «Total a pagar», e não o texto composto no estúdio.
      ...camposFixos(doc),
    ]);
    console.log(tabela("acentuada", r));
    expect(r.acerto).toBe(1);
    // O que interessa mesmo: os acentos chegam inteiros dos dois lados.
    expect(lido.clientNames).toBe("Conceição & João Grão");
    expect(lido.location).toBe("São Brás de Alportel");
  }, 120_000);

  it("o rótulo do total NÃO é devolvido quando há adicionais — e é dito porquê", async () => {
    // Com adicionais, o documento imprime «Total a pagar» em vez do rótulo
    // escrito no estúdio. Devolver «Total a pagar» como se fosse o dela era
    // exactamente o género de campo que parece certo e está errado.
    const { rascunho, lido } = await idaEVolta("completa");
    expect(lido.totalLabel).toBeUndefined();
    const dito = rascunho.porLer.find((p) => p.campo === "totalLabel");
    expect(dito?.porque).toMatch(/valores adicionais/i);
  }, 120_000);

  it("cada campo devolvido traz a página e o texto de onde saiu", async () => {
    const { rascunho } = await idaEVolta("completa");
    for (const c of rascunho.campos) {
      expect(c.origem.pagina).toBeGreaterThan(0);
      expect(c.origem.texto.length).toBeGreaterThan(0);
      expect(c.origem.largura).toBeGreaterThan(0);
      expect(c.porque.length).toBeGreaterThan(10);
    }
    // E a origem tem de ser MESMO a origem: o nome do casal está na página da
    // apresentação e o texto de onde saiu contém-no.
    const nome = rascunho.campos.find((c) => c.campo === "clientNames");
    expect(nome?.origem.texto).toContain("Mariana");
  }, 120_000);
  it("uma proposta comprida — seis grupos de serviços e três mood boards, em catorze páginas", async () => {
    /**
     * A composição parte tudo o que não cabe: os serviços passam para a página
     * seguinte a meio de um grupo, as condições gerais ocupam duas páginas, e o
     * cabeçalho corrente repete-se em todas elas. É aqui que se vê se as
     * secções sabem atravessar uma mudança de página — e foi aqui que se
     * descobriu que a referência do documento aparecia no fim das condições
     * gerais como se fosse uma condição.
     */
    const fotos = await Promise.all(
      [0, 1, 2, 3, 4, 5].map((i) => foto(800, 600, { r: 40 * i, g: 120, b: 90 })),
    );
    const doc = withProposalDefaults({
      template: "decoracao" as const,
      ref: "PO Casamento Decoração Rita e Tomás · 8.05.2027",
      clientNames: "Rita & Tomás",
      eventType: "Casamento",
      eventDate: "8 de maio de 2027",
      location: "Monte da Oliveirinha",
      guests: "200 pax",
      serviceGroups: [0, 1, 2, 3, 4, 5].map((g) => ({
        letter: `${String.fromCharCode(97 + g)})`,
        title: `Grupo número ${g + 1}`,
        items: [0, 1, 2, 3, 4, 5].map((i) => ({
          label: `Serviço ${g + 1}.${i + 1}`,
          desc:
            i % 2 === 0
              ? "Uma descrição bastante comprida, que ocupa mais do que uma linha e obriga a composição a parti-la — que é exactamente a situação em que uma linha se pode confundir com um serviço novo."
              : undefined,
        })),
      })),
      moodBoards: [
        { title: "Cerimónia", images: fotos.slice(0, 3), annotation: "Nota do primeiro board." },
        { title: "Copo d'Água", subtitulo: "Mesas e centros", images: fotos.slice(3, 5) },
        { title: "Espaço", images: [fotos[5]] },
      ],
      budgetItems: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(
        (i) => `Linha de orçamento número ${i + 1}`,
      ),
      totalLabel: "Valor Total Decoração",
      totalText: "20.000,00 € + IVA",
      totalAmount: 20000,
      totalVatMode: "acrescer" as const,
      coverImages: ["", ""],
    });
    const { rascunho, lido } = await idaEVolta("comprida");
    expect(rascunho.medidas.paginas).toBeGreaterThan(10);

    // Os trinta e seis serviços, com as descrições no sítio.
    const servicos = confrontar(
      doc,
      lido,
      doc.serviceGroups.flatMap((g, gi) => [
        `serviceGroups[${gi}].title`,
        ...g.items.flatMap((it, ii) => [
          `serviceGroups[${gi}].items[${ii}].label`,
          ...(it.desc ? [`serviceGroups[${gi}].items[${ii}].desc`] : []),
        ]),
      ]),
    );
    const resto = confrontar(doc, lido, [
      ...doc.budgetItems.map((_, i) => `budgetItems[${i}]`),
      ...doc.moodBoards.map((_, i) => `moodBoards[${i}].title`),
      ...camposFixos(doc),
    ]);
    console.log(tabela("comprida — serviços", servicos) + tabela("comprida — resto", resto));
    expect(servicos.acerto).toBe(1);
    expect(resto.acerto).toBe(1);

    // Cada mood board fica com as SUAS fotografias, pela página onde estavam.
    expect(rascunho.fotos.map((f) => f.destino)).toEqual([
      "moodBoards[0].images",
      "moodBoards[0].images",
      "moodBoards[0].images",
      "moodBoards[1].images",
      "moodBoards[1].images",
      "moodBoards[2].images",
    ]);
    // A referência do documento é do CABEÇALHO, não é uma condição geral.
    expect(lido.condicoesGerais).toHaveLength(doc.condicoesGerais.length);
    expect(lido.condicoesGerais?.some((c) => c.includes("PO Casamento"))).toBe(false);
  }, 200_000);

  it("modelo Organização — cronograma, quadro com preços e total estimado", async () => {
    const doc = withProposalDefaults({
      template: "organizacao" as const,
      ref: "PO Organização Ana e Rui · 9.05.2027",
      clientNames: "Ana & Rui",
      eventType: "Casamento",
      eventDate: "9 de maio de 2027",
      location: "Quinta das Lágrimas",
      guests: "100 pax",
      serviceGroups: [
        {
          title: "Organização Integral",
          items: [{ label: "Reunião inicial", desc: "Levantamento de necessidades." }],
        },
      ],
      moodBoards: [],
      cronograma: [
        {
          title: "6-12 meses antes do casamento",
          items: ["Definição de orçamento", "Escolha do espaço"],
        },
        { title: "3-6 meses antes", items: ["Provas de menu"] },
      ],
      budgetItems: [],
      budgetRows: [
        { item: "Coordenação no dia", price: "1.500,00 €" },
        { item: "Planeamento e produção", price: "[Valor]" },
      ],
      totalEstimatedText: "12.500,00 €",
      budgetNote: "Os valores são estimativas e podem ser ajustados.",
      totalLabel: "Valor Total",
      totalText: "",
      coverImages: ["", ""],
    });
    const { lido } = await idaEVolta("organizacao");
    const r = confrontar(doc, lido, [
      "template",
      "clientNames",
      "eventDate",
      "location",
      "guests",
      "cronograma[0].title",
      "cronograma[0].items[0]",
      "cronograma[0].items[1]",
      "cronograma[1].title",
      "cronograma[1].items[0]",
      "budgetRows[0].item",
      "budgetRows[0].price",
      "budgetRows[1].item",
      // `budgetRows[1].price` fora, e a razão é uma correcção do DESENHO:
      // «[Valor]» é o marcador que o estúdio semeia numa linha por orçamentar,
      // e deixou de ser impresso — cai no «—», como o «[Valor Total]» já caía.
      // Um marcador que sobrevive à ida e volta é um marcador que chegou ao
      // papel do cliente; o que se confere aqui em baixo é o contrário disso.
      // `totalEstimatedText` fora, pela mesma razão do `totalText` na proposta
      // magra: também no modelo Organização a folha fecha na escada, e o número
      // grande é o «Total a pagar» e não o texto estimado composto no estúdio.
      // O que a estimativa VALE volta pela linha «TOTAL (sem IVA)», conferido
      // logo abaixo.
      "budgetNote",
      "serviceGroups[0].title",
      "serviceGroups[0].items[0].label",
      "serviceGroups[0].items[0].desc",
      ...camposFixos(doc),
    ]);
    console.log(tabela("organização", r));
    expect(r.acerto).toBe(1);
    // O marcador não foi impresso, logo não volta: o que a folha mostrou
    // naquela célula foi o traço de «ainda sem preço».
    expect(lido.budgetRows?.[1]?.price ?? "").not.toContain("[Valor]");
    // A estimativa vale o mesmo depois da ida e volta, mudando embora de forma.
    const antes = resolveProposalMoney(doc);
    const depois = resolveProposalMoney(lido);
    expect(depois.base).toBe(antes.base);
    expect(depois.gross).toBe(antes.gross);
    // No modelo Organização o cliente vem debaixo de «Cliente», não de «Noivos».
    expect(lido.clientNames).toBe("Ana & Rui");
  }, 200_000);

  /**
   * ── A LEGENDA COLADA, QUE VOLTAVA COM PONTOS DE INTERROGAÇÃO ─────────────
   *
   * Ela abriu uma proposta e viu «?» nos textos por baixo das imagens dos mood
   * boards. O texto que ela escreveu estava certo — quem o estragava era o
   * gerador: passava tudo por um filtro do WinAnsi (a codificação das
   * fontes-PADRÃO do pdf-lib) quando este documento embebe a SUA própria fonte,
   * que desenha muito mais do que isso. E o texto COLADO do Word ou do Canva
   * traz passageiros invisíveis — espaços estreitos, espaços de largura zero, a
   * marca de ordem de bytes, hífenes que não quebram — que viravam um «?» cada.
   *
   * Este passeio é a prova pelo papel: imprime-se com a legenda tal como ela a
   * colaria, lê-se o PDF de volta, e o que volta não pode ter um único «?».
   */
  it("uma legenda colada volta sem pontos de interrogação", async () => {
    const a = await foto(900, 600, { r: 150, g: 120, b: 90 });
    // O documento que foi impresso em `amostras/legenda-colada.pdf`.
    const _impresso = withProposalDefaults({
      template: "decoracao",
      ref: "PO Decoração — Mafalda & Rui · 12.09.2027",
      clientNames: "Mafalda & Rui",
      eventType: "Casamento",
      eventDate: "12 de setembro de 2027",
      location: "Herdade do Exemplo, Évora",
      guests: "120 pax",
      serviceGroups: [
        {
          letter: "a)",
          title: "Decoração de Casamento",
          items: [{ label: "Centros de mesa" }],
        },
      ],
      coverImages: [a, ""],
      moodBoards: [
        {
          // Espaço de largura zero em «me​sas», hífen que não quebra em
          // «t‑lights», espaço estreito antes de «com», e a marca de ordem de
          // bytes à cabeça — exactamente o que sai de um copiar-colar.
          title: "\uFEFFDecoração das Me\u200Bsas",
          subtitulo: "Tons terrosos\u2009e bordeaux",
          images: [a],
          annotation:
            "Apontamentos florais em jarras e taças,\u2009com t\u2011lights e castiçais\u200B.",
        },
      ],
      budgetItems: ["Decoração das mesas"],
      totalLabel: "Valor Total",
      totalText: "3.200,00 € + IVA",
      totalAmount: 3200,
      totalVatMode: "acrescer",
    });

    const { lido } = await idaEVolta("legenda-colada");

    const legenda = `${lido.moodBoards?.[0]?.title ?? ""} ${lido.moodBoards?.[0]?.subtitulo ?? ""} ${lido.moodBoards?.[0]?.annotation ?? ""}`;
    expect(legenda).not.toContain("?");
    expect(lido.moodBoards?.[0]?.title).toBe("Decoração das Mesas");
    expect(lido.moodBoards?.[0]?.subtitulo).toBe("Tons terrosos e bordeaux");
    expect(lido.moodBoards?.[0]?.annotation).toBe(
      "Apontamentos florais em jarras e taças, com t-lights e castiçais.",
    );
  }, 200_000);
});
