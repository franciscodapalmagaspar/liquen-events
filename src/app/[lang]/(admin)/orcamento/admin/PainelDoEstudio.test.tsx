// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
/* As medidas que o jsdom não tem — o mesmo duplo que o `NavEstudio.test.tsx`
   usa. O caminho é relativo porque o `@/` desta casa aponta para `src/`. */
import { fingirDisposicao, reporDisposicao } from "../../../../../../test/disposicao-fingida";
import PainelDoEstudio, { type PaginaParaOPainel } from "./PainelDoEstudio";
import { ESPERA_MS, esquecerPaginasGuardadas } from "./usePaginaReal";
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

  it("pede a página da inspiração activa DEPOIS de uma pausa, e mostra-a no lugar da aproximação", async () => {
    vi.useFakeTimers();
    comUrls();
    const f = respostaWebp();
    vi.stubGlobal("fetch", f);
    desenhar({ doc, activa: 1, quoteId: "q1", idioma: "pt" });
    // Antes da pausa: a aproximação, e dito que é uma.
    expect(screen.getByText("Aproximação — a página real está a chegar")).toBeTruthy();
    // A pausa é `ESPERA_MS` (3 s desde 3/11): antes dela não se pede nada.
    await act(async () => {
      vi.advanceTimersByTime(ESPERA_MS - 200);
    });
    expect(f).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(f).toHaveBeenCalledTimes(1);
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

  it("a mesma página do mesmo rascunho não se pede duas vezes ao servidor (4/11)", async () => {
    // Ela pediu menos processador na Vercel «mantendo tudo como está». Sair do
    // painel e voltar (outro passo, outra vista) desmontava-o e desenhava a
    // página outra vez no servidor, com o rascunho igual.
    vi.useFakeTimers();
    comUrls();
    const f = respostaWebp();
    vi.stubGlobal("fetch", f);
    desenhar({ doc, activa: 1, quoteId: "q1", idioma: "pt" });
    await act(async () => {
      vi.advanceTimersByTime(ESPERA_MS + 100);
    });
    expect(f).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => screen.getByRole("img", { name: /como vai sair/ }));
    cleanup();
    // Volta ao mesmo sítio: a página aparece logo, sem pausa e sem pedido.
    desenhar({ doc, activa: 1, quoteId: "q1", idioma: "pt" });
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    expect(screen.getByRole("img", { name: /como vai sair/ })).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(ESPERA_MS + 100);
    });
    expect(f).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("se o servidor falha, fica a aproximação — e diz que a real não chegou", async () => {
    vi.useFakeTimers();
    comUrls();
    vi.stubGlobal("fetch", respostaWebp(false));
    desenhar({ doc, activa: 0, quoteId: "q1" });
    await act(async () => {
      vi.advanceTimersByTime(ESPERA_MS + 100);
    });
    await vi.waitFor(() =>
      expect(screen.getByText("Aproximação — a página real não chegou agora")).toBeTruthy(),
    );
    vi.useRealTimers();
  });

  it("na vista «Todas» não se pede página nenhuma", async () => {
    const f = respostaWebp();
    vi.stubGlobal("fetch", f);
    desenhar({ doc, activa: 0, quoteId: "q1" });
    await userEvent.click(screen.getByRole("tab", { name: "Todas" }));
    vi.useFakeTimers();
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(f).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
