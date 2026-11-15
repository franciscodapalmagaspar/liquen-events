import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A cache que faz com que anunciar `Accept-Ranges` não seja um tiro no pé.
 *
 * O que aqui interessa provar não é "guarda coisas": é que o SEGUNDO pedido do
 * mesmo documento NÃO volta a desenhar. Um leitor de PDF faz cinco ou seis
 * pedidos parciais para abrir um ficheiro; sem isto, cada um custava ir buscar
 * até 80 fotos ao Storage e reencodá-las com o sharp.
 */

/**
 * O `desenhar` devolve só os BYTES, como sempre devolveu — o relatório é
 * embrulhado à volta dele aqui. Assim os casos que só querem provar a cache
 * continuam a ler-se como antes, e quem quiser exercitar as fotos em falta
 * mexe em `emFalta`.
 */
const desenhar = vi.fn();
/** Fotos em falta em cada passagem, por ordem. Vazia = zero, sempre. */
let filaDeFaltas: number[] = [];
/**
 * Das faltas de cada passagem, as que SE SABE que faltam, e dessas as das
 * fotos que ela escolheu à mão — por ordem, como `filaDeFaltas`.
 */
let filaDeSabidas: { sabidas: number; travam: number; tecto?: number; tectoTravam?: number }[] = [];
vi.mock("./proposal-doc-render", () => ({
  renderStoredEditorialPdfWithReport: async (...args: unknown[]) => {
    const pdf = await desenhar(...args);
    const s = filaDeSabidas.shift();
    return {
      pdf,
      missingImages: filaDeFaltas.shift() ?? 0,
      ...(s
        ? {
            faltasSabidas: s.sabidas,
            faltasSabidasQueTravam: s.travam,
            ...(s.tecto ? { faltasPeloTecto: s.tecto } : {}),
            ...(s.tectoTravam ? { faltasPeloTectoQueTravam: s.tectoTravam } : {}),
          }
        : {}),
      truncations: [],
    };
  },
}));

/**
 * O Storage dos PDFs guardados — só os testes que passam um `proposalId` lá
 * chegam; os outros nem o tocam.
 */
const noStorage = vi.hoisted(() => ({ guardar: vi.fn(async () => {}) }));
vi.mock("@/lib/proposal-pdf-guardado", () => ({
  lerPdfDaProposta: async () => null,
  guardarPdfDaProposta: noStorage.guardar,
}));

import {
  pdfDaPropostaEmCache,
  pdfDaPropostaComEstado,
  esvaziarCachePdf,
  estadoCachePdf,
  chaveDoPdf,
} from "./proposal-pdf-cache";
import type { ProposalDoc } from "./proposal-doc";

const doc = (ref: string) => ({ ref, clientName: "Maria" }) as unknown as ProposalDoc;
const pdfDe = (n: number, byte = 7) => Buffer.alloc(n, byte) as Buffer<ArrayBuffer>;

beforeEach(() => {
  esvaziarCachePdf();
  desenhar.mockReset();
  filaDeFaltas = [];
  filaDeSabidas = [];
  noStorage.guardar.mockClear();
});

