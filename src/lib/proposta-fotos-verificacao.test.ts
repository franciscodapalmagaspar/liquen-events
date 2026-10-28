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
  temSupabase: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("./biblioteca-fotos-store", () => ({
  formasDeCaminhos: async (paths: readonly string[]) =>
    new Map([...H.formas].filter(([c]) => paths.includes(c))),
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
              list: async (pasta: string) => {
                H.listagens.push(`${bucket}::${pasta}`);
                const nomes = H.pastas.get(`${bucket}::${pasta}`);
                if (nomes === null) return { data: null, error: new Error("storage em baixo") };
                return {
                  data: (nomes ?? []).map((name) => ({ id: `id-${name}`, name })),
                  error: null,
                };
              },
            }),
          },
        }
      : null,
}));

const { verificarFotosDaProposta, PORQUE_FALTA } = await import("./proposta-fotos-verificacao");

beforeEach(() => {
  H.formas.clear();
  H.pastas.clear();
  H.listagens.length = 0;
  H.temSupabase = true;
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
      doc({ fotosDasPaginas: { "separador:Cerimónia": { fotos: ["LIQ-9/pag.jpg"] } } }),
    );
    expect(r.suspeitas).toHaveLength(1);
    expect(r.suspeitas[0]).toMatchObject({
      onde: "Página escolhida 1 · foto 1",
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
