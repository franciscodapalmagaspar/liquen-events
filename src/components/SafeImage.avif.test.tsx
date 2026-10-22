// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import SafeImage from "./SafeImage";
import HeroImage from "./HeroImage";
import siteImageLoader from "@/lib/site-image-loader";
import { heroAvifSrcSet } from "@/lib/hero-image-loader";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O AVIF DO `SafeImage` — AS QUATRO COISAS QUE PODIAM CORRER MAL EM SILÊNCIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Num Chromium moderno, uma fotografia em AVIF e uma em WebP parecem iguais; os
 * defeitos deste trabalho não se veem a olhar. Daí este ficheiro olhar para o
 * DOM:
 *   1. um `<source>` AVIF para uma origem SEM gémeo (os logótipos) é uma
 *      imagem partida — o browser escolhe pelo `type`, não pela existência;
 *   2. uma lista AVIF com outros degraus ou outro `sizes` muda a resolução da
 *      fotografia ao mudar de formato;
 *   3. uma `<source>` que fica depois de a rede passar ao ficheiro original
 *      faz cada re-tentativa pedir outra vez o AVIF que falhou;
 *   4. o herói tem de continuar a sair com a escada de sempre — é ela que o
 *      pré-carregamento leva, e o e2e `heroi-avif.spec.ts` conta-o.
 */

afterEach(cleanup);

/** Uma fotografia comum de /imagens/ (portefólio, grelha): escada da galeria. */
const FOTO = "/imagens/EW1_1100.jpg";
/** Uma fotografia de largura total: escada dos heróis. */
const CAPA = "/imagens/hd-edited.jpg";

const fonte = (c: HTMLElement) => c.querySelector<HTMLSourceElement>('picture > source[type="image/avif"]');
const candidatos = (srcset: string) => srcset.split(", ").map((c) => c.split(" ")[0]);

