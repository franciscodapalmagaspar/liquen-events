// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, cleanup } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

import EntradaEmVideo, {
  GUIAO_DA_ENTRADA,
  HTML_DOS_VIDEOS,
  arrancarEntrada,
  esquecerMotorDaSessao,
  porImagemAnimada,
} from "./EntradaEmVideo";
import { OCIOSO_MAX_MS, SEGUINTES_DEPOIS_DE_S, imagensAnimadas } from "@/lib/entrada-em-video";

let play: ReturnType<typeof vi.fn>;
let pausa: ReturnType<typeof vi.fn>;
let tiposQueToca: string[];
let vista: ((e: Array<{ isIntersecting: boolean }>) => void) | null;
/** Os pedidos de «quando o browser estiver livre» ainda por atender (`requestIdleCallback`). */
let ociosos: Array<{ cb: () => void; timeout?: number }>;

beforeEach(() => {
  // A ordem dos vídeos é sorteada; aqui fixa-se em 1 → 2 → 3 (0,99 não troca
  // nada no baralhar), e o teste da ordem variada muda-o.
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  localStorage.clear();
  // Sem `fetch`: os takes seguintes tocam da rede (o caminho antigo). Os
  // testes do download inteiro põem-no de volta.
  vi.stubGlobal("fetch", undefined);
  tiposQueToca = ["mp4"];
  // Fora do WebKit, salvo nos testes do iPhone: no WebKit o HEVC entra sem
  // perguntar (`melhorFormato`), e o jsdom diz-se «Apple».
  Object.defineProperty(navigator, "vendor", { configurable: true, value: "" });
  vista = null;
  // O `requestIdleCallback` do Chrome, com os pedidos guardados: o teste diz
  // quando o browser fica livre (`ficarLivre`).
  ociosos = [];
  vi.stubGlobal("requestIdleCallback", (cb: () => void, o?: { timeout?: number }) => {
    ociosos.push({ cb, timeout: o?.timeout });
    return ociosos.length;
  });
  vi.stubGlobal("cancelIdleCallback", () => undefined);
  play = vi.fn(() => Promise.resolve());
  pausa = vi.fn();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
  Object.defineProperty(HTMLMediaElement.prototype, "canPlayType", {
    configurable: true,
    value: (tipo: string) => (tiposQueToca.some((t) => tipo.includes(t)) ? "probably" : ""),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pausa });
  Object.defineProperty(HTMLMediaElement.prototype, "load", { configurable: true, value: vi.fn() });
  // Com o construtor de verdade (callback, opções): guarda-se o callback para
  // o teste poder dizer «a entrada saiu do ecrã».
  (globalThis as Record<string, unknown>).IntersectionObserver = class {
    constructor(cb: (e: Array<{ isIntersecting: boolean }>) => void, _opcoes?: unknown) {
      vista = cb;
    }
    observe() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  // Cada teste é um separador novo: sem os vídeos guardados do anterior.
  esquecerMotorDaSessao();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function montar() {
  const r = render(<EntradaEmVideo />);
  await act(async () => {
    for (let k = 0; k < 4; k++) await Promise.resolve();
  });
  return r;
}

const videos = (c: HTMLElement) => [...c.querySelectorAll("video")] as HTMLVideoElement[];

/** O take de entrada fica com `ate` segundos descarregados (de `dur`). */
function descarregado(el: HTMLVideoElement, ate: number, dur = 18) {
  if (!Object.getOwnPropertyDescriptor(el, "duration")) {
    Object.defineProperty(el, "duration", { configurable: true, value: dur });
  }
  Object.defineProperty(el, "buffered", {
    configurable: true,
    value: { length: 1, start: () => 0, end: () => ate },
  });
}

/** O browser ficou livre: atende os `requestIdleCallback` pendentes. */
function ficarLivre() {
  for (const { cb } of ociosos.splice(0)) act(() => cb());
}

/**
 * O take de entrada começa a tocar e já chegou inteiro. A ANDAR de verdade
 * (`paused` falso): o motor só põe à vista um vídeo que anda — um parado à
 * vista é onde o iPhone desenha o botão ▶.
 *
 * E, salvo `andou: false`, anda os `SEGUINTES_DEPOIS_DE_S` à vista e o browser
 * fica livre — é a partir daí que os seguintes se preparam (decisão dela,
 * 22/10). Os testes da espera em si usam `andou: false`.
 */
function comecar(el: HTMLVideoElement, { andou = true }: { andou?: boolean } = {}) {
  descarregado(el, el.duration || 18);
  Object.defineProperty(el, "paused", { configurable: true, value: false });
  act(() => void el.dispatchEvent(new Event("playing")));
  act(() => void el.dispatchEvent(new Event("canplaythrough")));
  // Largado (tem reserva): volta a andar, e o browser avisa outra vez.
  act(() => void el.dispatchEvent(new Event("playing")));
  if (!andou) return;
  if (!(el.currentTime >= SEGUINTES_DEPOIS_DE_S)) el.currentTime = SEGUINTES_DEPOIS_DE_S;
  act(() => void el.dispatchEvent(new Event("timeupdate")));
  ficarLivre();
}

describe("EntradaEmVideo", () => {
  /**
   * O pedido dela: «mal entremos no site, o vídeo comece logo a correr». A
   * prova é o HTML que vem do servidor: o vídeo 1 já lá está, a tocar sozinho,
   * antes de qualquer JavaScript.
   */
  /**
   * O pedido dela: «mal entremos no site, o vídeo comece logo a correr». A
   * prova é o HTML que vem do servidor: os três vídeos mudos e, logo a seguir,
   * o guião que escolhe o take de entrada e o põe a tocar — antes de qualquer
   * JavaScript do sítio.
   */
  it("o HTML do servidor traz os vídeos mudos e o guião que arranca o take de entrada", () => {
    const html = renderToStaticMarkup(<EntradaEmVideo />);
    const tags = html.match(/<video [^>]*>/g) ?? [];
    expect(tags).toHaveLength(3);
    for (const t of tags) {
      expect(t).toMatch(/\bmuted\b/);
      expect(t).toMatch(/\bplaysinline\b/);
      expect(t).toMatch(/aria-hidden="true"/);
      expect(t).toMatch(/tabindex="-1"/);
      expect(t).not.toMatch(/\bcontrols\b/);
      // Nenhum descarrega nada sozinho: é o guião que escolhe qual.
      expect(t).toMatch(/preload="none"/);
      expect(t).not.toMatch(/\bautoplay\b/);
    }
    expect(html).toContain(`<script>${GUIAO_DA_ENTRADA}</script>`);
    // Cada take de entrada: ao alto a vertical (HEVC antes do H.264: o iPhone),
    // deitado a larga (H.264 antes do HEVC: o computador, 29/10), e nunca AV1
    // (o Chrome di-lo tocar mesmo sem chip).
    for (let n = 1; n <= 3; n++) {
      expect(GUIAO_DA_ENTRADA).toContain(`entrada-${n}-retrato-hevc.mp4`);
      expect(GUIAO_DA_ENTRADA.indexOf(`entrada-${n}-retrato-hevc.mp4`)).toBeLessThan(
        GUIAO_DA_ENTRADA.indexOf(`entrada-${n}-retrato.mp4`),
      );
      expect(GUIAO_DA_ENTRADA.indexOf(`entrada-${n}-paisagem.mp4`)).toBeLessThan(
        GUIAO_DA_ENTRADA.indexOf(`entrada-${n}-paisagem-hevc.mp4`),
      );
    }
    expect(GUIAO_DA_ENTRADA).toContain('codecs=\\"hvc1.');
    expect(GUIAO_DA_ENTRADA).not.toContain("av1");
  });

  describe("o take de entrada vai trocando (1.ª visita na floresta)", () => {
    /** Uma entrada no sítio: o HTML do servidor e o guião a correr nele. */
    function entrar() {
      document.body.innerHTML = `<div data-entrada="">${HTML_DOS_VIDEOS}</div>`;
      const guiao = document.querySelector("script");
      Object.defineProperty(document, "currentScript", { configurable: true, value: guiao });
      new Function(GUIAO_DA_ENTRADA)();
      Reflect.deleteProperty(document, "currentScript");
      const vs = [...document.querySelectorAll("video")];
      const n = vs.findIndex((v) => v.hasAttribute("data-primeiro"));
      return { vs, n };
    }
    afterEach(() => {
      document.body.innerHTML = "";
    });

    it("a 1.ª visita entra na floresta, a tocar sozinho, na versão do ecrã", () => {
      const { vs, n } = entrar();
      expect(n).toBe(0);
      expect(vs[0].autoplay).toBe(true);
      expect(
        vs[0].querySelector('source[media="(orientation: portrait)"]')?.getAttribute("src"),
      ).toBe("/videos/entrada/v6/entrada-1-retrato-hevc.mp4");
      expect(vs[1].querySelector("source")).toBeNull();
      expect(play).toHaveBeenCalled();
    });

    it("a 1.ª visita guarda o take, e cada entrada seguinte abre num diferente do anterior", () => {
      vi.spyOn(Math, "random").mockRestore();
      expect(entrar().n).toBe(0);
      expect(localStorage.getItem("liquen-entrada-ultimo")).toBe("0");
      const vistos = new Set<number>();
      let antes = 0;
      for (let k = 0; k < 30; k++) {
        const { n } = entrar();
        expect(n).not.toBe(antes);
        expect(localStorage.getItem("liquen-entrada-ultimo")).toBe(String(n));
        vistos.add(n);
        antes = n;
      }
      // Os três takes aparecem à entrada.
      expect(vistos.size).toBe(3);
    });

    it("sem armazenamento (janela privada), entra na floresta", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("bloqueado");
      });
      expect(entrar().n).toBe(0);
    });
  });

  describe("a cortina sobe com o vídeo", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });
    afterEach(() => {
      vi.useRealTimers();
      document.body.innerHTML = "";
    });

    function comCortina() {
      document.body.innerHTML = `<div class="cortina"><p><span class="g"></span></p></div><div data-entrada="">${HTML_DOS_VIDEOS}</div>`;
      const c = document.querySelector<HTMLElement>(".cortina")!;
      const pano = { currentTime: 0, pause: vi.fn(), play: vi.fn() };
      const frase = { currentTime: 0, pause: vi.fn(), play: vi.fn() };
      Object.assign(c, {
        getAnimations: (o?: { subtree?: boolean }) => (o?.subtree ? [pano, frase] : [pano]),
      });
      arrancarEntrada(
        [...Array(3)].map(() => "<source src='x.mp4' type='video/mp4'>"),
        "liquen-entrada-ultimo",
        2500,
      );
      const v = document.querySelector<HTMLVideoElement>("[data-primeiro]")!;
      return { v, pano, frase };
    }

    it("o take arranca escondido, pára no 1.º fotograma, e só anda quando o pano sobe", () => {
      const { v } = comCortina();
      expect(v.hasAttribute("data-a-espera")).toBe(true);
      Object.defineProperty(v, "readyState", { configurable: true, value: 4 });
      pausa.mockClear();
      v.dispatchEvent(new Event("playing"));
      expect(pausa).toHaveBeenCalled(); // pronto: parado à espera do pano
      play.mockClear();
      vi.advanceTimersByTime(1700);
      expect(play).not.toHaveBeenCalled();
      // O pano sobe aos 1980 ms; o vídeo arranca 0,2 s antes, ainda tapado.
      vi.advanceTimersByTime(100);
      expect(play).toHaveBeenCalledTimes(1);
      expect(v.hasAttribute("data-a-espera")).toBe(false);
    });

    it("se o vídeo não está pronto na hora, o pano e a frase esperam, e sobem com ele", () => {
      const { v, pano, frase } = comCortina();
      vi.advanceTimersByTime(2000);
      expect(pano.pause).toHaveBeenCalled();
      expect(frase.pause).toHaveBeenCalled();
      play.mockClear();
      Object.defineProperty(v, "readyState", { configurable: true, value: 4 });
      v.dispatchEvent(new Event("playing"));
      expect(play).toHaveBeenCalledTimes(1);
      expect(pano.play).toHaveBeenCalled();
      expect(frase.play).toHaveBeenCalled();
    });

    it("lê o instante da subida como o browser o devolve («1.98s»)", () => {
      document.documentElement.style.setProperty("--cortina-sobe", "1.98s");
      try {
        const { pano } = comCortina();
        vi.advanceTimersByTime(1700);
        expect(pano.pause).not.toHaveBeenCalled(); // não segura logo no início
        vi.advanceTimersByTime(100);
        expect(pano.pause).toHaveBeenCalled();
      } finally {
        document.documentElement.style.removeProperty("--cortina-sobe");
      }
    });

    it("nunca espera mais do que o tecto: sobe sem o vídeo", () => {
      const { v, pano } = comCortina();
      vi.advanceTimersByTime(2000 + 2500);
      expect(pano.play).toHaveBeenCalled();
      expect(v.hasAttribute("data-a-espera")).toBe(false);
    });

    it("sem cortina (movimento reduzido, navegação dentro do sítio): arranca quando tem reserva", () => {
      document.body.innerHTML = `<div class="cortina cortina--fora"></div><div data-entrada="">${HTML_DOS_VIDEOS}</div>`;
      arrancarEntrada(
        [...Array(3)].map(() => "<source src='x.mp4' type='video/mp4'>"),
        "liquen-entrada-ultimo",
        2500,
      );
      const v = document.querySelector<HTMLVideoElement>("[data-primeiro]")!;
      expect(v.autoplay).toBe(true);
      // O 1.º fotograma chega: pára nele e junta reserva (4G fraco: não pára à vista).
      pausa.mockClear();
      v.dispatchEvent(new Event("playing"));
      expect(pausa).toHaveBeenCalled();
      expect(v.hasAttribute("data-a-espera")).toBe(true);
      play.mockClear();
      Object.defineProperty(v, "readyState", { configurable: true, value: 4 });
      v.dispatchEvent(new Event("canplaythrough"));
      expect(play).toHaveBeenCalledTimes(1);
      expect(v.hasAttribute("data-a-espera")).toBe(false);
    });

    it("sem cortina, nunca espera mais do que o tecto pela reserva", () => {
      document.body.innerHTML = `<div class="cortina cortina--fora"></div><div data-entrada="">${HTML_DOS_VIDEOS}</div>`;
      arrancarEntrada(
        [...Array(3)].map(() => "<source src='x.mp4' type='video/mp4'>"),
        "liquen-entrada-ultimo",
        2500,
      );
      const v = document.querySelector<HTMLVideoElement>("[data-primeiro]")!;
      v.dispatchEvent(new Event("playing"));
      play.mockClear();
      vi.advanceTimersByTime(2500);
      expect(play).toHaveBeenCalledTimes(1);
      expect(v.hasAttribute("data-a-espera")).toBe(false);
    });
  });

  describe("ao alto numa rede fraca, arranca na versão leve", () => {
    let ligacao: Record<string, unknown> | undefined;
    beforeEach(() => {
      tiposQueToca = ["hvc1", "avc1", "mp4"];
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("portrait") }));
      ligacao = undefined;
      Object.defineProperty(navigator, "connection", {
        configurable: true,
        get: () => ligacao,
      });
    });
    afterEach(() => {
      vi.useRealTimers();
      Reflect.deleteProperty(navigator, "connection");
      document.body.innerHTML = "";
    });
    function entrarSemCortina() {
      document.body.innerHTML = `<div class="cortina cortina--fora"></div><div data-entrada="">${HTML_DOS_VIDEOS}</div>`;
      new Function(GUIAO_DA_ENTRADA)();
      return document.querySelector<HTMLVideoElement>("[data-primeiro]")!;
    }
    const fontes = (v: HTMLVideoElement) =>
      [...v.querySelectorAll("source")].map((f) => f.getAttribute("src"));

    it("se o aparelho diz que a ligação é lenta, começa logo na leve", () => {
      ligacao = { effectiveType: "4g", downlink: 2.5 };
      const v = entrarSemCortina();
      expect(fontes(v)).toEqual([
        "/videos/entrada/v6/entrada-1-retrato-leve-hevc.mp4",
        "/videos/entrada/v6/entrada-1-retrato-leve.mp4",
      ]);
      expect(v.hasAttribute("data-leve")).toBe(true);
    });

    it("o iPhone não diz: mede-se 1,2 s, e se a rede não chega passa à leve antes de se ver", () => {
      const v = entrarSemCortina();
      expect(fontes(v)[0]).toBe("/videos/entrada/v6/entrada-1-retrato-hevc.mp4");
      // Em 1,2 s chegou 0,6 s de vídeo: a versão normal pararia.
      Object.defineProperty(v, "buffered", {
        configurable: true,
        value: { length: 1, start: () => 0, end: () => 0.6 },
      });
      play.mockClear();
      vi.advanceTimersByTime(1200);
      expect(v.hasAttribute("data-leve")).toBe(true);
      expect(fontes(v)[0]).toBe("/videos/entrada/v6/entrada-1-retrato-leve-hevc.mp4");
      expect(play).toHaveBeenCalled();
      expect(v.hasAttribute("data-a-espera")).toBe(true); // ainda escondido
    });

    it("com rede que chega, fica na versão normal", () => {
      const v = entrarSemCortina();
      Object.defineProperty(v, "buffered", {
        configurable: true,
        value: { length: 1, start: () => 0, end: () => 6 },
      });
      vi.advanceTimersByTime(1200);
      expect(v.hasAttribute("data-leve")).toBe(false);
      expect(fontes(v)[0]).toBe("/videos/entrada/v6/entrada-1-retrato-hevc.mp4");
    });

    it("um browser que só toca WebM nunca passa à leve (ficava sem vídeo)", () => {
      tiposQueToca = ["webm"];
      ligacao = { effectiveType: "3g" };
      const v = entrarSemCortina();
      expect(v.hasAttribute("data-leve")).toBe(false);
      Object.defineProperty(v, "buffered", {
        configurable: true,
        value: { length: 1, start: () => 0, end: () => 0.2 },
      });
      vi.advanceTimersByTime(1200);
      expect(v.hasAttribute("data-leve")).toBe(false);
      expect(fontes(v).some((f) => f?.endsWith(".webm"))).toBe(true);
    });

    it("deitado (computador) nunca usa a leve", () => {
      vi.stubGlobal("matchMedia", () => ({ matches: false }));
      ligacao = { effectiveType: "3g" };
      const v = entrarSemCortina();
      expect(v.hasAttribute("data-leve")).toBe(false);
      vi.advanceTimersByTime(1200);
      expect(v.hasAttribute("data-leve")).toBe(false);
    });
  });

  it("aparece por cima da fotografia quando JÁ está a tocar, e o 2 começa logo a carregar", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    expect(play).toHaveBeenCalled();
    expect(a.style.opacity).toBe("0");
    expect(b.getAttribute("src")).toBeNull();

    comecar(a);
    expect(a.style.opacity).toBe("1");
    expect(b.getAttribute("src")).toBe("/videos/entrada/v6/entrada-2-paisagem.mp4");
  });

  it("no telemóvel ao alto, os seguintes vêm na versão vertical", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    const { container } = await montar();
    const [a, b] = videos(container);
    comecar(a);
    expect(b.getAttribute("src")).toMatch(/entrada-2-retrato\.mp4$/);
  });

  it("num ecrã denso, o vídeo com fonte 4K vem na versão grande — se o aparelho a confirmar no chip", async () => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    Object.defineProperty(navigator, "mediaCapabilities", {
      configurable: true,
      value: {
        decodingInfo: () =>
          Promise.resolve({ supported: true, smooth: true, powerEfficient: true }),
      },
    });
    try {
      const { container } = await montar();
      const [a, b] = videos(container);
      comecar(a);
      expect(b.getAttribute("src")).toMatch(/entrada-2-grande(-av1)?\.mp4$/);
    } finally {
      Reflect.deleteProperty(navigator, "mediaCapabilities");
    }
  });

  it("a ordem vai mudando: com outro sorteio, depois da floresta vem o 3", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { container } = await montar();
    const [a, b, c] = videos(container);
    comecar(a);
    // É o 3 que se prepara primeiro, porque é o que vem a seguir.
    expect(c.getAttribute("src")).toMatch(/entrada-3-paisagem\.mp4$/);
    expect(b.getAttribute("src")).toBeNull();
  });

  it("sem H.264 (o Chromium dos testes), os seguintes vêm em WebM", async () => {
    tiposQueToca = ["webm"];
    const { container } = await montar();
    const [a, b] = videos(container);
    comecar(a);
    expect(b.getAttribute("src")).toMatch(/entrada-2-paisagem\.webm$/);
  });

  it("um browser que não toca nenhum dos formatos fica com a fotografia", async () => {
    tiposQueToca = [];
    await montar();
    expect(play).not.toHaveBeenCalled();
  });

  it("perto do fim, o seguinte arranca e só sobe por cima quando já está a tocar", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    comecar(a);

    // O 2 fica pronto (e o 3 começa a preparar-se a seguir, em cadeia).
    act(() => void b.dispatchEvent(new Event("canplaythrough")));
    expect(videos(container)[2].getAttribute("src")).toMatch(/entrada-3-paisagem\.mp4$/);
    Object.defineProperty(a, "duration", { configurable: true, value: 18 });
    Object.defineProperty(a, "currentTime", { configurable: true, value: 17.5, writable: true });
    play.mockClear();
    act(() => void a.dispatchEvent(new Event("timeupdate")));
    expect(play).toHaveBeenCalledTimes(1);
    expect(b.style.opacity).toBe("0");

    act(() => void b.dispatchEvent(new Event("playing")));
    expect(b.style.opacity).toBe("1");
    expect(Number(b.style.zIndex)).toBeGreaterThan(Number(a.style.zIndex));
  });

  it("a passagem começa 1,5 s antes do fim, e se o seguinte arrancar tarde a subida encolhe", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    comecar(a);
    act(() => void b.dispatchEvent(new Event("canplaythrough")));
    Object.defineProperty(a, "duration", { configurable: true, value: 18 });
    Object.defineProperty(a, "currentTime", { configurable: true, value: 16.5, writable: true });
    play.mockClear();
    act(() => void a.dispatchEvent(new Event("timeupdate")));
    expect(play).toHaveBeenCalledTimes(1); // a 1,5 s do fim já arranca o seguinte
    // O descodificador demorou: faltam 0,4 s ao que sai quando o novo anda.
    a.currentTime = 17.6;
    act(() => void b.dispatchEvent(new Event("playing")));
    expect(b.style.opacity).toBe("1");
    expect(b.style.transitionDuration).toBe("360ms");
  });

  it("se o que sai acaba antes de o novo avisar que anda, o novo sobe já (não fica parado à vista)", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    comecar(a);
    act(() => void b.dispatchEvent(new Event("canplaythrough")));
    Object.defineProperty(a, "duration", { configurable: true, value: 18 });
    Object.defineProperty(a, "currentTime", { configurable: true, value: 16.5, writable: true });
    act(() => void a.dispatchEvent(new Event("timeupdate")));
    expect(b.style.opacity).toBe("0");
    // O novo já anda, mas o «playing» ainda não chegou; o velho acabou.
    Object.defineProperty(b, "readyState", { configurable: true, value: 3 });
    Object.defineProperty(b, "currentTime", { configurable: true, value: 0.2, writable: true });
    a.currentTime = 18;
    act(() => void a.dispatchEvent(new Event("ended")));
    expect(b.style.opacity).toBe("1");
    expect(b.style.transitionDuration).toBe("200ms");
  });

  it("se o seguinte ainda não chegou, o actual REPETE-SE em vez de parar", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    comecar(a);
    Object.defineProperty(a, "duration", { configurable: true, value: 18 });
    Object.defineProperty(a, "currentTime", { configurable: true, value: 17.5, writable: true });
    act(() => void a.dispatchEvent(new Event("timeupdate")));
    expect(a.loop).toBe(true);
    expect(b.style.opacity).toBe("0");

    // Quando o 2 chega, a passagem faz-se na volta seguinte.
    act(() => void b.dispatchEvent(new Event("canplaythrough")));
    play.mockClear();
    act(() => void a.dispatchEvent(new Event("timeupdate")));
    expect(play).toHaveBeenCalledTimes(1);
    act(() => void b.dispatchEvent(new Event("playing")));
    expect(b.style.opacity).toBe("1");
    expect(a.loop).toBe(false);
  });

  it("o «ended» é rede de segurança: segue para o seguinte se estiver pronto", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    comecar(a);
    act(() => void b.dispatchEvent(new Event("canplaythrough")));
    play.mockClear();
    act(() => void a.dispatchEvent(new Event("ended")));
    expect(play).toHaveBeenCalledTimes(1);
    act(() => void b.dispatchEvent(new Event("playing")));
    expect(b.style.opacity).toBe("1");
  });

  it("preparar um vídeo é tocá-lo escondido até estar pronto (o iPhone só descarrega assim)", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    play.mockClear();
    comecar(a);
    expect(play.mock.contexts).toContain(b); // o 2, escondido
    expect(b.style.opacity).toBe("0");
    pausa.mockClear();
    act(() => void b.dispatchEvent(new Event("canplaythrough")));
    expect(pausa).toHaveBeenCalled(); // pronto: pára e espera pela sua vez
  });

  it("pára quando a entrada sai do ecrã e retoma quando volta", async () => {
    const { container } = await montar();
    comecar(videos(container)[0]);
    play.mockClear();

    act(() => vista?.([{ isIntersecting: false }]));
    expect(pausa).toHaveBeenCalled();

    act(() => vista?.([{ isIntersecting: true }]));
    expect(play).toHaveBeenCalled();
  });

  it("se o aparelho recusar arrancar sozinho (poupança de bateria), arranca ao primeiro toque", async () => {
    play.mockImplementation(() =>
      Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })),
    );
    await montar();
    play.mockImplementation(() => Promise.resolve());
    play.mockClear();
    act(() => void window.dispatchEvent(new Event("pointerdown")));
    expect(play).toHaveBeenCalledTimes(1);
  });

  describe("recusado (iPhone com poupança de energia): nunca o botão ▶ do sistema", () => {
    const recusar = () =>
      play.mockImplementation(() =>
        Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })),
      );
    const comoNoIphone = () =>
      Object.defineProperty(navigator, "vendor", {
        configurable: true,
        value: "Apple Computer, Inc.",
      });
    afterEach(() => {
      Reflect.deleteProperty(navigator, "vendor");
    });

    it("um vídeo parado no 1.º fotograma nunca fica à vista (é onde o iPhone põe o ▶)", async () => {
      const { container } = await montar();
      const [a] = videos(container);
      Object.defineProperty(a, "readyState", { configurable: true, value: 2 });
      act(() => void a.dispatchEvent(new Event("loadeddata")));
      act(() => void a.dispatchEvent(new Event("playing"))); // o guião pára-o logo
      expect(a.style.opacity).toBe("0");
    });

    it("no iPhone, recusado: nenhum vídeo à vista e a floresta entra como imagem animada", async () => {
      comoNoIphone();
      recusar();
      const { container } = await montar();
      expect(videos(container).every((v) => v.style.opacity === "0")).toBe(true);
      const img = container.querySelector<HTMLImageElement>("img[data-entrada-imagem]");
      expect(img?.getAttribute("src")).toBe("/videos/entrada/v6/entrada-1-paisagem.mp4");
      expect(img?.getAttribute("aria-hidden")).toBe("true");
      expect(img?.style.opacity).toBe("0");
      act(() => void img!.dispatchEvent(new Event("load")));
      expect(img?.style.opacity).toBe("1");
    });

    it("ao alto, a imagem animada é a versão leve (menos peso)", async () => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
      comoNoIphone();
      recusar();
      const { container } = await montar();
      expect(container.querySelector("img[data-entrada-imagem]")?.getAttribute("src")).toBe(
        "/videos/entrada/v6/entrada-1-retrato-leve.mp4",
      );
    });

    it("fora do Safari (que não toca um MP4 num <img>) entra logo o WebP animado", async () => {
      Object.defineProperty(navigator, "vendor", { configurable: true, value: "Google Inc." });
      recusar();
      const { container } = await montar();
      expect(container.querySelector("img[data-entrada-imagem]")?.getAttribute("src")).toBe(
        "/videos/entrada/v6/entrada-1-paisagem-animada.webp",
      );
      expect(videos(container).every((v) => v.style.opacity === "0")).toBe(true);
    });

    it("no iPhone, se o MP4 no <img> falhar, entra o WebP; se também falhar, fica a fotografia", async () => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
      comoNoIphone();
      recusar();
      const { container } = await montar();
      const img = container.querySelector<HTMLImageElement>("img[data-entrada-imagem]")!;
      act(() => void img.dispatchEvent(new Event("error")));
      expect(img.getAttribute("src")).toBe("/videos/entrada/v6/entrada-1-retrato-animada.webp");
      expect(img.isConnected).toBe(true);
      act(() => void img.dispatchEvent(new Event("error")));
      expect(img.isConnected).toBe(false);
    });

    it("o guião do HTML põe a imagem LOGO na recusa, antes do React, e não a repete", async () => {
      comoNoIphone();
      recusar();
      document.body.innerHTML = `<div data-entrada="">${HTML_DOS_VIDEOS}</div>`;
      try {
        // Corre o texto que vai mesmo no HTML (com o `porImagemAnimada` dentro).
        new Function(GUIAO_DA_ENTRADA)();
        await act(async () => {
          for (let k = 0; k < 4; k++) await Promise.resolve();
        });
        const imgs = document.querySelectorAll<HTMLImageElement>("img[data-entrada-imagem]");
        expect(imgs).toHaveLength(1);
        expect(imgs[0].getAttribute("src")).toBe("/videos/entrada/v6/entrada-1-paisagem.mp4");
        // Quem vier depois (o motor) reconhece-a em vez de pôr outra.
        const raiz = document.querySelector("[data-entrada]")!;
        expect(porImagemAnimada(raiz, imagensAnimadas(0), false, 800)).toBe(imgs[0]);
        expect(document.querySelectorAll("img[data-entrada-imagem]")).toHaveLength(1);
      } finally {
        document.body.innerHTML = "";
      }
    });

    it("sem recusa, o guião não põe imagem nenhuma (o vídeo é que entra)", async () => {
      comoNoIphone();
      document.body.innerHTML = `<div data-entrada="">${HTML_DOS_VIDEOS}</div>`;
      try {
        new Function(GUIAO_DA_ENTRADA)();
        await act(async () => {
          for (let k = 0; k < 4; k++) await Promise.resolve();
        });
        expect(document.querySelector("img[data-entrada-imagem]")).toBeNull();
      } finally {
        document.body.innerHTML = "";
      }
    });

    it("ao primeiro toque o vídeo volta, sobe quando anda, e a imagem sai", async () => {
      comoNoIphone();
      recusar();
      const { container } = await montar();
      const [a] = videos(container);
      play.mockImplementation(() => Promise.resolve());
      act(() => void window.dispatchEvent(new Event("pointerdown")));
      Object.defineProperty(a, "paused", { configurable: true, value: false });
      act(() => void a.dispatchEvent(new Event("playing")));
      expect(a.style.opacity).toBe("1");
      expect(
        container.querySelector<HTMLImageElement>("img[data-entrada-imagem]")?.style.opacity,
      ).toBe("0");
    });
  });

  describe("o formato dos seguintes: pergunta-se ao aparelho", () => {
    type Resp = { supported: boolean; smooth: boolean; powerEfficient: boolean };
    const SIM: Resp = { supported: true, smooth: true, powerEfficient: true };
    const SEM_CHIP: Resp = { supported: true, smooth: true, powerEfficient: false };
    function aparelho(av1: Resp, hevc: Resp) {
      Object.defineProperty(navigator, "mediaCapabilities", {
        configurable: true,
        value: {
          decodingInfo: (c: { video: { contentType: string } }) =>
            Promise.resolve(c.video.contentType.includes("av01") ? av1 : hevc),
        },
      });
    }
    afterEach(() => {
      Reflect.deleteProperty(navigator, "mediaCapabilities");
    });

    async function srcDoSegundo() {
      const { container } = await montar();
      const [a, b] = videos(container);
      comecar(a);
      return b.getAttribute("src");
    }

    it("AV1 quando o chip o descodifica e corre liso (fora do Safari/iPhone)", async () => {
      Object.defineProperty(navigator, "vendor", { configurable: true, value: "Google Inc." });
      try {
        aparelho(SIM, SIM);
        expect(await srcDoSegundo()).toMatch(/entrada-2-paisagem-av1\.mp4$/);
      } finally {
        Reflect.deleteProperty(navigator, "vendor");
      }
    });

    it("no iPhone/Safari é o HEVC, mesmo com o AV1 no chip (17/10, o registo)", async () => {
      Object.defineProperty(navigator, "vendor", {
        configurable: true,
        value: "Apple Computer, Inc.",
      });
      try {
        aparelho(SIM, SIM);
        expect(await srcDoSegundo()).toMatch(/entrada-2-paisagem-hevc\.mp4$/);
      } finally {
        Reflect.deleteProperty(navigator, "vendor");
      }
    });

    it("HEVC quando o AV1 seria no processador (travava) e o HEVC é no chip", async () => {
      aparelho(SEM_CHIP, SIM);
      expect(await srcDoSegundo()).toMatch(/entrada-2-paisagem-hevc\.mp4$/);
    });

    it("H.264 quando nenhum dos dois é no chip", async () => {
      aparelho(SEM_CHIP, SEM_CHIP);
      expect(await srcDoSegundo()).toMatch(/entrada-2-paisagem\.mp4$/);
    });

    describe("a versão grande só com o chip a confirmá-la (29/10, «no PC trava»)", () => {
      beforeEach(() => {
        // Um portátil retina: 1440 × 2 = 2880 píxeis reais.
        Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
      });
      function perguntas(grande: Resp) {
        const feitas: string[] = [];
        Object.defineProperty(navigator, "mediaCapabilities", {
          configurable: true,
          value: {
            decodingInfo: (c: { video: { contentType: string; width: number } }) => {
              feitas.push(`${c.video.contentType}@${c.video.width}`);
              if (!c.video.contentType.includes("avc1")) return Promise.resolve(SEM_CHIP);
              return Promise.resolve(c.video.width > 1920 ? grande : SIM);
            },
          },
        });
        return feitas;
      }

      it("o aparelho diz que a toca no chip: vai a grande", async () => {
        perguntas(SIM);
        expect(await srcDoSegundo()).toMatch(/entrada-2-grande\.mp4$/);
      });

      it("a grande seria no processador: fica a de 1920", async () => {
        perguntas(SEM_CHIP);
        expect(await srcDoSegundo()).toMatch(/entrada-2-paisagem\.mp4$/);
      });

      it("sem a pergunta (browser antigo): fica a de 1920", async () => {
        Reflect.deleteProperty(navigator, "mediaCapabilities");
        expect(await srcDoSegundo()).toMatch(/entrada-2-paisagem\.mp4$/);
      });
    });

    it("no Safari do computador pergunta-se, como nos outros (um Mac Intel faz HEVC no processador)", async () => {
      Object.defineProperty(navigator, "vendor", {
        configurable: true,
        value: "Apple Computer, Inc.",
      });
      vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("pointer: fine") }));
      try {
        aparelho(SEM_CHIP, SEM_CHIP);
        expect(await srcDoSegundo()).toMatch(/entrada-2-paisagem\.mp4$/);
      } finally {
        Reflect.deleteProperty(navigator, "vendor");
      }
    });
  });

  describe("no computador: um take à frente, da rede, sem cópias na memória (29/10)", () => {
    beforeEach(() => {
      vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("pointer: fine") }));
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.reject(new Error("não devia descarregar"))),
      );
    });

    it("o seguinte toca da rede, e o depois desse só se prepara na passagem", async () => {
      const { container } = await montar();
      const [a, b, c] = videos(container);
      comecar(a);
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(b.getAttribute("src")).toBe("/videos/entrada/v6/entrada-2-paisagem.mp4");
      // O 2 já está pronto, mas o 3 não se prepara antes de o 2 ser o próximo.
      act(() => void b.dispatchEvent(new Event("canplaythrough")));
      Object.defineProperty(b, "readyState", { configurable: true, value: 4 });
      expect(c.getAttribute("src")).toBeNull();
    });

    it("num tablet (dedo) continua o caminho do iPhone: descarrega para a memória", async () => {
      vi.stubGlobal("matchMedia", () => ({ matches: false }));
      const pedidos: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
          pedidos.push(url);
          return new Promise(() => undefined);
        }),
      );
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn() });
      const { container } = await montar();
      comecar(videos(container)[0]);
      expect(pedidos).toEqual(["/videos/entrada/v6/entrada-2-paisagem.mp4"]);
    });
  });

  describe("cada take seguinte descarregado inteiro antes da sua vez", () => {
    let pedidos: string[];
    let responder: (ok: boolean) => void;
    beforeEach(() => {
      pedidos = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (url: string) =>
            new Promise((res, rej) => {
              pedidos.push(url);
              responder = (ok) =>
                ok
                  ? res({ ok: true, blob: () => Promise.resolve(new Blob(["x"])) })
                  : rej(new Error("rede"));
            }),
        ),
      );
      let n = 0;
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: vi.fn(() => `blob:take-${++n}`),
      });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    });
    const esperar = () =>
      act(async () => {
        for (let k = 0; k < 6; k++) await Promise.resolve();
      });

    it("descarrega-se para a memória e só se aquece perto do fim do take à vista", async () => {
      const { container } = await montar();
      const [a, b] = videos(container);
      Object.defineProperty(a, "duration", { configurable: true, value: 18 });
      Object.defineProperty(a, "currentTime", { configurable: true, value: 2, writable: true });
      comecar(a);
      expect(pedidos).toEqual(["/videos/entrada/v6/entrada-2-paisagem.mp4"]);
      responder(true);
      await esperar();
      // Já está na memória, mas ainda faltam 16 s: não se põe a descodificar.
      expect(b.getAttribute("src")).toBeNull();
      a.currentTime = 15.5;
      act(() => void a.dispatchEvent(new Event("timeupdate")));
      expect(b.getAttribute("src")).toBe("blob:take-1");
      // E o seguinte da fila começa a descarregar quando este chegou.
      expect(pedidos[1]).toBe("/videos/entrada/v6/entrada-3-paisagem.mp4");
    });

    it("o take de abertura também vai para a memória, depois dos outros, e troca fora da vista", async () => {
      const { container } = await montar();
      const [a, b] = videos(container);
      Object.defineProperty(a, "duration", { configurable: true, value: 18 });
      Object.defineProperty(a, "currentTime", { configurable: true, value: 2, writable: true });
      comecar(a);
      responder(true); // o 2
      await esperar();
      responder(true); // o 3
      await esperar();
      // Os outros já estão: agora a cópia do de abertura (o mesmo ficheiro).
      expect(pedidos).toEqual([
        "/videos/entrada/v6/entrada-2-paisagem.mp4",
        "/videos/entrada/v6/entrada-3-paisagem.mp4",
        "/videos/entrada/v6/entrada-1-paisagem.mp4",
      ]);
      responder(true);
      await esperar();
      // Está à vista: não se lhe mexe a meio.
      expect(a.querySelectorAll("source").length).toBeGreaterThan(0);

      // A passagem para o 2: quando acaba, o de abertura passa à cópia.
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        a.currentTime = 16.5;
        act(() => void a.dispatchEvent(new Event("timeupdate")));
        act(() => void b.dispatchEvent(new Event("canplaythrough")));
        act(() => void a.dispatchEvent(new Event("timeupdate")));
        act(() => void b.dispatchEvent(new Event("playing")));
        act(() => void vi.advanceTimersByTime(1000));
      } finally {
        vi.useRealTimers();
      }
      expect(b.style.opacity).toBe("1");
      expect(a.querySelectorAll("source")).toHaveLength(0);
    });

    it("um erro num take da memória: larga a cópia e passa a tocar da rede", async () => {
      const { container } = await montar();
      const [a, b] = videos(container);
      Object.defineProperty(a, "duration", { configurable: true, value: 18 });
      Object.defineProperty(a, "currentTime", { configurable: true, value: 2, writable: true });
      comecar(a);
      responder(true);
      await esperar();
      a.currentTime = 15.5;
      act(() => void a.dispatchEvent(new Event("timeupdate")));
      expect(b.getAttribute("src")).toBe("blob:take-1");
      act(() => void b.dispatchEvent(new Event("error")));
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:take-1");
      expect(b.getAttribute("src")).toBe("/videos/entrada/v6/entrada-2-paisagem.mp4");
    });

    it("depois de cada passagem, o que saiu FICA carregado (largá-lo prendia a imagem no iPhone)", async () => {
      const { container } = await montar();
      const [a, b, c] = videos(container);
      Object.defineProperty(a, "duration", { configurable: true, value: 18 });
      Object.defineProperty(a, "currentTime", { configurable: true, value: 2, writable: true });
      comecar(a);
      responder(true); // o 2
      await esperar();
      responder(true); // o 3
      await esperar();
      responder(true); // a cópia do de abertura
      await esperar();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        // 1 → 2
        a.currentTime = 16.5;
        act(() => void a.dispatchEvent(new Event("timeupdate")));
        act(() => void b.dispatchEvent(new Event("canplaythrough")));
        act(() => void a.dispatchEvent(new Event("timeupdate")));
        act(() => void b.dispatchEvent(new Event("playing")));
        act(() => void vi.advanceTimersByTime(1000));
        expect(b.style.opacity).toBe("1");
        // O que saiu, perto do fim, acaba sozinho: sem salto para o 0 (o
        // registo do iPhone, 17/10: era aí que a imagem à vista prendia).
        expect(a.currentTime).toBe(16.5);
        // 2 → 3: o 3 é aquecido da memória perto do fim do 2…
        Object.defineProperty(b, "duration", { configurable: true, value: 18 });
        Object.defineProperty(b, "currentTime", {
          configurable: true,
          value: 16.5,
          writable: true,
        });
        act(() => void b.dispatchEvent(new Event("timeupdate")));
        expect(c.getAttribute("src")).toBe("blob:take-2");
        act(() => void c.dispatchEvent(new Event("canplaythrough")));
        act(() => void b.dispatchEvent(new Event("timeupdate")));
        act(() => void c.dispatchEvent(new Event("playing")));
        act(() => void vi.advanceTimersByTime(1000));
      } finally {
        vi.useRealTimers();
      }
      expect(c.style.opacity).toBe("1");
      // …e o 2, que saiu, continua com o seu ficheiro. O #243 largava-o aqui, e
      // era nesse instante que, no iPhone, a imagem à vista ficava presa
      // 8 a 10 s (o registo anónimo, 17/10).
      expect(b.getAttribute("src")).toBe("blob:take-1");
    });

    it("se o download falhar, toca da rede como antes", async () => {
      const { container } = await montar();
      const [a, b] = videos(container);
      comecar(a);
      responder(false);
      await esperar();
      expect(b.getAttribute("src")).toBe("/videos/entrada/v6/entrada-2-paisagem.mp4");
    });

    it("não divide a rede com o take de entrada enquanto ele não chegou inteiro", async () => {
      const { container } = await montar();
      const [a] = videos(container);
      descarregado(a, 6);
      Object.defineProperty(a, "paused", { configurable: true, value: false });
      act(() => void a.dispatchEvent(new Event("playing")));
      act(() => void a.dispatchEvent(new Event("canplaythrough")));
      act(() => void a.dispatchEvent(new Event("playing"))); // largado: anda
      act(() => void a.dispatchEvent(new Event("progress")));
      expect(pedidos).toEqual([]); // tem dados para seguir, mas ainda não todos
      // Já andou o bastante à vista, e o browser está livre (22/10) — mas
      // inteiro é que ainda não chegou: a espera nova só ACRESCENTA.
      a.currentTime = SEGUINTES_DEPOIS_DE_S + 0.5;
      act(() => void a.dispatchEvent(new Event("timeupdate")));
      ficarLivre();
      expect(pedidos).toEqual([]);
      descarregado(a, 18);
      act(() => void a.dispatchEvent(new Event("progress")));
      expect(pedidos).toHaveLength(1);
    });

    /**
     * Decisão dela (22/10), da auditoria: nos primeiros 10 s a entrada
     * descarregava ~5,8 MB — o take de entrada e, logo atrás, os seguintes,
     * ainda com a página a montar-se. Os seguintes passam a esperar que o de
     * entrada ande uns segundos à vista (e que o browser esteja livre), com um
     * prazo que lhes deixa tempo de sobra para chegarem inteiros antes da vez.
     */
    describe("os seguintes esperam que o de entrada ande (22/10)", () => {
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      /** A floresta (18,4 s), inteira, à vista a andar no seu 1.º instante. */
      async function floresta() {
        const r = await montar();
        const [a, b, c] = videos(r.container);
        Object.defineProperty(a, "duration", { configurable: true, value: 18.4 });
        comecar(a, { andou: false });
        return { ...r, a, b, c };
      }
      const anda = (a: HTMLVideoElement, t: number) => {
        a.currentTime = t;
        act(() => void a.dispatchEvent(new Event("timeupdate")));
      };

      it("nos primeiros instantes do de entrada, nenhum seguinte é pedido", async () => {
        const { a } = await floresta();
        expect(pedidos).toEqual([]);
        anda(a, 1);
        act(() => void vi.advanceTimersByTime(1000));
        anda(a, 2.5);
        act(() => void vi.advanceTimersByTime(1500));
        anda(a, 4.9);
        ficarLivre();
        expect(pedidos).toEqual([]);
        // Nem sequer se pediu ainda o instante livre: a espera é o vídeo andar.
        expect(ociosos).toEqual([]);
      });

      it("andou os segundos à vista: pede-os no 1.º instante livre do browser (com tecto)", async () => {
        const { a } = await floresta();
        anda(a, SEGUINTES_DEPOIS_DE_S);
        expect(pedidos).toEqual([]); // ainda à espera do instante livre…
        expect(ociosos).toHaveLength(1);
        expect(ociosos[0].timeout).toBe(OCIOSO_MAX_MS); // …que o browser não pode adiar mais do que isto
        ficarLivre();
        expect(pedidos).toEqual(["/videos/entrada/v6/entrada-2-paisagem.mp4"]);
        // E um só pedido de instante livre, por muitos `timeupdate` que venham.
        anda(a, SEGUINTES_DEPOIS_DE_S + 0.3);
        expect(ociosos).toEqual([]);
      });

      it("no Safari (sem `requestIdleCallback`), andou: pede-os logo a seguir", async () => {
        vi.stubGlobal("requestIdleCallback", undefined);
        const { a } = await floresta();
        anda(a, SEGUINTES_DEPOIS_DE_S);
        expect(pedidos).toEqual([]);
        act(() => void vi.advanceTimersByTime(0));
        expect(pedidos).toHaveLength(1);
      });

      it("o prazo: parado (fora do ecrã, encravado), pede-os na mesma aos 6,4 s", async () => {
        const { a } = await floresta();
        // O de entrada não sai do 0 — a página foi rolada, ou o descodificador encravou.
        act(() => void vi.advanceTimersByTime(6399));
        expect(pedidos).toEqual([]);
        act(() => void vi.advanceTimersByTime(1));
        expect(pedidos).toEqual(["/videos/entrada/v6/entrada-2-paisagem.mp4"]);
        expect(a.currentTime).toBe(0);
      });

      it("os takes curtos (11,6 s e 4,2 s) não esperam: pedem logo, como antes", async () => {
        for (const d of [11.6, 4.24]) {
          // Um separador novo, na 1.ª visita (o take de entrada é a floresta).
          pedidos.length = 0;
          esquecerMotorDaSessao();
          cleanup();
          localStorage.clear();
          const { container } = await montar();
          const [a] = videos(container);
          Object.defineProperty(a, "duration", { configurable: true, value: d });
          comecar(a, { andou: false });
          expect(pedidos).toHaveLength(1);
        }
      });

      it("a versão leve (rede fraca medida no arranque) não espera", async () => {
        const { container } = await montar();
        const [a] = videos(container);
        Object.defineProperty(a, "duration", { configurable: true, value: 18.4 });
        a.setAttribute("data-leve", "");
        comecar(a, { andou: false });
        expect(pedidos).toHaveLength(1);
      });

      it("com «Poupar dados», ou uma ligação que se diz lenta, não espera", async () => {
        Object.defineProperty(navigator, "connection", {
          configurable: true,
          value: { saveData: true },
        });
        try {
          await floresta();
          expect(pedidos).toHaveLength(1);
        } finally {
          Reflect.deleteProperty(navigator, "connection");
        }
      });

      it("com «reduzir movimento», não espera", async () => {
        vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduced-motion") }));
        await floresta();
        expect(pedidos).toHaveLength(1);
      });

      it("pedido no prazo, chega inteiro à memória e a passagem faz-se dele, normalmente", async () => {
        const { a, b } = await floresta();
        act(() => void vi.advanceTimersByTime(6400));
        expect(pedidos).toHaveLength(1);
        responder(true);
        await esperar();
        // Na memória, mas ainda longe do fim: não se descodifica já.
        anda(a, 10);
        expect(b.getAttribute("src")).toBeNull();
        // Perto do fim, aquece-se da memória…
        anda(a, 15.5);
        expect(b.getAttribute("src")).toBe("blob:take-1");
        act(() => void b.dispatchEvent(new Event("canplaythrough")));
        // …e a 1,5 s do fim arranca, e sobe por cima quando já anda.
        play.mockClear();
        anda(a, 16.9);
        expect(play.mock.contexts).toContain(b);
        act(() => void b.dispatchEvent(new Event("playing")));
        act(() => void vi.advanceTimersByTime(1000));
        expect(b.style.opacity).toBe("1");
        expect(Number(b.style.zIndex)).toBeGreaterThan(Number(a.style.zIndex));
        expect(a.loop).toBe(false);
      });
    });
  });

  describe("voltar à página inicial sem recarregar", () => {
    /**
     * Ela (16/10): «quando vou a outra página e depois volto à página inicial,
     * fica ali um bocadinho parado numa foto». Os vídeos ficam guardados
     * enquanto se anda pelo sítio, e voltam os MESMOS, a continuar.
     */
    it("os mesmos vídeos voltam, à vista e a tocar, no mesmo take", async () => {
      const primeira = await montar();
      const [a, b] = videos(primeira.container);
      comecar(a);
      a.currentTime = 7.3;
      expect(a.style.opacity).toBe("1");
      pausa.mockClear();
      primeira.unmount(); // foi à galeria
      expect(pausa).toHaveBeenCalled(); // fora da página nada toca

      play.mockClear();
      const segunda = await montar(); // voltou à página inicial
      const vs = videos(segunda.container);
      expect(vs[0]).toBe(a); // o mesmo elemento, com o que já tinha
      expect(vs[1]).toBe(b);
      expect(vs[0].style.opacity).toBe("1"); // o fotograma já está à vista
      expect(vs[0].currentTime).toBe(7.3); // continua de onde estava
      expect(play).toHaveBeenCalled();
      // E não escolheu outro take: continua o que estava.
      expect(vs.filter((v) => v.hasAttribute("data-primeiro"))).toEqual([a]);
    });

    it("fora da página inicial, os downloads continuam (para estarem prontos à volta)", async () => {
      const pedidos: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
          pedidos.push(url);
          return new Promise(() => undefined);
        }),
      );
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn() });
      const primeira = await montar();
      comecar(videos(primeira.container)[0]);
      expect(pedidos).toHaveLength(1);
      primeira.unmount();
      // O download não foi cortado: nenhum `abort` no desligar.
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].signal.aborted).toBe(
        false,
      );
    });
  });

  describe("uma notificação, o aviso da bateria: volta sozinho", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("uma paragem que não foi nossa (o sistema) volta logo a tocar, e insiste", async () => {
      const { container } = await montar();
      const [a] = videos(container);
      comecar(a);
      play.mockClear();
      // O sistema parou-o: fica parado até o motor o voltar a pôr a andar.
      Object.defineProperty(a, "paused", { configurable: true, value: true });
      act(() => void a.dispatchEvent(new Event("pause")));
      expect(play).toHaveBeenCalledTimes(1); // logo, sem esperar pelo vigia
      act(() => void vi.advanceTimersByTime(300));
      expect(play).toHaveBeenCalledTimes(2); // o sistema às vezes recusa o 1.º
      act(() => void vi.advanceTimersByTime(700));
      // A 1 s, outra vez (e o vigia, que também passa nesse segundo).
      expect(play.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it("uma paragem nossa (fora do ecrã) não se desfaz", async () => {
      const { container } = await montar();
      const [a] = videos(container);
      comecar(a);
      Object.defineProperty(a, "paused", { configurable: true, value: false });
      act(() => vista?.([{ isIntersecting: false }]));
      play.mockClear();
      act(() => void a.dispatchEvent(new Event("pause")));
      act(() => void vi.advanceTimersByTime(1500));
      expect(play).not.toHaveBeenCalled();
    });

    it("ao voltar de outra aplicação, se a imagem não anda, um salto solta o descodificador", async () => {
      const { container } = await montar();
      const [a] = videos(container);
      comecar(a);
      Object.defineProperty(a, "paused", { configurable: true, value: false });
      Object.defineProperty(a, "readyState", { configurable: true, value: 4 });
      let saltos = 0;
      let t = 7.2;
      Object.defineProperty(a, "currentTime", {
        configurable: true,
        get: () => t,
        set: (v: number) => {
          saltos++;
          t = v;
        },
      });
      act(() => void document.dispatchEvent(new Event("resume")));
      play.mockClear();
      act(() => void vi.advanceTimersByTime(600));
      expect(saltos).toBe(1);
      expect(t).toBe(7.2); // o mesmo instante: não salta para lado nenhum
      expect(play).toHaveBeenCalled();
    });

    it("se a imagem já anda ao voltar, não se lhe mexe", async () => {
      const { container } = await montar();
      const [a] = videos(container);
      comecar(a);
      Object.defineProperty(a, "paused", { configurable: true, value: false });
      let t = 3;
      let saltos = 0;
      Object.defineProperty(a, "currentTime", {
        configurable: true,
        get: () => (t += 0.2),
        set: () => void saltos++,
      });
      act(() => void window.dispatchEvent(new Event("focus")));
      act(() => void vi.advanceTimersByTime(600));
      expect(saltos).toBe(0);
    });
  });

  describe("o vigia (nunca fica parado)", () => {
    beforeEach(() => {
      vi.useFakeTimers({
        toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance"],
      });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("se o browser parar o vídeo à vista, volta a tocá-lo", async () => {
      const { container } = await montar();
      const [a] = videos(container);
      comecar(a);
      Object.defineProperty(a, "paused", { configurable: true, value: true });
      play.mockClear();
      act(() => void vi.advanceTimersByTime(1100));
      expect(play).toHaveBeenCalled();
    });

    it("se ficar encravado e o seguinte estiver pronto, segue para o seguinte", async () => {
      const { container } = await montar();
      const [a, b] = videos(container);
      comecar(a);
      Object.defineProperty(a, "paused", { configurable: true, value: false });
      Object.defineProperty(a, "currentTime", { configurable: true, value: 4, writable: true });
      act(() => void b.dispatchEvent(new Event("canplaythrough")));
      play.mockClear();
      act(() => void vi.advanceTimersByTime(5000));
      expect(play).toHaveBeenCalled();
      act(() => void b.dispatchEvent(new Event("playing")));
      expect(b.style.opacity).toBe("1");
    });

    it("sem dados (rede) e o seguinte já pronto: passa em 0,4 s em vez de ficar parado", async () => {
      const { container } = await montar();
      const [a, b] = videos(container);
      comecar(a);
      act(() => void b.dispatchEvent(new Event("canplaythrough")));
      Object.defineProperty(a, "currentTime", { configurable: true, value: 4, writable: true });
      Object.defineProperty(a, "readyState", { configurable: true, value: 2 });
      play.mockClear();
      act(() => void a.dispatchEvent(new Event("waiting")));
      act(() => void vi.advanceTimersByTime(450));
      expect(play).toHaveBeenCalledTimes(1);
      act(() => void b.dispatchEvent(new Event("playing")));
      expect(b.style.opacity).toBe("1");
    });

    it("sem dados e sem para onde ir: espera (não há take na memória)", async () => {
      const { container } = await montar();
      const [a, b] = videos(container);
      comecar(a);
      Object.defineProperty(a, "currentTime", { configurable: true, value: 4, writable: true });
      Object.defineProperty(a, "readyState", { configurable: true, value: 2 });
      play.mockClear();
      act(() => void a.dispatchEvent(new Event("waiting")));
      act(() => void vi.advanceTimersByTime(450));
      expect(play).not.toHaveBeenCalled();
      expect(b.style.opacity).toBe("0");
    });

    it("encravado ainda a descarregar, mas com o seguinte pronto: segue (já não espera pela rede)", async () => {
      const { container } = await montar();
      const [a, b] = videos(container);
      comecar(a);
      Object.defineProperty(a, "paused", { configurable: true, value: false });
      Object.defineProperty(a, "currentTime", { configurable: true, value: 4, writable: true });
      Object.defineProperty(a, "readyState", { configurable: true, value: 2 });
      Object.defineProperty(a, "networkState", { configurable: true, value: 2 }); // a carregar
      act(() => void b.dispatchEvent(new Event("canplaythrough")));
      play.mockClear();
      act(() => void vi.advanceTimersByTime(4100));
      expect(play).toHaveBeenCalled();
      act(() => void b.dispatchEvent(new Event("playing")));
      expect(b.style.opacity).toBe("1");
    });

    describe("ela (16/10, iPhone): «o vídeo pára» — ao mudar de vídeo, e fica parado de vez", () => {
      /** Leva o take à vista (a) até à passagem para o seguinte (b), pronto a tocar. */
      async function ateAPassagem() {
        const r = await montar();
        const [a, b] = videos(r.container);
        comecar(a);
        act(() => void b.dispatchEvent(new Event("canplaythrough")));
        Object.defineProperty(a, "duration", { configurable: true, value: 18 });
        Object.defineProperty(a, "currentTime", {
          configurable: true,
          value: 16.5,
          writable: true,
        });
        act(() => void a.dispatchEvent(new Event("timeupdate")));
        return { ...r, a, b };
      }
      /** O que sai chega ao fim e pára no último fotograma. */
      function chegaAoFim(a: HTMLVideoElement) {
        a.currentTime = 18;
        Object.defineProperty(a, "ended", { configurable: true, value: true });
        Object.defineProperty(a, "paused", { configurable: true, value: true });
        act(() => void a.dispatchEvent(new Event("ended")));
      }

      it("depois do #243 («pára um bocadinho»): durante a passagem o que sai REPETE-SE, nunca congela no fim", async () => {
        const { a, b } = await ateAPassagem();
        expect(a.loop).toBe(true);
        expect(b.style.opacity).toBe("0");
      });

      it("o prazo desiste sem precisar do «ended» (que com a repetição não chega)", async () => {
        const { a, b } = await ateAPassagem();
        act(() => void vi.advanceTimersByTime(2000));
        expect(a.loop).toBe(true);
        expect(a.style.opacity).toBe("1");
        Object.defineProperty(b, "paused", { configurable: true, value: true });
        act(() => void b.dispatchEvent(new Event("playing")));
        expect(b.style.opacity).toBe("0"); // a passagem desistida não volta
      });

      it("no prazo, se o seguinte já anda (o «playing» atrasou-se), sobe", async () => {
        const { a, b } = await ateAPassagem();
        Object.defineProperty(b, "readyState", { configurable: true, value: 3 });
        Object.defineProperty(b, "currentTime", { configurable: true, value: 0.3, writable: true });
        act(() => void vi.advanceTimersByTime(2000));
        expect(b.style.opacity).toBe("1");
        expect(a.loop).toBe(false);
      });

      it("o seguinte nunca arranca: a passagem desiste e o que está à vista volta a tocar", async () => {
        const { a, b } = await ateAPassagem();
        expect(b.style.opacity).toBe("0");
        chegaAoFim(a);
        play.mockClear();
        act(() => void vi.advanceTimersByTime(2600));
        // Antes: parado no último fotograma, para sempre.
        expect(a.loop).toBe(true);
        expect(a.style.opacity).toBe("1");
        expect(play).toHaveBeenCalled();
        // O seguinte foi refeito do zero (volta a ser aquecido)…
        expect(b.style.opacity).toBe("0");
        // …e um «playing» atrasado da passagem desistida já não o põe à vista.
        Object.defineProperty(b, "paused", { configurable: true, value: true });
        act(() => void b.dispatchEvent(new Event("playing")));
        expect(b.style.opacity).toBe("0");
      });

      it("o seguinte com imagem mas PARADO nunca sobe à vista: desiste-se em 0,4 s", async () => {
        const { a, b } = await ateAPassagem();
        // Tem imagem (aquecido), mas não anda: o tempo ficou no 0.
        Object.defineProperty(b, "readyState", { configurable: true, value: 4 });
        chegaAoFim(a);
        expect(b.style.opacity).toBe("0");
        play.mockClear();
        act(() => void vi.advanceTimersByTime(450));
        expect(b.style.opacity).toBe("0");
        expect(a.style.opacity).toBe("1");
        expect(a.loop).toBe(true);
        expect(play).toHaveBeenCalled(); // o que está à vista recomeça
      });

      it("depois de desistir, a passagem faz-se na volta seguinte", async () => {
        const { a, b } = await ateAPassagem();
        chegaAoFim(a);
        act(() => void vi.advanceTimersByTime(2600));
        // O que está à vista recomeçou e anda; o seguinte ficou pronto.
        Object.defineProperty(a, "ended", { configurable: true, value: false });
        Object.defineProperty(a, "paused", { configurable: true, value: false });
        act(() => void b.dispatchEvent(new Event("canplaythrough")));
        a.currentTime = 16.5;
        act(() => void a.dispatchEvent(new Event("timeupdate")));
        act(() => void b.dispatchEvent(new Event("playing")));
        expect(b.style.opacity).toBe("1");
      });

      it("o seguinte recusado (NotAllowedError) não esconde nada nem fica à espera de um toque", async () => {
        const r = await montar();
        const [a, b] = videos(r.container);
        comecar(a);
        act(() => void b.dispatchEvent(new Event("canplaythrough")));
        play.mockImplementation(function (this: HTMLVideoElement) {
          return this === b
            ? Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" }))
            : Promise.resolve();
        });
        Object.defineProperty(a, "duration", { configurable: true, value: 18 });
        Object.defineProperty(a, "currentTime", {
          configurable: true,
          value: 16.5,
          writable: true,
        });
        await act(async () => {
          a.dispatchEvent(new Event("timeupdate"));
          for (let k = 0; k < 4; k++) await Promise.resolve();
        });
        expect(a.style.opacity).toBe("1");
        expect(a.loop).toBe(true); // desistiu: o que está à vista repete
        expect(r.container.querySelector("img[data-entrada-imagem]")).toBeNull();
        // O vigia continua vivo: se o browser parar o que está à vista, volta.
        Object.defineProperty(a, "paused", { configurable: true, value: true });
        play.mockClear();
        act(() => void vi.advanceTimersByTime(1100));
        expect(play).toHaveBeenCalled();
      });

      it("à espera de um toque, o vigia tenta outra vez sozinho — e o vídeo volta sem toque", async () => {
        play.mockImplementation(() =>
          Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })),
        );
        const { container } = await montar();
        const [a] = videos(container);
        expect(a.style.opacity).toBe("0");
        play.mockImplementation(() => Promise.resolve());
        play.mockClear();
        act(() => void vi.advanceTimersByTime(3100));
        expect(play).toHaveBeenCalled();
        Object.defineProperty(a, "paused", { configurable: true, value: false });
        act(() => void a.dispatchEvent(new Event("playing")));
        expect(a.style.opacity).toBe("1");
      });
    });

    describe("o registo anónimo (ela autorizou, 16/10)", () => {
      let beacons: Blob[];
      beforeEach(() => {
        beacons = [];
        Object.defineProperty(navigator, "sendBeacon", {
          configurable: true,
          value: vi.fn((_url: string, corpo: Blob) => {
            beacons.push(corpo);
            return true;
          }),
        });
      });
      afterEach(() => {
        Reflect.deleteProperty(navigator, "sendBeacon");
      });

      it("uma paragem do vídeo à vista vai para o registo, com o estado e o que veio antes", async () => {
        const { container } = await montar();
        const [a] = videos(container);
        comecar(a);
        Object.defineProperty(a, "currentTime", { configurable: true, value: 4, writable: true });
        act(() => void a.dispatchEvent(new Event("timeupdate"))); // um fotograma
        act(() => void a.dispatchEvent(new Event("waiting")));
        act(() => void vi.advanceTimersByTime(1000)); // nada anda: paragem
        a.currentTime = 4.5;
        act(() => void a.dispatchEvent(new Event("timeupdate"))); // voltou
        act(() => void vi.advanceTimersByTime(3100));
        expect(beacons.length).toBeGreaterThan(0);
        const corpo = JSON.parse(await beacons[beacons.length - 1].text());
        expect(corpo.motivo).toBe("paragem");
        // (A espera dos 3 s até ao envio, sem fotogramas, também conta: é outra.)
        expect(corpo.paragens[0].ms).toBeGreaterThanOrEqual(700);
        expect(corpo.paragens[0].estado).toMatchObject({ take: 0, paused: false });
        expect(corpo.paragens[0].antes.map((x: { k: string }) => x.k)).toContain("waiting");
        // Nada que identifique alguém.
        expect(JSON.stringify(corpo)).not.toMatch(/Mozilla|jsdom|userAgent/);
      });

      it("ao sair da página vai sempre um resumo", async () => {
        await montar();
        act(() => void window.dispatchEvent(new Event("pagehide")));
        const corpo = JSON.parse(await beacons[beacons.length - 1].text());
        expect(corpo.motivo).toBe("saida");
        expect(corpo.paragens).toEqual([]);
      });
    });

    describe("a imagem presa (17/10, iPhone): o relógio anda, as imagens não", () => {
      let pendentes: Map<HTMLVideoElement, () => void>;
      beforeEach(() => {
        pendentes = new Map();
        Object.defineProperty(HTMLVideoElement.prototype, "requestVideoFrameCallback", {
          configurable: true,
          value: function (this: HTMLVideoElement, cb: () => void) {
            pendentes.set(this, cb);
            return 1;
          },
        });
      });
      afterEach(() => {
        Reflect.deleteProperty(HTMLVideoElement.prototype, "requestVideoFrameCallback");
      });
      /** O browser pintou um fotograma deste vídeo. */
      const pintar = (el: HTMLVideoElement) => {
        const cb = pendentes.get(el);
        pendentes.delete(el);
        act(() => cb?.());
      };
      /** O take à vista a andar, com os saltos espiados. */
      async function aAndar() {
        const r = await montar();
        const [a, b] = videos(r.container);
        comecar(a);
        let t = 4;
        const saltos: number[] = [];
        Object.defineProperty(a, "currentTime", {
          configurable: true,
          get: () => t,
          set: (v: number) => {
            saltos.push(v);
            t = v;
          },
        });
        pintar(a);
        return { a, b, saltos };
      }

      it("sem imagens novas há 0,6 s, com o vídeo à vista a andar: um salto ligeiro para a frente", async () => {
        const { a, saltos } = await aAndar();
        act(() => void vi.advanceTimersByTime(550));
        expect(saltos).toEqual([]); // ainda dentro do normal
        act(() => void vi.advanceTimersByTime(300));
        // Para a frente, e não para o mesmo instante: no WebKit esse pode não
        // fazer nada (o registo de 17/10).
        expect(saltos).toHaveLength(1);
        expect(saltos[0]).toBeCloseTo(4.08, 5);
        expect(a.style.opacity).toBe("1");
      });

      it("se as imagens voltam, não faz mais nada", async () => {
        const { a, saltos } = await aAndar();
        for (let k = 0; k < 10; k++) {
          act(() => void vi.advanceTimersByTime(300));
          pintar(a);
        }
        expect(saltos).toEqual([]);
      });

      it("continua presa ~0,6 s depois: passa ao seguinte, se estiver pronto", async () => {
        const { b } = await aAndar();
        act(() => void b.dispatchEvent(new Event("canplaythrough")));
        act(() => void vi.advanceTimersByTime(1600));
        act(() => void b.dispatchEvent(new Event("playing")));
        expect(b.style.opacity).toBe("1");
      });

      it("pausado (de propósito, ou fora do ecrã) não conta como imagem presa", async () => {
        const { a, saltos } = await aAndar();
        Object.defineProperty(a, "paused", { configurable: true, value: true });
        act(() => vista?.([{ isIntersecting: false }]));
        act(() => void vi.advanceTimersByTime(3000));
        expect(saltos).toEqual([]);
      });
    });

    it("fora do ecrã não insiste: o vídeo fica parado de propósito", async () => {
      const { container } = await montar();
      const [a] = videos(container);
      comecar(a);
      act(() => vista?.([{ isIntersecting: false }]));
      Object.defineProperty(a, "paused", { configurable: true, value: true });
      play.mockClear();
      act(() => void vi.advanceTimersByTime(5000));
      expect(play).not.toHaveBeenCalled();
    });

    it("ao regressar à página pelo «voltar», retoma", async () => {
      const { container } = await montar();
      comecar(videos(container)[0]);
      play.mockClear();
      act(() => void window.dispatchEvent(new Event("pageshow")));
      expect(play).toHaveBeenCalled();
    });
  });
});
