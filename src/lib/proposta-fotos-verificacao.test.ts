import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS QUE FALTAM — APANHADAS ANTES DE O CASAL AS NÃO VER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O defeito real: quatro barras cinzentas na secção «Decoração Seatting Plan»
 * de uma proposta que já tinha seguido. A causa não é o carregamento: é que
 * ASSINAR UM CAMINHO NÃO PROVA QUE O FICHEIRO EXISTE — o Storage devolve um
 * endereço válido para um objecto que lá não está, e o 404 só acontece no
 * navegador do casal.
 *
 * O que se prende aqui é sobretudo a honestidade da resposta:
 *
 *   1. uma foto que falta é NOMEADA pelo sítio onde está, não por um caminho;
 *   2. uma listagem que FALHA não acusa ninguém — «não consegui perguntar» e
 *      «está tudo bem» são a mesma coisa vista do ecrã, e não podem ser;
 *   3. e o custo é uma ida ao Storage por PASTA, não por fotografia.
 */

const H = vi.hoisted(() => ({
  /** caminho → medida, como a tabela das fotografias a conhece. */
  formas: new Map<string, { largura: number; altura: number }>(),
  /** bucket::pasta → nomes de ficheiro, ou `null` para «a listagem falhou». */
  pastas: new Map<string, string[] | null>(),
  /** Quantas vezes o Storage foi consultado — o custo, medido. */
  listagens: [] as string[],
  /** As perguntas por ficheiro (`search`). */
  buscas: [] as string[],
  buscaFalha: false,
  temSupabase: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("./biblioteca-fotos-store", () => ({
  formasDeCaminhos: async (paths: readonly string[]) =>
    new Map([...H.formas].filter(([c]) => paths.includes(c))),
}));
vi.mock("./themes-store", () => ({
  getTheme: async (id: string) => (id === "t1" ? { id, name: "Natal" } : null),
}));
vi.mock("./reciclagem-store", () => ({
  entradasDe: async (origem: string) =>
    origem === "t1/foi.jpg" ? [{ tipo: "foto-de-tema", origemId: origem }] : [],
}));
vi.mock("./logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("./supabase", () => ({
  getSupabase: () =>
    H.temSupabase
      ? {
          storage: {
            from: (bucket: string) => ({
              list: async (
                pasta: string,
                opts: { limit?: number; offset?: number; search?: string } = {},
              ) => {
                const nomes = H.pastas.get(`${bucket}::${pasta}`);
                // A pergunta por ficheiro (`search`), contada à parte.
                if (opts.search !== undefined) {
                  H.buscas.push(`${bucket}::${pasta}/${opts.search}`);
                  if (nomes === null || H.buscaFalha) {
                    return { data: null, error: new Error("storage em baixo") };
                  }
                  const achados = (nomes ?? []).filter((n) => n.startsWith(opts.search!));
                  return {
                    data: achados
                      .slice(0, opts.limit ?? 100)
                      .map((name) => ({ id: `id-${name}`, name })),
                    error: null,
                  };
                }
                H.listagens.push(`${bucket}::${pasta}`);
                if (nomes === null) return { data: null, error: new Error("storage em baixo") };
                // Paginado como o Storage: `limit` de cada vez, a partir de `offset`.
                const de = opts.offset ?? 0;
                return {
                  data: (nomes ?? [])
                    .slice(de, de + (opts.limit ?? 100))
                    .map((name) => ({ id: `id-${name}`, name })),
                  error: null,
                };
              },
            }),
          },
        }
      : null,
}));

const { verificarFotosDaProposta, fotosEscolhidasQueFaltam, refsQueJaNaoExistem, PORQUE_FALTA } =
  await import("./proposta-fotos-verificacao");
const { esquecerListagens } = await import("./memoria-das-listagens");

beforeEach(() => {
  H.formas.clear();
  H.pastas.clear();
  H.listagens.length = 0;
  H.buscas.length = 0;
  H.buscaFalha = false;
  H.temSupabase = true;
  esquecerListagens();
});

/** Uma pasta do bucket das propostas, com os ficheiros que lá estão mesmo. */
const naPastaDoPedido = (pasta: string, nomes: string[] | null) =>
  H.pastas.set(`proposal-assets::${pasta}`, nomes);
const naBiblioteca = (pasta: string, nomes: string[] | null) =>
  H.pastas.set(`theme-assets::${pasta}`, nomes);

const doc = (over: Record<string, unknown> = {}) => ({
  coverImages: [],
  moodBoards: [],
  ...over,
});

describe("o que está lá, está", () => {
  it("um documento com todas as fotos no sítio não acusa nada", async () => {
    naPastaDoPedido("LIQ-9", ["uma.jpg", "duas.jpg"]);
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Cerimónia", images: ["LIQ-9/uma.jpg", "LIQ-9/duas.jpg"] }] }),
    );
    expect(r.emFalta).toEqual([]);
    expect(r.total).toBe(2);
    expect(r.verificou).toBe(true);
  });

  it("um documento sem fotos nenhumas responde sim, e sem ir ao Storage", async () => {
    const r = await verificarFotosDaProposta(doc());
    expect(r).toEqual({
      total: 0,
      emFalta: [],
      suspeitas: [],
      naoVerificaveis: 0,
      verificou: true,
    });
    expect(H.listagens).toEqual([]);
  });
});

