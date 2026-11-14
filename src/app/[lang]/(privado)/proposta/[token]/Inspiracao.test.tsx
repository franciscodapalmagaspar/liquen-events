// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Inspiracao, { type BoardParaEcra } from "./Inspiracao";
import type { FotoDaProposta } from "@/lib/proposta-fotos";
import { textosDaPagina } from "./textos-da-pagina";
import { join } from "node:path";

/**
 * A LUPA — o gesto que existe para as fotografias deixarem de ser pequenas.
 * Aqui prende-se o comportamento: o que abre, o que anda, o que fecha, e a
 * regra dos bytes (a grelha na miniatura, a lupa no original).
 */

const T = textosDaPagina("pt");

const FOTOS: Record<string, FotoDaProposta> = {
  a: { id: "a", marca: "ma", miniatura: "mini/a", original: "orig/a", largura: 1200, altura: 800 },
  b: { id: "b", marca: "mb", miniatura: "mini/b", original: "orig/b" },
  c: { id: "c", marca: "mc", miniatura: "mini/c", original: "orig/c" },
};

const BOARD: BoardParaEcra = {
  chave: "b1",
  titulo: "Cerimónia",
  subtitulo: "Tons quentes",
  nota: "A escolher com a noiva",
  fotos: ["a", "b", "c"],
};

const desenhar = (board: BoardParaEcra = BOARD) =>
  render(<Inspiracao boards={[board]} fotosIniciais={FOTOS} token="tk" textos={T} />);

/** A lupa, quando está aberta. */
const lupa = () => screen.queryByRole("dialog");
/** A fotografia grande — a que NÃO está dentro de um botão da grelha. */
const fotoDaLupa = () =>
  [...(lupa()?.querySelectorAll("img") ?? [])].find((i) => !i.hasAttribute("aria-hidden"));

const abrirPrimeira = () => fireEvent.click(screen.getAllByRole("button", { name: /Ampliar/ })[0]);

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

