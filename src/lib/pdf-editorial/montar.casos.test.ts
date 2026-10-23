import { expect, it, vi, beforeAll } from "vitest";
import { describe } from "../../../test/em-partes";
import { PDFDocument, PDFPage, PDFName, PDFDict, PDFRawStream, PDFNumber } from "pdf-lib";
import sharp from "sharp";
import { withProposalDefaults, resolveValidUntil, type ProposalDoc } from "@/lib/proposal-doc";
import { blocosFixosNaLingua, textosDaProposta } from "@/lib/proposal-doc-textos";
import { PAGINA_H, PAGINA_W } from "@/lib/proposal-geometria";
import { SITE } from "@/lib/site";
import { renderEditorialPdf } from "./montar";
import { textosEditoriais } from "./textos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PDF EDITORIAL — a proposta inteira
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O que ela pediu por escrito, depois de gerar a proposta «Margarida &
 * Duarte» e encontrar 8 páginas onde o exemplo tem 26:
 *
 *   · todas as secções do exemplo, pela mesma ordem;
 *   · cada tema com TODAS as suas fotografias, o título e a nota;
 *   · as condições sempre, iguais às do gerador antigo, com ou sem orçamento;
 *   · o índice com «Investimento» e «Condições» nas páginas reais;
 *   · nenhuma transparência por cima das fotografias.
 *
 * As fotografias são fabricadas aqui — nenhuma foto de cliente entra num teste.
 */

vi.setConfig({ testTimeout: 180_000 });

async function foto(w: number, h: number, cor: string): Promise<string> {
  const b = await sharp({ create: { width: w, height: h, channels: 3, background: cor } })
    .jpeg({ quality: 80 })
    .toBuffer();
  return b.toString("base64");
}

let DEITADA = "";
let AO_ALTO = "";
let QUADRADA = "";
const fotos = (n: number) =>
  Array.from({ length: n }, (_, i) => [DEITADA, AO_ALTO, QUADRADA][i % 3]);

beforeAll(async () => {
  DEITADA = await foto(1800, 1200, "#7a8a6a");
  AO_ALTO = await foto(900, 1350, "#c9a37a");
  QUADRADA = await foto(1200, 1200, "#5a6a7a");
});

/** A proposta do exemplo: os mesmos valores, com nomes TESTE. */
function docDeTeste(p: Partial<ProposalDoc> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "TESTE",
    clientNames: "TESTE Ana Sousa & TESTE Rui Matos",
    eventType: "Casamento",
    eventDate: "8 de julho de 2028",
    location: "Évora · Exterior",
    guests: "50 a 100",
    ceremony: "Civil",
    coverImages: [DEITADA, AO_ALTO],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral e Decoração",
        items: [
          { label: "Decoração Cerimónia" },
          { label: "Decoração Cocktail" },
          { label: "Decoração Mesas Jantar" },
        ],
      },
    ],
    moodBoards: [
      { title: "Decoração Cerimónia", images: fotos(3) },
      { title: "Decor Cocktail", images: fotos(5) },
      { title: "Mesas de Jantar", images: fotos(8), annotation: "TESTE nota do jantar." },
    ],
    budgetItems: ["Decoração Cerimónia", "Decoração Cocktail", "Decoração Mesas Jantar"],
    totalLabel: "Valor Total Decoração",
    totalText: "3.200,00 € + IVA",
    totalAmount: 3200,
    totalVatMode: "acrescer",
    vatRate: 0.23,
    depositPercent: 30,
    budgetExtras: [{ label: "Deslocação equipa Líquen", valueText: "460,00 €" }],
    budgetExtrasSomam: true,
    validUntil: "2026-11-27",
    ...p,
  } as ProposalDoc);
}

/** Sem orçamento nenhum: sem linhas, sem total. */
const semOrcamento: Partial<ProposalDoc> = {
  budgetItems: [],
  totalText: "",
  totalAmount: undefined,
  budgetExtras: [],
};

interface Escrita {
  pagina: number;
  x: number;
  y: number;
  largura: number;
  tamanho: number;
  texto: string;
}