describe("o que falta é nomeado pelo sítio, não pelo caminho", () => {
  it("uma foto que não está no bucket sai com o mood board e a posição", async () => {
    // «Mood board «Decoração Seating Plan» · foto 1» é o que ela precisa de
    // ler para saber onde ir; `LIQ-9/3f2a….jpg` não é nada para ninguém.
    naPastaDoPedido("LIQ-9", ["duas.jpg"]);
    const r = await verificarFotosDaProposta(
      doc({
        moodBoards: [
          { title: "Decoração Seating Plan", images: ["LIQ-9/uma.jpg", "LIQ-9/duas.jpg"] },
        ],
      }),
    );
    expect(r.emFalta).toEqual([
      {
        id: "b0f0",
        onde: "Mood board «Decoração Seating Plan» · foto 1",
        motivo: "nao-esta-no-bucket",
      },
    ]);
  });

  it("as capas dizem qual das duas", async () => {
    naPastaDoPedido("LIQ-9", []);
    const r = await verificarFotosDaProposta(doc({ coverImages: ["LIQ-9/capa.jpg"] }));
    expect(r.emFalta[0].onde).toBe("Capa · esquerda");
  });

  it("um mood board sem título é nomeado pela posição, não por um vazio", async () => {
    naPastaDoPedido("LIQ-9", []);
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "  ", images: ["LIQ-9/uma.jpg"] }] }),
    );
    expect(r.emFalta[0].onde).toBe("Mood board 1 · foto 1");
  });

  it("as fotos das ALTERNATIVAS entram na conta", async () => {
    // Nasceram hoje (Fase 3) e falham exactamente da mesma maneira. Deixá-las
    // de fora seria uma foto partida numa secção que a verificação jura limpa.
    naPastaDoPedido("LIQ-9", []);
    const r = await verificarFotosDaProposta(
      doc({
        escolhas: [
          {
            id: "e1",
            titulo: "Paleta",
            opcoes: [{ id: "o1", rotulo: "Terracota", imagem: "LIQ-9/paleta.jpg" }],
          },
        ],
      }),
    );
    expect(r.emFalta).toEqual([
      { id: "e0o0", onde: "Escolha «Paleta» · Terracota", motivo: "nao-esta-no-bucket" },
    ]);
  });

  it("uma foto da Biblioteca que já lá não está tem um motivo PRÓPRIO", async () => {
    // A causa é outra (foi apagada de um tema) e a resolução é outra. Misturá-la
    // com «não está no bucket do pedido» manda-a procurar no sítio errado.
    naBiblioteca("outono", ["outra.jpg"]);
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: ["tema:outono/sumida.jpg"] }] }),
    );
    expect(r.emFalta[0].motivo).toBe("saiu-da-biblioteca");
  });

  it("uma foto reservada e nunca copiada conta como falta", async () => {
    // `pending:` é um lugar guardado; se a cópia nunca aconteceu, é um buraco.
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: ["pending:tok-1"] }] }),
    );
    expect(r.emFalta).toEqual([
      { id: "b0f0", onde: "Mood board «Mesa» · foto 1", motivo: "por-copiar" },
    ]);
    // E nem chega a ir ao Storage por causa dela.
    expect(H.listagens).toEqual([]);
  });
});

