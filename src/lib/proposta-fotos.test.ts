import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * As três regras do cabeçalho de `proposta-fotos.ts`, presas uma a uma.
 *
 * Os assinadores são simulados e devolvem URLs RECONHECÍVEIS (`assinado:` /
 * `mini:`) para se poder afirmar de onde veio cada campo — a diferença entre
 * «a grelha usa a miniatura» e «a grelha usa alguma coisa».
 */

const H = vi.hoisted(() => ({
  originais: new Map<string, string>(),
  miniaturas: new Map<string, string>(),
  medias: new Map<string, string>(),
  mediasAvif: new Map<string, string>(),
  pedidosOriginais: [] as string[][],
  pedidosMiniaturas: [] as string[][],
  pedidosMedias: [] as string[][],
  pedidosMediasAvif: [] as string[][],
  guardados: new Map<string, Record<string, string>>(),
  gravados: new Map<string, Record<string, string>>(),
}));

vi.mock("server-only", () => ({}));
/**
 * O módulo das ASSINATURAS, e não o `proposal-storage`.
 *
 * Mudaram de casa para o `sharp` sair do grafo da página que o casal abre — o
 * porquê está no `proposal-assinaturas.ts`. Se este caminho voltar a ser o
 * antigo, o `proposta-fotos` deixa de estar simulado e passa a assinar contra
 * o Supabase a sério: os casos abaixo ficariam verdes por não medirem nada.
 */
vi.mock("@/lib/proposal-assinaturas", () => ({
  signProposalPaths: vi.fn(async (paths: string[]) => {
    H.pedidosOriginais.push([...paths]);
    return new Map(paths.filter((p) => H.originais.has(p)).map((p) => [p, H.originais.get(p)!]));
  }),
  signProposalThumbs: vi.fn(async (paths: string[]) => {
    H.pedidosMiniaturas.push([...paths]);
    return new Map(paths.filter((p) => H.miniaturas.has(p)).map((p) => [p, H.miniaturas.get(p)!]));
  }),
  signProposalMids: vi.fn(async (paths: string[]) => {
    H.pedidosMedias.push([...paths]);
    return new Map(paths.filter((p) => H.medias.has(p)).map((p) => [p, H.medias.get(p)!]));
  }),
  /**
   * A oferta em AVIF da mesma de 1200 px.
   *
   * `H.mediasAvif` VAZIO por omissão, de propósito: é o caso normal de tudo o
   * que foi carregado antes de o bucket existir, e o que se quer provar na
   * maioria destes passeios é que a ausência não estraga nada.
   */
  signProposalMidsAvif: vi.fn(async (paths: string[]) => {
    H.pedidosMediasAvif.push([...paths]);
    return new Map(paths.filter((p) => H.mediasAvif.has(p)).map((p) => [p, H.mediasAvif.get(p)!]));
  }),
}));
/**
 * O armazém dos endereços guardados, encenado.
 *
 * `guardados` é o que a base já tinha; `gravados` é o que esta execução lá pôs.
 * É com estes dois que se prova a coisa toda: que a segunda visita não assina
 * nada, e que o que se assinou na primeira ficou lá.
 */
vi.mock("@/lib/urls-assinados", () => ({
  urlsGuardados: vi.fn(async () => H.guardados),
  guardarUrls: vi.fn(async (novos: Map<string, Record<string, string>>) => {
    H.gravados = novos;
  }),
}));
vi.mock("@/lib/biblioteca-fotos-store", () => ({
  formasDeCaminhos: vi.fn(
    async () => new Map([["ped-42/aaa.jpg", { largura: 1600, altura: 900 }]]),
  ),
  lqipsDeCaminhos: vi.fn(async () => new Map()),
}));

const { fotosDaProposta } = await import("./proposta-fotos");

/** Um documento com as duas famílias de referência e um `pending:` pelo meio. */
const DOC = {
  coverImages: ["ped-42/capa.jpg", ""],
  moodBoards: [
    { title: "Cerimónia", images: ["ped-42/aaa.jpg", "tema:outono-quente/bbb.jpg"] },
    { title: "Copo de água", images: ["pending:ped-42/ccc.jpg", "ped-42/sem-miniatura.jpg"] },
  ],
} as unknown as Parameters<typeof fotosDaProposta>[0];