describe("pdfDaPropostaEmCache", () => {
  it("desenha uma vez e serve as seguintes de memória", async () => {
    desenhar.mockResolvedValue(pdfDe(1000));
    const a = await pdfDaPropostaEmCache(doc("LIQ-1"));
    const b = await pdfDaPropostaEmCache(doc("LIQ-1"));
    const c = await pdfDaPropostaEmCache(doc("LIQ-1"));
    // Um leitor de PDF a abrir um ficheiro faz vários pedidos. Um desenho.
    expect(desenhar).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("um documento REVISTO tem chave nova — nunca serve a versão velha", async () => {
    desenhar.mockResolvedValueOnce(pdfDe(10, 1)).mockResolvedValueOnce(pdfDe(10, 2));
    const antes = await pdfDaPropostaEmCache(doc("LIQ-1"));
    const depois = await pdfDaPropostaEmCache({ ...doc("LIQ-1"), total: 999 } as ProposalDoc);
    expect(desenhar).toHaveBeenCalledTimes(2);
    expect(depois).not.toEqual(antes);
  });

  it("documentos diferentes não se atropelam", async () => {
    desenhar.mockResolvedValueOnce(pdfDe(10, 1)).mockResolvedValueOnce(pdfDe(10, 2));
    const um = await pdfDaPropostaEmCache(doc("LIQ-1"));
    const dois = await pdfDaPropostaEmCache(doc("LIQ-2"));
    expect(um).not.toEqual(dois);
    // E o primeiro continua lá, sem voltar a desenhar.
    expect(await pdfDaPropostaEmCache(doc("LIQ-1"))).toBe(um);
    expect(desenhar).toHaveBeenCalledTimes(2);
  });

  it("uma proposta anormalmente grande serve-se mas NÃO fica guardada", async () => {
    // Senão uma só entrada expulsava todas as outras e a cache deixava de
    // servir para o caso normal.
    desenhar.mockResolvedValue(pdfDe(9 * 1024 * 1024));
    const a = await pdfDaPropostaEmCache(doc("enorme"));
    expect(a.length).toBe(9 * 1024 * 1024);
    expect(estadoCachePdf().entradas).toBe(0);
    await pdfDaPropostaEmCache(doc("enorme"));
    expect(desenhar).toHaveBeenCalledTimes(2);
  });

  it("ao passar do tecto de memória sai a entrada usada há mais tempo", async () => {
    // O tecto é por BYTES e não por número de entradas: é a memória que acaba.
    desenhar.mockImplementation(() => Promise.resolve(pdfDe(5 * 1024 * 1024)));
    for (const r of ["a", "b", "c", "d", "e"]) await pdfDaPropostaEmCache(doc(r));
    const { entradas, bytes } = estadoCachePdf();
    expect(bytes).toBeLessThanOrEqual(24 * 1024 * 1024);
    expect(entradas).toBe(4); // 4 x 5 MB = 20 MB; a quinta expulsou a primeira

    desenhar.mockClear();
    await pdfDaPropostaEmCache(doc("a")); // a mais antiga já saiu
    expect(desenhar).toHaveBeenCalledTimes(1);
  });

  it("usar uma entrada põe-na no fim da fila", async () => {
    desenhar.mockImplementation(() => Promise.resolve(pdfDe(5 * 1024 * 1024)));
    for (const r of ["a", "b", "c", "d"]) await pdfDaPropostaEmCache(doc(r));
    await pdfDaPropostaEmCache(doc("a")); // "a" volta a ser a mais recente
    await pdfDaPropostaEmCache(doc("e")); // expulsa a mais antiga, que agora é "b"

    desenhar.mockClear();
    await pdfDaPropostaEmCache(doc("a"));
    expect(desenhar, '"a" foi usada há pouco e não devia ter saído').not.toHaveBeenCalled();
    await pdfDaPropostaEmCache(doc("b"));
    expect(desenhar, '"b" era a mais antiga e devia ter saído').toHaveBeenCalledTimes(1);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * UM PDF COM BURACOS NÃO SAI DAQUI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Esta cache serve o documento ao CASAL. Deitava fora o relatório do gerador:
 * uma fotografia que não resolvesse desaparecia da proposta e o ficheiro seguia
 * na mesma, bonito e incompleto — e a moldura não fica vazia, simplesmente não
 * existe, portanto ninguém dá por nada.
 */
describe("fotos em falta", () => {
  it("tenta segunda vez: a causa mais comum é passageira", async () => {
    /**
     * A primeira versão deste teste punha `emFalta = 0` logo a seguir a lançar
     * a promessa, e o mock — que lê `emFalta` DEPOIS do `await` — já via zero.
     * Não havia segunda passagem nenhuma e a asserção («chamado uma vez»)
     * passava por acidente, a medir o caso normal. Uma FILA diz mesmo o que
     * cada passagem devolveu.
     */
    filaDeFaltas = [3, 0];
    desenhar.mockResolvedValue(pdfDe(100));

    const pdf = await pdfDaPropostaEmCache(doc("LIQ-9"));
    expect(pdf).toBeTruthy();
    expect(desenhar).toHaveBeenCalledTimes(2);
  });

  it("recusa quando à segunda continuam a faltar", async () => {
    desenhar.mockResolvedValue(pdfDe(100));
    filaDeFaltas = [1, 1];
    await expect(pdfDaPropostaEmCache(doc("LIQ-10"))).rejects.toThrow(/em falta/i);
    expect(desenhar).toHaveBeenCalledTimes(2);
  });

  /**
   * O ERRO QUE ISTO IMPEDE: guardar a falha em cache. A falha é passageira por
   * definição; fixá-la até ao próximo arranque a frio é o mesmo "gravar uma
   * falha como se fosse um facto" que já apareceu duas vezes neste projecto.
   */
  it("uma recusa não fica guardada", async () => {
    desenhar.mockResolvedValue(pdfDe(100));
    filaDeFaltas = [1, 1];
    await expect(pdfDaPropostaEmCache(doc("LIQ-11"))).rejects.toThrow();
    expect(estadoCachePdf().entradas).toBe(0);

    await expect(pdfDaPropostaEmCache(doc("LIQ-11"))).resolves.toBeTruthy();
    expect(estadoCachePdf().entradas).toBe(1);
  });
});

/**
 * Revisão de 14/11 (2.ª), importante n.º 2: uma foto que SE SABE que já não
 * existe (foi para a Reciclagem) não volta numa segunda passagem. Repetir por
 * ela era um desenho inteiro a dobrar em CADA visita do casal — e, por não
 * ficar guardado, em todas as visitas a seguir.
 */
describe("fotos que se sabe que faltam", () => {
  it("só de mood board: UM desenho por visita, serve-se — mas NÃO se guarda", async () => {
    desenhar.mockResolvedValue(pdfDe(100));
    filaDeFaltas = [2, 2];
    filaDeSabidas = [
      { sabidas: 2, travam: 0 },
      { sabidas: 2, travam: 0 },
    ];
    const a = await pdfDaPropostaComEstado(doc("LIQ-20"));
    expect(a.completo).toBe(false);
    expect(a.pdf.byteLength).toBeGreaterThan(0);
    expect(desenhar).toHaveBeenCalledTimes(1);
    // Guardado pela chave do conteúdo, ficava sem a foto mesmo depois de ela a
    // repor — e a discordar da página online, que pergunta de fresco.
    expect(estadoCachePdf().entradas).toBe(0);
    await pdfDaPropostaComEstado(doc("LIQ-20"));
    expect(desenhar).toHaveBeenCalledTimes(2);
  });

  it("reposta a foto, a visita seguinte desenha-a e então guarda-se", async () => {
    desenhar.mockResolvedValue(pdfDe(100));
    filaDeFaltas = [1, 0];
    filaDeSabidas = [
      { sabidas: 1, travam: 0 },
      { sabidas: 0, travam: 0 },
    ];
    expect((await pdfDaPropostaComEstado(doc("LIQ-23"))).completo).toBe(false);
    expect((await pdfDaPropostaComEstado(doc("LIQ-23"))).completo).toBe(true);
    expect(estadoCachePdf().entradas).toBe(1);
  });

  it("uma escolhida à mão: um desenho por visita, nunca dois — incompleto, e não se guarda", async () => {
    desenhar.mockResolvedValue(pdfDe(100));
    filaDeFaltas = [1, 1];
    filaDeSabidas = [
      { sabidas: 1, travam: 1 },
      { sabidas: 1, travam: 1 },
    ];
    const servido = await pdfDaPropostaComEstado(doc("LIQ-21"), "pt", true);
    expect(servido.completo).toBe(false);
    expect(desenhar).toHaveBeenCalledTimes(1);
    // O documento de registo continua a recusar — mas sem desenhar duas vezes.
    await expect(pdfDaPropostaEmCache(doc("LIQ-21"))).rejects.toThrow(/em falta/i);
    expect(desenhar).toHaveBeenCalledTimes(2);
    expect(estadoCachePdf().entradas).toBe(0);
  });

  it("as que passam do TECTO de fotos são certas: um desenho só, e guarda-se", async () => {
    // Revisão de 14/11, menor n.º 1. Uma proposta com mais fotos do que o tecto
    // por documento era desenhada DUAS vezes em cada visita (a segunda
    // esbarrava no mesmo tecto) e nunca ficava guardada.
    desenhar.mockResolvedValue(pdfDe(100));
    filaDeFaltas = [10, 10];
    filaDeSabidas = [
      { sabidas: 0, travam: 0, tecto: 10 },
      { sabidas: 0, travam: 0, tecto: 10 },
    ];
    const r = await pdfDaPropostaComEstado(doc("LIQ-24"));
    expect(desenhar).toHaveBeenCalledTimes(1);
    expect(r.completo).toBe(true);
    expect(estadoCachePdf().entradas).toBe(1);
    await pdfDaPropostaEmCache(doc("LIQ-24"));
    expect(desenhar).toHaveBeenCalledTimes(1);
  });

  it("uma ESCOLHIDA cortada pelo tecto: nunca se guarda — nem memória, nem Storage", async () => {
    // 2.ª revisão de 14/11, importante n.º 1: o PDF sai sem a foto que ela
    // escolheu à mão. Não é um documento completo, e guardá-lo fixava-o.
    desenhar.mockResolvedValue(pdfDe(100));
    filaDeFaltas = [3, 3];
    filaDeSabidas = [
      { sabidas: 0, travam: 0, tecto: 3, tectoTravam: 1 },
      { sabidas: 0, travam: 0, tecto: 3, tectoTravam: 1 },
    ];
    const r = await pdfDaPropostaComEstado(doc("LIQ-26"), "pt", true, "prop-26");
    expect(r.completo).toBe(false);
    // Certa como as outras do tecto: um desenho só.
    expect(desenhar).toHaveBeenCalledTimes(1);
    expect(estadoCachePdf().entradas).toBe(0);
    expect(noStorage.guardar).not.toHaveBeenCalled();
    // E o documento de registo recusa-o.
    await expect(pdfDaPropostaEmCache(doc("LIQ-26"))).rejects.toThrow(/em falta/i);
  });

  it("só mood boards cortados pelo tecto: guarda-se também no Storage", async () => {
    desenhar.mockResolvedValue(pdfDe(100));
    filaDeFaltas = [3];
    filaDeSabidas = [{ sabidas: 0, travam: 0, tecto: 3 }];
    const r = await pdfDaPropostaComEstado(doc("LIQ-27"), "pt", true, "prop-27");
    expect(r.completo).toBe(true);
    expect(noStorage.guardar).toHaveBeenCalledTimes(1);
  });

  it("tecto E passageiras: repete-se pelas passageiras", async () => {
    desenhar.mockResolvedValue(pdfDe(100));
    filaDeFaltas = [12, 10];
    filaDeSabidas = [
      { sabidas: 0, travam: 0, tecto: 10 },
      { sabidas: 0, travam: 0, tecto: 10 },
    ];
    const r = await pdfDaPropostaComEstado(doc("LIQ-25"));
    expect(desenhar).toHaveBeenCalledTimes(2);
    expect(r.completo).toBe(true);
  });

  it("sabidas E passageiras: repete-se pelas passageiras, como sempre", async () => {
    desenhar.mockResolvedValue(pdfDe(100));
    filaDeFaltas = [3, 1];
    filaDeSabidas = [
      { sabidas: 1, travam: 0 },
      { sabidas: 1, travam: 0 },
    ];
    const r = await pdfDaPropostaComEstado(doc("LIQ-22"));
    expect(desenhar).toHaveBeenCalledTimes(2);
    expect(r.completo).toBe(false);
    expect(estadoCachePdf().entradas).toBe(0);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MESMA PROPOSTA EM DUAS LÍNGUAS SÃO DOIS FICHEIROS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A cache é a porta por onde o casal volta a descarregar o documento — pelo
 * link da proposta e pelo portal. Enquanto a chave era só o `doc`, as duas
 * línguas do MESMO documento partilhavam entrada: quem pedisse a inglesa a
 * seguir a uma portuguesa recebia a portuguesa, servida de memória, sem
 * desenhar nada e sem erro nenhum.
 */
describe("a língua faz parte da chave", () => {
  it("pedir a mesma proposta noutra língua DESENHA outra vez", async () => {
    desenhar.mockResolvedValueOnce(pdfDe(10, 1)).mockResolvedValueOnce(pdfDe(10, 2));
    const pt = await pdfDaPropostaEmCache(doc("LIQ-20"), "pt");
    const en = await pdfDaPropostaEmCache(doc("LIQ-20"), "en");
    expect(desenhar).toHaveBeenCalledTimes(2);
    expect(en).not.toEqual(pt);
  });

  it("e cada língua fica guardada por si — a segunda vez já não desenha", async () => {
    desenhar.mockResolvedValue(pdfDe(10, 3));
    await pdfDaPropostaEmCache(doc("LIQ-21"), "en");
    await pdfDaPropostaEmCache(doc("LIQ-21"), "en");
    expect(desenhar).toHaveBeenCalledTimes(1);
  });

  it("a língua chega ao gerador — não fica pelo caminho a servir de chave", async () => {
    desenhar.mockResolvedValue(pdfDe(10));
    await pdfDaPropostaEmCache(doc("LIQ-22"), "en");
    expect(desenhar).toHaveBeenCalledWith(expect.anything(), "en");
  });

  it("sem língua é português — o caminho de sempre não muda", async () => {
    desenhar.mockResolvedValue(pdfDe(10));
    await pdfDaPropostaEmCache(doc("LIQ-23"));
    expect(desenhar).toHaveBeenCalledWith(expect.anything(), "pt");
    // E a entrada é a MESMA que a de um pedido explícito em português: uma
    // proposta antiga (sem língua gravada) e uma nova em português são o mesmo
    // ficheiro, e não vale a pena desenhá-lo duas vezes.
    await pdfDaPropostaEmCache(doc("LIQ-23"), "pt");
    expect(desenhar).toHaveBeenCalledTimes(1);
  });

  it("a segunda tentativa (fotos em falta) repete na MESMA língua", async () => {
    filaDeFaltas = [2, 0];
    desenhar.mockResolvedValue(pdfDe(100));
    await pdfDaPropostaEmCache(doc("LIQ-24"), "en");
    expect(desenhar).toHaveBeenCalledTimes(2);
    expect(desenhar).toHaveBeenNthCalledWith(2, expect.anything(), "en");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ORDEM POR QUE SE DESCARREGA NÃO PODE DECIDIR A LÍNGUA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O caso concreto que a chave por conteúdo deixava passar: uma proposta é
 * descarregada em inglês e fica em memória; alguém pede a portuguesa do MESMO
 * documento e recebe a inglesa, servida da cache, sem desenhar e sem erro.
 *
 * O que o torna perigoso é ser INTERMITENTE: depende de quem descarregou
 * primeiro e de a função ainda estar quente. Falha de maneiras diferentes em
 * dias diferentes, e não se reproduz quando se vai procurar.
 */
describe("descarregar nas duas línguas, uma a seguir à outra", () => {
  it("a segunda descarga é MESMO a segunda língua, e não a que estava em cache", async () => {
    // Bytes distinguíveis: 1 = a inglesa, 2 = a portuguesa.
    desenhar.mockResolvedValueOnce(pdfDe(10, 1)).mockResolvedValueOnce(pdfDe(10, 2));
    const en = await pdfDaPropostaEmCache(doc("LIQ-30"), "en");
    const pt = await pdfDaPropostaEmCache(doc("LIQ-30"), "pt");

    expect(en[0]).toBe(1);
    expect(pt[0]).toBe(2);
    expect(desenhar).toHaveBeenCalledTimes(2);
    expect(desenhar).toHaveBeenNthCalledWith(1, expect.anything(), "en");
    expect(desenhar).toHaveBeenNthCalledWith(2, expect.anything(), "pt");
  });

  it("e ao contrário — português primeiro, inglês depois", async () => {
    desenhar.mockResolvedValueOnce(pdfDe(10, 2)).mockResolvedValueOnce(pdfDe(10, 1));
    const pt = await pdfDaPropostaEmCache(doc("LIQ-31"), "pt");
    const en = await pdfDaPropostaEmCache(doc("LIQ-31"), "en");
    expect(pt[0]).toBe(2);
    expect(en[0]).toBe(1);
    expect(desenhar).toHaveBeenCalledTimes(2);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CHAVE É O CONTEÚDO — NÃO A ARRUMAÇÃO DELE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto não é uma finura de serialização: era A razão de o botão «Ver a proposta
 * completa (PDF)» continuar lento depois de lhe terem posto três camadas de
 * cache à frente.
 *
 * O `doc` que se desenha no ENVIO é o objecto que veio do estúdio. O `doc` que
 * se lê a seguir vem de `proposals.doc`, que é `jsonb` — e o Postgres normaliza
 * `jsonb`, o que REORDENA as chaves. Com o resumo a sair de um
 * `JSON.stringify` cru, o mesmo documento dava duas chaves: o PDF era guardado
 * numa e procurado noutra. Nunca era encontrado, o atalho para o CDN nunca
 * disparava, e cada abertura redesenhava oitenta fotografias.
 *
 * A cache por processo escondia-o — as duas pontas dela lêem o mesmo objecto,
 * portanto dentro de uma sessão de leitura parecia tudo bem.
 */
describe("chaveDoPdf", () => {
  it("dá a MESMA chave a um documento que voltou da base com as chaves por outra ordem", () => {
    const doEstudio = {
      template: "decoracao",
      ref: "PO Decoração",
      clientNames: "Melanie e Sebastien",
      totalAmount: 10778.74,
      moodBoards: [{ title: "Cerimónia", images: ["a.jpg", "b.jpg"] }],
    } as unknown as ProposalDoc;
    // O mesmo, tal como o `jsonb` o devolve: chaves reordenadas, em todos os
    // níveis. O conteúdo é idêntico ao cêntimo e à fotografia.
    const daBase = {
      ref: "PO Decoração",
      moodBoards: [{ images: ["a.jpg", "b.jpg"], title: "Cerimónia" }],
      template: "decoracao",
      totalAmount: 10778.74,
      clientNames: "Melanie e Sebastien",
    } as unknown as ProposalDoc;

    expect(chaveDoPdf(daBase, "pt")).toBe(chaveDoPdf(doEstudio, "pt"));
  });

  /**
   * E o contrário continua a valer, que é o que impede a correcção de virar um
   * defeito pior: uma proposta REVISTA não pode servir o ficheiro que o casal
   * não viu.
   */
  it("mas continua a mudar quando o conteúdo muda", () => {
    const base = { ref: "PO", totalAmount: 1000 } as unknown as ProposalDoc;
    const revista = { ref: "PO", totalAmount: 1200 } as unknown as ProposalDoc;
    expect(chaveDoPdf(revista, "pt")).not.toBe(chaveDoPdf(base, "pt"));
  });

  /**
   * A ordem de uma LISTA é conteúdo — é a ordem por que as páginas saem e a das
   * fotografias dentro de um mood board. Ordenar listas para «canonizar» fazia
   * duas propostas diferentes partilharem ficheiro.
   */
  it("e trocar a ordem das fotografias é uma proposta diferente", () => {
    const a = { moodBoards: [{ images: ["1.jpg", "2.jpg"] }] } as unknown as ProposalDoc;
    const b = { moodBoards: [{ images: ["2.jpg", "1.jpg"] }] } as unknown as ProposalDoc;
    expect(chaveDoPdf(b, "pt")).not.toBe(chaveDoPdf(a, "pt"));
  });

  it("e a língua continua a separar as duas versões do mesmo documento", () => {
    const d = { ref: "PO" } as unknown as ProposalDoc;
    expect(chaveDoPdf(d, "en")).not.toBe(chaveDoPdf(d, "pt"));
  });
});
