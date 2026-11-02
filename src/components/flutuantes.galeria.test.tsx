// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { getDictionary, pickChromeDict } from "@/lib/i18n";
import { esconderNaGaleria } from "@/lib/flutuantes";

/**
 * Ela (2/11): «quando se está a ver a galeria não é muito bom estar a aparecer
 * isso» — o WhatsApp e o «Pedir proposta» flutuantes. Na galeria (e nas suas
 * colecções, nas duas línguas) nenhum dos dois nasce; no resto do sítio ficam.
 */

let caminho = "/galeria";
vi.mock("next/navigation", () => ({ usePathname: () => caminho }));
const t = await getDictionary("pt");

beforeEach(() => {
  vi.resetModules();
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
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function montar(c: string) {
  caminho = c;
  const { default: WhatsAppButton } = await import("./WhatsAppButton");
  const { default: StickyCTA } = await import("./StickyCTA");
  const { LocaleProvider } = await import("./LocaleProvider");
  const r = render(
    <LocaleProvider locale="pt" dict={pickChromeDict(t)}>
      <div data-testid="whatsapp">
        <WhatsAppButton />
      </div>
      <div data-testid="cta">
        <StickyCTA />
      </div>
    </LocaleProvider>,
  );
  // O instante livre em que os dois montam, e a entrada da pílula.
  await act(async () => void vi.advanceTimersByTime(300));
  await act(async () => void vi.advanceTimersByTime(1600));
  return r;
}

describe("esconderNaGaleria", () => {
  it("apanha a galeria e as colecções, e só elas", () => {
    expect(esconderNaGaleria("/galeria")).toBe(true);
    expect(esconderNaGaleria("/galeria/casamentos")).toBe(true);
    expect(esconderNaGaleria("/")).toBe(false);
    expect(esconderNaGaleria("/sobre")).toBe(false);
    expect(esconderNaGaleria("/galerias-antigas")).toBe(false);
  });
});

describe("os botões flutuantes", () => {
  for (const c of ["/galeria", "/en/galeria", "/galeria/casamentos"]) {
    it(`não aparecem em ${c}`, async () => {
      const { getByTestId } = await montar(c);
      expect(getByTestId("whatsapp").innerHTML).toBe("");
      expect(getByTestId("cta").innerHTML).toBe("");
    });
  }

  it("continuam no resto do sítio", async () => {
    const { getByTestId } = await montar("/sobre");
    expect(getByTestId("whatsapp").querySelector("a.whatsapp-fixed")).not.toBeNull();
    expect(getByTestId("cta").innerHTML).not.toBe("");
  });
});