describe("a grelha", () => {
  it("desenha uma célula por fotografia, com a miniatura", () => {
    desenhar();
    const botoes = screen.getAllByRole("button", { name: /Ampliar/ });
    expect(botoes).toHaveLength(3);
    expect(botoes.map((b) => b.querySelector("img")?.getAttribute("src"))).toEqual([
      "mini/a",
      "mini/b",
      "mini/c",
    ]);
  });

  it("a célula nasce com a forma da fotografia — para a página não saltar", () => {
    desenhar();
    const comForma = screen.getAllByRole("button", { name: /Ampliar/ })[0];
    expect(comForma.style.aspectRatio).toBe("1200 / 800");
  });

  /**
   * ── AS DUAS METADES TÊM DE USAR O MESMO NÚMERO ──────────────────────────
   *
   * Palavras dela: «Seating Plan e Corredor Nupcial, colunas que acabam antes
   * das outras».
   *
   * A conta que reparte as fotografias pelas colunas assume três por dois para
   * as que não têm medida guardada. A célula dessas mesmas fotografias não
   * reservava forma nenhuma e ficava com a altura natural do ficheiro — uma
   * coluna com duas fotos de retrato sem medida crescia o dobro do que a conta
   * julgava, e a outra acabava muito antes.
   *
   * Não era um defeito da repartição: eram as duas metades a usarem números
   * diferentes para a mesma fotografia.
   */
  it("uma foto sem medida guardada reserva a forma que a repartição lhe assumiu", () => {
    desenhar();
    const semForma = screen.getAllByRole("button", { name: /Ampliar/ })[1];
    // Três por dois deitada — o mesmo `ALTURA_POR_OMISSAO` que equilibra as
    // colunas. Deixá-la em branco era o que punha uma coluna a acabar antes.
    expect(semForma.style.aspectRatio).toBe("3 / 2");
  });

  it("NENHUMA entra ansiosa — nenhuma delas está à vista", () => {
    /*
     * Contadas pela POSIÇÃO DELA e não pela ordem no HTML.
     *
     * As colunas passaram a ser arrumadas para acabarem à mesma altura (ver
     * `arrumarPorColunas`), e uma fotografia pode saltar de coluna — o que
     * muda a ordem no documento sem mudar a posição dela na proposta. É a
     * posição que decide quem entra ansiosa, e é essa que aqui se conta; ler o
     * HTML por ordem media a arrumação, que é outra coisa.
     */
    desenhar({ ...BOARD, fotos: ["a", "b", "c", "a", "b", "c"] });
    const porPosicao = [...document.querySelectorAll("button[aria-label]")]
      .map((b) => {
        const n = /(\d+) de/.exec(b.getAttribute("aria-label") ?? "")?.[1];
        return { n: Number(n), modo: b.querySelector("img:last-of-type")?.getAttribute("loading") };
      })
      .sort((x, y) => x.n - y.n);
    expect(
      porPosicao.map((x) => x.modo),
      "uma fotografia de board voltou a entrar com pressa — e nenhuma está à vista:\n" +
        "a ordem é capa → apresentação → índice → serviços → cronograma → inspiração,\n" +
        "portanto a primeira da grelha está milhares de píxeis abaixo da dobra e o que\n" +
        "ela faz é disputar a ligação com a CAPA, que é o que o casal está a ver.",
    ).toEqual(["lazy", "lazy", "lazy", "lazy", "lazy", "lazy"]);
  });

  it("a máquina de contar por DOCUMENTO continua lá, para o dia em que o número subir", () => {
    /**
     * A outra metade da garantia, e existe porque o caso a seguir a perdeu.
     *
     * Com `FOTOS_ANSIOSAS = 0`, contar por board e contar por documento dão o
     * mesmo resultado — zero — portanto nenhum teste de comportamento
     * consegue distinguir as duas contas. A conta certa deixou de estar a ser
     * exercitada, e o que não é exercitado apodrece.
     *
     * Isto guarda-a estruturalmente: o índice que decide quem entra com pressa
     * tem de ser o do DOCUMENTO (a soma das fotografias dos boards anteriores),
     * e não o índice dentro do board. Se alguém voltar a subir o número — o que
     * é legítimo, se um dia a inspiração subir na ordem das secções — encontra a
     * contagem correcta em vez do defeito que já cá esteve: onze fotografias com
     * pressa numa proposta de três boards, das quais uma se via.
     */
    const fonte = readFileSync("src/app/[lang]/(privado)/proposta/[token]/Inspiracao.tsx", "utf8");
    expect(
      fonte,
      "desapareceu a soma das fotografias dos boards anteriores — a contagem por " +
        "documento foi substituída por uma contagem por board",
    ).toMatch(/fotosAntesDoBoard\[b\]/);
    expect(fonte, "a decisão de entrar com pressa deixou de usar o índice no documento").toMatch(
      /noDocumento\([^)]*\)\s*<\s*FOTOS_ANSIOSAS/,
    );
  });

  it("e o segundo mood board já não tem pressa nenhuma", () => {
    /**
     * ════════════════════════════════════════════════════════════════════
     * O DEFEITO QUE UM BOARD SÓ NUNCA PODIA MOSTRAR
     * ════════════════════════════════════════════════════════════════════
     *
     * O caso de cima desenha UM board. Com um board só, contar a posição
     * dentro do board e contar no documento dá exactamente o mesmo — e por
     * isso ele passava com a conta certa e com a conta errada.
     *
     * E a conta estava errada: o contador reiniciava em cada board. Numa
     * proposta de três boards saíam ONZE fotografias com pressa, das quais
     * UMA está no ecrã. Com os pesos que o `Inspiracao.tsx` tem medidos
     * (105,3 KB a 1200 px em AVIF), são 1 158 KB antes de a página servir
     * para alguma coisa — 6,2 s num 4G de 1,5 Mbps —, e a capa que o casal
     * está a ver fica em fila atrás de dez fotografias a quinze mil píxeis
     * de distância.
     *
     * Este caso desenha DOIS boards, que é o mínimo para a diferença
     * existir.
     *
     * ── E DEPOIS O NÚMERO FOI A ZERO ──────────────────────────────────
     *
     * O 4 corrigiu a CONTAGEM mas manteve a premissa de que as primeiras
     * fotografias da grelha se vêem cedo. Não se vêem: a ordem é capa →
     * apresentação → índice → serviços → cronograma → inspiração, e num
     * telemóvel a primeira de board está milhares de píxeis abaixo. As
     * quatro não estavam à vista — estavam a disputar a ligação com a capa.
     *
     * ── O QUE ESTE CASO DEIXOU DE CONSEGUIR PROVAR ────────────────────
     *
     * Com zero, contar por board e contar por documento dão o MESMO
     * resultado. Portanto este caso já não distingue as duas contas, e
     * dizer que distingue seria mentira.
     *
     * O que ele continua a fazer, e é o que interessa hoje, é reprovar se
     * VOLTAR a haver fotografias com pressa — seja por que conta for. E o
     * caso a seguir guarda a outra metade: que a máquina de contar por
     * documento continua lá, para o dia em que alguém queira voltar a
     * subir o número e precise dela correcta.
     */
    const b1: BoardParaEcra = { ...BOARD, chave: "b1", fotos: ["a", "b", "c", "a"] };
    const b2: BoardParaEcra = { ...BOARD, chave: "b2", titulo: "Jantar", fotos: ["b", "c", "a"] };
    render(<Inspiracao boards={[b1, b2]} fotosIniciais={FOTOS} token="tk" textos={T} />);

    const modos = [...document.querySelectorAll("button[aria-label]")].map((b) =>
      b.querySelector("img:last-of-type")?.getAttribute("loading"),
    );
    expect(
      modos.filter((m) => m === "eager").length,
      "voltou a haver fotografias de board com pressa, em dois boards",
    ).toBe(0);
    // E as do segundo board — todas elas — esperam pela vez delas.
    const doSegundo = [...document.querySelectorAll("section")]
      .slice(1)
      .flatMap((sec) => [...sec.querySelectorAll("button[aria-label] img:last-of-type")])
      .map((i) => i.getAttribute("loading"));
    expect(doSegundo.length, "o segundo board não foi desenhado").toBeGreaterThan(0);
    expect(
      doSegundo.every((m) => m === "lazy"),
      "o segundo board ainda tem pressa",
    ).toBe(true);
  });
});