/** Desenha e devolve tudo o que foi escrito e quantas imagens cada página leva. */
async function desenhar(
  doc: ProposalDoc,
  idioma: "pt" | "en" = "pt",
  opcoes: { rascunho?: boolean } = {},
) {
  const paginas: PDFPage[] = [];
  const escritas: Escrita[] = [];
  const imagens: number[] = [];
  const addPage = PDFDocument.prototype.addPage;
  const drawText = PDFPage.prototype.drawText;
  const drawImage = PDFPage.prototype.drawImage;
  const embedPng = PDFDocument.prototype.embedPng;
  // O logótipo é o único PNG (tem transparência); as fotografias são JPEG.
  const logos = new Set<unknown>();
  PDFDocument.prototype.embedPng = async function (...a: Parameters<typeof embedPng>) {
    const img = await embedPng.apply(this, a);
    logos.add(img);
    return img;
  };
  PDFDocument.prototype.addPage = function (...a: Parameters<typeof addPage>) {
    const p = addPage.apply(this, a) as PDFPage;
    paginas.push(p);
    imagens.push(0);
    return p;
  };
  PDFPage.prototype.drawText = function (texto: string, o?: Parameters<typeof drawText>[1]) {
    const tamanho = o?.size ?? 12;
    escritas.push({
      pagina: paginas.indexOf(this) + 1,
      x: o?.x ?? 0,
      y: o?.y ?? 0,
      tamanho,
      largura: o?.font ? o.font.widthOfTextAtSize(texto, tamanho) : 0,
      texto,
    });
    return drawText.call(this, texto, o);
  };
  PDFPage.prototype.drawImage = function (...a: Parameters<typeof drawImage>) {
    // Só as FOTOGRAFIAS contam, e não o logótipo.
    if (!logos.has(a[0])) imagens[paginas.indexOf(this)]++;
    return drawImage.apply(this, a);
  };
  try {
    const r = await renderEditorialPdf(doc, idioma, opcoes);
    return { ...r, escritas, imagens, paginas: paginas.length };
  } finally {
    PDFDocument.prototype.addPage = addPage;
    PDFPage.prototype.drawText = drawText;
    PDFPage.prototype.drawImage = drawImage;
    PDFDocument.prototype.embedPng = embedPng;
  }
}

/** Todo o texto de uma página numa só linha, com os espaços normalizados. */
const naPagina = (e: Escrita[], n: number) =>
  e
    .filter((x) => x.pagina === n)
    .map((x) => x.texto)
    .join(" ")
    .replace(/[\s  ]+/g, " ");
const tudo = (e: Escrita[]) =>
  e
    .map((x) => x.texto)
    .join(" ")
    .replace(/[\s  ]+/g, " ");