describe("SafeImage — o AVIF à frente do WebP", () => {
  it("uma fotografia de /imagens/ ganha um <picture> com a fonte AVIF da galeria", () => {
    const { container } = render(
      <div className="relative h-40 w-40">
        <SafeImage src={FOTO} alt="Foto" fill sizes="(min-width: 1024px) 33vw, 100vw" />
      </div>,
    );
    const s = fonte(container);
    expect(s, "não saiu <source> AVIF para uma foto que tem gémeo").not.toBeNull();
    const urls = candidatos(s!.getAttribute("srcset")!);
    expect(urls.length).toBeGreaterThan(1);
    for (const u of urls) expect(u).toMatch(/^\/_img\/g\/EW1_1100-\d+\.avif$/);
    // O `sizes` é o mesmo do `<img>` — senão o browser fazia outra conta.
    const img = container.querySelector("img")!;
    expect(s!.getAttribute("sizes")).toBe(img.getAttribute("sizes"));
  });

  it("cada candidato AVIF é o gémeo de um ficheiro que o carregador do WebP serve", () => {
    const { container } = render(
      <div className="relative h-40 w-40">
        <SafeImage src={FOTO} alt="Foto" fill sizes="100vw" />
      </div>,
    );
    const webp = new Set(
      [16, 32, 64, 96, 128, 256, 360, 384, 480, 640, 768, 1024, 1280, 1536, 1920, 3840].map((w) =>
        siteImageLoader({ src: FOTO, width: w }),
      ),
    );
    for (const u of candidatos(fonte(container)!.getAttribute("srcset")!)) {
      expect(webp.has(u.replace(/\.avif$/, ".webp")), `${u} não tem gémeo WebP`).toBe(true);
    }
  });

  it("os descritores dizem a largura verdadeira de cada ficheiro, sem repetidos", () => {
    const { container } = render(
      <div className="relative h-40 w-40">
        <SafeImage src={FOTO} alt="Foto" fill sizes="100vw" />
      </div>,
    );
    const pares = fonte(container)!
      .getAttribute("srcset")!
      .split(", ")
      .map((c) => c.split(" "));
    const urls = pares.map(([u]) => u);
    expect(new Set(urls).size).toBe(urls.length);
    for (const [u, d] of pares) expect(d).toBe(`${/-(\d+)\.avif$/.exec(u)![1]}w`);
  });

  it("um logótipo NÃO ganha <picture>: o pré-gerador dos logótipos só escreve WebP", () => {
    const { container } = render(
      <SafeImage src="/logo-liquen.png" alt="Líquen" width={300} height={179} />,
    );
    expect(container.querySelector("picture")).toBeNull();
    expect(container.querySelector("source")).toBeNull();
  });

  it("a bandeja _intake/ e as origens remotas também não — o pré-gerador não as percorre", () => {
    for (const src of ["/imagens/_intake/nova.jpg", "https://exemplo.pt/foto.jpg"]) {
      const { container } = render(
        <div className="relative h-40 w-40">
          <SafeImage src={src} alt="Foto" fill sizes="100vw" unoptimized={src.startsWith("http")} />
        </div>,
      );
      expect(container.querySelector("source"), src).toBeNull();
      cleanup();
    }
  });

  it("um carregador que serve OUTRO ficheiro desliga o AVIF em vez de o desencontrar", () => {
    const { container } = render(
      <div className="relative h-40 w-40">
        <SafeImage
          src={FOTO}
          alt="Foto"
          fill
          sizes="100vw"
          initialLoader={({ src }) => src}
        />
      </div>,
    );
    expect(container.querySelector("source")).toBeNull();
  });

  it("sem `fill` o <picture> não gera caixa; com `fill` cobre o pai, posicionado", () => {
    const { container } = render(
      <>
        <SafeImage src={FOTO} alt="a" width={400} height={300} sizes="400px" />
        <div className="relative h-40 w-40">
          <SafeImage src={FOTO} alt="b" fill sizes="100vw" />
        </div>
      </>,
    );
    const [semFill, comFill] = [...container.querySelectorAll("picture")] as HTMLElement[];
    expect(semFill.style.display).toBe("contents");
    expect(semFill.style.position).toBe("");
    expect(comFill.style.position).toBe("absolute");
  });

  it("na primeira falha a <source> sai — a re-tentativa não volta ao AVIF que falhou", () => {
    const { container } = render(
      <div className="relative h-40 w-40">
        <SafeImage src={FOTO} alt="Foto" fill sizes="100vw" />
      </div>,
    );
    expect(fonte(container)).not.toBeNull();
    act(() => {
      container.querySelector("img")!.dispatchEvent(new Event("error"));
    });
    expect(container.querySelector("source")).toBeNull();
    expect(container.querySelector("img")!.getAttribute("src")).toContain(FOTO);
  });
});

describe("HeroImage — o mesmo mecanismo, a mesma escada de sempre", () => {
  it("a <source> do herói é, letra a letra, a escada fixa do `heroAvifSrcSet`", () => {
    const { container } = render(
      <div className="absolute inset-0">
        <HeroImage src={CAPA} alt="Capa" fill priority sizes="100vw" quality={75} />
      </div>,
    );
    expect(fonte(container)!.getAttribute("srcset")).toBe(heroAvifSrcSet(CAPA));
  });

  it("com prioridade: o pré-carregamento é o do AVIF e o <img> fica eager/alta", () => {
    const { container } = render(
      <div className="absolute inset-0">
        <HeroImage src={CAPA} alt="Capa" fill priority sizes="100vw" quality={75} />
      </div>,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
    const preloads = [...document.head.querySelectorAll('link[rel="preload"][as="image"]')];
    const avif = preloads.filter((l) => l.getAttribute("type") === "image/avif");
    expect(avif.length, "não houve pré-carregamento AVIF").toBeGreaterThan(0);
    expect(avif[0].getAttribute("imagesrcset")).toBe(heroAvifSrcSet(CAPA));
    // Nenhum pré-carregamento do mesmo herói em WebP ao lado.
    expect(preloads.some((l) => /hd-edited.*\.webp|_next\/image.*hd-edited/.test(
      `${l.getAttribute("href")} ${l.getAttribute("imagesrcset")}`,
    ))).toBe(false);
  });
});