describe("o que não se sabe não se dá por sabido", () => {
  it("sem Storage configurado, a resposta diz que NÃO verificou", async () => {
    // O caso do ambiente local. Uma lista vazia aqui lê-se como «está tudo
    // bem» — e seria a mesma mentira que este módulo existe para acabar.
    H.temSupabase = false;
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: ["LIQ-9/uma.jpg"] }] }),
    );
    expect(r.verificou).toBe(false);
    expect(r.emFalta).toEqual([]);
  });

  it("uma listagem que falha não acusa a foto de faltar", async () => {
    naPastaDoPedido("LIQ-9", null);
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: ["LIQ-9/uma.jpg"] }] }),
    );
    expect(r.verificou).toBe(false);
    expect(r.emFalta).toEqual([]);
  });

  it("um endereço de fora conta-se à parte — nem bom nem mau", async () => {
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: ["https://exemplo.pt/foto.jpg"] }] }),
    );
    expect(r.naoVerificaveis).toBe(1);
    expect(r.emFalta).toEqual([]);
    expect(r.verificou).toBe(true);
  });

  it("uma foto com os bytes lá dentro não pode faltar", async () => {
    // As propostas anteriores ao Storage são todas assim.
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: ["data:image/jpeg;base64,AAAA"] }] }),
    );
    expect(r.emFalta).toEqual([]);
    expect(r.naoVerificaveis).toBe(0);
  });
});

describe("o custo", () => {
  it("é uma ida ao Storage por PASTA, não por fotografia", async () => {
    // Quarenta e seis fotos da mesma pasta: uma listagem. Descarregar cada uma
    // para confirmar seriam dezenas de megabytes e uma rota que estoura.
    const muitas = Array.from({ length: 46 }, (_, i) => `LIQ-9/f${i}.jpg`);
    naPastaDoPedido(
      "LIQ-9",
      muitas.map((p) => p.split("/")[1]),
    );
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: muitas }] }),
    );
    expect(r.total).toBe(46);
    expect(r.emFalta).toEqual([]);
    expect(H.listagens).toEqual(["proposal-assets::LIQ-9"]);
  });

  it("duas origens são duas listagens, e não uma por foto", async () => {
    naPastaDoPedido("LIQ-9", ["uma.jpg"]);
    naBiblioteca("outono", ["duas.jpg"]);
    await verificarFotosDaProposta(
      doc({
        moodBoards: [
          { title: "Mesa", images: ["LIQ-9/uma.jpg", "tema:outono/duas.jpg", "LIQ-9/uma.jpg"] },
        ],
      }),
    );
    expect(H.listagens.sort()).toEqual(["proposal-assets::LIQ-9", "theme-assets::outono"]);
  });
});