describe("a sequência do exemplo, pela mesma ordem", () => {
  it("capa, índice, proposta, serviços, paleta, capítulos, citação, investimento, condições, contracapa", async () => {
    const { paginas, escritas } = await desenhar(docDeTeste());
    const t = textosDaProposta("pt");
    const te = textosEditoriais("pt");
    const M = (s: string) => s.toLocaleUpperCase("pt-PT");
    // O documento de 23/10 (§6): a citação depois dos capítulos, e o
    // investimento sem separador — o total primeiro, o quadro a seguir.
    const esperado: [number, string][] = [
      [1, "proposta de casamento"],
      [2, M(te.tituloIndice)],
      [3, "UMA DECORAÇÃO PENSADA PARA O DIA DE TESTE E TESTE"],
      [4, "TRÊS SERVIÇOS DE DECORAÇÃO FLORAL E DECORAÇÃO"],
      [5, M(te.tituloAmbiente)],
      [6, "CERIMÓNIA inspiração · 01"],
      [7, "DECORAÇÃO CERIMÓNIA"],
      [8, "COCKTAIL inspiração · 02"],
      [9, "DECOR COCKTAIL"],
      [10, "JANTAR inspiração · 03"],
      [11, "TESTE nota do jantar."],
      [12, "ETERNIZAMOS MEMÓRIAS"],
      [13, "4.501,80 €"],
      [14, M(te.tituloOrcamento)],
      [15, M(te.tituloNotas)],
      [16, M(te.tituloCondicoesGerais)],
      [17, M(te.tituloPagamento)],
      [18, t.obrigada.toLocaleLowerCase("pt-PT")],
    ];
    expect(paginas).toBe(18);
    for (const [n, texto] of esperado)
      expect(naPagina(escritas, n), `página ${n}`).toContain(texto);
  });

  it("o índice diz a página VERDADEIRA de cada secção, investimento e condições incluídos", async () => {
    const { escritas } = await desenhar(docDeTeste());
    const indice = escritas.filter((e) => e.pagina === 2);
    const paginaDe = (titulo: string) => {
      const t = indice.find((e) => e.texto === titulo);
      expect(t, titulo).toBeDefined();
      return indice.find((e) => Math.abs(e.y - t!.y) < 0.5 && e.x > t!.x && /^\d\d$/.test(e.texto))
        ?.texto;
    };
    expect(paginaDe("A proposta")).toBe("03");
    expect(paginaDe("Inspiração · Cerimónia")).toBe("06");
    expect(paginaDe("Inspiração · Cocktail")).toBe("08");
    expect(paginaDe("Inspiração · Jantar")).toBe("10");
    expect(paginaDe("Investimento")).toBe("13");
    expect(paginaDe("Condições")).toBe("15");
  });
});

describe("fora dos casamentos, a proposta adapta-se ao que se escreve", () => {
  /**
   * O caso dela, a 13/10: um restaurante no Halloween. Escolheu os grupos e os
   * mood boards que queria, e o PDF continuava a dizer «Noivos», «Cerimónia» e
   * «Cocktail». Cada mood board passa a ser o seu capítulo, com o título dela.
   */
  const restaurante = () =>
    docDeTeste({
      clientNames: "TESTE Restaurante Lua",
      eventType: "Halloween",
      ceremony: "",
      serviceGroups: [
        {
          letter: "a)",
          title: "Decoração Halloween",
          items: [{ label: "Decoração do bar" }, { label: "Arco de abóboras" }],
        },
      ],
      moodBoards: [
        { title: "Bar", images: fotos(3) },
        { title: "Arco de abóboras", images: fotos(4) },
        { title: "Mesas", images: fotos(5), annotation: "TESTE nota das mesas." },
      ],
      budgetItems: ["Decoração Bar", "Arco de abóboras", "Mesas"],
    });

  it("nada de casamento: nem Noivos, nem Cerimónia, nem Cocktail, nem «o vosso dia»", async () => {
    const { escritas } = await desenhar(restaurante());
    const texto = tudo(escritas);
    for (const palavra of [
      "Noivos",
      "NOIVOS",
      "Cerimónia",
      "CERIMÓNIA",
      "Cocktail",
      "Jantar",
      "Complementos",
      "vosso dia",
      "dia de",
    ])
      expect(texto, palavra).not.toContain(palavra);
    expect(texto).toContain("UMA DECORAÇÃO PENSADA PARA TESTE RESTAURANTE LUA");
    expect(texto).toContain("Halloween");
  });

  it("cada mood board abre o seu capítulo, com o título que ela lhe deu e pela ordem dela", async () => {
    const { escritas } = await desenhar(restaurante());
    const indice = escritas.filter((e) => e.pagina === 2).map((e) => e.texto);
    const capitulos = indice.filter((t) => t.startsWith("Inspiração · "));
    expect(capitulos).toEqual([
      "Inspiração · Bar",
      "Inspiração · Arco de abóboras",
      "Inspiração · Mesas",
    ]);
    const texto = tudo(escritas);
    expect(texto).toMatch(/BAR inspiração · 01/);
    expect(texto).toMatch(/ARCO DE ABÓBORAS inspiração · 02/);
  });

  it("em inglês também: «Client», «your event», e nada de «Bridal»", async () => {
    const { escritas } = await desenhar(restaurante(), "en");
    const texto = tudo(escritas);
    for (const palavra of ["Couple", "COUPLE", "Ceremony", "CEREMONY", "Bridal", "’s day"])
      expect(texto, palavra).not.toContain(palavra);
  });

  it("uma cerimónia que ela escreveu sai, mesmo fora de um casamento (a regra do estúdio)", async () => {
    const { escritas } = await desenhar(
      docDeTeste({ eventType: "Batizado", ceremony: "Religiosa", moodBoards: [] }),
    );
    expect(tudo(escritas)).toMatch(/CERIMÓNIA Religiosa/);
    expect(tudo(escritas)).toMatch(/CLIENTE/);
  });

  it("sem nome do cliente: «para o vosso evento»", async () => {
    const { escritas } = await desenhar(
      docDeTeste({ clientNames: "", eventType: "Festa", moodBoards: [] }),
    );
    expect(tudo(escritas)).toContain("UMA DECORAÇÃO PENSADA PARA O VOSSO EVENTO");
  });
});

