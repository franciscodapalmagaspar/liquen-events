// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import GalleryImage from "./GalleryImage";

/** O mesmo caminho que `renderTile` usa. */
const SRC = "/imagens/DaniGui_Preview20.jpg";
/**
 * Tentativas pelo FICHEIRO ORIGINAL antes de se desistir. A miniatura
 * pré-gerada não tem escada nenhuma: falha uma vez e passa-se logo ao original.
 */
const MAX_ATTEMPTS = 4;
/** O prefixo dos ficheiros estáticos gerados por scripts/pregen-gallery.mjs. */
const PREGEN_PREFIX = "/_img/g/DaniGui_Preview20-";

/**
 * A PROVA de que a queixa da dona ("nem todas as fotos carregam") deixou de ser
 * permanente.
 *
 * A medição que motivou este componente: injectando UM único HTTP 500 em 23 de
 * 176 pedidos `/_next/image`, ficaram 22 mosaicos em branco e o número de
 * tentativas por URL falhado foi {min:1, max:1} — o browser NUNCA voltou a
 * pedir nenhum deles. Estes testes fixam o comportamento oposto: um erro é
 * seguido de novo pedido, com URL diferente, e a foto acaba visível.
 */

/** IntersectionObserver de mentira: guarda os alvos e deixa-nos disparar. */
class FakeIO {
  static instances: FakeIO[] = [];
  targets: Element[] = [];
  constructor(private cb: IntersectionObserverCallback) {
    FakeIO.instances.push(this);
  }
  observe(el: Element) {
    this.targets.push(el);
  }
  unobserve() {}
  disconnect() {
    this.targets = [];
  }
  takeRecords() {
    return [];
  }
  fire(isIntersecting: boolean) {
    this.cb(
      this.targets.map((target) => ({ target, isIntersecting })) as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver,
    );
  }
}

function renderTile(props: Partial<React.ComponentProps<typeof GalleryImage>> = {}) {
  const anchorRef = createRef<HTMLElement>();
  const view = render(
    <button ref={anchorRef as React.RefObject<HTMLButtonElement>} className="g-tile relative">
      <GalleryImage
        src="/imagens/DaniGui_Preview20.jpg"
        alt="Casamento no Alentejo: Daniela & Guilherme (foto 1 de 30)"
        sizes="33vw"
        className="object-cover"
        anchorRef={anchorRef}
        unavailableLabel="Foto indisponível"
        priority
        {...props}
      />
    </button>,
  );
  return view;
}

const img = () => document.querySelector("img");
/** O `url=` que o optimizador do Next recebe, mais os parâmetros extra. */
const currentSrc = () => img()?.getAttribute("src") ?? "";
/** Os `srcset` de todas as `<source>` do `<picture>`. */
const todasAsFontes = () =>
  [...document.querySelectorAll("source")].map((s) => s.getAttribute("srcset") ?? "");