describe("a lupa", () => {
  it("sai da secção e vai para o corpo do documento — senão não tapa o ecrã", () => {
    /**
     * ── O DEFEITO, MEDIDO ─────────────────────────────────────────────────
     *
     * Um elemento `position: fixed` é medido pelo ECRÃ — excepto se algum
     * antepassado tiver um `transform`, e aí passa a ser medido por esse
     * antepassado. A secção da Inspiração leva `prop-chega`, que a faz subir
     * ao entrar. Essa animação ACABA em `transform: none`, mas corre com
     * preenchimento `both` sobre uma linha de tempo de scroll — e o valor
     * calculado no fim é `translateY(0)`, que não é `none`. Um `transform` a
     * zero continua a ser um `transform`.
     *
     * Reproduzido num Chromium a 390×780 com a mesma regra de CSS: com uma
     * fotografia à vista e o dedo em cima dela, o diálogo media de 270 a
     * 3202 px num ecrã de 0 a 780 — o tamanho da SECÇÃO. Não tapava o ecrã.
     * Um casal que carregasse numa fotografia via meio ecrã preto com a
     * fotografia fora dele.
     *
     * O portal resolve-o pela raiz: a lupa passa a ser filha do `<body>`, onde
     * não há antepassado nenhum com `transform`. É o que a galeria pública
     * desta casa já faz. A partir daqui, qualquer animação nova numa secção da
     * proposta é inofensiva para ela — que é o ponto, porque vêm aí mais.
     */
    const { container } = desenhar();
    abrirPrimeira();
    const d = lupa();
    expect(d, "a lupa não abriu").not.toBeNull();
    expect(
      container.contains(d),
      "a lupa voltou para dentro da árvore da secção — um `transform` num " +
        "antepassado volta a fazê-la deixar de tapar o ecrã",
    ).toBe(false);
    expect(d?.parentElement, "a lupa tem de ser filha do corpo do documento").toBe(document.body);
  });

  it("abre no ORIGINAL — é o único sítio onde os pixéis todos valem os bytes", () => {
    desenhar();
    expect(lupa()).toBeNull();
    abrirPrimeira();
    expect(lupa()).not.toBeNull();
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/a");
  });

  it("as setas do teclado andam, e não saem do board", () => {
    desenhar();
    abrirPrimeira();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/b");
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/a");
    // Na primeira, a seta para trás não faz nada — e não rebenta.
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/a");
  });

  it("Escape fecha", () => {
    desenhar();
    abrirPrimeira();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(lupa()).toBeNull();
  });

  it("o gesto para o lado anda; um dedo a rolar não muda de fotografia", () => {
    desenhar();
    abrirPrimeira();
    const d = lupa()!;
    // Arrastar para a ESQUERDA = fotografia seguinte.
    fireEvent.touchStart(d, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(d, { changedTouches: [{ clientX: 200, clientY: 205 }] });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/b");
    // CONTROLO POSITIVO da recusa: um movimento sobretudo VERTICAL — rolar —
    // não pode mudar de fotografia, mesmo passando a distância mínima.
    fireEvent.touchStart(d, { touches: [{ clientX: 300, clientY: 500 }] });
    fireEvent.touchEnd(d, { changedTouches: [{ clientX: 220, clientY: 100 }] });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/b");
    // E um toque trémulo, abaixo da distância mínima, também não.
    fireEvent.touchStart(d, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(d, { changedTouches: [{ clientX: 280, clientY: 202 }] });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/b");
  });

  it("o foco entra no diálogo e volta ao sítio de onde saiu", () => {
    desenhar();
    const botao = screen.getAllByRole("button", { name: /Ampliar/ })[0];
    botao.focus();
    fireEvent.click(botao);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: T.fechar }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(botao);
  });

  it("a página por baixo não rola enquanto a lupa está aberta", () => {
    desenhar();
    abrirPrimeira();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A NITIDEZ — dois tamanhos, e o navegador escolhe
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO: a grelha pedia SEMPRE a miniatura de 400 px. Num iPhone a fotografia
 * ocupa ~343 pontos e o ecrã tem três pixéis por ponto — pede ~1030. Era uma
 * imagem de 400 esticada duas vezes e meia, e ela viu-o: «essas imagens
 * parecem estar desfocadas, ou com pouca qualidade».
 *
 * Servir o original resolvia a nitidez e punha 120 MB numa página de 46
 * fotografias. A saída é uma terceira medida e um `srcset`.
 */
describe("a grelha oferece dois tamanhos", () => {
  it("o `srcset` traz a miniatura E a derivada intermédia, com as larguras", () => {
    desenhar();
    const img = screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!;
    expect(img.getAttribute("srcset")).toMatch(/400w/);
    expect(img.getAttribute("srcset")).toMatch(/1200w/);
  });

  it("a intermédia pede-se pelo id OPACO da foto, nunca por um caminho", () => {
    // A regra de sempre: uma rota que aceitasse caminhos serviria, com o token
    // de um casal, qualquer ficheiro da Biblioteca de Temas. O endereço que
    // ESTA página constrói leva o id do documento e mais nada — o caminho real
    // é resolvido do lado do servidor, a partir do token.
    desenhar();
    const img = screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!;
    const candidatos = (img.getAttribute("srcset") ?? "").split(",").map((c) => c.trim());
    const daRota = candidatos.find((c) => c.startsWith("/api/"));
    expect(daRota).toBe("/api/proposta/tk/foto/a?v=ma 1200w");
  });

  it("diz que largura a fotografia OCUPA — senão o navegador pede sempre a maior", () => {
    desenhar();
    // A SEGUNDA célula: a primeira é o respiro, que ocupa a largura toda e
    // por isso tem um `sizes` seu. Esta é uma célula da grelha.
    const img = screen.getAllByRole("button", { name: /Ampliar/ })[1].querySelector("img")!;
    expect(img.getAttribute("sizes")).toBe("(min-width: 640px) 46vw, 92vw");
  });

  it("depois de a primeira escolha falhar, o `srcset` SAI — e cai no degrau do meio", () => {
    // Senão o navegador voltava a escolher o candidato que acabou de falhar.
    desenhar();
    const img = () => screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!;
    fireEvent.error(img());
    expect(img().getAttribute("srcset")).toBeNull();
    /**
     * ── O PLANO B DEIXOU DE SER O ORIGINAL ────────────────────────────────
     *
     * Era `miniatura → original`, e o original numa caixa de 350 px são
     * 2 600 KB: 13,9 s num 4G de 1,5 Mbps, contra 0,56 s da derivada de
     * 1200 px. O degrau do meio existia e estava a ser saltado.
     *
     * Aqui a fotografia de teste não tem `media` assinada, portanto a
     * derivada é a rota que a fabrica — que é exactamente o que deve
     * acontecer nas fotografias anteriores ao bucket, ou seja nas propostas
     * antigas que estão nas caixas de correio dos casais.
     */
    expect(img().getAttribute("src")).toBe("/api/proposta/tk/foto/a?v=ma");
    // E só se ESTA também falhar é que se paga o ficheiro inteiro.
    fireEvent.error(img());
    expect(img().getAttribute("src")).toBe("orig/a");
  });
});

describe("quando as assinaturas morrem", () => {
  /**
   * O botão de voltar a pedir as assinaturas SÓ existe depois de alguma coisa
   * falhar. Sempre à vista, numa proposta de vinte mil euros, dizia ao casal
   * que o estúdio conta com isto avariar.
   */
  it("o botão não existe enquanto está tudo bem", () => {
    desenhar();
    expect(screen.queryByRole("button", { name: T.recarregarFotos })).toBeNull();
  });

  it("aparece quando uma célula desiste", () => {
    desenhar();
    const img = screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!;
    /**
     * TRÊS degraus, e não dois.
     *
     * A grelha deixou de cair da miniatura directamente para o original — o
     * ficheiro inteiro numa caixa de 350 px eram 13,9 s num 4G. Passa pela
     * derivada de 1200 px pelo caminho, portanto uma célula só desiste depois
     * de as TRÊS falharem: miniatura → 1200 px → original.
     *
     * Um teste que dispare dois erros não mede quem desistiu: mede quem ainda
     * está a tentar.
     */
    fireEvent.error(img);
    fireEvent.error(screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!);
    fireEvent.error(screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!);
    expect(screen.getByRole("button", { name: T.recarregarFotos })).toBeTruthy();
  });

  /**
   * ── E A CÉLULA DESAPARECE, EM SILÊNCIO ─────────────────────────────────
   *
   * Aqui havia um segundo botão, por célula, com o seu próprio rótulo. Palavras
   * dela, a olhar para uma proposta que já tinha seguido: «quatro barras
   * cinzentas com ícone de imagem quebrada onde devia estar a primeira foto. Um
   * cliente que veja isto conclui que a empresa é descuidada.»
   *
   * O aviso não desapareceu do produto — subiu para o pé da galeria, UMA vez,
   * que é onde serve: o caso comum é um separador aberto há seis horas com as
   * assinaturas caducadas, e um só botão resolve as vinte células de uma vez.
   */
  it("e a célula que desistiu SOME — nada de caixas cinzentas no mood board", () => {
    desenhar();
    const antes = screen.getAllByRole("button", { name: /Ampliar/ }).length;
    const cel = () => screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!;
    fireEvent.error(cel());
    fireEvent.error(cel());
    fireEvent.error(cel());
    expect(screen.getAllByRole("button", { name: /Ampliar/ }).length).toBe(antes - 1);
    expect(screen.queryByText(T.fotoFalhou)).toBeNull();
    expect(screen.queryByRole("button", { name: T.tentarDeNovo })).toBeNull();
  });

  it("o botão volta a pedi-las — e nunca manda um caminho ao servidor", async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({
        fotos: [{ id: "a", miniatura: "mini/a-nova", original: "orig/a-nova" }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    desenhar();
    // Provocar a falha, que é o que faz o botão existir.
    const cel = () => screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!;
    fireEvent.error(cel());
    fireEvent.error(cel());
    fireEvent.error(cel());
    fireEvent.click(screen.getByRole("button", { name: T.recarregarFotos }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe("/api/proposta/tk/fotos");
    // A regra: o cliente NUNCA nomeia um caminho. O pedido é o token e mais nada.
    expect(url).not.toContain("ref=");
    expect(url).not.toContain("path");
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("button", { name: /Ampliar/ })[0]
          .querySelector("img")
          ?.getAttribute("src"),
      ).toBe("mini/a-nova"),
    );
  });

  it("quando o servidor não serve, di-lo — em vez de não acontecer nada (A9-008)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    desenhar();
    const cel = () => screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!;
    fireEvent.error(cel());
    fireEvent.error(cel());
    fireEvent.error(cel());
    fireEvent.click(screen.getByRole("button", { name: T.recarregarFotos }));
    await waitFor(() => expect(screen.getByText(T.recarregarFalhou)).toBeTruthy());
    // E o botão continua lá, para tentar outra vez.
    expect(screen.getByRole("button", { name: T.recarregarFotos })).toBeTruthy();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS MOMENTOS DE RESPIRAÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «A capa (arco em azulejo) é a única imagem grande da página.
 * Devia haver mais momentos assim, a separar secções: uma foto a toda a
 * largura entre blocos.»
 */
describe("o respiro que abre cada secção", () => {
  /** A célula do respiro é a primeira da secção — vem antes do título. */
  const oRespiro = () => screen.getAllByRole("button", { name: /Ampliar/ })[0];

  it("vem ANTES do título — é ele que separa o bloco anterior deste", () => {
    desenhar();
    const titulo = screen.getByRole("heading", { name: "Cerimónia" });
    // `compareDocumentPosition`: o respiro está antes do título no documento.
    expect(oRespiro().compareDocumentPosition(titulo)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("ocupa a largura toda e tem tecto de altura", () => {
    // Uma foto ao alto a 1024 px de largura são 1500 px de altura: isso não é
    // um respiro, é um ecrã inteiro sem uma palavra.
    desenhar();
    expect(oRespiro().style.maxHeight).toBe("min(64vh, 560px)");
    expect(oRespiro().querySelector("img")?.getAttribute("sizes")).toBe(
      "(min-width: 1024px) 1024px, 100vw",
    );
  });

  it("a fotografia do respiro SAI da grelha — não se vê duas vezes", () => {
    desenhar();
    const fontes = screen
      .getAllByRole("button", { name: /Ampliar/ })
      .map((b) => b.querySelector("img")?.getAttribute("src"));
    expect(fontes).toEqual(["mini/a", "mini/b", "mini/c"]);
    // E o `mini/a` aparece UMA vez, não duas.
    expect(fontes.filter((f) => f === "mini/a")).toHaveLength(1);
  });

  it("é a que ela marcou como principal, quando marcou alguma", () => {
    desenhar({ ...BOARD, principal: 2 });
    expect(oRespiro().querySelector("img")?.getAttribute("src")).toBe("mini/c");
  });

  /**
   * Sem marca, o `destacada` devolve `null` — e essa decisão mantém-se para a
   * GRELHA. O que ela pediu aqui não foi um destaque: foi ar entre secções, em
   * TODAS. Sem marca, abre a primeira que resolve.
   */
  it("sem marca nenhuma, abre a primeira que resolve", () => {
    desenhar({ ...BOARD, fotos: ["semNada", "b", "c"] });
    // `semNada` não está no mapa: não resolve, e um respiro que desaparece
    // deixava o título encostado ao bloco anterior.
    expect(oRespiro().querySelector("img")?.getAttribute("src")).toBe("mini/b");
  });

  it("a lupa abre na fotografia certa a partir do respiro", () => {
    desenhar({ ...BOARD, principal: 2 });
    fireEvent.click(oRespiro());
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/c");
  });

  it("um board sem uma única foto resolvida não inventa respiro nenhum", () => {
    desenhar({ ...BOARD, fotos: ["semNada"] });
    expect(screen.queryAllByRole("button", { name: /Ampliar/ })).toHaveLength(0);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS COLUNAS ACABAM À MESMA ALTURA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «há buracos visíveis onde uma coluna acaba antes da outra».
 * E, posta a escolher entre a ordem de leitura e as colunas equilibradas —
 * porque numa página desenhada no servidor, sem JavaScript a medir o ecrã, é
 * uma coisa ou a outra: colunas equilibradas.
 *
 * A afirmação que vale por todas é a última: no telemóvel não se perde nada,
 * porque lá só há uma coluna e o `order` devolve a ordem dela.
 */
describe("as colunas da grelha", () => {
  /** As posições (1-based) de cada fotografia, pela ordem em que estão no HTML. */
  const posicoesNoHtml = () =>
    [...document.querySelectorAll("button[aria-label]")].map((b) =>
      Number(/(\d+) de/.exec(b.getAttribute("aria-label") ?? "")?.[1]),
    );

  it("uma fotografia salta de coluna para equilibrar — e é isso que se pediu", () => {
    // Duas altas seguidas iriam as duas para a mesma coluna se a arrumação
    // fosse alternada; com o equilíbrio, a segunda vai para a que está curta.
    desenhar({ ...BOARD, fotos: ["a", "b", "c", "a", "b", "c", "a", "b"] });
    // A ordem no HTML deixa de ser 1,2,3,4… — é essa a troca aceite.
    expect(posicoesNoHtml()).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("nenhuma fotografia se perde nem se repete na arrumação", () => {
    // O modo de falha de um empacotamento é deixar uma de fora ou pô-la duas
    // vezes, e as duas coisas passam despercebidas numa grelha de quarenta.
    desenhar({ ...BOARD, fotos: ["a", "b", "c", "a", "b", "c", "a", "b"] });
    expect([...posicoesNoHtml()].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   */
  it("no telemóvel, o `order` devolve a ordem dela", () => {
    // Abaixo de `sm` as colunas desaparecem (`display: contents`) e as
    // fotografias passam a ser irmãs. Sem o `order`, o telemóvel mostrava-as
    // pela ordem do empacotamento — que é uma perda paga sem nada em troca,
    // porque numa coluna só não há nada para equilibrar.
    desenhar({ ...BOARD, fotos: ["a", "b", "c", "a", "b", "c", "a", "b"] });
    const ordens = [...document.querySelectorAll("figure")].map((f) =>
      Number((f as HTMLElement).style.order),
    );
    // Cada fotografia leva a SUA posição, e não a da célula onde calhou.
    expect([...ordens].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(ordens).toEqual(posicoesNoHtml().map((n) => n - 1));
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TÍTULO NÃO FICA SOZINHO POR CIMA DO VAZIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A dona do negócio abriu a proposta a sério no telemóvel dela e mandou o que
 * viu: um RECTÂNGULO CINZENTO, sem fotografia nenhuma, com «Saída dos noivos»
 * escrito por cima.
 *
 * ── PORQUE É QUE A REDE QUE JÁ EXISTIA NÃO O APANHOU ──────────────────────
 *
 * O ficheiro já dizia a coisa certa, por extenso: «um título branco sobre nada
 * nenhum é o defeito que isto existe para não ter». Mas essa guarda é o
 * `respiro()`, que corre no servidor e pergunta se a fotografia TEM endereço.
 * Tinha. O que falhou foi o endereço, já com a página desenhada — uma
 * assinatura expirada, uma derivada por fabricar.
 *
 * Aí a célula desiste e devolve nada, e a faixa do título, que é IRMÃ dela e
 * não filha, continua desenhada: o véu escuro sobre o papel branco dá o
 * cinzento, e o nome por cima dele.
 *
 * Havia dois caminhos para o mesmo sítio e só um estava tapado.
 */
describe("quando a fotografia do momento falha depois de a página abrir", () => {
  /** O título como faixa branca sobre a fotografia. */
  const tituloSobreFoto = () =>
    [...document.querySelectorAll("h3")].find((h) => h.className.includes("text-white"));
  /** O mesmo título, a preto sobre o papel. */
  const tituloSobrePapel = () =>
    [...document.querySelectorAll("h3")].find((h) => h.className.includes("text-foreground/90"));

  it("começa com o nome por cima da fotografia, como foi desenhado", () => {
    desenhar();
    expect(tituloSobreFoto()?.textContent).toBe("Cerimónia");
    expect(tituloSobrePapel()).toBeUndefined();
  });

  it("e quando ela falha, o nome volta ao papel em vez de ficar sobre o vazio", async () => {
    desenhar();
    // A fotografia do momento — a primeira, a que abre a secção — rebenta.
    // DUAS vezes: a célula tem plano B (miniatura → original) e só desiste
    // depois de o segundo endereço também falhar.
    const doMomento = () => document.querySelector("img:not([aria-hidden])") as HTMLImageElement;
    expect(doMomento(), "não encontrei a fotografia do momento").toBeTruthy();
    fireEvent.error(doMomento());
    fireEvent.error(doMomento());
    fireEvent.error(doMomento());

    await waitFor(() => {
      expect(tituloSobrePapel()?.textContent, "o nome tinha de voltar a preto sobre o papel").toBe(
        "Cerimónia",
      );
    });
    expect(
      tituloSobreFoto(),
      "ficou uma faixa de título branca por cima de coisa nenhuma — é este o defeito",
    ).toBeUndefined();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RITMO ENTRE MOOD BOARDS — «os buracos brancos», palavras dela
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO num 390×844, com oito boards de tamanhos diferentes. Duas coisas
 * estavam erradas, e são diferentes uma da outra:
 *
 * 1. O intervalo entre dois boards era de 96 px, e o intervalo entre dois
 *    CAPÍTULOS do documento — «Serviços» e «Orçamento Proposto» — é de 64.
 *    Um board é uma parte DENTRO do capítulo «Inspiração»; separá-lo do
 *    vizinho com vez e meia o que separa dois capítulos diz ao olho que ali
 *    acabou coisa maior do que acabou.
 *
 * 2. Num board cuja ÚNICA fotografia é o respiro, o intervalo era 132 e não
 *    96. Os 36 px a mais eram o `mb-9` do respiro a separá-lo de uma grelha
 *    VAZIA. Um ritmo com um intervalo diferente dos outros não é um ritmo.
 */
describe("o ritmo entre mood boards", () => {
  /** Um board de uma fotografia só: a do respiro. É o caso que media 132. */
  const SO_O_RESPIRO: BoardParaEcra = { ...BOARD, chave: "so-um", fotos: ["a"] };

  it("um board de uma só fotografia não desenha grelha nenhuma", () => {
    desenhar(SO_O_RESPIRO);
    // A grelha é o `flex` que segura as colunas. Sem fotografias fora do
    // respiro não há nada para ela segurar — e uma caixa vazia com margem é
    // exactamente o buraco que isto existe para não ter.
    const botoes = screen.getAllByRole("button", { name: /Ampliar/ });
    expect(botoes).toHaveLength(1);
    const grelha = document.querySelector(".flex.flex-col.gap-4");
    expect(grelha, "a grelha vazia continua a ser desenhada").toBeNull();
  });

  it("CONTROLO POSITIVO: com fotografias fora do respiro, a grelha existe", () => {
    // Sem isto, um selector errado dava `null` nos dois casos e o teste acima
    // passava sem provar nada.
    desenhar();
    expect(document.querySelector(".flex.flex-col.gap-4")).not.toBeNull();
  });

  it("o afastamento até à grelha é da GRELHA, não do respiro", () => {
    // Estava no respiro (`mb-9`), e por isso sobrava quando não havia grelha.
    desenhar();
    const respiro = screen.getAllByRole("button", { name: /Ampliar/ })[0];
    const caixaDoRespiro = respiro.closest("div");
    expect(caixaDoRespiro?.className, "o respiro voltou a levar margem de baixo").not.toMatch(
      /\bmb-\d/,
    );
    expect(document.querySelector(".flex.flex-col.gap-4")?.className).toMatch(/\bmt-9\b/);
  });
});

/**
 * A hierarquia, lida do CÓDIGO dos dois ficheiros.
 *
 * O teste acima mede uma árvore desenhada; este mede a REGRA, e é a que se
 * desfaz sem ninguém dar por isso — basta alguém subir um número achando que
 * «fica com mais ar». O intervalo entre duas partes de um capítulo não pode
 * passar o intervalo entre dois capítulos.
 */
describe("um mood board é uma parte do capítulo, não um capítulo", () => {
  const RAIZ = process.cwd();
  const AQUI = "src/app/[lang]/(privado)/proposta/[token]";
  const ler = (f: string) => readFileSync(join(RAIZ, `${AQUI}/${f}`), "utf8");
  /**
   * O degrau de `margin-top` da primeira `<section>` de um ficheiro.
   *
   * Lê a ETIQUETA DE ABERTURA inteira e não um `className="…"`: o
   * `Documento.tsx` escreve o dele num template literal, e uma expressão
   * regular à espera de aspas devolvia `null` — que se compara com tudo sem
   * reclamar. Foi o controlo positivo aqui em baixo que o apanhou.
   *
   * O `(?<![\w:-])` exclui as variantes: sem ele, o `first:mt-6` da
   * Inspiração passava por ser o afastamento normal.
   */
  const degrau = (fonte: string) => {
    const i = fonte.indexOf("<section");
    if (i < 0) return null;
    const etiqueta = fonte.slice(i, fonte.indexOf(">", i));
    const mt = etiqueta.match(/(?<![\w:-])mt-(\d+)\b/);
    const sm = etiqueta.match(/\bsm:mt-(\d+)\b/);
    return { mt: mt ? Number(mt[1]) : null, sm: sm ? Number(sm[1]) : null };
  };

  it("CONTROLO POSITIVO: os dois números foram mesmo lidos", () => {
    // Uma leitura falhada devolve `null`, e `null` compara-se com tudo sem
    // reclamar — era o silêncio que este controlo impede.
    expect(degrau(ler("Documento.tsx"))).toEqual({ mt: 16, sm: 24 });
    expect(degrau(ler("Inspiracao.tsx"))).toEqual({ mt: 12, sm: 16 });
  });

  it("o intervalo entre boards não passa o intervalo entre capítulos", () => {
    const capitulo = degrau(ler("Documento.tsx"))!;
    const board = degrau(ler("Inspiracao.tsx"))!;
    expect(board.mt, `board ${board.mt} > capítulo ${capitulo.mt} no telemóvel`).toBeLessThan(
      capitulo.mt!,
    );
    expect(board.sm, `board ${board.sm} > capítulo ${capitulo.sm} no ecrã largo`).toBeLessThan(
      capitulo.sm!,
    );
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM FICHEIRO POR TAMANHO: A DE 1200 JÁ NÃO SE OFERECE EM AVIF (14/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A AVIF de 1200 era a mesma fotografia, ao mesmo tamanho, num segundo
 * ficheiro (`derivadas.ts`, «E JÁ NÃO HÁ AVIF AO LADO»), e a limpeza vai
 * apagá-la. Um `<source type="image/avif">` para um ficheiro apagado dá 404 e o
 * navegador NÃO recua para o `<img>`: a célula ficava vazia. Por isso a página
 * não a oferece nem quando um objecto guardado de antes ainda traz o campo.
 */
describe("a de 1200 já não se oferece em AVIF", () => {
  it("nem com um `mediaAvif` velho no objecto: só o `<img>`, que existe sempre", () => {
    const velho = { ...FOTOS.a, media: "media/a", mediaAvif: "avif/a" } as FotoDaProposta;
    render(
      <Inspiracao
        boards={[BOARD]}
        fotosIniciais={{ a: velho, b: FOTOS.b, c: FOTOS.c }}
        token="tk"
        textos={T}
      />,
    );
    expect(document.querySelectorAll('source[type="image/avif"]')).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain("avif/a");
    // CONTROLO POSITIVO: a fotografia continua desenhada, pela miniatura.
    expect(document.querySelector('img[src="mini/a"]')).not.toBeNull();
  });
});

describe("a fotografia move-se enquanto passa", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * «ANIMAÇÕES PELAS FOTOS, À MEDIDA QUE ELA IA ANDANDO PARA BAIXO»
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O gesto de chegada dura 860 ms e acaba. Os mood boards são 5 900 px de
   * rolagem em que, até aqui, nada se movia. A deriva é a única coisa que
   * trabalha o percurso todo.
   *
   * O que este ficheiro guarda são as TRÊS decisões que custaram a encontrar,
   * cada uma medida num Chromium verdadeiro. Nenhuma é de gosto.
   */
  const CSS = readFileSync("src/app/globals.css", "utf8");
  const BLOCO = CSS.slice(
    CSS.indexOf("A FOTOGRAFIA MOVE-SE ENQUANTO PASSA"),
    CSS.indexOf('[data-sobe="respiro"]'),
  );

  it("a linha de tempo nasce na MOLDURA, e não na fotografia", () => {
    /**
     * `animation-timeline: view()` na própria `<img>` media ZERO. MEDIDO: o
     * progresso ficava cravado em 0,500 em toda a travessia e a deriva era de
     * 0,00 px.
     *
     * Não era o `content-visibility` (desliguei-o num ensaio e ficou igual)
     * nem a duração do atalho (forcei `auto` e ficou igual). É o
     * `overflow: hidden` da moldura: isso faz dela um CONTENTOR DE SCROLL, e o
     * `view()` mede a travessia dentro do contentor mais próximo — dentro da
     * moldura, a fotografia não se move nunca.
     *
     * Com o nome declarado na `<figure>`, que atravessa mesmo o ecrã: o
     * progresso passou a 0,000 → 0,764 e a deriva a 6,18 px.
     */
    expect(BLOCO, "a moldura deixou de declarar a linha de tempo").toMatch(
      /\.foto-inteira \{[^}]*view-timeline-name:\s*--foto-passa/,
    );
    expect(BLOCO, "a fotografia voltou a medir a travessia dentro da moldura").not.toMatch(
      /\.foto-deriva \{[^}]*animation-timeline:\s*view\(\)/,
    );
    expect(BLOCO).toMatch(/\.foto-deriva \{[^}]*animation-timeline:\s*--foto-passa/);
  });

  it("a folga vai em `transform` e a deriva em `translate` — o `scale` fica livre", () => {
    /**
     * O zoom ao passar o rato desta grelha é a utilidade
     * `group-hover:scale-[1.02]`, que escreve na propriedade `scale`. Uma
     * folga escrita ali passa-lhe por cima sem dar erro nenhum.
     *
     * As três propriedades são independentes e compõem-se: `transform` dá a
     * folga, `translate` deriva, `scale` fica para o rato.
     */
    const regra = /\.foto-deriva \{([^}]*)\}/.exec(BLOCO)?.[1] ?? "";
    expect(regra, "a folga desapareceu").toContain("transform: scale(");
    expect(regra, "a folga voltou a escrever na propriedade do zoom do rato").not.toMatch(
      /(^|;|\s)scale:/,
    );
    const quadros = /@keyframes foto-deriva-kf \{([\s\S]*?)\n {4}\}/.exec(BLOCO)?.[1] ?? "";
    expect(quadros, "a deriva voltou para cima do `transform`").not.toContain("transform");
    expect(quadros).toContain("translate:");
  });

  it("e não corre onde não pode, nem para quem pediu menos movimento", () => {
    /**
     * A terceira razão por que a `prop-chega` foi retirada continua de pé:
     * onde a linha de tempo do scroll não existe, não há movimento nenhum.
     * Numa DECORAÇÃO isso é aceitável — a fotografia fica quieta e a proposta
     * lê-se na mesma. Num texto escondido seria uma proposta em branco.
     */
    expect(BLOCO, "a deriva deixou de estar atrás do `@supports`").toMatch(
      /@supports \(animation-timeline: view\(\)\)/,
    );
    expect(BLOCO, "a deriva deixou de respeitar quem pediu menos movimento").toMatch(
      /@media \(prefers-reduced-motion: no-preference\)/,
    );
  });
});

describe("a capa mede-se pela página, e não pela sua travessia", () => {
  /**
   * A capa está no topo: quando o casal abre a proposta, ela JÁ está no ecrã,
   * e a travessia dela começou antes de haver alguém a olhar.
   *
   * MEDIDO com a capa a usar `view()` como as outras, num iPhone 13:
   *
   *     scrollY   0   progresso 0,599   (já ia em 60% do gesto)
   *     scrollY 300   progresso 1,000
   *     deriva visível ... 2,44 px — menos de metade
   *
   * Com a linha de tempo da PÁGINA, que arranca em zero quando a página
   * arranca em zero:
   *
   *     scrollY   0   progresso 0,000
   *     scrollY 600   progresso 0,904
   *     deriva ........... 5,48 px
   */
  const CSS = readFileSync("src/app/globals.css", "utf8");
  const BLOCO = CSS.slice(
    CSS.indexOf("A FOTOGRAFIA MOVE-SE ENQUANTO PASSA"),
    CSS.indexOf('[data-sobe="respiro"]'),
  );

  it("a capa tem a linha de tempo da página; as do meio do documento a sua", () => {
    const capa = /\.foto-deriva--topo \{([^}]*)\}/.exec(BLOCO)?.[1] ?? "";
    expect(capa, "a capa ficou sem linha de tempo própria").toContain("scroll(root block)");
    expect(capa, "a capa deixou de arrancar no princípio da página").toMatch(
      /animation-range:\s*0 100vh/,
    );
    expect(BLOCO, "as fotografias do meio deixaram de se medir pela sua travessia").toMatch(
      /\.foto-deriva \{[^}]*animation-timeline:\s*--foto-passa/,
    );
  });
});