describe("os temas: todas as fotografias, o título e a nota", () => {
  it.each([0, 1, 2, 3, 4, 5, 8, 12])("um tema com %i fotografias desenha-as todas", async (n) => {
    const doc = docDeTeste({
      moodBoards: [{ title: "Corredor", images: fotos(n), annotation: "TESTE nota" }],
    });
    const { escritas, imagens } = await desenhar(doc);
    const pagina = escritas.find((e) => e.texto === "CORREDOR")!.pagina;
    // A página do tema leva exactamente as suas fotografias.
    expect(imagens[pagina - 1]).toBe(n);
    expect(naPagina(escritas, pagina)).toContain("TESTE nota");
  });

  it("um tema SEM fotografias leva um painel nítido de outro tema do capítulo", async () => {
    const doc = docDeTeste({
      moodBoards: [
        { title: "Corredor", images: fotos(4) },
        { title: "Altar", images: [], annotation: "TESTE só texto" },
      ],
    });
    const { escritas, imagens } = await desenhar(doc);
    const pagina = escritas.find((e) => e.texto === "ALTAR")!.pagina;
    // A mesma fotografia duas vezes: arrastada no fundo e nítida, emoldurada.
    expect(imagens[pagina - 1]).toBe(2);
    expect(naPagina(escritas, pagina)).toContain("TESTE só texto");
  });

  it("acima de doze, reparte por duas páginas — a segunda diz «Mais ideias…»", async () => {
    const doc = docDeTeste({ moodBoards: [{ title: "Corredor", images: fotos(13) }] });
    const { escritas, imagens } = await desenhar(doc);
    const paginas = [
      ...new Set(escritas.filter((e) => e.texto === "CORREDOR").map((e) => e.pagina)),
    ];
    expect(paginas).toHaveLength(2);
    expect(paginas.reduce((s, p) => s + imagens[p - 1], 0)).toBe(13);
    expect(naPagina(escritas, paginas[1])).toContain("MAIS IDEIAS…");
  });

  it("uma nota muito longa encolhe e não passa do mosaico", async () => {
    const longa = "TESTE uma nota muito comprida, escrita à mão no estúdio. ".repeat(14);
    const doc = docDeTeste({
      moodBoards: [{ title: "Corredor", images: fotos(8), annotation: longa }],
    });
    const { escritas } = await desenhar(doc);
    const pagina = escritas.find((e) => e.texto === "CORREDOR")!.pagina;
    // A célula de texto ocupa a metade de cima (394 px) — nada da nota passa abaixo dela.
    const fundoDoMosaico = PAGINA_H - (395 * PAGINA_W) / 1123;
    for (const e of escritas.filter((x) => x.pagina === pagina)) {
      expect(e.y, e.texto).toBeGreaterThan(fundoDoMosaico);
    }
  });
});

