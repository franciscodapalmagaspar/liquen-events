import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

/**
 * UMA PROPOSTA NÃO PODE SEGUIR PARA O CLIENTE COM FOTOS A MENOS EM SILÊNCIO.
 *
 * O gerador salta a foto que não consegue resolver: `fetchProposalImageBytes`
 * devolve `null` e quem desenha ignora-a. O PDF sai na mesma, com ar de estar
 * bem, e a primeira pessoa a dar pela falta é quem o abre. Foi exactamente
 * assim que a Catarina o encontrou.
 *
 * Estes testes fixam a contagem que agora acompanha o PDF, para o estúdio poder
 * avisar ANTES de a proposta ser enviada.
 */

const fetchMock = vi.hoisted(() => vi.fn());
/**
 * O armazenamento de DERIVADAS, que também conta para esta contagem: uma foto
 * que a tira de capa já resolvida serve não está em falta nenhuma. Os duplos
 * guardam o caminho que lhes pedem — enquanto o deitavam fora, uma derivada
 * procurada debaixo do nome errado não resolvia nada e ninguém dava por isso.
 */
const armazem = vi.hoisted(() => ({
  thumb: vi.fn(async (_ref: string) => null as Buffer | null),
  capa: vi.fn(async (_ref: string) => null as Buffer | null),
  guardarCapa: vi.fn(async (_ref: string, _bytes: Buffer) => false),
}));
/** O gerador, aqui de mentira: guarda o documento que RECEBEU (para se ver o
 *  que sobrou depois da resolução das fotos) e devolve o relatório de conteúdo
 *  cortado que cada teste quiser. */
const pdfMock = vi.hoisted(() => ({
  docs: [] as unknown[],
  truncations: [] as { where: string; dropped: number; unit: "fotos" | "linhas" }[],
  /** Fotos que o gerador RECEBEU e não conseguiu desenhar. */
  undrawnImages: 0,
}));

vi.mock("@/lib/proposal-storage", () => ({
  fetchProposalImageBytes: fetchMock,
  fetchProposalThumbBytes: armazem.thumb,
  fetchProposalCoverBytes: armazem.capa,
  uploadProposalCover: armazem.guardarCapa,
}));
vi.mock("@/lib/proposal-doc-pdf", async (importOriginal) => ({
  // A GEOMETRIA é real. É ela que o resolvedor usa para decidir o tamanho de
  // cada ficheiro; substituí-la por um duplo mediria outra coisa qualquer.
  caixasDoCollage: (await importOriginal<typeof import("./proposal-doc-pdf")>()).caixasDoCollage,
  caixasDaCapa: (await importOriginal<typeof import("./proposal-doc-pdf")>()).caixasDaCapa,
  renderProposalDocPdfWithReport: vi.fn(async (doc: unknown) => {
    pdfMock.docs.push(doc);
    return {
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      truncations: pdfMock.truncations,
      undrawnImages: pdfMock.undrawnImages,
    };
  }),
}));

const { renderStoredProposalDocPdfWithReport } = await import("./proposal-doc-render");

const docWith = (cover: string[], board: string[]) =>
  ({
    ref: "LIQ-TESTE",
    clientNames: "Teste",
    coverImages: cover,
    moodBoards: board.length ? [{ title: "Board", images: board }] : [],
  }) as unknown as Parameters<typeof renderStoredProposalDocPdfWithReport>[0];

beforeEach(() => {
  fetchMock.mockReset();
  armazem.thumb.mockClear();
  armazem.capa.mockClear();
  armazem.capa.mockResolvedValue(null);
  armazem.guardarCapa.mockClear();
  pdfMock.docs = [];
  pdfMock.truncations = [];
  pdfMock.undrawnImages = 0;
});

