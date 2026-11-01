// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { getDictionary, pickChromeDict } from "@/lib/i18n";

/**
 * Ela, no iPhone: ao trocar de idioma, o botão do WhatsApp «desaparece ~1 s».
 * A troca monta de novo o cromado (o layout de topo muda com o idioma), e o
 * botão esperava outra vez 1,5 s para entrar. Na segunda montagem da mesma
 * visita tem de nascer já à vista; numa visita nova, a entrada é a de sempre.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/sobre" }));
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

async function montar() {
  // Os dois do mesmo registo de módulos: o contexto do idioma tem de ser o
  // mesmo objecto no botão e no fornecedor.
  const { default: WhatsAppButton } = await import("./WhatsAppButton");
  const { LocaleProvider } = await import("./LocaleProvider");
  return () =>
    render(
      <LocaleProvider locale="pt" dict={pickChromeDict(t)}>
        <WhatsAppButton />
      </LocaleProvider>,
    );
}

const pilula = (c: HTMLElement) => c.querySelector<HTMLAnchorElement>("a.whatsapp-fixed");

describe("o botão do WhatsApp na troca de idioma", () => {
  it("numa visita nova espera pela sua entrada", async () => {
    const desenhar = await montar();
    const { container } = desenhar();
    expect(pilula(container)).toBeNull();
    await act(async () => void vi.advanceTimersByTime(300)); // o instante livre
    await act(async () => void vi.advanceTimersByTime(1600)); // a entrada
    expect(pilula(container)?.className).toContain("opacity-100");
  });

  it("depois de ter aparecido, uma nova montagem nasce já à vista", async () => {
    const desenhar = await montar();
    const primeira = desenhar();
    await act(async () => void vi.advanceTimersByTime(300));
    await act(async () => void vi.advanceTimersByTime(1600));
    expect(pilula(primeira.container)?.className).toContain("opacity-100");
    primeira.unmount();

    // A troca de idioma: o cromado monta outra vez, na mesma visita.
    const segunda = desenhar();
    expect(pilula(segunda.container)?.className).toContain("opacity-100");
  });
});
