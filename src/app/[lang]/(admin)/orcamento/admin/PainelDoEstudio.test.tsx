// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
/* As medidas que o jsdom não tem — o mesmo duplo que o `NavEstudio.test.tsx`
   usa. O caminho é relativo porque o `@/` desta casa aponta para `src/`. */
import { fingirDisposicao, reporDisposicao } from "../../../../../../test/disposicao-fingida";
import PainelDoEstudio, { type PaginaParaOPainel } from "./PainelDoEstudio";
import {
  ESPERA_MS,
  EM_PARALELO,
  TENTATIVAS,
  esquecerPaginasGuardadas,
  paginasAPreparar,
} from "./usePaginaReal";
import { CORTES } from "./ui/adaptativo";
import type { MoodBoard } from "@/lib/proposal-doc";
import { MARCA } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A TERCEIRA ZONA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Uma pré-visualização grande e fixa à direita, no espaço hoje vazio.»
 *
 * As duas afirmações que aqui se prendem são as que custam dinheiro se
 * falharem: o painel NÃO EXISTE onde não cabe (e por isso não se paga a
 * desenhá-lo), e o que ele mostra é a página que ela está a editar.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  esquecerPaginasGuardadas();
});

/**
 * Um `matchMedia` que responde a partir de uma largura de verdade, e não de um
 * `true`/`false` combinado.
 *
 * A versão anterior dizia sempre que sim ou sempre que não, portanto o NÚMERO
 * do limiar nunca era afirmado — e era o número que estava errado: a medida
 * dizia 1536 e o corte da casa para «há espaço para um painel lateral» é o
 * `CORTES.largo`, 1440. Entre os dois o painel cabia e não aparecia.
 */