describe("cada motivo explica-se a quem o lê", () => {
  it("nenhuma explicação é um rótulo técnico", () => {
    for (const [motivo, frase] of Object.entries(PORQUE_FALTA)) {
      expect(frase.length, motivo).toBeGreaterThan(40);
      expect(frase, motivo).not.toMatch(/bucket.*\/|undefined|null/);
    }
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS QUE ESTÃO LÁ E NÃO DEVIAM IR ASSIM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma foto do Seating Plan levava a marca de utilizador do Pinterest gravada
 * no canto, e outra das Lapelas tinha um ícone escuro por cima. Nenhuma delas
 * FALTA — estão no armazenamento, resolvem, desenham-se.
 *
 * O que se prende aqui é o alcance honesto da resposta: **isto lê medidas, não
 * lê pixéis**. Acusa o ficheiro que o Pinterest serve (que tem largura exacta)
 * e a foto pequena demais para o sítio; não acusa, nem finge acusar, uma marca
 * de água gravada numa fotografia grande.
 */
describe("as fotografias que vão sair pior do que deviam", () => {
  const comFoto = (largura: number, altura: number) => {
    naPastaDoPedido("LIQ-9", ["uma.jpg"]);
    H.formas.set("LIQ-9/uma.jpg", { largura, altura });
    return verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Seating Plan", images: ["LIQ-9/uma.jpg"] }] }),
    );
  };

  it("uma largura EXACTA do Pinterest é apanhada, mesmo com a foto alta", async () => {
    // 736 é a largura com que o site serve. Uma foto reduzida à mão dava 735
    // ou 740 tão facilmente — é a exactidão que faz a pista valer.
    const r = await comFoto(736, 1104);
    expect(r.suspeitas).toEqual([
      {
        id: "b0f0",
        onde: "Mood board «Seating Plan» · foto 1",
        motivo: "medida-de-partilha",
        largura: 736,
        altura: 1104,
      },
    ]);
  });

  it("uma foto pequena demais para o sítio onde é desenhada é apanhada", async () => {
    const r = await comFoto(640, 480);
    expect(r.suspeitas[0].motivo).toBe("pequena-demais");
  });

  it("a régua é a do aviso ao pôr a foto: uma «fraca» não é acusada (28/10)", async () => {
    // 1000 × 1500 num mood board: serve nas células pequenas. O aviso ao pôr
    // a foto também não pergunta nada — as duas perguntas dão a mesma resposta.
    const r = await comFoto(1000, 1500);
    expect(r.suspeitas).toEqual([]);
  });

  it("as fotos escolhidas para as páginas também se conferem, com a régua da página", async () => {
    naPastaDoPedido("LIQ-9", ["pag.jpg"]);
    // 1100 de lado maior: chegava para um mood board, não para uma página inteira.
    H.formas.set("LIQ-9/pag.jpg", { largura: 1100, altura: 733 });
    const r = await verificarFotosDaProposta(
      doc({ fotosDasPaginas: { indice: { fotos: ["LIQ-9/pag.jpg"] } } }),
    );
    expect(r.suspeitas).toHaveLength(1);
    expect(r.suspeitas[0]).toMatchObject({
      onde: "Página «Índice» · foto 1",
      motivo: "pequena-demais",
    });
    expect(r.suspeitas[0].id).toMatch(/^p[0-9a-z]{1,8}f0$/);
  });

  it("uma fotografia grande passa sem uma palavra", async () => {
    const r = await comFoto(2200, 1467);
    expect(r.suspeitas).toEqual([]);
  });

  it("735 não é 736 — não se acusa por aproximação", async () => {
    // Um «à volta de 736» transformava metade das fotografias reduzidas em
    // acusações, e um aviso que se engana deixa de se ler ao terceiro engano.
    const r = await comFoto(735, 1103);
    expect(r.suspeitas[0]?.motivo).not.toBe("medida-de-partilha");
  });

  it("a medida de partilha ganha à de tamanho — é ela que diz o que fazer", async () => {
    // Uma foto do Pinterest é quase sempre pequena também. Das duas frases, a
    // que resolve é «troca esta foto», não «esta foto é pequena».
    const r = await comFoto(236, 354);
    expect(r.suspeitas[0].motivo).toBe("medida-de-partilha");
  });

  /**
   * ── O QUE NÃO SE SABE NÃO SE DÁ POR SABIDO ────────────────────────────
   */
  it("uma foto sem medida conhecida NÃO é acusada", async () => {
    // Não saber a medida é não saber. As propostas antigas, anteriores à
    // tabela, são todas assim — e nenhuma delas é um defeito.
    naPastaDoPedido("LIQ-9", ["uma.jpg"]);
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: ["LIQ-9/uma.jpg"] }] }),
    );
    expect(r.suspeitas).toEqual([]);
    expect(r.verificou).toBe(true);
  });

  it("uma foto que FALTA não é também acusada de ser pequena", async () => {
    // A mesma foto contada duas vezes, com dois nomes, em duas caixas.
    naPastaDoPedido("LIQ-9", []);
    H.formas.set("LIQ-9/sumida.jpg", { largura: 400, altura: 300 });
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: ["LIQ-9/sumida.jpg"] }] }),
    );
    expect(r.emFalta).toHaveLength(1);
    expect(r.suspeitas).toEqual([]);
  });
});