describe("as condições: sempre, e palavra por palavra", () => {
  it.each([
    ["com orçamento", {}],
    ["SEM orçamento", semOrcamento],
  ])("%s, cada ponto dos blocos fixos está no PDF tal e qual", async (_, extra) => {
    const doc = docDeTeste(extra);
    const fixos = blocosFixosNaLingua(doc, "pt");
    const { escritas } = await desenhar(doc);
    const texto = tudo(escritas);
    const pontos = [
      ...fixos.notasImportantes,
      ...fixos.incluido,
      ...fixos.naoIncluido,
      ...fixos.observacoesGerais,
      ...fixos.condicoesGerais,
      ...fixos.faseamento,
      ...fixos.cancelamento,
    ];
    expect(pontos.length).toBeGreaterThan(10);
    for (const p of pontos) expect(texto).toContain(p.replace(/\s+/g, " "));
    expect(texto).toContain(SITE.email);
    expect(texto).toContain(SITE.phoneDisplay);
  });

  it("sem orçamento, não há «Investimento» no índice e as condições continuam lá", async () => {
    const { escritas } = await desenhar(docDeTeste(semOrcamento));
    const indice = naPagina(escritas, 2);
    expect(indice).not.toContain("Investimento");
    expect(indice).toContain("Condições");
  });
});

describe("os números do orçamento são os do gerador antigo", () => {
  it("os sete valores do exemplo", async () => {
    const texto = tudo((await desenhar(docDeTeste())).escritas);
    for (const v of [
      "3.200,00 €",
      "+ 460,00 €",
      "3.660,00 €",
      "841,80 €",
      "4.501,80 €",
      "1.350,54 €",
      "3.151,26 €",
    ]) {
      expect(texto).toContain(v);
    }
  });
});

describe("o rodapé", () => {
  it("o logótipo, o nome da proposta e o número, nas páginas de texto", async () => {
    const { escritas } = await desenhar(docDeTeste());
    // Nas páginas com painel de fotografia o rodapé é mais estreito e o nome
    // da proposta acaba em «…», como no exemplo — conta o princípio.
    const comRodape = escritas
      .filter((e) => e.y < 45 && e.texto.startsWith("Proposta de decoração · TESTE"))
      .map((e) => e.pagina);
    // Índice, proposta, serviços, paleta, total, orçamento, três de condições.
    expect(comRodape).toEqual(expect.arrayContaining([2, 3, 4, 5, 13, 14, 15, 16, 17]));
    // A marca é o logótipo (uma imagem), já não o texto «LÍQUEN EVENTS».
    expect(escritas.some((e) => e.texto === "LÍQUEN EVENTS" && e.y < 45)).toBe(false);
  });
});

describe("os textos da casa", () => {
  it("a contracapa sai como no gerador antigo", async () => {
    const t = textosDaProposta("pt");
    const doc = docDeTeste();
    const { escritas, paginas } = await desenhar(doc);
    const contracapa = naPagina(escritas, paginas);
    // O desenho de 23/10 (§6.10): «obrigada» em itálico, o agradecimento em
    // maiúsculas, e a linha pequena com o e-mail, o telefone e a validade.
    const M = (s: string) => s.toLocaleUpperCase("pt-PT");
    expect(contracapa).toContain(t.obrigada.toLocaleLowerCase("pt-PT"));
    expect(contracapa).toContain(M(t.agradecimento.replace(/[.!]+$/u, "")));
    const [a, m, d] = resolveValidUntil(doc).split("-");
    expect(contracapa).toContain(`VÁLIDA ATÉ ${d}.${m}.${a}`);
    expect(contracapa).toContain(M(SITE.email));
    // O lema passou para a citação (§6.7).
    expect(tudo(escritas)).toContain(M(SITE.slogan.replace(/[.!]+$/u, "")));
  });

  it("em inglês, os rótulos do desenho são os ingleses", async () => {
    const te = textosEditoriais("en");
    const { escritas } = await desenhar(docDeTeste(), "en");
    const texto = tudo(escritas);
    const M = (s: string) => s.toLocaleUpperCase("en");
    expect(texto).toContain(M(te.tituloIndice));
    expect(texto).toContain("Inspiration · Ceremony");
    expect(texto).toContain(M(te.tituloPagamento));
    expect(texto).toContain("the proposal");
    expect(texto).not.toContain("Conteúdo da proposta");
  });
});