describe("GalleryImage: um mosaico falhado volta a ser pedido", () => {
  beforeEach(() => {
    FakeIO.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIO);
    vi.useFakeTimers();
  });
  afterEach(() => {
    // `globals` está desligado no vitest.config, portanto a limpeza do
    // testing-library não é automática: sem isto os <img> de um teste ficavam
    // no documento e o teste seguinte encontrava-os.
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a miniatura NUNCA passa pelo optimizador: aponta ao ficheiro pré-gerado", () => {
    // A mudança de fundo desta ronda. Cada miniatura era uma transformação
    // on-demand no /_next/image — 431 a 442 URLs distintos numa travessia
    // completa da galeria — e portanto sujeita a quota mensal, a encode a frio
    // e a esgotar o tempo sob rajada (medido: 219ms isolado -> 2900ms em 30
    // simultâneas). Agora é um WebP estático do CDN, que não tem nenhuma
    // dessas três maneiras de falhar.
    renderTile();
    const src = currentSrc();
    expect(src).not.toContain("/_next/image");
    expect(src).toContain(PREGEN_PREFIX);
    expect(src).toMatch(/\.webp$/);
    // E TODOS os candidatos, não só o src. Já não vivem num `srcset` no <img>:
    // vivem nas <source> do <picture>, que é o que permite dar uma escada
    // diferente ao telemóvel e ao ecrã grande.
    for (const s of todasAsFontes()) {
      expect(s).not.toContain("/_next/image");
      expect(s).toContain(PREGEN_PREFIX);
    }
  });

  it("o AVIF vem à frente do WebP, e o WebP existe sempre", () => {
    // A ordem É o mecanismo: o browser fica com a primeira <source> cujo
    // `media` case e cujo `type` ele saiba ler. Se o WebP viesse primeiro,
    // ninguém receberia AVIF; se o WebP não existisse, um browser sem AVIF
    // ficava sem fotografia.
    renderTile();
    const tipos = [...document.querySelectorAll("source")].map((s) => s.getAttribute("type"));
    expect(tipos).toEqual(["image/avif", "image/webp", "image/avif", "image/webp"]);
  });

  it("o telemóvel não recebe AVIF acima de 1024 px", () => {
    // O achado da Fase 0: servia-se 1280 px para caixas de 412 CSS px (3,11x)
    // em 374 de 374 fotos, e isso sozinho era 55 MB por travessia. O tecto do
    // telemóvel era 768; o 768 saiu da escada a 16/11 e o tecto passou ao
    // degrau de cima (1024), para não perder nitidez — mas o 1280 continua de
    // fora. O WebP (a reserva de quem não lê AVIF) só existe em 384 e 1280.
    renderTile();
    const doTelemovel = [...document.querySelectorAll("source")].filter((s) =>
      (s.getAttribute("media") ?? "").includes("max-width: 639px"),
    );
    expect(doTelemovel).toHaveLength(2);
    for (const s of doTelemovel) {
      const larguras = [...(s.getAttribute("srcset") ?? "").matchAll(/ (\d+)w/g)].map((m) =>
        Number(m[1]),
      );
      expect(larguras.length).toBeGreaterThan(0);
      if (s.getAttribute("type") === "image/avif") {
        expect(Math.max(...larguras)).toBeLessThanOrEqual(1024);
      } else {
        expect(larguras.every((w) => w === 384 || w === 1280)).toBe(true);
      }
    }
  });

  it("uma miniatura que falha vai JÁ ao original, sem esperar recuo nenhum", () => {
    // O ponto mais importante deste ficheiro.
    //
    // A escada de recuo foi feita para o `/_next/image`, onde uma falha era
    // quase sempre passageira. A miniatura pré-gerada é um ficheiro estático, e
    // a maneira de um ficheiro estático falhar é não existir — esperar 600ms
    // não o faz aparecer. Enquanto os dois casos partilhavam a escada, um
    // deploy sem as miniaturas custava 4 pedidos e 7,8 segundos POR MOSAICO
    // antes de se chegar ao `/imagens/x.jpg`, que está no repositório e
    // portanto existe sempre. Vezes 427 mosaicos: a galeria cheia de "foto
    // indisponível" que a dona viu.
    renderTile();
    expect(currentSrc()).toContain(PREGEN_PREFIX);

    act(() => {
      img()!.dispatchEvent(new Event("error"));
    });

    // Sem avançar UM ÚNICO milissegundo já há uma foto a caminho, e é o original.
    const el = img();
    expect(el, "o original devia estar pedido já").not.toBeNull();
    expect(el!.getAttribute("src")).toContain(SRC);
    expect(el!.getAttribute("src")).not.toContain("/_img/g/");

    act(() => {
      el!.dispatchEvent(new Event("load"));
    });
    expect(screen.queryByText("Foto indisponível")).toBeNull();
  });

  it("a escada de recuo é do ORIGINAL: exponencial, com tecto e depois um fallback digno", () => {
    renderTile({ blurDataURL: "data:image/webp;base64,AAAA" });

    // Primeiro erro: miniatura -> original, imediato.
    act(() => {
      img()!.dispatchEvent(new Event("error"));
    });
    const urls: string[] = [currentSrc()];
    expect(urls[0]).toContain(SRC);

    // A partir daqui, sim: 600ms, 1800ms, 5400ms, sempre com URL novo.
    for (const delay of [600, 1800, 5400]) {
      act(() => {
        img()!.dispatchEvent(new Event("error"));
      });
      // Antes de o recuo passar, nada foi pedido de novo.
      act(() => vi.advanceTimersByTime(delay - 1));
      expect(img()).toBeNull();
      act(() => vi.advanceTimersByTime(1));
      urls.push(currentSrc());
    }
    expect(urls).toHaveLength(4);
    // Cada tentativa é um URL novo: sem isto o browser podia devolver a
    // resposta falhada em cache e a escada corria sem nunca pedir nada.
    expect(new Set(urls).size).toBe(4);
    expect(urls.every((u) => u.includes(SRC))).toBe(true);

    // 4.ª falha do original: aí sim, não há foto para mostrar.
    act(() => {
      img()!.dispatchEvent(new Event("error"));
    });
    act(() => vi.advanceTimersByTime(60_000));
    expect(img()).toBeNull();
    // Nada de ícone partido: fica a própria foto desfocada e uma legenda.
    const fallback = screen.getByText("Foto indisponível");
    expect(fallback).toBeInTheDocument();
    expect(fallback.parentElement?.getAttribute("style")).toContain("data:image/webp");
  });

  it("depois de esgotar as tentativas, voltar a passar por cima do mosaico tenta de novo", () => {
    // É a recuperação que faltava: medido, o utilizador podia subir e voltar a
    // descer por cima da foto falhada e o browser nunca a voltava a pedir.
    renderTile();
    // 4 pelo optimizador + 1 pelo ficheiro original.
    for (let i = 0; i < 5; i++) {
      act(() => {
        img()!.dispatchEvent(new Event("error"));
      });
      act(() => vi.advanceTimersByTime(6_000));
    }
    expect(screen.getByText("Foto indisponível")).toBeInTheDocument();

    // O observer de recuperação é o último criado. Sair do ecrã e voltar.
    const io = FakeIO.instances[FakeIO.instances.length - 1];
    act(() => io.fire(false));
    expect(img()).toBeNull();
    act(() => io.fire(true));
    expect(screen.queryByText("Foto indisponível")).toBeNull();
    expect(img()).not.toBeNull();
  });

  it("a foto existe no HTML desde o início, mesmo sem `priority`", () => {
    // Este teste já exigiu o CONTRÁRIO: que a foto só aparecesse quando o
    // mosaico se aproximasse do ecrã. Isso escondia o `src` até alguém correr
    // JavaScript e deixava o HTML do servidor sem fotografia nenhuma (medido:
    // 21 `<img>` caíram para 6). Numa galeria, isso é não ter conteúdo para
    // quem tem a ligação lenta, para quem navega sem JavaScript e para os
    // motores de busca.
    //
    // Quem adia o pedido do que está longe do ecrã é o `loading="lazy"` do
    // próprio browser, que não precisa de hidratação para funcionar.
    renderTile({ priority: false });
    const el = img();
    expect(el).not.toBeNull();
    expect(el).toHaveAttribute("loading", "lazy");
  });

  it("uma foto `priority` não é adiada pelo browser", () => {
    renderTile({ priority: true });
    expect(img()).not.toHaveAttribute("loading", "lazy");
  });

  it("a foto com prioridade não espera pelo viewport e pede fetchpriority alto", () => {
    renderTile({ priority: true });
    expect(img()).not.toBeNull();
    expect(img()!.getAttribute("fetchpriority")).toBe("high");
  });

  it("com a miniatura em falta, todas as tentativas seguintes são ao original", async () => {
    // Rede de segurança final: se a miniatura pré-gerada faltar (uma foto
    // acrescentada a photos-data.ts sem correr o pregen, um deploy truncado),
    // serve-se o original em tamanho inteiro. Uma fotografia pesada é melhor
    // do que nenhuma fotografia — e nenhuma das tentativas é desperdiçada a
    // voltar a pedir uma miniatura que não existe.
    renderTile({ priority: true });
    const pedidos: string[] = [];
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const el = img();
      expect(el, `tentativa ${i + 1} devia ter um <img>`).not.toBeNull();
      pedidos.push(el!.getAttribute("src") ?? "");
      await act(async () => {
        fireEvent.error(el!);
        await vi.runAllTimersAsync();
      });
    }
    // Só o PRIMEIRO pedido foi à miniatura; os restantes já foram ao original.
    expect(pedidos[0]).toContain(PREGEN_PREFIX);
    expect(pedidos.slice(1).every((u) => u.includes(SRC))).toBe(true);
    expect(pedidos.slice(1).some((u) => u.includes("/_img/g/"))).toBe(false);

    const el = img();
    expect(el, "devia haver um <img> a apontar ao ficheiro original").not.toBeNull();
    // O src é o caminho tal e qual: nem optimizador nem miniatura.
    expect(el!.getAttribute("src")).toContain(SRC);
    expect(el!.getAttribute("src")).not.toContain("_next/image");
    expect(el!.getAttribute("src")).not.toContain("/_img/g/");
  });

  it("só desiste depois de o ficheiro original também falhar", async () => {
    renderTile({ priority: true });
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) {
      const el = img();
      if (!el) break;
      await act(async () => {
        fireEvent.error(el);
        await vi.runAllTimersAsync();
      });
    }
    expect(img()).toBeNull();
    expect(screen.getByText(/indispon/i)).toBeTruthy();
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * O DESFOCADO NÃO PODE SER PINTADO NO ELEMENTO QUE O CSS APAGA
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * O jsdom não carrega o globals.css, portanto não se pode perguntar aqui pela
 * opacidade calculada (disso trata o teste `@galeria o desfocado que se envia é
 * o desfocado que se vê`). O que se pode fixar, e é onde o defeito nasceu, é a
 * RELAÇÃO: o elemento que leva a pintura não pode ser o mesmo que leva a classe
 * `g-foto`, porque essa classe é `opacity: 0` e a opacidade apaga também o fundo
 * do elemento. Foi assim que 16 mosaicos de 16 mandaram um desfocado que nunca
 * ninguém viu.
 */
describe("GalleryImage: onde é que o desfocado é pintado", () => {
  it("o desfocado vai no <picture>, nunca no <img> que começa transparente", () => {
    renderTile({ blurDataURL: "data:image/webp;base64,AAAA" });

    const el = document.querySelector("img")!;
    const moldura = document.querySelector("picture")!;

    expect(moldura.style.backgroundImage, "o <picture> devia levar o desfocado").toContain(
      "data:image/webp",
    );
    expect(el.style.backgroundImage, "o <img> não pode levar o desfocado").toBe("");
    // E a classe que o apagaria continua onde tem de estar: no <img>.
    expect(el.className).toContain("g-foto");
    expect(moldura.className).not.toContain("g-foto");
  });

  it("carregada a fotografia, o desfocado sai — não fica a ocupar memória", () => {
    renderTile({ blurDataURL: "data:image/webp;base64,AAAA" });
    act(() => {
      fireEvent.load(document.querySelector("img")!);
    });
    expect(document.querySelector("picture")!.style.backgroundImage).toBe("");
  });
});