const aJanelaTem = (px: number) =>
  vi.stubGlobal("matchMedia", (q: string) => {
    const min = /min-width:\s*(\d+)px/.exec(q);
    return {
      matches: min ? px >= Number(min[1]) : false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PERGUNTA MUDOU DE SÍTIO, E ESTE FICHEIRO COM ELA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estes casos mediam a JANELA (`matchMedia`), porque era à janela que o painel
 * perguntava. Era essa a avaria: MEDIDO num Chromium, no painel que abre a
 * partir do cartão de um cliente, a janela tinha 2000 px e a caixa onde este
 * `<aside>` aterra tinha 712 — a coluna onde ela escreve ficava com 136 px.
 *
 * A decisão passou para quem desenha a fila, que é o único que sabe quanto ela
 * mede, e chega aqui já respondida na propriedade `cabe`. Os casos ficam, com a
 * mesma intenção: o que se guarda é que, quando NÃO cabe, não se desenha NADA —
 * nem escondido.
 */
const largura = (cabe: boolean) => aJanelaTem(cabe ? CORTES.largo : CORTES.largo - 1);

const board = (over: Partial<MoodBoard> = {}): MoodBoard =>
  ({ title: "Cerimónia", images: ["p/a.jpg", "p/b.jpg"], ...over }) as MoodBoard;

const paginas: PaginaParaOPainel[] = [
  { bi: 0, board: board({ title: "Cerimónia" }) },
  { bi: 1, board: board({ title: "Jantar" }) },
];

const desenhar = (over: Partial<React.ComponentProps<typeof PainelDoEstudio>> = {}) =>
  render(
    <PainelDoEstudio
      /* A decisão deixou de ser deste ficheiro: quem desenha a fila é que sabe
         quanto ela mede. Aqui diz-se «cabe» porque é o caso que se quer ver
         desenhado; o caso do «não cabe» tem o seu próprio teste no estúdio. */
      cabe
      paginas={paginas}
      urls={{ "p/a.jpg": "u/a", "p/b.jpg": "u/b" }}
      originais={{}}
      aspetos={{ "p/a.jpg": 1.5, "p/b.jpg": 0.7 }}
      onSaltar={() => {}}
      {...over}
    />,
  );

describe("o painel só existe onde cabe", () => {
  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   */
  it("num ecrã estreito não desenha NADA — nem escondido", () => {
    // Um `hidden 2xl:block` esconde com CSS e o React desenha na mesma. Medido:
    // numa proposta no tecto do gerador isso chegou para o estúdio deixar de
    // responder. Quem trabalha num portátil não pode pagar o painel que não tem.
    const { container } = desenhar({ cabe: false });
    expect(container.firstChild).toBeNull();
  });

  it("quando cabe, desenha", () => {
    desenhar({ cabe: true });
    expect(screen.getByRole("complementary", { name: /o que vai sair/i })).toBeTruthy();
  });

  /**
   * ── O LIMIAR É UM NÚMERO SÓ, E É O DA CASA ─────────────────────────────
   *
   * Havia dois a discordar: a medida em JavaScript dizia 1536 e o `<aside>`
   * trazia `hidden 2xl:block`. Entre 1440 e 1536 — que é o portátil dela —
   * o painel montava-se (pagava-se o desenho das páginas) e ficava escondido
   * por CSS: o pior dos dois mundos.
   */
  it("aparece quando quem desenha a fila diz que cabe", () => {
    desenhar({ cabe: true });
    expect(screen.getByRole("complementary", { name: /o que vai sair/i })).toBeTruthy();
  });

  it("e um píxel abaixo do limiar não desenha NADA — nem escondido", () => {
    /* O limiar deixou de viver aqui: é `LARGURA_MINIMA_DA_FILA`, no
       `ProposalStudio`, medido na FILA e não na janela. O caso que este ficheiro
       guarda é o que continua a ser dele: com um «não cabe», não sai nada. */
    const { container } = desenhar({ cabe: false });
    expect(container.firstChild).toBeNull();
  });

  it("a 1440 não sobra CSS a escondê-lo — quem decide é a montagem", () => {
    // Um `hidden … 2xl:block` no `<aside>` era a segunda resposta à mesma
    // pergunta, e a errada: esconder por CSS é o que este ficheiro existe para
    // NÃO fazer. Quando o painel é desenhado, é porque cabe.
    desenhar({ cabe: true });
    const painel = screen.getByRole("complementary", { name: /o que vai sair/i });
    expect(painel.className.split(/\s+/)).not.toContain("hidden");
    expect(painel.className).not.toMatch(/\b(sm|md|lg|xl|2xl):/);
  });

  it("sem resposta nenhuma sobre a largura, não rebenta — não desenha", () => {
    // Acontece no servidor e em ambientes de teste. Um painel que rebentasse
    // por não saber a largura era pior do que não haver painel. O `cabe` por
    // omissão do lado de quem desenha a fila é `false` enquanto não houver
    // medida — «ainda não sei» lê-se como «não cabe», que é o lado seguro.
    vi.stubGlobal("matchMedia", undefined);
    const { container } = desenhar({ cabe: false });
    expect(container.firstChild).toBeNull();
  });
});

describe("o que o painel mostra", () => {
  /**
   * ── DOIS NÚMEROS COM O MESMO NOME ────────────────────────────────────────
   *
   * Palavras dela: «a contagem tem de bater certo».
   *
   * Este painel conta as páginas de INSPIRAÇÃO — as que mudam com o que ela faz
   * nesta secção —, e a vista de conjunto ao lado conta as folhas do DOCUMENTO.
   * Contarem coisas diferentes é de propósito; chamarem-lhes as duas «páginas»
   * é que punha dois números a discordar sobre a mesma proposta.
   */
  it("a inspiração que está a ser editada, e diz qual é de quantas", () => {
    largura(true);
    desenhar({ activa: 1 });
    expect(screen.getByText(/Inspiração 2 de 2/)).toBeTruthy();
    // E não se chama «página», que é o que a vista de conjunto conta.
    expect(screen.queryByText(/Página 2 de 2/)).toBeNull();
  });

  it("sem página activa, mostra a primeira em vez de nada", () => {
    // Abrir o estúdio e ver o painel vazio até tocar num board era um painel
    // que parece avariado.
    largura(true);
    desenhar();
    expect(screen.getByText(/Inspiração 1 de 2/)).toBeTruthy();
  });

  it("conta as inspirações ao vivo, e diz que é isso que conta", () => {
    largura(true);
    desenhar();
    expect(screen.getByText("2 inspirações")).toBeTruthy();
  });

  it("em «Todas», cada página leva ao sítio dela no editor", async () => {
    largura(true);
    const saltos: number[] = [];
    const user = userEvent.setup();
    desenhar({ onSaltar: (bi) => saltos.push(bi) });
    await user.click(screen.getByRole("tab", { name: "Todas" }));
    await user.click(screen.getByRole("button", { name: /Ir para a página 2: Jantar/ }));
    expect(saltos).toEqual([1]);
  });

  it("sem páginas nenhumas, diz o que vai acontecer em vez de ficar vazio", () => {
    largura(true);
    desenhar({ paginas: [] });
    expect(screen.getByText(/Ainda não há páginas de inspiração/i)).toBeTruthy();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS SEPARADORES DESTE PAINEL TROCAVAM DE GOLPE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Esta barra («Esta página» / «Todas») é a única do estúdio escrita à mão, fora
 * do `ui/Segmented.tsx` — e era a única sem o gesto que ele tem. O botão activo
 * mudava de cor nos 120 ms do `ESTADO`, não havia marca nenhuma a deslizar de
 * um separador para o outro, e o painel por baixo trocava no mesmo fotograma.
 *
 * ── O QUE SE PROVA AQUI, E O QUE SE PROVA NUM BROWSER ─────────────────────
 *
 * Aqui: que a marca EXISTE, que é uma só, que se mede pelo separador certo,
 * que usa a constante da casa (`MARCA`) em vez de um segundo tempo escrito
 * outra vez, e que o painel que chega traz a `.view-in` num NÓ NOVO — que é a
 * parte que se parte sem ninguém dar por isso (com o nó reaproveitado a classe
 * fica lá e a animação nunca mais corre).
 *
 * Onde a marca PÁRA são píxeis, e píxeis não se fingem: o jsdom não faz
 * disposição. As medidas daqui são declaradas (`test/disposicao-fingida.ts`), a
 * mesma receita do `NavEstudio.test.tsx`.
 */
describe("a barra de separadores do painel", () => {
  /**
   * Um `ResizeObserver` que se pode mandar disparar. O do `vitest.setup.ts` é
   * inerte de propósito — sem disposição não há redimensionamento nenhum —, mas
   * é ele que manda a marca remedir-se, e sem o poder disparar não havia como
   * pôr as medidas nos botões ANTES da medida. Um duplo que se controla prova,
   * de passagem, que a ligação ao observador existe.
   */
  const remedir: Array<() => void> = [];
  function fingirObservadorDeTamanho() {
    remedir.length = 0;
    class ObservadorDeTamanho {
      constructor(private aoMudar: ResizeObserverCallback) {
        remedir.push(() => this.aoMudar([], this as unknown as ResizeObserver));
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ObservadorDeTamanho);
  }

  /** Desenha o painel com as duas abas já medidas, lado a lado. */
  async function desenharMedido() {
    fingirObservadorDeTamanho();
    fingirDisposicao();
    const vista = desenhar();
    medirAsAbas();
    await act(async () => {
      for (const f of remedir) f();
      await new Promise((r) => setTimeout(r, 0));
    });
    return vista;
  }

  /** As medidas de cada separador, declaradas depois de ele existir. */
  function medirAsAbas() {
    const abas = screen.getAllByRole("tab");
    let x = 2;
    for (const b of abas) {
      const el = b as HTMLElement;
      el.dataset.x = String(x);
      el.dataset.y = "2";
      el.dataset.w = "150";
      el.dataset.h = "26";
      x += 154;
    }
  }

  /** O fotograma seguinte ao da primeira medida — o primeiro não anda. */
  async function passarUmFotograma() {
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  const barra = () => screen.getByRole("tablist", { name: "O que mostrar" });
  const marcas = () => barra().querySelectorAll<HTMLElement>(':scope > [aria-hidden="true"]');

  afterEach(() => {
    reporDisposicao();
  });

  it("tem UMA marca, e está onde o separador activo está", async () => {
    await desenharMedido();
    expect(marcas(), "a barra troca de separador sem marca nenhuma a deslizar").toHaveLength(1);
    const activa = screen.getByRole("tab", { name: "Esta página" }) as HTMLElement;
    expect(marcas()[0].style.translate).toBe(`${activa.dataset.x}px ${activa.dataset.y}px`);
    expect(marcas()[0].style.width).toBe(`${activa.dataset.w}px`);
    expect(marcas()[0].style.height).toBe(`${activa.dataset.h}px`);
  });

  it("e muda de sítio quando se muda de separador", async () => {
    await desenharMedido();
    const user = userEvent.setup();
    await act(async () => {
      await user.click(screen.getByRole("tab", { name: "Todas" }));
    });
    // A lista mudou de forma (a `chave` do medidor é a vista): remedir é o que
    // o browser faria sozinho.
    medirAsAbas();
    await act(async () => {
      for (const f of remedir) f();
      await new Promise((r) => setTimeout(r, 0));
    });
    const activa = screen.getByRole("tab", { name: "Todas" }) as HTMLElement;
    expect(marcas()[0].style.translate).toBe(`${activa.dataset.x}px ${activa.dataset.y}px`);
  });

  it("e ANDA — com a constante da casa, não com um tempo escrito outra vez", async () => {
    await desenharMedido();
    await passarUmFotograma();
    const classes = marcas()[0].className.split(/\s+/);
    // O nome deste teste diz «com a constante da casa, não com um tempo escrito
    // outra vez» — e ele próprio escrevia o tempo outra vez: `250ms` copiado
    // para aqui. No dia em que a `MARCA` passou para o degrau `quick` do
    // documento, o que chumbou foi a cópia, não o componente. Agora compara-se
    // com a constante, que é o que a frase sempre quis dizer.
    for (const classe of MARCA.split(/\s+/)) expect(classes).toContain(classe);
  });

  it("o primeiro fotograma não anda — a marca não desliza do canto ao abrir", async () => {
    fingirObservadorDeTamanho();
    fingirDisposicao();
    desenhar();
    medirAsAbas();
    await act(async () => {
      for (const f of remedir) f();
    });
    expect(marcas(), "sem marca não há primeiro fotograma nenhum para medir").toHaveLength(1);
    expect(marcas()[0].className).not.toContain("motion-safe:transition-");
  });

  it("nunca há dois fundos brancos — o do botão sai quando a marca chega", async () => {
    await desenharMedido();
    expect(
      screen.getByRole("tab", { name: "Esta página" }).className.split(/\s+/),
      "o separador activo ficou com fundo branco POR BAIXO da marca branca",
    ).not.toContain("bg-[var(--bo-surface)]");
  });

  it("e nunca há nenhum — sem medida, o fundo do botão é a rede", () => {
    // CONTROLO POSITIVO, e é o que impede que a correcção seja «tirar o fundo».
    // Sem disposição — o servidor, e o fotograma antes da primeira medida — não
    // há marca nenhuma, e o separador activo tem de continuar a ver-se.
    desenhar();
    expect(marcas(), "houve marca sem disposição nenhuma para a medir").toHaveLength(0);
    expect(
      screen.getByRole("tab", { name: "Esta página" }).className.split(/\s+/),
      "sem marca medida, o separador activo ficou sem se distinguir",
    ).toContain("bg-[var(--bo-surface)]");
  });

  it("e uma medida de tamanho ZERO conta como nenhuma — o fundo do botão fica", async () => {
    /**
     * ── O QUE ESTE CASO EXISTE PARA IMPEDIR ───────────────────────────────
     *
     * O medidor (`ui/useMarcaQueAnda.ts`) só rejeitava o `offsetParent` nulo:
     * uma caixa de 0×0 — um antepassado com `content-visibility: hidden`, um
     * ramo ainda por dispor — passava por marca válida. E aqui isso é pior do
     * que uma marca invisível: o separador activo LARGA o seu fundo branco no
     * instante em que há marca (é o caso mesmo acima). Com uma marca que existe
     * e não pinta nada, ele ficava sem marca E sem fundo, ou seja
     * indistinguível dos outros — o contrário do que a barra serve para dizer.
     *
     * É a regra que o `Segmented` já tinha (`!activo.offsetWidth`), e o
     * medidor passou a ter nos dois eixos.
     */
    fingirObservadorDeTamanho();
    fingirDisposicao();
    desenhar();
    for (const b of screen.getAllByRole("tab")) {
      const el = b as HTMLElement;
      el.dataset.x = "2";
      el.dataset.y = "2";
      el.dataset.w = "0";
      el.dataset.h = "0";
    }
    await act(async () => {
      for (const f of remedir) f();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(marcas(), "uma caixa de 0×0 passou por marca").toHaveLength(0);
    expect(
      screen.getByRole("tab", { name: "Esta página" }).className.split(/\s+/),
      "o separador activo ficou sem marca E sem fundo — invisível na sua própria barra",
    ).toContain("bg-[var(--bo-surface)]");
  });

  it("o painel que chega apresenta-se — e num nó NOVO, para a animação recomeçar", async () => {
    // Um `<div>` reaproveitado ficava com a `.view-in` colada e a animação
    // corria uma vez só, na primeira. É o defeito que não se vê em captura
    // nenhuma: a classe está lá, e não faz nada.
    const user = userEvent.setup();
    desenhar();
    const antes = document.querySelector(".view-in");
    expect(antes, "o painel troca de conteúdo sem se apresentar").toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Todas" }));
    const depois = document.querySelector(".view-in");
    expect(depois).toBeTruthy();
    expect(depois, "o nó foi reaproveitado — a `.view-in` fica colada e nunca mais corre").not.toBe(
      antes,
    );
  });
});

describe("A1 — a página REAL, pedida ao servidor", () => {
  const doc = {
    clientNames: "TESTE Ana & TESTE Rui",
    eventType: "Casamento",
    coverImages: [],
    moodBoards: [board({ title: "Cerimónia" }), board({ title: "Jantar" })],
  } as unknown as React.ComponentProps<typeof PainelDoEstudio>["doc"];

  const respostaWebp = (ok = true) =>
    vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok,
      status: ok ? 200 : 500,
      headers: new Headers({ "X-Paginas": "14" }),
      blob: async () => new Blob(["WEBP"], { type: "image/webp" }),
    }));

  const comUrls = () => {
    let k = 0;
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: () => `blob:pagina-${++k}`,
        revokeObjectURL: () => {},
      }),
    );
  };

  it("sem pedido (`quoteId`), não pede nada — fica a aproximação de sempre", async () => {
    vi.useFakeTimers();
    const f = respostaWebp();
    vi.stubGlobal("fetch", f);
    desenhar({ doc, activa: 0 });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(f).not.toHaveBeenCalled();
    expect(screen.queryByText(/Aproximação/)).toBeNull();
    vi.useRealTimers();
  });

  it("a primeira página pede-se LOGO — sem pausa, e nunca uma aproximação (9/11)", async () => {
    // Ela, a 9/11, com uma captura de «A preparar «Capa»…»: «demora muito
    // tempo a carregar. tem que ser ultra rapida». A primeira página não tem
    // frase a meio nenhuma à espera: sai já.
    vi.useFakeTimers();
    comUrls();
    const f = respostaWebp();
    vi.stubGlobal("fetch", f);
    desenhar({ doc, activa: 1, quoteId: "q1", idioma: "pt" });
    // Antes de chegar: uma folha com o nome da página — nunca a aproximação.
    expect(screen.getByText(/A preparar «Jantar»/)).toBeTruthy();
    expect(screen.queryByText(/Aproximação/)).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    expect(f).toHaveBeenCalled();
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/orcamento/q1/pagina-do-rascunho");
    const corpo = JSON.parse(String(init?.body));
    // O número é o lugar da página no plano do PDF — e é a do «Jantar».
    expect(corpo.n).toBeGreaterThan(1);
    expect(corpo.idioma).toBe("pt");
    const img = await vi.waitFor(() =>
      screen.getByRole("img", { name: `Página ${corpo.n} do PDF, como vai sair` }),
    );
    expect(img.getAttribute("src")).toMatch(/^blob:pagina-/);
    expect(screen.getByText(new RegExp(`Página ${corpo.n} de 14`))).toBeTruthy();
    vi.useRealTimers();
  });

  it("ao escrever, a página velha FICA com «A atualizar…» e a nova pede-se depois de uma pausa curta", async () => {
    vi.useFakeTimers();
    comUrls();
    const f = respostaWebp();
    vi.stubGlobal("fetch", f);
    const { rerender } = desenhar({ doc, activa: 1, quoteId: "q1", idioma: "pt" });
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    await vi.waitFor(() => screen.getByRole("img", { name: /como vai sair/ }));
    const pedidos = f.mock.calls.length;
    // Uma letra a mais no nome do casal: o rascunho muda.
    const outro = { ...doc, clientNames: "TESTE Ana & TESTE Rui!" } as typeof doc;
    rerender(
      <PainelDoEstudio
        cabe
        paginas={paginas}
        urls={{ "p/a.jpg": "u/a", "p/b.jpg": "u/b" }}
        originais={{}}
        aspetos={{ "p/a.jpg": 1.5, "p/b.jpg": 0.7 }}
        onSaltar={() => {}}
        doc={outro}
        activa={1}
        quoteId="q1"
        idioma="pt"
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    // A página não desaparece: fica a anterior, e diz que vem aí outra.
    expect(screen.getByRole("img", { name: /como vai sair/ })).toBeTruthy();
    expect(screen.getByText("A atualizar…")).toBeTruthy();
    expect(f.mock.calls.length).toBe(pedidos);
    await act(async () => {
      vi.advanceTimersByTime(ESPERA_MS);
    });
    // A primeira a sair é a que está à vista, já com a letra nova.
    expect(f.mock.calls.length).toBeGreaterThan(pedidos);
    expect(JSON.parse(String(f.mock.calls[pedidos][1]?.body)).n).toBe(
      JSON.parse(String(f.mock.calls[0][1]?.body)).n,
    );
    expect(JSON.parse(String(f.mock.calls[pedidos][1]?.body)).doc.clientNames).toBe(
      "TESTE Ana & TESTE Rui!",
    );
    vi.useRealTimers();
  });

  it("prepara as outras LOGO, duas de cada vez — a que está à vista primeiro (9/11)", async () => {
    // Ela, a descer pelos mood boards: «fica muito tempo com a tela cinzenta a
    // dizer preparar». A preparação esperava 1,5 s parada e cada página nova
    // cancelava-a. Agora não espera, e mudar de página não cancela nada.
    vi.useFakeTimers();
    comUrls();
    // Um servidor que ainda não respondeu: só saem `EM_PARALELO` de cada vez.
    const pendurado = vi.fn(() => new Promise<never>(() => {}));
    vi.stubGlobal("fetch", pendurado);
    desenhar({ doc, activa: 1, quoteId: "q1", idioma: "pt" });
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    expect(pendurado.mock.calls.length).toBe(EM_PARALELO);
    cleanup();
    esquecerPaginasGuardadas();
    const f = respostaWebp();
    vi.stubGlobal("fetch", f);
    desenhar({ doc, activa: 1, quoteId: "q1", idioma: "pt" });
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    const n = JSON.parse(String(f.mock.calls[0][1]?.body)).n as number;
    for (let k = 0; k < 20; k++) {
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
    }
    const pedidas = f.mock.calls.map((c) => JSON.parse(String(c[1]?.body)).n as number);
    expect(pedidas.slice(0, 3)).toEqual([n, n + 1, n - 1]);
    // Na primeira vez da proposta, todas — e cada uma uma vez só.
    expect([...pedidas].sort((a, b) => a - b)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    vi.useRealTimers();
  });

  it("depois de uma mudança, só refaz as páginas perto dela — o resto quando lá chegar", async () => {
    // O custo: ela pediu a Vercel «sem gastar quase nada».
    vi.useFakeTimers();
    comUrls();
    const f = respostaWebp();
    vi.stubGlobal("fetch", f);
    const { rerender } = desenhar({ doc, activa: 0, quoteId: "q1", idioma: "pt" });
    for (let k = 0; k < 20; k++) {
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
    }
    const antes = f.mock.calls.length;
    const outro = { ...doc, clientNames: "TESTE Ana & TESTE Rui!" } as typeof doc;
    rerender(
      <PainelDoEstudio
        cabe
        paginas={paginas}
        urls={{ "p/a.jpg": "u/a", "p/b.jpg": "u/b" }}
        originais={{}}
        aspetos={{ "p/a.jpg": 1.5, "p/b.jpg": 0.7 }}
        onSaltar={() => {}}
        doc={outro}
        activa={0}
        quoteId="q1"
        idioma="pt"
      />,
    );
    for (let k = 0; k < 30; k++) {
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
    }
    const depois = f.mock.calls.slice(antes).map((c) => JSON.parse(String(c[1]?.body)).n as number);
    const n = depois[0];
    expect(depois.length).toBeLessThanOrEqual(5);
    for (const p of depois) expect(Math.abs(p - n)).toBeLessThanOrEqual(2);
    vi.useRealTimers();
  });

  it("mudar para uma página já preparada é imediato — sem pedido", async () => {
    vi.useFakeTimers();
    comUrls();
    const f = respostaWebp();
    vi.stubGlobal("fetch", f);
    const props = { doc, quoteId: "q1", idioma: "pt" as const };
    const { rerender } = desenhar({ ...props, activa: 0 });
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    await vi.waitFor(() => screen.getByRole("img", { name: /como vai sair/ }));
    for (let k = 0; k < 30; k++) {
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
    }
    const pedidos = f.mock.calls.length;
    rerender(
      <PainelDoEstudio
        cabe
        paginas={paginas}
        urls={{ "p/a.jpg": "u/a", "p/b.jpg": "u/b" }}
        originais={{}}
        aspetos={{ "p/a.jpg": 1.5, "p/b.jpg": 0.7 }}
        onSaltar={() => {}}
        {...props}
        activa={1}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByText("A atualizar…")).toBeNull();
    expect(screen.getByRole("img", { name: /como vai sair/ })).toBeTruthy();
    expect(f.mock.calls.length).toBe(pedidos);
    vi.useRealTimers();
  });

  it("a mesma página do mesmo rascunho não se pede duas vezes ao servidor (4/11)", async () => {
    // Ela pediu menos processador na Vercel «mantendo tudo como está». Sair do
    // painel e voltar (outro passo, outra vista) não desenha nada outra vez.
    vi.useFakeTimers();
    comUrls();
    const f = respostaWebp();
    vi.stubGlobal("fetch", f);
    desenhar({ doc, activa: 1, quoteId: "q1", idioma: "pt" });
    for (let k = 0; k < 20; k++) {
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
    }
    const pedidos = f.mock.calls.length;
    cleanup();
    // Volta ao mesmo sítio: a página aparece logo, sem pedido nenhum.
    desenhar({ doc, activa: 1, quoteId: "q1", idioma: "pt" });
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    expect(screen.getByRole("img", { name: /como vai sair/ })).toBeTruthy();
    for (let k = 0; k < 20; k++) {
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
    }
    expect(f.mock.calls.length).toBe(pedidos);
    vi.useRealTimers();
  });

  it("se o servidor falha, diz que a página não chegou — sem aproximação", async () => {
    vi.useFakeTimers();
    comUrls();
    vi.stubGlobal("fetch", respostaWebp(false));
    desenhar({ doc, activa: 0, quoteId: "q1" });
    // Tenta outra vez antes de desistir: uma falha passageira não é a página.
    for (let k = 0; k < TENTATIVAS * 20; k++) {
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
    }
    await vi.waitFor(() =>
      expect(screen.getByText("A página não chegou agora — tenta daqui a pouco")).toBeTruthy(),
    );
    vi.useRealTimers();
  });

  it("na vista «Todas» não se pede página nenhuma", async () => {
    const f = respostaWebp();
    vi.stubGlobal("fetch", f);
    desenhar({ doc, activa: 0, quoteId: "q1" });
    await userEvent.click(screen.getByRole("tab", { name: "Todas" }));
    // A página que estava à vista pode ter sido pedida antes do toque; a
    // partir dele, nada — nem a volta pelas outras.
    const antes = f.mock.calls.length;
    vi.useFakeTimers();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(f.mock.calls.length).toBe(antes);
    vi.useRealTimers();
  });
});

/**
 * ── O QUE A VOLTA À MÃO DE 9/11 APANHOU ──────────────────────────────────
 * Duas páginas erradas no painel: um mood board novo, só com o título, não
 * era seguido (o painel ficava na página de antes); e numa secção que ainda
 * não fez página nenhuma (um orçamento sem linhas) aparecia a última página
 * que se viu, que não tinha nada a ver com o que se escrevia.
 */
describe("a página seguida, nos casos de canto", () => {
  const docSoComTitulo = {
    clientNames: "TESTE Ana & TESTE Rui",
    eventType: "Casamento",
    coverImages: [],
    moodBoards: [board({ title: "Cerimónia", images: [] })],
  } as unknown as React.ComponentProps<typeof PainelDoEstudio>["doc"];

  it("um mood board ainda sem fotografias já é seguido — tem página no PDF", () => {
    desenhar({
      doc: docSoComTitulo,
      paginas: [],
      activa: 0,
      seccao: "moodboards",
      quoteId: "q1",
    });
    expect(screen.getByText(/Página \d+ de \d+ · Cerimónia/)).toBeTruthy();
    // E conta-se como uma inspiração: tem página.
    expect(screen.getByText("1 inspiração")).toBeTruthy();
  });

  it("uma secção sem página ainda diz isso, em vez de mostrar outra", () => {
    desenhar({ doc: docSoComTitulo, paginas: [], seccao: "orcamento", quoteId: "q1" });
    expect(screen.getByText(/Esta parte ainda não tem página no PDF/)).toBeTruthy();
    // E dá para folhear à mesma.
    expect(screen.getByRole("button", { name: "Página seguinte" })).toBeTruthy();
  });
});

describe("paginasAPreparar — a ordem por que se preparam as páginas", () => {
  it("a que está à vista, a seguinte, a anterior, e daí para fora", () => {
    expect(paginasAPreparar(3, 6)).toEqual([3, 4, 2, 5, 1, 6]);
  });
  it("com raio, só até essa distância", () => {
    expect(paginasAPreparar(5, 14, 2)).toEqual([5, 6, 4, 7, 3]);
  });
  it("nas pontas, só as que existem", () => {
    expect(paginasAPreparar(1, 14, 1)).toEqual([1, 2]);
    expect(paginasAPreparar(14, 14, 1)).toEqual([14, 13]);
  });
  it("sem saber quantas há, só ela e as vizinhas", () => {
    expect(paginasAPreparar(3, null)).toEqual([3, 4, 2]);
  });
});