describe("nada sai da folha nem desce ao rodapé", () => {
  it("com nomes e local compridos", async () => {
    const { escritas, truncations } = await desenhar(
      docDeTeste({
        clientNames:
          "TESTE Maria Inês de Albuquerque Sousa Coutinho Vasconcelos & TESTE João Pedro Barros e Cunha de Menezes Albergaria",
        location:
          "Quinta da Herdade do Monte Alto das Oliveiras Velhas · Montemor-o-Novo · Exterior",
      }),
    );
    const fora = escritas.filter((e) => {
      const espaco = /\p{Ll}/u.test(e.texto) ? 0.02 : 0.2;
      const folga = espaco * e.tamanho * [...e.texto].length;
      return e.x < 0 || e.y < 0 || e.x + e.largura + folga > PAGINA_W + 0.5 || e.y > PAGINA_H;
    });
    expect(fora).toEqual([]);
    for (const c of truncations) expect(c.dropped).toBeGreaterThan(0);
  });
});

describe("sem transparência por cima das fotografias", () => {
  it("só o logótipo tem máscara, e não há opacidade parcial", async () => {
    const { bytes } = await desenhar(docDeTeste());
    const pdf = await PDFDocument.load(bytes);
    let comMascara = 0;
    let opacidades = 0;
    for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
      const dict = obj instanceof PDFRawStream ? obj.dict : obj instanceof PDFDict ? obj : null;
      if (!dict) continue;
      if (
        dict.get(PDFName.of("Subtype")) === PDFName.of("Image") &&
        dict.has(PDFName.of("SMask"))
      ) {
        comMascara++;
      }
      for (const k of ["ca", "CA"]) {
        const v = dict.get(PDFName.of(k));
        if (v instanceof PDFNumber && v.asNumber() < 1) opacidades++;
      }
    }
    expect(comMascara).toBe(1);
    expect(opacidades).toBe(0);
  });

  /**
   * O pedido dela de 23/10: «não aparecem todas as fotografias… pelo menos
   * aqui no telemóvel». Os leitores de PDF do iOS são os mais esquisitos com
   * JPEG: todas as fotografias saem em JPEG «baseline» (SOF0, e não o
   * progressivo SOF2), RGB de 8 bits, e nenhuma passa de 1 800 px.
   */
  it("todas as fotografias são JPEG baseline, RGB, ≤ 1 800 px", async () => {
    const { bytes } = await desenhar(docDeTeste());
    const pdf = await PDFDocument.load(bytes);
    let jpegs = 0;
    const objectos = pdf.context.enumerateIndirectObjects();
    // O logótipo (o único PNG) e a máscara dele ficam de fora.
    const mascaras = new Set(
      objectos.flatMap(([, o]) =>
        o instanceof PDFRawStream && o.dict.has(PDFName.of("SMask"))
          ? [String(o.dict.get(PDFName.of("SMask")))]
          : [],
      ),
    );
    for (const [ref, obj] of objectos) {
      if (!(obj instanceof PDFRawStream)) continue;
      const d = obj.dict;
      if (d.get(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
      if (d.has(PDFName.of("SMask")) || mascaras.has(String(ref))) continue;
      jpegs++;
      expect(d.get(PDFName.of("Filter"))).toBe(PDFName.of("DCTDecode"));
      expect(d.get(PDFName.of("ColorSpace"))).toBe(PDFName.of("DeviceRGB"));
      expect((d.get(PDFName.of("BitsPerComponent")) as PDFNumber).asNumber()).toBe(8);
      const w = (d.get(PDFName.of("Width")) as PDFNumber).asNumber();
      const h = (d.get(PDFName.of("Height")) as PDFNumber).asNumber();
      expect(Math.max(w, h)).toBeLessThanOrEqual(1800);
      const b = obj.getContents();
      let sof = -1;
      for (let i = 0; i + 1 < b.length; i++) {
        if (b[i] === 0xff && (b[i + 1] === 0xc0 || b[i + 1] === 0xc2)) {
          sof = b[i + 1];
          break;
        }
      }
      expect(sof, "SOF0 (baseline), e não SOF2 (progressivo)").toBe(0xc0);
    }
    expect(jpegs).toBeGreaterThan(10);
  });
});

/**
 * A CAPA AO ALTO, «MESMO ASSIM».
 *
 * Palavras dela: «diz que é esta a foto de capa mas depois quando abro o pdf
 * está outra foto». A regra troca uma fotografia ao alto pela melhor deitada
 * dos temas; com `capaMesmoAssim` vai a dela, recortada como o estúdio a mostra.
 */
describe("a capa ao alto", () => {
  /** A cor média da primeira fotografia embutida — a da capa, que é a primeira página. */
  async function corDaCapa(doc: ProposalDoc) {
    const jpgs: Uint8Array[] = [];
    const embedJpg = PDFDocument.prototype.embedJpg;
    PDFDocument.prototype.embedJpg = function (b: Parameters<typeof embedJpg>[0]) {
      jpgs.push(b as Uint8Array);
      return embedJpg.call(this, b);
    };
    try {
      await renderEditorialPdf(doc, "pt");
    } finally {
      PDFDocument.prototype.embedJpg = embedJpg;
    }
    const { channels } = await sharp(Buffer.from(jpgs[0])).stats();
    return channels.slice(0, 3).map((c) => Math.round(c.mean));
  }

  it("sem nada dito, a dela ao alto dá lugar a uma deitada; com «mesmo assim», vai a dela", async () => {
    const VERMELHA_AO_ALTO = await foto(1000, 1500, "#b02020");
    const base = { coverImages: [VERMELHA_AO_ALTO, ""] } as Partial<ProposalDoc>;
    // A capa leva o degradé por cima, por isso compara-se o TOM (vermelho
    // contra verde), e não o brilho.
    const [r1, g1] = await corDaCapa(docDeTeste(base));
    expect(r1 - g1, "a regra trocou-a por uma deitada dos temas").toBeLessThan(20);
    const [r2, g2] = await corDaCapa(docDeTeste({ ...base, capaMesmoAssim: true }));
    expect(r2 - g2, "a dela, que é vermelha").toBeGreaterThan(50);
  });
});

/**
 * B1 — o PDF descarregado com erros por resolver sai marcado. Nada mais muda
 * no desenho: as mesmas páginas, o mesmo texto, e a marca à frente do rodapé.
 */
describe("o rascunho", () => {
  it("leva «RASCUNHO» à frente do rodapé e no título, e o resto fica igual", async () => {
    const normal = await desenhar(docDeTeste());
    const rascunho = await desenhar(docDeTeste(), "pt", { rascunho: true });
    expect(rascunho.paginas).toBe(normal.paginas);
    expect(tudo(normal.escritas)).not.toContain("RASCUNHO");
    const rodapesNormais = normal.escritas.filter((e) =>
      e.texto.startsWith("Proposta de decoração"),
    );
    const comMarca = rascunho.escritas.filter((e) => e.texto.startsWith("RASCUNHO · "));
    expect(comMarca.length, "uma marca por cada rodapé").toBe(rodapesNormais.length);
    expect(comMarca.map((e) => e.pagina)).toEqual(rodapesNormais.map((e) => e.pagina));
    // Fora do rodapé, o texto é exactamente o do PDF normal. No rodapé, a marca
    // vai À FRENTE: num rodapé estreito (ao lado de uma fotografia) o que
    // encolhe com «…» é o fim — a data —, e a marca fica sempre.
    const semRodape = (e: Escrita[]) =>
      tudo(e.filter((x) => !/^(RASCUNHO · )?Proposta de decoração/.test(x.texto)));
    expect(semRodape(rascunho.escritas)).toBe(semRodape(normal.escritas));
    const titulo = (await PDFDocument.load(rascunho.bytes)).getTitle();
    expect(titulo).toMatch(/^RASCUNHO · /);
  });

  it("em inglês diz «DRAFT»", async () => {
    const { escritas } = await desenhar(docDeTeste(), "en", { rascunho: true });
    expect(escritas.some((e) => e.texto.startsWith("DRAFT · "))).toBe(true);
  });
});