/** 14/11: a escolhida para uma página que foi para a Reciclagem trava o envio. */
describe("as fotos escolhidas para as páginas que já não existem", () => {
  const doc = {
    template: "decoracao",
    moodBoards: [{ title: "Cerimónia", images: ["tema:t1/fica.jpg"] }],
    fotosDasPaginas: {
      indice: { fotos: ["tema:t1/foi.jpg"] },
      total: { fotos: ["", "tema:t1/fica.jpg"] },
    },
  };

  it("diz a página, o tema e que está na Reciclagem — só das que faltam", async () => {
    H.pastas.set("theme-assets::t1", ["fica.jpg"]);
    expect(await fotosEscolhidasQueFaltam(doc as never)).toEqual([
      { ref: "tema:t1/foi.jpg", pagina: "Índice", tema: "Natal", naReciclagem: true },
    ]);
    // Uma ida por pasta, e não por foto.
    expect(H.listagens).toEqual(["theme-assets::t1"]);
  });

  it("a mesma resposta vem na verificação do passo do envio", async () => {
    H.pastas.set("theme-assets::t1", ["fica.jpg"]);
    const r = await verificarFotosDaProposta(doc as never);
    expect(r.escolhidasQueFaltam?.map((f) => f.ref)).toEqual(["tema:t1/foi.jpg"]);
  });

  it("uma listagem que falha não acusa as dela, e sem escolhas não pergunta nada", async () => {
    H.pastas.set("theme-assets::t1", null);
    expect(await fotosEscolhidasQueFaltam(doc as never)).toEqual([]);
    H.listagens.length = 0;
    expect(await fotosEscolhidasQueFaltam({ fotosDasPaginas: {} } as never)).toEqual([]);
    expect(H.listagens).toEqual([]);
  });

  /**
   * Revisão de 14/11, n.º 2: na rota, UMA pasta que não se deixava listar
   * devolvia «não sei» para a proposta inteira, e o travão desligava-se. Uma
   * pasta em falha deixa por acusar só as SUAS fotos.
   */
  it("uma pasta que falha não desliga o que as outras disseram", async () => {
    H.pastas.set("theme-assets::t1", ["fica.jpg"]);
    H.pastas.set("theme-assets::t2", null);
    const comDuas = {
      ...doc,
      fotosDasPaginas: {
        indice: { fotos: ["tema:t1/foi.jpg"] },
        proposta: { fotos: ["tema:t2/talvez.jpg"] },
      },
    };
    expect((await fotosEscolhidasQueFaltam(comDuas as never)).map((f) => f.ref)).toEqual([
      "tema:t1/foi.jpg",
    ]);
    const r = await verificarFotosDaProposta(comDuas as never);
    // A verificação não é inteira — mas a que se SABE que falta vem, e trava.
    expect(r.verificou).toBe(false);
    expect(r.escolhidasQueFaltam?.map((f) => f.ref)).toEqual(["tema:t1/foi.jpg"]);
  });

  /**
   * Revisão de 14/11, n.º 1: uma chave de uma página que JÁ NÃO EXISTE no
   * plano (o tema ficou com menos páginas) não sai no PDF — acusá-la travava o
   * envio sem forma de resolver, com a chave crua na frase.
   */
  it("uma chave órfã não conta, nem na verificação nem no travão", async () => {
    H.pastas.set("theme-assets::t1", ["fica.jpg"]);
    const orfa = {
      ...doc,
      fotosDasPaginas: { "tema:0:3": { fotos: ["tema:t1/foi.jpg"] } },
    };
    expect(await fotosEscolhidasQueFaltam(orfa as never)).toEqual([]);
    const r = await verificarFotosDaProposta(orfa as never);
    expect(r.escolhidasQueFaltam).toEqual([]);
    expect(r.emFalta).toEqual([]);
  });

  /** N.º 8: uma `pending:` ainda a copiar não «já não existe». */
  it("uma foto ainda a copiar vem marcada como tal", async () => {
    const r = await fotosEscolhidasQueFaltam({
      ...doc,
      fotosDasPaginas: { indice: { fotos: ["pending:LIQ-9/nova.jpg"] } },
    } as never);
    expect(r).toEqual([
      {
        ref: "pending:LIQ-9/nova.jpg",
        pagina: "Índice",
        tema: null,
        naReciclagem: false,
        porCopiar: true,
      },
    ]);
  });

  /**
   * N.º 3: a capa escolhida que não se deixa buscar punha outra no lugar, em
   * silêncio. O desenho da capa não muda; a capa entra na MESMA lista e trava.
   */
  it("a fotografia de capa escolhida que falta entra na mesma lista", async () => {
    H.pastas.set("theme-assets::t1", ["fica.jpg"]);
    const r = await fotosEscolhidasQueFaltam({
      ...doc,
      coverImages: ["", "tema:t1/foi.jpg"],
    } as never);
    expect(r).toEqual([
      { ref: "tema:t1/foi.jpg", pagina: "Capa", tema: "Natal", naReciclagem: true, capa: true },
    ]);
  });
});