describe("contagem de fotos em falta", () => {
  it("conta zero quando todas resolvem", async () => {
    fetchMock.mockResolvedValue(Buffer.from("foto"));
    const { missingImages } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg", "b.jpg"], ["c.jpg"]),
    );
    expect(missingImages).toBe(0);
  });

  /**
   * A capa tem duas fontes: a tira já recortada e guardada, e o original. A
   * tira é procurada DEBAIXO da fotografia a que pertence — procurá-la por
   * outro nome qualquer devolvia sempre nada, e a foto ia parar à contagem (ou,
   * pior, ao original, que é o que este caminho existe para não descarregar).
   * Aqui o original não existe de propósito: quem resolve é a tira, ou ninguém.
   */
  it("a tira de capa já guardada resolve a foto — que não conta como em falta", async () => {
    const tira = await sharp({
      create: { width: 1400, height: 3000, channels: 3, background: { r: 124, g: 133, b: 75 } },
    })
      .jpeg()
      .toBuffer();
    armazem.capa.mockImplementation(async (ref: string) => (ref === "a.jpg" ? tira : null));
    fetchMock.mockResolvedValue(null);
    const { missingImages } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg", ""], []),
    );
    expect(missingImages).toBe(0);
  });

  it("conta uma foto de capa que não resolve", async () => {
    fetchMock.mockImplementation(async (ref: string) =>
      ref === "b.jpg" ? null : Buffer.from("x"),
    );
    const { missingImages } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg", "b.jpg"], []),
    );
    expect(missingImages).toBe(1);
  });

  it("conta uma foto de mood board que não resolve", async () => {
    fetchMock.mockImplementation(async (ref: string) =>
      ref === "c.jpg" ? null : Buffer.from("x"),
    );
    const { missingImages } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg"], ["c.jpg", "d.jpg"]),
    );
    expect(missingImages).toBe(1);
  });

  it("um LUGAR de capa vazio não conta como falta", async () => {
    // A capa tem duas posições fixas; deixar uma por preencher é uma escolha da
    // Catarina, não uma avaria. Contá-la faria o aviso disparar sempre.
    fetchMock.mockResolvedValue(Buffer.from("x"));
    const { missingImages } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg", ""], []),
    );
    expect(missingImages).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("conta as que passam do tecto de imagens por documento", async () => {
    // O tecto também era uma perda silenciosa: acima dele as fotos deixavam
    // simplesmente de entrar.
    fetchMock.mockResolvedValue(Buffer.from("x"));
    const muitas = Array.from({ length: 90 }, (_, i) => `f${i}.jpg`);
    const { missingImages } = await renderStoredProposalDocPdfWithReport(docWith([], muitas));
    expect(missingImages).toBe(10); // 90 pedidas, tecto de 80
  });

  it("o tecto corta SEMPRE as últimas pela ordem do documento (menor n.º 1, 14/11)", async () => {
    // Era um contador gasto à medida que as idas começavam: com dois mood
    // boards em paralelo, quem acabava primeiro decidia que fotos ficavam de
    // fora — o mesmo documento dava PDFs diferentes. Aqui as idas demoram ao
    // ritmos diferentes, e o corte tem de ser o mesmo na mesma.
    const boards = Array.from({ length: 9 }, (_, b) => ({
      title: `B${b}`,
      images: Array.from({ length: 10 }, (_, k) => `b${b}f${k}.jpg`),
    }));
    const pedidas = new Set<string>();
    fetchMock.mockImplementation(async (ref: string) => {
      pedidas.add(ref);
      // O penúltimo board é lento: o último começa enquanto ele ainda espera.
      if (ref.startsWith("b7")) await new Promise((r) => setTimeout(r, 30));
      return Buffer.from("x");
    });
    const { missingImages } = await renderStoredProposalDocPdfWithReport({
      ref: "LIQ-TESTE",
      clientNames: "Teste",
      coverImages: [],
      moodBoards: boards,
    } as unknown as Parameters<typeof renderStoredProposalDocPdfWithReport>[0]);
    expect(missingImages).toBe(10);
    // A ★ de cada board primeiro (3.ª revisão de 14/11: nenhum board fica
    // vazio), depois as outras pela ordem dela — saem as 10 últimas.
    const deFora = new Set(["b7f9.jpg", ...Array.from({ length: 9 }, (_, k) => `b8f${k + 1}.jpg`)]);
    expect([...pedidas].sort()).toEqual(
      boards
        .flatMap((b) => b.images)
        .filter((r) => !deFora.has(r))
        .sort(),
    );
  });

  it("a foto que RESOLVE e não se consegue DESENHAR também conta como em falta", async () => {
    // Era a perda mais invisível de todas: a foto existia no armazenamento,
    // descarregava bem — e depois o gerador não a conseguia embutir (um WebP do
    // Pinterest, que o pdf-lib não sabe imprimir) e deixava a página com um
    // buraco. Para quem envia a proposta é exactamente a mesma coisa que uma
    // foto que não chegou, por isso entra na MESMA contagem e no mesmo aviso.
    fetchMock.mockResolvedValue(Buffer.from("x"));
    pdfMock.undrawnImages = 2;
    const { missingImages } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg"], ["b.webp", "c.webp"]),
    );
    expect(missingImages).toBe(2);
  });

  it("soma as que não resolvem e as que não se desenham", async () => {
    fetchMock.mockImplementation(async (ref: string) =>
      ref === "b.webp" ? null : Buffer.from("x"),
    );
    pdfMock.undrawnImages = 1;
    const { missingImages } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg"], ["b.webp", "c.webp"]),
    );
    expect(missingImages).toBe(2);
  });

  it("o PDF sai à mesma, mesmo com fotos em falta", async () => {
    // Recusar o PDF seria pior: ela fica sem nada. Sai, mas avisado.
    fetchMock.mockResolvedValue(null);
    const { pdf, missingImages } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg"], ["b.jpg"]),
    );
    expect(missingImages).toBe(2);
    expect(pdf.byteLength).toBeGreaterThan(0);
  });
});

