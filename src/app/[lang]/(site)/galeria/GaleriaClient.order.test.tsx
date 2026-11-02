// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import GaleriaClient from "./GaleriaClient";
import { PHOTOS } from "./photos-data";
import { interleaveByCollection } from "./interleave";
import { pt } from "@/lib/i18n/pt";

/**
 * A ORDEM QUE O SERVIDOR MANDA É A ORDEM QUE FICA.
 *
 * A galeria sorteava a semente da arrumação NO CLIENTE e re-baralhava depois da
 * hidratação. Medido, instrumentando o `src` de cada mosaico por rAF: 12 trocas
 * de fotografia, todas ao mesmo instante (t=1178 ms), incluindo o mosaico 2x2;
 * 11 dos 22 pedidos de imagem (398,9 KB, 57,8% de todos os bytes de imagem da
 * aterragem) correspondiam a fotos que já não estavam na página. Em 3G, fotos
 * nítidas aos 5 s: 0-2 com o re-baralhar, 9 sem ele.
 *
 * A semente passou a vir do servidor (galeria/page.tsx). Estes testes fixam as
 * duas metades da promessa: o cliente respeita a semente que recebe, e não
 * troca nada depois de montar.
 */

const photos = PHOTOS.slice(0, 60).map((p) => ({ ...p, aspectRatio: "3/2" }));
const SEED = ":abc123";

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  vi.stubGlobal("requestIdleCallback", (cb: IdleRequestCallback) => {
    cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
    return 1;
  });
  vi.stubGlobal("cancelIdleCallback", () => {});
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A ordem visível, pela ordem de índice do pool (não a do DOM). */
function order(): string[] {
  const seen = new Map<number, string>();
  for (const el of document.querySelectorAll<HTMLElement>("[data-tile-idx]")) {
    const idx = Number(el.dataset.tileIdx);
    const img = el.querySelector("img");
    const src = img?.getAttribute("src") ?? "";
    if (src && !seen.has(idx)) seen.set(idx, src);
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, src]) => src);
}

describe("ordem da galeria", () => {
  it("usa a semente que o servidor manda, não uma sorteada aqui", () => {
    render(<GaleriaClient photos={photos} dict={pt.galeria} orderSeed={SEED} />);
    const esperado = interleaveByCollection(photos, SEED);
    const primeiro = document.querySelector<HTMLElement>('[data-tile-idx="0"] img');
    expect(primeiro).not.toBeNull();
    // O src é o do ficheiro pré-gerado: /_img/g/<chave>-<w>.webp.
    const chave = esperado[0].src
      .split("/")
      .pop()!
      .replace(/\.[^.]+$/, "");
    expect(primeiro!.getAttribute("src")).toContain(`/_img/g/${chave}-`);
  });

  it("sementes diferentes dão arrumações diferentes", () => {
    const a = interleaveByCollection(photos, ":um").map((p) => p.src);
    const b = interleaveByCollection(photos, ":outro").map((p) => p.src);
    expect(a).not.toEqual(b);
    expect(new Set(a)).toEqual(new Set(b)); // as mesmas fotos, outra ordem
  });

  it("NÃO troca fotos depois de montar (nem em idle, nem passado tempo)", () => {
    vi.useFakeTimers();
    try {
      render(<GaleriaClient photos={photos} dict={pt.galeria} orderSeed={SEED} />);
      const antes = order();
      expect(antes.length).toBeGreaterThan(0);
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(order()).toEqual(antes);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cada foto espera sobre a sua cor, sem mancha desfocada, e esbate ao chegar", () => {
    // Ela (2/11), no telemóvel: «está assim desfocado e depois a forma como
    // aparecem… está muito feia». O desfocado (10×12 px esticado ao mosaico)
    // saiu da grelha: o lugar-reservado é a COR MÉDIA da própria foto, no
    // fundo do mosaico, e a foto entra por cima com `g-foto` — todas, e não
    // só as que traziam desfocado (da 49.ª em diante apareciam de repente).
    const comCor = photos.map((p) => ({ ...p, color: "#6b5a4a" }));
    render(<GaleriaClient photos={comCor} dict={pt.galeria} orderSeed={SEED} />);
    const molduras = [...document.querySelectorAll<HTMLElement>("[data-tile-idx] picture")];
    expect(molduras.length).toBeGreaterThan(0);
    for (const moldura of molduras) {
      const img = moldura.querySelector("img")!;
      const src = img.getAttribute("src") ?? "";
      expect(moldura.style.backgroundImage, src).toBe("");
      expect(img.classList.contains("g-foto"), src).toBe(true);
      const tile = moldura.closest<HTMLElement>("[style*='background-color']");
      expect(tile?.style.backgroundColor, src).toBe("rgb(107, 90, 74)");
    }
  });
});