/** A proposta online (14/11): o que SE SABE que falta, e só isso. */
describe("as fotografias que já não existem, para a página do casal", () => {
  it("só as que a pasta não tem; «não sei» não esconde nada", async () => {
    naBiblioteca("t1", ["fica.jpg"]);
    naBiblioteca("t2", null);
    naPastaDoPedido("LIQ-9", ["uma.jpg"]);
    const faltam = await refsQueJaNaoExistem([
      "tema:t1/fica.jpg",
      "tema:t1/foi.jpg",
      "tema:t2/talvez.jpg",
      "LIQ-9/uma.jpg",
      "LIQ-9/duas.jpg",
      "https://fora/x.jpg",
      "pending:LIQ-9/p.jpg",
    ]);
    expect([...faltam].sort()).toEqual(["LIQ-9/duas.jpg", "tema:t1/foi.jpg"]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * REVISÃO DE 14/11 (2.ª) — A PASTA MAIOR DO QUE O TECTO, A CAPA QUE NÃO IA
 * PARA O PDF, E O MOOD BOARD QUE NÃO TRAVA
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("uma pasta maior do que o tecto da listagem (importante n.º 2)", () => {
  /** 5200 ficheiros: a listagem pára aos 5000 (25 páginas de 200). */
  const MUITOS = Array.from({ length: 5200 }, (_, i) => `f${String(i).padStart(4, "0")}.jpg`);
  const comEscolha = (ref: string) => ({
    template: "decoracao",
    moodBoards: [{ title: "Cerimónia", images: [] }],
    fotosDasPaginas: { indice: { fotos: [ref] } },
  });

  it("uma foto para lá do corte NÃO passa a «já não existe»", async () => {
    naBiblioteca("grande", MUITOS);
    expect(await fotosEscolhidasQueFaltam(comEscolha("tema:grande/f5100.jpg") as never)).toEqual(
      [],
    );
    expect(await refsQueJaNaoExistem(["tema:grande/f5100.jpg"])).toEqual(new Set());
    // Perguntou-se por ela, pelo nome — uma pergunta em cada uma das duas chamadas.
    expect(H.buscas).toEqual(["theme-assets::grande/f5100.jpg", "theme-assets::grande/f5100.jpg"]);
  });

  it("e a que falta mesmo continua a faltar (e a travar)", async () => {
    naBiblioteca("grande", MUITOS);
    const r = await fotosEscolhidasQueFaltam(comEscolha("tema:grande/nao-ha.jpg") as never);
    expect(r.map((f) => f.ref)).toEqual(["tema:grande/nao-ha.jpg"]);
  });

  it("se a pergunta por ficheiro falhar, fica por confirmar: não acusa nem esconde", async () => {
    naBiblioteca("grande", MUITOS);
    H.buscaFalha = true;
    expect(await fotosEscolhidasQueFaltam(comEscolha("tema:grande/nao-ha.jpg") as never)).toEqual(
      [],
    );
    expect(await refsQueJaNaoExistem(["tema:grande/nao-ha.jpg"])).toEqual(new Set());
  });

  it("numa pasta normal não há pergunta por ficheiro nenhuma", async () => {
    naBiblioteca("t1", ["fica.jpg"]);
    await refsQueJaNaoExistem(["tema:t1/fica.jpg", "tema:t1/foi.jpg"]);
    expect(H.buscas).toEqual([]);
    expect(H.listagens).toEqual(["theme-assets::t1"]);
  });
});

describe("a capa só trava se o PDF a fosse usar (n.º 3)", () => {
  const comCapa = (capaMesmoAssim?: boolean, inspiracao: string[] = ["tema:t1/fica.jpg"]) =>
    ({
      template: "decoracao",
      coverImages: ["tema:t1/foi.jpg"],
      moodBoards: inspiracao.length ? [{ title: "Cerimónia", images: inspiracao }] : [],
      ...(capaMesmoAssim ? { capaMesmoAssim } : {}),
    }) as never;

  it("ao alto e sem «usar mesmo assim»: o PDF já punha outra — não trava", async () => {
    naBiblioteca("t1", ["fica.jpg"]);
    H.formas.set("t1/foi.jpg", { largura: 1600, altura: 2400 });
    expect(await fotosEscolhidasQueFaltam(comCapa())).toEqual([]);
    expect((await verificarFotosDaProposta(comCapa())).escolhidasQueFaltam).toEqual([]);
  });

  /**
   * Revisão de 14/11 (2.ª), importante n.º 3: «o PDF já punha outra» só é
   * verdade se houver outra. Com a inspiração vazia — ou com todas as dela
   * também em falta —, o PDF saía SEM capa e o envio não travava.
   */
  it("ao alto, mas sem nenhuma na inspiração para pôr no lugar: trava", async () => {
    naBiblioteca("t1", []);
    H.formas.set("t1/foi.jpg", { largura: 1600, altura: 2400 });
    expect((await fotosEscolhidasQueFaltam(comCapa(false, []))).map((f) => f.ref)).toEqual([
      "tema:t1/foi.jpg",
    ]);
    // A inspiração tem uma, mas também já não existe: trava na mesma — no
    // travão da rota (que só confere as escolhidas) e na verificação do passo.
    const soComAQueFalta = comCapa(false, ["tema:t1/tambem-foi.jpg"]);
    expect(await fotosEscolhidasQueFaltam(soComAQueFalta)).toHaveLength(1);
    expect((await verificarFotosDaProposta(soComAQueFalta)).escolhidasQueFaltam).toHaveLength(1);
    // E uma ainda a copiar também não serve para o lugar.
    expect(await fotosEscolhidasQueFaltam(comCapa(false, ["pending:abc"]))).toHaveLength(1);
  });

  it("uma da inspiração que não se conseguiu confirmar conta como existente («não sei» não acusa)", async () => {
    naBiblioteca("t1", []);
    H.pastas.set("theme-assets::t2", null);
    H.formas.set("t1/foi.jpg", { largura: 1600, altura: 2400 });
    expect(await fotosEscolhidasQueFaltam(comCapa(false, ["tema:t2/talvez.jpg"]))).toEqual([]);
  });

  it("ao alto mas com «usar mesmo assim»: ia para a capa — trava", async () => {
    naBiblioteca("t1", ["fica.jpg"]);
    H.formas.set("t1/foi.jpg", { largura: 1600, altura: 2400 });
    const r = await fotosEscolhidasQueFaltam(comCapa(true));
    expect(r).toEqual([
      { ref: "tema:t1/foi.jpg", pagina: "Capa", capa: true, tema: "Natal", naReciclagem: true },
    ]);
  });

  it("deitada e grande: ia para a capa — trava; sem medida não se sabe — trava", async () => {
    naBiblioteca("t1", []);
    expect(await fotosEscolhidasQueFaltam(comCapa())).toHaveLength(1);
    H.formas.set("t1/foi.jpg", { largura: 3000, altura: 2000 });
    expect(await fotosEscolhidasQueFaltam(comCapa())).toHaveLength(1);
  });
});

describe("uma foto de mood board na Reciclagem não trava; uma escolhida à mão trava", () => {
  it("só a do mood board: o motor deixa de a usar, e o envio segue", async () => {
    naBiblioteca("t1", ["fica.jpg"]);
    const d = {
      template: "decoracao",
      moodBoards: [{ title: "Cerimónia", images: ["tema:t1/foi.jpg", "tema:t1/fica.jpg"] }],
    };
    expect(await fotosEscolhidasQueFaltam(d as never)).toEqual([]);
    const r = await verificarFotosDaProposta(d as never);
    // Continua a ser o aviso de sempre — e o estúdio deixa de a oferecer.
    expect(r.emFalta.map((f) => f.id)).toEqual(["b0f0"]);
    expect(r.refsEmFalta).toEqual(["tema:t1/foi.jpg"]);
  });

  it("a mesma foto escolhida à mão para uma página: trava", async () => {
    naBiblioteca("t1", ["fica.jpg"]);
    const d = {
      template: "decoracao",
      moodBoards: [{ title: "Cerimónia", images: ["tema:t1/foi.jpg", "tema:t1/fica.jpg"] }],
      fotosDasPaginas: { indice: { fotos: ["tema:t1/foi.jpg"] } },
    };
    expect((await fotosEscolhidasQueFaltam(d as never)).map((f) => f.ref)).toEqual([
      "tema:t1/foi.jpg",
    ]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CUSTO DA PRÉ-VISUALIZAÇÃO REAL (revisão de 14/11, 2.ª, importante n.º 1)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada página da pré-visualização real pergunta que fotografias já não
 * existem. O estúdio desenha ~26 páginas ao abrir (várias ao mesmo tempo) e
 * até 5 por mudança. Sem memória partilhada eram, por pasta, uma listagem por
 * página desenhada: 26 + 10 × 5 = 76 por pasta num minuto a editar.
 */
describe("o custo da pré-visualização real: uma listagem por pasta por janela de memória", () => {
  const refs = ["LIQ-9/uma.jpg", "LIQ-9/foi.jpg", "tema:t1/fica.jpg", "tema:t1/foi.jpg"];
  const pagina = () => refsQueJaNaoExistem(refs, { memoria: true });

  it("abrir (26 páginas) e 10 mudanças (5 páginas cada) num minuto: uma por pasta", async () => {
    vi.useFakeTimers();
    try {
      naPastaDoPedido("LIQ-9", ["uma.jpg"]);
      naBiblioteca("t1", ["fica.jpg"]);
      // Abrir: as páginas pedem-se em lotes de 5 em paralelo (`usePaginaReal`).
      for (let lote = 0; lote < 26; lote += 5) {
        const r = await Promise.all(Array.from({ length: Math.min(5, 26 - lote) }, pagina));
        for (const x of r) expect([...x].sort()).toEqual(["LIQ-9/foi.jpg", "tema:t1/foi.jpg"]);
      }
      // Dez mudanças, uma a cada 6 s, cada uma com as 5 páginas à volta.
      for (let m = 0; m < 10; m++) {
        vi.advanceTimersByTime(6_000);
        await Promise.all(Array.from({ length: 5 }, pagina));
      }
      // K = número de pastas (2): uma listagem por pasta por janela de memória.
      expect(H.listagens).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("o envio e a porta do casal perguntam sempre de fresco — e não escrevem na memória", async () => {
    naPastaDoPedido("LIQ-9", ["uma.jpg"]);
    await refsQueJaNaoExistem(["LIQ-9/uma.jpg"]);
    await refsQueJaNaoExistem(["LIQ-9/uma.jpg"]);
    expect(H.listagens).toHaveLength(2);
    // Um desenho de rascunho a seguir não encontra nada guardado por eles.
    await refsQueJaNaoExistem(["LIQ-9/uma.jpg"], { memoria: true });
    expect(H.listagens).toHaveLength(3);
  });

  it("passada a janela, volta a perguntar; uma listagem falhada não se guarda", async () => {
    vi.useFakeTimers();
    try {
      naPastaDoPedido("LIQ-9", null);
      await pagina();
      await pagina();
      // As duas listagens falharam: a segunda não leu a falha da memória.
      expect(H.listagens.filter((l) => l.endsWith("LIQ-9"))).toHaveLength(2);
      naPastaDoPedido("LIQ-9", ["uma.jpg"]);
      H.listagens.length = 0;
      await pagina();
      await pagina();
      expect(H.listagens.filter((l) => l.endsWith("LIQ-9"))).toHaveLength(1);
      vi.advanceTimersByTime(3 * 60_000 + 1);
      await pagina();
      expect(H.listagens.filter((l) => l.endsWith("LIQ-9"))).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a memória das listagens não cresce sem fim (menor n.º 6)", () => {
  it("ao guardar uma pasta, as caducadas saem", async () => {
    const { quantasListagensGuardadas } = await import("./memoria-das-listagens");
    vi.useFakeTimers();
    try {
      naPastaDoPedido("LIQ-1", ["a.jpg"]);
      naPastaDoPedido("LIQ-2", ["b.jpg"]);
      naPastaDoPedido("LIQ-3", ["c.jpg"]);
      await refsQueJaNaoExistem(["LIQ-1/a.jpg", "LIQ-2/b.jpg"], { memoria: true });
      expect(quantasListagensGuardadas()).toBe(2);
      vi.advanceTimersByTime(3 * 60_000 + 1);
      await refsQueJaNaoExistem(["LIQ-3/c.jpg"], { memoria: true });
      expect(quantasListagensGuardadas()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * Revisão de 14/11 (2.ª), menor n.º 6: ela leva (ou traz) uma foto da
 * Reciclagem e volta ao estúdio na mesma instância — a pré-visualização tem de
 * ver a pasta como está agora, e não a listagem guardada de antes.
 */
describe("levar ou trazer da Reciclagem esquece a listagem dessa pasta", () => {
  it("a foto reposta volta a contar logo, sem esperar a memória caducar", async () => {
    const { esquecerListagemDaPasta } = await import("./memoria-das-listagens");
    naBiblioteca("t1", ["fica.jpg"]);
    const r1 = await refsQueJaNaoExistem(["tema:t1/foi.jpg"], { memoria: true });
    expect([...r1]).toEqual(["tema:t1/foi.jpg"]);
    // Reposta (o `theme-storage` chama isto em `invalidateThemeCount`).
    naBiblioteca("t1", ["fica.jpg", "foi.jpg"]);
    esquecerListagemDaPasta("theme-assets", "t1");
    const r2 = await refsQueJaNaoExistem(["tema:t1/foi.jpg"], { memoria: true });
    expect([...r2]).toEqual([]);
  });
});