/**
 * A OUTRA maneira de a proposta seguir incompleta: o conteúdo CHEGA e o desenho
 * não o mostra todo (a sétima foto de um mood board, a terceira linha do
 * "Local"). Também tem de chegar a quem envia — mas por um caminho seu, porque
 * a correcção é outra: uma foto em falta tenta-se de novo, um mood board com
 * fotos a mais tem de perder fotos.
 */
describe("conteúdo cortado pelo desenho", () => {
  it("não relata nada quando o gerador não corta nada", async () => {
    fetchMock.mockResolvedValue(Buffer.from("foto"));
    const { truncations } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg"], ["b.jpg"]),
    );
    expect(truncations).toEqual([]);
  });

  it("o que o gerador cortou viaja no relatório, ao lado das fotos em falta", async () => {
    pdfMock.truncations = [{ where: "Mood board «Cerimónia»", dropped: 3, unit: "fotos" }];
    fetchMock.mockImplementation(async (ref: string) =>
      ref === "x.jpg" ? null : Buffer.from("f"),
    );
    const { missingImages, truncations } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg"], ["x.jpg", "b.jpg"]),
    );
    // As duas perdas convivem e continuam distintas: uma é avaria, outra é
    // composição — e a mensagem que a Catarina lê precisa de saber qual é qual.
    expect(missingImages).toBe(1);
    expect(truncations).toEqual([{ where: "Mood board «Cerimónia»", dropped: 3, unit: "fotos" }]);
  });

  it("uma foto EM FALTA nunca é contada também como cortada", async () => {
    // O gerador só vê as fotos que RESOLVERAM — as outras já foram descartadas
    // aqui e contadas em `missingImages`. Sem isto, um mood board com fotos em
    // falta arriscava-se a ser avisado duas vezes pela mesma foto.
    fetchMock.mockImplementation(async (ref: string) =>
      ref.startsWith("mau") ? null : Buffer.from("f"),
    );
    const board = ["mau1.jpg", "mau2.jpg", "mau3.jpg", "b1.jpg", "b2.jpg"];
    const { missingImages } = await renderStoredProposalDocPdfWithReport(docWith([], board));
    expect(missingImages).toBe(3);
    const recebido = pdfMock.docs[0] as { moodBoards: { images: string[] }[] };
    expect(recebido.moodBoards[0].images).toHaveLength(2); // só as que resolveram
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SE DESCARREGA, E QUANTAS VEZES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «demora imenso tempo a carregar a proposta em PDF».
 *
 * O que se prende aqui é o custo, e prende-se de duas maneiras: a mesma
 * fotografia não se descarrega duas vezes, e a ORDEM dos mood boards não muda
 * por eles passarem a correr em paralelo. A segunda é a que importa mais — uma
 * geração mais rápida que trocasse a ordem das secções seria um documento
 * diferente, e o documento é para ficar igual.
 */
describe("o custo de descarregar", () => {
  const docComBoards = (boards: { title: string; images: string[] }[]) =>
    ({
      ref: "LIQ-TESTE",
      clientNames: "Teste",
      coverImages: [],
      moodBoards: boards,
    }) as unknown as Parameters<typeof renderStoredProposalDocPdfWithReport>[0];

  it("a mesma fotografia em dois boards é descarregada UMA vez", () => {
    // Duplicar um board é um clique no estúdio, e as fotos são caminhos: o
    // mesmo ficheiro passa a estar em dois sítios do documento.
    fetchMock.mockImplementation(async () => Buffer.from("bytes-de-uma-foto"));
    return renderStoredProposalDocPdfWithReport(
      docComBoards([
        { title: "Cerimónia", images: ["p/uma.jpg"] },
        { title: "Cerimónia (cópia)", images: ["p/uma.jpg"] },
      ]),
    ).then(() => {
      const pedidas = fetchMock.mock.calls.map((c) => c[0]);
      expect(pedidas.filter((r) => r === "p/uma.jpg")).toHaveLength(1);
    });
  });

  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   */
  it("com os boards em paralelo, saem pela ordem em que ela os arrumou", () => {
    // O `mapLimit` devolve pela ordem de ENTRADA, não pela de chegada. Sem
    // isso, o board cujas fotos chegassem primeiro subia no documento — e uma
    // proposta mais rápida com as secções trocadas é uma proposta errada.
    fetchMock.mockImplementation(async (ref: string) => {
      // A primeira demora mais: é assim que uma corrida se vê num teste.
      if (ref === "p/a.jpg") await new Promise((r) => setTimeout(r, 30));
      return Buffer.from(ref);
    });
    return renderStoredProposalDocPdfWithReport(
      docComBoards([
        { title: "Primeiro", images: ["p/a.jpg"] },
        { title: "Segundo", images: ["p/b.jpg"] },
        { title: "Terceiro", images: ["p/c.jpg"] },
      ]),
    ).then(() => {
      const recebido = pdfMock.docs[0] as { moodBoards: { title: string }[] };
      expect(recebido.moodBoards.map((b) => b.title)).toEqual(["Primeiro", "Segundo", "Terceiro"]);
    });
  });
});
