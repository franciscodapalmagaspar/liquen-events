// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { INTERVALO_MS } from "@/lib/galeria-do-servico";

/**
 * A grelha «Momentos que criámos» que vai trocando, e a lupa (1/11). Ela:
 * «temos que alternar as fotos aqui» → «irem trocando sozinhas»; e «quero que
 * as pessoas, se quiserem ver essas fotos, consigam carregar» → «tocar abre em
 * grande».
 */

// Os observadores, à mão: o teste decide quando a grelha está no ecrã.
let observados: { cb: IntersectionObserverCallback; el: Element[] }[] = [];
class IO {
  private regista: { cb: IntersectionObserverCallback; el: Element[] };
  constructor(cb: IntersectionObserverCallback) {
    this.regista = { cb, el: [] };
    observados.push(this.regista);
  }
  observe(el: Element) {
    this.regista.el.push(el);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
function grelhaAVista() {
  for (const o of observados) {
    act(() =>
      o.cb(
        o.el.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
        {} as IntersectionObserver,
      ),
    );
  }
}

const fotos = Array.from({ length: 8 }, (_, k) => ({
  src: `/imagens/foto-${k + 1}.jpg`,
  blur: "data:image/webp;base64,AAAA",
}));
const textos = {
  galeria: "Galeria",
  fechar: "Fechar",
  anterior: "Foto anterior",
  seguinte: "Foto seguinte",
  de: "de",
  indisponivel: "Foto indisponível",
};
const SPANS = ["a", "b", "c", "d", "e", "f"];

function comMovimentoReduzido(reduzido: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduzido && q.includes("reduce"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
}

async function montar() {
  // O `prefersReducedMotion` guarda a MediaQueryList no módulo: cada teste
  // carrega o componente de novo, com o `matchMedia` que escolheu.
  vi.resetModules();
  const { default: GaleriaDoServico } = await import("./GaleriaDoServico");
  return render(
    <GaleriaDoServico fotos={fotos} spans={SPANS} alt="Exemplo: Casamentos" textos={textos} />,
  );
}

beforeEach(() => {
  observados = [];
  vi.stubGlobal("IntersectionObserver", IO);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  // O jsdom não tem o `showModal` nem o `close` do `<dialog>`.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

const nomesNaGrelha = () =>
  screen
    .getAllByRole("button")
    .filter((b) => b.closest("dialog") === null)
    .map((b) => b.querySelector("img")?.getAttribute("alt"));

describe("a grelha vai trocando", () => {
  it("abre com as seis primeiras, e com a grelha no ecrã troca UMA depois de chegar", async () => {
    comMovimentoReduzido(false);
    vi.useFakeTimers();
    const { container } = await montar();
    expect(nomesNaGrelha()).toEqual([1, 2, 3, 4, 5, 6].map((n) => `Exemplo: Casamentos ${n}`));

    grelhaAVista();
    act(() => void vi.advanceTimersByTime(INTERVALO_MS));
    // A nova está montada por cima, ainda invisível, à espera do `<img>`.
    const camada = container.querySelector("button div[aria-hidden='true'].transition-opacity");
    expect(camada).not.toBeNull();
    expect(camada!.className).toContain("opacity-0");

    act(() => void camada!.querySelector("img")!.dispatchEvent(new Event("load")));
    // Um fotograma (os relógios falsos também fingem o requestAnimationFrame).
    act(() => void vi.advanceTimersByTime(20));
    expect(camada!.className).toContain("opacity-100");

    // Esbatida, passa a ser ela a fotografia da posição — e a sétima entrou.
    act(() => void vi.advanceTimersByTime(800));
    expect(nomesNaGrelha()).toContain("Exemplo: Casamentos 7");
    expect(nomesNaGrelha()).toHaveLength(6);
  });

  it("fora do ecrã não troca nada", async () => {
    comMovimentoReduzido(false);
    vi.useFakeTimers();
    const { container } = await montar();
    act(() => void vi.advanceTimersByTime(INTERVALO_MS * 3));
    expect(container.querySelector("button div.transition-opacity")).toBeNull();
  });

  it("com «reduzir movimento» fica parada", async () => {
    comMovimentoReduzido(true);
    vi.useFakeTimers();
    const { container } = await montar();
    grelhaAVista();
    act(() => void vi.advanceTimersByTime(INTERVALO_MS * 3));
    expect(container.querySelector("button div.transition-opacity")).toBeNull();
  });
});

describe("tocar abre em grande", () => {
  it("abre a lupa na fotografia tocada, prende a página e fecha com o botão", async () => {
    comMovimentoReduzido(false);
    await montar();
    const terceira = screen.getAllByRole("button")[2];
    fireEvent.click(terceira);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });

    const dialogo = document.querySelector("dialog")!;
    expect(dialogo.hasAttribute("open")).toBe(true);
    expect(dialogo.getAttribute("aria-modal")).toBe("true");
    expect(dialogo).toHaveAccessibleName("Galeria");
    expect(document.body.style.overflow).toBe("hidden");
    // As oito, pela ordem da grelha e depois as de fora.
    expect(dialogo.textContent).toContain("3 de 8");

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(dialogo.hasAttribute("open")).toBe(false);
    // Fechada, deixa de contar como camada (o scroll suave volta) e solta a página.
    expect(dialogo.hasAttribute("aria-modal")).toBe(false);
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(terceira);
  });

  it("as setas do teclado passam à fotografia seguinte e à anterior", async () => {
    comMovimentoReduzido(false);
    await montar();
    fireEvent.click(screen.getAllByRole("button")[0]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    const dialogo = document.querySelector("dialog")!;
    fireEvent.keyDown(dialogo, { key: "ArrowRight" });
    fireEvent.keyDown(dialogo, { key: "ArrowLeft" });
    expect(Element.prototype.scrollTo).toHaveBeenCalledTimes(2);
  });

  it("enquanto a lupa está aberta, a grelha não troca", async () => {
    comMovimentoReduzido(false);
    vi.useFakeTimers();
    const { container } = await montar();
    grelhaAVista();
    fireEvent.click(screen.getAllByRole("button")[1]);
    act(() => void vi.advanceTimersByTime(INTERVALO_MS * 3));
    expect(container.querySelector("button div.transition-opacity")).toBeNull();
  });
});