beforeEach(() => {
  H.pedidosOriginais.length = 0;
  H.pedidosMiniaturas.length = 0;
  H.pedidosMedias.length = 0;
  H.pedidosMediasAvif.length = 0;
  H.mediasAvif.clear();
  H.originais.clear();
  H.miniaturas.clear();
  H.medias.clear();
  for (const p of [
    "ped-42/capa.jpg",
    "ped-42/aaa.jpg",
    "tema:outono-quente/bbb.jpg",
    "ped-42/sem-miniatura.jpg",
  ]) {
    H.originais.set(p, `https://storage.example/assinado:${p}?token=X`);
  }
  // De propósito SEM `ped-42/sem-miniatura.jpg`: as fotos anteriores ao bucket
  // das miniaturas não têm nenhuma, e a página tem de saber viver com isso.
  for (const p of ["ped-42/capa.jpg", "ped-42/aaa.jpg", "tema:outono-quente/bbb.jpg"]) {
    H.miniaturas.set(p, `https://storage.example/mini:${p}?token=X`);
  }
  // A derivada de 1200 px só existe depois de alguém a ter fabricado. A capa
  // tem-na (o envio aquece-a); a `aaa.jpg` ainda não — e é essa que prova que a
  // ausência não parte nada.
  for (const p of ["ped-42/capa.jpg", "tema:outono-quente/bbb.jpg"]) {
    H.medias.set(p, `https://storage.example/media:${p}?token=X`);
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A DERIVADA DE 1200 PX VEM DIRECTA DO STORAGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre a capa: «esta foto demora imenso tempo a carregar».
 *
 * Era servida SEMPRE pela nossa rota, que abre o token, descarrega os bytes
 * para dentro da função e só então os reencaminha. Assinada, vem do CDN.
 */
describe("a derivada intermédia", () => {
  it("vem assinada quando já existe", async () => {
    const fotos = await fotosDaProposta(DOC);
    expect(fotos.find((f) => f.id === "c0")?.media).toContain("media:ped-42/capa.jpg");
  });

  it("e não vem quando ainda não foi fabricada", async () => {
    // É a ausência que manda quem desenha usar a rota — que a fabrica. Assinar
    // às cegas dava um endereço válido para um ficheiro que não está lá, e um
    // 404 dentro de um `srcset` é uma imagem partida, não um candidato a menos.
    const fotos = await fotosDaProposta(DOC);
    expect(fotos.find((f) => f.id === "b0f0")?.media).toBeUndefined();
  });

  it("assina-se num lote só, como os outros dois", async () => {
    await fotosDaProposta(DOC);
    expect(H.pedidosMedias).toHaveLength(1);
    expect(H.pedidosMedias[0]).toEqual(H.pedidosMiniaturas[0]);
  });
});

describe("regra 1 — nada do que sai é um caminho de bucket", () => {
  it("nem nas chaves, nem nos ids, nem em campo nenhum", async () => {
    const fotos = await fotosDaProposta(DOC);
    // CONTROLO POSITIVO: sem isto, uma lista vazia (ou um `fotosDaProposta`
    // que devolvesse `[]` por engano) passava este teste inteiro sem ter
    // desenhado nada. Tem de haver mesmo fotografias e URLs cá dentro.
    expect(fotos.length).toBe(4);
    expect(fotos.filter((f) => f.original).length).toBe(4);

    // Os IDs são opacos: nem o pedido, nem o ficheiro, nem a pasta do tema.
    expect(fotos.map((f) => f.id)).toEqual(["c0", "b0f0", "b0f1", "b1f1"]);

    // E o objecto inteiro, serializado, não pode conter o identificador do
    // pedido nem o nome da pasta da Biblioteca fora de um URL assinado.
    const semUrls = JSON.stringify(
      fotos.map(({ id, largura, altura, lqip }) => ({ id, largura, altura, lqip })),
    );
    expect(semUrls).not.toContain("ped-42");
    expect(semUrls).not.toContain("outono-quente");
    expect(semUrls).not.toContain("tema:");
  });
});

describe("regra 2 — só se assina o que está NAQUELE documento", () => {
  it("os assinadores recebem exactamente as referências do documento", async () => {
    await fotosDaProposta(DOC);
    const esperado = [
      "ped-42/capa.jpg",
      "ped-42/aaa.jpg",
      "tema:outono-quente/bbb.jpg",
      "ped-42/sem-miniatura.jpg",
    ];
    expect(H.pedidosOriginais).toEqual([esperado]);
    expect(H.pedidosMiniaturas).toEqual([esperado]);
  });

  it("uma foto por escrever (`pending:`) não é assinada nem desenhada", async () => {
    const fotos = await fotosDaProposta(DOC);
    expect(H.pedidosOriginais[0]).not.toContain("pending:ped-42/ccc.jpg");
    expect(fotos.map((f) => f.id)).not.toContain("b1f0");
  });

  /**
   * ── ESTE TESTE JÁ FOI OUTRO, E O OUTRO MENTIA ────────────────────────────
   *
   * Aqui esteve `expect(fotosDaProposta.length).toBe(1)` — «não há segundo
   * parâmetro por onde um caminho de fora possa entrar». MEDIDO: acrescentei
   * um `extra: string[] = []` à função e o teste **passou na mesma**, porque um
   * parâmetro com valor por omissão não conta para o `.length` de uma função
   * em JavaScript. Um teste sobre a torneira aberta que não fecha a torneira.
   *
   * O que se prende agora é a propriedade a sério, e não a forma da assinatura:
   * tudo o que for entregue aos assinadores TEM de estar escrito no documento.
   * A lista esperada é recolhida aqui, a percorrer o documento à mão — se a
   * implementação e o teste concordassem por lerem o mesmo inventário, isto não
   * provava nada.
   */
  it("tudo o que chega aos assinadores está escrito no documento", async () => {
    await fotosDaProposta(DOC);
    const noDocumento = new Set<string>([
      ...(DOC.coverImages ?? []),
      ...(DOC.moodBoards ?? []).flatMap((b) => b.images ?? []),
    ]);
    const assinados = [...H.pedidosOriginais.flat(), ...H.pedidosMiniaturas.flat()];
    // CONTROLO POSITIVO: alguma coisa foi mesmo assinada. Sem isto, uma
    // implementação que não assinasse nada passava com louvor.
    expect(assinados.length).toBeGreaterThan(0);
    const forasteiros = assinados.filter((p) => !noDocumento.has(p));
    expect(forasteiros, `assinados fora do documento: ${forasteiros.join(", ")}`).toEqual([]);
  });
});

describe("regra 3 — a grelha pede a miniatura, o original é só para a lupa", () => {
  it("os dois URLs vêm de buckets diferentes e não se confundem", async () => {
    const fotos = await fotosDaProposta(DOC);
    const capa = fotos.find((f) => f.id === "c0")!;
    expect(capa.miniatura).toContain("mini:");
    expect(capa.original).toContain("assinado:");
    expect(capa.miniatura).not.toBe(capa.original);
  });

  it("uma foto antiga SEM miniatura sai sem `miniatura` — e não sem foto", async () => {
    const fotos = await fotosDaProposta(DOC);
    const antiga = fotos.find((f) => f.id === "b1f1")!;
    expect(antiga.miniatura).toBeUndefined();
    expect(antiga.original).toContain("assinado:");
  });
});

describe("a forma da fotografia, quando se sabe", () => {
  it("chega à célula para ela não nascer com altura zero", async () => {
    const fotos = await fotosDaProposta(DOC);
    expect(fotos.find((f) => f.id === "b0f0")).toMatchObject({ largura: 1600, altura: 900 });
    // E quem não tem linha na tabela não inventa forma nenhuma.
    expect(fotos.find((f) => f.id === "c0")?.largura).toBeUndefined();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * REABRIR A PROPOSTA NÃO VOLTA A DESCARREGAR AS FOTOGRAFIAS TODAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «caso as pessoas vão ver as propostas outra vez no email, mas
 * já esteja muito mais rápido».
 *
 * Isto assinava tudo a cada visita, e o Supabase devolve um token novo de cada
 * vez — portanto o endereço mudava sempre. A chave da cache do navegador inclui
 * o endereço inteiro: para o telemóvel, o mesmo ficheiro com outro endereço é
 * OUTRA fotografia. As fotografias estão gravadas com validade de um ano, e
 * esse ano nunca valia nada.
 *
 * Numa proposta de 46 fotografias isso são 6,6 a 9,2 MB descarregados outra
 * vez, sempre. É a explicação inteira do «reabrir é tão lento como abrir».
 */
describe("os endereços das fotografias não mudam a cada visita", () => {
  beforeEach(() => {
    H.guardados = new Map();
    H.gravados = new Map();
  });

  it("O QUE ISTO EXISTE PARA FAZER: a segunda visita não assina nada", async () => {
    // Primeira visita: assina-se tudo, e o que se assinou fica guardado.
    const primeira = await fotosDaProposta(DOC);
    expect(H.gravados.size, "a primeira visita não guardou nada").toBeGreaterThan(0);

    // A base passa a ter o que a primeira visita lá pôs.
    H.guardados = H.gravados;
    H.pedidosOriginais = [];
    H.pedidosMiniaturas = [];
    H.pedidosMedias = [];
    H.pedidosMediasAvif = [];

    const segunda = await fotosDaProposta(DOC);

    /**
     * ── O QUE SE PEDE NA SEGUNDA VISITA, E PORQUÊ ──────────────────────────
     *
     * A primeira versão deste caso exigia ZERO assinaturas, e estava errada —
     * era o teste, não o código.
     *
     * Uma fotografia que não TEM ficheiro num balde (a `sem-miniatura`, aqui de
     * propósito) nunca recebe endereço nenhum para essa família, portanto não há
     * nada a guardar e volta a ser perguntada. E está certo que volte: é assim
     * que a derivada é apanhada no dia em que passar a existir.
     *
     * O que se ganha é o que interessa: as que JÁ têm endereço guardado saem da
     * pergunta. E como as assinaturas vão em lote, o custo de uma fotografia em
     * falta é uma ida ao armazenamento — não quarenta e seis.
     */
    const caminhoDe = (ref: string) => ref.replace(/^tema:/, "");
    for (const [familia, pedidos] of [
      ["original", H.pedidosOriginais],
      ["miniatura", H.pedidosMiniaturas],
      ["media", H.pedidosMedias],
    ] as const) {
      const jaTinham = pedidos.flat().filter((ref) => H.guardados.get(caminhoDe(ref))?.[familia]);
      expect(
        jaTinham,
        `voltou a assinar «${familia}» de fotografias que JÁ tinham endereço guardado — ` +
          "o telemóvel vai descarregar tudo outra vez",
      ).toEqual([]);
    }

    // E os endereços são OS MESMOS, que é o que faz a cache do telemóvel valer.
    expect(
      segunda.map((f) => f.miniatura),
      "os endereços mudaram entre visitas: para o navegador são fotografias novas",
    ).toEqual(primeira.map((f) => f.miniatura));
    expect(segunda.map((f) => f.media)).toEqual(primeira.map((f) => f.media));
  });

  it("uma família em falta assina-se sozinha, sem arrastar as outras", async () => {
    // O caso de uma fotografia que ganhou miniatura depois de já ter sido
    // assinada: assina-se só essa família, e não tudo de novo. (Este caso
    // usava a `mediaAvif`, que saiu a 14/11.)
    await fotosDaProposta(DOC);
    const semMiniatura = new Map(
      [...H.gravados].map(([c, fam]) => {
        const resto = { ...fam };
        delete resto.miniatura;
        return [c, resto] as const;
      }),
    );
    H.guardados = new Map(semMiniatura);
    H.pedidosOriginais = [];
    H.pedidosMiniaturas = [];

    await fotosDaProposta(DOC);

    const jaTinha = (pedidos: string[][], familia: string) =>
      pedidos.flat().filter((ref) => H.guardados.get(ref.replace(/^tema:/, ""))?.[familia]);
    expect(jaTinha(H.pedidosOriginais, "original"), "reassinou originais que já tinha").toEqual([]);
    expect(H.pedidosMiniaturas.flat().length, "não foi assinar a família em falta").toBeGreaterThan(
      0,
    );
  });

  /**
   * UM FICHEIRO POR TAMANHO (14/11): a de 1200 em AVIF já não se assina nem se
   * devolve — nem a que ficou GUARDADA de antes, com dez anos de validade. A
   * limpeza apaga esses ficheiros, e um `<source type="image/avif">` que dá 404
   * não recua para o `<img>`.
   */
  it("não assina a AVIF de 1200, e não devolve a guardada de antes", async () => {
    await fotosDaProposta(DOC);
    const comAvifVelha = new Map(
      [...H.gravados].map(([c, fam]) => [c, { ...fam, mediaAvif: `velha/${c}` }] as const),
    );
    // CONTROLO POSITIVO: há mesmo fotografias com a família velha guardada.
    expect(comAvifVelha.size).toBeGreaterThan(0);
    H.guardados = comAvifVelha;
    H.pedidosMediasAvif = [];
    for (const c of comAvifVelha.keys()) H.mediasAvif.set(c, `fresca/${c}`);

    const fotos = await fotosDaProposta(DOC);

    expect(H.pedidosMediasAvif.flat()).toEqual([]);
    expect(fotos.length).toBeGreaterThan(0);
    for (const f of fotos) expect(f).not.toHaveProperty("mediaAvif");
  });

  it("sem nada guardado, comporta-se exactamente como antes", async () => {
    // A rede por baixo: uma base sem a coluna, ou uma leitura que falhe,
    // devolvem um mapa vazio — e aí assina-se tudo, como sempre se fez.
    H.guardados = new Map();
    const fotos = await fotosDaProposta(DOC);

    expect(H.pedidosMiniaturas.flat().length).toBeGreaterThan(0);
    expect(fotos.find((f) => f.id === "c0")?.miniatura).toBe(
      "https://storage.example/mini:ped-42/capa.jpg?token=X",
    );
  });
});
